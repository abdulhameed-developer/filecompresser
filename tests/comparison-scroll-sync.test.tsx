// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { Blob, File } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageComparison from '@/components/ImageComparison'

let root: Root
let container: HTMLDivElement
let original: HTMLDivElement
let result: HTMLDivElement
let priorShow: PropertyDescriptor | undefined
let priorClose: PropertyDescriptor | undefined

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const OriginalURL = URL
  vi.stubGlobal('URL', Object.assign(class extends OriginalURL {}, {
    createObjectURL: vi.fn().mockReturnValue('blob:comparison-fixture'),
    revokeObjectURL: vi.fn(),
  }))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  priorShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  priorClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<ImageComparison
    original={new File(['source'], 'source.png') as unknown as globalThis.File}
    output={new Blob(['result']) as unknown as globalThis.Blob}
    outputName="result.png" inputWidth={1440} inputHeight={900}
    outputWidth={1440} outputHeight={900} onClose={() => {}}
  />))
  ;[original, result] = [...container.querySelectorAll<HTMLDivElement>('.comparisonPane')]
})
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  for (const [name, descriptor] of [['showModal', priorShow], ['close', priorClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const position = (pane: HTMLDivElement, left: number, top: number) => { pane.scrollLeft = left; pane.scrollTop = top }
const scroll = (pane: HTMLDivElement) => act(() => Simulate.scroll(pane))

describe('actual comparison component scroll synchronization', () => {
  it('does not let a delayed mirror event roll a native animation back from338 to100', () => {
    position(original, 9, 100)
    scroll(original)
    expect(result.scrollTop).toBe(100)
    // The native source moves again before the other pane reports its
    // programmatic mirror, exactly as captured in WebKit's causal trace.
    position(original, 9, 338)
    scroll(result)
    expect(original.scrollTop).toBe(338)
    scroll(original)
    expect(result.scrollTop).toBe(338)
    position(original, 9, 640)
    scroll(result)
    expect(original.scrollTop).toBe(640)
    scroll(original)
    expect(result.scrollTop).toBe(640)
  })

  it.each([
    ['horizontal', 300, 0],
    ['vertical', 0, 300],
    ['both axes', 300, 400],
  ] as const)('keeps %s native movement and ignores only the matching reflected event', (_axis, left, top) => {
    position(original, left, top)
    scroll(original)
    expect([result.scrollLeft, result.scrollTop]).toEqual([left, top])
    position(original, left + 50, top + 60)
    scroll(result)
    expect([original.scrollLeft, original.scrollTop]).toEqual([left + 50, top + 60])
    scroll(original)
    expect([result.scrollLeft, result.scrollTop]).toEqual([left + 50, top + 60])
  })

  it('accepts rapid user changes of the opposite pane instead of swallowing them as mirror events', () => {
    position(original, 20, 100)
    scroll(original)
    position(result, 55, 220)
    scroll(result)
    expect([original.scrollLeft, original.scrollTop]).toEqual([55, 220])
    position(result, 70, 260)
    scroll(original)
    expect([result.scrollLeft, result.scrollTop]).toEqual([70, 260])
    scroll(result)
    expect([original.scrollLeft, original.scrollTop]).toEqual([70, 260])
    position(original, 13, 85)
    scroll(original)
    expect([result.scrollLeft, result.scrollTop]).toEqual([13, 85])
  })

  it('does not mistake a real one-axis change for the pending mirror of the other axis', () => {
    position(original, 20, 100)
    scroll(original)
    result.scrollLeft = 80
    scroll(result)
    expect([original.scrollLeft, original.scrollTop]).toEqual([80, 100])
    original.scrollTop = 450
    scroll(original)
    expect([result.scrollLeft, result.scrollTop]).toEqual([80, 450])
  })

  it('records the actual clamped mirror position rather than a requested unreachable offset', () => {
    let clampedTop = 0
    Object.defineProperty(result, 'scrollTop', {
      configurable: true,
      get: () => clampedTop,
      set: value => { clampedTop = Math.max(0, Math.min(200, Number(value))) },
    })
    position(original, 9, 1000)
    scroll(original)
    expect(result.scrollTop).toBe(200)
    position(original, 9, 1100)
    scroll(result)
    expect(original.scrollTop).toBe(1100)
  })
})
