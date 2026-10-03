import { getFFmpeg, terminateFFmpeg, toBytes, writeInputFile, isFFmpegLoaded } from '../ffmpeg/loader'
import { replaceExtension, suffixFilename } from '../format'
import { assertNotCancelled } from '../validation'
import { attachFfmpegProgress } from './video'
import type { CancelSignal, CompressionLevel, ProcessedResult, ProgressCallback } from '../types'
import { ProcessingError } from '../types'
import type { FFmpeg } from '@ffmpeg/ffmpeg'

export interface AudioOptions {
  level?: CompressionLevel
  bitrate?: string
  outputFormat?: 'mp3' | 'wav'
}

/**
 * Transcode or re-encode audio through FFmpeg.
 *
 * Terminology note that the UI mirrors: WAV is uncompressed PCM, so "compressing
 * a WAV" means re-encoding it to a smaller *lossy* format. WAV output is a decode
 * and will always be larger than the MP3 it came from.
 */
export async function processAudio(
  file: File,
  options: AudioOptions = {},
  onProgress?: ProgressCallback,
  signal?: CancelSignal
): Promise<ProcessedResult> {
  assertNotCancelled(signal)
  onProgress?.(1, 'Loading the audio engine (first run downloads ~30 MB)…')

  let ffmpeg: FFmpeg
  try {
    ffmpeg = await getFFmpeg()
  } catch (e) {
    throw e instanceof ProcessingError
      ? e
      : new ProcessingError('The audio engine could not start in this browser.')
  }

  assertNotCancelled(signal)

  const outFmt = options.outputFormat ?? 'mp3'
  const level = options.level ?? 'recommended'
  const bitrate = options.bitrate ?? (level === 'maximum' ? '96k' : '160k')

  const stamp = Date.now().toString(36)
  const inputName = `ain_${stamp}${extOf(file.name)}`
  const outputName = `aout_${stamp}.${outFmt}`

  onProgress?.(6, outFmt === 'mp3' ? 'Re-encoding audio…' : 'Converting to WAV…')

  let cancelledHere = false
  const cancelPoll = signal
    ? setInterval(() => {
        if (signal.cancelled && !cancelledHere) {
          cancelledHere = true
          void terminateFFmpeg()
        }
      }, 300)
    : null

  let detach: (() => void) | null = null

  try {
    await writeInputFile(ffmpeg, inputName, file)
    assertNotCancelled(signal)

    const args =
      outFmt === 'mp3'
        ? [
            '-i', inputName,
            '-vn',
            '-map', '0:a:0',
            '-c:a', 'libmp3lame',
            '-b:a', bitrate,
            outputName,
          ]
        : ['-i', inputName, '-vn', '-map', '0:a:0', '-c:a', 'pcm_s16le', outputName]

    detach = attachFfmpegProgress(ffmpeg, (pct) => {
      if (signal?.cancelled) return
      onProgress?.(10 + pct * 0.85, outFmt === 'mp3' ? 'Re-encoding audio…' : 'Converting to WAV…')
    })

    await ffmpeg.exec(args)
    assertNotCancelled(signal)

    onProgress?.(96, 'Finishing…')
    const bytes = toBytes(await ffmpeg.readFile(outputName))

    const mime = outFmt === 'mp3' ? 'audio/mpeg' : 'audio/wav'
    // Only claim "compressed" when we actually produced a lossy encode of a
    // same-format source; otherwise the honest verb is "converted".
    const filename =
      outFmt === 'mp3' && file.name.toLowerCase().endsWith('.mp3')
        ? suffixFilename(file.name, '-compressed')
        : replaceExtension(file.name, outFmt)

    onProgress?.(100, 'Done')
    return { blob: new Blob([bytes], { type: mime }), filename, mimeType: mime }
  } catch (e) {
    if (signal?.cancelled || cancelledHere) {
      throw new ProcessingError('Processing was cancelled.', 'cancelled')
    }
    if (e instanceof ProcessingError) throw e
    throw new ProcessingError(
      'This audio file could not be processed. It may be corrupted, or use a codec this browser engine cannot decode.'
    )
  } finally {
    if (detach) detach()
    if (cancelPoll) clearInterval(cancelPoll)
    if (!cancelledHere && isFFmpegLoaded()) {
      try {
        await ffmpeg.deleteFile(inputName)
      } catch {
        /* entry may not exist */
      }
      try {
        await ffmpeg.deleteFile(outputName)
      } catch {
        /* entry may not exist */
      }
    }
  }
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  const ext = i >= 0 ? name.slice(i).toLowerCase() : ''
  return /^\.[a-z0-9]{2,5}$/.test(ext) ? ext : '.bin'
}