import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { createZip, extractZip } from '@/lib/engines/zip'

const file = (bytes: Uint8Array) => new File([bytes], 'source.zip', { type: 'application/zip' })

describe('archive input error classification', () => {
  it('identifies a permanently unsafe manifest without decompressing it', async () => {
    const bytes = zipSync({ '../unsafe.txt': new Uint8Array([1]) })
    await expect(extractZip(file(bytes))).rejects.toMatchObject({ code: 'archive-invalid' })
  })
  it('identifies an empty archive separately from an empty file entry', async () => {
    await expect(extractZip(file(zipSync({})))).rejects.toMatchObject({ code: 'archive-empty' })
  })
  it('identifies a failed stored-entry CRC as an immutable integrity failure', async () => {
    const bytes = zipSync({ 'safe.txt': new Uint8Array([1, 2, 3]) }, { level: 0 })
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    bytes[30 + view.getUint16(26, true) + view.getUint16(28, true)] ^= 0xff
    await expect(extractZip(file(bytes))).rejects.toMatchObject({ code: 'archive-integrity' })
  })
})

describe('valid zero-byte ZIP entries', () => {
  it.each([false, true])('roundtrips an empty file without dropping it (mixed: %s)', async mixed => {
    const files = [new File([], 'empty.txt')]
    if (mixed) files.push(new File(['keep every byte'], 'data.txt'))
    const result = await createZip(files)
    expect(result.fileCount).toBe(files.length)
    expect(result.blob.size).toBeGreaterThan(0)
    const outputs = await extractZip(new File([result.blob], 'created.zip'))
    expect(outputs.map(output => output.path)).toEqual(files.map(source => source.name))
    for (const output of outputs) expect(new Uint8Array(await output.blob.arrayBuffer())).toEqual(new Uint8Array(await files.find(source => source.name === output.path)!.arrayBuffer()))
    expect(outputs.find(output => output.path === 'empty.txt')?.size).toBe(0)
  })
})
