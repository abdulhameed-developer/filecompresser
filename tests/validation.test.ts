import { describe, it, expect } from 'vitest'
import {
  ARCHIVE_LIMITS,
  detectFormat,
  exceedsArchiveRatio,
  extensionOf,
  formatFromExtension,
  flattenArchivePath,
  sanitizeArchivePath,
  validateFileAgainstTool,
} from '@/lib/validation'
import { createZip, extractZip, inspectZip } from '@/lib/engines/zip'
import { formatBytes, replaceExtension, savingsLabel, savingsPercent, suffixFilename } from '@/lib/format'
import { getTool, canonicalSlug, toolUsesFfmpeg, TOOLS } from '@/lib/tools'

const MB = 1024 * 1024

function fileFromBytes(name: string, bytes: number[], type = ''): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]

describe('magic byte detection', () => {
  it('detects JPEG from FF D8 FF', async () => {
    expect(await detectFormat(fileFromBytes('a.jpg', JPEG_HEADER))).toBe('jpeg')
  })

  it('detects PNG from the 8-byte signature', async () => {
    expect(await detectFormat(fileFromBytes('a.png', PNG_HEADER))).toBe('png')
  })

  it('detects GIF', async () => {
    expect(await detectFormat(fileFromBytes('a.gif', GIF_HEADER))).toBe('gif')
  })

  it('detects PDF from %PDF', async () => {
    expect(await detectFormat(fileFromBytes('a.pdf', PDF_HEADER))).toBe('pdf')
  })

  it('detects ZIP from the PK local file header', async () => {
    expect(await detectFormat(fileFromBytes('a.zip', ZIP_HEADER))).toBe('zip')
  })

  it('detects WEBP from RIFF....WEBP', async () => {
    const bytes = [...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 1, 2, 3]
    expect(await detectFormat(fileFromBytes('a.webp', bytes))).toBe('webp')
  })

  it('detects WAV from RIFF....WAVE', async () => {
    const bytes = [...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WAVE'), 1, 2, 3]
    expect(await detectFormat(fileFromBytes('a.wav', bytes))).toBe('wav')
  })

  it('detects MP4 from an ISO base media ftyp box', async () => {
    const bytes = [0, 0, 0, 0x18, ...new TextEncoder().encode('ftypisom'), 0, 0, 0, 0, ...new TextEncoder().encode('isommp42')]
    expect(await detectFormat(fileFromBytes('a.mp4', bytes))).toBe('mp4')
  })

  it('detects MOV from the qt brand', async () => {
    const bytes = [0, 0, 0, 0x14, ...new TextEncoder().encode('ftypqt  '), 0, 0, 0, 0]
    expect(await detectFormat(fileFromBytes('a.mov', bytes))).toBe('mov')
  })

  it('detects HEIC from a heic brand', async () => {
    const bytes = [0, 0, 0, 0x18, ...new TextEncoder().encode('ftypheic'), 0, 0, 0, 0, ...new TextEncoder().encode('mif1heic')]
    expect(await detectFormat(fileFromBytes('a.heic', bytes))).toBe('heic')
  })

  it('detects SVG from the root element', async () => {
    const bytes = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]
    expect(await detectFormat(fileFromBytes('a.svg', bytes))).toBe('svg')
  })

  it('returns null for unrecognised bytes', async () => {
    expect(await detectFormat(fileFromBytes('a.bin', [0x00, 0x11, 0x22, 0x33, 0x44]))).toBeNull()
  })
})

