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
  const started = performance.now()
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
  const stage = outFmt === 'wav' ? 'Converting to WAV…' : inputFormat === 'mp3' ? 'Compressing MP3…' : inputFormat === 'wav' ? 'Converting WAV to MP3…' : 'Converting audio to MP3…'
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
    // MP3's low-sample-rate profiles cannot represent every exposed bitrate.
    // LAME otherwise silently clamps e.g. 22.05 kHz + 320 kbps to 160 kbps.
    // Raise only the minimum rate needed for the selected CBR bitrate, and
    // verify the actual output below rather than reporting the request as fact.
    const sourceRate = sourceAudio[0].sample_rate
    const requestedKbps = Number(bitrate.replace('k', ''))
    const minimumRate = requestedKbps > 160 ? 32000 : 16000
    const sampleRateArgs = outFmt === 'mp3' && sourceRate && sourceRate < minimumRate ? ['-ar', String(minimumRate)] : []
    onProgress?.(10, stage)

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
            ...sampleRateArgs,
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
        stage,
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
    const actualKbps = outputAudio[0].bit_rate ? Math.round(outputAudio[0].bit_rate / 1000) : undefined
    if (outFmt === 'mp3' && actualKbps !== requestedKbps) throw new ProcessingError('The encoder could not verify the selected MP3 bitrate. Your original file is unchanged. Try another bitrate.')
    verifyMediaDuration(source, output)
    const outputRate = outputAudio[0].sample_rate
    const rateNote = outFmt === 'mp3' && sourceRate && outputRate && sourceRate !== outputRate ? ` Sample rate changed from ${sourceRate.toLocaleString('en-US')} Hz to ${outputRate.toLocaleString('en-US')} Hz for MP3 compatibility. Resampling does not restore missing detail.` : ''
    // Only claim "compressed" when we actually produced a lossy encode of a
    // same-format source; otherwise the honest verb is "converted".
    const filename =
      outFmt === 'mp3' && inputFormat === 'mp3'
        ? replaceExtension(suffixFilename(file.name, '-compressed'), 'mp3')
        : replaceExtension(file.name, outFmt)

    onProgress?.(100, 'Done')
    const result = applyResultPolicy(file, {
      blob, filename, mimeType: mime,
      note: outFmt === 'mp3' ? `Encoded as MP3 at ${actualKbps} kbps. MP3 encoding is lossy.${rateNote}` : 'Converted to 16-bit PCM WAV. WAV output can be larger than compressed audio.',
    }, outFmt === 'mp3' && inputFormat === 'mp3' ? 'reduce' : 'convert')
    return { ...result, durationMs: Math.round(performance.now() - started) }
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
