import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { assertNotCancelled, ProcessingError, type CancelSignal } from '../types'
import { toBytes } from '../ffmpeg/loader'
import { uid } from '../format'

export interface MediaStream {
  index?: number
  codec_type: 'audio' | 'video'
  codec_name: string
  width?: number
  height?: number
  sample_rate?: number
  channels?: number
  rotation?: number
  attachedPicture?: boolean
}
export interface MediaInspection { streams: MediaStream[]; duration?: number }

/** Bounded, selected stream fields only: never accept arbitrary input tags as UI HTML. */
export async function inspectMedia(ffmpeg: FFmpeg, filename: string, signal?: CancelSignal): Promise<MediaInspection> {
  assertNotCancelled(signal)
  const output = `probe_${uid()}.json`
  try {
    const exit = await ffmpeg.ffprobe([
      '-v', 'error', '-show_entries',
      'stream=index,codec_type,codec_name,width,height,sample_rate,channels:stream_disposition=attached_pic:stream_side_data=rotation:stream_tags=rotate:format=duration',
      '-of', 'json', filename, '-o', output,
    ], 30_000)
    assertNotCancelled(signal)
    // The pinned 5.1.10 WASM ffprobe writes its successful result but leaves the
    // wrapper's reset sentinel (-1) on a normal return. Never trust that code
    // alone: require a fresh, bounded, valid probe file and validated streams.
    if (exit !== 0 && exit !== -1) throw new ProcessingError('This media file could not be inspected safely. It may be damaged or unsupported.')
    const bytes = toBytes(await ffmpeg.readFile(output))
    if (bytes.length > 1024 * 1024) throw new ProcessingError('This media file has too many streams to inspect safely.')
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { streams?: unknown[]; format?: { duration?: unknown } }
    if (!Array.isArray(parsed.streams) || !parsed.streams.length || parsed.streams.length > 32) throw new ProcessingError('This media file has no supported streams or exceeds the 32-stream limit.')
    const streams: MediaStream[] = parsed.streams.flatMap<MediaStream>(value => {
      if (!value || typeof value !== 'object') return []
      const stream = value as Record<string, unknown>
      if (stream.codec_type !== 'video' && stream.codec_type !== 'audio') return []
      const positive = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined }
      const data = Array.isArray(stream.side_data_list) ? stream.side_data_list as { rotation?: unknown }[] : []
      const tags = stream.tags && typeof stream.tags === 'object' ? stream.tags as { rotate?: unknown } : {}
      const disposition = stream.disposition && typeof stream.disposition === 'object' ? stream.disposition as { attached_pic?: unknown } : {}
      const rawRotation = Number(data.find(item => item.rotation !== undefined)?.rotation ?? tags.rotate ?? 0)
      const index = Number(stream.index)
      return [{
        index: Number.isInteger(index) && index >= 0 ? index : undefined,
        codec_type: stream.codec_type,
        codec_name: typeof stream.codec_name === 'string' ? stream.codec_name : '',
        width: positive(stream.width), height: positive(stream.height),
        sample_rate: positive(stream.sample_rate), channels: positive(stream.channels),
        rotation: Number.isFinite(rawRotation) ? rawRotation : 0,
        attachedPicture: Number(disposition.attached_pic) === 1,
      }]
    })
    const duration = Number(parsed.format?.duration)
    return { streams, duration: Number.isFinite(duration) && duration > 0 ? duration : undefined }
  } catch (error) {
    if (signal?.cancelled) throw new ProcessingError('Processing was cancelled.', 'cancelled')
    if (error instanceof ProcessingError) throw error
    throw new ProcessingError('The media inspection returned invalid data. The original file is unchanged.')
  } finally {
    try { await ffmpeg.deleteFile(output) } catch { /* file may not exist after cancellation */ }
  }
}

export function displayDimensions(stream: MediaStream): { width: number; height: number } {
  if (!stream.width || !stream.height || !Number.isInteger(stream.width) || !Number.isInteger(stream.height)) {
    throw new ProcessingError('The video dimensions could not be verified. The original file is unchanged.')
  }
  const quarterTurn = Math.abs((stream.rotation ?? 0) % 180) === 90
  return quarterTurn ? { width: stream.height, height: stream.width } : { width: stream.width, height: stream.height }
}

export function verifyMediaDuration(input: MediaInspection, output: MediaInspection): void {
  if (input.duration !== undefined && (output.duration === undefined || Math.abs(input.duration - output.duration) > Math.max(0.25, input.duration * 0.01))) {
    throw new ProcessingError('The output duration changed unexpectedly. The original file is unchanged.')
  }
}
