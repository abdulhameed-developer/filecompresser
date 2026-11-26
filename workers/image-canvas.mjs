import { cleanJpegMetadata, ImagePipelineError } from './image-metadata.mjs'
import { IMAGE_MIME } from './image-pipeline.mjs'
import { createPngComparison, PNG_HIGH_PRECISION_NOTE, pngDecodedSamplesEqual, pngOriginalSamplesEqual, quantizePngPixels } from './image-png.mjs'

let jpegCodec, pngCodec, quantizerCodec

async function upng() {
  if (!quantizerCodec) {
    const url = '/image-worker/codecs/upng/UPNG.js'
    quantizerCodec = import(/* webpackIgnore: true */ /* @vite-ignore */ url).then(() => {
      const codec = globalThis.UPNG
      if (typeof codec?.quantize !== 'function' || typeof codec?.encode !== 'function')
        throw new ImagePipelineError('The PNG color-reduction codec is unavailable.', 'png-quantizer-unavailable')
      return codec
    })
  }
  return quantizerCodec
}

async function mozJpeg() {
  if (!jpegCodec) {
    const url = '/image-worker/codecs/jpeg/encode.js'
    jpegCodec = import(/* webpackIgnore: true */ /* @vite-ignore */ url).then(async module => {
      await module.init()
      return module.default
    })
  }
  return jpegCodec
}

async function oxipng() {
  if (!pngCodec) {
    // Explicit single-thread WASM avoids nested workers, bare imports and a
    // SharedArrayBuffer requirement. The containing image job is already a worker.
    const url = '/image-worker/codecs/oxipng/codec/pkg/squoosh_oxipng.js'
    pngCodec = import(/* webpackIgnore: true */ /* @vite-ignore */ url).then(async module => {
      await module.default()
      return module
    })
  }
  return pngCodec
}

function alphaPresent(data, cancelled) {
  for (let i = 3; i < data.length; i += 4) {
    if ((i & 131071) === 3 && cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
    if (data[i] < 255) return true
  }
  return false
}

function makeCanvas(width, height, mainThread) {
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(width, height)
    : mainThread && typeof document !== 'undefined' ? document.createElement('canvas') : null
  if (!canvas) throw new ImagePipelineError('A browser worker canvas is unavailable.', 'worker-unavailable')
  canvas.width = width; canvas.height = height
  return canvas
}

async function decode(file, mainThread) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image', colorSpaceConversion: 'default', premultiplyAlpha: 'default' })
  }
  if (mainThread && typeof document !== 'undefined') {
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      return { image, width: image.naturalWidth, height: image.naturalHeight, close() {} }
    } finally { URL.revokeObjectURL(url) }
  }
  throw new ImagePipelineError('This browser cannot decode images inside a worker.', 'worker-unavailable')
}

async function canvasBlob(canvas, type, quality) {
  let blob
  if ('convertToBlob' in canvas) blob = await canvas.convertToBlob({ type, quality })
  else blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new ImagePipelineError('The browser could not encode this image at its requested dimensions.', 'canvas-limit')), type, quality))
  if (!blob || blob.type !== type) throw new ImagePipelineError('This browser does not support the requested output format.', 'format-mismatch')
  return blob
}

