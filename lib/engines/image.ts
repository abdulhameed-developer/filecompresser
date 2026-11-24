import { suffixFilename, replaceExtension } from '../format'
import type { CancelSignal, CompressionLevel, ImageInspection, ImageMode, ImageOutcome, OutputFormatOption, PngMode, ProcessedResult, ProgressCallback } from '../types'
import { assertNotCancelled, listenForCancellation, ProcessingError } from '../types'
import { imageGeometry, inspectImageHeader } from '../../workers/image-metadata.mjs'

export type ImageFormat = 'jpeg' | 'png' | 'webp'

export const IMAGE_OUTPUT_FORMATS: Record<ImageFormat, OutputFormatOption> = {
  jpeg: { value: 'jpeg', label: 'JPG', mimeType: 'image/jpeg' },
  png: { value: 'png', label: 'PNG', mimeType: 'image/png' },
  webp: { value: 'webp', label: 'WEBP', mimeType: 'image/webp' },
}

const FORMAT_ALIASES: Record<string, ImageFormat> = { jpeg: 'jpeg', jpg: 'jpeg', jfif: 'jpeg', jpe: 'jpeg', png: 'png', webp: 'webp' }
const WORKER_URL = '/image-worker/image-engine.mjs'
const JOB_TIMEOUT_MS = 180_000

export function isImageFormat(value: unknown): value is ImageFormat {
  return value === 'jpeg' || value === 'png' || value === 'webp'
}

/** Filename-only hint; the encoder always verifies the real container bytes. */
export function defaultOutputFormatFor(fileName: string): ImageFormat {
  const index = fileName.lastIndexOf('.')
  return FORMAT_ALIASES[index >= 0 ? fileName.slice(index + 1).toLowerCase() : ''] ?? 'jpeg'
}

export interface ImageCompressOptions {
  /** Legacy media-compatible level, used only when an image mode is absent. */
  level?: CompressionLevel
  mode?: ImageMode
  /** Independent PNG policy; numeric JPEG/WebP quality never controls PNG. */
  pngMode?: PngMode
  /** Explicit 0–1 override in ordinary modes. Target mode has its own search. */
  quality?: number
  outputFormat?: ImageFormat
  /** Strict maximum bytes, never a rounded display value. */
  targetSize?: number
  /** Explicit maximum dimensions. Omitted/zero bounds never resize an image. */
  resizeMaxWidth?: number
  resizeMaxHeight?: number
}

export interface ImageCompressResult extends ProcessedResult {
  inspection: ImageInspection
  outcome: ImageOutcome
}

interface PipelineResult {
  blob: Blob
  inspection: ImageInspection
  outcome: ImageOutcome
  targetBytes?: number
  targetNote?: string
}

interface ImageProbe {
  format: ImageFormat
  width: number
  height: number
  hasAlpha: boolean
  jpegSafe?: boolean
}

export interface ImageSourceProbe {
  readonly file: File
  readonly format: ImageFormat
  /** Original display dimensions, after EXIF orientation is applied. */
  readonly width: number
  readonly height: number
  readonly hasAlpha: boolean
  /** False when full-depth opacity cannot be proved by the8-bit preview. */
  readonly jpegSafe?: boolean
}

/** The same fit/rounding policy used by the actual encoder; never upsamples. */
export function expectedImageGeometry(width: number, height: number, maxWidth?: number, maxHeight?: number) {
  return imageGeometry(width, height, maxWidth, maxHeight)
}

type WorkerOutput = PipelineResult | ImageProbe
type WorkerMessage =
  | { type: 'progress'; progress: number; message: string }
  | { type: 'result' | 'probe'; result: WorkerOutput }
  | { type: 'error'; message: string; code?: string }

function describeImageError(error: unknown, signal?: CancelSignal): Error {
  if (signal?.cancelled) return new ProcessingError('Processing was cancelled.', 'cancelled')
  if (error instanceof ProcessingError) return error
  const candidate = error instanceof Error ? error : new Error('The image could not be processed.')
  const code = (error as { code?: string } | null)?.code
  if (code) return new ProcessingError(candidate.message, code)
  if (/memory|allocation|heap|out of bounds/i.test(candidate.message))
    return new ProcessingError('This image needs more memory than this device can provide. Try one file at a time, a smaller image, or another device. No downscaled output was returned.', 'image-memory')
  if (/decode|invalid|corrupt|encodingerror/i.test(candidate.message))
    return new ProcessingError('This image could not be decoded or encoded safely. It may be corrupted or unsupported by this browser.', 'invalid-image')
  return new ProcessingError(candidate.message || 'This image could not be compressed in your browser.')
}

/** Each job owns its worker. Cancellation terminates the decoder/WASM immediately. */
function runWorker(file: File, options: ImageCompressOptions, onProgress?: ProgressCallback, signal?: CancelSignal, probe = false): Promise<WorkerOutput> {
  assertNotCancelled(signal)
  if (typeof Worker === 'undefined') return Promise.reject(new ProcessingError('Image workers are unavailable.', 'worker-unavailable'))
  return new Promise((resolve, reject) => {
    let worker: Worker
    try { worker = new Worker(WORKER_URL, { type: 'module', name: 'FileCompresser image encoder' }) }
    catch { reject(new ProcessingError('Image workers are unavailable.', 'worker-unavailable')); return }
    let settled = false
    let release = () => {}
    const finish = (error?: Error, result?: WorkerOutput) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      release()
      worker.terminate()
      if (error) reject(error)
      else if (result) resolve(result)
      else reject(new ProcessingError('The image worker produced no output.'))
    }
    const timer = setTimeout(() => finish(new ProcessingError('This image took too long to process on this device. Try one file at a time, another format, or another device. No partial output was returned.', 'image-timeout')), JOB_TIMEOUT_MS)
    release = listenForCancellation(signal, () => finish(new ProcessingError('Processing was cancelled.', 'cancelled')))
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const data = event.data
      if (signal?.cancelled) { finish(new ProcessingError('Processing was cancelled.', 'cancelled')); return }
      if (!data || typeof data.type !== 'string') { finish(new ProcessingError('The image worker returned an invalid response.')); return }
      if (data.type === 'progress') onProgress?.(data.progress, data.message)
      else if (data.type === 'error') finish(new ProcessingError(data.message, data.code))
      else if (data.type === 'result' || data.type === 'probe') finish(undefined, data.result)
    }
    worker.onerror = () => finish(new ProcessingError('The image worker could not start in this browser.', 'worker-unavailable'))
    try { worker.postMessage({ file, options, probe }) }
    catch (error) { finish(describeImageError(error, signal)) }
  })
}

