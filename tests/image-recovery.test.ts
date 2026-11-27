import { describe, expect, it, vi } from 'vitest'
import { cleanJpegMetadata, inspectImageHeader } from '../workers/image-metadata.mjs'
import { runImagePipeline, TARGET_MAX_ENCODES } from '../workers/image-pipeline.mjs'

// Header fixtures deliberately test the container/policy boundary. They are
// not claimed as real decoded photographs; downloaded browser outputs are
// independently decoded by the recovery benchmark.
function jpeg(width = 4000, height = 3000, size = 1000, metadata: Uint8Array[] = []) {
  const frame = new Uint8Array([0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1])
  const payload = [new Uint8Array([0xff, 0xd8]), ...metadata, frame, new Uint8Array([0xff, 0xda])]
  const bytes = new Uint8Array(Math.max(size, payload.reduce((sum, part) => sum + part.length, 0)))
  let offset = 0
  for (const part of payload) { bytes.set(part, offset); offset += part.length }
  return new File([bytes], 'photo.jpg', { type: 'image/jpeg' })
}

function png(width = 4000, height = 3000, size = 1000, animated = false, bitDepth = 8) {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width); view.setUint32(4, height); header[8] = bitDepth; header[9] = 6
  const chunk = (name: string, payload: Uint8Array) => {
    const bytes = new Uint8Array(12 + payload.length)
    new DataView(bytes.buffer).setUint32(0, payload.length)
    bytes.set(new TextEncoder().encode(name), 4); bytes.set(payload, 8)
    return bytes
  }
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header)]
  if (animated) parts.push(chunk('acTL', new Uint8Array(8)))
  const overhead = parts.reduce((sum, part) => sum + part.length, 0) + 24
  parts.push(chunk('IDAT', new Uint8Array(Math.max(0, size - overhead))), chunk('IEND', new Uint8Array()))
  return new File(parts, 'graphic.png', { type: 'image/png' })
}

function webp(width = 4000, height = 3000, size = 1000, animated = false) {
  const bytes = new Uint8Array(Math.max(30, size))
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true)
  bytes.set(new TextEncoder().encode('WEBPVP8X'), 8)
  new DataView(bytes.buffer).setUint32(16, bytes.length - 20, true)
  bytes[20] = animated ? 2 : 0
  const w = width - 1, h = height - 1
  bytes.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24)
  return new File([bytes], 'graphic.webp', { type: 'image/webp' })
}

type Format = 'jpeg' | 'png' | 'webp'
function image(format: Format, width: number, height: number, size: number, bitDepth = 8) {
  return format === 'png' ? png(width, height, size, false, bitDepth) : format === 'webp' ? webp(width, height, size) : jpeg(width, height, size)
}

function adapter(config: { size?: number | ((q: number) => number); alpha?: boolean; outputAlpha?: boolean; pixelsEqual?: boolean; wrongDimensions?: boolean; wrongFormat?: boolean; wrongBitDepth?: boolean; afterEncode?: () => void } = {}) {
  const close = vi.fn()
  const encode = vi.fn(async (format: Format, quality: number, _effort?: number) => {
    const output = image(config.wrongFormat ? 'webp' : format, config.wrongDimensions ? 100 : outputWidth, outputHeight, typeof config.size === 'function' ? config.size(quality) : config.size ?? 500, config.wrongBitDepth ? 8 : pngBitDepth)
    config.afterEncode?.()
    return { blob: output, encoder: 'Test adapter' }
  })
  let outputWidth = 4000, outputHeight = 3000, pngBitDepth = 8
  const decode = vi.fn(async (_file: File, header: { width: number; height: number; bitDepth?: number }, geometry: { width: number; height: number }) => {
    outputWidth = geometry.width; outputHeight = geometry.height
    pngBitDepth = header.bitDepth ?? 8
    return {
      sourceWidth: header.width, sourceHeight: header.height, hasAlpha: config.alpha ?? false,
      encode,
      verify: vi.fn(async (blob: Blob) => {
        const found = await inspectImageHeader(blob)
        return { width: found.width, height: found.height, hasAlpha: config.outputAlpha ?? config.alpha ?? false, pixelsEqual: config.pixelsEqual ?? true }
      }),
      close,
    }
  })
  return { decode, encode, close }
}

