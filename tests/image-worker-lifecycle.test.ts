// @vitest-environment jsdom
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { availableOutputFormats, compressImage } from '@/lib/engines/image'
import { createCancelSignal, type ImageInspection } from '@/lib/types'

function source(name = 'photo.jpg', type = 'image/jpeg') {
  return new File([new Uint8Array([255, 216, 255, 192, 0, 17, 8, 0, 100, 0, 200, 3, 1, 17, 0, 2, 17, 1, 3, 17, 1, 255, 218])], name, { type })
}

// Container-only fixtures test the preflight boundary, not decoded image quality.
function pngSource(bitDepth = 8) {
  const bytes = new Uint8Array(45)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, 200); view.setUint32(20, 100)
  bytes[24] = bitDepth; bytes[25] = 6
  bytes.set([73, 69, 78, 68], 37)
  return new File([bytes], 'image.png', { type: 'image/png' })
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
  get jobId() { return this.postMessage.mock.calls.at(-1)?.[0].jobId }
  finish(file: File) {
    this.onmessage?.({ data: { type: 'result', jobId: this.jobId, result: { blob: new Blob([file], { type: 'image/jpeg' }), inspection, outcome: 'unchanged' } } } as MessageEvent)
  }
  probe(width = 200, height = 100, hasAlpha = false, jpegSafe?: boolean) {
    this.onmessage?.({ data: { type: 'probe', jobId: this.jobId, result: { format: 'png', width, height, hasAlpha, ...(jpegSafe === undefined ? {} : { jpegSafe }) } } } as MessageEvent)
  }
}

