import { getFFmpeg, terminateFFmpeg, toBytes, writeInputFile, isFFmpegLoaded } from '../ffmpeg/loader'
import { replaceExtension, suffixFilename } from '../format'
import { assertNotCancelled } from '../validation'
import type { CancelSignal, CompressionLevel, ProcessedResult, ProgressCallback } from '../types'
import { ProcessingError } from '../types'
import type { FFmpeg } from '@ffmpeg/ffmpeg'

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
export function attachFfmpegProgress(ffmpeg: FFmpeg, onPercent: (pct: number) => void): () => void {
  const handler = ({ progress }: { progress: number }) => {
    // FFmpeg reports 0..1 against the *output* duration. Guard NaN and clamp.
    if (typeof progress !== 'number' || !Number.isFinite(progress)) return
    onPercent(Math.max(0, Math.min(100, Math.round(progress * 100))))
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
  args: string[]
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
  signal?: CancelSignal
): Promise<ProcessedResult> {
  assertNotCancelled(signal)

  // Reserve 0–5% for loading, 95–100% for handing the result back.
  const start = 5
  const end = 95
  const span = end - start
  const weight = spec.weight ?? 1

  onProgress?.(start, spec.stage)

  // We own the instance for the duration of this run, so a cancel can terminate it.
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
    await writeInputFile(ffmpeg, spec.inputName, spec.input)

    assertNotCancelled(signal)
    onProgress?.(start + span * 0.04, spec.stage)

    detach = attachFfmpegProgress(ffmpeg, (pct) => {
      if (signal?.cancelled) return
      onProgress?.(start + (pct / 100) * span * weight, spec.stage)
    })

    await ffmpeg.exec(spec.args)
    assertNotCancelled(signal)

    onProgress?.(end, 'Finishing…')
    const data = await ffmpeg.readFile(spec.outputName)
    const bytes = toBytes(data)

    onProgress?.(100, 'Done')
    return {
      blob: new Blob([bytes], { type: spec.outputMime }),
      filename: spec.outputFilename,
      mimeType: spec.outputMime,
    }
  } catch (e) {
    if (signal?.cancelled || cancelledHere) {
      throw new ProcessingError('Processing was cancelled.', 'cancelled')
    }
    if (e instanceof ProcessingError) throw e
    throw new ProcessingError(
      'This video could not be processed. It may be corrupted, or use a codec this browser engine cannot decode.'
    )
  } finally {
    if (detach) detach()
    if (cancelPoll) clearInterval(cancelPoll)
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
function buildEncodeArgs(inputName: string, outputName: string, level: CompressionLevel, resolution: VideoOptions['resolution']): string[] {
  const crf = level === 'maximum' ? '32' : '28'
  const preset = level === 'maximum' ? 'veryfast' : 'faster'
  const audioBitrate = level === 'maximum' ? '96k' : '128k'
  const scale = scaleFilter(resolution)

  const args = [
    '-i', inputName,
    // Skip cover art / non-video attachments some MOVs carry.
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', crf,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', audioBitrate,
    '-movflags', '+faststart',
  ]

  if (scale) args.push('-vf', scale)

  args.push(outputName)
  return args
}

/** `scale=-2:min(H,ih)` keeps the aspect ratio and never upscales. */
function scaleFilter(resolution: VideoOptions['resolution']): string | null {
  if (!resolution || resolution === 'original') return null
  const height = resolution === '1080' ? 1080 : resolution === '480' ? 480 : 720
  return `scale=-2:'min(${height},ih)'`
}

export async function compressVideo(
  file: File,
  options: VideoOptions = {},
  onProgress?: ProgressCallback,
  signal?: CancelSignal
): Promise<ProcessedResult> {
  assertNotCancelled(signal)

  onProgress?.(1, 'Loading the video engine (first run downloads ~30 MB)…')

  let ffmpeg: FFmpeg
  try {
    ffmpeg = await getFFmpeg()
  } catch (e) {
    throw e instanceof ProcessingError
      ? e
      : new ProcessingError('The video engine could not start in this browser.')
  }

  assertNotCancelled(signal)

  const stamp = Date.now().toString(36)
  const inputName = `in_${stamp}${guessExt(file.name)}`
  const outputName = `out_${stamp}.mp4`
  const level = options.level ?? 'recommended'

  return runFfmpeg(
    ffmpeg,
    {
      input: file,
      inputName,
      outputName,
      args: buildEncodeArgs(inputName, outputName, level, options.resolution),
      stage: 'Compressing video…',
      outputMime: 'video/mp4',
      outputExtension: 'mp4',
      outputFilename: replaceExtension(suffixFilename(file.name, '-compressed'), 'mp4'),
    },
    onProgress,
    signal
  )
}

function guessExt(name: string): string {
  const i = name.lastIndexOf('.')
  const ext = i >= 0 ? name.slice(i).toLowerCase() : ''
  const safe = /^\.[a-z0-9]{2,5}$/.test(ext) ? ext : ''
  return safe || '.mp4'
}