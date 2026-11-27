import { createImageCanvasAdapter } from './image-canvas.mjs'
import { inspectImageHeader } from './image-metadata.mjs'
import { runImagePipeline } from './image-pipeline.mjs'

self.onmessage = async event => {
  const { file, options = {}, probe = false, jobId } = event.data ?? {}
  try {
    const adapter = createImageCanvasAdapter()
    if (probe) {
      const header = await inspectImageHeader(file)
      const decoded = await adapter.decode(file, header)
      try { self.postMessage({ type: 'probe', jobId, result: { format: header.format, width: header.width, height: header.height, hasAlpha: decoded.hasAlpha, jpegSafe: !decoded.hasAlpha && header.jpegPrecisionSafe !== false } }) }
      finally { decoded.close() }
      return
    }
    const result = await runImagePipeline(file, options, adapter, { progress: (progress, message) => self.postMessage({ type: 'progress', jobId, progress, message }) })
    self.postMessage({ type: 'result', jobId, result })
  } catch (error) {
    self.postMessage({ type: 'error', jobId, message: error instanceof Error ? error.message : 'The image could not be processed.', code: error?.code ?? 'image-processing' })
  }
}
