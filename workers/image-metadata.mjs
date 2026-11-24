const PIXEL_LIMIT = 32_000_000
const MAX_HEADER_STEPS = 4096

export class ImagePipelineError extends Error {
  constructor(message, code = 'image-processing') {
    super(message)
    this.name = 'ImagePipelineError'
    this.code = code
  }
}

function bytesEqual(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value)
}

function u32(bytes, offset, little = false) {
  if (offset < 0 || offset + 4 > bytes.length) return 0
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, little)
}

function u16(bytes, offset, little = false) {
  if (offset < 0 || offset + 2 > bytes.length) return 0
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, little)
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function exifOrientation(bytes) {
  const start = ascii(bytes, 0, 6) === 'Exif\0\0' ? 6 : 0
  if (bytes.length < start + 8) return 1
  const marker = ascii(bytes, start, 2)
  if (marker !== 'II' && marker !== 'MM') return 1
  const little = marker === 'II'
  if (u16(bytes, start + 2, little) !== 42) return 1
  const directory = start + u32(bytes, start + 4, little)
  const count = Math.min(512, u16(bytes, directory, little))
  for (let i = 0; i < count; i++) {
    const entry = directory + 2 + i * 12
    if (entry + 12 > bytes.length) break
    if (u16(bytes, entry, little) === 0x0112 && u16(bytes, entry + 2, little) === 3 && u32(bytes, entry + 4, little) === 1) {
      const value = u16(bytes, entry + 8, little)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

function checkDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new ImagePipelineError('The image has invalid dimensions.', 'invalid-image')
  if (width * height > PIXEL_LIMIT)
    throw new ImagePipelineError('This image exceeds the 32 megapixel processing limit. Resize it separately before adding it.', 'image-limit')
}

/** Read bounded container headers before allocating a decoded bitmap. */
export async function inspectImageHeader(file, cancelled = () => false) {
  const initial = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer())
  const read = async (offset, length) => {
    if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
    if (offset < 0 || length < 0 || offset + length > file.size)
      throw new ImagePipelineError('The image container is truncated or invalid.', 'invalid-image')
    if (offset + length <= initial.length) return initial.subarray(offset, offset + length)
    return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
  }
  let format, width = 0, height = 0, orientation = 1, hasProfile = false, bitDepth, pngAlphaPossible = false
  if (bytesEqual(initial, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    format = 'png'
    let offset = 8
    for (let steps = 0; steps < MAX_HEADER_STEPS; steps++) {
      const chunk = await read(offset, 8)
      const length = u32(chunk, 0), type = ascii(chunk, 4, 4)
      if (offset + length + 12 > file.size) throw new ImagePipelineError('This PNG file is truncated.', 'invalid-image')
      if (steps === 0 && (type !== 'IHDR' || length !== 13)) throw new ImagePipelineError('This PNG has no valid image header.', 'invalid-image')
      if (type === 'IHDR') {
        const dimensions = await read(offset + 8, 13)
        width = u32(dimensions, 0); height = u32(dimensions, 4)
        bitDepth = dimensions[8]
        pngAlphaPossible = dimensions[9] === 4 || dimensions[9] === 6
      }
      if (type === 'acTL' || type === 'fcTL') throw new ImagePipelineError('Animated PNG images cannot be compressed by this still-image tool without losing animation. Use an animation-aware tool or upload a still image.', 'animated-image')
      if (['iCCP', 'cICP', 'gAMA', 'cHRM', 'sRGB'].includes(type)) hasProfile = true
      if (type === 'tRNS') pngAlphaPossible = true
      if (type === 'eXIf') orientation = exifOrientation(await read(offset + 8, Math.min(length, 65536)))
      if (type === 'IEND') break
      offset += length + 12
      if (steps === MAX_HEADER_STEPS - 1) throw new ImagePipelineError('This PNG has too many metadata chunks to process safely.', 'image-limit')
    }
  } else if (bytesEqual(initial, [0xff, 0xd8, 0xff])) {
    format = 'jpeg'
    let offset = 2
    for (let steps = 0; steps < MAX_HEADER_STEPS && offset < file.size; steps++) {
      const prefix = await read(offset, 2)
      if (prefix[0] !== 0xff) throw new ImagePipelineError('This JPEG has an invalid segment header.', 'invalid-image')
      const marker = prefix[1]
      if (marker === 0xff) { offset++; continue }
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
      const size = u16(await read(offset + 2, 2), 0)
      if (size < 2 || offset + 2 + size > file.size) throw new ImagePipelineError('This JPEG file is truncated.', 'invalid-image')
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        const dimensions = await read(offset + 4, 5)
        height = u16(dimensions, 1); width = u16(dimensions, 3)
      }
      if (marker === 0xe1) {
        const metadata = await read(offset + 4, size - 2)
        if (ascii(metadata, 0, 6) === 'Exif\0\0') orientation = exifOrientation(metadata)
      }
      if (marker === 0xe2 && size >= 14 && ascii(await read(offset + 4, 12), 0, 12) === 'ICC_PROFILE\0') hasProfile = true
      offset += size + 2
      if (steps === MAX_HEADER_STEPS - 1) throw new ImagePipelineError('This JPEG has too many metadata segments to process safely.', 'image-limit')
    }
  } else if (ascii(initial, 0, 4) === 'RIFF' && ascii(initial, 8, 4) === 'WEBP') {
    format = 'webp'
    const end = u32(initial, 4, true) + 8
    if (end > file.size || end < 20) throw new ImagePipelineError('This WebP file is truncated.', 'invalid-image')
    let offset = 12
    for (let steps = 0; steps < MAX_HEADER_STEPS && offset + 8 <= end; steps++) {
      const chunk = await read(offset, 8)
      const type = ascii(chunk, 0, 4), length = u32(chunk, 4, true)
      if (offset + 8 + length > end) throw new ImagePipelineError('This WebP has an invalid chunk length.', 'invalid-image')
      if (type === 'ANIM' || type === 'ANMF') throw new ImagePipelineError('Animated WebP images cannot be compressed by this still-image tool without losing animation. Use an animation-aware tool or upload a still image.', 'animated-image')
      if (type === 'VP8X' && length >= 10) {
        const data = await read(offset + 8, 10)
        if (data[0] & 2) throw new ImagePipelineError('Animated WebP images cannot be compressed by this still-image tool without losing animation.', 'animated-image')
        hasProfile = Boolean(data[0] & 32)
        width = 1 + data[4] + data[5] * 256 + data[6] * 65536
        height = 1 + data[7] + data[8] * 256 + data[9] * 65536
      } else if (type === 'VP8 ' && length >= 10 && !width) {
        const data = await read(offset + 8, 10)
        width = u16(data, 6, true) & 16383; height = u16(data, 8, true) & 16383
      } else if (type === 'VP8L' && length >= 5 && !width) {
        const data = await read(offset + 8, 5)
        width = 1 + ((data[1] + data[2] * 256) & 16383)
        height = 1 + (((data[2] >> 6) | (data[3] << 2) | (data[4] << 10)) & 16383)
      }
      if (type === 'EXIF') orientation = exifOrientation(await read(offset + 8, Math.min(length, 65536)))
      if (type === 'ICCP') hasProfile = true
      offset += 8 + length + (length % 2)
      if (steps === MAX_HEADER_STEPS - 1) throw new ImagePipelineError('This WebP has too many chunks to process safely.', 'image-limit')
    }
  } else throw new ImagePipelineError('This tool supports still JPEG, PNG and WebP images. The file content is not a supported image.', 'unsupported-image')
  checkDimensions(width, height)
  const rotated = orientation >= 5 && orientation <= 8
  return { format, encodedWidth: width, encodedHeight: height, width: rotated ? height : width, height: rotated ? width : height, orientation, hasProfile, ...(format === 'png' ? { bitDepth, jpegPrecisionSafe: bitDepth !== 16 || !pngAlphaPossible } : {}) }
}

export function imageGeometry(width, height, maxWidth, maxHeight) {
  const bound = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : undefined
  const widthBound = bound(maxWidth), heightBound = bound(maxHeight)
  const ratio = Math.min(1, widthBound ? widthBound / width : 1, heightBound ? heightBound / height : 1)
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

/** Remove ancillary JPEG segments without touching the encoded image scans. */
export function cleanJpegMetadata(bytes, orientation = 1) {
  if (!bytesEqual(bytes, [0xff, 0xd8, 0xff])) return null
  const parts = [bytes.subarray(0, 2)]
  if (orientation !== 1) parts.push(new Uint8Array([
    0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0,
    73, 73, 42, 0, 8, 0, 0, 0, 1, 0,
    18, 1, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0,
  ]))
  let offset = 2, removed = false
  for (let steps = 0; offset + 2 <= bytes.length && steps < MAX_HEADER_STEPS; steps++) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === 0xff) { parts.push(bytes.subarray(offset, offset + 1)); offset++; continue }
    if (marker === 0xda || marker === 0xd9) {
      parts.push(bytes.subarray(offset))
      if (!removed) return null
      const length = parts.reduce((sum, part) => sum + part.length, 0)
      const result = new Uint8Array(length)
      let cursor = 0
      for (const part of parts) { result.set(part, cursor); cursor += part.length }
      return result
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(offset, offset + 2)); offset += 2; continue
    }
    const length = u16(bytes, offset + 2)
    const end = offset + 2 + length
    if (length < 2 || end > bytes.length) return null
    const isAncillary = marker === 0xfe || (marker >= 0xe1 && marker <= 0xed)
    const isIcc = marker === 0xe2 && ascii(bytes, offset + 4, 12) === 'ICC_PROFILE\0'
    if (isAncillary && !isIcc) removed = true
    else parts.push(bytes.subarray(offset, end))
    offset = end
  }
  return null
}
