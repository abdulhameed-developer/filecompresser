// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { Blob, File } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToolWorkspace from '@/components/ToolWorkspace'
import { TOOLS, getTool } from '@/lib/tools'
import type { ImageSourceProbe } from '@/lib/engines/image'
import type { ProcessedResult, ProcessingOptions } from '@/lib/types'
import { listenForCancellation, ProcessingError } from '@/lib/types'

const mocks = vi.hoisted(() => ({ process: vi.fn(), formats: vi.fn(), download: vi.fn(), zip: vi.fn() }))
vi.mock('@/lib/process', () => ({ processFile: mocks.process, concurrencyFor: () => 1, engineForFormat: async (format: string) => format === 'pdf' ? 'pdf-compress' : 'image-compress' }))
vi.mock('@/lib/engines/image', async () => ({ availableOutputFormats: mocks.formats, expectedImageGeometry: (await import('../workers/image-metadata.mjs')).imageGeometry }))
vi.mock('@/lib/downloads', () => ({ revokeItemUrl: () => {}, downloadItemsIndividually: mocks.download, downloadBlob: mocks.download, prepareDownloadZip: mocks.zip, safeDownloadFilename: (name: string) => name }))
let root: Root
let container: HTMLDivElement
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const image = (name = 'photo.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff, 1]), new Uint8Array(199_996)], name, { type: 'image/jpeg' }) as unknown as globalThis.File
function result(file: globalThis.File, options: ProcessingOptions): ProcessedResult {
  const format = String(options.outputFormat || 'jpeg')
  const bytes = options.quality === .74 ? 80_000 : format === 'webp' ? 60_000 : 100_000
  const width = options.resizeEnabled ? Number(options.resizeMaxWidth) || 4000 : 4000
  return { blob: new Blob([new Uint8Array(bytes)], { type: `image/${format}` }) as unknown as globalThis.Blob, filename: `${file.name.split('.')[0]}-compressed.${format === 'jpeg' ? 'jpg' : format}`, mimeType: `image/${format}`, outcome: 'reduced', inspection: { inputWidth: 4000, inputHeight: 3000, outputWidth: width, outputHeight: Math.round(width * .75), inputFormat: 'jpeg', outputFormat: format, elapsedMs: 100, encoder: 'Test encoder', metadataNote: 'Metadata removed.' } }
}
beforeEach(() => {
  vi.stubGlobal('File', File); vi.stubGlobal('Blob', Blob); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  mocks.formats.mockReset().mockImplementation(async (file: globalThis.File, _signal: unknown, onProbe?: (probe: ImageSourceProbe) => void) => {
    onProbe?.({ file, format: 'jpeg', width: file.name === 'portrait.jpg' ? 3000 : 4000, height: file.name === 'portrait.jpg' ? 4000 : 3000, hasAlpha: false })
    return ['jpeg', 'png', 'webp']
  })
  mocks.process.mockReset().mockImplementation(async ({ file, options }) => result(file, options))
  mocks.download.mockReset().mockResolvedValue(undefined); mocks.zip.mockReset().mockResolvedValue(new Blob(['zip']))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function mount(slug = 'jpg-compressor') { await act(async () => { root.render(<ToolWorkspace tool={getTool(slug)!} />); await flush() }) }
async function upload(files: globalThis.File[]) {
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: files }); Simulate.change(input); await flush(); await flush(); await flush() })
}
function button(text: string) { return [...container.querySelectorAll<HTMLButtonElement>('button')].find(element => { const label = element.cloneNode(true) as HTMLElement; label.querySelectorAll('.srInline').forEach(child => child.remove()); return label.textContent?.trim() === text }) }
async function click(element: HTMLElement) { await act(async () => { element.click(); await flush(); await flush() }) }
async function change(input: HTMLInputElement | HTMLSelectElement, value: string) { await act(async () => { input.value = value; Simulate.change(input); await flush() }) }
const primary = () => container.querySelector<HTMLButtonElement>('.workflowPrimaryActions > .compressBtn')

it.each(TOOLS.map(tool => [tool.slug]))('starts %s with upload and no premature settings', async slug => {
  await mount(slug)
  expect(container.querySelector('.dropzone')).not.toBeNull()
  expect(container.querySelector('.workspaceSettings')).toBeNull()
  expect(container.querySelector('.workspaceSteps')).toBeNull()
  expect(container.querySelector('input[type=range]')).toBeNull()
  expect(primary()).toBeNull()
})

