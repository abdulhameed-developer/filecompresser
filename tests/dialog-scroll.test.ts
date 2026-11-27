// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { revealFocusedDialogControl } from '@/lib/dialog-scroll'

let dialog: HTMLDialogElement
let body: HTMLDivElement
let frame: HTMLDivElement
let input: HTMLInputElement
let other: HTMLButtonElement
let frames: FrameRequestCallback[]
let frameTop: number

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  dialog = document.createElement('dialog')
  dialog.open = true
  body = document.createElement('div')
  frame = document.createElement('div')
  frame.className = 'numberField'
  frame.style.outlineWidth = '3px'
  frame.style.outlineStyle = 'solid'
  frame.style.outlineOffset = '1px'
  input = document.createElement('input')
  other = document.createElement('button')
  frame.append(input); body.append(frame); dialog.append(body, other); document.body.append(dialog)
  frameTop = 280
  vi.spyOn(body, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 100, 200, 200))
  vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, frameTop - body.scrollTop, 120, 44))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  input.focus()
})
afterEach(() => { dialog.remove(); frames = []; vi.unstubAllGlobals(); vi.restoreAllMocks() })
const paint = () => { for (const callback of frames.splice(0)) callback(0) }

it('reveals the complete lower focus frame with clearance by scrolling only its body', () => {
  revealFocusedDialogControl(body, input)
  expect(body.scrollTop).toBe(0)
  paint()
  expect(frame.getBoundingClientRect().bottom + 4 + 8).toBeLessThanOrEqual(body.getBoundingClientRect().bottom)
  expect(body.scrollTop).toBeGreaterThan(0)
  expect(window.scrollTo).not.toHaveBeenCalled()
})
it('reveals the upper focus frame without scrolling the document', () => {
  frameTop = 150; body.scrollTop = 100
  revealFocusedDialogControl(body, input); paint()
  expect(frame.getBoundingClientRect().top - 4 - 8).toBeGreaterThanOrEqual(body.getBoundingClientRect().top)
  expect(body.scrollTop).toBeLessThan(100)
  expect(window.scrollTo).not.toHaveBeenCalled()
})
it('keeps an already exposed control stationary', () => {
  frameTop = 150
  revealFocusedDialogControl(body, input); paint()
  expect(body.scrollTop).toBe(0)
})
it.each(['closed', 'detached', 'focus moved', 'disabled'])('does not apply a stale %s focus adjustment', state => {
  revealFocusedDialogControl(body, input)
  if (state === 'closed') dialog.open = false
  if (state === 'detached') input.remove()
  if (state === 'focus moved') other.focus()
  if (state === 'disabled') input.disabled = true
  paint()
  expect(body.scrollTop).toBe(0)
  expect(window.scrollTo).not.toHaveBeenCalled()
})