beforeEach(() => { vi.stubGlobal('File', NodeFile); vi.stubGlobal('Blob', NodeBlob) })
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.useRealTimers(); vi.unstubAllGlobals(); ControlledWorker.instances = [] })

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
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(worker.onmessage).toBeNull()
    signal.cancel()
    expect(worker.terminate).not.toHaveBeenCalled()
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
    const file = pngSource(), observer = vi.fn()
    const pending = availableOutputFormats(file, undefined, observer)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    worker.probe()
    expect(await pending).toEqual(['jpeg', 'png', 'webp'])
    expect(ControlledWorker.instances).toHaveLength(1)
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ file, probe: true }))
    expect(observer).toHaveBeenCalledExactlyOnceWith({ file, format: 'png', width: 200, height: 100, hasAlpha: false })
    expect(Object.isFrozen(observer.mock.calls[0][0])).toBe(true)
  })

  it('isolates observer exceptions from valid output-format decisions', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const pending = availableOutputFormats(source(), undefined, () => { throw new Error('Optional UI observer failed') })
    expect(await pending).toEqual(['jpeg', 'png', 'webp'])
    expect(ControlledWorker.instances).toHaveLength(0)
  })

  it('keeps uncertain16-bit opacity separate from actual observed transparency', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const observer = vi.fn(), pending = availableOutputFormats(pngSource(16), undefined, observer)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    ControlledWorker.instances[0].probe(200, 100, false, false)
    expect(await pending).toEqual(['png', 'webp'])
    expect(observer.mock.calls[0][0]).toMatchObject({ hasAlpha: false, jpegSafe: false })
  })

  it('does not publish late source probes after cancellation or invalid dimensions', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const signal = createCancelSignal(), observer = vi.fn()
    const pending = availableOutputFormats(pngSource(), signal, observer)
    const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    signal.cancel(); worker.probe()
    await rejected
    expect(observer).not.toHaveBeenCalled()
    const invalid = availableOutputFormats(pngSource(), undefined, observer)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(2))
    ControlledWorker.instances[1].probe(0, 100)
    expect(await invalid).toEqual(['png', 'webp'])
    expect(observer).not.toHaveBeenCalled()
  })

  it('does not send obsolete resize options to the worker or alter source dimensions', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source()
    const oldOptions = { mode: 'balanced', resizeMaxWidth: 50, resizeMaxHeight: 50 } as const
    const pending = compressImage(file, oldOptions)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    const { options } = worker.postMessage.mock.calls[0][0]
    expect(options).not.toHaveProperty('resizeMaxWidth')
    expect(options).not.toHaveProperty('resizeMaxHeight')
    worker.finish(file)
    expect((await pending).inspection).toMatchObject({ inputWidth: 200, inputHeight: 100, outputWidth: 200, outputHeight: 100 })
  })

  it('checks final worker Blob bytes against the caller limit even if worker reports success', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source()
    const pending = compressImage(file, { mode: 'target', targetSize: 10 })
    const rejected = expect(pending).rejects.toMatchObject({ code: 'target-unreachable' })
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    worker.onmessage?.({ data: { type: 'result', jobId: worker.jobId, result: { blob: new Blob([file], { type: 'image/jpeg' }), inspection, outcome: 'target-met', targetBytes: 1000 } } } as MessageEvent)
    await rejected
    expect(file.size).toBeGreaterThan(10)
  })

  it('reuses a warm encoder exclusively and ignores stale previous-job messages', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source(), first = compressImage(file)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0], firstId = worker.jobId
    worker.finish(file); await first
    const second = compressImage(file), progress = vi.fn()
    second.then(progress)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2))
    expect(ControlledWorker.instances).toHaveLength(1)
    expect(worker.jobId).not.toBe(firstId)
    worker.onmessage?.({ data: { type: 'error', jobId: firstId, message: 'stale' } } as MessageEvent)
    await Promise.resolve()
    expect(progress).not.toHaveBeenCalled()
    worker.finish(file); await second
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it('releases retained WASM memory after 30 idle seconds and on page exit', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', ControlledWorker)
    const file = source(), first = compressImage(file)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    worker.finish(file); await first
    vi.advanceTimersByTime(29999)
    expect(worker.terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    const second = compressImage(file)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(2))
    ControlledWorker.instances[1].finish(file); await second
    window.dispatchEvent(new Event('pagehide'))
    expect(ControlledWorker.instances[1].terminate).toHaveBeenCalledTimes(1)
  })

  it('bounds the cache to one worker after concurrent successful jobs', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source(), first = compressImage(file), second = compressImage(file)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(2))
    const [a, b] = ControlledWorker.instances
    a.finish(file); await first
    b.finish(file); await second
    expect(a.terminate).not.toHaveBeenCalled()
    expect(b.terminate).toHaveBeenCalledTimes(1)
  })

  it('terminates a reused worker immediately on cancellation without affecting the next job', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source(), first = compressImage(file)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    worker.finish(file); await first
    const signal = createCancelSignal(), second = compressImage(file, {}, undefined, signal)
    const rejected = expect(second).rejects.toMatchObject({ code: 'cancelled' })
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2))
    signal.cancel(); await rejected
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    const retry = compressImage(file)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(2))
    ControlledWorker.instances[1].finish(file); await retry
  })

  it.each(['missing-result', 'wrong-result-kind', 'missing-job-id'])('discards a worker after an invalid %s response', async scenario => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source(), pending = compressImage(file)
    const rejected = expect(pending).rejects.toThrow(/invalid|valid encoded/i)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1))
    const worker = ControlledWorker.instances[0]
    const data = scenario === 'wrong-result-kind'
      ? { type: 'probe', jobId: worker.jobId, result: { format: 'jpeg', hasAlpha: false, width: 200, height: 100 } }
      : { type: 'result', ...(scenario === 'missing-job-id' ? {} : { jobId: worker.jobId }) }
    worker.onmessage?.({ data } as MessageEvent)
    await rejected
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    const retry = compressImage(file)
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(2))
    ControlledWorker.instances[1].finish(file); await retry
  })

  it('does not post input after an immediately cancelled subscription', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const unsubscribe = vi.fn()
    const signal = { cancelled: false, subscribe(listener: () => void) { this.cancelled = true; listener(); return unsubscribe } }
    await expect(compressImage(source(), {}, undefined, signal)).rejects.toMatchObject({ code: 'cancelled' })
    expect(ControlledWorker.instances).toHaveLength(1)
    expect(ControlledWorker.instances[0].postMessage).not.toHaveBeenCalled()
    expect(ControlledWorker.instances[0].terminate).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('uses verified JPEG container geometry without allocating a probe worker', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const file = source('renamed.png', 'image/png'), observer = vi.fn()
    expect(await availableOutputFormats(file, undefined, observer)).toEqual(['jpeg', 'png', 'webp'])
    expect(ControlledWorker.instances).toHaveLength(0)
    expect(observer).toHaveBeenCalledExactlyOnceWith({ file, format: 'jpeg', width: 200, height: 100, hasAlpha: false, jpegSafe: true })
    expect(Object.isFrozen(observer.mock.calls[0][0])).toBe(true)
  })

  it('preserves EXIF display geometry in the JPEG preflight without decoding scan data', async () => {
    vi.stubGlobal('Worker', ControlledWorker)
    const original = new Uint8Array(await source().arrayBuffer())
    const exif = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0])
    const file = new File([original.subarray(0, 2), exif, original.subarray(2)], 'oriented.jpg', { type: 'image/jpeg' })
    const observer = vi.fn()
    await availableOutputFormats(file, undefined, observer)
    expect(observer.mock.calls[0][0]).toMatchObject({ width: 100, height: 200, hasAlpha: false, jpegSafe: true })
    expect(ControlledWorker.instances).toHaveLength(0)
  })

  it.each([new Uint8Array([255, 216, 255, 192]), new TextEncoder().encode('not a JPEG')])('does not publish a source probe for invalid or truncated JPEG headers', async bytes => {
    vi.stubGlobal('Worker', ControlledWorker)
    const observer = vi.fn()
    expect(await availableOutputFormats(new File([bytes], 'broken.jpg', { type: 'image/jpeg' }), undefined, observer)).toEqual(['png', 'webp'])
    expect(observer).not.toHaveBeenCalled()
    expect(ControlledWorker.instances).toHaveLength(0)
  })
})
