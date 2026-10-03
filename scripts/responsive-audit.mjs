/**
 * Responsive audit.
 *
 * Loads each key route at each required breakpoint and measures the DOM
 * directly — bounding boxes, computed styles, and the document's scroll width.
 * This catches the defects that are objectively measurable without looking at a
 * picture: horizontal overflow, controls pushed outside the viewport, clipped
 * text, controls smaller than the 44px touch target minimum, and duplicated
 * landmarks.
 *
 * Run against a production server:
 *   PW_TOOLS=<dir containing playwright-core> node scripts/responsive-audit.mjs [baseUrl]
 *
 * `playwright-core` is intentionally NOT a project dependency — it is a QA
 * tool, not something the site ships. Point PW_TOOLS at a directory where it is
 * installed, and the script drives the system Chrome rather than downloading a
 * browser.
 */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import path from 'node:path'

const PW_TOOLS = process.env.PW_TOOLS || path.join(process.env.HOME || '', 'pwtools')
const CHROME =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) =>
    existsSync(p)
  )

if (!CHROME) {
  console.error('No Chrome/Chromium binary found. Set CHROME_PATH.')
  process.exit(2)
}

let chromium
try {
  const require = createRequire(path.join(PW_TOOLS, 'noop.js'))
  ;({ chromium } = require('playwright-core'))
} catch {
  console.error(
    `playwright-core not found. Install it outside the project and set PW_TOOLS, e.g.\n` +
      `  mkdir -p ~/pwtools && cd ~/pwtools && npm install playwright-core && PW_TOOLS=~/pwtools node scripts/responsive-audit.mjs`
  )
  process.exit(2)
}

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()

const WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920]
const ROUTES = [
  '/',
  '/jpg-compressor',
  '/gif-compressor',
  '/video-compressor',
  '/mp3-compressor',
  '/pdf-compressor',
  '/archive-compressor',
  '/about',
  '/blog',
  '/blog/how-browser-compression-works',
  '/privacy',
  '/sitemap',
]

