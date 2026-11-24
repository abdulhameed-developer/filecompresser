import {
  getFFmpeg,
  terminateFFmpeg,
  toBytes,
  writeInputFile,
  isFFmpegLoaded,
} from '../ffmpeg/loader'
import { replaceExtension, suffixFilename, uid } from '../format'
import { assertNotCancelled, flattenArchivePath } from '../validation'
import { attachFfmpegProgress } from './video'
import type {
  CancelSignal,
  CompressionLevel,
  ProcessedResult,
  ProgressCallback,
} from '../types'
import { ProcessingError, listenForCancellation } from '../types'
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { inspectGif, inspectGifBytes } from './gif-inspection'
import { applyResultPolicy, unchangedResult } from '../result-policy'

export interface GifOptions {
  level?: CompressionLevel
}

async function loadEngine(onProgress?: ProgressCallback): Promise<FFmpeg> {
  onProgress?.(2, 'Loading the GIF engine…')
  try {
    return await getFFmpeg()
  } catch (e) {
    throw e instanceof ProcessingError
      ? e
      : new ProcessingError('The GIF engine could not start in this browser.')
  }
}

/**
 * Genuine GIF optimization: quantise each frame to an optimal palette and let
 * the LZW coder drop to BAYER-pattern transparency instead of an expanded
 * colour-index frame.
 *
 * This genuinely reduces byte count — the output is a re-encoded animation,
 * not a renamed copy.
 */
export async function compressGif(
  file: File,
  options: GifOptions = {},
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<ProcessedResult> {
  assertNotCancelled(signal)
  const started = performance.now()
  onProgress?.(0, 'Checking animation dimensions, frames and timing…')
  const source = await inspectGif(file, signal)
  if (source.frames > 1 && source.delays.some(delay => delay === 0)) {
    onProgress?.(100, 'Original retained')
    return unchangedResult(file, 'image/gif', 'This animation contains unspecified frame delays. Your original was retained so its playback timing is not changed (0% reduction).')
  }
  const ffmpeg = await loadEngine(onProgress)

  const level = options.level ?? 'recommended'
  const colors = level === 'maximum' ? 64 : 128
  // A fixed fps=15 filter also UPsamples slower animations. Preserve the input
  // timestamps in both modes; Maximum differs through its smaller palette.

  const stamp = uid()
  const inputName = `gin_${stamp}.gif`
  const outputName = `gout_${stamp}.gif`

  assertNotCancelled(signal)

  let cancelledHere = false
  const releaseCancel = listenForCancellation(signal, () => {
    if (!cancelledHere) {
      cancelledHere = true
      void terminateFFmpeg()
    }
  })

  let detach: (() => void) | null = null

  try {
    onProgress?.(11, 'Reading animation…')
    await writeInputFile(ffmpeg, inputName, file)
    assertNotCancelled(signal)

    // One libgif pass: palettegen is folded into the frame decode so the
    // animation is quantised exactly once instead of through an intermediate
    // palette file (which is what made the old two-pass version lossy twice).
    onProgress?.(15, 'Optimizing frames…')
    detach = attachFfmpegProgress(ffmpeg, (pct) => {
      if (signal?.cancelled) return
      onProgress?.(15 + pct * 0.8, 'Optimizing frames…')
    })

    const exit = await ffmpeg.exec(
      [
        '-min_delay',
        '0',
        '-i',
        inputName,
        '-filter_complex',
        `split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,
        '-fps_mode',
        'passthrough',
        '-gifflags',
        '-offsetting',
        '-loop',
        String(source.loopCount),
        '-final_delay',
        String(source.delays[source.delays.length - 1]),
        outputName,
      ],
      300_000,
    )
    if (exit !== 0)
      throw new ProcessingError(
        'GIF encoding failed or exceeded the five-minute processing limit.',
      )

    assertNotCancelled(signal)
    detach()
    detach = null
    onProgress?.(96, 'Finishing…')

    const bytes = toBytes(await ffmpeg.readFile(outputName))
    if (bytes.length === 0) {
      throw new ProcessingError(
        'The GIF could not be optimized and produced no output.',
      )
    }

    const candidate: ProcessedResult = {
      blob: new Blob([bytes], { type: 'image/gif' }),
      filename: replaceExtension(
        suffixFilename(flattenArchivePath(file.name), '-compressed'),
        'gif',
      ),
      mimeType: 'image/gif',
      note: 'Animation dimensions, frame delays and loop count preserved. Maximum mode uses a smaller color palette; other metadata may be removed.',
    }
    if (bytes.length < file.size) {
      const output = inspectGifBytes(bytes, signal)
      if (output.width !== source.width || output.height !== source.height || output.frames !== source.frames || output.loopCount !== source.loopCount || output.delays.some((delay, index) => delay !== source.delays[index]) || (source.hasTransparency && !output.hasTransparency)) {
        onProgress?.(100, 'Original retained')
        return unchangedResult(file, 'image/gif', 'The optimized candidate changed animation timing, dimensions or transparency. Your original was retained unchanged (0% reduction).')
      }
      candidate.inspection = {
        inputWidth: source.width, inputHeight: source.height, outputWidth: output.width, outputHeight: output.height,
        inputFormat: 'gif', outputFormat: 'gif', elapsedMs: performance.now() - started,
        encoder: `FFmpeg GIF palette (${colors} colors)`,
        metadataNote: 'Animation dimensions, frame delays and loop count retained; other metadata may be removed.',
        inputHasAlpha: source.hasTransparency, outputHasAlpha: output.hasTransparency,
      }
    }
    onProgress?.(100, 'Done')
    return applyResultPolicy(file, candidate)
  } catch (e) {
    if (signal?.cancelled || cancelledHere) {
      throw new ProcessingError('Processing was cancelled.', 'cancelled')
    }
    if (e instanceof ProcessingError) throw e
    throw new ProcessingError(
      'This GIF could not be optimized. It may be corrupted, or too large for this browser to process.',
    )
  } finally {
    if (detach) detach()
    releaseCancel()
    if (!cancelledHere && isFFmpegLoaded()) {
      for (const name of [inputName, outputName]) {
        try {
          await ffmpeg.deleteFile(name)
        } catch {
          /* entry may not exist */
        }
      }
    }
  }
}
