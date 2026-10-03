import type { CancelSignal, EngineKind, ProcessingOptions, ProcessedResult, ProgressCallback } from './types'
import { ProcessingError } from './types'
import { compressImage, isImageFormat } from './engines/image'
import { compressGif } from './engines/gif'
import { compressVideo } from './engines/video'
import { processAudio } from './engines/audio'
import { compressPdf } from './engines/pdf'
import { createZip, extractZip } from './engines/zip'
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
export async function processFile(ctx: ProcessContext): Promise<ProcessedResult | ProcessedResult[]> {
  const { engine, file, options, onProgress, signal } = ctx

  switch (engine) {
    case 'image-compress':
      return compressImage(
        file,
        {
          level: options.level,
          quality: typeof options.quality === 'number' ? options.quality : undefined,
          outputFormat:
            typeof options.outputFormat === 'string' && isImageFormat(options.outputFormat)
              ? options.outputFormat
              : undefined,
          targetSize: optionalSize(options.targetSize),
        },
        onProgress,
        signal
      )

    case 'gif-compress':
      return compressGif(file, { level: options.level }, onProgress, signal)

    case 'video-compress':
      return compressVideo(
        file,
        {
          level: options.level,
          resolution: normalizeResolution(options.resolution),
        },
        onProgress,
        signal
      )

    case 'audio-compress':
      return processAudio(
        file,
        {
          level: options.level,
          bitrate: typeof options.bitrate === 'string' ? options.bitrate : undefined,
          outputFormat: 'mp3',
        },
        onProgress,
        signal
      )

    case 'pdf-compress':
      return compressPdf(file, onProgress, signal)

    case 'zip-create': {
      const result = await createZip(
        ctx.allFiles?.length ? ctx.allFiles : [file],
        { compressionLevel: 6 },
        onProgress,
        signal
      )
      return result
    }

    case 'zip-extract': {
      const entries = await extractZip(file, onProgress, signal)
      return entries.map((entry) => ({
        blob: entry.blob,
        // Flattened because a download cannot carry a directory structure.
        filename: entry.path.replace(/\//g, '__'),
        mimeType: entry.blob.type || 'application/octet-stream',
      }))
    }

    default: {
      // Exhaustive guard: adding an EngineKind without a case is a type error.
      const unreachable: never = engine
      throw new ProcessingError(`This tool is not available: ${String(unreachable)}`)
    }
  }
}

function normalizeResolution(value: string | undefined): 'original' | '1080' | '720' | '480' {
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
  return Math.min(parsed, 200 * 1024 * 1024)
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
    case 'audio-compress':
    case 'gif-compress':
    case 'pdf-compress':
    case 'zip-create':
    case 'zip-extract':
      return 1
    case 'image-compress':
      return 2
    default:
      return 2
  }
}

/** Map a sniffed container onto the engine that can handle it. */
export async function engineForFormat(format: string | null): Promise<EngineKind | null> {
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