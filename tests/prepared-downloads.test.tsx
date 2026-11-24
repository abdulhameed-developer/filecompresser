// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Blob, File } from 'node:buffer'
import { unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DownloadActions from '@/components/DownloadActions'
import type { QueueItem } from '@/lib/types'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), individual: vi.fn() }))
vi.mock('@/lib/downloads', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/downloads')>(),
  prepareDownloadZip: mocks.prepare,
  downloadItemsIndividually: mocks.individual,
}))
const actualDownloads = await vi.importActual<typeof import('@/lib/downloads')>('@/lib/downloads')

const blob = (bytes: number[] = [1, 2, 3]) => new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }) as unknown as globalThis.Blob
function completed(name: string, bytes: number[] = [1, 2, 3], id = name): QueueItem {
  const output = blob(bytes)
  return { id, name, file: new File([new Uint8Array(bytes)], name) as unknown as globalThis.File, mimeType: 'application/octet-stream', originalSize: bytes.length, status: 'completed', progress: 100, result: { blob: output, filename: name, mimeType: 'application/octet-stream' } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

let root: Root | null
let container: HTMLDivElement
let createUrl: ReturnType<typeof vi.fn>
let revokeUrl: ReturnType<typeof vi.fn>
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const prepareButton = () => [...container.querySelectorAll('button')].find(button => /Prepare \d+ results as ZIP/.test(button.textContent ?? ''))!
const saveAnchor = () => container.querySelector<HTMLAnchorElement>('a[download]')
async function render(items: QueueItem[], extra: { zipName?: string; onClear?: () => void } = {}) {
  await act(async () => root!.render(<DownloadActions items={items} {...extra} />))
}
async function unmount() {
  await act(async () => root?.unmount())
  root = null
}

beforeEach(() => {
  vi.stubGlobal('Blob', Blob)
  vi.stubGlobal('File', File)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  createUrl = vi.fn().mockReturnValue('blob:prepared-zip')
  revokeUrl = vi.fn()
  const OriginalURL = URL
  vi.stubGlobal('URL', Object.assign(class extends OriginalURL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }))
  mocks.prepare.mockReset()
  mocks.individual.mockReset().mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await unmount()
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('actual prepared ZIP bytes and preflight', () => {
  it('includes only completed results, with safe unique names and exact binary entry bytes', async () => {
    const excluded = blob([99])
    Object.defineProperty(excluded, 'size', { value: 400 * 1024 * 1024 })
    const readExcluded = vi.spyOn(excluded, 'arrayBuffer')
    const items: QueueItem[] = [
      completed('report.bin', [0, 255, 10, 13], 'first'),
      completed('REPORT.bin', [4, 5], 'second'),
      completed('../../folder\\safe.txt', [6, 0], 'path'),
      completed('CON.txt', [7], 'device'),
      completed('direction\u202e.txt', [8], 'direction'),
      ...(['failed', 'cancelled', 'queued'] as const).map(status => ({ ...completed(`excluded-${status}.bin`), status, result: { blob: excluded, filename: `excluded-${status}.bin`, mimeType: 'application/octet-stream' } })),
    ]
    const archive = await actualDownloads.prepareDownloadZip(items)
    expect(archive.type).toBe('application/zip')
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()))
    expect(Object.keys(entries)).toHaveLength(5)
    expect(new Set(Object.keys(entries).map(name => name.toLowerCase())).size).toBe(5)
    expect([...entries['report.bin']]).toEqual([0, 255, 10, 13])
    expect([...entries['REPORT-2.bin']]).toEqual([4, 5])
    expect([...entries.download]).toEqual([7])
    expect([...entries['direction.txt']]).toEqual([8])
    expect(Object.keys(entries).every(name => !/[\\/\u0000-\u001f\u202e]/.test(name))).toBe(true)
    expect(Object.values(entries).map(bytes => [...bytes])).toContainEqual([6, 0])
    expect(readExcluded).not.toHaveBeenCalled()
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('rejects an empty completed selection instead of preparing an empty ZIP', async () => {
    await expect(actualDownloads.prepareDownloadZip([])).rejects.toThrow(/No completed results/i)
    await expect(actualDownloads.prepareDownloadZip([{ ...completed('failed.bin'), status: 'failed' }])).rejects.toThrow(/No completed results/i)
  })

  it('rejects more than500 results before reading any output blob', async () => {
    const shared = blob(), read = vi.spyOn(shared, 'arrayBuffer')
    const items = Array.from({ length: 501 }, (_, index) => ({ ...completed(`${index}.bin`), result: { blob: shared, filename: `${index}.bin`, mimeType: 'application/octet-stream' } }))
    await expect(actualDownloads.prepareDownloadZip(items)).rejects.toThrow(/500/)
    expect(read).not.toHaveBeenCalled()
  })

  it('rejects a batch over300 MB before reading its first blob', async () => {
    const first = blob(), oversized = blob()
    Object.defineProperty(oversized, 'size', { value: 301 * 1024 * 1024 })
    const readFirst = vi.spyOn(first, 'arrayBuffer'), readOversized = vi.spyOn(oversized, 'arrayBuffer')
    const items = [first, oversized].map((output, index) => ({ ...completed(`${index}.bin`), result: { blob: output, filename: `${index}.bin`, mimeType: 'application/octet-stream' } }))
    await expect(actualDownloads.prepareDownloadZip(items)).rejects.toThrow(/300 MB/)
    expect(readFirst).not.toHaveBeenCalled()
    expect(readOversized).not.toHaveBeenCalled()
  })
})

describe('prepared native ZIP link lifecycle', () => {
  it('prepares once, exposes a safe native save link, and retains its URL for repeated user clicks', async () => {
    const items = [completed('one.bin'), completed('two.bin')], pending = deferred<globalThis.Blob>()
    mocks.prepare.mockReturnValue(pending.promise)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    await render(items, { zipName: 'CON.zip' })
    await act(async () => prepareButton().click())
    expect(mocks.prepare).toHaveBeenCalledWith(items)
    expect(saveAnchor()).toBeNull()
    expect(createUrl).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    const archive = blob([80, 75, 3, 4])
    await act(async () => { pending.resolve(archive); await flush() })
    const anchor = saveAnchor()!
    expect(anchor).not.toBeNull()
    expect(anchor.textContent).toContain('Save ZIP (2 files)')
    expect(anchor.getAttribute('href')).toBe('blob:prepared-zip')
    expect(anchor.download).toBe('download.zip')
    expect(createUrl).toHaveBeenCalledExactlyOnceWith(archive)
    expect(click).not.toHaveBeenCalled()
    anchor.addEventListener('click', event => event.preventDefault())
    await act(async () => { anchor.click(); anchor.click() })
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(saveAnchor()?.getAttribute('href')).toBe('blob:prepared-zip')
    expect(revokeUrl).not.toHaveBeenCalled()
    await render(items, { zipName: 'CON.zip' })
    expect(revokeUrl).not.toHaveBeenCalled()
    expect(mocks.individual).not.toHaveBeenCalled()
  })

  it('keeps a prepared ZIP through new arrays and draft edits, then invalidates a changed output blob', async () => {
    const items = [completed('one.bin'), completed('two.bin')]
    mocks.prepare.mockResolvedValue(blob())
    createUrl.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    await render(items)
    await act(async () => { prepareButton().click(); await flush() })
    expect(saveAnchor()?.getAttribute('href')).toBe('blob:first')
    await render([...items])
    expect(saveAnchor()?.getAttribute('href')).toBe('blob:first')
    await render(items.map(item => ({ ...item, dirty: true })))
    expect(saveAnchor()?.getAttribute('href')).toBe('blob:first')
    expect(revokeUrl).not.toHaveBeenCalled()
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    await render(items.map((item, index) => index ? item : { ...item, result: { ...item.result!, blob: blob([9]) } }))
    expect(saveAnchor()).toBeNull()
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:first')
    await act(async () => { prepareButton().click(); await flush() })
    expect(saveAnchor()?.getAttribute('href')).toBe('blob:second')
    await unmount()
    expect(revokeUrl.mock.calls.map(call => call[0])).toEqual(['blob:first', 'blob:second'])
  })

  it('invalidates a prepared ZIP when an output filename changes even if its bytes are unchanged', async () => {
    const items = [completed('one.bin'), completed('two.bin')]
    mocks.prepare.mockResolvedValue(blob())
    await render(items)
    await act(async () => { prepareButton().click(); await flush() })
    await render(items.map((item, index) => index ? item : { ...item, result: { ...item.result!, filename: 'renamed.bin' } }))
    expect(saveAnchor()).toBeNull()
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:prepared-zip')
  })

  it('invalidates the prepared ZIP when its requested download name changes', async () => {
    const items = [completed('one.bin'), completed('two.bin')]
    mocks.prepare.mockResolvedValue(blob())
    await render(items, { zipName: 'first.zip' })
    await act(async () => { prepareButton().click(); await flush() })
    await render(items, { zipName: 'second.zip' })
    expect(saveAnchor()).toBeNull()
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:prepared-zip')
  })

  it('ignores an old preparation after results are replaced and lets the new selection prepare', async () => {
    const first = deferred<globalThis.Blob>(), second = deferred<globalThis.Blob>()
    mocks.prepare.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await render([completed('one.bin'), completed('two.bin')])
    await act(async () => prepareButton().click())
    await render([completed('three.bin'), completed('four.bin')])
    await act(async () => prepareButton().click())
    await act(async () => { first.resolve(blob([1])); await flush() })
    expect(createUrl).not.toHaveBeenCalled()
    expect(saveAnchor()).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('.downloadBtn')?.disabled).toBe(true)
    const archive = blob([2])
    await act(async () => { second.resolve(archive); await flush() })
    expect(createUrl).toHaveBeenCalledExactlyOnceWith(archive)
    expect(saveAnchor()).not.toBeNull()
  })

  it('keeps removing completed files usable during preparation and ignores the cleared promise', async () => {
    const pending = deferred<globalThis.Blob>(), onClear = vi.fn()
    mocks.prepare.mockReturnValue(pending.promise)
    await render([completed('one.bin'), completed('two.bin')], { onClear })
    await act(async () => prepareButton().click())
    const clear = [...container.querySelectorAll('button')].find(button => button.textContent === 'Remove completed files')!
    expect(clear.disabled).toBe(false)
    await act(async () => clear.click())
    expect(onClear).toHaveBeenCalledOnce()
    await act(async () => { pending.resolve(blob()); await flush() })
    expect(createUrl).not.toHaveBeenCalled()
    expect(saveAnchor()).toBeNull()
  })

  it('ignores preparation that resolves after unmount without creating an orphan URL', async () => {
    const pending = deferred<globalThis.Blob>()
    mocks.prepare.mockReturnValue(pending.promise)
    await render([completed('one.bin'), completed('two.bin')])
    await act(async () => prepareButton().click())
    await unmount()
    await act(async () => { pending.resolve(blob()); await flush() })
    expect(createUrl).not.toHaveBeenCalled()
    expect(revokeUrl).not.toHaveBeenCalled()
  })

  it('announces a preparation failure and leaves a working retry without a false ready link', async () => {
    mocks.prepare.mockRejectedValue(new Error('Out of memory'))
    await render([completed('one.bin'), completed('two.bin')])
    await act(async () => { prepareButton().click(); await flush() })
    expect(container.querySelector('[role=status]')?.textContent).toMatch(/could not|failed|try again/i)
    expect(prepareButton().disabled).toBe(false)
    expect(saveAnchor()).toBeNull()
    expect(createUrl).not.toHaveBeenCalled()
  })
})
