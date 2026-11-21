import { engineResponse } from '@/lib/engine-response'
import { PDFDocument } from 'pdf-lib'
import { compressPdf } from '@/lib/engines/pdf'
import { describe, it, expect, vi } from 'vitest'
import { zipSync } from 'fflate'
import { detectFormat, validateFileAgainstTool } from '@/lib/validation'
import { createCancelSignal, listenForCancellation } from '@/lib/types'
import { withMediaLock, processFile } from '@/lib/process'
import { extractZip, inspectZip, createZip } from '@/lib/engines/zip'

const file = (bytes: Uint8Array, name = 'fixture.zip') =>
  new File([bytes], name)

describe('strict signatures', () => {
  it('rejects enormous PNG dimensions before any image decoder is invoked', async () => {
    const bytes = new Uint8Array(24)
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(bytes.buffer)
    view.setUint32(16, 40000)
    view.setUint32(20, 40000)
    const result = await validateFileAgainstTool(file(bytes, 'huge.png'), {
      allowedFormats: ['png'],
      maxSize: 1000,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/32 megapixel/)
  })
  it.each([0xff, 0xfb, 0xfa, 0xf3, 0xf2, 0xe3, 0xe2])(
    'refuses a single sync-like byte %s even when renamed MP3',
    async (byte) => {
      expect(
        (
          await validateFileAgainstTool(
            file(new Uint8Array([byte]), 'fake.mp3'),
            { allowedFormats: ['mp3'], maxSize: 100 },
          )
        ).ok,
      ).toBe(false)
    },
  )
  it('recognizes a complete MPEG Layer III header but rejects reserved fields', async () => {
    expect(
      await detectFormat(file(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))),
    ).toBe('mp3')
    expect(
      await detectFormat(file(new Uint8Array([0xff, 0xfb, 0xf0, 0]))),
    ).toBeNull()
    expect(
      await detectFormat(file(new Uint8Array([0xff, 0xfb, 0x9c, 0]))),
    ).toBeNull()
  })
  it('reads compatible brands from the ftyp box without an invented count', async () => {
    const bytes = new Uint8Array([
      0,
      0,
      0,
      24,
      ...new TextEncoder().encode('ftypzzzz'),
      0,
      0,
      0,
      0,
      ...new TextEncoder().encode('M4A isom'),
    ])
    expect(await detectFormat(file(bytes))).toBe('m4a')
  })
})