describe('original → draft → applied result journeys', () => {
  it('prevents native cancel activation from becoming a submit or restarting the run', async () => {
    await mount(); await upload([image()]); await click(primary()!)
    await change(container.querySelector('input[type=range]')!, '74')
    mocks.process.mockImplementationOnce(({ signal }) => new Promise((_resolve, reject) => {
      listenForCancellation(signal, () => reject(new ProcessingError('Processing was cancelled.', 'cancelled')))
    }))
    await click(primary()!)
    const cancel = button('Cancel processing')!
    const activation = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => { cancel.dispatchEvent(activation); await flush(); await flush() })
    expect(activation.defaultPrevented).toBe(true)
    expect(cancel.isConnected).toBe(false)
    expect(primary()).not.toBe(cancel)
    expect(mocks.process).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Latest attempt cancelled')
  })
  it('compresses, changes quality, keeps the old artifact clearly labeled, and recompresses the original', async () => {
    await mount()
    const original = image()
    await upload([original])
    expect(primary()?.textContent).toContain('Compress')
    expect(primary()?.disabled).toBe(false)
    expect(container.querySelector('form')?.firstElementChild?.classList.contains('workflowActionBar')).toBe(true)
    await click(primary()!)
    expect(mocks.process.mock.calls[0][0].file).toBe(original)
    expect(container.querySelector('.workflowConfig')?.textContent).toContain('Quality 60%')
    expect(button('Download file')).toBeDefined()
    const quality = container.querySelector<HTMLInputElement>('input[type=range]')!
    await change(quality, '74')
    expect(container.querySelector('.customQualityLabel')?.textContent).toBe('Custom quality')
    expect(container.querySelectorAll('.imageModeOption[aria-pressed=true]')).toHaveLength(0)
    expect(container.querySelector('.previousResultNotice')?.textContent).toContain('Recompress to apply')
    expect(container.querySelector('.workflowConfig')?.textContent).toContain('Quality 60%')
    expect(button('Download previous')).toBeDefined()
    expect(primary()?.textContent).toContain('Recompress')
    await act(async () => { Simulate.submit(container.querySelector('form')!); await flush(); await flush() })
    expect(mocks.process.mock.calls[1][0].file).toBe(original)
    expect(mocks.process.mock.calls[1][0].options.quality).toBe(.74)
    expect(container.querySelector('.previousResultNotice')).toBeNull()
    expect(container.querySelector('.workflowConfig')?.textContent).toContain('Custom quality · Quality 74%')
    expect(container.textContent).toContain('80,000 bytes')
  })

  it('makes conversion intentional and restores the successful setup without reupload', async () => {
    await mount(); await upload([image()]); await click(primary()!)
    const select = container.querySelector<HTMLSelectElement>('.outputFormatField select')!
    await change(select, 'webp')
    expect(primary()?.textContent).toContain('Convert to WEBP')
    expect(container.querySelector('.previousResultNotice')?.textContent).toContain('Convert again to apply them.')
    expect(container.querySelector('.fileMetrics')?.textContent).toContain('JPG')
    expect(container.querySelector('.workflowConfig')?.textContent).toContain('Original format')
    await click(button('Restore applied')!)
    expect(select.value).toBe('')
    expect(container.querySelector('.previousResultNotice')).toBeNull()
    await change(select, 'webp'); await click(primary()!)
    expect(container.querySelector('.fileMetrics')?.textContent).toContain('WEBP')
    expect(container.querySelector('.workflowConfig')?.textContent).toContain('WEBP output')
    await click(button('Reset')!)
    expect(primary()?.textContent).toContain('Recompress')
    expect(container.querySelector('.previousResultNotice')).not.toBeNull()
  })

  it('protects settings during a run and keeps the old download after cancellation and retry failure', async () => {
    await mount(); const original = image(); await upload([original]); await click(primary()!)
    await change(container.querySelector('input[type=range]')!, '74')
    let finish!: () => void
    mocks.process.mockImplementationOnce(async ({ file, options }) => { await new Promise<void>(resolve => { finish = resolve }); return result(file, options) })
    await click(primary()!)
    expect((container.querySelector('.workspaceSettings') as HTMLFieldSetElement).disabled).toBe(true)
    expect(container.querySelector('.previousResultNotice')?.textContent).toContain('This previous download is unchanged')
    await click(button('Cancel processing')!)
    await act(async () => { finish(); await flush(); await flush() })
    expect(container.textContent).toContain('Latest attempt cancelled')
    expect(button('Download previous')).toBeDefined()
    mocks.process.mockRejectedValueOnce(new Error('Encoder unavailable; retry this source.'))
    await click(primary()!)
    expect(container.textContent).toContain('Encoder unavailable')
    expect(button('Download previous')).toBeDefined()
    await click(button('Retry')!)
    expect(mocks.process.mock.calls.at(-1)![0].file).toBe(original)
    expect(container.querySelector('.previousResultNotice')).toBeNull()
  })

  it('reprocesses only selected sources and keeps the other saved result', async () => {
    await mount(); const first = image('one.jpg'); const second = image('two.jpg')
    await upload([first, second]); await click(primary()!)
    expect(mocks.process).toHaveBeenCalledTimes(2)
    const checks = container.querySelectorAll<HTMLInputElement>('.fileSelect input')
    await click(checks[1])
    await change(container.querySelector('input[type=range]')!, '74')
    await click(primary()!)
    expect(mocks.process).toHaveBeenCalledTimes(3)
    expect(mocks.process.mock.calls[2][0].file).toBe(first)
    const cards = container.querySelectorAll('.resultFile')
    expect(cards[0].querySelector('.workflowConfig')?.textContent).toContain('Quality 74%')
    expect(cards[1].querySelector('.workflowConfig')?.textContent).toContain('Quality 60%')
    expect(cards[1].querySelector('.previousResultNotice')).toBeNull()
    expect(cards[1].classList.contains('dirtyResultFile')).toBe(false)
    expect(cards[1].querySelector('.fileDownloadButton')).not.toBeNull()
  })

  it('shows image settings only for a compatible selected scope inside a mixed batch', async () => {
    await mount('compress')
    await upload([image(), new File(['%PDF-1.7\n'], 'document.pdf') as unknown as globalThis.File])
    expect(container.querySelector('.workspaceSettings')).toBeNull()
    expect(container.textContent).toContain('default settings')
    expect(primary()?.textContent).toContain('Process 2 files')
    await click(container.querySelectorAll<HTMLInputElement>('.fileSelect input')[1])
    expect(container.querySelector('.workspaceSettings')).not.toBeNull()
    expect(container.querySelector('input[type=range]')).not.toBeNull()
    await change(container.querySelector('input[type=range]')!, '74')
    await click(primary()!)
    expect(mocks.process).toHaveBeenCalledTimes(1)
    expect(mocks.process.mock.calls[0][0].options.quality).toBe(.74)
  })

  it.skip('removed resize controls', async () => {
    await mount(); await upload([image()])
    await click(button('Target size')!)
    expect(primary()?.disabled).toBe(true)
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Choose a target')
    await click(button('50 KB')!)
    expect(primary()?.disabled).toBe(false)
    await click(container.querySelector<HTMLInputElement>('.resizeToggle input')!)
    expect(primary()?.disabled).toBe(true)
    await change(container.querySelector<HTMLInputElement>('input[placeholder="e.g. 1920"]')!, '-10')
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Maximum width')
    await change(container.querySelector<HTMLInputElement>('input[placeholder="e.g. 1920"]')!, '1600')
    expect(primary()?.disabled).toBe(false)
    await click(primary()!)
    expect(mocks.process.mock.calls[0][0].options).toMatchObject({ targetSize: 50000, resizeEnabled: true, resizeMaxWidth: 1600 })
  })
  it('labels first-run partial successes as current while the remaining source is processing', async () => {
    await mount()
    await upload([image('one.jpg'), image('two.jpg'), image('three.jpg')])
    let finish!: () => void
    mocks.process.mockImplementation(async ({ file, options }) => {
      if (file.name === 'three.jpg') await new Promise<void>(resolve => { finish = resolve })
      return result(file, options)
    })
    await click(primary()!)
    expect(mocks.process).toHaveBeenCalledTimes(3)
    expect(button('Prepare ZIP (2 files)')).toBeDefined()
    expect(button('Prepare previous ZIP (2)')).toBeUndefined()
    expect(container.querySelectorAll('.previousResultNotice')).toHaveLength(0)
    await act(async () => { finish(); await flush(); await flush() })
  })

  it('distinguishes current and older artifacts during a partial batch recompression', async () => {
    await mount()
    await upload([image('one.jpg'), image('two.jpg'), image('three.jpg')])
    await click(primary()!)
    await change(container.querySelector('input[type=range]')!, '74')
    expect(button('Prepare previous ZIP (3)')).toBeDefined()
    let finish!: () => void
    mocks.process.mockImplementation(async ({ file, options }) => {
      if (file.name === 'three.jpg') await new Promise<void>(resolve => { finish = resolve })
      return result(file, options)
    })
    await click(primary()!)
    expect(button('Prepare available ZIP (3)')).toBeDefined()
    expect(container.querySelector('.compactDownloads')?.textContent).toContain('2 current · 1 previous result')
    expect(container.querySelectorAll('.previousResultNotice')).toHaveLength(1)
    await act(async () => { finish(); await flush(); await flush() })
    expect(button('Prepare ZIP (3 files)')).toBeDefined()
    expect(container.querySelector('.compactDownloads')?.textContent).not.toContain('previous result')
  })

  it('keeps mixed download context after one recompression fails without mislabeling the new success', async () => {
    await mount()
    await upload([image('one.jpg'), image('two.jpg')])
    await click(primary()!)
    await change(container.querySelector('input[type=range]')!, '74')
    mocks.process.mockImplementationOnce(async ({ file, options }) => result(file, options)).mockRejectedValueOnce(new Error('Second source failed.'))
    await click(primary()!)
    expect(button('Prepare available ZIP (2)')).toBeDefined()
    expect(container.querySelector('.compactDownloads')?.textContent).toContain('1 current · 1 previous result')
    expect(container.querySelectorAll('.previousResultNotice')).toHaveLength(1)
    expect(container.querySelectorAll('.resultFile')[0].textContent).toContain('Quality 74%')
    expect(container.querySelectorAll('.resultFile')[1].textContent).toContain('Quality 60%')
  })

  it('announces an actual missed target at the top while preserving the available download', async () => {
    await mount()
    await upload([image()])
    await click(button('Target size')!)
    await click(button('50 KB')!)
    mocks.process.mockImplementationOnce(async ({ file, options }) => ({ ...result(file, options), targetBytes: 50_000, outcome: 'target-met' }))
    await click(primary()!)
    expect(container.querySelector('.workflowPhase')?.textContent).toBe('Target not met')
    expect(container.querySelector('.workflowActionContext')?.textContent).toContain('Available to download; adjust settings to try again.')
    expect(container.querySelector('.resultBadge')?.textContent).toBe('Target not met')
    expect(button('Download file')).toBeDefined()
    expect(button('Download previous')).toBeUndefined()
  })


  it.skip('removed resize controls', async () => {
    await mount()
    await upload([image('landscape.jpg'), image('portrait.jpg')])
    expect(mocks.formats).toHaveBeenCalledTimes(2)
    const sourceFacts = container.querySelectorAll('.filePendingFacts')
    expect(sourceFacts[0].textContent).toContain('4,000 × 3,000 px')
    expect(sourceFacts[1].textContent).toContain('3,000 × 4,000 px')
    await click(container.querySelector<HTMLInputElement>('.resizeToggle input')!)
    const width = container.querySelector<HTMLInputElement>('input[placeholder="e.g. 1920"]')!
    const height = container.querySelector<HTMLInputElement>('input[placeholder="e.g. 1080"]')!
    await change(width, '1600')
    let rows = container.querySelectorAll('.resizePreview tbody tr')
    expect(rows[0].querySelector('td:last-child')?.textContent).toBe('1,600 × 1,200')
    expect(rows[1].querySelector('td:last-child')?.textContent).toBe('1,600 × 2,133')
    await change(height, '1000')
    rows = container.querySelectorAll('.resizePreview tbody tr')
    expect(rows[0].querySelector('td:last-child')?.textContent).toBe('1,333 × 1,000')
    expect(rows[1].querySelector('td:last-child')?.textContent).toBe('750 × 1,000')
    await change(height, '')
    await change(width, '8000')
    rows = container.querySelectorAll('.resizePreview tbody tr')
    expect(rows[0].querySelector('td:last-child')?.textContent).toBe('4,000 × 3,000')
    expect(rows[1].querySelector('td:last-child')?.textContent).toBe('3,000 × 4,000')
    await change(width, '-10')
    expect(container.querySelector('.resizePreview')).toBeNull()
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Maximum width')
    expect(mocks.formats).toHaveBeenCalledTimes(2)
    expect(mocks.process).not.toHaveBeenCalled()
  })


  it('describes WAV reconfiguration as conversion rather than recompression', async () => {
    await mount('wav-compressor')
    const wav = new File(['RIFF', new Uint8Array(4), 'WAVE', new Uint8Array(32)], 'audio.wav', { type: 'audio/wav' }) as unknown as globalThis.File
    mocks.process.mockResolvedValue({ blob: new Blob([new Uint8Array(20)], { type: 'audio/mpeg' }), filename: 'audio.mp3', mimeType: 'audio/mpeg' })
    await upload([wav])
    expect(primary()?.textContent).toContain('Convert to MP3')
    await click(primary()!)
    await change(container.querySelector('.workspaceSettings select')!, '128k')
    expect(primary()?.textContent).toContain('Convert again')
    expect(container.querySelector('.previousResultNotice')?.textContent).toContain('Convert again to apply them.')
    expect(container.querySelector('.previousResultNotice')?.textContent).not.toContain('Recompress')
  })

  it('connects an older ZIP to its previous inputs while retaining its snapshot counts', async () => {
    await mount('zip-compressor')
    mocks.process.mockResolvedValue({ blob: new Blob([new Uint8Array(20)], { type: 'application/zip' }), filename: 'files.zip', mimeType: 'application/zip' })
    await upload([image('one.jpg'), image('two.jpg')])
    expect(primary()?.textContent).toContain('Create ZIP')
    await click(primary()!)
    await upload([image('three.jpg')])
    expect(primary()?.textContent).toContain('Rebuild ZIP')
    expect(container.querySelector('.workflowPhase')?.textContent).toBe('Inputs changed')
    expect(container.querySelector('.workflowActionContext')?.textContent).toContain('Saved ZIP uses previous inputs')
    expect(container.querySelector('.workflowActionContext')?.textContent).not.toContain('previous settings')
    expect(container.querySelector('.previousResultNotice')?.textContent).toContain('Inputs have changed. Rebuild ZIP')
    expect(container.querySelector('.fileMetrics')?.textContent).toContain('2 source files')
    expect(container.querySelector('.fileMetrics')?.textContent).toContain('400,000 bytes')
    expect(container.querySelector('button[aria-label="Remove one.jpg from ZIP inputs"]')).not.toBeNull()
  })

  it('uses a processing action for mixed image, WAV and ZIP sources in the generic tool', async () => {
    await mount('compress')
    const wav = new File(['RIFF', new Uint8Array(4), 'WAVE', new Uint8Array(32)], 'audio.wav') as unknown as globalThis.File
    const zip = new File([new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0])], 'archive.zip') as unknown as globalThis.File
    await upload([image(), wav, zip])
    expect(primary()?.textContent).toContain('Process 3 files')
    expect(container.querySelector('.workspaceSettings')).toBeNull()
    const checks = container.querySelectorAll<HTMLInputElement>('.fileSelect input')
    await click(checks[1]); await click(checks[2])
    expect(primary()?.textContent).toContain('Compress')
    expect(container.querySelector('.workspaceSettings')).not.toBeNull()
  })

})

