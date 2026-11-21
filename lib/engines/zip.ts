import { unzip, zip, strFromU8, type Unzipped } from 'fflate'
import {
  ARCHIVE_LIMITS,
  assertNotCancelled,
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
interface Entry {
  name: string
  size: number
  compressed: number
  crc: number
  directory: boolean
}

/** Async fflate operations expose a terminator. Always release the cancellation listener. */
function cancellable<T>(
  start: (done: (error: Error | null, value: T) => void) => () => void,
  signal?: CancelSignal,
): Promise<T> {
  assertNotCancelled(signal)
  return new Promise((resolve, reject) => {
    let settled = false
    let stop: (() => void) | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    const finish = (error: Error | null, value?: T) => {
      if (settled) return
      settled = true
      if (timer) clearInterval(timer)
      if (error) reject(error)
      else resolve(value as T)
    }
    try {
      stop = start((error, value) => finish(error, value))
      if (signal && !settled)
        timer = setInterval(() => {
          if (!signal.cancelled) return
          stop?.()
          finish(new ProcessingError('Processing was cancelled.', 'cancelled'))
        }, 100)
    } catch (error) {
      finish(archiveError(error))
    }
  })
}

function archiveError(error: unknown): Error {
  if (error instanceof ProcessingError) return error
  return new ProcessingError(
    'This ZIP could not be processed. It may be corrupted, encrypted, or use an unsupported method.',
  )
}

export async function createZip(
  files: File[],
  options: ZipCreateOptions = {},
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<CreateZipResult> {
  assertNotCancelled(signal)
  if (!files.length)
    throw new ProcessingError('Add at least one file to create a ZIP.')
  const uncompressedSize = files.reduce((total, file) => total + file.size, 0)
  if (
    files.length > ARCHIVE_LIMITS.maxEntries ||
    uncompressedSize > ARCHIVE_LIMITS.maxBatchBytes
  ) {
    throw new ProcessingError(
      'Use at most 500 files and 300 MB in one ZIP batch.',
    )
  }
  const entries: Record<string, Uint8Array> = Object.create(null)
  const used = new Set<string>()
  for (let i = 0; i < files.length; i++) {
    assertNotCancelled(signal)
    const name = uniqueArchiveName(
      used,
      sanitizeArchivePath(flattenArchivePath(files[i].name)) || `file-${i + 1}`,
    )
    entries[name] = await blobToUint8Array(files[i])
    onProgress?.(Math.round(((i + 1) / files.length) * 40), `Adding ${name}…`)
  }
  onProgress?.(0, 'Building ZIP…')
  try {
    const bytes = await cancellable<Uint8Array>(
      (done) => zip(entries, { level: options.compressionLevel ?? 6 }, done),
      signal,
    )
    assertNotCancelled(signal)
    onProgress?.(100, 'Done')
    return {
      blob: new Blob([bytes], { type: 'application/zip' }),
      filename: 'archive.zip',
      mimeType: 'application/zip',
      fileCount: files.length,
      uncompressedSize,
    }
  } catch (error) {
    throw archiveError(error)
  }
}

export function uniqueArchiveName(used: Set<string>, base: string): string {
  if (['__proto__', 'constructor', 'prototype'].includes(base))
    base = `file-${base}`
  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const dot = base.lastIndexOf('.')
    candidate =
      dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`
    n++
  }
  used.add(candidate.toLowerCase())
  return candidate
}

/** Parse the complete central directory BEFORE asking any decoder to allocate output.
 * ZIP64, split and encrypted archives are deliberately rejected rather than partially read.
 * Directory/local header agreement prevents the decoder from seeing a different manifest.
 */
function manifest(bytes: Uint8Array, allowUnsafe = false): Entry[] {
  const fail = (
    message = 'This ZIP is corrupted or uses an unsupported archive structure.',
  ): never => {
    throw new ProcessingError(message)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (offset: number) => view.getUint16(offset, true)
  const u32 = (offset: number) => view.getUint32(offset, true)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) {
      end = i
      break
    }
  }
  if (end < 0) fail('This file is not a valid ZIP archive.')
  const count = u16(end + 10)
  const centralSize = u32(end + 12)
  const central = u32(end + 16)
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    u16(end + 8) !== count ||
    count === 65535 ||
    central === 0xffffffff ||
    centralSize === 0xffffffff
  )
    fail('Split and ZIP64 archives are not supported.')
  if (count > ARCHIVE_LIMITS.maxEntries)
    fail('This archive exceeds the 500 file limit.')
  if (central + centralSize !== end) fail()
  const entries: Entry[] = []
  const names = new Set<string>()
  const ranges: [number, number][] = []
  let cursor = central
  let total = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) fail()
    const flags = u16(cursor + 8)
    const method = u16(cursor + 10)
    const compressed = u32(cursor + 20)
    const size = u32(cursor + 24)
    const nameLength = u16(cursor + 28)
    const next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32)
    const local = u32(cursor + 42)
    if (
      next > end ||
      !nameLength ||
      size === 0xffffffff ||
      compressed === 0xffffffff ||
      u16(cursor + 34)
    )
      fail()
    if (flags & 1 || flags & 64)
      fail('Password-protected ZIP files are not supported.')
    if (method !== 0 && method !== 8)
      fail('This ZIP uses an unsupported compression method.')
    if (method === 0 && compressed !== size)
      fail('Stored ZIP entry sizes are inconsistent.')
    const raw = bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    const name = strFromU8(raw, !(flags & 2048))
    const directory = name.endsWith('/')
    if (
      names.has(name) ||
      ['__proto__', 'constructor', 'prototype'].includes(name)
    )
      fail('This ZIP contains duplicate or reserved entry names.')
    names.add(name)
    if (!allowUnsafe && sanitizeArchivePath(name) === null)
      fail('This archive contains an unsafe file path and was blocked.')
    if (size > ARCHIVE_LIMITS.maxSingleEntryBytes)
      fail(
        'A file inside this archive is larger than the 200 MB per-file limit.',
      )
    total += size
    if (total > ARCHIVE_LIMITS.maxUncompressedBytes)
      fail(
        'This archive needs more memory than this tool allows (500 MB extracted).',
      )
    // A small allowance accepts highly compressible small files, but not tiny bombs.
    if (
      size > 5 * 1024 * 1024 &&
      size / Math.max(1, compressed) > ARCHIVE_LIMITS.maxCompressionRatio
    )
      fail(
        'A file expands to over 100 times its compressed size and was blocked.',
      )
    if (
      local + 30 > central ||
      u32(local) !== 0x04034b50 ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== method ||
      u16(local + 26) !== nameLength
    )
      fail()
    const localName = bytes.subarray(local + 30, local + 30 + nameLength)
    if (
      localName.length !== raw.length ||
      !raw.every((b, n) => b === localName[n])
    )
      fail()
    const dataStart = local + 30 + nameLength + u16(local + 28)
    const dataEnd = dataStart + compressed
    if (dataStart > central || dataEnd > central) fail()
    if (
      !(flags & 8) &&
      (u32(local + 18) !== compressed ||
        u32(local + 22) !== size ||
        u32(local + 14) !== u32(cursor + 16))
    )
      fail()
    ranges.push([local, dataEnd])
    entries.push({ name, size, compressed, crc: u32(cursor + 16), directory })
    cursor = next
  }
  if (cursor !== end) fail()
  ranges.sort((a, b) => a[0] - b[0])
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i][0] < ranges[i - 1][1])
      fail('This ZIP contains overlapping entries.')
  return entries
}

async function readArchive(
  file: File,
  signal?: CancelSignal,
): Promise<Uint8Array> {
  assertNotCancelled(signal)
  if (file.size > ARCHIVE_LIMITS.maxArchiveBytes)
    throw new ProcessingError(
      'This archive is larger than the 150 MB input limit.',
    )
  const bytes = await blobToUint8Array(file)
  assertNotCancelled(signal)
  return bytes
}

// Validate integrity as well as size; the decoder alone does not check ZIP CRCs.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
async function crc32(
  bytes: Uint8Array,
  signal?: CancelSignal,
): Promise<number> {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index++) {
    crc = crcTable[(crc ^ bytes[index]) & 255] ^ (crc >>> 8)
    if (index > 0 && index % (1024 * 1024) === 0) {
      assertNotCancelled(signal)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

export async function extractZip(
  file: File,
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<ExtractedEntry[]> {
  onProgress?.(0, 'Checking archive paths, sizes and structure…')
  const bytes = await readArchive(file, signal)
  const files = manifest(bytes).filter((entry) => !entry.directory)
  if (!files.length)
    throw new ProcessingError('This archive does not contain any files.')
  onProgress?.(0, `Extracting ${files.length} files…`)
  try {
    const contents = await cancellable<Unzipped>(
      (done) =>
        unzip(bytes, { filter: (info) => !info.name.endsWith('/') }, done),
      signal,
    )
    const results: ExtractedEntry[] = []
    for (const entry of files) {
      assertNotCancelled(signal)
      const data = contents[entry.name]
      if (
        !data ||
        data.length !== entry.size ||
        (await crc32(data, signal)) !== entry.crc
      )
        throw new ProcessingError(
          'This ZIP failed its integrity check. No files were offered for download.',
        )
      results.push({
        path: sanitizeArchivePath(entry.name)!,
        size: data.length,
        blob: new Blob([data]),
      })
      // Yield between entries so cancellation remains responsive during integrity checks.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    assertNotCancelled(signal)
    onProgress?.(100, 'Done')
    return results
  } catch (error) {
    throw archiveError(error)
  }
}

export interface ZipInspection {
  name: string
  size: number
  safe: boolean
  reason?: string
}
/** Metadata-only inspection: no decompression, worker or output buffer allocation. */
export async function inspectZip(
  file: File,
  signal?: CancelSignal,
): Promise<ZipInspection[]> {
  const bytes = await readArchive(file, signal)
  return manifest(bytes, true)
    .filter((entry) => !entry.directory)
    .map((entry) => {
      const safe = sanitizeArchivePath(entry.name) !== null
      return {
        name: entry.name,
        size: entry.size,
        safe,
        reason: safe ? undefined : 'Unsafe path — blocked from extraction',
      }
    })
}
export type { Unzipped }
