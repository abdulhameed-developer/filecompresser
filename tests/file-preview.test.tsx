// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { File } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FilePreview from '@/components/FilePreview'
import type { QueueItem } from '@/lib/types'
let root: Root
let host: HTMLDivElement
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const makeItem = (): QueueItem => ({ id: 'source', file: new File(['source bytes'], 'original.jpg', { type: 'image/jpeg' }) as unknown as globalThis.File, name: 'original.jpg', mimeType: 'image/jpeg', originalSize: 12, inputFormat: 'jpeg', status: 'queued', progress: 0 })
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('bounds the preview while preserving source geometry without a revocable image resource', async () => {
  const close = vi.fn(); const decode = vi.fn().mockResolvedValue({ width: 160, height: 120, close })
  const create = vi.fn(() => 'blob:thumbnail'); const revoke = vi.fn()
  vi.stubGlobal('createImageBitmap', decode)
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cHJldmlldw==')
  const item = makeItem()
  await act(async () => { root.render(<FilePreview item={item} dimensions={{ width: 1600, height: 1200 }} />); await flush(); await flush() })
  expect(decode).toHaveBeenCalledWith(item.file, expect.objectContaining({ resizeWidth: 160, resizeHeight: 120 }))
  expect(close).toHaveBeenCalledOnce()
  expect(encode.mock.contexts[0]).toMatchObject({ width: 0, height: 0 })
  expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,cHJldmlldw==')
  await act(async () => root.render(null))
  expect(create).not.toHaveBeenCalled()
  expect(revoke).not.toHaveBeenCalled()
  expect(item.file.name).toBe('original.jpg')
})
it('retains a valid thumbnail while updated source geometry is decoded', async () => {
  let finish!: (bitmap: ImageBitmap) => void
  const close = vi.fn(); const create = vi.fn(); const revoke = vi.fn()
  const decode = vi.fn()
    .mockResolvedValueOnce({ width: 160, height: 120, close })
    .mockImplementationOnce(() => new Promise<ImageBitmap>(resolve => { finish = resolve }))
  vi.stubGlobal('createImageBitmap', decode)
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValueOnce('data:image/png;base64,Zmlyc3Q=').mockReturnValueOnce('data:image/png;base64,c2Vjb25k')
  const item = makeItem()
  await act(async () => { root.render(<FilePreview item={item} dimensions={{ width: 1600, height: 1200 }} />); await flush(); await flush() })
  await act(async () => { root.render(<FilePreview item={item} dimensions={{ width: 3200, height: 2400 }} />); await flush() })
  expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,Zmlyc3Q=')
  await act(async () => { finish({ width: 160, height: 120, close } as unknown as ImageBitmap); await flush() })
  expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,c2Vjb25k')
  expect(close).toHaveBeenCalledTimes(2)
  expect(create).not.toHaveBeenCalled()
  expect(revoke).not.toHaveBeenCalled()
})
it('can rapidly replace and remove ready thumbnails without revoking an image still being loaded', async () => {
  const create = vi.fn(); const revoke = vi.fn(); const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockImplementation(async () => ({ width: 160, height: 120, close })))
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cHJldmlldw==')
  for (let index = 0; index < 3; index++) {
    await act(async () => { root.render(<FilePreview item={makeItem()} dimensions={{ width: 1600, height: 1200 }} />); await flush(); await flush() })
    expect(host.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;/)
    // There is deliberately no image-load event before the user leaves the card.
    await act(async () => root.render(null))
  }
  expect(close).toHaveBeenCalledTimes(3)
  expect(create).not.toHaveBeenCalled()
  expect(revoke).not.toHaveBeenCalled()
})
it('closes a late decode without creating URLs after the card leaves the page', async () => {
  let finish!: (bitmap: ImageBitmap) => void
  const close = vi.fn(); const create = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve })))
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  await act(async () => { root.render(<FilePreview item={makeItem()} dimensions={{ width: 1600, height: 1200 }} />); await flush() })
  await act(async () => root.render(null))
  await act(async () => { finish({ close } as unknown as ImageBitmap); await flush() })
  expect(close).toHaveBeenCalledOnce()
  expect(create).not.toHaveBeenCalled()
})