it('counts only sources that can run after an upload validation rejection', async () => {
  await mount(); await upload([image(), new File([], 'empty.jpg') as unknown as globalThis.File])
  expect(primary()?.textContent).toContain('Compress')
  expect(primary()?.textContent).not.toContain('2 files')
  expect(container.querySelector('.workflowActionContext')?.textContent).toContain('1 original file to process')
  await click(primary()!)
  expect(mocks.process).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain('This file is empty')
})

it('keeps selection and processing scope across paged compact cards, then clears every page', async () => {
  await mount()
  const originals = Array.from({ length: 13 }, (_, index) => image(`photo-${index + 1}.jpg`))
  await upload(originals)
  expect(container.querySelectorAll('.fileCard')).toHaveLength(6)
  expect(container.querySelector('.galleryPagination')?.textContent).toContain('Showing 1–6 of 13 files')
  const next = () => container.querySelector<HTMLButtonElement>('[aria-label="Next file page"]')!
  await click(next()); await click(next())
  expect(container.querySelectorAll('.fileCard')).toHaveLength(1)
  expect(container.querySelector('.galleryPagination')?.textContent).toContain('Showing 13–13 of 13 files')
  await click(container.querySelector<HTMLInputElement>('.fileSelect input')!)
  expect(container.querySelector('.workspaceScope')?.textContent).toContain('12 of 13 selected')
  await click(container.querySelector<HTMLButtonElement>('[aria-label="Previous file page"]')!)
  expect([...container.querySelectorAll<HTMLInputElement>('.fileSelect input')].every(input => input.checked)).toBe(true)
  await click(primary()!)
  expect(mocks.process.mock.calls.map(call => call[0].file)).toEqual(originals.slice(0, 12))
  expect(container.querySelector('.compactDownloads')?.textContent).toContain('12')
  await click(button('Clear all')!)
  expect(container.querySelector('.fileGallery')).toBeNull()
  expect(container.querySelector('.workspaceSettings')).toBeNull()
  expect(container.querySelector('.compactDownloads')).toBeNull()
})

