import {
  getFFmpeg,
  terminateFFmpeg,
  toBytes,
  writeInputFile,
  isFFmpegLoaded,
} from '../ffmpeg/loader'
import { replaceExtension, suffixFilename, uid } from '../format'
import { assertNotCancelled } from '../validation'
import { attachFfmpegProgress } from './video'
import type {
  CancelSignal,
  CompressionLevel,
  ProcessedResult,
  ProgressCallback,
} from '../types'
import { ProcessingError, listenForCancellation } from '../types'
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { detectFormat } from '../validation'
import { applyResultPolicy } from '../result-policy'
import { inspectMedia, verifyMediaDuration } from './media-inspection'

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
  signal?: CancelSignal,
): Promise<ProcessedResult> {
  assertNotCancelled(signal)
  if (file.size > 100 * 1024 * 1024) throw new ProcessingError('This audio file exceeds the 100 MB input limit.')
  const inputFormat = await detectFormat(file)
  if (!inputFormat || !['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(inputFormat)) throw new ProcessingError('Choose a verified MP3, WAV, M4A, FLAC or Ogg audio file.')
  onProgress?.(1, 'Loading the audio engine…')

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
  const bitrate = options.bitrate ?? (level === 'maximum' ? '96k' : '192k')
  if (!['96k', '128k', '160k', '192k', '256k', '320k'].includes(bitrate))
    throw new ProcessingError('Choose a supported audio bitrate.')

  const stamp = uid()
  const inputName = `ain_${stamp}${extOf(file.name)}`
  const outputName = `aout_${stamp}.${outFmt}`

  onProgress?.(6, 'Inspecting audio streams…')

  let cancelledHere = false
  const releaseCancel = listenForCancellation(signal, () => {
    if (!cancelledHere) {
      cancelledHere = true
      void terminateFFmpeg()
    }
  })

  let detach: (() => void) | null = null

  try {
    await writeInputFile(ffmpeg, inputName, file)
    assertNotCancelled(signal)
    const source = await inspectMedia(ffmpeg, inputName, signal)
    const sourceAudio = source.streams.filter(stream => stream.codec_type === 'audio')
    if (sourceAudio.length !== 1) throw new ProcessingError('This tool needs exactly one audio stream. Your original file is unchanged.')
    onProgress?.(10, outFmt === 'mp3' ? 'Re-encoding audio…' : 'Converting to WAV…')

    const args =
      outFmt === 'mp3'
        ? [
            '-i',
            inputName,
            '-vn',
            '-map',
            '0:a:0',
            '-c:a',
            'libmp3lame',
            '-b:a',
            bitrate,
            outputName,
          ]
        : [
            '-i',
            inputName,
            '-vn',
            '-map',
            '0:a:0',
            '-c:a',
            'pcm_s16le',
            outputName,
          ]

    detach = attachFfmpegProgress(ffmpeg, (pct) => {
      if (signal?.cancelled) return
      onProgress?.(
        10 + pct * 0.85,
        outFmt === 'mp3' ? 'Re-encoding audio…' : 'Converting to WAV…',
      )
    })

    if ((await ffmpeg.exec(args, 300_000)) !== 0)
      throw new ProcessingError(
        'Audio encoding failed or exceeded the five-minute processing limit.',
      )
    assertNotCancelled(signal)
    detach()
    detach = null

    onProgress?.(96, 'Finishing…')
    const bytes = toBytes(await ffmpeg.readFile(outputName))
    if (bytes.length < 4)
      throw new ProcessingError('The audio encoder produced no usable output.')

    const mime = outFmt === 'mp3' ? 'audio/mpeg' : 'audio/wav'
    const blob = new Blob([bytes], { type: mime })
    if (await detectFormat(blob) !== outFmt) throw new ProcessingError('The audio encoder returned the wrong output format. The original file is unchanged.')
    const output = await inspectMedia(ffmpeg, outputName, signal)
    const outputAudio = output.streams.filter(stream => stream.codec_type === 'audio')
    if (outputAudio.length !== 1 || outputAudio[0].codec_name !== (outFmt === 'mp3' ? 'mp3' : 'pcm_s16le') || (sourceAudio[0].channels && sourceAudio[0].channels !== outputAudio[0].channels)) throw new ProcessingError('The audio output failed its stream integrity check. The original file is unchanged.')
    verifyMediaDuration(source, output)
    // Only claim "compressed" when we actually produced a lossy encode of a
    // same-format source; otherwise the honest verb is "converted".
    const filename =
      outFmt === 'mp3' && inputFormat === 'mp3'
        ? replaceExtension(suffixFilename(file.name, '-compressed'), 'mp3')
        : replaceExtension(file.name, outFmt)

    onProgress?.(100, 'Done')
    return applyResultPolicy(file, {
      blob, filename, mimeType: mime,
      note: outFmt === 'mp3' ? `Encoded as MP3 at ${bitrate.replace('k', '')} kbps. MP3 encoding is lossy.` : 'Converted to 16-bit PCM WAV. WAV output can be larger than compressed audio.',
    }, outFmt === 'mp3' && inputFormat === 'mp3' ? 'reduce' : 'convert')
  } catch (e) {
    if (signal?.cancelled || cancelledHere) {
      throw new ProcessingError('Processing was cancelled.', 'cancelled')
    }
    if (e instanceof ProcessingError) throw e
    throw new ProcessingError(
      'This audio file could not be processed. It may be corrupted, or use a codec this browser engine cannot decode.',
    )
  } finally {
    if (detach) detach()
    releaseCancel()
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
