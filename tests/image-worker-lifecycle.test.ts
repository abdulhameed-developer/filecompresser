import { afterEach, describe, expect, it, vi } from 'vitest'
import { availableOutputFormats, compressImage, expectedImageGeometry } from '@/lib/engines/image'
import { createCancelSignal, type ImageInspection } from '@/lib/types'

function source(name = 'photo.jpg', type = 'image/jpeg') {
  return new File([new Uint8Array([255, 216, 255, 192, 0, 17, 8, 0, 100, 0, 200, 3, 1, 17, 0, 2, 17, 1, 3, 17, 1, 255, 218])], name, { type })
}

const inspection: ImageInspection = {
  inputWidth: 200, inputHeight: 100, outputWidth: 200, outputHeight: 100,
  inputFormat: 'jpeg', outputFormat: 'jpeg', elapsedMs: 1,
  encoder: 'Original file', metadataNote: 'Original bytes and metadata retained.',
}

class ControlledWorker {
  static instances: ControlledWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { ControlledWorker.instances.push(this) }
  finish(file: File) {
    this.onmessage?.({ data: { type: 'result', result: { blob: new Blob([file], { type: 'image/jpeg' }), inspection, outcome: 'unchanged' } } } as MessageEvent)
  }
  probe(width = 200, height = 100, hasAlpha = false, jpegSafe?: boolean) {
    this.onmessage?.({ data: { type: 'probe', result: { format: 'jpeg', width, height, hasAlpha, ...(jpegSafe === undefined ? {} : { jpegSafe }) } } } as MessageEvent)
  }
}

afterEach(() => { vi.unstubAllGlobals(); ControlledWorker.instances = [] })

describe('image worker ownership and truthful downloads', () => {
  it('corrects a misleading original extension/MIME without changing the bytes', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source('misnamed.png', 'image/png')
    const signal = createCancelSignal()
    const pending = compressImage(file, { mode: 'balanced' }, undefined, signal)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    worker.finish(file)
    const result = await pending
    expect(result.filename).toBe('misnamed.jpg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.blob.type).toBe('image/jpeg')
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()))
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    signal.cancel()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('terminates cancelled work and ignores a late encoder completion', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source()
    const signal = createCancelSignal()
    const pending = compressImage(file, { mode: 'target', targetSize: 10 }, undefined, signal)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    signal.cancel()
    await rejected
    worker.finish(file)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('does not allocate a worker for invalid image bytes', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    await expect(compressImage(new File(['not an image'], 'fake.jpg'))).rejects.toThrow('supported image')
    expect(ControlledWorker.instances).toHaveLength(0)
  })

  it('reports immutable source dimensions from the existing single alpha probe', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source(), observer = vi.fn()
    const pending = availableOutputFormats(file, undefined, observer)
    const worker = ControlledWorker.instances[0]
    worker.probe()
    expect(await pending).toEqual(['jpeg', 'png', 'webp'])
    expect(ControlledWorker.instances).toHaveLength(1)
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ file, probe: true }))
    expect(observer).toHaveBeenCalledExactlyOnceWith({ file, format: 'jpeg', width: 200, height: 100, hasAlpha: false })
    expect(Object.isFrozen(observer.mock.calls[0][0])).toBe(true)
  })

  it('isolates observer exceptions from valid output-format decisions', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const pending = availableOutputFormats(source(), undefined, () => { throw new Error('Optional UI observer failed') })
    ControlledWorker.instances[0].probe()
    expect(await pending).toEqual(['jpeg', 'png', 'webp'])
  })

  it('keeps uncertain16-bit opacity separate from actual observed transparency', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const observer = vi.fn(), pending = availableOutputFormats(source(), undefined, observer)
    ControlledWorker.instances[0].probe(200, 100, false, false)
    expect(await pending).toEqual(['png', 'webp'])
    expect(observer.mock.calls[0][0]).toMatchObject({ hasAlpha: false, jpegSafe: false })
  })

  it('does not publish late source probes after cancellation or invalid dimensions', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const signal = createCancelSignal(), observer = vi.fn()
    const pending = availableOutputFormats(source(), signal, observer)
    const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    const worker = ControlledWorker.instances[0]
    signal.cancel(); worker.probe()
    await rejected
    expect(observer).not.toHaveBeenCalled()
    const invalid = availableOutputFormats(source(), undefined, observer)
    ControlledWorker.instances[1].probe(0, 100)
    expect(await invalid).toEqual(['png', 'webp'])
    expect(observer).not.toHaveBeenCalled()
  })

  it('predicts the exact encoder fit and rounding without upsampling', () => {
    expect(expectedImageGeometry(1001, 501, 500, 500)).toEqual({ width: 500, height: 250 })
    expect(expectedImageGeometry(200, 100, 1000, 1000)).toEqual({ width: 200, height: 100 })
    expect(expectedImageGeometry(3000, 4000, undefined, 600)).toEqual({ width: 450, height: 600 })
  })
})
