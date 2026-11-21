// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { File, Blob } from 'node:buffer'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useFileQueue, type FileQueue } from '@/lib/useFileQueue'
import { getTool } from '@/lib/tools'
import CompressionSettings from '@/components/CompressionSettings'
import type { ToolDefinition, SettingValue } from '@/lib/types'

const mocks = vi.hoisted(() => ({ processFile: vi.fn() }))
vi.mock('@/lib/process', () => ({
  processFile: mocks.processFile,
  concurrencyFor: () => 1,
  engineForFormat: async () => 'image-compress',
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
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].originalSize).toBe(8)
    expect(queue.items[0].sourceCount).toBe(2)
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
})

it('does not offer a target for PNG preserved in its original format', async () => {
  await act(async () =>
    root.render(
      <CompressionSettings
        tool={getTool('png-compressor')!}
        level="maximum"
        onLevel={() => {}}
        settings={{}}
        onSetting={() => {}}
      />,
    ),
  )
  expect(container.querySelector('input[type=number]')).toBeNull()
})
