import { describe, expect, it } from 'vitest'
import { applyResultPolicy, unchangedResult } from '@/lib/result-policy'
import type { ProcessedResult } from '@/lib/types'

const input = () => new File([new Uint8Array([1, 2, 3, 4])], 'original.mp3', { type: 'audio/mpeg' })
const candidate = (size: number): ProcessedResult => ({ blob: new Blob([new Uint8Array(size)], { type: 'audio/mpeg' }), filename: 'encoded.mp3', mimeType: 'audio/mpeg' })
describe('honest reduction and explicit transformation policy', () => {
  it.each([4, 5, 100])('retains the exact original for a non-beneficial %s-byte reduction candidate', async size => {
    const original = input()
    const result = applyResultPolicy(original, candidate(size))
    expect(result.outcome).toBe('unchanged')
    expect(result.filename).toBe(original.name)
    expect(result.blob.size).toBe(original.size)
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()))
    expect(result.note).toMatch(/0% reduction/)
  })
  it('keeps a genuinely smaller result and its real filename', () => {
    const result = applyResultPolicy(input(), candidate(2))
    expect(result.outcome).toBe('reduced')
    expect(result.blob.size).toBe(2)
    expect(result.filename).toBe('encoded.mp3')
  })
  it.each(['convert', 'resize'] as const)('does not replace an explicit %s operation with the source merely because it is larger', operation => {
    const result = applyResultPolicy(input(), candidate(20), operation)
    expect(result.outcome).toBe(operation === 'convert' ? 'converted' : 'resized')
    expect(result.blob.size).toBe(20)
    expect(result.filename).toBe('encoded.mp3')
  })
  it('sets a verified MIME type without changing original bytes or filename', async () => {
    const original = new File(['original bytes'], 'sound.mp3', { type: 'application/octet-stream' })
    const result = unchangedResult(original, 'audio/mpeg')
    expect(result.blob.type).toBe('audio/mpeg')
    expect(result.mimeType).toBe('audio/mpeg')
    expect(result.filename).toBe(original.name)
    expect(await result.blob.text()).toBe(await original.text())
  })
})
