// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { observeDialogFocusResize } from '@/lib/dialog-scroll'

let dialog: HTMLDialogElement
let body: HTMLDivElement
let frame: HTMLDivElement
let input: HTMLInputElement
let headerButton: HTMLButtonElement
let portWidth: number
let portHeight: number
let controlTop: number
let paint: () => void
let notifyBodyResize: () => void
let visualViewport: EventTarget & { width: number; height: number }
let stop: (() => void) | undefined

beforeEach(() => {
  const callbacks = new Map<number, FrameRequestCallback>()
  let requestId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++requestId, callback); return requestId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  paint = () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(0)) }
  vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900)
  visualViewport = Object.assign(new EventTarget(), { width: 1440, height: 900 })
  vi.stubGlobal('visualViewport', visualViewport)
  notifyBodyResize = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { notifyBodyResize = () => callback([], this as unknown as ResizeObserver) }
    observe() {}
    disconnect() {}
  })
  dialog = document.createElement('dialog'); dialog.open = true
  body = document.createElement('div')
  headerButton = document.createElement('button'); headerButton.textContent = 'Close settings'
  frame = document.createElement('div'); frame.className = 'numberField'
  frame.style.outlineWidth = '3px'; frame.style.outlineStyle = 'solid'; frame.style.outlineOffset = '1px'
  input = document.createElement('input'); input.value = '100.051'
  frame.append(input); body.append(frame); dialog.append(headerButton, body); document.body.append(dialog)
  portWidth = 200; portHeight = 200; controlTop = 150
  Object.defineProperty(body, 'clientWidth', { configurable: true, get: () => portWidth })
  Object.defineProperty(body, 'clientHeight', { configurable: true, get: () => portHeight })
  vi.spyOn(body, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 100, portWidth, portHeight))
  vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, controlTop - body.scrollTop, 120, 44))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  input.focus()
})
afterEach(() => { stop?.(); stop = undefined; dialog.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const expectVisibleAndUnchanged = () => {
  expect(frame.getBoundingClientRect().bottom + 12).toBeLessThanOrEqual(body.getBoundingClientRect().bottom)
  expect(frame.getBoundingClientRect().top - 12).toBeGreaterThanOrEqual(body.getBoundingClientRect().top)
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('100.051')
  expect(window.scrollTo).not.toHaveBeenCalled()
}

it.each(['height', 'width'])('reveals the complete active frame when dialog-body %s changes', dimension => {
  stop = observeDialogFocusResize(body)
  if (dimension === 'height') portHeight = 90
  else { portWidth = 160; controlTop = 280 }
  notifyBodyResize(); paint()
  expectVisibleAndUnchanged()
})
it('handles viewport resize without ResizeObserver support', () => {
  vi.stubGlobal('ResizeObserver', undefined)
  stop = observeDialogFocusResize(body)
  portHeight = 90; vi.stubGlobal('innerHeight', 390)
  window.dispatchEvent(new Event('resize')); paint()
  expectVisibleAndUnchanged()
})
it('handles a visual viewport resize while preserving the active control and draft', () => {
  stop = observeDialogFocusResize(body)
  portHeight = 90; visualViewport.height = 390
  visualViewport.dispatchEvent(new Event('resize')); paint()
  expectVisibleAndUnchanged()
})
it('leaves an already visible active control stationary on resize', () => {
  stop = observeDialogFocusResize(body)
  portWidth = 180; notifyBodyResize(); paint()
  expect(body.scrollTop).toBe(0)
  expectVisibleAndUnchanged()
})
it('does not treat an unchanged observer notification as a resize', () => {
  stop = observeDialogFocusResize(body)
  controlTop = 280
  notifyBodyResize(); paint()
  expect(body.scrollTop).toBe(0)
})
it.each(['header focus', 'no body focus', 'disabled control', 'closed dialog', 'unopened dialog'])('does not scroll for %s', state => {
  if (state === 'unopened dialog') dialog.open = false
  stop = observeDialogFocusResize(body)
  if (state === 'header focus') headerButton.focus()
  if (state === 'no body focus') input.blur()
  if (state === 'disabled control') input.disabled = true
  if (state === 'closed dialog') dialog.open = false
  portHeight = 90; notifyBodyResize(); vi.stubGlobal('innerHeight', 390)
  window.dispatchEvent(new Event('resize')); paint()
  expect(body.scrollTop).toBe(0)
  expect(window.scrollTo).not.toHaveBeenCalled()
})
it('cancels a pending reveal and ignores all later resize sources after cleanup', () => {
  stop = observeDialogFocusResize(body)
  portHeight = 90; notifyBodyResize()
  stop(); stop = undefined; paint()
  expect(body.scrollTop).toBe(0)
  portHeight = 60; notifyBodyResize(); vi.stubGlobal('innerHeight', 300)
  window.dispatchEvent(new Event('resize'))
  visualViewport.height = 300; visualViewport.dispatchEvent(new Event('resize')); paint()
  expect(body.scrollTop).toBe(0)
  expect(input.value).toBe('100.051')
})
it('ignores a queued reveal after the focused input is removed', () => {
  stop = observeDialogFocusResize(body)
  portHeight = 90; notifyBodyResize(); input.remove(); paint()
  expect(body.scrollTop).toBe(0)
})
