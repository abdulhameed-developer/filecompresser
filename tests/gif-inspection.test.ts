import { describe, expect, it, vi } from 'vitest'
import { GIF_LIMITS, inspectGif, inspectGifBytes } from '@/lib/engines/gif-inspection'
import { createCancelSignal } from '@/lib/types'

function gif({ width = 1, height = 1, delays = [10], loop = 2, transparent = false }: { width?: number; height?: number; delays?: number[]; loop?: number; transparent?: boolean } = {}): Uint8Array {
  const le = (v: number) => [v & 255, v >> 8]
  return new Uint8Array([
    ...new TextEncoder().encode('GIF89a'), ...le(width), ...le(height), 0x80, 0, 0,
    0, 0, 0, 255, 255, 255,
    0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, ...le(loop), 0,
    ...delays.flatMap(delay => [0x21, 0xf9, 4, transparent ? 1 : 0, ...le(delay), 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0]),
    0x3b,
  ])
}
describe('GIF preflight before decoder allocation', () => {
  it('reads real frame delays, loop count, transparency and logical dimensions', () => {
    expect(inspectGifBytes(gif({ width: 64, height: 48, delays: [50, 25, 100], loop: 7, transparent: true }))).toEqual({ width: 64, height: 48, frames: 3, delays: [50, 25, 100], loopCount: 7, hasTransparency: true })
  })
  it('rejects a giant logical screen in a tiny compressed file', () => {
    expect(() => inspectGifBytes(gif({ width: 65535, height: 65535 }))).toThrow(/32 megapixel/)
  })
  it('bounds cumulative full-canvas decoded frames', () => {
    expect(() => inspectGifBytes(gif({ width: 5000, height: 5000, delays: [10, 10, 10] }))).toThrow(/64 million/)
  })
  it('bounds frame count even for a tiny canvas', () => {
    expect(() => inspectGifBytes(gif({ delays: Array.from({ length: GIF_LIMITS.maxFrames + 1 }, () => 10) }))).toThrow(/1,000 frames/)
  })
  it.each([1, 2, 8, 20])('rejects GIF data truncated by %s bytes', removed => {
    const bytes = gif({ delays: [10, 10] })
    expect(() => inspectGifBytes(bytes.slice(0, -removed))).toThrow(/truncated|invalid/)
  })
  it('checks cancellation before walking block data', () => {
    const signal = createCancelSignal()
    signal.cancel()
    expect(() => inspectGifBytes(gif(), signal)).toThrow(/cancelled/)
  })
  it('rejects byte-limit violations without reading the file payload', async () => {
    const file = new File([gif()], 'huge.gif')
    Object.defineProperty(file, 'size', { value: GIF_LIMITS.maxBytes + 1 })
    const read = vi.spyOn(file, 'arrayBuffer')
    await expect(inspectGif(file)).rejects.toThrow(/50 MB/)
    expect(read).not.toHaveBeenCalled()
  })
})
