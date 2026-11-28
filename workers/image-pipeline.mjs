import { ImagePipelineError, inspectImageHeader } from './image-metadata.mjs'
import { choosePngCandidate, PNG_HIGH_PRECISION_NOTE, pngModeFor, pngQualityAccepted } from './image-png.mjs'

export const IMAGE_MODES = ['balanced', 'high-quality', 'maximum', 'target']
export const TARGET_QUALITY_FLOOR = 0
export const TARGET_QUALITY_CEILING = 1
export const TARGET_MAX_ENCODES = 16
export const IMAGE_MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const MODES = {
  balanced: { quality: 0.82, effort: 2 },
  'high-quality': { quality: 0.93, effort: 1 },
  maximum: { quality: 0.6, effort: 4 },
  target: { quality: TARGET_QUALITY_CEILING, effort: 4 },
}

function qualityFor(mode, override) {
  return typeof override === 'number' && Number.isFinite(override)
    ? Math.min(1, Math.max(0.1, override))
    : MODES[mode].quality
}

/**
 * Codec-independent policy. The adapter owns a single decoded image and its
 * canvas; tests can exercise byte/dimension policy without pretending Node has
 * a real browser encoder. Browser QA must independently inspect downloaded files.
 */
export async function runImagePipeline(file, options, adapter, hooks = {}) {
  const now = hooks.now ?? (() => performance.now())
  const started = now()
  const cancelled = hooks.cancelled ?? (() => false)
  const assertActive = () => {
    if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
  }
  const stage = message => { assertActive(); hooks.progress?.(0, message) }
  const imageMode = IMAGE_MODES.includes(options.mode) ? options.mode : 'balanced'
  stage('Checking image dimensions and animation…')
  const header = await inspectImageHeader(file, cancelled)
  assertActive()
  const outputFormat = options.outputFormat ?? header.format
  if (!IMAGE_MIME[outputFormat]) throw new ImagePipelineError('Choose JPG, PNG or WebP as the output format.', 'unsupported-image')
  if (outputFormat === 'jpeg' && header.jpegPrecisionSafe === false)
    throw new ImagePipelineError('JPEG conversion cannot safely verify this 16-bit PNG’s opacity from an 8-bit preview. Keep PNG, or use a 16-bit image editor to confirm and remove transparency before converting.', 'image-precision')
  const pngMode = outputFormat === 'png' ? pngModeFor(options) : undefined
  const mode = outputFormat === 'png' ? pngMode === 'target' ? 'target' : 'balanced' : imageMode
  const targetBytes = mode === 'target' && Number.isSafeInteger(options.targetSize) && options.targetSize > 0 && options.targetSize <= 200_000_000
    ? options.targetSize : undefined
  if (mode === 'target' && !targetBytes)
    throw new ImagePipelineError('Enter a positive maximum file size from 1 to 200,000,000 whole bytes before using Target Size.', 'target-required')
  // A format cannot fit below even its fixed container framing. Reject this
  // provably impossible case before allocating/encoding a full raster.
  const framingBytes = { jpeg: 4, png: 57, webp: 20 }[outputFormat]
  if (targetBytes && targetBytes < framingBytes) throw new ImagePipelineError(`Target not met. A valid ${outputFormat === 'jpeg' ? 'JPG' : outputFormat.toUpperCase()} container needs at least ${framingBytes} bytes before its image data, above your ${targetBytes.toLocaleString('en-US')}-byte limit. Choose a larger limit. Your original file is unchanged; no above-limit result was saved.`, 'target-unreachable')
  // Compression and format conversion never change display dimensions, even
  // when an old caller supplies former resize options.
  const geometry = { width: header.width, height: header.height }
  // Keep the established level 2 lossless baseline. The measured level 1 trial
  // was faster but substantially larger on gradients and 16-bit PNGs.
  // Target retains its stronger small-image lossless attempt: lowering it can
  // force color reduction or miss a limit that level 4 meets without pixel loss.
  const pngEffort = pngMode === 'target' && geometry.width * geometry.height <= 4_000_000 ? 4 : 2
  const converted = outputFormat !== header.format
  let decoded
  let attempts = 0
  try {
    stage('Decoding once with browser color management…')
    decoded = await adapter.decode(file, header, geometry)
    assertActive()
    if (decoded.sourceWidth !== header.width || decoded.sourceHeight !== header.height)
      throw new ImagePipelineError('This browser could not preserve the image’s EXIF-oriented dimensions. No altered output was returned.', 'dimension-mismatch')
    if (decoded.hasAlpha && outputFormat === 'jpeg')
      throw new ImagePipelineError('This image has transparency. Choose PNG or WebP to preserve it; JPEG cannot store transparency.', 'transparency')

    const unchanged = (outcome = 'unchanged', note = 'No smaller valid output was found at this setting. The original file is unchanged.') => ({
      blob: file.type === IMAGE_MIME[header.format] ? file : new Blob([file], { type: IMAGE_MIME[header.format] }),
      outcome,
      targetBytes,
      targetNote: note,
      inspection: {
        inputWidth: header.width, inputHeight: header.height,
        outputWidth: header.width, outputHeight: header.height,
        inputFormat: header.format, outputFormat: header.format,
        elapsedMs: Math.max(0, Math.round(now() - started)),
        encoder: 'Original file',
        metadataNote: 'Original bytes and metadata retained. EXIF orientation, when present, is reflected in the displayed dimensions.',
        inputHasAlpha: decoded.hasAlpha, outputHasAlpha: decoded.hasAlpha,
        ...(header.format === 'png' ? { compressionKind: 'original' } : {}),
      },
    })

    if (targetBytes && !converted && file.size <= targetBytes) {
      hooks.progress?.(100, 'Original already meets the size limit')
      return unchanged('target-met', 'The original already meets the maximum-byte limit. Its quality, dimensions and bytes were kept unchanged.')
    }

    const encode = async (quality, pngEncodingEffort = pngEffort) => {
      attempts++
      stage(outputFormat === 'png' ? `Optimizing PNG without changing pixels (effort ${pngEncodingEffort})…` : mode === 'target'
        ? `Encoding trial ${attempts} of at most ${TARGET_MAX_ENCODES} at ${Math.round(quality * 100)}% quality…`
        : `Encoding at ${Math.round(quality * 100)}% quality…`)
      const candidate = await decoded.encode(outputFormat, quality, outputFormat === 'png' ? pngEncodingEffort : MODES[mode].effort)
      assertActive()
      if (!candidate?.blob || candidate.blob.size <= 0)
        throw new ImagePipelineError('The image encoder produced no valid output.', 'invalid-output')
      return { ...candidate, quality: outputFormat === 'png' ? undefined : quality }
    }

    let candidate
    if (outputFormat === 'png') {
      const verifyPng = async trial => {
        if (!trial?.blob || trial.blob.size <= 0) throw new ImagePipelineError('The PNG encoder produced no valid output.', 'invalid-output')
        const actual = await inspectImageHeader(trial.blob, cancelled)
        assertActive()
        if (actual.format !== 'png' || trial.blob.type !== IMAGE_MIME.png)
          throw new ImagePipelineError('The browser did not produce the requested image format. No mislabeled output was returned.', 'format-mismatch')
        if (actual.width !== geometry.width || actual.height !== geometry.height)
          throw new ImagePipelineError('The encoder changed the requested dimensions. No incorrectly sized output was returned.', 'dimension-mismatch')
        if (header.bitDepth === 16 && actual.bitDepth !== 16)
          throw new ImagePipelineError('The PNG encoder changed 16-bit sample precision. No 8-bit normalized PNG was returned as lossless.', 'image-precision')
        const verified = await decoded.verify(trial.blob, 'png')
        assertActive()
        if (verified.width !== geometry.width || verified.height !== geometry.height)
          throw new ImagePipelineError('The downloaded image did not decode at the expected dimensions.', 'dimension-mismatch')
        if (decoded.hasAlpha && !verified.hasAlpha)
          throw new ImagePipelineError('The encoded image lost transparency. No flattened output was returned.', 'transparency')
        return verified
      }
      // Compare every color-reduction mode with an independently verified
      // lossless candidate; a lossy file must not replace a smaller lossless one.
      let lossless = await encode(undefined)
      // Target has a byte-first contract. Large images start with the quicker
      // lossless pass, but must try the stronger available pass before color
      // reduction/refusal. The source remains decoded once and no dimensions,
      // alpha or16-bit samples are traded away to satisfy the limit.
      if (pngMode === 'target' && lossless.blob.size > targetBytes && pngEffort < 4) {
        const stronger = await encode(undefined, 4)
        if (stronger.blob.size < lossless.blob.size) lossless = stronger
      }
      candidate = await choosePngCandidate(lossless, { mode: pngMode, targetBytes, allowLosslessColorTrial: !header.hasProfile && !decoded.hasAlpha && header.orientation === 1 }, {
        // Cheap trial optimization happens before selection. The expensive
        // refinement below is performed only once for the chosen lossy file.
        quantize: header.bitDepth !== 16 && !decoded.pngQuantizationUnavailableNote && typeof decoded.quantizePng === 'function' ? colorLimit => decoded.quantizePng(colorLimit, 1) : undefined,
        unavailableNote: decoded.pngQuantizationUnavailableNote ?? (header.bitDepth === 16 ? PNG_HIGH_PRECISION_NOTE : undefined),
        verify: verifyPng,
        cancelled,
        progress: message => stage(message),
      })
      if (candidate.compressionKind === 'lossy' && typeof decoded.refinePng === 'function') {
        stage('Refining the selected PNG candidate once…')
        const refined = await decoded.refinePng(candidate.blob, pngMode === 'target' ? 4 : pngEffort)
        assertActive()
        if (refined?.size > 0 && refined.size < candidate.blob.size) {
          const verified = await verifyPng({ blob: refined })
          if (pngQualityAccepted(verified, pngMode)) candidate = { ...candidate, blob: refined, verified }
        }
      }
      if (candidate.note) candidate.metadataNote = `${candidate.metadataNote ?? ''} ${candidate.note}`.trim()
    } else if (mode === 'target') {
      if (!converted && decoded.losslessCandidate) {
        const lossless = await decoded.losslessCandidate()
        assertActive()
        if (lossless?.blob?.size > 0 && lossless.blob.size <= targetBytes) { candidate = lossless }
      }
      if (!candidate) {
        // Probe a real coarse curve, including intermediate qualities even when
        // the lowest setting misses. Codec sizes need not be monotonic. Keep
        // every measured fit; refinement never replaces it with an overshoot.
        const trials = []
        for (const percent of [100, 85, 70, 55, 40, 25, 10, 0]) {
          const trial = await encode(percent / 100)
          trials.push(trial)
          if (!candidate || trial.blob.size < candidate.blob.size) candidate = trial
          if (trial.blob.size <= targetBytes) break
        }
        let best = trials.filter(trial => trial.blob.size <= targetBytes).sort((a, b) => b.quality - a.quality)[0]
        if (best) {
          let lower = Math.round(best.quality * 100)
          let upper = Math.min(...trials.filter(trial => trial.quality > best.quality).map(trial => Math.round(trial.quality * 100)), 101)
          while (attempts < TARGET_MAX_ENCODES && upper - lower > 1) {
            const percent = Math.floor((lower + upper) / 2)
            const trial = await encode(percent / 100)
            if (trial.blob.size <= targetBytes) { best = trial; lower = percent }
            else upper = percent
          }
          candidate = best
        }
      }
    } else {
      candidate = await encode(qualityFor(mode, options.quality))
      // A metadata-only alternative can preserve JPEG fidelity when a lossy
      // re-encode gives no useful reduction. It is never used for conversions.
      if (!converted && decoded.losslessCandidate) {
        const lossless = await decoded.losslessCandidate()
        assertActive()
        if (lossless?.blob?.size > 0 && lossless.blob.size < candidate.blob.size) candidate = lossless
      }
    }
    assertActive()
    if (mode === 'target' && candidate.blob.size > targetBytes) {
      const smallest = !converted ? Math.min(file.size, candidate.blob.size) : candidate.blob.size
      throw new ImagePipelineError(`Target not met. No tested ${outputFormat === 'jpeg' ? 'JPG' : outputFormat.toUpperCase()} output fits the ${targetBytes.toLocaleString('en-US')}-byte limit while preserving the original dimensions${outputFormat === 'png' ? ', alpha and sample precision' : ''}. The smallest available candidate is ${smallest.toLocaleString('en-US')} bytes. ${candidate.note ? `${candidate.note} ` : ''}Choose another format or use a larger limit. Your original file is unchanged; no above-limit result was saved.`, 'target-unreachable')
    }
    if (!converted && candidate.blob.size >= file.size) {
      hooks.progress?.(100, 'Original retained')
      return unchanged('unchanged', `${candidate.note ? `${candidate.note} ` : ''}No smaller valid output was found at this setting. The original file is unchanged.`)
    }
    stage('Verifying the encoded bytes, dimensions and transparency…')
    const actual = await inspectImageHeader(candidate.blob, cancelled)
    assertActive()
    if (actual.format !== outputFormat || candidate.blob.type !== IMAGE_MIME[outputFormat])
      throw new ImagePipelineError('The browser did not produce the requested image format. No mislabeled output was returned.', 'format-mismatch')
    if (actual.width !== geometry.width || actual.height !== geometry.height)
      throw new ImagePipelineError('The encoder changed the requested dimensions. No incorrectly sized output was returned.', 'dimension-mismatch')
    const verified = candidate.verified ?? await decoded.verify(candidate.blob, outputFormat)
    assertActive()
    if (verified.width !== geometry.width || verified.height !== geometry.height)
      throw new ImagePipelineError('The downloaded image did not decode at the expected dimensions.', 'dimension-mismatch')
    if (decoded.hasAlpha && outputFormat !== 'jpeg' && !verified.hasAlpha)
      throw new ImagePipelineError('The encoded image lost transparency. No flattened output was returned.', 'transparency')
    if (outputFormat === 'png' && candidate.compressionKind !== 'lossy' && !verified.pixelsEqual)
      throw new ImagePipelineError('The PNG encoder changed pixel values. No output was labeled as lossless.', 'pixel-mismatch')
    if (outputFormat === 'png' && verified.alphaEqual === false)
      throw new ImagePipelineError('The PNG encoder changed transparency. No output with altered alpha was returned.', 'transparency')
    if (mode === 'target' && candidate.blob.size > targetBytes) throw new ImagePipelineError('Target not met. The final encoded file exceeds the maximum-byte limit. No result was saved.', 'target-unreachable')
    hooks.progress?.(100, 'Verified')
    return {
      blob: candidate.blob,
      outcome: mode === 'target' ? 'target-met' : converted ? 'converted' : 'reduced',
      targetBytes,
      targetNote: mode === 'target' && outputFormat === 'png'
        ? candidate.compressionKind === 'lossy'
          ? `Color-reduced PNG met the ${targetBytes.toLocaleString('en-US')}-byte limit. Colors may change visibly to fit your limit; every alpha value and the original dimensions were preserved.`
          : `Lossless PNG optimization met the ${targetBytes.toLocaleString('en-US')}-byte limit without changing decoded pixels.`
        : candidate.note,
      inspection: {
        inputWidth: header.width, inputHeight: header.height,
        outputWidth: verified.width, outputHeight: verified.height,
        inputFormat: header.format, outputFormat,
        elapsedMs: Math.max(0, Math.round(now() - started)),
        encoder: candidate.encoder,
        metadataNote: candidate.metadataNote ?? 'EXIF orientation normalized. Browser-managed colors rendered to sRGB; source EXIF, GPS and ICC metadata are not copied.',
        qualityUsed: candidate.quality,
        inputHasAlpha: decoded.hasAlpha, outputHasAlpha: verified.hasAlpha,
        ...(outputFormat === 'png' ? { compressionKind: candidate.compressionKind, colorLimit: candidate.compressionKind === 'lossy' ? candidate.colorLimit : undefined } : {}),
      },
    }
  } finally {
    decoded?.close()
  }
}
