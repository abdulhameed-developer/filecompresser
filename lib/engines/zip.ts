import { unzip, zip, type UnzipFileInfo, type Unzipped } from 'fflate'
import {
  ARCHIVE_LIMITS,
  assertNotCancelled,
  exceedsArchiveRatio,
  flattenArchivePath,
  sanitizeArchivePath,
} from '../validation'
import { blobToUint8Array } from '../format'
import type { CancelSignal, ProcessedResult, ProgressCallback } from '../types'
import { ProcessingError } from '../types'

export interface ZipCreateOptions {
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
}

export interface ExtractedEntry {
  path: string
  blob: Blob
  size: number
}

export interface CreateZipResult extends ProcessedResult {
  fileCount: number
  uncompressedSize: number
}

/**
 * Build a ZIP from a set of files.
 *
 * fflate's async `zip` invokes its callback once with the finished archive,
 * which is the only completion signal the library exposes.
 */
export async function createZip(
  files: File[],
  options: ZipCreateOptions = {},
  onProgress?: ProgressCallback,
  signal?: CancelSignal
): Promise<CreateZipResult> {
  if (!files.length) throw new ProcessingError('Add at least one file to create a ZIP.')
  assertNotCancelled(signal)

  const level = options.compressionLevel ?? 6
  const entries: Record<string, [Uint8Array, { level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {}
  const used = new Set<string>()
  let uncompressed = 0

  for (let i = 0; i < files.length; i++) {
    assertNotCancelled(signal)
    const file = files[i]
    // Duplicate basenames are common when dragging a folder; keep both rather
    // than silently overwriting one.
    const base = sanitizeArchivePath(flattenArchivePath(file.name)) || `file-${i + 1}`
    let candidate = base
    let n = 2
    while (used.has(candidate.toLowerCase())) {
      const dot = base.lastIndexOf('.')
      candidate = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`
      n++
    }
    used.add(candidate.toLowerCase())

    uncompressed += file.size
    entries[candidate] = [await blobToUint8Array(file), { level }]
    onProgress?.(Math.round(((i + 1) / files.length) * 40), `Adding ${candidate}…`)
  }

  assertNotCancelled(signal)
  onProgress?.(50, 'Compressing archive…')

  // Deflate cannot be interrupted mid-pass, so a cancel races the work and
  // discards the result rather than pretending to stop it.
  const compressed = await Promise.race([
    new Promise<Uint8Array>((resolve, reject) => {
      zip(entries, { level }, (err, chunk) => {
        if (err) reject(toArchiveError(err))
        else resolve(chunk)
      })
    }),
    rejectWhenCancelled(signal),
  ])

  assertNotCancelled(signal)
  onProgress?.(100, 'Done')

  return {
    blob: new Blob([compressed], { type: 'application/zip' }),
    filename: 'archive.zip',
    mimeType: 'application/zip',
    fileCount: files.length,
    uncompressedSize: uncompressed,
  }
}

function toArchiveError(e: unknown): Error {
  if (e instanceof ProcessingError) return e
  const message = e instanceof Error ? e.message : String(e)
  if (/memory|allocat|out of bounds/i.test(message)) {
    return new ProcessingError(
      'This archive is too large for your device to build. Try fewer or smaller files.'
    )
  }
  return new ProcessingError('The archive could not be created.')
}

/**
 * A promise that rejects as soon as the signal is cancelled. Lets a cancel
 * interrupt work that cannot be stopped at its source.
 */
function rejectWhenCancelled(signal?: CancelSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (!signal) return
    if (signal.cancelled) {
      reject(new ProcessingError('Processing was cancelled.', 'cancelled'))
      return
    }
    const poll = setInterval(() => {
      if (!signal.cancelled) return
      clearInterval(poll)
      reject(new ProcessingError('Processing was cancelled.', 'cancelled'))
    }, 200)
  })
}

/**
 * Decompress a ZIP, reporting what it found through `filter`.
 *
 * The filter runs for every entry *before* that entry's bytes are produced, so
 * throwing from it aborts the whole archive without allocating memory for the
 * offending entry. That is what makes the bomb and path guards cheap: nothing
 * hostile is ever decompressed.
 *
 * `keepPayload` is false for inspection, where only names and sizes matter.
 */
async function runUnzip(
  file: File,
  options: {
    keepPayload: boolean
    guard?: (info: UnzipFileInfo) => void
    onProgress?: ProgressCallback
    signal?: CancelSignal
  }
): Promise<{ files: UnzipFileInfo[]; contents: Record<string, Uint8Array> }> {
  const buf = await blobToUint8Array(file)
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
    throw new ProcessingError('This file is not a valid ZIP archive.')
  }

  const manifest: UnzipFileInfo[] = []

  const contents = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      buf,
      {
        filter: (info) => {
          if (info.name.endsWith('/')) return false
          manifest.push(info)
          // Throwing here aborts before any decompression happens.
          options.guard?.(info)
          return true
        },
      },
      (err, data) => {
        if (err) reject(toExtractionError(err))
        else resolve(data)
      }
    )

    // Cancellation is checked between phases; the decompress itself is atomic.
    if (options.signal?.cancelled) {
      reject(new ProcessingError('Processing was cancelled.', 'cancelled'))
    }
  })

  return {
    files: manifest,
    contents: options.keepPayload ? contents : {},
  }
}

/**
 * Extract every file entry from a ZIP.
 *
 * Security model:
 *  1. Entry paths are vetted inside the unzip filter, so a hostile name is
 *     rejected before its bytes are decompressed.
 *  2. Absolute paths, `..` segments, drive letters, UNC prefixes, control
 *     characters and Windows reserved device names are all refused.
 *  3. Entry count, per-entry size, total uncompressed size and a
 *     compression-ratio ceiling bound the memory an archive can demand.
 */
export async function extractZip(
  file: File,
  onProgress?: ProgressCallback,
  signal?: CancelSignal
): Promise<ExtractedEntry[]> {
  assertNotCancelled(signal)
  onProgress?.(5, 'Reading archive…')

  const archiveSize = file.size
  let guarded = 0

  const { files: manifest, contents } = await runUnzip(file, {
    keepPayload: true,
    signal,
    guard: (info) => {
      assertEntryWithinLimits(info, archiveSize)
    },
    onProgress,
  })

  if (manifest.length > ARCHIVE_LIMITS.maxEntries) {
    throw new ProcessingError(
      `This archive contains ${manifest.length} files, which is over the ${ARCHIVE_LIMITS.maxEntries} file limit.`
    )
  }
  if (!manifest.length) {
    throw new ProcessingError('This archive does not contain any files.')
  }

  assertNotCancelled(signal)
  onProgress?.(60, `Extracting ${manifest.length} file${manifest.length === 1 ? '' : 's'}…`)

  const entries: ExtractedEntry[] = []
  let total = 0

  for (const info of manifest) {
    assertNotCancelled(signal)

    // Re-validate: the payload map is keyed by the raw name, so nothing reaches
    // a Blob without passing the sanitiser again here.
    const safe = sanitizeArchivePath(info.name)
    if (!safe) {
      throw new ProcessingError(
        `This archive contains an unsafe file path ("${info.name.slice(0, 80)}") and was blocked for your security.`
      )
    }

    const bytes = contents[info.name]
    if (!bytes) {
      throw new ProcessingError('This ZIP could not be fully extracted. It may be corrupted.')
    }

    total += bytes.length
    if (total > ARCHIVE_LIMITS.maxUncompressedBytes) {
      throw new ProcessingError(
        'Extracting this archive would need more memory than this tool allows. It may be an archive bomb.'
      )
    }

    guarded++
    entries.push({ path: safe, blob: new Blob([bytes]), size: bytes.length })
    onProgress?.(60 + Math.round((guarded / manifest.length) * 38), `Extracted ${safe}`)
  }

  onProgress?.(100, 'Done')
  return entries
}

function toExtractionError(e: unknown): Error {
  if (e instanceof ProcessingError) return e
  const message = e instanceof Error ? e.message : String(e)
  if (/memory|allocat/i.test(message)) {
    return new ProcessingError(
      'This archive needs more memory than this device can give it. Try a smaller ZIP.'
    )
  }
  if (/unknown compression|invalid|unexpected|corrupt|end of data/i.test(message)) {
    return new ProcessingError(
      'This ZIP could not be extracted. It may be corrupted, or use a compression method this tool does not support.'
    )
  }
  return new ProcessingError('This ZIP could not be extracted.')
}

/**
 * Per-entry bomb guards, applied inside the unzip filter — before the entry's
 * data is decompressed into memory.
 */
function assertEntryWithinLimits(info: UnzipFileInfo, archiveSize: number): void {
  if (info.name.length > ARCHIVE_LIMITS.maxPathLength) {
    throw new ProcessingError('This archive contains a path that is too long and was blocked.')
  }
  if (sanitizeArchivePath(info.name) === null) {
    throw new ProcessingError(
      `This archive contains an unsafe file path ("${info.name.slice(0, 80)}") and was blocked for your security.`
    )
  }
  if (info.originalSize > ARCHIVE_LIMITS.maxSingleEntryBytes) {
    throw new ProcessingError(
      `A file inside this archive is larger than the ${Math.round(
        ARCHIVE_LIMITS.maxSingleEntryBytes / (1024 * 1024)
      )} MB per-file limit.`
    )
  }
  if (exceedsArchiveRatio(archiveSize, info.originalSize)) {
    throw new ProcessingError(
      'A file inside this archive expands to over 100× the whole archive and was blocked to protect your device.'
    )
  }
}

export interface ZipInspection {
  name: string
  size: number
  safe: boolean
  reason?: string
}

/**
 * List entries and their declared sizes. Names are reported as-is so the user
 * can see what an archive contains, including entries that would be refused.
 */
export async function inspectZip(file: File, signal?: CancelSignal): Promise<ZipInspection[]> {
  const { files: manifest } = await runUnzip(file, { keepPayload: false, signal })
  return manifest.map((info) => {
    const safe = sanitizeArchivePath(info.name)
    return {
      name: info.name,
      size: info.originalSize,
      safe: safe !== null,
      reason: safe === null ? 'Unsafe path — blocked from extraction' : undefined,
    }
  })
}

export type { Unzipped }