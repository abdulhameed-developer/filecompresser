/** Lock the document scroller, preserving both inline styles and viewport. */
export function lockDialogScroll(): () => void {
  const root = document.documentElement
  const body = document.body
  const previous = { root: root.style.overflow, body: body.style.overflow, behavior: root.style.scrollBehavior }
  const left = window.scrollX
  const top = window.scrollY
  root.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  root.style.scrollBehavior = 'auto'
  // Opening a dialog during an anchor/focus scroll must stop that animation;
  // hiding overflow alone does not cancel an in-flight browser scroll.
  window.scrollTo({ left, top, behavior: 'instant' })
  return () => {
    root.style.overflow = previous.root
    body.style.overflow = previous.body
    if (window.scrollX !== left || window.scrollY !== top) window.scrollTo({ left, top, behavior: 'instant' })
    root.style.scrollBehavior = previous.behavior
  }
}

/** Keep the full focused control/ring inside the modal's own scrollport. */
export function revealFocusedDialogControl(body: HTMLElement, target: EventTarget | null): void {
  if (!(target instanceof HTMLElement) || !body.contains(target)) return
  // Native focus may reveal only an input caret, and WebKit may not scroll a
  // newly expanded panel. Measure after that focus and the React layout update.
  requestAnimationFrame(() => {
    const document = body.ownerDocument
    if (!body.isConnected || !target.isConnected || !body.closest<HTMLDialogElement>('dialog')?.open || target.matches(':disabled') || !body.contains(target) || !(target === document.activeElement || target.contains(document.activeElement))) return
    const frame = target.closest<HTMLElement>('.numberField') || target
    const box = frame.getBoundingClientRect()
    const port = body.getBoundingClientRect()
    if (port.height <= 0) return
    const style = getComputedStyle(frame)
    const clearance = 8 + (parseFloat(style.outlineWidth) || 0) + Math.max(0, parseFloat(style.outlineOffset) || 0)
    const delta = box.bottom > port.bottom - clearance
      ? box.bottom - port.bottom + clearance
      : box.top < port.top + clearance ? box.top - port.top - clearance : 0
    if (delta) body.scrollTop += delta
  })
}
