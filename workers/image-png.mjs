import { ImagePipelineError } from './image-metadata.mjs'

export const PNG_MODES = ['lossless', 'smart', 'maximum', 'target']
export const PNG_COLOR_LIMITS = [256, 128, 64, 32, 16]
export const PNG_HIGH_PRECISION_NOTE = 'Color reduction was skipped to preserve the PNG’s original 16-bit samples and alpha. Only original-byte lossless optimization was allowed.'
export const PNG_QUALITY_GUARDS = {
  smart: { minimumPsnr: 40, maximumError: 36 },
  maximum: { minimumPsnr: 34, maximumError: 64 },
  target: { minimumPsnr: 34, maximumError: 64 },
}

export function pngModeFor(options = {}) {
  if (PNG_MODES.includes(options.pngMode)) return options.pngMode
  return options.mode === 'target' ? 'target' : options.mode === 'maximum' ? 'maximum' : 'lossless'
}

/** For high-precision/profiled PNGs, canvas RGBA cannot prove sample fidelity. */
export function pngOriginalSamplesEqual(originalBytes, encodedBytes, codec, cancelled = () => false) {
  const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const original = codec.decode(buffer(originalBytes)), encoded = codec.decode(buffer(encodedBytes))
  // A representation change might be lossless, but accepting it would need a
  // separate exact conversion proof. Conservatively keep the original instead.
  if (original.width !== encoded.width || original.height !== encoded.height || original.depth !== encoded.depth || original.ctype !== encoded.ctype || original.data.length !== encoded.data.length) return false
  for (let i = 0; i < original.data.length; i++) {
    if ((i & 131071) === 0 && cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
    if (original.data[i] !== encoded.data[i]) return false
  }
  return pngProtectedMetadataEqual(originalBytes, encodedBytes, true)
}

function pngProtectedMetadataEqual(originalBytes, encodedBytes, includePalette = false) {
  const protectedChunks = new Set(['cICP', 'iCCP', 'gAMA', 'cHRM', 'sRGB', 'eXIf', ...(includePalette ? ['PLTE', 'tRNS'] : [])])
  const chunks = bytes => {
    const result = []
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset)
      if (offset + length + 12 > bytes.length) return null
      const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
      if (protectedChunks.has(name)) result.push({ name, data: bytes.subarray(offset + 8, offset + 8 + length) })
      offset += length + 12
      if (name === 'IEND') break
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }
  const first = chunks(originalBytes), second = chunks(encodedBytes)
  if (!first || !second || first.length !== second.length) return false
  return first.every((chunk, index) => chunk.name === second[index].name && chunk.data.length === second[index].data.length && chunk.data.every((value, byte) => value === second[index].data[byte]))
}

