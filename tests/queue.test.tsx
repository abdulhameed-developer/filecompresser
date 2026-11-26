// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { File, Blob, Buffer } from 'node:buffer'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useFileQueue, type FileQueue } from '@/lib/useFileQueue'
import { getTool } from '@/lib/tools'
import CompressionSettings from '@/components/CompressionSettings'
import type { ToolDefinition, SettingValue } from '@/lib/types'

const mocks = vi.hoisted(() => ({ processFile: vi.fn() }))
vi.mock('@/lib/process', () => ({
  processFile: mocks.processFile,
  concurrencyFor: () => 1,
  engineForFormat: async (format: string) => format === 'pdf' ? 'pdf-compress' : 'image-compress',
}))
let root: Root, container: HTMLDivElement, queue: FileQueue
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
function Harness({ tool }: { tool: ToolDefinition }) {
  queue = useFileQueue(tool)
  return null
}
const jpeg = (name = 'a.jpg') =>
  new File(
    [new Uint8Array([0xff, 0xd8, 0xff, 1])],
    name,
  ) as unknown as globalThis.File
beforeEach(() => {
  vi.stubGlobal('File', File)
  vi.stubGlobal('Blob', Blob)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.processFile.mockReset().mockImplementation(async () => ({
    blob: new Blob(['output']),
    filename: 'result.jpg',
    mimeType: 'image/jpeg',
  }))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
async function mount(slug = 'jpg-compressor') {
  await act(async () => root.render(<Harness tool={getTool(slug)!} />))
}
async function add(files: globalThis.File[]) {
  await act(async () => {
    queue.addFiles(files)
    await flush()
  })
}
async function run() {
  await act(async () => {
    queue.runAll()
    await flush()
  })
}

describe('queue workflows', () => {
  it('processes valid selected sources without rerunning validation-rejected rows', async () => {
    await mount('compress')
    await add([jpeg(), new File([], 'empty.jpg') as unknown as globalThis.File])
    expect(queue.items[1].status).toBe('failed')
    await act(async () => { queue.reprocessSelected(queue.items.map(item => item.id)); await flush(); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(1)
    expect(queue.items[0].status).toBe('completed')
    expect(queue.items[1].status).toBe('failed')
    expect(queue.status.text).toContain('1 job finished')
  })

  it('uses defaults for a mixed generic batch after image controls become hidden', async () => {
    await mount('compress')
    await add([jpeg()])
    await act(async () => {
      queue.setLevel('maximum')
      queue.setSetting('imageMode', 'target')
      queue.setSetting('targetSize', '')
      queue.setSetting('quality', 0.4)
      queue.setSetting('resizeEnabled', true)
      queue.setSetting('resizeMaxWidth', 100)
      queue.setSetting('resizeMaxHeight', 100)
      queue.setSetting('outputFormat', 'webp')
      queue.setSetting('bitrate', '128k')
    })
    expect(queue.settingsError).toContain('Choose a target')
    await add([new File(['%PDF-1.7\n'], 'document.pdf') as unknown as globalThis.File])
    expect(queue.items.map(item => item.inputFormat)).toEqual(['jpeg', 'pdf'])
    expect(queue.settingsError).toBeNull()
    await run()
    expect(mocks.processFile).toHaveBeenCalledTimes(2)
    expect(mocks.processFile.mock.calls[0][0].options).toEqual({ imageMode: 'maximum', quality: 0.6 })
    expect(mocks.processFile.mock.calls[1][0].options).toEqual({})
    expect(mocks.processFile.mock.calls.map(([request]) => request.engine)).toEqual(['image-compress', 'pdf-compress'])
  })
  it('preserves explicit image options for an all-image generic batch', async () => {
    await mount('compress')
    await add([jpeg()])
    await act(async () => {
      queue.setSetting('imageMode', 'target')
      queue.setSetting('targetSize', 50_000)
      queue.setSetting('resizeEnabled', true)
      queue.setSetting('resizeMaxWidth', 1000)
      queue.setSetting('outputFormat', 'webp')
    })
    expect(queue.settingsError).toBeNull()
    await run()
    expect(mocks.processFile.mock.calls[0][0].options).toMatchObject({ imageMode: 'target', targetSize: 50_000, outputFormat: 'webp' })
  })
  it.each([
    [{ imageMode: 'target', targetSize: '' }, 'Choose a target'],
    [{ imageMode: 'target', targetSize: -1 }, 'whole bytes'],
    [{ imageMode: 'target', targetSize: 200_000_001 }, 'whole bytes'],
  ] as [Record<string, SettingValue>, string][])('blocks invalid active image settings %# before an engine starts', async (settings, message) => {
    await mount()
    await add([jpeg()])
    await act(async () => {
      for (const [key, value] of Object.entries(settings)) queue.setSetting(key, value)
    })
    expect(queue.settingsError).toContain(message)
    await run()
    expect(mocks.processFile).not.toHaveBeenCalled()
    expect(queue.busy).toBe(false)
    expect(queue.items[0].status).toBe('queued')
    expect(queue.status).toMatchObject({ kind: 'error', text: queue.settingsError })
  })
  it('ignores inactive target and resize values', async () => {
    await mount()
    await add([jpeg()])
    await act(async () => {
      queue.setSetting('imageMode', 'balanced')
      queue.setSetting('targetSize', '')
      queue.setSetting('resizeEnabled', false)
      queue.setSetting('resizeMaxWidth', -10)
    })
    expect(queue.settingsError).toBeNull()
    await run()
    expect(mocks.processFile).toHaveBeenCalledOnce()
  })
  it('clears the completion message when results are cleared', async () => {
    await mount()
    await add([jpeg()])
    await run()
    expect(queue.completedCount).toBe(1)
    expect(queue.status.kind).not.toBe('idle')
    await act(async () => queue.clearCompleted())
    expect(queue.items).toHaveLength(0)
    expect(queue.status).toEqual({ kind: 'idle', text: '' })
  })
  it('cancels a ZIP batch when a secondary input is removed during processing', async () => {
    await mount('zip-compressor')
    await add([jpeg('one.jpg'), jpeg('two.jpg')])
    let finish!: () => void
    mocks.processFile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return {
        blob: new Blob(['archive']),
        filename: 'archive.zip',
        mimeType: 'application/zip',
      }
    })
    await run()
    await act(async () => {
      queue.removeItem(queue.items[1].id)
      finish()
      await flush()
    })
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].status).toBe('cancelled')
    expect(queue.items[0].result).toBeUndefined()
  })
  it('revalidates a failed retry and never sends oversized files to an engine', async () => {
    await mount()
    const input = jpeg()
    Object.defineProperty(input, 'size', { value: 51 * 1024 * 1024 })
    await add([input])
    expect(queue.items[0].status).toBe('failed')
    await act(async () => {
      queue.retryItem(queue.items[0].id)
      await flush()
    })
    expect(queue.items[0].status).toBe('failed')
    expect(mocks.processFile).not.toHaveBeenCalled()
  })
  it('cancel all prevents the waiting file from starting and blocks overlapping retries', async () => {
    await mount()
    await add([jpeg('one.jpg'), jpeg('two.jpg')])
    let finish!: () => void
    mocks.processFile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return {
        blob: new Blob(['result']),
        filename: 'result.jpg',
        mimeType: 'image/jpeg',
      }
    })
    await run()
    expect(mocks.processFile).toHaveBeenCalledTimes(1)
    await act(async () => {
      queue.cancelAll()
      queue.retryItem(queue.items[0].id)
      finish()
      await flush()
    })
    expect(mocks.processFile).toHaveBeenCalledTimes(1)
    expect(queue.items.every((item) => item.status === 'cancelled')).toBe(true)
  })
  it('retains every ZIP input after a failure, then retries the entire batch', async () => {
    await mount('zip-compressor')
    await add([jpeg('one.jpg'), jpeg('two.jpg')])
    mocks.processFile.mockRejectedValueOnce(new Error('temporary failure'))
    await run()
    expect(queue.items).toHaveLength(2)
    expect(queue.items.every((item) => item.status === 'failed')).toBe(true)
    await act(async () => {
      queue.retryItem(queue.items[0].id)
      await flush()
    })
    expect(mocks.processFile.mock.calls[1][0].allFiles).toHaveLength(2)
    expect(queue.items).toHaveLength(2)
    expect(queue.items.map(item => item.originalSize)).toEqual([4, 4])
    expect(queue.items[0].sourceCount).toBe(2)
    expect(queue.resultItems).toHaveLength(1)
    expect(queue.resultItems[0].originalSize).toBe(8)
  })
  it('does not append results after a route change', async () => {
    await mount()
    await add([jpeg()])
    let finish!: () => void
    mocks.processFile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return {
        blob: new Blob(['result']),
        filename: 'r.jpg',
        mimeType: 'image/jpeg',
      }
    })
    await run()
    await act(async () =>
      root.render(<Harness tool={getTool('png-compressor')!} />),
    )
    await act(async () => {
      finish()
      await flush()
    })
    expect(queue.items).toHaveLength(0)
    expect(queue.busy).toBe(false)
  })
})

