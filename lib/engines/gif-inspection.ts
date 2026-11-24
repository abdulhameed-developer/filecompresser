import { assertNotCancelled, ProcessingError, type CancelSignal } from '../types'

export const GIF_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxCanvasPixels: 32_000_000,
  maxDecodedPixels: 64_000_000,
  maxFrames: 1000,
} as const

export interface GifInspection {
  width: number
  height: number
  frames: number
  delays: number[]
  loopCount: number
  hasTransparency: boolean
}

/** Inspect descriptors and bounded sub-blocks before FFmpeg can allocate decoded frames. */
export function inspectGifBytes(bytes: Uint8Array, signal?: CancelSignal): GifInspection {
  assertNotCancelled(signal)
  const invalid = (): never => { throw new ProcessingError('This GIF is truncated or has an invalid animation structure.') }
  const requireBytes = (offset: number, count: number) => {
    if (offset < 0 || offset + count > bytes.length) invalid()
  }
  const word = (offset: number) => { requireBytes(offset, 2); return bytes[offset] | (bytes[offset + 1] << 8) }
  requireBytes(0, 13)
  const signature = String.fromCharCode(...bytes.subarray(0, 6))
  if (signature !== 'GIF87a' && signature !== 'GIF89a') invalid()
  const width = word(6), height = word(8)
  if (!width || !height) invalid()
  const pixels = width * height
  if (pixels > GIF_LIMITS.maxCanvasPixels) throw new ProcessingError('This GIF exceeds the 32 megapixel canvas limit.')
  let offset = 13
  if (bytes[10] & 128) offset += 3 * (1 << ((bytes[10] & 7) + 1))
  requireBytes(offset, 0)
  let delay = 0, loopCount = -1, hasTransparency = false
  const delays: number[] = []
  const subBlocks = (collect = false) => {
    const chunks: Uint8Array[] = []
    let count = 0
    while (true) {
      requireBytes(offset, 1)
      const size = bytes[offset++]
      if (!size) return { chunks, count }
      requireBytes(offset, size)
      if (collect && chunks.length < 2) chunks.push(bytes.subarray(offset, offset + size))
      count++
      offset += size
    }
  }
  while (offset < bytes.length) {
    assertNotCancelled(signal)
    const block = bytes[offset++]
    if (block === 0x3b) {
      if (!delays.length) invalid()
      return { width, height, frames: delays.length, delays, loopCount, hasTransparency }
    }
    if (block === 0x21) {
      requireBytes(offset, 1)
      const label = bytes[offset++]
      if (label === 0xf9) {
        requireBytes(offset, 6)
        if (bytes[offset] !== 4 || bytes[offset + 5] !== 0) invalid()
        hasTransparency ||= Boolean(bytes[offset + 1] & 1)
        delay = word(offset + 2)
        offset += 6
      } else {
        const { chunks: blocks } = subBlocks(label === 0xff)
        if (label === 0xff && blocks[0]?.length === 11) {
          const app = String.fromCharCode(...blocks[0])
          if ((app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0') && blocks[1]?.length === 3 && blocks[1][0] === 1) {
            loopCount = blocks[1][1] | (blocks[1][2] << 8)
          }
        }
      }
      continue
    }
    if (block !== 0x2c) invalid()
    requireBytes(offset, 9)
    const left = word(offset), top = word(offset + 2), frameWidth = word(offset + 4), frameHeight = word(offset + 6)
    if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) invalid()
    const packed = bytes[offset + 8]
    offset += 9
    if (packed & 128) offset += 3 * (1 << ((packed & 7) + 1))
    requireBytes(offset, 1)
    const codeSize = bytes[offset++]
    if (codeSize < 2 || codeSize > 8) invalid()
    if (!subBlocks().count) invalid()
    delays.push(delay)
    delay = 0
    if (delays.length > GIF_LIMITS.maxFrames || pixels * delays.length > GIF_LIMITS.maxDecodedPixels) {
      throw new ProcessingError('This GIF exceeds the animation processing limit (1,000 frames or 64 million decoded frame pixels). Use a shorter or smaller animation.')
    }
  }
  return invalid()
}

export async function inspectGif(file: Blob, signal?: CancelSignal): Promise<GifInspection> {
  assertNotCancelled(signal)
  if (file.size > GIF_LIMITS.maxBytes) throw new ProcessingError('This GIF exceeds the 50 MB input limit.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  assertNotCancelled(signal)
  return inspectGifBytes(bytes, signal)
}
