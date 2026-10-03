/**
 * Navigation and scroll-behaviour audit.
 *
 * Drives a real browser through the journeys that previously regressed, and
 * asserts the outcome rather than waiting an arbitrary time and assuming. Each
 * case names the specific bug it guards against.
 *
 *   PW_TOOLS=<dir containing playwright-core> node scripts/navigation-audit.mjs [baseUrl]
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

const require = createRequire(path.join(PW_TOOLS, 'noop.js'))
let chromium
try {
  ;({ chromium } = require('playwright-core'))
} catch {
  console.error('playwright-core not found. Set PW_TOOLS to a directory containing it.')
  process.exit(2)
}

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Wait for scroll position to settle rather than sleeping a fixed time. */
async function settleScroll() {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = -1
        let stable = 0
        const tick = () => {
          const y = Math.round(window.scrollY)
          if (y === last) stable++
          else stable = 0
          last = y
          if (stable >= 3) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )
}

async function waitForPath(pathname) {
  await page.waitForFunction(
    (expected) => window.location.pathname === expected,
    pathname,
    { timeout: 5000 }
  )
  await settleScroll()
}

// ── A. Home → scroll to the bottom → footer link to JPG Compressor ──
// Guards the original defect: a shorter destination inherited the old offset.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await settleScroll()
const beforeA = await page.evaluate(() => Math.round(window.scrollY))
await page.click('.footerCol a[href="/jpg-compressor"]')
await waitForPath('/jpg-compressor')
const afterA = await page.evaluate(() => Math.round(window.scrollY))
check(
  'A. footer -> /jpg-compressor lands at top',
  afterA === 0,
  `scrollY ${beforeA} -> ${afterA}`
)

// ── B. Home → bottom → PDF Compressor ──
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await settleScroll()
await page.click('.footerCol a[href="/pdf-compressor"]')
await waitForPath('/pdf-compressor')
const afterB = await page.evaluate(() => Math.round(window.scrollY))
check('B. footer -> /pdf-compressor lands at top', afterB === 0, `scrollY ${afterB}`)

// ── C. Home → Tools dropdown → PNG Compressor ──
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.click('.navDropTrigger')
await page.waitForSelector('.toolsDropdown')
await page.click('.toolsDropdownInner a[href="/png-compressor"]')
await waitForPath('/png-compressor')
const afterC = await page.evaluate(() => Math.round(window.scrollY))
check('C. Tools dropdown -> /png-compressor lands at top', afterC === 0, `scrollY ${afterC}`)