it('keeps KB display stable after entering a target and clearing it', async () => {
  function Settings() {
    const [settings, set] = useState<Record<string, SettingValue>>({
      outputFormat: 'jpeg',
      imageMode: 'target',
    })
    return (
      <CompressionSettings
        tool={getTool('jpg-compressor')!}
        level="maximum"
        onLevel={() => {}}
        settings={settings}
        onSetting={(id, value) =>
          set((previous) => ({ ...previous, [id]: value }))
        }
      />
    )
  }
  await act(async () => root.render(<Settings />))
  const input = container.querySelector(
    'input[type=number]',
  ) as HTMLInputElement
  await act(async () => {
    input.value = '200'
    Simulate.change(input)
  })
  expect(input.value).toBe('200')
  await act(async () => {
    input.value = ''
    Simulate.change(input)
  })
  expect(input.value).toBe('')
  await act(async () => {
    input.value = '-1'
    Simulate.change(input)
  })
  expect(input.value).toBe('-1')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(container.textContent).toContain('Enter 0.001 to 200,000 KB.')
})

it('offers a PNG target strategy without a fake JPEG quality slider', async () => {
  await act(async () =>
    root.render(
      <CompressionSettings
        tool={getTool('png-compressor')!}
        level="maximum"
        imageFormat="png"
        onLevel={() => {}}
        settings={{ pngMode: 'target', targetSize: 50000 }}
        onSetting={() => {}}
      />,
    ),
  )
  expect(container.querySelector('input[type=number]')).not.toBeNull()
  expect(container.querySelector('input[type=range]')).toBeNull()
  expect(container.textContent).toContain('PNG mode')
  expect(container.textContent).toContain('50,000 bytes')
})

