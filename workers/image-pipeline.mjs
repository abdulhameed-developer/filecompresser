import { ImagePipelineError, imageGeometry, inspectImageHeader } from './image-metadata.mjs'
import { choosePngCandidate, PNG_HIGH_PRECISION_NOTE, pngModeFor, pngQualityAccepted } from './image-png.mjs'

export const IMAGE_MODES = ['balanced', 'high-quality', 'maximum', 'target']
export const TARGET_QUALITY_FLOOR = 0.25
export const TARGET_QUALITY_CEILING = 0.95
export const TARGET_MAX_ENCODES = 10
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
  const targetBytes = mode === 'target' && Number.isFinite(options.targetSize) && options.targetSize > 0
    ? Math.floor(options.targetSize) : undefined
  if (mode === 'target' && !targetBytes)
    throw new ImagePipelineError('Enter a positive maximum file size before using Target Size.', 'target-required')
  const geometry = imageGeometry(header.width, header.height, options.resizeMaxWidth, options.resizeMaxHeight)
  // Large-image measurements showed much higher CPU cost for level4. Keep
  // real color-reduction modes/guards, but bound extra DEFLATE effort above4MP.
  // This is an effort policy, not a fixed processing-time guarantee.
  const pngEffort = (pngMode === 'maximum' || pngMode === 'target') && geometry.width * geometry.height <= 4_000_000 ? 4 : 2
  const resized = geometry.width !== header.width || geometry.height !== header.height
  const converted = outputFormat !== header.format
  if (outputFormat === 'png' && header.format === 'png' && header.bitDepth === 16 && resized)
    throw new ImagePipelineError('Resizing this 16-bit PNG would normalize it to 8-bit browser pixels. Its original precision was kept. Resize it with a 16-bit image editor, or explicitly choose another output format.', 'image-precision')
  let decoded
  let attempts = 0
  try {
    stage('Decoding once with browser color management…')
    decoded = await adapter.decode(file, header, geometry)
    assertActive()
    if (decoded.sourceWidth !== header.width || decoded.sourceHeight !== header.height)
      throw new ImagePipelineError('This browser could not preserve the image’s EXIF-oriented dimensions. No resized file was returned.', 'dimension-mismatch')
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

    if (targetBytes && !resized && !converted && file.size <= targetBytes) {
      hooks.progress?.(100, 'Original already meets the size limit')
      return unchanged('target-met', 'The original already meets the maximum-byte limit. Its quality, dimensions and bytes were kept unchanged.')
    }

    const encode = async quality => {
      attempts++
      stage(outputFormat === 'png' ? 'Optimizing PNG once without changing pixels…' : mode === 'target'
        ? `Encoding trial ${attempts} of at most ${TARGET_MAX_ENCODES} at ${Math.round(quality * 100)}% quality…`
        : `Encoding at ${Math.round(quality * 100)}% quality…`)
      const candidate = await decoded.encode(outputFormat, quality, outputFormat === 'png' ? pngEffort : MODES[mode].effort)
      assertActive()
      if (!candidate?.blob || candidate.blob.size <= 0)
        throw new ImagePipelineError('The image encoder produced no valid output.', 'invalid-output')
      return { ...candidate, quality: outputFormat === 'png' ? undefined : quality }
    }

    let candidate
    let targetMet = false
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
      candidate = await choosePngCandidate(await encode(undefined), { mode: pngMode, targetBytes, allowLosslessColorTrial: !header.hasProfile && !decoded.hasAlpha && header.orientation === 1 }, {
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
        const refined = await decoded.refinePng(candidate.blob, pngEffort)
        assertActive()
        if (refined?.size > 0 && refined.size < candidate.blob.size) {
          const verified = await verifyPng({ blob: refined })
          if (pngQualityAccepted(verified, pngMode)) candidate = { ...candidate, blob: refined, verified }
        }
      }
      if (candidate.note) candidate.metadataNote = `${candidate.metadataNote ?? ''} ${candidate.note}`.trim()
      targetMet = Boolean(targetBytes && candidate.blob.size <= targetBytes)
    } else if (mode === 'target') {
      if (!converted && !resized && decoded.losslessCandidate) {
        const lossless = await decoded.losslessCandidate()
        assertActive()
        if (lossless?.blob?.size > 0 && lossless.blob.size <= targetBytes) { candidate = lossless; targetMet = true }
      }
      if (!candidate) {
        const high = await encode(TARGET_QUALITY_CEILING)
        candidate = high
        if (high.blob.size <= targetBytes) targetMet = true
      }
      if (!targetMet) {
        const low = await encode(TARGET_QUALITY_FLOOR)
        if (low.blob.size < candidate.blob.size) candidate = low
        if (low.blob.size <= targetBytes) {
          let best = low
          let lower = TARGET_QUALITY_FLOOR, upper = TARGET_QUALITY_CEILING
          while (attempts < TARGET_MAX_ENCODES && upper - lower > 0.005) {
            const quality = (lower + upper) / 2
            const trial = await encode(quality)
            if (trial.blob.size <= targetBytes) { best = trial; lower = quality }
            else upper = quality
          }
          candidate = best
          targetMet = true
        }
      }
    } else {
      candidate = await encode(qualityFor(mode, options.quality))
      // A metadata-only alternative can preserve JPEG fidelity when a lossy
      // re-encode gives no useful reduction. It is never used for conversions.
      if (!converted && !resized && decoded.losslessCandidate) {
        const lossless = await decoded.losslessCandidate()
        assertActive()
        if (lossless?.blob?.size > 0 && lossless.blob.size < candidate.blob.size) candidate = lossless
      }
    }
    assertActive()
    if (!resized && !converted && candidate.blob.size >= file.size) {
      hooks.progress?.(100, 'Original retained')
      return mode === 'target'
        ? unchanged('target-unmet', outputFormat === 'png'
          ? `${candidate.note ? `${candidate.note} ` : ''}The tested PNG settings did not meet the ${targetBytes.toLocaleString()}-byte limit under the color and transparency guards or produce a smaller file. The original is available unchanged. Choose another format, allow explicit resizing, or use a larger limit.`
          : `No tested encoding met the ${targetBytes.toLocaleString()}-byte limit while preserving dimensions and format. The original is available unchanged. Choose another format, allow explicit resizing, or use a larger limit.`)
        : unchanged('unchanged', `${candidate.note ? `${candidate.note} ` : ''}No smaller valid output was found at this setting. The original file is unchanged.`)
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
    if (mode === 'target') targetMet = candidate.blob.size <= targetBytes
    hooks.progress?.(100, mode === 'target' && !targetMet ? 'Target not met' : 'Verified')
    return {
      blob: candidate.blob,
      outcome: mode === 'target' ? targetMet ? 'target-met' : 'target-unmet' : converted ? 'converted' : resized ? 'resized' : 'reduced',
      targetBytes,
      targetNote: mode === 'target' && !targetMet
        ? outputFormat === 'png'
          ? `The smallest accepted PNG candidate is ${candidate.blob.size.toLocaleString()} bytes, above the ${targetBytes.toLocaleString()}-byte limit. Lossless PNG optimization and available color-reduction trials preserved alpha and the requested dimensions${resized ? ' after your explicit resizing' : ''}. Choose another format, ${resized ? 'adjust your resize settings' : 'allow explicit resizing'}, or use a larger limit.`
          : `The smallest tested candidate is ${candidate.blob.size.toLocaleString()} bytes, above the ${targetBytes.toLocaleString()}-byte limit. The search stopped at ${Math.round(TARGET_QUALITY_FLOOR * 100)}% quality ${resized ? 'after your explicit resizing' : 'without resizing'}. Choose another format, ${resized ? 'adjust your resize settings' : 'allow explicit resizing'}, or use a larger limit.`
        : mode === 'target' && outputFormat === 'png'
          ? candidate.compressionKind === 'lossy'
            ? `Color-reduced PNG met the ${targetBytes.toLocaleString()}-byte limit. Colors may differ; alpha and requested dimensions were preserved and the numerical color-error guard passed.`
            : `Lossless PNG optimization met the ${targetBytes.toLocaleString()}-byte limit without changing decoded pixels.`
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
