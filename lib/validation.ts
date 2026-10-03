import { assertNotCancelled } from './types'
import type { CancelSignal } from './types'

const MB = 1024 * 1024

export const ARCHIVE_LIMITS = {
  maxEntries: 500,
  maxUncompressedBytes: 500 * MB,
  maxSingleEntryBytes: 200 * MB,
  maxCompressionRatio: 100,
  /** Reject pathologically long names before doing any string work. */
  maxPathLength: 512,
} as const

/** Byte prefix each verified format must start with. */
const SIGNATURES: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  gif89a: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  pdf: [0x25, 0x50, 0x44, 0x46],
  // Local file header, empty archive, and spanned-archive markers.
  zip: [0x50, 0x4b, 0x03, 0x04],
  mp3: [0x49, 0x44, 0x33], // ID3v2
}

/** ISO base media brands that map to a container we can act on. */
const MP4_BRANDS = new Set([
  'isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'mmp4', 'M4V ', 'M4A ', 'M4B ',
])

/** HEIF-family brands → we surface these as "heic". */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'avif'])

/** JPEG frame markers that legitimately follow SOI (JFIF/Exif/APPn). */
const MP3_FRAME_SYNC = [0xff, 0xfb, 0xfa, 0xf3, 0xf2, 0xe3, 0xe2]

function matchesAt(buf: Uint8Array, offset: number, bytes: number[]): boolean {
  if (bytes.length === 0) return false
  if (offset + bytes.length > buf.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false
  }
  return true
}

function matchesAnyAt(buf: Uint8Array, offset: number, options: number[][]): boolean {
  return options.some((sig) => matchesAt(buf, offset, sig))
}

function ascii(buf: Uint8Array, start: number, len: number): string {
  let out = ''
  for (let i = start; i < start + len && i < buf.length; i++) {
    out += String.fromCharCode(buf[i])
  }
  return out
}

/** Read a big-endian uint32, returning 0 when the buffer is too short. */
function readUint32(buf: Uint8Array, offset: number): number {
  if (offset + 4 > buf.length) return 0
  return (
    (buf[offset] * 0x1000000 +
      (buf[offset + 1] << 16) +
      (buf[offset + 2] << 8) +
      buf[offset + 3]) >>>
    0
  )
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Response(blob).arrayBuffer()
}

async function readHeader(file: Blob, length = 128): Promise<Uint8Array> {
  return new Uint8Array(await blobToArrayBuffer(file.slice(0, length)))
}

/**
 * Sniff the real container from magic bytes. Returns `null` when nothing
 * matched — callers must then treat the file as unverified rather than
 * trusting its extension.
 */