async function runFallback(file: File, options: ImageCompressOptions, onProgress?: ProgressCallback, signal?: CancelSignal, probe = false): Promise<WorkerOutput> {
  const [{ createImageCanvasAdapter }, { runImagePipeline }] = await Promise.all([
    import('../../workers/image-canvas.mjs'), import('../../workers/image-pipeline.mjs'),
  ])
  assertNotCancelled(signal)
  const cancelled = () => Boolean(signal?.cancelled)
  const adapter = createImageCanvasAdapter({ mainThread: true, cancelled })
  if (probe) {
    const header = await inspectImageHeader(file, cancelled)
    const decoded = await adapter.decode(file, header, { width: header.width, height: header.height })
    try { return { format: header.format as ImageFormat, width: header.width, height: header.height, hasAlpha: decoded.hasAlpha, jpegSafe: !decoded.hasAlpha && header.jpegPrecisionSafe !== false } }
    finally { decoded.close() }
  }
  onProgress?.(0, 'Worker unavailable; using this browser’s fallback encoder…')
  return await runImagePipeline(file, options, adapter, { cancelled, progress: onProgress }) as PipelineResult
}

async function runImageJob(file: File, options: ImageCompressOptions, onProgress?: ProgressCallback, signal?: CancelSignal, probe = false): Promise<WorkerOutput> {
  try { return await runWorker(file, options, onProgress, signal, probe) }
  catch (error) {
    assertNotCancelled(signal)
    if (error instanceof ProcessingError && error.code === 'worker-unavailable') return runFallback(file, options, onProgress, signal, probe)
    throw error
  }
}

/** Inspect alpha off the UI thread before offering a JPEG conversion. */
export async function availableOutputFormats(file: File, signal?: CancelSignal, onProbe?: (probe: ImageSourceProbe) => void): Promise<ImageFormat[]> {
  let probe: ImageProbe
  try {
    const result = await runImageJob(file, {}, undefined, signal, true)
    assertNotCancelled(signal)
    if (!('hasAlpha' in result) || !isImageFormat(result.format) || typeof result.hasAlpha !== 'boolean' ||
        !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width <= 0 || result.height <= 0 || result.width * result.height > 32_000_000 ||
        result.jpegSafe !== undefined && typeof result.jpegSafe !== 'boolean')
      throw new ProcessingError('Image inspection did not return valid source dimensions and transparency information.')
    probe = result
  } catch {
    assertNotCancelled(signal)
    // A failed optional preview never permits a destructive JPEG conversion.
    // Actual processing validates again and provides the actionable error.
    return ['png', 'webp']
  }
  // An optional UI observer cannot downgrade a valid format decision. The
  // caller's cancellation/generation token still governs stale probe handling.
  try { onProbe?.(Object.freeze({ file, ...probe })) } catch {}
  assertNotCancelled(signal)
  return probe.hasAlpha || probe.jpegSafe === false ? ['png', 'webp'] : ['jpeg', 'png', 'webp']
}

export async function compressImage(file: File, options: ImageCompressOptions = {}, onProgress?: ProgressCallback, signal?: CancelSignal): Promise<ImageCompressResult> {
  const started = performance.now()
  assertNotCancelled(signal)
  const mode = options.mode ?? (options.targetSize && options.targetSize > 0 ? 'target' : options.level === 'maximum' ? 'maximum' : 'balanced')
  try {
    // Reject animation and pathological headers before allocating any worker bitmap.
    onProgress?.(0, 'Checking image…')
    await inspectImageHeader(file, () => Boolean(signal?.cancelled))
    const result = await runImageJob(file, { ...options, mode }, onProgress, signal)
    assertNotCancelled(signal)
    if (!('blob' in result)) throw new ProcessingError('The image worker produced no encoded file.')
    const elapsedMs = Math.max(0, Math.round(performance.now() - started))
    const format = result.inspection.outputFormat as ImageFormat
    const ext = format === 'jpeg' ? 'jpg' : format
    const unchanged = result.inspection.encoder === 'Original file'
    const transformed = result.inspection.inputFormat !== result.inspection.outputFormat
    const resized = result.inspection.inputWidth !== result.inspection.outputWidth || result.inspection.inputHeight !== result.inspection.outputHeight
    const filename = unchanged
      ? replaceExtension(file.name, ext)
      : suffixFilename(replaceExtension(file.name, ext), transformed ? '-converted' : resized ? '-resized' : '-compressed')
    return { ...result, inspection: { ...result.inspection, elapsedMs }, durationMs: elapsedMs, filename, mimeType: IMAGE_OUTPUT_FORMATS[format].mimeType }
  } catch (error) { throw describeImageError(error, signal) }
}