it('uses Maximum on upload and reset, while an explicit Balanced choice remains available', async () => {
  await mount(); await upload([image()])
  expect(container.querySelector('.imageModeOption[aria-pressed=true]')?.textContent).toBe('Maximum')
  expect((container.querySelector('input[type=range]') as HTMLInputElement).value).toBe('60')
  await click(button('Balanced')!)
  expect((container.querySelector('input[type=range]') as HTMLInputElement).value).toBe('82')
  await click(primary()!)
  expect(mocks.process.mock.calls[0][0].options).toMatchObject({ imageMode: 'balanced', quality: .82 })
  await click(button('Reset')!)
  expect(container.querySelector('.imageModeOption[aria-pressed=true]')?.textContent).toBe('Maximum')
  expect(primary()?.textContent).toContain('Recompress')
  await click(primary()!)
  expect(mocks.process.mock.calls[1][0].options).toMatchObject({ imageMode: 'maximum', quality: .6 })
})

it('opens and focuses collapsed settings from the main action without starting processing', async () => {
  await mount(); await upload([image()])
  const panel = container.querySelector<HTMLDialogElement>('.settingsDialog')!
  const shortcut = container.querySelector<HTMLButtonElement>('.workflowSettingsShortcut')!
  expect(shortcut.getAttribute('aria-controls')).toBe(panel.id)
  expect(shortcut.getAttribute('aria-expanded')).toBe('false')
  await click(shortcut)
  expect(panel.open).toBe(true)
  expect(shortcut.getAttribute('aria-expanded')).toBe('true')
  expect(panel.querySelector('h2')?.textContent).toBe('Settings')
  expect(mocks.process).not.toHaveBeenCalled()
  await click(button('Done')!)
  expect(panel.open).toBe(false)
  expect(document.activeElement).toBe(shortcut)
})

