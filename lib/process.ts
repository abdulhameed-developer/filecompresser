import type {
  CancelSignal,
  EngineKind,
  ProcessingOptions,
  ProcessedResult,
  ProgressCallback,
} from './types'
import { ProcessingError } from './types'
import { detectFormat } from './validation'

export interface ProcessContext {
  engine: EngineKind
  file: File
  /** The whole queue — consumed by engines that build a single document from many files. */
  allFiles?: File[]
  options: ProcessingOptions
  onProgress?: ProgressCallback
  signal?: CancelSignal
}

/**
 * Route a file to its engine.
 *
 * Returns a single result for one-in/one-out tools, or an array for tools that
 * emit many outputs (ZIP extraction, PDF→images).
 */
export async function processFile(
  ctx: ProcessContext,
): Promise<ProcessedResult | ProcessedResult[]> {
  const { engine, file, options, onProgress, signal } = ctx

  switch (engine) {
    case 'image-compress': {
      const { compressImage, isImageFormat } = await import('./engines/image')
      const resizeMaxWidth = options.resizeEnabled === true ? optionalDimension(options.resizeMaxWidth) : undefined
      const resizeMaxHeight = options.resizeEnabled === true ? optionalDimension(options.resizeMaxHeight) : undefined
      if (options.resizeEnabled === true && !resizeMaxWidth && !resizeMaxHeight)
        throw new ProcessingError('Enter a positive maximum width or height, or turn resizing off.')
      return compressImage(
        file,
        {
          level: options.level,
          pngMode: options.pngMode,
          mode: ['balanced', 'high-quality', 'maximum', 'target'].includes(String(options.imageMode))
            ? options.imageMode
            : undefined,
          quality:
            options.imageMode !== 'target' && typeof options.quality === 'number' ? options.quality : undefined,
          outputFormat:
            typeof options.outputFormat === 'string' &&
            isImageFormat(options.outputFormat)
              ? options.outputFormat
              : undefined,
          targetSize: optionalSize(options.targetSize),
          resizeMaxWidth,
          resizeMaxHeight,
        },
        onProgress,
        signal,
      )
    }
    case 'gif-compress': {
      const { compressGif } = await import('./engines/gif')
      return withMediaLock(
        () => compressGif(file, { level: options.level }, onProgress, signal),
        signal,
      )
    }

    case 'video-compress': {
      const { compressVideo } = await import('./engines/video')
      return withMediaLock(
        () =>
          compressVideo(
            file,
            {
              level: options.level,
              resolution: normalizeResolution(options.resolution),
            },
            onProgress,
            signal,
          ),

        signal,
      )
    }
    case 'webm-to-mp4': {
      const { compressVideo } = await import('./engines/video')
      return withMediaLock(() => compressVideo(file, { level: options.level, resolution: normalizeResolution(options.resolution) }, onProgress, signal), signal)
    }
    case 'audio-compress': {
      const { processAudio } = await import('./engines/audio')
      return withMediaLock(
        () =>
          processAudio(
            file,
            {
              level: options.level,
              bitrate:
                typeof options.bitrate === 'string'
                  ? options.bitrate
                  : undefined,
              outputFormat: 'mp3',
            },
            onProgress,
            signal,
          ),

        signal,
      )
    }
    case 'pdf-compress': {
      const { compressPdf } = await import('./engines/pdf')
      return compressPdf(file, onProgress, signal)
    }

    case 'zip-create': {
      const { createZip } = await import('./engines/zip')
      const result = await createZip(
        ctx.allFiles?.length ? ctx.allFiles : [file],
        { compressionLevel: 6 },
        onProgress,
        signal,
      )
      return result
    }

    case 'zip-extract': {
      const { extractZip, uniqueArchiveName } = await import('./engines/zip')
      const entries = await extractZip(file, onProgress, signal)
      const used = new Set<string>()
      return entries.map((entry) => ({
        blob: entry.blob,
        // Flattened because a download cannot carry a directory structure.
        filename: uniqueArchiveName(used, entry.path.replace(/\//g, '__')),
        mimeType: entry.blob.type || 'application/octet-stream',
      }))
    }

    default: {
      // Exhaustive guard: adding an EngineKind without a case is a type error.
      const unreachable: never = engine
      throw new ProcessingError(
        `This tool is not available: ${String(unreachable)}`,
      )
    }
  }
}

function normalizeResolution(
  value: string | undefined,
): 'original' | '1080' | '720' | '480' {
  if (value === '1080' || value === '720' || value === '480') return value
  return 'original'
}

/**
 * A target size is opt-in: blank or nonsensical input must mean "no target", not
 * "target 1 byte", or every maximum-mode run would jump into the size search and
 * report that the target could not be met.
 */
function optionalSize(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  const bytes = Math.floor(Math.min(parsed, 200 * 1024 * 1024))
  return bytes > 0 ? bytes : undefined
}

function optionalDimension(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 1 && number <= 32768 ? Math.floor(number) : undefined
}

/**
 * How many files may be processed at once.
 *
 * FFmpeg and PDF work are memory-hungry and share one WASM instance, so they
 * run strictly one at a time. Image work runs in its own workers and can safely
 * use a couple of cores.
 */
export function concurrencyFor(engine: EngineKind): number {
  switch (engine) {
    case 'video-compress':
    case 'webm-to-mp4':
    case 'audio-compress':
    case 'gif-compress':
    case 'pdf-compress':
    case 'zip-create':
    case 'zip-extract':
      return 1
    case 'image-compress':
      // One decoded raster plus a codec heap can already be substantial at 32MP.
      // Sequential jobs bound peak memory on mobile; cancellation terminates the worker.
      return 1
    default:
      return 2
  }
}

/** Map a sniffed container onto the engine that can handle it. */
export async function engineForFormat(
  format: string | null,
): Promise<EngineKind | null> {
  switch (format) {
    case 'jpeg':
    case 'png':
    case 'webp':
      return 'image-compress'
    case 'gif':
      return 'gif-compress'
    case 'pdf':
      return 'pdf-compress'
    case 'mp4':
    case 'mov':
    case 'webm':
      return 'video-compress'
    case 'mp3':
    case 'wav':
    case 'm4a':
    case 'flac':
    case 'ogg':
      return 'audio-compress'
    case 'zip':
      return 'zip-extract'
    default:
      return null
  }
}

export { detectFormat }
// One media job across mounted workspaces/navigation, not only within one queue.
let mediaTail: Promise<unknown> = Promise.resolve()
export function withMediaLock<T>(
  work: () => Promise<T>,
  signal?: CancelSignal,
): Promise<T> {
  const result = mediaTail.then(async () => {
    if (signal?.cancelled)
      throw new ProcessingError('Processing was cancelled.', 'cancelled')
    return work()
  })
  mediaTail = result.catch(() => undefined)
  return result
}