describe('image preflight and original geometry', () => {
  it.each([[4000, 3000], [1001, 501], [3000, 4000], [200, 100]])('preserves %i × %i dimensions even if obsolete resize options are supplied', async (width, height) => {
    const codec = adapter()
    const result = await runImagePipeline(jpeg(width, height), { mode: 'balanced', resizeMaxWidth: 100, resizeMaxHeight: 100 }, codec)
    expect(codec.decode.mock.calls[0][2]).toEqual({ width, height })
    expect(result.inspection).toMatchObject({ inputWidth: width, inputHeight: height, outputWidth: width, outputHeight: height })
  })

  it('rejects enormous images before a decoder is called', async () => {
    const codec = adapter()
    await expect(runImagePipeline(png(40000, 1000), { mode: 'balanced' }, codec)).rejects.toThrow('32 megapixel')
    expect(codec.decode).not.toHaveBeenCalled()
  })

  it('refuses APNG and animated WebP before still-image decoding', async () => {
    const codec = adapter()
    await expect(runImagePipeline(png(100, 100, 200, true), {}, codec)).rejects.toThrow('Animated PNG')
    await expect(runImagePipeline(webp(100, 100, 200, true), {}, codec)).rejects.toThrow('Animated WebP')
    expect(codec.decode).not.toHaveBeenCalled()
  })

  it('ignores obsolete bounds and preserves16-bit PNG precision at original dimensions', async () => {
    const codec = adapter()
    const result = await runImagePipeline(png(4000, 3000, 1000, false, 16), { pngMode: 'lossless', resizeMaxWidth: 1000 }, codec)
    expect(codec.decode).toHaveBeenCalledTimes(1)
    expect(await inspectImageHeader(result.blob)).toMatchObject({ width: 4000, height: 3000, bitDepth: 16 })
    expect(result.inspection.compressionKind).toBe('lossless')
  })

  it('never sends16-bit PNG through color-reduction trials', async () => {
    const codec = adapter()
    const decoded = codec.decode
    const quantize = vi.fn()
    const protectedAdapter = { decode: async (...args: Parameters<typeof decoded>) => ({ ...await decoded(...args), quantizePng: quantize }) }
    const result = await runImagePipeline(png(4000, 3000, 1000, false, 16), { pngMode: 'maximum' }, protectedAdapter)
    expect(quantize).not.toHaveBeenCalled()
    expect(result.inspection.compressionKind).toBe('lossless')
    expect(result.inspection.metadataNote).toContain('16-bit')
  })

  it('refuses16-bit alpha-channel JPEG conversion before an8-bit probe can flatten it', async () => {
    const codec = adapter({ alpha: false })
    await expect(runImagePipeline(png(200, 100, 1000, false, 16), { outputFormat: 'jpeg' }, codec)).rejects.toMatchObject({ code: 'image-precision' })
    expect(codec.decode).not.toHaveBeenCalled()
    await expect(runImagePipeline(png(200, 100, 1000, false, 16), {}, adapter({ wrongBitDepth: true }))).rejects.toMatchObject({ code: 'image-precision' })
  })

  it('reads JPEG dimensions after more than 64KiB of metadata and normalizes EXIF display geometry', async () => {
    const segment = (marker: number, payload: Uint8Array) => new Uint8Array([255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload])
    const exif = new Uint8Array([69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0])
    const source = jpeg(4000, 3000, 0, [segment(225, exif), segment(225, new TextEncoder().encode('XMP metadata')), segment(226, new Uint8Array(65500)), segment(226, new Uint8Array(600))])
    expect(await inspectImageHeader(source)).toMatchObject({ encodedWidth: 4000, encodedHeight: 3000, width: 3000, height: 4000, orientation: 6 })
    const codec = adapter()
    const result = await runImagePipeline(source, { mode: 'balanced', resizeMaxWidth: 1000 }, codec)
    expect(codec.decode.mock.calls[0][2]).toEqual({ width: 3000, height: 4000 })
    expect(result.inspection).toMatchObject({ inputWidth: 3000, inputHeight: 4000, outputWidth: 3000, outputHeight: 4000 })
  })

  it('keeps JPEG scan bytes and orientation during ancillary metadata cleanup', async () => {
    const exif = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0])
    const comment = new Uint8Array([255, 254, 0, 8, 71, 80, 83, 49, 50, 51])
    const source = jpeg(4000, 3000, 1000, [exif, comment])
    const bytes = new Uint8Array(await source.arrayBuffer())
    const cleaned = cleanJpegMetadata(bytes, 6)!
    expect(cleaned.length).toBeLessThan(bytes.length)
    expect(await inspectImageHeader(new Blob([cleaned]))).toMatchObject({ width: 3000, height: 4000, orientation: 6 })
    expect(cleaned.slice(cleaned.indexOf(0xda) + 1)).toEqual(bytes.slice(bytes.indexOf(0xda) + 1))
  })
})