it('keeps converter settings contextual and exposes its fixed output format', async () => {
  await mount('webm-to-mp4')
  const webm = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x93])], 'recording.webm', { type: 'video/webm' }) as unknown as globalThis.File
  await upload([webm])
  expect(primary()?.textContent).toContain('Convert to MP4')
  const panel = container.querySelector<HTMLDialogElement>('.settingsDialog')!
  expect(panel.querySelector('.conversionOutput')?.textContent).toContain('MP4 · H.264 video')
  expect(panel.querySelector('.compressionLevel')).toBeNull()
  await click(container.querySelector<HTMLButtonElement>('.workflowSettingsShortcut')!)
  expect(panel.open).toBe(true)
})

it('defaults PNG to Maximum while keeping Lossless available without a JPEG quality slider', async () => {
  await mount('png-compressor')
  await upload([new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'graphic.png', { type: 'image/png' }) as unknown as globalThis.File])
  expect(container.querySelector('.pngModeBlock .imageModeOption[aria-pressed=true]')?.textContent).toBe('Maximum')
  expect(container.querySelector('input[type=range]')).toBeNull()
  await click(button('Lossless')!)
  expect(container.querySelector('.pngModeBlock .imageModeOption[aria-pressed=true]')?.textContent).toBe('Lossless')
  await click(button('Reset')!)
  expect(container.querySelector('.pngModeBlock .imageModeOption[aria-pressed=true]')?.textContent).toBe('Maximum')
})
