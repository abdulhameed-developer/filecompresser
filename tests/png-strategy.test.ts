import { describe, expect, it, vi } from 'vitest'
import UPNG from '@pdf-lib/upng'
import { deflateSync } from 'node:zlib'
import { choosePngCandidate, createPngComparison, PNG_COLOR_LIMITS, pngDecodedSamplesEqual, pngModeFor, pngOriginalSamplesEqual, pngQualityAccepted, quantizePngPixels } from '../workers/image-png.mjs'
import { inspectImageHeader } from '../workers/image-metadata.mjs'
import { runImagePipeline } from '../workers/image-pipeline.mjs'

function metrics(original: Uint8Array, output: Uint8Array) {
  const comparison = createPngComparison()
  comparison.add(original, output)
  return comparison.result()
}
const fidelity = (psnr = Infinity, maximumError = 0, pixelsEqual = false) => ({ pixelsEqual, alphaEqual: true, compositePsnr: psnr, compositeMaximumError: maximumError })
function pngChunk(name: string, payload: Uint8Array) {
  const body = Buffer.concat([Buffer.from(name), payload])
  let crc = 0xffffffff
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1 }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4)
  length.writeUInt32BE(payload.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, body, checksum])
}

describe('real PNG color reduction and alpha preservation', () => {
  it('quantizes premultiplied appearance while retaining every original alpha byte', () => {
    const source = new Uint8Array(256 * 64 * 4)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) {
      const offset = (y * 256 + x) * 4
      source.set([x, y * 4, 255 - x, x], offset)
    }
    const reduced = quantizePngPixels(source, 64, UPNG)
    expect(reduced.length).toBe(source.length)
    expect(reduced.some((value: number, index: number) => index % 4 !== 3 && value !== source[index])).toBe(true)
    for (let i = 3; i < source.length; i += 4) expect(reduced[i]).toBe(source[i])
    expect(metrics(source, reduced).alphaEqual).toBe(true)
  })

  it('produces a real decodable PNG with the requested dimensions and exact quantized RGBA', async () => {
    const source = new Uint8Array(128 * 64 * 4)
    for (let i = 0; i < source.length; i += 4) source.set([i % 256, (i / 4) % 256, 80, (i / 4) % 256], i)
    const reduced = quantizePngPixels(source, 32, UPNG)
    const bytes = UPNG.encode([reduced.buffer], 128, 64, 0)
    const decoded = UPNG.decode(bytes)
    expect(new Uint8Array(UPNG.toRGBA8(decoded)[0])).toEqual(reduced)
    expect(await inspectImageHeader(new Blob([bytes], { type: 'image/png' }))).toMatchObject({ format: 'png', width: 128, height: 64 })
  })

  it('measures visible error over both black and white and rejects any altered alpha', () => {
    const source = new Uint8Array([255, 0, 0, 0, 200, 100, 50, 128, 5, 5, 5, 255])
    const invisibleRgb = source.slice(); invisibleRgb[0] = 0
    const invisible = metrics(source, invisibleRgb)
    expect(invisible.compositePsnr).toBe(Infinity)
    expect(invisible.alphaEqual).toBe(true)
    expect(invisible.pixelsEqual).toBe(false)
    const alteredAlpha = source.slice(); alteredAlpha[7] = 127
    const changed = metrics(source, alteredAlpha)
    expect(changed.alphaEqual).toBe(false)
    expect(pngQualityAccepted(changed, 'maximum')).toBe(false)
  })

  it('applies distinct numerical guards without pretending they guarantee appearance', () => {
    expect(pngQualityAccepted(fidelity(36, 20), 'smart')).toBe(false)
    expect(pngQualityAccepted(fidelity(36, 20), 'maximum')).toBe(true)
    expect(pngQualityAccepted(fidelity(42, 37), 'smart')).toBe(false)
    expect(pngQualityAccepted(fidelity(35, 65), 'target')).toBe(false)
  })

  it('checks cancellation around real quantization work', () => {
    expect(() => quantizePngPixels(new Uint8Array(64), 16, UPNG, () => true)).toThrow('cancelled')
  })

  it('proves original16-bit samples separately from lossy8-bit browser previews', async () => {
    const samples = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0xab, 0xcd, 0x23, 0x45, 0x67, 0x89, 0x01, 0x23])
    const png16 = (raw: Uint8Array) => {
      const header = Buffer.alloc(13)
      header.writeUInt32BE(2, 0); header.writeUInt32BE(1, 4); header[8] = 16; header[9] = 6
      return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.concat([Buffer.from([0]), raw]))), pngChunk('IEND', new Uint8Array())]))
    }
    const original = png16(samples)
    expect(await inspectImageHeader(new Blob([original]))).toMatchObject({ format: 'png', bitDepth: 16, width: 2, height: 1 })
    expect(pngOriginalSamplesEqual(original, original.slice(), UPNG)).toBe(true)
    for (const index of [1, 15]) {
      const altered = samples.slice(); altered[index]++
      const changedLowBit = png16(altered)
      expect(UPNG.toRGBA8(UPNG.decode(original.buffer))[0]).toEqual(UPNG.toRGBA8(UPNG.decode(changedLowBit.buffer))[0])
      expect(pngOriginalSamplesEqual(original, changedLowBit, UPNG)).toBe(false)
    }
    const normalized8Bit = new Uint8Array(UPNG.encode([UPNG.toRGBA8(UPNG.decode(original.buffer))[0]], 2, 1, 0))
    expect(pngOriginalSamplesEqual(original, normalized8Bit, UPNG)).toBe(false)
    const nearOpaqueSamples = samples.slice()
    nearOpaqueSamples.set([255, 254], 6); nearOpaqueSamples.set([255, 254], 14)
    const nearOpaque = png16(nearOpaqueSamples)
    const eightBitPreview = new Uint8Array(UPNG.toRGBA8(UPNG.decode(nearOpaque.buffer))[0])
    expect(eightBitPreview[3]).toBe(255); expect(eightBitPreview[7]).toBe(255)
    expect(await inspectImageHeader(new Blob([nearOpaque]))).toMatchObject({ jpegPrecisionSafe: false })
    const decoder = vi.fn()
    await expect(runImagePipeline(new File([nearOpaque], 'near-opaque16.png', { type: 'image/png' }), { outputFormat: 'jpeg' }, { decode: decoder })).rejects.toMatchObject({ code: 'image-precision' })
    expect(decoder).not.toHaveBeenCalled()
  })

  it('includes palette/transparency values in exact-source proof and recognizes gamma color encoding', async () => {
    const indexed = (red: number, alpha: number) => {
      const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 3
      return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('gAMA', new Uint8Array([0, 1, 134, 160])), pngChunk('PLTE', new Uint8Array([red, 40, 60])), pngChunk('tRNS', new Uint8Array([alpha])), pngChunk('IDAT', deflateSync(new Uint8Array([0, 0]))), pngChunk('IEND', new Uint8Array())]))
    }
    const original = indexed(20, 128)
    expect(await inspectImageHeader(new Blob([original]))).toMatchObject({ hasProfile: true })
    expect(pngOriginalSamplesEqual(original, indexed(21, 128), UPNG)).toBe(false)
    expect(pngOriginalSamplesEqual(original, indexed(20, 129), UPNG)).toBe(false)
    expect(pngDecodedSamplesEqual(original, indexed(21, 128), UPNG)).toBe(false)
    expect(pngDecodedSamplesEqual(original, original.slice(), UPNG)).toBe(true)
  })

  it('does not discard malformed ICC metadata merely because decoded pixels happen to match', async () => {
    const pixels = new Uint8Array([20, 40, 60, 255, 80, 100, 120, 255])
    const bare = new Uint8Array(UPNG.encode([pixels.buffer], 2, 1, 0))
    const withProfile = (label: string) => new Uint8Array(Buffer.concat([
      bare.subarray(0, 33),
      pngChunk('iCCP', Buffer.concat([Buffer.from('Fixture\0\0'), deflateSync(Buffer.from(label))])),
      bare.subarray(33),
    ]))
    const original = withProfile('Not a valid ICC profile; preserve, do not silently strip')
    expect(await inspectImageHeader(new Blob([original]))).toMatchObject({ format: 'png', hasProfile: true })
    expect(pngDecodedSamplesEqual(original, original.slice(), UPNG)).toBe(true)
    expect(pngDecodedSamplesEqual(original, bare, UPNG)).toBe(false)
    expect(pngDecodedSamplesEqual(original, withProfile('A different invalid profile'), UPNG)).toBe(false)
  })
})