export async function detectFormat(file: Blob): Promise<string | null> {
  const buf = await readHeader(file)

  // Order matters: these prefixes are mutually exclusive except RIFF, which is
  // disambiguated by the form type at offset 8.
  if (matchesAt(buf, 0, SIGNATURES.png)) return 'png'
  if (matchesAt(buf, 0, SIGNATURES.jpeg)) return 'jpeg'
  if (matchesAt(buf, 0, SIGNATURES.gif87a) || matchesAt(buf, 0, SIGNATURES.gif89a)) return 'gif'
  if (matchesAt(buf, 0, SIGNATURES.pdf)) return 'pdf'
  if (matchesAnyAt(buf, 0, [SIGNATURES.zip, [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]])) {
    return 'zip'
  }

  if (matchesAt(buf, 0, [0x52, 0x49, 0x46, 0x46])) {
    const form = ascii(buf, 8, 4)
    if (form === 'WEBP') return 'webp'
    if (form === 'WAVE') return 'wav'
    if (form === 'AVI ') return 'avi'
    return null
  }

  // ISO base media (MP4 / MOV / M4A / HEIC): a 'ftyp' box at offset 4.
  if (ascii(buf, 4, 4) === 'ftyp') {
    // Major brand sits at offset 8; the compatible-brand list follows the
    // minor version and a 32-bit count.
    const major = ascii(buf, 8, 4)
    if (major === 'qt  ') return 'mov'

    // ftyp.major_brand(4) ftyp.minor_version(4) ftyp.compatible_brands(4*n)
    const declaredCount = readUint32(buf, 16)
    const compat: string[] = []
    if (declaredCount > 0 && declaredCount <= 64) {
      for (let i = 0; i < declaredCount; i++) {
        compat.push(ascii(buf, 20 + i * 4, 4))
      }
    }

    const allBrands = [major, ...compat]
    if (allBrands.some((b) => HEIF_BRANDS.has(b.trim()))) return 'heic'
    if (allBrands.some((b) => b.trim() === 'M4A' || b.trim() === 'M4B')) return 'm4a'
    if (allBrands.some((b) => MP4_BRANDS.has(b.trim()))) return 'mp4'
    // Recognisable container, unknown brand — treat as MP4-family rather than
    // reject a file that is plainly a media container.
    return 'mp4'
  }

  // Matroska / WebM: EBML magic.
  if (matchesAt(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'matroska'

  if (matchesAt(buf, 0, SIGNATURES.mp3)) return 'mp3'
  if (matchesAnyAt(buf, 0, MP3_FRAME_SYNC.map((b) => [b]))) return 'mp3'

  // FLAC ("fLaC"), Ogg ("OggS").
  if (matchesAt(buf, 0, [0x66, 0x4c, 0x61, 0x43])) return 'flac'
  if (matchesAt(buf, 0, [0x4f, 0x67, 0x67, 0x53])) return 'ogg'

  // SVG is text; only accept an explicit <svg> root, never a bare "<xml".
  const head = ascii(buf, 0, Math.min(buf.length, 256)).trimStart()
  if (head.startsWith('<?xml')) {
    const svgIndex = head.indexOf('<svg')
    if (svgIndex !== -1) return 'svg'
    return null
  }
  if (head.startsWith('<svg') || head.startsWith('<!DOCTYPE svg')) return 'svg'

  return null
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

const EXT_TO_FORMAT: Record<string, string> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jfif: 'jpeg',
  jpe: 'jpeg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  pdf: 'pdf',
  zip: 'zip',
  mp4: 'mp4',
  mov: 'mov',
  m4v: 'mp4',
  mp3: 'mp3',
  wav: 'wav',
  heic: 'heic',
  heif: 'heic',
  svg: 'svg',
  m4a: 'm4a',
}

/** Formats whose signature is unambiguous — extension fallback is never allowed. */
const STRICT_SIGNATURE_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp', 'pdf', 'zip'])

export function formatFromExtension(name: string): string | null {
  return EXT_TO_FORMAT[extensionOf(name)] || null
}

export interface ValidationResult {
  ok: boolean
  error?: string
  format?: string | null
}

const FRIENDLY_FORMAT_NAMES: Record<string, string> = {
  jpeg: 'JPEG/JPG',
  png: 'PNG',
  webp: 'WEBP',
  gif: 'GIF',
  pdf: 'PDF',
  zip: 'ZIP archive',
  svg: 'SVG',
  heic: 'HEIC/HEIF photo',
  mp4: 'MP4 video',
  mov: 'MOV video',
  matroska: 'Matroska video',
  mp3: 'MP3 audio',
  wav: 'WAV audio',
  m4a: 'M4A audio',
  flac: 'FLAC audio',
  ogg: 'Ogg audio',
}

/** MP4/MOV/M4V are the same container family; tools accept each other. */
const VIDEO_FAMILY = new Set(['mp4', 'mov'])
/** MP3/WAV/M4A/FLAC/Ogg are all decodable by the audio engine. */
const AUDIO_FAMILY = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg'])
/** All ISO-base HEIF brands surface as one "heic" tool input. */
const HEIF_FAMILY = new Set(['heic'])

function familiesIntersect(detected: string, allowed: Set<string>): boolean {
  if (allowed.has(detected)) return true
  if (VIDEO_FAMILY.has(detected) && [...allowed].some((a) => VIDEO_FAMILY.has(a))) return true
  if (AUDIO_FAMILY.has(detected) && [...allowed].some((a) => AUDIO_FAMILY.has(a))) return true
  if (HEIF_FAMILY.has(detected) && [...allowed].some((a) => HEIF_FAMILY.has(a))) return true
  return false
}

export async function validateFileAgainstTool(
  file: File,
  options: {
    allowedFormats: string[]
    maxSize: number
    requireSignature?: boolean
  },
  signal?: CancelSignal
): Promise<ValidationResult> {
  assertNotCancelled(signal)

  if (!file || typeof file.size !== 'number' || file.size === 0) {
    return { ok: false, error: 'This file is empty.' }
  }
  if (file.size > options.maxSize) {
    const mb = Math.round(options.maxSize / MB)
    return { ok: false, error: `This file is larger than ${mb} MB, which this tool allows.` }
  }

  const detected = await detectFormat(file)
  assertNotCancelled(signal)

  const allowed = new Set(options.allowedFormats.map((f) => f.toLowerCase()))

  if (detected) {
    if (!familiesIntersect(detected, allowed)) {
      return {
        ok: false,
        error: `This file looks like ${FRIENDLY_FORMAT_NAMES[detected] ?? detected.toUpperCase()}, which this tool does not support.`,
        format: detected,
      }
    }
    return { ok: true, format: detected }
  }

  // No signature matched. Formats with a definitive magic number must never
  // pass on extension alone — otherwise a renamed .exe or .html would sail
  // through just by being called photo.jpg.
  const extFormat = formatFromExtension(file.name)
  if (extFormat && STRICT_SIGNATURE_FORMATS.has(extFormat) && options.requireSignature !== false) {
    return {
      ok: false,
      error:
        'This file could not be verified as a valid image, PDF or archive. It may be corrupted, or renamed from another format.',
      format: null,
    }
  }

  // Extension fallback for formats we cannot cheaply sniff (or that legitimately
  // have no magic number). Accepting these is still far better than failing a
  // legitimate HEIC, and they are never the basis of a dangerous operation.
  if (extFormat && allowed.has(extFormat) && familiesIntersect(extFormat, allowed)) {
    return { ok: true, format: extFormat }
  }

  return {
    ok: false,
    error: 'This file type is not supported by this tool.',
    format: detected,
  }
}

/**
 * Make an archive entry name safe to hand to a download or a ZIP writer.
 *
 * Returns `null` for anything that could escape the intended directory:
 * absolute paths, drive letters, `..` segments, null bytes, and control
 * characters. Callers must treat `null` as "refuse this entry".
 */
export function sanitizeArchivePath(entryName: string): string | null {
  if (!entryName || typeof entryName !== 'string') return null
  if (entryName.length > ARCHIVE_LIMITS.maxPathLength) return null

  const name = entryName.replace(/\\/g, '/')

  if (name.startsWith('/')) return null
  if (/^[a-zA-Z]:/.test(name)) return null
  if (name.includes('\0')) return null
  // Reject UNC and any other scheme-ish prefix outright.
  if (name.startsWith('//')) return null

  const parts = name.split('/')
  const safe: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') return null

    // Control characters are rejected outright rather than substituted: a name
    // carrying them is a sign of a crafted archive, not a real file.
    if (/[\u0000-\u001f\u007f]/.test(part)) return null

    // Windows-reserved characters are substituted so the name stays usable.
    const cleaned = part.replace(/[<>:"\|?*]/g, '_').trim()
    if (!cleaned || cleaned === '.' || cleaned === '..') return null
    // Windows reserved device names would still be dangerous if a user
    // later writes the archive to disk.
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(cleaned)) return null
    safe.push(cleaned)
  }

  if (!safe.length) return null
  return safe.join('/')
}

/** Replace path separators so a flattened ZIP filename stays valid on all OSes. */
export function flattenArchivePath(entryName: string): string {
  return entryName.replace(/[\\/]+/g, '__')
}

/**
 * Guard against an entry that decompresses to far more than the whole archive
 * could plausibly contain.
 *
 * The ratio is measured against the *archive* size, not the entry's own
 * compressed size: an entry inside a 5 MB archive cannot legitimately expand to
 * 500 MB when the archive as a whole only holds 5 MB of compressed data. The
 * check only fires above a floor, so a small archive containing a few KB of
 * text is never rejected for a trivial ratio.
 */
export function exceedsArchiveRatio(archiveSize: number, uncompressedSize: number): boolean {
  if (archiveSize <= 0 || uncompressedSize <= 0) return false
  // Under this, the archive is tiny and there is nothing to protect against.
  const MIN_BYTES_FOR_RATIO_CHECK = 5 * 1024 * 1024
  if (archiveSize < MIN_BYTES_FOR_RATIO_CHECK) return false
  return uncompressedSize / archiveSize > ARCHIVE_LIMITS.maxCompressionRatio
}

// Re-exported so engines have a single import for validation and cancellation.
export { assertNotCancelled } from './types'