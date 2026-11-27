// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FileDropzone from '@/components/FileDropzone'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function mount() {
  await act(async () => root.render(<FileDropzone label="Drop files here to get started" hint="or browse files from your device" formats="JPG · PNG" onFiles={() => {}} />))
  return container.querySelector<HTMLElement>('.dropzone')!
}
const plainText = (element: Element) => element.textContent!.replace(/\s+/g, ' ').trim()
function referencedName(element: HTMLElement) {
  return element.getAttribute('aria-labelledby')!.split(/\s+/).map(id => plainText(document.getElementById(id)!)).join(' ')
}

it('keeps word boundaries between the visible upload label, hint and formats', async () => {
  const upload = await mount()
  const expected = 'Drop files here to get started or browse files from your device JPG · PNG'
  // DOM text consumers must not read "startedor" or "deviceJPG", even though
  // the visual blocks and browser name calculation insert their own spacing.
  expect(plainText(upload)).toBe(expected)
  expect(referencedName(upload)).toBe(expected)
})

it('preserves the same visible/name boundaries when drag feedback changes', async () => {
  const upload = await mount()
  await act(async () => Simulate.dragEnter(upload))
  const dragging = 'Drop them here or browse files from your device JPG · PNG'
  expect(plainText(upload)).toBe(dragging)
  expect(referencedName(upload)).toBe(dragging)
  await act(async () => Simulate.dragLeave(upload))
  expect(plainText(upload)).toBe('Drop files here to get started or browse files from your device JPG · PNG')
  expect(referencedName(upload)).toBe(plainText(upload))
})

it('withdraws drag feedback while uploads are disabled and never accepts a drop', async () => {
  const onFiles = vi.fn()
  const props = { label: 'Add more files', hint: 'or choose from your device', onFiles }
  await act(async () => root.render(<FileDropzone {...props} />))
  const upload = container.querySelector<HTMLElement>('.dropzone')!
  await act(async () => Simulate.dragEnter(upload))
  expect(upload.classList.contains('drag')).toBe(true)
  await act(async () => root.render(<FileDropzone {...props} disabled />))
  expect(upload.classList.contains('drag')).toBe(false)
  expect(upload.querySelector('h2')?.textContent).toBe('Add more files')
  const transfer = { dropEffect: 'copy', files: [new File(['test'], 'queued.txt')] }
  await act(async () => {
    Simulate.dragEnter(upload, { dataTransfer: transfer } as unknown as Parameters<typeof Simulate.dragEnter>[1])
    Simulate.dragOver(upload, { dataTransfer: transfer } as unknown as Parameters<typeof Simulate.dragOver>[1])
    Simulate.drop(upload, { dataTransfer: transfer } as unknown as Parameters<typeof Simulate.drop>[1])
  })
  expect(transfer.dropEffect).toBe('none')
  expect(upload.getAttribute('aria-disabled')).toBe('true')
  expect(upload.getAttribute('tabindex')).toBe('-1')
  expect(onFiles).not.toHaveBeenCalled()
})
