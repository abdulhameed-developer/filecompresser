import {
  getFFmpeg,
  terminateFFmpeg,
  toBytes,
  writeInputFile,
  isFFmpegLoaded,
} from '../ffmpeg/loader'
import { replaceExtension, suffixFilename, uid } from '../format'
import { assertNotCancelled } from '../validation'
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
import { displayDimensions, inspectMedia, verifyMediaDuration } from './media-inspection'

export interface VideoOptions {
  level?: CompressionLevel
  resolution?: 'original' | '1080' | '720' | '480'
  outputFormat?: 'mp4'
}

/**
 * Subscribe to FFmpeg's progress stream.
 *
 * FFmpeg emits 0..1 against the output duration, which is exactly what a user
 * expects to see. Returns a detach function — callers must invoke it so a
 * finished job stops writing into a dead component.
 */
export function attachFfmpegProgress(
  ffmpeg: FFmpeg,
  onPercent: (pct: number) => void,
): () => void {
  let highest = 0
  const handler = ({ progress }: { progress: number }) => {
    // FFmpeg reports 0..1 against the *output* duration. Guard NaN and clamp.
    if (typeof progress !== 'number' || !Number.isFinite(progress)) return
    highest = Math.max(highest, Math.max(0, Math.min(100, Math.round(progress * 100))))
    onPercent(highest)
  }
  ffmpeg.on('progress', handler)
  return () => {
    ffmpeg.off('progress', handler)
  }
}

interface RunSpec {
  input: File
  inputName: string
  outputName: string
  level: CompressionLevel
  resolution: VideoOptions['resolution']
  inputFormat: 'mp4' | 'mov'
  /** Text shown in the UI while this pass runs. */
  stage: string
  /** Fraction of the 5–95% budget this pass occupies, e.g. video vs audio pass. */
  weight?: number
  outputMime: string
  outputExtension: string
  outputFilename: string
}

