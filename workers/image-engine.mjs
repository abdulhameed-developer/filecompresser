import { createImageCanvasAdapter } from './image-canvas.mjs'
import { inspectImageHeader } from './image-metadata.mjs'
import { runImagePipeline } from './image-pipeline.mjs'

self.onmessage = async event => {
  const { file, options = {}, probe = false } = event.data ?? {}
  try {
    const adapter = createImageCanvasAdapter()
    if (probe) {
      const header = await inspectImageHeader(file)
      const decoded = await adapter.decode(file, header, { width: header.width, height: header.height })
      try { self.postMessage({ type: 'probe', result: { format: header.format, width: header.width, height: header.height, hasAlpha: decoded.hasAlpha, jpegSafe: !decoded.hasAlpha && header.jpegPrecisionSafe !== false } }) }
      finally { decoded.close() }
      return
    }
    const result = await runImagePipeline(file, options, adapter, { progress: (progress, message) => self.postMessage({ type: 'progress', progress, message }) })
    self.postMessage({ type: 'result', result })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The image could not be processed.', code: error?.code ?? 'image-processing' })
  }
}