describe('image recovery output policy', () => {
  it.each([1000, 1200])('returns exact original bytes when a same-format candidate is %i bytes', async size => {
    const source = jpeg()
    const codec = adapter({ size })
    const result = await runImagePipeline(source, { mode: 'balanced' }, codec)
    expect(result.outcome).toBe('unchanged')
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()))
    expect(result.inspection).toMatchObject({ inputWidth: 4000, inputHeight: 3000, outputWidth: 4000, outputHeight: 3000, encoder: 'Original file' })
    expect(codec.decode).toHaveBeenCalledTimes(1)
    expect(codec.close).toHaveBeenCalledTimes(1)
  })

  it('returns a genuinely smaller candidate with unchanged dimensions', async () => {
    const result = await runImagePipeline(jpeg(), { mode: 'balanced' }, adapter({ size: 500 }))
    expect(result.outcome).toBe('reduced')
    expect(result.blob.size).toBe(500)
    expect(result.inspection).toMatchObject({ outputWidth: 4000, outputHeight: 3000, outputFormat: 'jpeg' })
  })

  it('uses meaningfully different quality settings for the three lossy modes', async () => {
    const qualities: number[] = []
    for (const mode of ['high-quality', 'balanced', 'maximum']) {
      const codec = adapter()
      await runImagePipeline(jpeg(), { mode }, codec)
      qualities.push(codec.encode.mock.calls[0][1])
    }
    expect(qualities[0]).toBeGreaterThan(qualities[1])
    expect(qualities[1]).toBeGreaterThan(qualities[2])
  })

  it('allows byte growth for an explicitly requested conversion and labels it converted', async () => {
    const result = await runImagePipeline(jpeg(), { mode: 'high-quality', outputFormat: 'png' }, adapter({ size: 1500 }))
    expect(result.outcome).toBe('converted')
    expect(result.blob.type).toBe('image/png')
    expect(result.blob.size).toBeGreaterThan(1000)
  })

  it('retains an original instead of using obsolete resize bounds to force a smaller geometry', async () => {
    const result = await runImagePipeline(jpeg(), { mode: 'balanced', resizeMaxWidth: 1000, resizeMaxHeight: 1000 }, adapter({ size: 1200 }))
    expect(result.outcome).toBe('unchanged')
    expect(result.inspection).toMatchObject({ inputWidth: 4000, inputHeight: 3000, outputWidth: 4000, outputHeight: 3000 })
  })

  it('does not flatten alpha into JPEG and refuses a WebP that lost alpha', async () => {
    await expect(runImagePipeline(png(), { outputFormat: 'jpeg' }, adapter({ alpha: true }))).rejects.toThrow('transparency')
    await expect(runImagePipeline(png(), { outputFormat: 'webp' }, adapter({ alpha: true, outputAlpha: false }))).rejects.toThrow('transparency')
  })

  it('refuses incorrect output dimensions, format and falsely lossless PNG pixels', async () => {
    await expect(runImagePipeline(jpeg(), {}, adapter({ wrongDimensions: true }))).rejects.toThrow('dimensions')
    await expect(runImagePipeline(jpeg(), {}, adapter({ wrongFormat: true }))).rejects.toThrow('format')
    await expect(runImagePipeline(png(), {}, adapter({ pixelsEqual: false }))).rejects.toThrow('pixel')
  })
})

