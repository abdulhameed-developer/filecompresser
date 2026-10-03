'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { TOOLS } from '@/lib/tools'
import { FOOTER_SITE_LINKS, TOOL_GROUPS, toolsInGroup } from '@/lib/nav'

/**
 * The one header.
 *
 * There is a single implementation rendered once by the root layout; no page
 * brings its own. `compact` is deliberately not supported — every public route
 * gets the same full navigation, which is what makes the header predictable.
 */

/**
 * Top-level links, rendered beside the Tools dropdown.
 *
 * Deliberately short: Tools carries every tool, and the rest are the three
 * things a visitor might want that are not tools. The homepage section anchors
 * (Compress / All tools / How it works) used to live here and were removed —
 * they duplicated what the Tools dropdown and the page body already offer, and
 * `/#hash` links push a history entry, which is exactly the behaviour that
 * produced stale scroll positions.
 */
const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
] as const

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const pathname = usePathname()

  const navRef = useRef<HTMLElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
const dropdownRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const toolsId = useId()
  const mobileId = useId()

  const close = useCallback(() => {
    setMobileOpen(false)
    setToolsOpen(false)
  }, [])

  /**
   * Place the Tools panel under its trigger, clamped to the viewport.
   *
   * The panel is much wider than its trigger, so the rule is simple: centre it
   * on the trigger, then clamp it into the viewport. Anchoring the panel's left
   * edge to the trigger — which is what this did before — left the panel sitting
   * at the far left of the window with no relationship to the control that
   * opened it, and on narrower desktops it overflowed off the right edge and
   * gave the whole page hundreds of pixels of horizontal scroll.
   *
   * Re-measured on open, on resize and on scroll, because the header is sticky
   * and the trigger moves with the viewport.
   */
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!toolsOpen) {
      setDropdownStyle({})
      return
    }

    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const margin = 12
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(940, window.innerWidth - margin * 2)
      // Centre on the trigger, then clamp: the clamp is what stops the panel
      // leaving the viewport once the viewport is narrower than the panel.
      const centred = rect.left + rect.width / 2 - width / 2
      const maxLeft = window.innerWidth - width - margin
      setDropdownStyle({
        left: `${Math.round(Math.max(margin, Math.min(centred, maxLeft)))}px`,
        top: `${Math.round(rect.bottom + 14)}px`,
        width: `${width}px`,
      })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [toolsOpen])

  // Arrow keys from the trigger move focus into the panel, so the whole menu is
  // reachable without ever tabbing through the 30 links — the trigger is the
  // only tab stop, and the panel is what the arrows walk.
  const focusDropdownLink = useCallback((index: number | 'first' | 'last') => {
    const links = dropdownRef.current?.querySelectorAll<HTMLAnchorElement>('.toolsDropdownInner a')
    if (!links?.length) return
    const target =
      index === 'first' ? 0 : index === 'last' ? links.length - 1 : (index + links.length) % links.length
    links[target]?.focus()
  }, [])

  const onTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      switch (event.key) {
        case 'ArrowDown':
        case 'Down':
          event.preventDefault()
          setToolsOpen(true)
          focusDropdownLink('first')
          break
        case 'ArrowUp':
        case 'Up':
          event.preventDefault()
          setToolsOpen(true)
          focusDropdownLink('last')
          break
        case 'Escape':
          if (toolsOpen) {
            event.preventDefault()
            setToolsOpen(false)
          }
          break
        default:
          break
      }
    },
    [focusDropdownLink, toolsOpen]
  )

  /** Arrow navigation between links, wrapping at both ends. */
  const onDropdownKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const links = dropdownRef.current?.querySelectorAll<HTMLAnchorElement>('.toolsDropdownInner a')
    if (!links?.length) return
    const current = Array.from(links).indexOf(document.activeElement as HTMLAnchorElement)
    if (current === -1) return

    switch (event.key) {
      case 'ArrowDown':
      case 'Down':
        event.preventDefault()
        links[(current + 1) % links.length]?.focus()
        break
      case 'ArrowUp':
      case 'Up':
        event.preventDefault()
        links[(current - 1 + links.length) % links.length]?.focus()
        break
      case 'Home':
        event.preventDefault()
        links[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        links[links.length - 1]?.focus()
        break
      case 'Escape':
        event.preventDefault()
        setToolsOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        // The panel is a single tab stop: Tab leaves it rather than walking 30
        // links, matching the APG disclosure pattern for a large menu.
        setToolsOpen(false)
        break
      default:
        break
    }
  }, [])

  // Close on any route change, including browser Back/Forward, so a stale panel
  // never overlays the new page.
  useEffect(() => {
    close()
  }, [pathname, close])

  // Escape closes and a click outside dismisses. Focus returns to the trigger so
  // a keyboard user is never stranded.
  useEffect(() => {
    if (!toolsOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setToolsOpen(false)
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setToolsOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [toolsOpen])

  // The mobile menu is a full-height panel over the page. Escape closes it and
  // the body must not scroll behind it.
  useEffect(() => {
    if (!mobileOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMobileOpen(false)
      menuButtonRef.current?.focus()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  return (
    <header className="siteHeader">
      <nav className="nav" aria-label="Primary" ref={navRef}>
        <Link className="brand" href="/" onClick={close}>
          {/*
            The wordmark image already spells the name, so `alt=""` keeps a
            screen reader from announcing "filecompresser" twice; the
            visually-hidden label gives the link its accessible name instead.

            `next/image` rather than a bare `<img>` because the logo is the
            largest contentful paint on every page — it is the first thing that
            renders, and it should not block on a 23 KB download.
          */}
          <Image
            className="brandMark"
            src="/logo.png"
            alt=""
            width={223}
            height={68}
            priority
          />
          <span className="srInline">filecompresser — home</span>
        </Link>

        <div className="navlinks">
          <div className="navTools" ref={toolsRef}>
            <button
              ref={triggerRef}
              type="button"
              className="navDropTrigger"
              aria-expanded={toolsOpen}
              aria-controls={toolsId}
              // `aria-haspopup` tells assistive tech the trigger opens a region
              // whose contents the button controls.
              aria-haspopup="true"
              onClick={() => setToolsOpen((value) => !value)}
              onKeyDown={onTriggerKeyDown}
            >
              Tools
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>

            {toolsOpen && (
              <div
                className="toolsDropdown"
                id={toolsId}
                style={dropdownStyle}
                ref={dropdownRef}
                onKeyDown={onDropdownKeyDown}
              >
                <div className="toolsDropdownInner">
                  {TOOL_GROUPS.map((group) => {
                    const tools = toolsInGroup(group)
                    if (!tools.length) return null
                    return (
                      <div className="toolsCol" key={group.key}>
                        <h2>{group.title}</h2>
                        <ul>
                          {tools.map((tool) => (
                            <li key={tool.slug}>
                              <Link
                                href={`/${tool.slug}`}
                                aria-current={pathname === `/${tool.slug}` ? 'page' : undefined}
                                onClick={close}
                              >
                                {tool.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
                <div className="toolsDropdownFoot">
                  <Link href="/sitemap" onClick={close}>
                    See all {TOOLS.length} tools →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              className="navlink"
              href={link.href}
              // A blog post should light up "Blog", so any route beneath a
              // top-level link marks it current, not just an exact match.
              aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
              onClick={close}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link className="navbtn" href="/#compress" onClick={close}>
          Start compressing <span aria-hidden="true">→</span>
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          className="menub"
          aria-expanded={mobileOpen}
          aria-controls={mobileId}
          onClick={() => setMobileOpen((value) => !value)}
        >
          <span className="srInline">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
          <span aria-hidden="true">{mobileOpen ? '✕' : '☰'}</span>
        </button>
      </nav>

      {mobileOpen && (
        <div id={mobileId} className="mobileMenu" ref={mobilePanelRef}>
          <div className="mobileMenuInner">
            <Link className="mobileCta" href="/#compress" onClick={close}>
              Start compressing
              <span aria-hidden="true">→</span>
            </Link>

            {/*
              A structured menu, not a flat dump of 13 tools.

              The primary action and the site links sit at the top, where they
              are reachable in one thumb movement. The 13 tools are grouped
              behind native <details> disclosures, one per category, so the
              panel opens ~7 rows tall instead of ~25 and a visitor can find
              the category they want rather than scrolling past three others.
              <details> gives keyboard, screen-reader and touch behaviour for
              free, and needs no JS to be usable if hydration is slow.
            */}
            <nav className="mobilePrimary" aria-label="Mobile">
              <Link
                className="mobileTopLink"
                href="/blog"
                aria-current={pathname.startsWith('/blog') ? 'page' : undefined}
                onClick={close}
              >
                Blog
              </Link>
              <Link
                className="mobileTopLink"
                href="/about"
                aria-current={pathname.startsWith('/about') ? 'page' : undefined}
                onClick={close}
              >
                About
              </Link>
              <Link
                className="mobileTopLink"
                href="/contact"
                aria-current={pathname.startsWith('/contact') ? 'page' : undefined}
                onClick={close}
              >
                Contact
              </Link>
            </nav>

            <nav className="mobileTools" aria-label="All tools">
              {TOOL_GROUPS.map((group) => {
                const tools = toolsInGroup(group)
                if (!tools.length) return null
                const panelId = `mobile-group-${group.key}`
                return (
                  <details className="mobileGroup" key={group.key}>
                    <summary>
                      <span className="mobileGroupIcon" aria-hidden="true">
                        {group.icon}
                      </span>
                      <span className="mobileGroupTitle">{group.title}</span>
                      <span className="mobileGroupCount">{tools.length}</span>
                      <span className="mobileChevron" aria-hidden="true" />
                    </summary>
                    <ul id={panelId}>
                      {tools.map((tool) => (
                        <li key={tool.slug}>
                          <Link
                            href={`/${tool.slug}`}
                            aria-current={pathname === `/${tool.slug}` ? 'page' : undefined}
                            onClick={close}
                          >
                            {tool.title}
                            <small>{tool.description}</small>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })}
            </nav>

            <nav className="mobileSecondary" aria-label="Legal">
              {FOOTER_SITE_LINKS.map((link) => (
                <Link
                  key={link.href}
                  className="mobileMetaLink"
                  href={link.href}
                  aria-current={pathname === link.href ? 'page' : undefined}
                  onClick={close}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}
