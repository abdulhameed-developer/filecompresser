// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { File, Blob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CompressionSettings from '@/components/CompressionSettings'
import FileItem from '@/components/FileItem'
import ImageComparison from '@/components/ImageComparison'
import OutputFormatPicker from '@/components/OutputFormatPicker'
import DownloadActions from '@/components/DownloadActions'
import { getTool } from '@/lib/tools'
import type { QueueItem, SettingValue } from '@/lib/types'
import type { ImageSourceProbe } from '@/lib/engines/image'

const mocks = vi.hoisted(() => ({ available: vi.fn(), zip: vi.fn(), individual: vi.fn(), download: vi.fn() }))
vi.mock('@/lib/engines/image', () => ({ availableOutputFormats: mocks.available }))
vi.mock('@/lib/downloads', () => ({ prepareDownloadZip: mocks.zip, safeDownloadFilename: (name: string) => name, downloadItemsIndividually: mocks.individual, downloadBlob: mocks.download }))

let root: Root
let container: HTMLDivElement
let settings: Record<string, SettingValue>
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const file = (name = 'photo.jpg', size = 200_000) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' }) as unknown as globalThis.File

function SettingsHarness({ initial = { imageMode: 'balanced' }, format = 'jpeg' }: { initial?: Record<string, SettingValue>; format?: string }) {
  const [value, setValue] = useState<Record<string, SettingValue>>(initial)
  settings = value
  return <CompressionSettings tool={getTool('jpg-compressor')!} level="recommended" imageFormat={format} onLevel={() => {}} settings={value} onSetting={(id, next) => setValue(previous => ({ ...previous, [id]: next }))} />
}

function completed(name = 'photo.jpg'): QueueItem {
  return {
    id: name, name, file: file(name), mimeType: 'image/jpeg', originalSize: 200_000,
    inputFormat: 'jpeg', status: 'completed', progress: 100, outputSize: 1,
    result: { blob: new Blob([new Uint8Array(100_000)], { type: 'image/jpeg' }) as unknown as globalThis.Blob, filename: name.replace('.jpg', '-compressed.jpg'), mimeType: 'image/jpeg', outcome: 'target-met', targetBytes: 50_000, inspection: { inputWidth: 4000, inputHeight: 3000, outputWidth: 4000, outputHeight: 3000, inputFormat: 'jpeg', outputFormat: 'jpeg', elapsedMs: 1250, encoder: 'Test encoder', metadataNote: 'Metadata removed.' } },
  }
}

beforeEach(() => {
  vi.stubGlobal('File', File)
  vi.stubGlobal('Blob', Blob)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.available.mockReset().mockResolvedValue(['jpeg', 'png', 'webp'])
  mocks.zip.mockReset().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }))
  mocks.individual.mockReset().mockResolvedValue(undefined)
  mocks.download.mockReset()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('image settings that match actual byte and dimension choices', () => {
  it('does not expose fake quality controls for a generic non-image selection', async () => {
    await act(async () => root.render(<CompressionSettings tool={getTool('compress')!} level="recommended" imageSettings={false} settings={{}} onLevel={() => {}} onSetting={() => {}} />))
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
  })

  it('sets an exact decimal-byte ceiling from presets and a custom maximum', async () => {
    await act(async () => root.render(<SettingsHarness initial={{ imageMode: 'target' }} />))
    const preset = [...container.querySelectorAll('button')].find(button => button.textContent === '50 KB')!
    await act(async () => preset.click())
    expect(settings.targetSize).toBe(50_000)
    expect(container.textContent).toContain('50,000 bytes')
    const input = container.querySelector('input[type=number]') as HTMLInputElement
    await act(async () => { input.value = '12.5'; Simulate.change(input) })
    expect(settings.targetSize).toBe(12_500)
    expect(container.textContent).toContain('12,500 bytes')
  })

  it('offers quality controls without exposing image resize dimensions', async () => {
    await act(async () => root.render(<SettingsHarness />))
    expect(container.querySelector('input[type=number]')).toBeNull()
    expect(container.querySelector('input[type=checkbox], .resizeToggle, .resizeFields')).toBeNull()
    expect(container.querySelector('input[type=range]')).not.toBeNull()
    expect(Object.keys(settings).some(key => key.startsWith('resize'))).toBe(false)
  })

  it('clears an explicit quality override when a different mode is chosen', async () => {
    await act(async () => root.render(<SettingsHarness initial={{ imageMode: 'balanced', quality: .74 }} />))
    const maximum = [...container.querySelectorAll('button')].find(button => button.querySelector('span')?.textContent === 'Maximum')!
    await act(async () => maximum.click())
    expect(settings.imageMode).toBe('maximum')
    expect(settings.quality).toBe('')
  })
})

it('checks transparency across the batch before permitting JPG conversion', async () => {
  const files = [file('opaque.jpg'), file('alpha.png')]
  mocks.available.mockImplementation(async (input: globalThis.File) => input.name === 'alpha.png' ? ['png', 'webp'] : ['jpeg', 'png', 'webp'])
  function Picker() {
    const [value, setValue] = useState('jpeg')
    return <OutputFormatPicker file={files[0]} files={files} value={value} onChange={setValue} />
  }
  await act(async () => { root.render(<Picker />); await flush(); await flush() })
  expect(mocks.available).toHaveBeenCalledTimes(2)
  expect(container.querySelector('option[value=jpeg]')).toBeNull()
  expect((container.querySelector('select') as HTMLSelectElement).value).toBe('')
  expect(container.textContent).toContain('JPG was cleared')
})

