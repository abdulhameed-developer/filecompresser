import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { extractZip } from '@/lib/engines/zip'
import { createCancelSignal } from '@/lib/types'

const archive = (entries: Record<string, Uint8Array>) =>
  new File([zipSync(entries, { level: 0 })], 'batch.zip', { type: 'application/zip' })

describe('large archive batches', () => {
  it('extracts the complete 500-file boundary with exact paths and bytes', async () => {
    const sources = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [
      `folder-${index % 7}/entry-${index}.txt`,
      new TextEncoder().encode(`Original content ${index}: keep every byte.`),
    ]))
    const extracted = await extractZip(archive(sources))
    expect(extracted).toHaveLength(500)
    for (const entry of extracted) {
      expect(new Uint8Array(await entry.blob.arrayBuffer())).toEqual(sources[entry.path])
    }
  })

  it('offers no partial batch when the final stored entry fails its CRC', async () => {
    const sources = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [
      `entry-${index}.txt`, new Uint8Array([index % 256, 2, 3]),
    ]))
    const bytes = zipSync(sources, { level: 0 })
    const view = new DataView(bytes.buffer)
    let cursor = 0
    for (let index = 0; index < 500; index++) {
      const dataStart = cursor + 30 + view.getUint16(cursor + 26, true) + view.getUint16(cursor + 28, true)
      if (index === 499) bytes[dataStart] ^= 0xff
      cursor = dataStart + view.getUint32(cursor + 18, true)
    }
    await expect(extractZip(new File([bytes], 'bad-final-entry.zip'))).rejects.toThrow(/integrity check/i)
  })

  it('lets an event-loop cancellation discard a large extraction without outputs', async () => {
    const signal = createCancelSignal()
    const input = archive({ 'large.bin': new Uint8Array(12 * 1024 * 1024).fill(31) })
    let cancellation: ReturnType<typeof setTimeout> | undefined
    try {
      await expect(extractZip(input, (_percent, stage) => {
        if (stage?.startsWith('Extracting')) cancellation = setTimeout(() => signal.cancel(), 0)
      }, signal)).rejects.toMatchObject({ code: 'cancelled' })
    } finally {
      if (cancellation) clearTimeout(cancellation)
    }
  })
})
