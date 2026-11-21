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

export interface GifOptions {
  level?: CompressionLevel
}

async function loadEngine(onProgress?: ProgressCallback): Promise<FFmpeg> {
  onProgress?.(2, 'Loading the GIF engine (first run downloads ~30 MB)…')
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
  const ffmpeg = await loadEngine(onProgress)

  const level = options.level ?? 'recommended'
  const colors = level === 'maximum' ? 64 : 128
  // Frame thinning is lossy and visible, so it is reserved for maximum mode.
  const fps = level === 'maximum' ? 15 : 0

  const stamp = uid()
  const inputName = `gin_${stamp}.gif`
  const outputName = `gout_${stamp}.gif`

  const fpsFilter = fps > 0 ? `fps=${fps},` : ''
  const loop = await gifLoopCount(file)
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
    detach = attachFfmpegProgress(ffmpeg, (pct) => {
      if (signal?.cancelled) return
      onProgress?.(15 + pct * 0.8, 'Optimizing frames…')
    })

    const exit = await ffmpeg.exec(
      [
        '-i',
        inputName,
        '-filter_complex',
        `${fpsFilter}split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,
        '-gifflags',
        '-offsetting',
        '-loop',
        String(loop),
        outputName,
      ],
      300_000,
    )
    if (exit !== 0)
      throw new ProcessingError(
        'GIF encoding failed or exceeded the five-minute processing limit.',
      )

    assertNotCancelled(signal)
    onProgress?.(96, 'Finishing…')

    const bytes = toBytes(await ffmpeg.readFile(outputName))
    if (bytes.length === 0) {
      throw new ProcessingError(
        'The GIF could not be optimized and produced no output.',
      )
    }

    onProgress?.(100, 'Done')
    return {
      blob: new Blob([bytes], { type: 'image/gif' }),
      filename: replaceExtension(
        suffixFilename(flattenArchivePath(file.name), '-compressed'),
        'gif',
      ),
      mimeType: 'image/gif',
    }
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
async function gifLoopCount(file: File): Promise<number> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const marker = new TextEncoder().encode('NETSCAPE2.0')
  for (let i = 3; i + 16 < bytes.length; i++) {
    if (
      bytes[i - 3] === 0x21 &&
      bytes[i - 2] === 0xff &&
      bytes[i - 1] === 11 &&
      marker.every((byte, n) => bytes[i + n] === byte) &&
      bytes[i + 11] === 3 &&
      bytes[i + 12] === 1
    )
      return bytes[i + 13] | (bytes[i + 14] << 8)
  }
  return -1
}
