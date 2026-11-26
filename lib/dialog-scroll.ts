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