// ── D. Tool → related tool ──
await page.goto(`${BASE}/jpg-compressor`, { waitUntil: 'networkidle' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await settleScroll()
await page.click('.relatedTools a[href="/webp-compressor"]')
await waitForPath('/webp-compressor')
const afterD = await page.evaluate(() => Math.round(window.scrollY))
check('D. related tool lands at top', afterD === 0, `scrollY ${afterD}`)

// ── E. Home → the in-page "How it works" jump must scroll to the anchor ──
// Reached from the page body, not the header: the homepage anchors were removed
// from the header when the nav was reduced to Tools / About / Blog / Contact, so
// the jump links below the tool grid are what connect the visitor to them.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.click('.sectionJump a[href="#how"]')
await page.waitForFunction(() => window.location.hash === '#how', null, { timeout: 5000 })
await settleScroll()
const afterE = await page.evaluate(() => {
  const section = document.getElementById('how')
  const header = document.querySelector('.siteHeader')
  if (!section) return { ok: false, reason: 'no #how section' }
  const rect = section.getBoundingClientRect()
  const headerH = header ? header.getBoundingClientRect().height : 0
  return {
    ok: rect.top >= headerH - 4 && rect.top < window.innerHeight,
    top: Math.round(rect.top),
    headerH: Math.round(headerH),
    y: Math.round(window.scrollY),
  }
})
check('E. #how scrolls to the section below the header', afterE.ok, JSON.stringify(afterE))

// ── F/G. Back and Forward restore history positions ──
// Uses a real route change rather than a same-page anchor, because that is the
// case the browser must restore scroll for: leaving the homepage from deep in
// the page and coming back.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.evaluate(() => window.scrollTo(0, 1200))
await settleScroll()
await page.click('.category a[href="/png-compressor"]')
await waitForPath('/png-compressor')
await page.goBack({ waitUntil: 'networkidle' })
await settleScroll()
const afterBack = await page.evaluate(() => ({ path: location.pathname, y: Math.round(window.scrollY) }))
check(
  'F. Back restores the previous route and scroll',
  afterBack.path === '/' && afterBack.y > 400,
  JSON.stringify(afterBack)
)

await page.goForward({ waitUntil: 'networkidle' })
await settleScroll()
const afterFwd = await page.evaluate(() => ({
  path: location.pathname,
  y: Math.round(window.scrollY),
}))
check(
  'G. Forward returns to where the user was going',
  afterFwd.path === '/png-compressor' && afterFwd.y === 0,
  JSON.stringify(afterFwd)
)

// ── H/I. Direct URL and refresh start at the top on a fresh load ──
await page.goto(`${BASE}/pdf-compressor`, { waitUntil: 'networkidle' })
const afterDirect = await page.evaluate(() => Math.round(window.scrollY))
check('H. direct URL starts at the top', afterDirect === 0, `scrollY ${afterDirect}`)

await page.reload({ waitUntil: 'networkidle' })
await settleScroll()
const afterReload = await page.evaluate(() => ({
  path: location.pathname,
  y: Math.round(window.scrollY),
  h1: document.querySelector('h1')?.textContent,
}))
check(
  'I. refresh keeps the route and starts at the top',
  afterReload.path === '/pdf-compressor' && afterReload.y === 0,
  JSON.stringify(afterReload)
)

// ── Extra: the header's own navigation, and the logo ──
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
const headerNav = await page.evaluate(() => {
  const nav = document.querySelector('.navlinks')
  if (!nav) return []
  // Each item is either a direct link (About, Blog, Contact) or the Tools
  // dropdown wrapper, so read the element itself as well as its descendants.
  return Array.from(nav.children)
    .map((c) => {
      const link = c.matches('a, button') ? c : c.querySelector('button, a')
      return link ? link.textContent.replace(/\s+/g, ' ').trim() : ''
    })
    .filter(Boolean)
})
check(
  'Header nav reads Tools, About, Blog, Contact',
  JSON.stringify(headerNav) === JSON.stringify(['Tools▾', 'About', 'Blog', 'Contact']),
  JSON.stringify(headerNav)
)

const logo = await page.evaluate(() => {
  const el = document.querySelector('.nav .brandMark')
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  return {
    found: true,
    loaded: el.complete && el.naturalWidth > 0,
    w: Math.round(r.width),
    h: Math.round(r.height),
    alt: el.getAttribute('alt'),
  }
})
check(
  'Header logo loads and is not distorted',
  logo.found && logo.loaded && logo.w > 40 && logo.h > 12 && logo.w / logo.h > 2.5,
  JSON.stringify(logo)
)

// ── Extra: the blog index and a post are reachable and well-formed ──
await page.goto(`${BASE}/blog`, { waitUntil: 'networkidle' })
const blogIndex = await page.evaluate(() => ({
  h1: document.querySelectorAll('h1').length,
  posts: document.querySelectorAll('.postCard').length,
  figures: document.querySelectorAll('.postCardArt svg[role="img"]').length,
}))
check(
  'Blog index lists all 5 posts, each with an SVG figure',
  blogIndex.h1 === 1 && blogIndex.posts === 5 && blogIndex.figures === 5,
  JSON.stringify(blogIndex)
)

await page.click('.postCard a')
await settleScroll()
const post = await page.evaluate(() => ({
  path: location.pathname,
  h1: document.querySelectorAll('h1').length,
  figure: document.querySelectorAll('.postFigure svg[role="img"]').length,
  ld: document.querySelectorAll('script[type="application/ld+json"]').length,
}))
check(
  'Blog post renders one H1, its figure and JSON-LD',
  post.path.startsWith('/blog/') && post.h1 === 1 && post.figure === 1 && post.ld >= 1,
  JSON.stringify(post)
)

// ── Extra: mobile menu must navigate and reset scroll ──
// The tool list is behind per-category disclosures, so the group has to be
// opened before its links are tappable — which is itself part of the check.
await page.setViewportSize({ width: 375, height: 720 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.click('.menub')
await page.waitForSelector('.mobileMenu')

const collapsed = await page.evaluate(() => {
  const groups = [...document.querySelectorAll('.mobileGroup')]
  const link = document.querySelector('.mobileMenu a[href="/gif-compressor"]')
  // A collapsed <details> hides its children, so the link must have no layout
  // box. Checking `offsetParent` as well as the rect catches the case where a
  // stylesheet gives the panel a height while the content is still hidden.
  const r = link?.getBoundingClientRect()
  const hasBox = !!r && r.height > 0 && link.offsetParent !== null
  return {
    groups: groups.length,
    openByDefault: groups.filter((g) => g.open).length,
    toolVisibleBeforeOpen: hasBox,
  }
})
check(
  'Mobile menu opens with tool groups collapsed',
  collapsed.groups >= 2 &&
    collapsed.openByDefault === 0 &&
    collapsed.toolVisibleBeforeOpen === false,
  JSON.stringify(collapsed)
)

// Open the "Video & Audio" group, which contains the GIF compressor.
await page.evaluate(() => {
  const groups = [...document.querySelectorAll('.mobileGroup')]
  const target = groups.find((g) => g.querySelector('a[href="/gif-compressor"]'))
  if (target) target.open = true
})
await page.waitForTimeout(150)

const opened = await page.evaluate(() => {
  const link = document.querySelector('.mobileMenu a[href="/gif-compressor"]')
  const r = link?.getBoundingClientRect()
  return {
    visible: !!r && r.height > 0,
    height: r ? Math.round(r.height) : 0,
    hasDescription: !!link?.querySelector('small'),
  }
})
check(
  'Opening a tool group reveals tappable tool links',
  opened.visible && opened.height >= 44 && opened.hasDescription,
  JSON.stringify(opened)
)

await page.click('.mobileMenu a[href="/gif-compressor"]')
await waitForPath('/gif-compressor')
const afterMobile = await page.evaluate(() => ({
  y: Math.round(window.scrollY),
  menuGone: !document.querySelector('.mobileMenu'),
  bodyUnlocked: getComputedStyle(document.body).overflow !== 'hidden',
}))
check(
  'Mobile menu -> tool navigates, closes, and unlocks scroll',
  afterMobile.y === 0 && afterMobile.menuGone && afterMobile.bodyUnlocked,
  JSON.stringify(afterMobile)
)

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} navigation checks passed`)
if (failed.length) process.exit(1)
console.log('PASS — navigation audit clean')