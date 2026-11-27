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
import Icon from './Icon'
import { usePathname } from 'next/navigation'
import type { SiteLink, ToolGroup } from '@/lib/nav'

export interface HeaderNavigationGroup extends Pick<ToolGroup, 'key' | 'title'> {
  tools: { slug: string; title: string; description: string }[]
}

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

export default function SiteHeaderNavigation({ groups, legalLinks, toolCount }: { groups: HeaderNavigationGroup[]; legalLinks: SiteLink[]; toolCount: number }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [keepTools, setKeepTools] = useState(false)
  useEffect(() => {
    if (toolsOpen) { setKeepTools(true); return }
    const timer = setTimeout(() => setKeepTools(false), 140)
    return () => clearTimeout(timer)
  }, [toolsOpen])
  const pathname = usePathname()

  const navRef = useRef<HTMLElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<'first' | 'last' | null>(null)
  const toolsId = useId()
  const mobileId = useId()

  const close = useCallback(() => {
    setMobileOpen(false)
    setToolsOpen(false)
  }, [])

  /** Align the compact grouped panel with the header container, clamped to the viewport. */
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    dropdownRef.current?.toggleAttribute('inert', !toolsOpen)
    if (!toolsOpen) return

    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const margin = 12
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(720, window.innerWidth - margin * 2)
      // Shared header alignment keeps the panel balanced as navigation moves.
      const header = navRef.current?.getBoundingClientRect()
      const centred = header ? header.left + (header.width - width) / 2 : (window.innerWidth - width) / 2
      const maxLeft = window.innerWidth - width - margin
      setDropdownStyle({
        left: `${Math.round(Math.max(margin, Math.min(centred, maxLeft)))}px`,
        top: `${Math.round(rect.bottom + 8)}px`,
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
    const links = dropdownRef.current?.querySelectorAll<HTMLAnchorElement>(
      '.toolsDropdownInner a',
    )
    if (!links?.length) return
    const target =
      index === 'first'
        ? 0
        : index === 'last'
          ? links.length - 1
          : (index + links.length) % links.length
    links[target]?.focus()
  }, [])

  const onTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      switch (event.key) {
        case 'ArrowDown':
        case 'Down':
          event.preventDefault()
          pendingFocus.current = 'first'
          setToolsOpen(true)
          if (toolsOpen) {
            focusDropdownLink('first')
            pendingFocus.current = null
          }
          break
        case 'ArrowUp':
        case 'Up':
          event.preventDefault()
          pendingFocus.current = 'last'
          setToolsOpen(true)
          if (toolsOpen) {
            focusDropdownLink('last')
            pendingFocus.current = null
          }
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
    [focusDropdownLink, toolsOpen],
  )

  useEffect(() => {
    if (toolsOpen && pendingFocus.current) {
      focusDropdownLink(pendingFocus.current)
      pendingFocus.current = null
    }
  }, [toolsOpen, focusDropdownLink])

  /** Arrow navigation between links, wrapping at both ends. */
  const onDropdownKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const links = dropdownRef.current?.querySelectorAll<HTMLAnchorElement>(
        '.toolsDropdownInner a',
      )
      if (!links?.length) return
      const current = Array.from(links).indexOf(
        document.activeElement as HTMLAnchorElement,
      )
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
        default:
          break
      }
    },
    [],
  )

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
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [toolsOpen])

  // The mobile menu is a full-height panel over the page. Escape closes it and
  // the body must not scroll behind it.
  useEffect(() => {
    if (!mobileOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const links = Array.from(
          mobilePanelRef.current?.querySelectorAll<HTMLElement>(
            'a, button, summary',
          ) ?? [],
        ).filter(
          (element) =>
            element.offsetParent !== null &&
            element.getBoundingClientRect().height > 0,
        )
        const focusable = [menuButtonRef.current, ...links].filter(
          (element): element is HTMLElement => !!element,
        )
        const index = focusable.indexOf(document.activeElement as HTMLElement)
        if (event.shiftKey && index <= 0) {
          event.preventDefault()
          focusable.at(-1)?.focus()
        } else if (
          !event.shiftKey &&
          (index < 0 || index === focusable.length - 1)
        ) {
          event.preventDefault()
          focusable[0]?.focus()
        }
        return
      }
      if (event.key !== 'Escape') return
      setMobileOpen(false)
      menuButtonRef.current?.focus()
    }
    const background = Array.from(
      document.querySelectorAll<HTMLElement>('main, .siteFooter'),
    )
    const previousInert = background.map((element) => element.inert)
    background.forEach((element) => {
      element.inert = true
    })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onResize = () => {
      if (window.innerWidth <= 900) return
      setMobileOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    onResize()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
      document.body.style.overflow = previousOverflow
      background.forEach((element, index) => {
        element.inert = previousInert[index]
      })
    }
  }, [mobileOpen])

  return (
    <header className="siteHeader">
      <nav className="nav" aria-label="Primary" ref={navRef}>
        <Link prefetch={false} className="brand" href="/" onClick={close}>
          {/* The logo's alternative text also names this home link. */}
          <Image
            className="brandMark"
            src="/logo.png"
            alt="FileCompresser — home"
            width={223}
            height={68}
            priority
          />
        </Link>

        <div className="navlinks">
          <div className="navTools" ref={toolsRef} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToolsOpen(false)
          }}>
            <button
              ref={triggerRef}
              type="button"
              className="navDropTrigger"
              aria-expanded={toolsOpen}
              aria-controls={toolsId}
              onClick={() => setToolsOpen((value) => !value)}
              onKeyDown={onTriggerKeyDown}
            >
              Tools
              <Icon name="chevron" className="caret" />
            </button>

            {(toolsOpen || keepTools) && (
              <div
                className={`toolsDropdown${toolsOpen ? ' isOpen' : ' isClosing'}`}
                aria-hidden={!toolsOpen || undefined}
                id={toolsId}
                style={dropdownStyle}
                ref={dropdownRef}
                onKeyDown={onDropdownKeyDown}
              >
                <div className="toolsDropdownInner">
                  {groups.map((group) => {
                    const tools = group.tools
                    if (!tools.length) return null
                    return (
                      <div className="toolsCol" key={group.key}>
                        <h2><Icon name={group.key === 'image' ? 'image' : group.key === 'media' ? 'media' : 'archive'} />{group.title}</h2>
                        <ul>
                          {tools.map((tool) => (
                            <li key={tool.slug}>
                              <Link prefetch={false}
                                href={`/${tool.slug}`}
                                aria-current={
                                  pathname === `/${tool.slug}`
                                    ? 'page'
                                    : undefined
                                }
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
                  <Link prefetch={false} href="/sitemap" onClick={close}>
                    See all {toolCount} tools <Icon name="arrow" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {NAV_LINKS.map((link) => (
            <Link prefetch={false}
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

        <Link prefetch={false} className="navbtn" href="/#compress" onClick={close}>
          Start compressing <Icon name="arrow" />
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          className="menub"
          aria-expanded={mobileOpen}
          aria-controls={mobileId}
          onClick={() => setMobileOpen((value) => !value)}
        >
          <span className="srInline">
            {mobileOpen ? 'Close menu' : 'Open menu'}
          </span>
          <Icon name={mobileOpen ? 'close' : 'menu'} />
        </button>
      </nav>

      {mobileOpen && (
        <div id={mobileId} className="mobileMenu" ref={mobilePanelRef}>
          <div className="mobileMenuInner">
            <Link prefetch={false} className="mobileCta" href="/#compress" onClick={close}>
              Start compressing
              <Icon name="arrow" />
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
              <Link prefetch={false}
                className="mobileTopLink"
                href="/blog"
                aria-current={pathname.startsWith('/blog') ? 'page' : undefined}
                onClick={close}
              >
                Blog
              </Link>
              <Link prefetch={false}
                className="mobileTopLink"
                href="/about"
                aria-current={
                  pathname.startsWith('/about') ? 'page' : undefined
                }
                onClick={close}
              >
                About
              </Link>
              <Link prefetch={false}
                className="mobileTopLink"
                href="/contact"
                aria-current={
                  pathname.startsWith('/contact') ? 'page' : undefined
                }
                onClick={close}
              >
                Contact
              </Link>
            </nav>

            <nav className="mobileTools" aria-label="All tools">
              {groups.map((group) => {
                const tools = group.tools
                if (!tools.length) return null
                const panelId = `mobile-group-${group.key}`
                return (
                  <details className="mobileGroup" key={group.key}>
                    <summary>
                      <span className="mobileGroupIcon" aria-hidden="true">
                        <Icon name={group.key === 'image' ? 'image' : group.key === 'media' ? 'media' : 'archive'} />
                      </span>
                      <span className="mobileGroupTitle">{group.title}</span>
                      <span className="mobileGroupCount">{tools.length}</span>
                      <Icon className="mobileChevron" name="chevron" />
                    </summary>
                    <ul id={panelId}>
                      {tools.map((tool) => (
                        <li key={tool.slug}>
                          <Link prefetch={false}
                            href={`/${tool.slug}`}
                            aria-current={
                              pathname === `/${tool.slug}` ? 'page' : undefined
                            }
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
              {legalLinks.map((link) => (
                <Link prefetch={false}
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
