'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Scroll behaviour for client-side navigation.
 *
 * The bug this exists to fix: leaving the homepage from a link at the very bottom
 * of the page (a footer link, typically) and landing on the destination already
 * scrolled down, because the new route was shorter than the old scroll offset and
 * the browser clamped instead of resetting.
 *
 * It also owns anchor scrolling explicitly. Relying on the browser's default
 * for `/#section` is not dependable here: the App Router intercepts the click,
 * and whether the hash then scrolls depends on whether it treats the navigation
 * as same-document or as a route change. Rather than leaving that to chance,
 * both cases are handled here:
 *
 *  1. No hash  → reset to the top, and re-assert it if the page turns out to be
 *     shorter than the offset we came from.
 *  2. Has a hash → scroll that element into view, below the sticky header.
 *
 * Popstate is deliberately not handled. History restoration is a browser
 * feature users expect to keep working on Back and Forward, and Next restores
 * the position for those entries itself.
 */

/** Keep the target clear of the sticky header, matching the CSS scroll-padding. */
function headerOffset(): number {
  const header = document.querySelector('.siteHeader')
  if (!header) return 0
  return header.getBoundingClientRect().height
}

function scrollToHash(hash: string): boolean {
  if (!hash) return false
  const id = decodeURIComponent(hash.replace(/^#/, ''))
  if (!id) return false
  const target = document.getElementById(id)
  if (!target) return false

  const top = target.getBoundingClientRect().top + window.scrollY - headerOffset() - 16
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
  return true
}

export default function ScrollRestoration() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const href = `${pathname}?${searchParams.toString()}`

  // Only a real navigation should trigger this. On the first render we skip it
  // entirely so a reload or a direct URL keeps the browser's own behaviour.
  const isFirstRender = useRef(true)
  // The offset we last saw, used to detect "the page can no longer scroll here".
  const offsetRef = useRef(0)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    offsetRef.current = window.scrollY

    const hash = window.location.hash

    if (hash) {
      // The target may not exist yet on a cross-page anchor, so retry briefly
      // rather than giving up on the first frame.
      if (!scrollToHash(hash)) {
        let attempts = 0
        const retry = () => {
          attempts += 1
          if (scrollToHash(hash)) return
          if (attempts < 20) requestAnimationFrame(retry)
        }
        requestAnimationFrame(retry)
      }
      return
    }

    window.scrollTo(0, 0)
  }, [href])

  useEffect(() => {
    // A destination that already carries a hash must never be reset to the top.
    if (window.location.hash) return

    const reassert = () => {
      const offset = offsetRef.current
      if (offset <= 0) return
      // The document got shorter than the position we were at — the old offset
      // can no longer mean anything, so pin to the top rather than letting the
      // browser leave us mid-page.
      if (offset > document.documentElement.scrollHeight - window.innerHeight) {
        window.scrollTo(0, 0)
        offsetRef.current = 0
      }
    }

    reassert()

    const frame = requestAnimationFrame(reassert)
    const observer = new ResizeObserver(reassert)
    observer.observe(document.documentElement)
    window.addEventListener('load', reassert)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('load', reassert)
    }
  }, [href])

  /**
   * Same-page anchors (clicking "How it works" while already on the homepage)
   * do not change the route, so the effect above does not run. The browser
   * handles those, but the App Router can swallow the scroll, so it is done
   * explicitly here too.
   */
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash) scrollToHash(window.location.hash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return null
}