/** A final lossless refinement must preserve the accepted8-bit RGBA samples. */
export function pngDecodedSamplesEqual(originalBytes, encodedBytes, codec, cancelled = () => false) {
  const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const original = codec.decode(buffer(originalBytes)), encoded = codec.decode(buffer(encodedBytes))
  if (original.width !== encoded.width || original.height !== encoded.height || original.depth === 16 || encoded.depth === 16) return false
  const first = new Uint8Array(codec.toRGBA8(original)[0]), second = new Uint8Array(codec.toRGBA8(encoded)[0])
  if (first.length !== second.length) return false
  for (let i = 0; i < first.length; i++) {
    if ((i & 131071) === 0 && cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
    if (first[i] !== second[i]) return false
  }
  return pngProtectedMetadataEqual(originalBytes, encodedBytes)
}

/**
 * Quantize appearance in premultiplied RGBA, then restore the source alpha
 * plane exactly. Rich alpha may require a truecolor PNG rather than an indexed
 * PNG: color reduction never grants permission to round opacity or flatten it.
 */
export function quantizePngPixels(original, colorLimit, codec, cancelled = () => false) {
  if (!PNG_COLOR_LIMITS.includes(colorLimit)) throw new ImagePipelineError('Invalid PNG color limit.', 'invalid-image-options')
  const premultiplied = new Uint8Array(original.length)
  for (let i = 0; i < original.length; i += 4) {
    if ((i & 131071) === 0 && cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
    const alpha = original[i + 3]
    premultiplied[i] = Math.round(original[i] * alpha / 255)
    premultiplied[i + 1] = Math.round(original[i + 1] * alpha / 255)
    premultiplied[i + 2] = Math.round(original[i + 2] * alpha / 255)
    premultiplied[i + 3] = alpha
  }
  // This synchronous section runs inside the job's dedicated worker, whose
  // termination cancels it even while the quantizer itself is busy.
  const quantized = new Uint8Array(codec.quantize(premultiplied.buffer, colorLimit).abuf)
  if (quantized.length !== original.length) throw new ImagePipelineError('The PNG quantizer returned an invalid pixel buffer.', 'invalid-output')
  for (let i = 0; i < quantized.length; i += 4) {
    if ((i & 131071) === 0 && cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
    const paletteAlpha = quantized[i + 3]
    for (let channel = 0; channel < 3; channel++)
      quantized[i + channel] = paletteAlpha ? Math.min(255, Math.round(quantized[i + channel] * 255 / paletteAlpha)) : 0
    quantized[i + 3] = original[i + 3]
  }
  return quantized
}

/** Accumulate real decoded differences without allocating another full image. */
export function createPngComparison(cancelled = () => false) {
  let pixels = 0, blackError = 0, whiteError = 0, maximumError = 0
  let pixelsEqual = true, alphaEqual = true
  return {
    add(original, actual, originalOffset = 0, actualOffset = 0, count = Math.min(original.length - originalOffset, actual.length - actualOffset) / 4) {
      for (let pixel = 0; pixel < count; pixel++) {
        if ((pixels & 32767) === 0 && cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
        const source = originalOffset + pixel * 4, output = actualOffset + pixel * 4
        const sourceAlpha = original[source + 3], outputAlpha = actual[output + 3]
        if (sourceAlpha !== outputAlpha) { alphaEqual = false; pixelsEqual = false }
        for (let channel = 0; channel < 3; channel++) {
          if (original[source + channel] !== actual[output + channel]) pixelsEqual = false
          const black = (actual[output + channel] * outputAlpha - original[source + channel] * sourceAlpha) / 255
          const white = black + sourceAlpha - outputAlpha
          blackError += black * black; whiteError += white * white
          maximumError = Math.max(maximumError, Math.abs(black), Math.abs(white))
        }
        pixels++
      }
    },
    result() {
      const compositeMse = pixels ? Math.max(blackError, whiteError) / (pixels * 3) : Infinity
      return { pixelsEqual, alphaEqual, compositeMse, compositePsnr: compositeMse === 0 ? Infinity : 10 * Math.log10(255 * 255 / compositeMse), compositeMaximumError: maximumError }
    },
  }
}

export function pngQualityAccepted(metrics, mode) {
  const guard = PNG_QUALITY_GUARDS[mode]
  return Boolean(guard && metrics.alphaEqual === true &&
    typeof metrics.compositePsnr === 'number' && metrics.compositePsnr >= guard.minimumPsnr &&
    Number.isFinite(metrics.compositeMaximumError) && metrics.compositeMaximumError <= guard.maximumError)
}

/**
 * Bounded real-palette search; byte sizes and fidelity need not be monotonic.
 * @param {{ mode: string, targetBytes?: number, allowLosslessColorTrial?: boolean }} options
 */
export async function choosePngCandidate(lossless, options, { quantize, verify, unavailableNote = 'Color-reduction trials were unavailable; a verified lossless PNG was used.', cancelled = () => false, progress = () => {} }) {
  const { mode, targetBytes } = options
  const assertActive = () => { if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled') }
  let best = { ...lossless, compressionKind: 'lossless' }
  best.verified = await verify(best)
  assertActive()
  if (!best.verified.pixelsEqual) throw new ImagePipelineError('The PNG encoder changed pixel values. No output was labeled as lossless.', 'pixel-mismatch')
  if (best.verified.alphaEqual === false) throw new ImagePipelineError('The PNG encoder changed transparency.', 'transparency')
  if (mode === 'lossless' || mode === 'target' && best.blob.size <= targetBytes) return best
  if (!quantize) return { ...best, note: unavailableNote }
  let accepted = 0, tested = 0
  // Smart tests one higher-color candidate. Maximum starts at 64 colors and
  // searches 32/16 if fidelity permits; if 64 fails it tries 128/256 instead.
  // Target keeps the greatest-color-first search for its maximum-byte limit.
  // Compare actual tested sizes. This bounded heuristic is not an exhaustive
  // proof of the smallest possible PNG or of invisible color changes.
  const colorLimits = mode === 'smart' ? [256] : mode === 'maximum' ? [64, 32, 16] : [...PNG_COLOR_LIMITS]
  for (let index = 0; index < colorLimits.length; index++) {
    const colorLimit = colorLimits[index]
    assertActive()
    progress(`Testing PNG color reduction with up to ${colorLimit} colors…`)
    let trial
    try { trial = await quantize(colorLimit) }
    catch (error) {
      assertActive()
      if (error instanceof ImagePipelineError && error.code !== 'png-quantizer-unavailable') throw error
      return { ...best, note: 'Color reduction was unavailable on this device; the best verified PNG candidate was kept.' }
    }
    assertActive()
    if (!trial) return { ...best, note: 'Color reduction requires a browser worker; a verified lossless PNG was used.' }
    tested++
    trial = { ...trial, colorLimit, compressionKind: 'lossy' }
    trial.verified = await verify(trial)
    assertActive()
    // Stop conservatively at the first rejected fidelity level instead of
    // spending more CPU on progressively smaller color limits. This does not
    // assume that PNG byte size is monotonic or promise an exhaustive optimum.
    if (!pngQualityAccepted(trial.verified, mode)) {
      if (mode === 'maximum' && index === 0 && colorLimit === 64) { colorLimits.splice(1, 2, 128, 256); continue }
      if (mode === 'maximum' && colorLimit === 128 && colorLimits[index + 1] === 256) continue
      break
    }
    if (trial.verified.pixelsEqual && options.allowLosslessColorTrial !== false) {
      trial.compressionKind = 'lossless'
      trial.metadataNote = `${trial.metadataNote ?? ''} Decoded pixels were verified unchanged.`.trim()
    }
    accepted++
    // Target keeps the first tested fitting palette, starting at the greatest
    // color count. An unreachable target keeps the smallest accepted result.
    if (mode === 'target' && trial.blob.size <= targetBytes) return { ...trial, pngTrials: tested }
    if (trial.blob.size < best.blob.size) best = trial
  }
  return { ...best, pngTrials: tested, note: best.compressionKind === 'lossy'
    ? `Color-reduced PNG passed the ${PNG_QUALITY_GUARDS[mode].minimumPsnr} dB composite-error guard. This numerical check is a heuristic, not a guarantee of invisible changes.`
    : `${tested} color-reduction trials ${accepted ? 'did not improve the lossless file size' : 'did not pass the color-error guard'}. The lossless candidate was kept.` }
}