async function runFfmpeg(
  ffmpeg: FFmpeg,
  spec: RunSpec,
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<ProcessedResult> {
  assertNotCancelled(signal)

  // Reserve 0–5% for loading, 95–100% for handing the result back.
  const start = 9
  const end = 95
  const span = end - start
  const weight = spec.weight ?? 1

  onProgress?.(5, 'Inspecting video streams and dimensions…')

  // We own the instance for the duration of this run, so a cancel can terminate it.
  let cancelledHere = false
  const releaseCancel = listenForCancellation(signal, () => {
    if (!cancelledHere) {
      cancelledHere = true
      void terminateFFmpeg()
    }
  })

  let detach: (() => void) | null = null

  try {
    await writeInputFile(ffmpeg, spec.inputName, spec.input)

    assertNotCancelled(signal)
    const source = await inspectMedia(ffmpeg, spec.inputName, signal)
    const sourceVideo = source.streams.find(stream => stream.codec_type === 'video' && !stream.attachedPicture)
    if (!sourceVideo) throw new ProcessingError('This file has no supported video stream.')
    const dimensions = displayDimensions(sourceVideo)
    if (dimensions.width * dimensions.height > 32_000_000) throw new ProcessingError('This video exceeds the 32 megapixel frame limit.')
    if (dimensions.width < 2 || dimensions.height < 2) throw new ProcessingError('This video is too small for the browser MP4 encoder. Keep the original file.')
    if ((!spec.resolution || spec.resolution === 'original') && (dimensions.width % 2 || dimensions.height % 2)) {
      throw new ProcessingError(`This video is ${dimensions.width} × ${dimensions.height}. The compatible H.264 MP4 encoder requires even dimensions. Choose an explicit Max resolution to resize, or keep your original file.`, 'video-dimensions')
    }
    onProgress?.(start, spec.stage)

    detach = attachFfmpegProgress(ffmpeg, (pct) => {
      if (signal?.cancelled) return
      onProgress?.(start + (pct / 100) * span * weight, spec.stage)
    })

    const args = buildEncodeArgs(spec.inputName, spec.outputName, spec.level, spec.resolution, dimensions, sourceVideo.index)
    if ((await ffmpeg.exec(args, 300_000)) !== 0)
      throw new ProcessingError(
        'Video encoding failed or exceeded the five-minute processing limit.',
      )
    assertNotCancelled(signal)
    detach()
    detach = null

    onProgress?.(end, 'Finishing…')
    const data = await ffmpeg.readFile(spec.outputName)
    const bytes = toBytes(data)
    if (
      bytes.length < 12 ||
      String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp'
    )
      throw new ProcessingError('The video encoder returned an invalid MP4.')

    const candidate: ProcessedResult = {
      blob: new Blob([bytes], { type: spec.outputMime }),
      filename: spec.outputFilename,
      mimeType: spec.outputMime,
    }
    const output = await inspectMedia(ffmpeg, spec.outputName, signal)
    const video = output.streams.find(stream => stream.codec_type === 'video' && !stream.attachedPicture)
    if (!video || video.codec_name !== 'h264') throw new ProcessingError('The video output failed its H.264 stream check. The original file is unchanged.')
    const outputDimensions = displayDimensions(video)
    const resized = dimensions.width !== outputDimensions.width || dimensions.height !== outputDimensions.height
    if ((!spec.resolution || spec.resolution === 'original') && resized) throw new ProcessingError('The encoder changed the video dimensions unexpectedly. The original file is unchanged.')
    const expected = resizedDimensions(dimensions, spec.resolution)
    if (expected.width !== outputDimensions.width || expected.height !== outputDimensions.height) throw new ProcessingError('The output dimensions did not match the requested resolution. The original file is unchanged.')
    const beforeAudio = source.streams.filter(stream => stream.codec_type === 'audio')
    const afterAudio = output.streams.filter(stream => stream.codec_type === 'audio')
    if (beforeAudio.length !== afterAudio.length || afterAudio.some((stream, index) => stream.codec_name !== 'aac' || (beforeAudio[index].channels && beforeAudio[index].channels !== stream.channels))) throw new ProcessingError('The output audio streams did not match the original video. The original file is unchanged.')
    verifyMediaDuration(source, output)
    candidate.note = resized
      ? 'Resized to your selected resolution and encoded as H.264/AAC MP4. Dimensions are rounded down to even pixels for compatible playback.'
      : spec.inputFormat === 'mov' ? 'Converted MOV to H.264/AAC MP4 while preserving display dimensions.' : 'Encoded as H.264/AAC MP4 while preserving display dimensions.'
    onProgress?.(100, 'Done')
    return applyResultPolicy(spec.input, candidate, resized ? 'resize' : spec.inputFormat === 'mov' ? 'convert' : 'reduce')
  } catch (e) {
    if (signal?.cancelled || cancelledHere) {
      throw new ProcessingError('Processing was cancelled.', 'cancelled')
    }
    if (e instanceof ProcessingError) throw e
    throw new ProcessingError(
      'This video could not be processed. It may be corrupted, or use a codec this browser engine cannot decode.',
    )
  } finally {
    if (detach) detach()
    releaseCancel()
    // Best-effort cleanup of the virtual FS so a long session does not grow.
    if (!cancelledHere && isFFmpegLoaded()) {
      try {
        await ffmpeg.deleteFile(spec.inputName)
      } catch {
        /* entry may not exist */
      }
      try {
        await ffmpeg.deleteFile(spec.outputName)
      } catch {
        /* entry may not exist */
      }
    }
  }
}

/**
 * H.264 + AAC in an MP4 container with `+faststart` so the result is seekable
 * on the web. `yuv420p` keeps it playable on iOS and Android browsers.
 */
export function buildEncodeArgs(
  inputName: string,
  outputName: string,
  level: CompressionLevel,
  resolution: VideoOptions['resolution'],
  dimensions?: { width: number; height: number },
  videoIndex?: number,
): string[] {
  const crf = level === 'maximum' ? '32' : '28'
  const preset = level === 'maximum' ? 'veryfast' : 'faster'
  const audioBitrate = level === 'maximum' ? '96k' : '128k'
  const scale = scaleFilter(resolution, dimensions)

  const args = [
    '-i',
    inputName,
    // Skip cover art / non-video attachments some MOVs carry.
    '-map',
    videoIndex === undefined ? '0:v:0' : `0:${videoIndex}`,
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    crf,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    audioBitrate,
    '-movflags',
    '+faststart',
  ]

  if (scale) args.push('-vf', scale)

  args.push(outputName)
  return args
}

/** `scale=-2:min(H,ih)` keeps the aspect ratio and never upscales. */
function scaleFilter(resolution: VideoOptions['resolution'], dimensions?: { width: number; height: number }): string | null {
  if (!resolution || resolution === 'original') return null
  if (!dimensions) throw new ProcessingError('The original dimensions are required before resizing video.')
  const output = resizedDimensions(dimensions, resolution)
  return `scale=${output.width}:${output.height}`
}

export function resizedDimensions(dimensions: { width: number; height: number }, resolution: VideoOptions['resolution']): { width: number; height: number } {
  if (!resolution || resolution === 'original') return dimensions
  const maxHeight = resolution === '1080' ? 1080 : resolution === '480' ? 480 : 720
  const factor = Math.min(1, maxHeight / dimensions.height)
  const width = Math.floor(dimensions.width * factor / 2) * 2
  const height = Math.floor(dimensions.height * factor / 2) * 2
  if (width < 2 || height < 2) throw new ProcessingError('The selected resolution would make this video too narrow or short for a compatible MP4. Choose a higher resolution or keep the original.')
  return { width, height }
}

export async function compressVideo(
  file: File,
  options: VideoOptions = {},
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<ProcessedResult> {
  assertNotCancelled(signal)
  if (file.size > 200 * 1024 * 1024) throw new ProcessingError('This video exceeds the 200 MB input limit.')
  const inputFormat = await detectFormat(file)
  if (inputFormat !== 'mp4' && inputFormat !== 'mov') throw new ProcessingError('Choose a verified MP4 or MOV video file.')

  onProgress?.(1, 'Loading the video engine…')

  let ffmpeg: FFmpeg
  try {
    ffmpeg = await getFFmpeg()
  } catch (e) {
    throw e instanceof ProcessingError
      ? e
      : new ProcessingError('The video engine could not start in this browser.')
  }

  assertNotCancelled(signal)

  const stamp = uid()
  const inputName = `in_${stamp}${guessExt(file.name)}`
  const outputName = `out_${stamp}.mp4`
  const level = options.level ?? 'recommended'

  return runFfmpeg(
    ffmpeg,
    {
      input: file,
      inputName,
      outputName,
      level,
      resolution: options.resolution,
      inputFormat,
      stage: 'Compressing video…',
      outputMime: 'video/mp4',
      outputExtension: 'mp4',
      outputFilename: replaceExtension(
        suffixFilename(file.name, '-compressed'),
        'mp4',
      ),
    },
    onProgress,
    signal,
  )
}

function guessExt(name: string): string {
  const i = name.lastIndexOf('.')
  const ext = i >= 0 ? name.slice(i).toLowerCase() : ''
  const safe = /^\.[a-z0-9]{2,5}$/.test(ext) ? ext : ''
  return safe || '.mp4'
}