/** Runs in the page: everything that needs layout must be measured there. */
async function auditPage() {
  const vw = window.innerWidth
  const problems = []

  // 1. Horizontal overflow, from the document and from individual elements.
  const docW = document.documentElement.scrollWidth
  if (docW > vw + 1) {
    problems.push(`document scrolls horizontally: ${docW}px in ${vw}px viewport`)
  }

  const wide = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    // Deliberately off-screen utilities (the skip link parked at -9999px and
    // visually-hidden live regions) are not layout defects.
    if (el.closest('.skipLink, .srLive, .srInline, .srOnlyInput')) continue
    if (r.right > vw + 1 || r.left < -1) {
      wide.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} [${Math.round(r.left)}..${Math.round(r.right)}]`)
    }
  }
  if (wide.length) problems.push(`elements outside viewport: ${wide.slice(0, 5).join(' | ')}`)

  // 2. Exactly one of each landmark.
  for (const [sel, label] of [['header', 'header'], ['main', 'main'], ['footer', 'footer']]) {
    const n = document.querySelectorAll(sel).length
    if (n !== 1) problems.push(`${n} <${label}> elements, expected 1`)
  }

  // 3. Exactly one H1.
  const h1s = document.querySelectorAll('h1')
  if (h1s.length !== 1) problems.push(`${h1s.length} <h1> elements, expected 1`)
  // An H1 that is empty or collapsed is a layout failure even though it exists.
  for (const h of h1s) {
    const r = h.getBoundingClientRect()
    if (r.width < 10 || r.height < 10) problems.push('H1 has no visible box')
  }

  // 4. Touch targets: interactive controls must clear 44x44 on small screens.
  if (vw <= 480) {
    const small = []
    for (const el of document.querySelectorAll('a, button, input, select, [role=button], summary')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // Visually-hidden controls are not tap targets: the skip link only gains
      // a real box when focused, and the file input is driven through the
      // dropzone button that wraps it.
      if (el.closest('.skipLink, .srLive, .srInline, .srOnlyInput, .dropzone input')) continue
      // Inline links inside prose are not tap targets by design.
      const cs = getComputedStyle(el)
      if (cs.display === 'inline' && el.tagName === 'A') continue
      if (r.height < 44) {
        small.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || '').trim().slice(0, 18)}"`)
      }
    }
    if (small.length) problems.push(`touch targets under 44px: ${small.slice(0, 6).join(' | ')}`)
  }

  // 5. Clipped text: a block whose content is wider than its own box.
  const clipped = []
  for (const el of document.querySelectorAll('h1, h2, h3, .brand, .compressBtn, .downloadBtn, .navbtn, .dropzone h2')) {
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      clipped.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} "${el.textContent.trim().slice(0, 20)}"`)
    }
  }
  if (clipped.length) problems.push(`clipped text: ${clipped.slice(0, 5).join(' | ')}`)

  // 6. The header must stay a single row and the CTA must remain reachable.
  const nav = document.querySelector('.nav')
  if (nav) {
    const cs = getComputedStyle(nav)
    if (cs.flexWrap === 'wrap') problems.push('header nav is wrapping')
    const r = nav.getBoundingClientRect()
    if (r.height > 100) problems.push(`header is ${Math.round(r.height)}px tall; expected a single ~66-76px row`)
  }

  // 7. Tools dropdown must not create horizontal scroll when open, and must be
  //    positioned relative to its trigger rather than pinned to an edge.
  const trigger = document.querySelector('.navDropTrigger')
  if (trigger) {
    trigger.click()
    const dd = document.querySelector('.toolsDropdown')
    if (dd) {
      const r = dd.getBoundingClientRect()
      const tr = trigger.getBoundingClientRect()
      if (r.left < -1 || r.right > vw + 1) {
        problems.push(`Tools dropdown overflows: [${Math.round(r.left)}..${Math.round(r.right)}] in ${vw}px`)
      }
      if (r.bottom > vw + 1) problems.push(`Tools dropdown runs past the viewport bottom (${Math.round(r.bottom)}px)`)
      const escaped = [...dd.querySelectorAll('a')].filter((a) => {
        const b = a.getBoundingClientRect()
        return b.right > vw + 1 || b.left < -1
      })
      if (escaped.length) problems.push(`${escaped.length} dropdown links outside the viewport`)
      const nowDocW = document.documentElement.scrollWidth
      if (nowDocW > vw + 1) problems.push(`opening Tools causes horizontal scroll (${nowDocW}px in ${vw}px)`)

      // Centring: the panel should sit under its trigger, unless it has been
      // clamped against a viewport edge. Being pinned to the far left with the
      // trigger nowhere near it was the original defect.
      const MARGIN = 12
      const clampedLeft = r.left <= MARGIN + 1
      const clampedRight = r.right >= vw - MARGIN - 1
      const delta = Math.abs(r.left + r.width / 2 - (tr.left + tr.width / 2))
      const panelFitsWithoutClamp = tr.left + tr.width / 2 - r.width / 2 >= MARGIN &&
        tr.left + tr.width / 2 - r.width / 2 + r.width <= vw - MARGIN
      if (panelFitsWithoutClamp && !clampedLeft && !clampedRight && delta > 2) {
        problems.push(`Tools dropdown is ${Math.round(delta)}px off its trigger and is not clamped to an edge`)
      }

      // A tool name should sit on one line, not wrap inside a narrow column.
      const wrapped = [...dd.querySelectorAll('.toolsCol a')].filter((a) => {
        const cs = getComputedStyle(a)
        return a.getBoundingClientRect().height > parseFloat(cs.lineHeight) * 1.6
      })
      if (wrapped.length) {
        problems.push(`${wrapped.length} dropdown links wrap onto a second line, e.g. "${wrapped[0].textContent.trim()}"`)
      }
      trigger.click()
    }
  }

  // 8. Centred sections must be centred on the *content box*, which is what the
  //    reader sees. `scrollbar-gutter: stable` reserves the scrollbar, so the
  //    content centre is `clientWidth / 2`, not `innerWidth / 2`.
  const contentW = document.documentElement.clientWidth
  for (const sel of ['.formatsSection', '.categoryGrid', '.honesty', '.privacySection']) {
    const el = document.querySelector(sel)
    if (!el) continue
    const r = el.getBoundingClientRect()
    const centre = r.left + r.width / 2
    const deviation = Math.abs(centre - contentW / 2)
    if (deviation > 2) {
      problems.push(`${sel} is ${deviation.toFixed(1)}px off centre (content box is ${contentW}px)`)
    }
  }

  // 9. Category cards: equal height, and their link lists must start on a
  //    shared baseline so the columns read as aligned.
  //    Only meaningful while the cards are side by side. Below 900px the grid
  //    becomes a single column, where each card is its own row and differing
  //    heights are correct.
  const cards = [...document.querySelectorAll('.category')]
  const grid = document.querySelector('.categoryGrid')
  const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0
  if (cards.length > 1 && columns > 1) {
    const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height))
    if (new Set(heights).size > 1) {
      problems.push(`category cards are not equal height: ${heights.join(', ')}`)
    }
    const firstLinkTops = cards.map((c) => {
      const a = c.querySelector('a')
      return a ? Math.round(a.getBoundingClientRect().top) : null
    })
    if (new Set(firstLinkTops).size > 1) {
      problems.push(`category link lists start at different heights: ${firstLinkTops.join(', ')}`)
    }
  }

  // 10. Mobile menu: only meaningful where the hamburger is actually shown.
  //     At desktop widths the button is `display: none`, so clicking it via JS
  //     would toggle state the user can never trigger — and the panel, though
  //     CSS-hidden, still has layout. Assert the panel is hidden instead.
  const menuBtn = document.querySelector('.menub')
  if (menuBtn && getComputedStyle(menuBtn).display !== 'none') {
    menuBtn.click()
    await new Promise((r) => requestAnimationFrame(r))
    const panel = document.querySelector('.mobileMenu')
    if (!panel) {
      problems.push('hamburger click did not open the mobile menu')
    } else {
      const cs = getComputedStyle(document.body)
      if (cs.overflow !== 'hidden') problems.push('body scroll is not locked while the mobile menu is open')
      const r = panel.getBoundingClientRect()
      // The panel is `position: fixed; left: 0; right: 0`, so it should cover
      // the full window width. Allow a 1px rounding tolerance.
      if (r.width < vw - 1) problems.push(`mobile menu does not span the viewport (${Math.round(r.width)}px of ${vw}px)`)

      // The menu must be structured, not a flat dump of every tool: the tool
      // list belongs behind per-category disclosures, and the panel should open
      // short enough to be usable without a long scroll.
      const groups = panel.querySelectorAll('.mobileGroup[open], .mobileGroup')
      if (groups.length < 2) {
        problems.push('mobile menu has no per-category tool groups')
      }
      // Collapsed by default: an open panel that already lists every tool is
      // the structureless layout this replaced.
      const openOnLoad = [...panel.querySelectorAll('.mobileGroup')].filter((g) => g.open).length
      if (openOnLoad > 0) {
        problems.push(`${openOnLoad} tool group(s) expanded by default; the panel should open compact`)
      }
      // Every tool must still be reachable inside a disclosure.
      const toolLinks = panel.querySelectorAll('.mobileGroup a[href^="/"]')
      if (toolLinks.length < 5) {
        problems.push(`mobile menu exposes only ${toolLinks.length} tools; expected every tool to be reachable`)
      }
      // The primary links must be present above the tool list.
      if (!panel.querySelector('.mobilePrimary')) {
        problems.push('mobile menu has no primary (Blog/About/Contact) row')
      }

      // The panel is `position: fixed; top: header; bottom: 0`, so it always
      // measures the full remaining viewport — that is the design, not a
      // defect. What matters is whether its *content* fits: if the collapsed
      // panel's content is taller than the panel, the user must scroll to reach
      // the legal links at the bottom.
      const contentH = panel.querySelector('.mobileMenuInner')?.scrollHeight ?? 0
      const overflows = contentH > r.height + 2
      if (overflows) {
        problems.push(
          `mobile menu content is ${Math.round(contentH)}px in a ${Math.round(r.height)}px panel; the bottom links need scrolling`
        )
      }

      const unreachable = [...panel.querySelectorAll('a')].filter((a) => {
        const b = a.getBoundingClientRect()
        // Hidden inside a collapsed disclosure is fine — it is not tappable yet.
        if (!a.closest('details[open]') && a.closest('details')) return false
        return b.height > 0 && b.height < 40
      })
      if (unreachable.length) problems.push(`${unreachable.length} visible mobile menu links under 40px tall`)
      menuBtn.click()
      await new Promise((r) => requestAnimationFrame(r))
      if (getComputedStyle(document.body).overflow === 'hidden') {
        problems.push('body scroll lock was not released when the menu closed')
      }
    }
  } else if (menuBtn) {
    // Desktop width: the hamburger is hidden, so the panel must not be rendered
    // at all — the mobile menu must never appear behind the desktop nav.
    const panel = document.querySelector('.mobileMenu')
    if (panel && getComputedStyle(panel).display !== 'none') {
      problems.push('mobile menu is present while the hamburger is hidden')
    }
  }

  return problems
}

const failures = []

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    const problems = await page.evaluate(auditPage)
    for (const p of problems) failures.push(`${width}px ${route} — ${p}`)
  }
}

console.log(`audited ${WIDTHS.length} widths x ${ROUTES.length} routes`)

await browser.close()

if (failures.length) {
  console.log(`\nFAIL — ${failures.length} finding(s):`)
  for (const f of failures) console.log(`  x ${f}`)
  process.exit(1)
}

console.log('\nPASS — responsive audit clean')