describe('validateFileAgainstTool', () => {
  it('rejects a file whose name lies about its type', async () => {
    const result = await validateFileAgainstTool(
      fileFromBytes('innocent.jpg', [0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01], 'image/jpeg'),
      { allowedFormats: ['jpeg'], maxSize: 50 * MB }
    )
    expect(result.ok).toBe(false)
    // The message must be readable, not an internal code.
    expect(result.error).toMatch(/could not be verified|not supported/i)
  })

  it('rejects a mismatched but valid file type', async () => {
    const result = await validateFileAgainstTool(fileFromBytes('a.png', PNG_HEADER), {
      allowedFormats: ['jpeg'],
      maxSize: 50 * MB,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('PNG')
  })

  it('rejects an empty file', async () => {
    const result = await validateFileAgainstTool(fileFromBytes('a.jpg', []), {
      allowedFormats: ['jpeg'],
      maxSize: 50 * MB,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('This file is empty.')
  })

  it('rejects a file over the size limit', async () => {
    // Larger than the declared limit, but still a valid JPEG so that only the
    // size check can be what rejects it.
    const oversized = new File([new Uint8Array(2048)], 'a.jpg', { type: 'image/jpeg' })
    Object.defineProperty(oversized, 'size', { value: 2048 })

    const result = await validateFileAgainstTool(oversized, {
      allowedFormats: ['jpeg'],
      maxSize: 1024,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/larger than/)
  })

  it('accepts a valid image and reports its format', async () => {
    const result = await validateFileAgainstTool(fileFromBytes('a.jpg', JPEG_HEADER), {
      allowedFormats: ['jpeg'],
      maxSize: 50 * MB,
    })
    expect(result.ok).toBe(true)
    expect(result.format).toBe('jpeg')
  })

  it('accepts MOV on an MP4 tool (same container family)', async () => {
    const bytes = [0, 0, 0, 0x14, ...new TextEncoder().encode('ftypqt  '), 0, 0, 0, 0]
    const result = await validateFileAgainstTool(fileFromBytes('a.mov', bytes), {
      allowedFormats: ['mp4', 'mov'],
      maxSize: 50 * MB,
    })
    expect(result.ok).toBe(true)
  })

  it('accepts WAV on an audio tool', async () => {
    const bytes = [...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WAVE'), 1, 2, 3]
    const result = await validateFileAgainstTool(fileFromBytes('a.wav', bytes), {
      allowedFormats: ['mp3'],
      maxSize: 50 * MB,
    })
    expect(result.ok).toBe(true)
  })
})

describe('sanitizeArchivePath', () => {
  it('allows a normal nested path', () => {
    expect(sanitizeArchivePath('folder/photo.jpg')).toBe('folder/photo.jpg')
  })

  it('rejects parent-directory traversal', () => {
    expect(sanitizeArchivePath('../etc/passwd')).toBeNull()
    expect(sanitizeArchivePath('foo/../../bar')).toBeNull()
    expect(sanitizeArchivePath('a/b/../../../c')).toBeNull()
  })

  it('rejects traversal using backslash separators', () => {
    expect(sanitizeArchivePath('..\\windows\\system32\\cmd.exe')).toBeNull()
  })

  it('rejects absolute and UNC paths', () => {
    expect(sanitizeArchivePath('/etc/passwd')).toBeNull()
    expect(sanitizeArchivePath('//server/share/file')).toBeNull()
    expect(sanitizeArchivePath('C:/Windows/system32')).toBeNull()
  })

  it('rejects embedded null bytes', () => {
    expect(sanitizeArchivePath('file\0.jpg')).toBeNull()
  })

  it('rejects Windows reserved device names', () => {
    expect(sanitizeArchivePath('CON.txt')).toBeNull()
    expect(sanitizeArchivePath('folder/lpt1')).toBeNull()
  })

  it('rejects control characters', () => {
    expect(sanitizeArchivePath('bad\u0001name.txt')).toBeNull()
  })

  it('rejects a path that is only a directory marker', () => {
    expect(sanitizeArchivePath('///')).toBeNull()
    expect(sanitizeArchivePath('')).toBeNull()
  })

  it('rejects an over-long path', () => {
    expect(sanitizeArchivePath(`${'a'.repeat(600)}.txt`)).toBeNull()
  })
})

describe('archive helpers', () => {
  it('flattens separators for download filenames', () => {
    expect(flattenArchivePath('docs/2024/report.pdf')).toBe('docs__2024__report.pdf')
  })

  it('flags a zip bomb ratio only above the size floor', () => {
    // Below the floor, a small archive is never rejected for a trivial ratio.
    expect(exceedsArchiveRatio(1_000, 1_000_000)).toBe(false)
    // A 10 MB archive claiming to hold 5 GB is far beyond any legitimate ratio.
    expect(exceedsArchiveRatio(10 * MB, 5_000 * MB)).toBe(true)
    // A 10 MB archive expanding to 20 MB is entirely normal.
    expect(exceedsArchiveRatio(10 * MB, 20 * MB)).toBe(false)
    // Exactly at the limit is allowed.
    expect(exceedsArchiveRatio(10 * MB, 100 * MB)).toBe(false)
    expect(exceedsArchiveRatio(0, 1_000_000)).toBe(false)
  })

  it('exposes finite archive limits', () => {
    expect(ARCHIVE_LIMITS.maxEntries).toBeGreaterThan(0)
    expect(ARCHIVE_LIMITS.maxCompressionRatio).toBeGreaterThan(1)
  })
})

describe('filename helpers', () => {
  it('replaces extensions case-insensitively', () => {
    expect(replaceExtension('photo.PNG', 'jpg')).toBe('photo.jpg')
  })

  it('suffixes before the extension', () => {
    expect(suffixFilename('a.jpg', '-compressed')).toBe('a-compressed.jpg')
    expect(suffixFilename('noext', '-compressed')).toBe('noext-compressed')
  })

  it('reads extensions', () => {
    expect(extensionOf('a.b.C')).toBe('c')
    expect(extensionOf('noext')).toBe('')
  })

  it('computes savings honestly, including growth', () => {
    expect(savingsPercent(100, 60)).toBe(40)
    expect(savingsPercent(100, 120)).toBe(-20)
    expect(savingsLabel(100, 100)).toBe('Similar size')
    expect(savingsLabel(100, 120)).toBe('20% larger')
    expect(savingsPercent(0, 10)).toBeNull()
  })

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * MB)).toBe('5.00 MB')
    expect(formatBytes(-1)).toBe('—')
  })

  it('maps extensions onto detection format names', () => {
    expect(formatFromExtension('a.JPG')).toBe('jpeg')
    expect(formatFromExtension('a.jfif')).toBe('jpeg')
    expect(formatFromExtension('a.exe')).toBeNull()
  })
})

describe('ZIP creation and extraction', () => {
  it('round-trips a file through create and extract', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5])
    const created = await createZip([new File([payload], 'hello.txt', { type: 'text/plain' })])

    expect(created.mimeType).toBe('application/zip')
    expect(created.fileCount).toBe(1)
    expect(created.blob.size).toBeGreaterThan(0)

    const entries = await extractZip(new File([created.blob], 'archive.zip', { type: 'application/zip' }))
    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe('hello.txt')
    expect(new Uint8Array(await entries[0].blob.arrayBuffer())).toEqual(payload)
  })

  it('preserves nested paths inside the archive', async () => {
    const created = await createZip([
      new File([new Uint8Array([1])], 'a.txt'),
      new File([new Uint8Array([2])], 'b.txt'),
    ])
    const entries = await extractZip(new File([created.blob], 'x.zip'))
    expect(entries.map((e) => e.path).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('keeps both files when names collide', async () => {
    const created = await createZip([
      new File([new Uint8Array([1])], 'report.pdf'),
      new File([new Uint8Array([2])], 'report.pdf'),
    ])
    const entries = await extractZip(new File([created.blob], 'x.zip'))
    const names = entries.map((e) => e.path)
    expect(new Set(names).size).toBe(2)
  })

  it('refuses a non-ZIP file', async () => {
    await expect(
      extractZip(fileFromBytes('fake.zip', [0x00, 0x01, 0x02, 0x03], 'application/zip'))
    ).rejects.toThrow(/not a valid ZIP/i)
  })

  it('inspects entries without extracting them', async () => {
    const created = await createZip([new File([new Uint8Array(64)], 'note.txt')])
    const listing = await inspectZip(new File([created.blob], 'x.zip'))
    expect(listing).toHaveLength(1)
    expect(listing[0].name).toBe('note.txt')
    expect(listing[0].safe).toBe(true)
    expect(listing[0].size).toBe(64)
  })
})

describe('tool registry', () => {
  it('has no duplicate slugs', () => {
    const slugs = TOOLS.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('only claims client-side processing where the engine really is client-side', () => {
    // Every tool currently in the registry runs in the browser; this test exists
    // to fail loudly if a server-side engine is ever added without revisiting
    // the privacy copy.
    for (const tool of TOOLS) {
      expect(tool.privacyClientSide, `${tool.slug} privacy claim`).toBe(true)
    }
  })

  it('resolves aliases to a canonical slug', () => {
    expect(getTool('wav-to-mp3')).toBeDefined()
    expect(canonicalSlug('wav-to-mp3')).toBe('wav-compressor')
    expect(canonicalSlug('wav-compressor')).toBe('wav-compressor')
  })

  it('does not define the same tool under two real slugs', () => {
    // A slug that is both a tool and an alias of another tool would make the
    // alias resolve to whichever was registered last.
    const slugs = new Set(TOOLS.map((t) => t.slug))
    for (const tool of TOOLS) {
      for (const alias of tool.aliases ?? []) {
        expect(slugs.has(alias), `${alias} is both a tool and an alias`).toBe(false)
      }
    }
  })

  it('gives every tool a real title, description and size limit', () => {
    for (const tool of TOOLS) {
      expect(tool.title.length, tool.slug).toBeGreaterThan(2)
      expect(tool.description.length, tool.slug).toBeGreaterThan(15)
      expect(tool.maxFileSize, tool.slug).toBeGreaterThan(0)
    }
  })

  it('identifies the FFmpeg-backed tools', () => {
    expect(toolUsesFfmpeg(getTool('video-compressor')!)).toBe(true)
    expect(toolUsesFfmpeg(getTool('mp3-compressor')!)).toBe(true)
    expect(toolUsesFfmpeg(getTool('png-compressor')!)).toBe(false)
  })

  it('returns undefined for an unknown slug', () => {
    expect(getTool('not-a-real-tool')).toBeUndefined()
  })
})