/** One decoded source/canvas per job. Codec modules are loaded only on demand. */
export function createImageCanvasAdapter({ mainThread = false, cancelled = () => Boolean(false) } = {}) {
  return {
    async decode(file, header) {
      const geometry = { width: header.width, height: header.height }
      let source = await decode(file, mainThread)
      let canvas, pixels, context
      const sourceWidth = source.width, sourceHeight = source.height
      try {
        canvas = makeCanvas(geometry.width, geometry.height, mainThread)
        context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
        if (!context) throw new ImagePipelineError('This browser cannot create a full-resolution image canvas.', 'canvas-limit')
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'high'
        context.drawImage(source.image ?? source, 0, 0, geometry.width, geometry.height)
        source.close(); source = null
        pixels = context.getImageData(0, 0, geometry.width, geometry.height)
      } catch (error) {
        source?.close()
        if (canvas) canvas.width = canvas.height = 0
        throw error
      }
      let hasAlpha
      try { hasAlpha = alphaPresent(pixels.data, cancelled) }
      catch (error) { canvas.width = canvas.height = 0; pixels = null; context = null; throw error }
      const fallbackNote = mainThread ? ' Worker processing is unavailable in this browser, so this job used the browser’s main-thread fallback.' : ''
      const normalizedNote = `EXIF orientation normalized. Browser-managed colors rendered to sRGB; source EXIF, GPS and ICC metadata are not copied.${fallbackNote}`
      return {
        sourceWidth, sourceHeight, hasAlpha,
        pngQuantizationUnavailableNote: header.format === 'png' && header.bitDepth === 16
          ? PNG_HIGH_PRECISION_NOTE
          : mainThread ? 'Color reduction requires a browser worker; only the lossless PNG path was available.' : undefined,
        async encode(format, quality, effort) {
          if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
          if (format === 'jpeg') {
            try {
              const encode = await mozJpeg()
              const bytes = await encode(pixels, { quality: Math.round(quality * 100) })
              return { blob: new Blob([bytes], { type: IMAGE_MIME.jpeg }), encoder: `MozJPEG (@jsquash/jpeg 1.6.0, ${mainThread ? 'main-thread fallback' : 'worker'})`, metadataNote: normalizedNote }
            } catch (error) {
              if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
              if (error instanceof ImagePipelineError) throw error
              const blob = await canvasBlob(canvas, IMAGE_MIME.jpeg, quality)
              return { blob, encoder: 'Browser JPEG fallback', metadataNote: `${normalizedNote} The optional MozJPEG codec was unavailable; browser JPEG was used.` }
            }
          }
          if (format === 'png') {
            if (header.format === 'png' && mainThread) return {
              blob: file.type === IMAGE_MIME.png ? file : new Blob([file], { type: IMAGE_MIME.png }),
              encoder: 'Original file',
              metadataNote: 'A browser worker was unavailable. The original PNG, sample precision and color metadata were retained without main-thread re-encoding.',
              note: 'Original PNG retained because worker-based lossless verification was unavailable.',
            }
            try {
              const codec = await oxipng()
              // Same-format optimization preserves the encoded PNG's
              // color/orientation chunks; new images use the normalized pixels.
              const encoded = header.format === 'png'
                ? codec.optimise(new Uint8Array(await file.arrayBuffer()), effort, false, false)
                : codec.optimise_raw(pixels.data, geometry.width, geometry.height, effort, false, false)
              if (header.format === 'png' && (header.bitDepth === 16 || header.hasProfile || hasAlpha)) {
                const decoder = await upng()
                const original = new Uint8Array(await file.arrayBuffer())
                const sourceSamplesEqual = header.bitDepth === 16
                  ? pngOriginalSamplesEqual(original, encoded, decoder, cancelled)
                  : pngDecodedSamplesEqual(original, encoded, decoder, cancelled)
                if (!sourceSamplesEqual) return {
                  blob: file.type === IMAGE_MIME.png ? file : new Blob([file], { type: IMAGE_MIME.png }),
                  encoder: 'Original file',
                  metadataNote: 'The original PNG was retained because exact sample precision and color/orientation metadata could not be proved unchanged.',
                  note: 'Original PNG retained to preserve sample precision and color metadata.',
                }
              }
              return {
                blob: new Blob([encoded], { type: IMAGE_MIME.png }),
                encoder: `Oxipng (@jsquash/oxipng 2.3.0, single-thread ${mainThread ? 'fallback' : 'worker'}, level ${effort})`,
                metadataNote: header.format === 'png'
                  ? `Original-byte lossless PNG optimization. Decoded colors and alpha were verified; transparent, high-precision or profiled PNGs also passed exact source-sample and color/orientation-chunk checks.${fallbackNote}`
                  : normalizedNote,
              }
            } catch (error) {
              if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
              if (error instanceof ImagePipelineError && error.code !== 'png-quantizer-unavailable') throw error
              if (header.format === 'png') return {
                blob: file.type === IMAGE_MIME.png ? file : new Blob([file], { type: IMAGE_MIME.png }),
                encoder: 'Original file',
                metadataNote: 'The original PNG and its sample precision/profile were retained; lossless optimization or exact source verification was unavailable.',
                note: 'Original PNG retained because lossless optimization or exact source verification was unavailable.',
              }
              const blob = await canvasBlob(canvas, IMAGE_MIME.png)
              return { blob, encoder: 'Browser PNG fallback', metadataNote: `${normalizedNote} Oxipng was unavailable; browser PNG was used and decoded pixels were verified.` }
            }
          }
          return { blob: await canvasBlob(canvas, IMAGE_MIME.webp, quality), encoder: `Browser WebP${mainThread ? ' main-thread fallback' : ' worker'}`, metadataNote: normalizedNote }
        },
        async losslessCandidate() {
          if (header.format !== 'jpeg') return null
          const original = new Uint8Array(await file.arrayBuffer())
          const bytes = cleanJpegMetadata(original, header.orientation)
          return bytes && bytes.length < file.size ? {
            blob: new Blob([bytes], { type: IMAGE_MIME.jpeg }),
            encoder: 'Lossless JPEG metadata cleanup',
            metadataNote: `Encoded image scans are unchanged. Ancillary EXIF, camera, GPS and text metadata were removed; the color profile and minimal orientation tag are retained when needed.${fallbackNote}`,
          } : null
        },
        async quantizePng(colorLimit, effort) {
          // No new synchronous color-reduction work is introduced on the UI
          // thread. The normal worker is terminated immediately on cancel.
          if (mainThread) return null
          const codec = await upng()
          const reduced = quantizePngPixels(pixels.data, colorLimit, codec, cancelled)
          let encoded = new Uint8Array(codec.encode([reduced.buffer], geometry.width, geometry.height, 0, undefined, { sRGB: 0 }))
          if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
          try {
            const optimizer = await oxipng()
            const optimized = optimizer.optimise(encoded, effort, false, false)
            if (optimized.length < encoded.length) encoded = optimized
          } catch (error) {
            if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
            if (error instanceof ImagePipelineError) throw error
            // The UPNG file is still decoded and checked before acceptance.
          }
          return {
            blob: new Blob([encoded], { type: IMAGE_MIME.png }),
            encoder: `UPNG color quantization (@pdf-lib/upng 1.0.1, up to ${colorLimit} colors) + PNG encoding`,
            metadataNote: `${normalizedNote} Color values may change; every decoded source alpha byte is retained. PNG output is not necessarily indexed.`,
          }
        },
        async refinePng(blob, effort) {
          if (mainThread) return null
          if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
          try {
            const optimizer = await oxipng()
            const original = new Uint8Array(await blob.arrayBuffer())
            const encoded = optimizer.optimise(original, effort, false, false)
            if (encoded.length >= original.length) return null
            const decoder = await upng()
            if (!pngDecodedSamplesEqual(original, encoded, decoder, cancelled)) return null
            return new Blob([encoded], { type: IMAGE_MIME.png })
          } catch (error) {
            if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
            if (error instanceof ImagePipelineError && error.code === 'cancelled') throw error
            // Keep the previously verified trial if optional refinement fails.
            return null
          }
        },
        async verify(blob, format) {
          const result = await decode(blob, mainThread)
          let verificationCanvas
          try {
            const width = result.width, height = result.height
            if (width !== geometry.width || height !== geometry.height) return { width, height, hasAlpha: false, pixelsEqual: false }
            if (format !== 'png' && !hasAlpha) return { width, height, hasAlpha: false, pixelsEqual: true }
            verificationCanvas = makeCanvas(256, 256, mainThread)
            const verificationContext = verificationCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
            if (!verificationContext) throw new ImagePipelineError('This browser cannot verify image pixels.', 'canvas-limit')
            let outputHasAlpha = false
            const comparison = createPngComparison(cancelled)
            // Verify in tiles while leaving the original encoding canvas intact.
            for (let y = 0; y < height; y += 256) for (let x = 0; x < width; x += 256) {
              if (cancelled()) throw new ImagePipelineError('Processing was cancelled.', 'cancelled')
              const w = Math.min(256, width - x), h = Math.min(256, height - y)
              verificationContext.clearRect(0, 0, 256, 256)
              verificationContext.drawImage(result.image ?? result, x, y, w, h, 0, 0, w, h)
              const actual = verificationContext.getImageData(0, 0, w, h).data
              if (alphaPresent(actual, cancelled)) outputHasAlpha = true
              if (format === 'png') for (let row = 0; row < h; row++)
                comparison.add(pixels.data, actual, ((y + row) * width + x) * 4, row * w * 4, w)
            }
            return { width, height, hasAlpha: outputHasAlpha, ...comparison.result() }
          } finally { result.close(); if (verificationCanvas) verificationCanvas.width = verificationCanvas.height = 0 }
        },
        close() { canvas.width = canvas.height = 0; pixels = null; context = null },
      }
    },
  }
}