describe('bounded, honest PNG strategy selection', () => {
  function candidates() {
    const lossless = { blob: new Blob([new Uint8Array(600)]), encoder: 'Lossless test encoder' }
    const sizes = [400, 250, 350, 200, 220]
    const qualities = [45, 38, 35, 34.5, 31]
    const quantize = vi.fn(async (colorLimit: number) => ({ blob: new Blob([new Uint8Array(sizes[PNG_COLOR_LIMITS.indexOf(colorLimit)])]), encoder: 'Quantizer', colorLimit }))
    const verify = vi.fn(async (candidate: { colorLimit?: number }) => candidate.colorLimit
      ? fidelity(qualities[PNG_COLOR_LIMITS.indexOf(candidate.colorLimit)], 20)
      : fidelity(Infinity, 0, true))
    return { lossless, quantize, verify }
  }

  it('keeps lossless as the omitted default and honors explicit independent PNG settings', () => {
    expect(pngModeFor({})).toBe('lossless')
    expect(pngModeFor({ mode: 'maximum', pngMode: 'lossless' })).toBe('lossless')
    expect(pngModeFor({ mode: 'target', pngMode: 'smart' })).toBe('smart')
    expect(pngModeFor({ mode: 'balanced', pngMode: 'target' })).toBe('target')
  })

  it('does no color-reduction work in Lossless or when lossless already meets a target', async () => {
    const first = candidates()
    const output = await choosePngCandidate(first.lossless, { mode: 'lossless' }, first)
    expect(output.compressionKind).toBe('lossless')
    expect(first.quantize).not.toHaveBeenCalled()
    const second = candidates()
    expect((await choosePngCandidate(second.lossless, { mode: 'target', targetBytes: 600 }, second)).blob.size).toBe(600)
    expect(second.quantize).not.toHaveBeenCalled()
  })

  it('finds distinct Smart/Maximum results and compares actual nonmonotonic byte sizes', async () => {
    const smart = candidates(), maximum = candidates()
    expect((await choosePngCandidate(smart.lossless, { mode: 'smart' }, smart)).blob.size).toBe(400)
    expect(smart.quantize).toHaveBeenCalledExactlyOnceWith(256)
    const output = await choosePngCandidate(maximum.lossless, { mode: 'maximum' }, maximum)
    expect(output.blob.size).toBe(200)
    expect(output.colorLimit).toBe(32)
    expect(output.compressionKind).toBe('lossy')
    expect(maximum.quantize.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('meets a real byte ceiling using a palette trial and keeps an honest smallest candidate for misses', async () => {
    const target = candidates()
    const fit = await choosePngCandidate(target.lossless, { mode: 'target', targetBytes: 250 }, target)
    expect(fit.blob.size).toBe(250)
    expect(fit.colorLimit).toBe(128)
    const impossible = candidates()
    const miss = await choosePngCandidate(impossible.lossless, { mode: 'target', targetBytes: 100 }, impossible)
    expect(miss.blob.size).toBe(200)
    expect(miss.blob.size).toBeGreaterThan(100)
  })

  it('rejects a falsely lossless candidate and keeps honest fallback classification', async () => {
    const invalid = candidates()
    await expect(choosePngCandidate(invalid.lossless, { mode: 'lossless' }, { ...invalid, verify: async () => fidelity(42, 5) })).rejects.toThrow('lossless')
    const unavailable = candidates()
    const fallback = await choosePngCandidate(unavailable.lossless, { mode: 'smart' }, { ...unavailable, quantize: undefined })
    expect(fallback.compressionKind).toBe('lossless')
    expect(fallback.note).toContain('unavailable')
  })

  it('never calls a normalized profile/alpha color trial lossless without original-sample proof', async () => {
    const codec = candidates()
    const output = await choosePngCandidate(codec.lossless, { mode: 'smart', allowLosslessColorTrial: false }, { ...codec, verify: async () => fidelity(Infinity, 0, true) })
    expect(output.compressionKind).toBe('lossy')
  })

  it('discards completed trials after cancellation', async () => {
    const codec = candidates()
    let cancelled = false
    await expect(choosePngCandidate(codec.lossless, { mode: 'maximum' }, { ...codec, quantize: async (colorLimit: number) => {
      const candidate = await codec.quantize(colorLimit)
      cancelled = true
      return candidate
    }, cancelled: () => cancelled })).rejects.toThrow('cancelled')
  })

  it('keeps a smaller verified lossless result instead of a larger lossy Smart result', async () => {
    const codec = candidates()
    const lossless = { ...codec.lossless, blob: new Blob([new Uint8Array(300)]) }
    const output = await choosePngCandidate(lossless, { mode: 'smart' }, codec)
    expect(output.blob).toBe(lossless.blob)
    expect(output.compressionKind).toBe('lossless')
    expect(codec.quantize).toHaveBeenCalledExactlyOnceWith(256)
  })

  it('tries greater color counts when64colors fail the Maximum fidelity guard', async () => {
    const codec = candidates()
    const verify = vi.fn(async (candidate: { colorLimit?: number }) => candidate.colorLimit ? fidelity(candidate.colorLimit === 256 ? 40 : 20, candidate.colorLimit === 256 ? 15 : 100) : fidelity(Infinity, 0, true))
    const output = await choosePngCandidate(codec.lossless, { mode: 'maximum' }, { ...codec, verify })
    expect(codec.quantize.mock.calls.map(call => call[0])).toEqual([64, 128, 256])
    expect(output.colorLimit).toBe(256)
    expect(output.compressionKind).toBe('lossy')
  })

  it('does not spend CPU on smaller palettes after a rejected32color trial', async () => {
    const codec = candidates()
    const verify = vi.fn(async (candidate: { colorLimit?: number }) => candidate.colorLimit ? fidelity(candidate.colorLimit === 64 ? 40 : 20, candidate.colorLimit === 64 ? 15 : 100) : fidelity(Infinity, 0, true))
    const output = await choosePngCandidate(codec.lossless, { mode: 'maximum' }, { ...codec, verify })
    expect(codec.quantize.mock.calls.map(call => call[0])).toEqual([64, 32])
    expect(output.colorLimit).toBe(64)
  })
})