describe('verified maximum-byte target', () => {
  it('keeps an already-under-target original without encoding it again', async () => {
    const codec = adapter()
    const source = jpeg()
    const result = await runImagePipeline(source, { mode: 'target', targetSize: 1000 }, codec)
    expect(result.outcome).toBe('target-met')
    expect(result.blob).toBe(source)
    expect(codec.encode).not.toHaveBeenCalled()
  })

  it('decodes once, bounds attempts and verifies actual final bytes', async () => {
    const codec = adapter({ size: quality => Math.round(1000 + quality * 1000) })
    const result = await runImagePipeline(jpeg(4000, 3000, 3000), { mode: 'target', targetSize: 1500 }, codec)
    expect(result.outcome).toBe('target-met')
    expect(result.blob.size).toBeLessThanOrEqual(1500)
    expect(result.blob.size).toBeGreaterThanOrEqual(1490)
    expect(codec.decode).toHaveBeenCalledTimes(1)
    expect(codec.encode.mock.calls.length).toBeLessThanOrEqual(TARGET_MAX_ENCODES)
    expect(result.inspection).toMatchObject({ outputWidth: 4000, outputHeight: 3000 })
  })

  it('reports an unreachable target without claiming success or changing dimensions', async () => {
    const result = await runImagePipeline(jpeg(4000, 3000, 3000), { mode: 'target', targetSize: 1000 }, adapter({ size: quality => Math.round(1500 + quality * 1000) }))
    expect(result.outcome).toBe('target-unmet')
    expect(result.blob.size).toBeGreaterThan(1000)
    expect(result.targetNote).toContain('above the 1,000-byte limit')
    expect(result.inspection).toMatchObject({ outputWidth: 4000, outputHeight: 3000 })
  })

  it('preserves original dimensions and offers only available alternatives when a target remains unmet', async () => {
    const result = await runImagePipeline(jpeg(4000, 3000, 3000), {
      mode: 'target', targetSize: 1000, resizeMaxWidth: 1000, resizeMaxHeight: 1000,
    }, adapter({ size: quality => Math.round(1500 + quality * 1000) }))
    expect(result.outcome).toBe('target-unmet')
    expect(result.blob.size).toBeGreaterThan(1000)
    expect(await inspectImageHeader(result.blob)).toMatchObject({ width: 4000, height: 3000 })
    expect(result.inspection).toMatchObject({ inputWidth: 4000, inputHeight: 3000, outputWidth: 4000, outputHeight: 3000 })
    expect(result.targetNote).toContain('preserving the original dimensions')
    expect(result.targetNote).toContain('Choose another format or use a larger limit')
    expect(result.targetNote).not.toMatch(/resiz/i)
  })

  it('does not replace the original with a larger failed-target candidate', async () => {
    const source = jpeg()
    const result = await runImagePipeline(source, { mode: 'target', targetSize: 100 }, adapter({ size: 2000 }))
    expect(result.outcome).toBe('target-unmet')
    expect(result.blob).toBe(source)
    expect(result.targetNote).toContain('original is available unchanged')
  })

  it('requires a real target', async () => {
    await expect(runImagePipeline(jpeg(), { mode: 'target', targetSize: 0 }, adapter())).rejects.toThrow('positive maximum')
  })

  it('keeps a PNG already within the byte ceiling untouched without encoding', async () => {
    const source = png()
    const codec = adapter({ alpha: true })
    const result = await runImagePipeline(source, { mode: 'target', targetSize: source.size }, codec)
    expect(result.outcome).toBe('target-met')
    expect(result.blob).toBe(source)
    expect(codec.encode).not.toHaveBeenCalled()
  })

  it.each([{ limit: 500, outcome: 'target-met' }, { limit: 499, outcome: 'target-unmet' }])('checks actual lossless PNG bytes against a $limit-byte ceiling exactly once', async ({ limit, outcome }) => {
    const codec = adapter({ size: 500, alpha: true })
    const progress = vi.fn()
    const result = await runImagePipeline(png(), { mode: 'target', targetSize: limit }, codec, { progress })
    expect(result.outcome).toBe(outcome)
    expect(result.blob.size).toBe(500)
    expect(codec.encode).toHaveBeenCalledExactlyOnceWith('png', undefined, 2)
    expect(result.inspection).toMatchObject({ outputWidth: 4000, outputHeight: 3000, inputHasAlpha: true, outputHasAlpha: true })
    expect('qualityUsed' in result.inspection ? result.inspection.qualityUsed : undefined).toBeUndefined()
    expect(result.targetNote).toContain('Lossless PNG optimization')
    expect(result.targetNote).not.toContain('25%')
    expect(progress.mock.calls.some(call => /quality|trial/i.test(call[1]))).toBe(false)
  })

  it('retains exact original PNG bytes when the one failed-target optimization is larger', async () => {
    const source = png()
    const codec = adapter({ size: 1200, alpha: true })
    const result = await runImagePipeline(source, { mode: 'target', targetSize: 400 }, codec)
    expect(result.outcome).toBe('target-unmet')
    expect(result.blob).toBe(source)
    expect(codec.encode).toHaveBeenCalledTimes(1)
    expect(result.inspection.encoder).toBe('Original file')
    expect(result.targetNote).toContain('original is available unchanged')
  })

  it.each([{ width: 2000, height: 1500, effort: 2 }, { width: 4000, height: 3000, effort: 2 }])('bounds PNG DEFLATE effort without changing $width×$height geometry', async ({ width, height, effort }) => {
    const codec = adapter({ size: 500 })
    const result = await runImagePipeline(png(width, height), { pngMode: 'maximum' }, codec)
    expect(codec.encode).toHaveBeenCalledExactlyOnceWith('png', undefined, effort)
    expect(result.inspection).toMatchObject({ inputWidth: width, inputHeight: height, outputWidth: width, outputHeight: height })
  })

  it('keeps the stronger lossless Target attempt when a faster pass would miss the byte ceiling', async () => {
    // Measured gradient boundary: level2=82,808B; level4=72,797B. An80KB
    // maximum must not cause color loss merely because a faster pass misses it.
    const codec = adapter({ size: 72797 })
    const encode = codec.encode.getMockImplementation()!
    codec.encode.mockImplementation(async (format: Format, quality: number, effort?: number) => {
      const candidate = await encode(format, quality, effort)
      return effort === 4 ? candidate : { ...candidate, blob: png(1600, 900, 82808) }
    })
    const result = await runImagePipeline(png(1600, 900, 239911), { pngMode: 'target', targetSize: 80000 }, codec)
    expect(result.outcome).toBe('target-met')
    expect(result.blob.size).toBe(72797)
    expect(result.inspection).toMatchObject({ compressionKind: 'lossless', outputWidth: 1600, outputHeight: 900 })
    expect(codec.encode).toHaveBeenCalledTimes(1)
  })

  it('verifies PNG pixels, alpha and dimensions in target mode as well', async () => {
    await expect(runImagePipeline(png(), { mode: 'target', targetSize: 600 }, adapter({ pixelsEqual: false }))).rejects.toThrow('pixel')
    await expect(runImagePipeline(png(), { mode: 'target', targetSize: 600 }, adapter({ alpha: true, outputAlpha: false }))).rejects.toThrow('transparency')
    await expect(runImagePipeline(png(), { mode: 'target', targetSize: 600 }, adapter({ wrongDimensions: true }))).rejects.toThrow('dimensions')
  })

  it('discards a completed encode after cancellation and releases the decoded resources', async () => {
    let cancelled = false
    const codec = adapter({ afterEncode: () => { cancelled = true } })
    await expect(runImagePipeline(jpeg(), { mode: 'balanced' }, codec, { cancelled: () => cancelled })).rejects.toMatchObject({ code: 'cancelled' })
    expect(codec.close).toHaveBeenCalledTimes(1)
  })

  it('uses indeterminate stages until a verified result is complete', async () => {
    const progress = vi.fn()
    await runImagePipeline(jpeg(), { mode: 'balanced' }, adapter(), { progress })
    expect(progress.mock.calls.slice(0, -1).every(call => call[0] === 0)).toBe(true)
    expect(progress.mock.calls.at(-1)?.[0]).toBe(100)
  })
})