describe('source-preserving reprocessing', () => {
  it('terminates the last actual image worker after four batch successes and retains its previous artifact', async () => {
    class PausedWorker {
      static instances: PausedWorker[] = []
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      terminate = vi.fn()
      postMessage = vi.fn()
      constructor() { PausedWorker.instances.push(this) }
    }
    vi.stubGlobal('Worker', PausedWorker)
    await mount('png-compressor')
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
    await add(Array.from({ length: 5 }, (_, index) => new File([bytes], `${index + 1}.png`, { type: 'image/png' }) as unknown as globalThis.File))
    await act(async () => queue.setSetting('pngMode', 'lossless'))
    await run()
    const previous = queue.items[4].artifact
    await act(async () => queue.setSetting('pngMode', 'maximum'))
    mocks.processFile.mockImplementation(async request => {
      if (request.file.name !== '5.png') return { blob: new Blob(['next']), filename: request.file.name, mimeType: 'image/png' }
      const { compressImage } = await import('@/lib/engines/image')
      return compressImage(request.file, { pngMode: request.options.pngMode }, request.onProgress, request.signal)
    })
    await act(async () => {
      queue.reprocessSelected(queue.selectedIds)
      await vi.waitFor(() => expect(PausedWorker.instances).toHaveLength(1))
    })
    expect(queue.items.slice(0, 4).every(item => item.status === 'completed' && item.appliedConfig?.options.pngMode === 'maximum')).toBe(true)
    expect(queue.items[4].status).toBe('processing')
    expect(queue.items[4].artifact).toBe(previous)
    await act(async () => { queue.cancelAll(); await flush() })
    expect(PausedWorker.instances[0].terminate).toHaveBeenCalledTimes(1)
    expect(queue.busy).toBe(false)
    expect(queue.items[4].status).toBe('cancelled')
    expect(queue.items[4].artifact).toBe(previous)
    expect(queue.items[4].activeRunId).toBeUndefined()
    expect(queue.items[4].runConfig).toBeUndefined()
    expect(queue.resultItems).toHaveLength(5)
    expect(mocks.processFile).toHaveBeenCalledTimes(10)
    await act(async () => { await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(10)
  })

  it('keeps sources and settings when the same tool arrives as a new props object', async () => {
    await mount()
    const source = jpeg()
    await add([source])
    await act(async () => queue.setSetting('imageMode', 'maximum'))
    await run()
    const artifact = queue.items[0].artifact
    await act(async () => root.render(<Harness tool={{ ...getTool('jpg-compressor')!, extensions: ['jpg', 'jpeg'] }} />))
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].file).toBe(source)
    expect(queue.items[0].artifact).toBe(artifact)
    expect(queue.settings.imageMode).toBe('maximum')
  })

  it('keeps source and selection array identities stable across draft and progress updates', async () => {
    await mount()
    await add([jpeg()])
    const images = queue.imageFiles, selectedImages = queue.selectedImageFiles, selectedIds = queue.selectedIds
    await act(async () => queue.setSetting('imageMode', 'maximum'))
    expect(queue.imageFiles).toBe(images)
    expect(queue.selectedImageFiles).toBe(selectedImages)
    expect(queue.selectedIds).toBe(selectedIds)
    mocks.processFile.mockImplementationOnce(async request => {
      request.onProgress(0, 'Encoding…')
      request.onProgress(0, 'Verifying…')
      return { blob: new Blob(['result']), filename: 'result.jpg', mimeType: 'image/jpeg' }
    })
    await run()
    expect(queue.imageFiles).toBe(images)
    expect(queue.selectedImageFiles).toBe(selectedImages)
    expect(queue.selectedIds).toBe(selectedIds)
  })

  it('tracks draft, running and applied snapshots and always reruns the original upload', async () => {
    await mount()
    const source = jpeg()
    await add([source])
    await act(async () => queue.setSetting('imageMode', 'balanced'))
    await run()
    const previous = queue.items[0].artifact!
    await act(async () => {
      queue.setSetting('imageMode', 'maximum')
      queue.setSetting('outputFormat', 'webp')
    })
    expect(queue.items[0].dirty).toBe(true)
    expect(queue.items[0].artifact).toBe(previous)
    expect(queue.items[0].appliedConfig?.options.imageMode).toBe('balanced')
    let finish!: () => void
    mocks.processFile.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { finish = resolve })
      return { blob: new Blob(['new-webp']), filename: 'result.webp', mimeType: 'image/webp' }
    })
    await act(async () => { queue.reprocessSelected(queue.selectedIds); await flush() })
    expect(queue.items[0].runConfig?.options).toMatchObject({ imageMode: 'maximum', outputFormat: 'webp' })
    expect(queue.resultItems[0].result).toBe(previous.outputs[0])
    await act(async () => { finish(); await flush() })
    expect(mocks.processFile.mock.calls[1][0].file).toBe(source)
    expect(queue.items[0].file).toBe(source)
    expect(queue.items[0].name).toBe('a.jpg')
    expect(queue.items[0].result?.filename).toBe('result.webp')
    expect(queue.items[0].appliedConfig?.options).toMatchObject({ imageMode: 'maximum', outputFormat: 'webp' })
    expect(queue.items[0].runConfig).toBeUndefined()
    expect(queue.items[0].dirty).toBe(false)
  })

  it('retains the successful artifact when a new attempt fails or is cancelled', async () => {
    await mount()
    await add([jpeg()])
    await run()
    const id = queue.items[0].id
    const originalArtifact = queue.items[0].artifact!
    await act(async () => queue.setSetting('imageMode', 'balanced'))
    mocks.processFile.mockRejectedValueOnce(new Error('codec failed'))
    await act(async () => { queue.reprocessSelected([id]); await flush() })
    expect(queue.items[0].status).toBe('failed')
    expect(queue.items[0].artifact).toBe(originalArtifact)
    expect(queue.items[0].appliedConfig).toBe(originalArtifact.config)
    expect(queue.items[0].dirty).toBe(true)
    expect(queue.resultItems[0].result).toBe(originalArtifact.outputs[0])
    let finish!: () => void
    mocks.processFile.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { finish = resolve })
      return { blob: new Blob(['discard']), filename: 'discard.jpg', mimeType: 'image/jpeg' }
    })
    await act(async () => { queue.retryItem(id); await flush() })
    await act(async () => { queue.cancelItem(id); finish(); await flush() })
    expect(queue.items[0].status).toBe('cancelled')
    expect(queue.items[0].artifact).toBe(originalArtifact)
    expect(queue.resultItems[0].result).toBe(originalArtifact.outputs[0])
    expect(queue.items[0].runConfig).toBeUndefined()
  })

  it('protects the active snapshot and supports restoring applied settings and defaults', async () => {
    await mount()
    await add([jpeg()])
    await act(async () => queue.setSetting('imageMode', 'high-quality'))
    await run()
    const id = queue.items[0].id
    await act(async () => queue.setSetting('imageMode', 'maximum'))
    let finish!: () => void
    mocks.processFile.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { finish = resolve })
      return { blob: new Blob(['next']), filename: 'next.jpg', mimeType: 'image/jpeg' }
    })
    await act(async () => { queue.reprocessItem(id); await flush() })
    await act(async () => {
      queue.setSetting('imageMode', 'target')
      queue.setLevel('maximum')
      queue.setSelection([])
      queue.resetSettings()
      queue.restoreApplied(id)
    })
    expect(queue.settings.imageMode).toBe('maximum')
    expect(queue.level).toBe('recommended')
    expect(queue.selectedIds).toEqual([id])
    expect(queue.items[0].runConfig?.options.imageMode).toBe('maximum')
    await act(async () => { finish(); await flush() })
    await act(async () => queue.setSetting('imageMode', 'high-quality'))
    expect(queue.items[0].dirty).toBe(true)
    await act(async () => queue.restoreApplied(id))
    expect(queue.settings.imageMode).toBe('maximum')
    expect(queue.items[0].dirty).toBe(false)
    await act(async () => queue.resetSettings())
    expect(queue.settings).toMatchObject({ imageMode: 'maximum', pngMode: 'maximum' })
    expect(queue.items[0].dirty).toBe(false)
  })

  it('reprocesses only selected changed sources and skips already matching successes', async () => {
    await mount()
    const first = jpeg('one.jpg'), second = jpeg('two.jpg')
    await add([first, second])
    await run()
    const [one, two] = queue.items
    const previousSecond = two.artifact
    await act(async () => { queue.setSelection([one.id]); queue.setSetting('imageMode', 'high-quality') })
    await act(async () => { queue.reprocessSelected(queue.selectedIds); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(3)
    expect(mocks.processFile.mock.calls[2][0].file).toBe(first)
    expect(queue.items[1].artifact).toBe(previousSecond)
    expect(queue.items[0].dirty).toBe(false)
    expect(queue.items[1].dirty).toBe(true)
    await act(async () => { queue.reprocessSelected([one.id]); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(3)
    await act(async () => { queue.reprocessChanged([two.id]); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(4)
    expect(mocks.processFile.mock.calls[3][0].file).toBe(second)
  })

  it('uses image controls for an image-only selection within a mixed source queue', async () => {
    await mount('compress')
    await add([jpeg(), new File(['%PDF-1.7\n'], 'document.pdf') as unknown as globalThis.File])
    const imageId = queue.items[0].id
    await act(async () => {
      queue.setSelection([imageId])
      queue.setSetting('imageMode', 'target')
      queue.setSetting('targetSize', 50000)
    })
    expect(queue.imageScope).toBe(true)
    expect(queue.settingsError).toBeNull()
    await act(async () => { queue.reprocessSelected([imageId]); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(1)
    expect(mocks.processFile.mock.calls[0][0].options).toEqual({ imageMode: 'target', targetSize: 50000 })
    expect(queue.items[1].status).toBe('queued')
  })

  it('validates only the active PNG or JPEG/WebP target and ignores stale controls', async () => {
    await mount('png-compressor')
    const source = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'source.png') as unknown as globalThis.File
    await add([source])
    await act(async () => { queue.setSetting('imageMode', 'target'); queue.setSetting('targetSize', '') })
    expect(queue.settingsError).toBeNull()
    await act(async () => queue.setSetting('pngMode', 'target'))
    expect(queue.settingsError).toContain('Choose a target')
    await act(async () => { queue.setSetting('outputFormat', 'webp'); queue.setSetting('imageMode', 'balanced') })
    expect(queue.settingsError).toBeNull()
    await run()
    expect(mocks.processFile.mock.calls[0][0].options).toEqual({ imageMode: 'balanced', outputFormat: 'webp', quality: 0.82 })
  })

  it('restores a saved image configuration into its own scope within a mixed queue', async () => {
    await mount('compress')
    await add([jpeg()])
    await act(async () => { queue.setSetting('imageMode', 'target'); queue.setSetting('targetSize', 50000) })
    await run()
    const id = queue.items[0].id
    await add([new File(['%PDF-1.7\n'], 'document.pdf') as unknown as globalThis.File])
    expect(queue.imageScope).toBe(false)
    expect(queue.items[0].dirty).toBe(true)
    await act(async () => queue.restoreApplied(id))
    expect(queue.selectedIds).toEqual([id])
    expect(queue.imageScope).toBe(true)
    expect(queue.settings.imageMode).toBe('target')
    expect(queue.items[0].dirty).toBe(false)
  })

  it('retries a mixed-batch image with visible defaults instead of reactivating hidden image settings', async () => {
    await mount('compress')
    await add([jpeg(), new File(['%PDF-1.7\n'], 'document.pdf') as unknown as globalThis.File])
    await act(async () => {
      queue.setSetting('imageMode', 'target')
      queue.setSetting('targetSize', '')
      queue.setSetting('outputFormat', 'webp')
      queue.setSetting('resizeEnabled', true)
      queue.setSetting('resizeMaxWidth', 100)
    })
    mocks.processFile.mockRejectedValueOnce(new Error('temporary codec failure'))
    await run()
    expect(queue.items[0].status).toBe('failed')
    expect(queue.imageScope).toBe(false)
    await act(async () => { queue.retryItem(queue.items[0].id); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(3)
    expect(mocks.processFile.mock.calls[2][0].options).toEqual({ imageMode: 'maximum', quality: 0.6 })
    expect(queue.items[0].status).toBe('completed')
    expect(queue.items[0].dirty).toBe(false)
    expect(queue.items[0].appliedConfig?.fingerprint).toBe(queue.items[0].draftConfig?.fingerprint)
  })

  it('processes a clean mixed-batch image again using its visible effective draft', async () => {
    await mount('compress')
    const source = jpeg()
    await add([source, new File(['%PDF-1.7\n'], 'document.pdf') as unknown as globalThis.File])
    await act(async () => { queue.setSetting('imageMode', 'target'); queue.setSetting('targetSize', 50000) })
    await run()
    expect(queue.items[0].dirty).toBe(false)
    await act(async () => { queue.reprocessItem(queue.items[0].id); await flush() })
    expect(mocks.processFile.mock.calls[2][0].file).toBe(source)
    expect(mocks.processFile.mock.calls[2][0].options).toEqual({ imageMode: 'maximum', quality: 0.6 })
    expect(queue.items[0].dirty).toBe(false)
  })

  it('does not activate hidden image controls when retrying an unselected source', async () => {
    await mount('compress')
    await add([jpeg()])
    mocks.processFile.mockRejectedValueOnce(new Error('temporary codec failure'))
    await run()
    await act(async () => {
      queue.setSetting('imageMode', 'target')
      queue.setSetting('targetSize', '')
      queue.setSelection([])
    })
    expect(queue.imageScope).toBe(false)
    await act(async () => { queue.retryItem(queue.items[0].id); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(2)
    expect(mocks.processFile.mock.calls[1][0].options).toEqual({ imageMode: 'maximum', quality: 0.6 })
    expect(queue.selectedIds).toEqual([])
    expect(queue.items[0].dirty).toBe(false)
  })

  it('keeps all original ZIP inputs and reruns the collective archive with the full source set', async () => {
    await mount('zip-compressor')
    const first = jpeg('one.jpg'), second = jpeg('two.jpg')
    await add([first, second])
    await run()
    const saved = queue.items[0].artifact!
    expect(queue.items.map(item => item.file)).toEqual([first, second])
    expect(saved.sourceIds).toEqual(queue.items.map(item => item.id))
    expect(queue.resultItems).toHaveLength(1)
    expect(saved.sourceBytes).toBe(8)
    await add([jpeg('three.jpg')])
    expect(queue.items[0].dirty).toBe(true)
    expect(queue.resultItems[0].result).toBe(saved.outputs[0])
    await act(async () => { queue.reprocessChanged(); await flush() })
    expect(mocks.processFile.mock.calls[1][0].allFiles).toHaveLength(3)
    expect(mocks.processFile.mock.calls[1][0].allFiles.slice(0, 2)).toEqual([first, second])
    expect(queue.items).toHaveLength(3)
    expect(queue.resultItems).toHaveLength(1)
    expect(queue.items.every(item => !item.dirty)).toBe(true)
  })

  it('retains an archive artifact and its original byte denominator when its owner is removed', async () => {
    await mount('zip-compressor')
    await add([jpeg('one.jpg'), jpeg('two.jpg')])
    await run()
    const [owner, remaining] = queue.items
    const saved = owner.artifact
    await act(async () => queue.removeItem(owner.id))
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].id).toBe(remaining.id)
    expect(queue.items[0].artifact).toBe(saved)
    expect(queue.items[0].dirty).toBe(true)
    expect(queue.items[0].originalSize).toBe(4)
    expect(queue.resultItems[0].originalSize).toBe(8)
  })

  it('marks a transferred archive dirty when its owner is replaced by a new source', async () => {
    await mount('zip-compressor')
    await add([jpeg('one.jpg'), jpeg('two.jpg')])
    await run()
    const [owner, second] = queue.items
    const saved = owner.artifact!
    await act(async () => queue.removeItem(second.id))
    await add([jpeg('new.jpg')])
    await act(async () => queue.removeItem(owner.id))
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].name).toBe('new.jpg')
    expect(queue.items[0].artifact).toBe(saved)
    expect(queue.items[0].appliedConfig).toBe(saved.config)
    expect(queue.items[0].dirty).toBe(true)
    expect(queue.resultItems[0].originalSize).toBe(8)
  })

  it('never starts a collective archive when no sources are selected', async () => {
    await mount('zip-compressor')
    await add([jpeg('one.jpg'), jpeg('two.jpg')])
    await act(async () => { queue.setSelection([]); queue.reprocessSelected([]); await flush() })
    expect(mocks.processFile).not.toHaveBeenCalled()
    expect(queue.busy).toBe(false)
  })

  it('keeps extraction outputs nested and replaces them with one rerun from the original archive', async () => {
    await mount('archive-compressor')
    const source = new File([new Uint8Array([0x50, 0x4b, 3, 4, 0])], 'source.zip') as unknown as globalThis.File
    await add([source])
    mocks.processFile.mockResolvedValueOnce([
      { blob: new Blob(['one']), filename: 'one.txt', mimeType: 'text/plain' },
      { blob: new Blob(['two']), filename: 'two.txt', mimeType: 'text/plain' },
    ])
    await run()
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].file).toBe(source)
    expect(queue.items[0].name).toBe('source.zip')
    expect(queue.items[0].artifact?.outputs).toHaveLength(2)
    expect(queue.resultItems.map(item => item.sourceId)).toEqual([queue.items[0].id, queue.items[0].id])
    mocks.processFile.mockResolvedValueOnce([{ blob: new Blob(['new']), filename: 'new.txt', mimeType: 'text/plain' }])
    await act(async () => { queue.reprocessItem(queue.items[0].id); await flush() })
    expect(mocks.processFile).toHaveBeenCalledTimes(2)
    expect(mocks.processFile.mock.calls[1][0].file).toBe(source)
    expect(queue.items).toHaveLength(1)
    expect(queue.resultItems.map(item => item.result?.filename)).toEqual(['new.txt'])
  })
})
