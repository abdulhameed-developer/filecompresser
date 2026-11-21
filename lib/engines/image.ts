import imageCompression from 'browser-image-compression'
import { suffixFilename, replaceExtension, mimeForExt } from '../format'
import {
  assertNotCancelled,
  detectFormat,
  assertImagePixelLimit,
} from '../validation'
import type {
  CancelSignal,
  CompressionLevel,
  OutputFormatOption,
  ProcessedResult,
  ProgressCallback,
} from '../types'
import { ProcessingError, listenForCancellation } from '../types'

export type ImageFormat = 'jpeg' | 'png' | 'webp'

/**
 * Output containers this engine can genuinely produce.
 *
 * GIF is deliberately absent: re-encoding a still image as an animated GIF would
 * be a repackage, not a conversion, so it is not offered.
 */
export const IMAGE_OUTPUT_FORMATS: Record<ImageFormat, OutputFormatOption> = {
  jpeg: { value: 'jpeg', label: 'JPG', mimeType: 'image/jpeg' },
  png: { value: 'png', label: 'PNG', mimeType: 'image/png' },
  webp: { value: 'webp', label: 'WEBP', mimeType: 'image/webp' },
}

/** Format identifiers a dropped file can be, for defaulting the output picker. */
const FORMAT_ALIASES: Record<string, ImageFormat> = {
  jpeg: 'jpeg',
  jpg: 'jpeg',
  jfif: 'jpeg',
  jpe: 'jpeg',
  png: 'png',
  webp: 'webp',
}

export function isImageFormat(value: unknown): value is ImageFormat {
  return value === 'jpeg' || value === 'png' || value === 'webp'
}

/**
 * Where the library's Web Worker is served from.
 *
 * Left unset, `browser-image-compression` fetches its worker from
 * cdn.jsdelivr.net. Our CSP allows same-origin scripts only, so that request is
 * blocked and the library quietly reverts to encoding on the main thread — the
 * jank the worker exists to prevent. We host it ourselves instead, so the
 * encode really does stay off the UI thread and the image never leaves the page.
 */
const WORKER_URL = '/image-worker/browser-image-compression.js'

/** Best-effort default so the picker opens on the format the user uploaded. */
export function defaultOutputFormatFor(fileName: string): ImageFormat {
  const i = fileName.lastIndexOf('.')
  const ext = i >= 0 ? fileName.slice(i + 1).toLowerCase() : ''
  return FORMAT_ALIASES[ext] ?? 'jpeg'
}

/**
 * Which output formats may be offered for a given input.
 *
 * JPEG is excluded when the source has an alpha channel, because encoding it
 * would silently flatten transparency to black. Detection needs the decoded
 * image, so the caller may pass a hint it already has.
 */
export async function availableOutputFormats(
  file: File,
  signal?: CancelSignal,
): Promise<ImageFormat[]> {
  try {
    const bitmap = await boundedBitmap(file)
    const hasAlpha = hasAlphaChannel(bitmap)
    bitmap.close()
    assertNotCancelled(signal)
    const all: ImageFormat[] = ['jpeg', 'png', 'webp']
    // JPEG cannot store transparency, so offering it for an alpha source would
    // hand back a file with black backgrounds.
    return hasAlpha ? all.filter((f) => f !== 'jpeg') : all
  } catch {
    // Detection is a nicety; if it fails, offer everything and let the encoder
    // decide. An unsatisfiable encode surfaces as a clear error, not a crash.
    assertNotCancelled(signal)
    return ['png', 'webp']
  }
}

/** Exact alpha scan in small tiles; a single transparent pixel must not disappear in a downsample. */
function hasAlphaChannel(bitmap: ImageBitmap): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx)
    throw new ProcessingError('This browser cannot inspect image transparency.')
  try {
    for (let y = 0; y < bitmap.height; y += 256)
      for (let x = 0; x < bitmap.width; x += 256) {
        const width = Math.min(256, bitmap.width - x),
          height = Math.min(256, bitmap.height - y)
        ctx.clearRect(0, 0, 256, 256)
        ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height)
        const data = ctx.getImageData(0, 0, width, height).data
        for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
      }
    return false
  } finally {
    canvas.width = canvas.height = 0
  }
}