describe('archive preflight and output integrity', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])(
    'rejects a truncated ZIP end record missing %s bytes', async removed => {
      const bytes = zipSync({ 'content.txt': new Uint8Array([1, 2, 3]) })
      // No complete EOCD remains, even if most of the archive payload is valid.
      await expect(inspectZip(file(bytes.slice(0, bytes.length - removed - 1)))).rejects.toThrow()
    },
  )

  it('creates safe round-trippable names for reserved object properties', async () => {
    const created = await createZip(
      ['__proto__', 'constructor', 'prototype'].map((name) =>
        file(new Uint8Array([1]), name),
      ),
    )
    const entries = await extractZip(new File([created.blob], 'archive.zip'))
    expect(entries).toHaveLength(3)
    expect(entries.every((entry) => entry.path.startsWith('file-'))).toBe(true)
  })
  it('checks the complete declared total before a decoder allocates payloads', async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [`${i}.bin`, new Uint8Array([1])]),
    )
    const bytes = zipSync(entries)
    const view = new DataView(bytes.buffer)
    for (let offset = 0; offset + 46 < bytes.length; offset++)
      if (view.getUint32(offset, true) === 0x02014b50) {
        const local = view.getUint32(offset + 42, true)
        view.setUint32(offset + 24, 5 * 1024 * 1024, true)
        view.setUint32(local + 22, 5 * 1024 * 1024, true)
      }
    await expect(extractZip(file(bytes))).rejects.toThrow(/more memory.*500 MB/)
  })
  it('rejects excessive entry count on a tiny archive', async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [`${i}.txt`, new Uint8Array()]),
    )
    await expect(extractZip(file(zipSync(entries)))).rejects.toThrow(
      /500 file limit/,
    )
  })
  it('does not inflate during inspection: a corrupt compressed stream still has inspectable metadata', async () => {
    const bytes = zipSync({ 'hello.txt': new Uint8Array(1000).fill(65) })
    const nameLength = new DataView(bytes.buffer).getUint16(26, true)
    bytes[30 + nameLength] ^= 0xff
    expect(await inspectZip(file(bytes))).toEqual([
      { name: 'hello.txt', size: 1000, safe: true, reason: undefined },
    ])
    await expect(extractZip(file(bytes))).rejects.toThrow()
  })
  it('rejects CRC corruption on stored entries', async () => {
    const bytes = zipSync({ 'a.txt': new Uint8Array([1, 2, 3]) }, { level: 0 })
    bytes[35] ^= 0xff
    await expect(extractZip(file(bytes))).rejects.toThrow(/integrity/i)
  })
  it('refuses encrypted or inconsistent headers before decoding', async () => {
    const bytes = zipSync({ 'a.txt': new Uint8Array([1]) })
    bytes[6] = 1
    await expect(extractZip(file(bytes))).rejects.toThrow(
      /corrupt|unsupported/i,
    )
  })
  it('limits tiny archive bombs using each entry compressed size', async () => {
    const bytes = zipSync({ 'bomb.bin': new Uint8Array(6 * 1024 * 1024) })
    await expect(extractZip(file(bytes))).rejects.toThrow(/100 times/)
  })
  it('deduplicates flattened extraction filenames', async () => {
    const bytes = zipSync({
      'a/b.txt': new Uint8Array([1]),
      'a__b.txt': new Uint8Array([2]),
    })
    const outputs = await processFile({
      engine: 'zip-extract',
      file: file(bytes),
      options: {},
    })
    expect(
      Array.isArray(outputs) &&
        new Set(outputs.map((output) => output.filename)).size,
    ).toBe(2)
  })
  it('rejects an oversized batch before reading input bytes', async () => {
    const input = file(new Uint8Array([1]))
    Object.defineProperty(input, 'size', { value: 301 * 1024 * 1024 })
    const read = vi.spyOn(input, 'arrayBuffer')
    await expect(createZip([input])).rejects.toThrow(/300 MB/)
    expect(read).not.toHaveBeenCalled()
  })
})

describe('cancellation and shared media ownership', () => {
  it('releases cancellation subscribers on success', () => {
    const signal = createCancelSignal(),
      listener = vi.fn()
    const release = listenForCancellation(signal, listener)
    release()
    signal.cancel()
    expect(listener).not.toHaveBeenCalled()
  })
  it('serializes jobs and skips cancelled work waiting for the shared engine', async () => {
    let finish!: () => void
    const events: string[] = []
    const first = withMediaLock(async () => {
      events.push('first')
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      events.push('released')
    })
    await Promise.resolve()
    const signal = createCancelSignal()
    const work = vi.fn(async () => {
      events.push('second')
    })
    const second = withMediaLock(work, signal)
    const rejected = expect(second).rejects.toThrow(/cancelled/)
    signal.cancel()
    finish()
    await first
    await rejected
    expect(work).not.toHaveBeenCalled()
    expect(events).toEqual(['first', 'released'])
  })
})

it('names PDF output from its actual format even when the source extension is wrong', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  const result = await compressPdf(
    new File([await document.save()], 'misnamed.jpg'),
  )
  expect(result.filename).toBe('misnamed-compressed.pdf')
  expect(
    (await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount(),
  ).toBe(1)
})

describe('engine cache validation', () => {
  it('returns a stable ETag and 304 without a response body for unchanged code', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const first = engineResponse(
      new Request('https://example.test/core'),
      bytes,
      'application/wasm',
    )
    const cached = engineResponse(
      new Request('https://example.test/core', {
        headers: { 'if-none-match': first.headers.get('etag')! },
      }),
      bytes,
      'application/wasm',
    )
    expect(cached.status).toBe(304)
    expect((await cached.arrayBuffer()).byteLength).toBe(0)
  })
  it('returns new code when deployment content changes', () => {
    const first = engineResponse(
      new Request('https://example.test/core'),
      new Uint8Array([1]),
      'application/wasm',
    )
    const next = engineResponse(
      new Request('https://example.test/core', {
        headers: { 'if-none-match': first.headers.get('etag')! },
      }),
      new Uint8Array([2]),
      'application/wasm',
    )
    expect(next.status).toBe(200)
    expect(next.headers.get('etag')).not.toBe(first.headers.get('etag'))
  })
})