it('explains JPEG exclusion when full opacity cannot be proved despite an opaque browser probe', async () => {
  const input = file('nearopaque16.png')
  mocks.available.mockImplementation(async (original: globalThis.File, _signal: unknown, onProbe?: (probe: ImageSourceProbe) => void) => {
    onProbe?.({ file: original, format: 'png', width: 2, height: 2, hasAlpha: false, jpegSafe: false })
    return ['png', 'webp']
  })
  function Picker() {
    const [value, setValue] = useState('jpeg')
    return <OutputFormatPicker file={input} value={value} onChange={setValue} />
  }
  await act(async () => { root.render(<Picker />); await flush(); await flush() })
  expect(container.querySelector('option[value=jpeg]')).toBeNull()
  expect((container.querySelector('select') as HTMLSelectElement).value).toBe('')
  expect(container.querySelector('.formatNotice')?.textContent).toContain('opacity could not be safely verified')
  expect(container.querySelector('.formatNotice')?.textContent).not.toContain('may contain transparency')
})

it('marks a missed target from actual output bytes even if stale result flags say success', async () => {
  await act(async () => root.render(<ul><FileItem item={completed()} tool={getTool('jpg-compressor')!} onCancel={() => {}} onRemove={() => {}} onRetry={() => {}} /></ul>))
  expect(container.querySelector('.resultBadge')?.textContent).toBe('Target not met')
  expect(container.textContent).toContain('Maximum 50,000 bytes; result 100,000 bytes')
  expect(container.textContent).toContain('4,000 × 3,000 px')
  expect(container.textContent).toContain('1.25 s processing')
  expect(container.textContent).not.toContain('Done')
  expect(container.querySelector('.compareButton')).not.toBeNull()
})

it('identifies retained originals even when a target-met MIME correction wraps the original bytes', async () => {
  const item = completed()
  item.result = { ...item.result!, blob: new Blob([new Uint8Array(item.originalSize)], { type: 'image/jpeg' }) as unknown as globalThis.Blob, outcome: 'target-met', targetBytes: 250_000, inspection: { ...item.result!.inspection!, encoder: 'Original file', compressionKind: 'original' } }
  expect(item.result.blob).not.toBe(item.file)
  await act(async () => root.render(<ul><FileItem item={item} tool={getTool('jpg-compressor')!} onCancel={() => {}} onRemove={() => {}} onRetry={() => {}} /></ul>))
  expect(container.querySelector('.resultBadge')?.textContent).toBe('Target met')
  expect(container.querySelector('.fileMetrics')?.textContent).toContain('Original download')
  expect(container.querySelector('.fileDownloadButton')?.textContent).toContain('Download original')
  expect(container.textContent).toContain('200,000 bytes')
})

it('prepares one ZIP with a native save link and keeps individual downloads on result cards', async () => {
  const OriginalURL = URL
  vi.stubGlobal('URL', Object.assign(class extends OriginalURL {}, { createObjectURL: vi.fn(() => 'blob:prepared-zip'), revokeObjectURL: vi.fn() }))
  const items = [completed('one.jpg'), completed('two.jpg')]
  await act(async () => root.render(<DownloadActions items={items} />))
  const zip = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Prepare 2 results as ZIP'))!
  await act(async () => { zip.click(); await flush() })
  expect(mocks.zip).toHaveBeenCalledWith(items)
  expect(container.querySelector('a[download]')?.getAttribute('href')).toBe('blob:prepared-zip')
  expect(container.querySelector('a[download]')?.textContent).toContain('Save ZIP (2 files)')
  expect(mocks.individual).not.toHaveBeenCalled()
  expect(container.textContent).toContain('200,000 bytes')
})

it('compares at actual-pixel scale and releases both local URLs when closed', async () => {
  const create = vi.fn().mockReturnValueOnce('blob:original').mockReturnValueOnce('blob:result')
  const revoke = vi.fn()
  const OriginalURL = URL
  vi.stubGlobal('URL', Object.assign(class extends OriginalURL {}, { createObjectURL: create, revokeObjectURL: revoke }))
  const prototype = HTMLDialogElement.prototype
  const priorShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  const priorClose = Object.getOwnPropertyDescriptor(prototype, 'close')
  Object.defineProperty(prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  function Comparison() {
    const [open, setOpen] = useState(true)
    return open ? <ImageComparison original={file()} output={new Blob(['result']) as unknown as globalThis.Blob} outputName="result.jpg" resultLabel="Previous result" inputWidth={4000} inputHeight={3000} outputWidth={4000} outputHeight={3000} onClose={() => setOpen(false)} /> : null
  }
  try {
    await act(async () => root.render(<Comparison />))
    expect(container.querySelector('section[aria-label="Previous result image"] strong')?.textContent).toBe('Previous result')
    const select = container.querySelector('select') as HTMLSelectElement
    await act(async () => { select.value = '1'; Simulate.change(select) })
    expect([...container.querySelectorAll('img')].map(image => image.style.width)).toEqual(['4000px', '4000px'])
    const close = container.querySelector('button[aria-label="Close image comparison"]') as HTMLButtonElement
    await act(async () => close.click())
    expect(container.querySelector('dialog')).toBeNull()
    expect(revoke.mock.calls.map(call => call[0]).sort()).toEqual(['blob:original', 'blob:result'])
  } finally {
    await act(async () => root.render(null))
    if (priorShow) Object.defineProperty(prototype, 'showModal', priorShow)
    else Reflect.deleteProperty(prototype, 'showModal')
    if (priorClose) Object.defineProperty(prototype, 'close', priorClose)
    else Reflect.deleteProperty(prototype, 'close')
  }
})