async function boundedBitmap(file: File): Promise<ImageBitmap> {
  await assertImagePixelLimit(file)
  const bitmap = await createImageBitmap(file)
  if (bitmap.width * bitmap.height > 32_000_000) {
    bitmap.close()
    throw new ProcessingError(
      'This image exceeds the 32 megapixel processing limit. Resize it first.',
    )
  }
  return bitmap
}

async function encodeWithCancellation(
  file: File,
  options: Parameters<typeof imageCompression>[1],
  signal?: CancelSignal,
): Promise<File> {
  const controller = new AbortController()
  const release = listenForCancellation(signal, () => controller.abort())
  try {
    return await imageCompression(file, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    release()
  }
}

export interface ImageCompressOptions {
  level?: CompressionLevel
  /** 0–1. Overrides the level's default when the tool exposes a slider. */
  quality?: number
  /** Re-encode to a different container instead of shrinking in place. */
  outputFormat?: ImageFormat
  /** Hard target size in bytes. The encoder searches for a quality that fits. */
  targetSize?: number
}

interface Preset {
  maxSizeMB: number
  maxWidthOrHeight: number
  quality: number
}

function presetFor(level: CompressionLevel, quality?: number): Preset {
  const base =
    level === 'maximum'
      ? { maxSizeMB: 0.5, maxWidthOrHeight: 1920, quality: 0.6 }
      : { maxSizeMB: 1.5, maxWidthOrHeight: 3200, quality: 0.82 }
  return typeof quality === 'number'
    ? { ...base, quality: clampQuality(quality) }
    : base
}

function clampQuality(q: number): number {
  if (!Number.isFinite(q)) return 0.8
  return Math.min(1, Math.max(0.1, q))
}

export interface ImageCompressResult extends ProcessedResult {
  /** Populated when a target size was requested but could not be reached. */
  targetNote?: string
}

/**
 * Compress an image with a real codec.
 *
 * `browser-image-compression` runs the decode/resize/re-encode loop in a Web
 * Worker and reports the bytes it has written, so the percentage shown is
 * genuine work completed rather than a timer.
 */
export async function compressImage(
  file: File,
  options: ImageCompressOptions = {},
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<ImageCompressResult> {
  assertNotCancelled(signal)
  onProgress?.(3, 'Preparing image…')

  const level = options.level ?? 'recommended'
  const preset = presetFor(level, options.quality)
  const targetFormat = options.outputFormat

  // The real container, from the file's bytes rather than its name. This decides
  // whether the result is a *compression* of what they uploaded or a *conversion*
  // to something else — which changes both the wording and the filename.
  const detected = await detectFormat(file)
  const sourceFormat =
    detected && isImageFormat(detected) ? detected : undefined
  const isConversion = Boolean(
    targetFormat && sourceFormat && targetFormat !== sourceFormat,
  )

  assertNotCancelled(signal)
  // Check decoded dimensions and transparency for every item, not only the first batch file.
  try {
    const bitmap = await boundedBitmap(file)
    try {
      if (
        targetFormat === 'jpeg' &&
        sourceFormat !== 'jpeg' &&
        hasAlphaChannel(bitmap)
      ) {
        throw new ProcessingError(
          'This image has transparency. Choose PNG, WEBP, or keep its original format.',
        )
      }
    } finally {
      bitmap.close()
    }
  } catch (error) {
    throw describeImageError(error, signal)
  }

  // A target size only makes sense when we control the encoder quality, which
  // is the lossy formats. PNG is lossless: its size is driven by dimensions and
  // colour depth, not a quality dial, so a search would be theatre.
  if (options.targetSize && options.targetSize > 0) {
    if ((targetFormat ?? sourceFormat) !== 'png') {
      try {
        return await compressToTargetSize(
          file,
          options,
          preset,
          isConversion,
          onProgress,
          signal,
        )
      } catch (error) {
        throw describeImageError(error, signal)
      }
    }
  }

  try {
    const compressed = await encodeWithCancellation(
      file,
      {
        maxSizeMB: preset.maxSizeMB,
        maxWidthOrHeight: preset.maxWidthOrHeight,
        initialQuality: preset.quality,
        useWebWorker: true,
        libURL: WORKER_URL,
        // Only steer the encoder when the output container is known; otherwise keep
        // the source format so a PNG stays a PNG.
        fileType: mimeForExt(
          (targetFormat ?? sourceFormat) === 'jpeg'
            ? 'jpg'
            : (targetFormat ?? sourceFormat ?? 'jpeg'),
        ),
        onProgress: (p) => {
          if (signal?.cancelled) return
          onProgress?.(
            Math.max(3, Math.min(97, Math.round(p))),
            'Compressing image…',
          )
        },
      },
      signal,
    )

    assertNotCancelled(signal)

    if ((await detectFormat(compressed)) !== (targetFormat ?? sourceFormat))
      throw new ProcessingError(
        'This browser could not encode the requested image format.',
      )
    const outType = compressed.type || file.type || 'image/jpeg'
    const ext = extensionForMime(outType)

    onProgress?.(100, 'Done')
    return {
      blob: compressed,
      filename: nameOutput(file, ext, isConversion),
      mimeType: outType,
      targetNote:
        options.targetSize && (targetFormat ?? sourceFormat) === 'png'
          ? 'PNG output has no quality target. Choose JPG or WEBP to search for a target size.'
          : undefined,
    }
  } catch (e) {
    throw describeImageError(e, signal)
  }
}

/**
 * Name the result honestly.
 *
 * Re-encoding a JPG to another JPG is compression, so it keeps the original
 * stem plus "-compressed". Only a genuine change of container earns
 * "-converted", which is what tells the user the format actually moved.
 */
function nameOutput(file: File, ext: string, isConversion: boolean): string {
  return isConversion
    ? replaceExtension(suffixFilename(file.name, '-converted'), ext)
    : suffixFilename(replaceExtension(file.name, ext), '-compressed')
}

/** Lowest and highest quality the search will consider, and how many attempts. */
const MIN_QUALITY = 0.12
const MAX_QUALITY = 0.95
const MAX_ATTEMPTS = 9

/**
 * Find the highest quality whose encoded size fits the user's target.
 *
 * This is a real binary search over the encoder's quality parameter: each step
 * produces an actual encoded image and is measured against the real byte target.
 * The bounded search keeps the highest-quality candidate it finds within the target;
 * encoder rounding means this is not a guarantee of a mathematical optimum.
 *
 * If even the lowest quality overshoots, we return that smallest result *and say
 * so* — we never claim the target was hit when it was not, and we never pad or
 * truncate output to make the number look right.
 */
async function compressToTargetSize(
  file: File,
  options: ImageCompressOptions,
  preset: Preset,
  isConversion: boolean,
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<ImageCompressResult> {
  const target = options.targetSize as number
  const targetFormat = options.outputFormat
  const detected = await detectFormat(file)
  const sourceFormat = detected && isImageFormat(detected) ? detected : 'jpeg'
  const effectiveFormat = targetFormat ?? sourceFormat
  const fileType = mimeForExt(
    effectiveFormat === 'jpeg' ? 'jpg' : effectiveFormat,
  )

  let lo = MIN_QUALITY
  let hi = MAX_QUALITY
  let best: File | null = null
  let attempts = 0

  while (attempts < MAX_ATTEMPTS) {
    assertNotCancelled(signal)
    attempts++

    const mid = (lo + hi) / 2
    // Each attempt is a genuine encode, so the bar reflects real work done.
    const progressFloor = 3 + ((attempts - 1) / MAX_ATTEMPTS) * 90
    const progressCeil = 3 + (attempts / MAX_ATTEMPTS) * 90

    const encoded = await encodeAtQuality(file, {
      quality: mid,
      maxWidthOrHeight: preset.maxWidthOrHeight,
      fileType,
      onProgress: (p) => {
        if (signal?.cancelled) return
        onProgress?.(
          Math.round(
            progressFloor +
              (Math.max(0, Math.min(100, p)) / 100) *
                (progressCeil - progressFloor),
          ),
          `Trying to reach your target size (attempt ${attempts} of ${MAX_ATTEMPTS})…`,
        )
      },
      signal,
    })

    assertNotCancelled(signal)

    if (encoded.size <= target) {
      // Fits — keep it and try to claw quality back.
      best = encoded
      lo = mid
    } else {
      // Too big — drop quality.
      hi = mid
    }

    // No meaningful room left to search.
    if (hi - lo < 0.01) break
  }

  assertNotCancelled(signal)

  // Nothing reached the target. Return the smallest real encode we made, and be
  // explicit that the target was not met.
  if (!best) {
    const smallest = await encodeAtQuality(file, {
      quality: MIN_QUALITY,
      maxWidthOrHeight: preset.maxWidthOrHeight,
      fileType,
      signal,
    })
    assertNotCancelled(signal)

    const outType = smallest.type || file.type || 'image/jpeg'
    const ext = extensionForMime(outType)

    onProgress?.(100, 'Done')
    return {
      blob: smallest,
      filename: nameOutput(file, ext, isConversion),
      mimeType: outType,
      targetNote: `We compressed this as far as possible, but the smallest version is still ${formatKb(smallest.size)}. The target of ${formatKb(target)} could not be reached within the supported quality and dimension limits.`,
    }
  }

  const outType = best.type || file.type || 'image/jpeg'
  const ext = extensionForMime(outType)

  onProgress?.(100, 'Done')
  return {
    blob: best,
    filename: nameOutput(file, ext, isConversion),
    mimeType: outType,
  }
}

/**
 * One encode at a fixed quality.
 *
 * `maxSizeMB` is left unbounded so the library does not run its own extra
 * quality-reduction loop: we need each attempt's size to reflect exactly the
 * quality we asked for, or the search would be measuring the wrong thing.
 */
async function encodeAtQuality(
  file: File,
  config: {
    quality: number
    maxWidthOrHeight: number
    fileType?: string
    onProgress?: (p: number) => void
    signal?: CancelSignal
  },
): Promise<File> {
  assertNotCancelled(config.signal)
  const bitmap = await boundedBitmap(file)
  const canvas = document.createElement('canvas')
  try {
    const scale = Math.min(
      1,
      config.maxWidthOrHeight / Math.max(bitmap.width, bitmap.height),
    )
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ProcessingError('This browser cannot encode images.')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const type = config.fileType ?? file.type
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(
                new ProcessingError('The image encoder produced no output.'),
              ),
        type,
        config.quality,
      ),
    )
    assertNotCancelled(config.signal)
    if (blob.type !== type)
      throw new ProcessingError(
        'This browser does not support the requested output format.',
      )
    config.onProgress?.(100)
    return new File([blob], file.name, { type: blob.type })
  } finally {
    bitmap.close()
    canvas.width = canvas.height = 0
  }
}

function formatKb(bytes: number): string {
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

function describeImageError(e: unknown, signal?: CancelSignal): Error {
  if (signal?.cancelled)
    return new ProcessingError('Processing was cancelled.', 'cancelled')
  if (e instanceof ProcessingError) return e

  const message = e instanceof Error ? e.message : ''
  if (/abort/i.test(message)) {
    return new ProcessingError('Processing was cancelled.', 'cancelled')
  }
  if (/memory|allocation|heap|out of bounds/i.test(message)) {
    return new ProcessingError(
      'This image is too large for this device to process in the browser. Try a smaller file, or a device with more memory.',
    )
  }
  if (/decode|unsupported|invalid|not supported/i.test(message)) {
    return new ProcessingError(
      'This image could not be compressed. It may be corrupted, or use a format this browser cannot decode.',
    )
  }
  return new ProcessingError(
    'This image could not be compressed in your browser.',
  )
}

function extensionForMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}
