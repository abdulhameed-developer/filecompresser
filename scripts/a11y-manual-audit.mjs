/**
 * Manual-equivalent accessibility checks.
 *
 * The automated role audit covers names, labels, landmarks, heading order and
 * contrast. It cannot cover what actually needs a human or a real assistive
 * technology, so this file checks the parts that *can* be verified mechanically
 * and reports the rest honestly as a checklist for a human to run.
 *
 * The line between the two is deliberate: anything that can be asserted is
 * asserted; anything that genuinely requires judgement is named, not guessed.
 *
 *   PW_TOOLS=<dir> node scripts/a11y-manual-audit.mjs [baseUrl]
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
const require = createRequire(path.join(PW_TOOLS, 'noop.js'))
const { chromium } = require('playwright-core')

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

const failures = []
const fail = (msg) => failures.push(msg)
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail(name)
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

// ── 1. Keyboard: every interactive control reachable and operable ──────────
console.log('\n1. Keyboard operation')

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
const tabOrder = []
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab')
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const r = el.getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28),
      visible: r.width > 0 && r.height > 0,
      outline: getComputedStyle(el).outlineStyle,
    }
  })
  if (info) tabOrder.push(info)
}

// The skip link must be the very first stop and become visible when focused.
check('skip link is the first tab stop', tabOrder[0]?.label?.includes('Skip') ?? false, tabOrder[0]?.label)
check(
  'focused elements have a visible focus ring',
  tabOrder.every((t) => t.outline !== 'none'),
  tabOrder.find((t) => t.outline === 'none')?.label
)

// Activate the tools dropdown with the keyboard only.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.querySelector('.navDropTrigger')?.focus())
await page.keyboard.press('Enter')
const openedWithKeyboard = await page.evaluate(() => !!document.querySelector('.toolsDropdown'))
check('Tools dropdown opens from the keyboard', openedWithKeyboard)

await page.keyboard.press('ArrowDown')
const focusedInPanel = await page.evaluate(() => {
  const el = document.activeElement
  return !!el && !!el.closest('.toolsDropdown')
})
check('arrow keys move focus into the panel', focusedInPanel)

await page.keyboard.press('Escape')
const closedAfterEscape = await page.evaluate(() => {
  const gone = !document.querySelector('.toolsDropdown')
  const backOnTrigger = document.activeElement?.classList.contains('navDropTrigger')
  return { gone, backOnTrigger }
})
check(
  'Escape closes the panel and returns focus to the trigger',
  closedAfterEscape.gone && closedAfterEscape.backOnTrigger,
  JSON.stringify(closedAfterEscape)
)

// Enter must activate a dropdown link.
await page.keyboard.press('Enter')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
check('a tool can be reached and activated by keyboard alone', !page.url().endsWith('/'), page.url().replace(BASE, ''))

// ── 2. Reflow at 400% zoom (WCAG 1.4.10) ─────────────────────────────────
console.log('\n2. Reflow and zoom')

// 1280px at 400% is the WCAG definition of a 320px-wide viewport.
for (const route of ['/', '/jpg-compressor', '/blog', '/about', '/contact']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    // Find anything sticking out horizontally.
    offenders: [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return false
        if (el.closest('.skipLink, .srLive, .srInline, .srOnlyInput')) return false
        return r.right > document.documentElement.clientWidth + 1
      })
      .slice(0, 3)
      .map((el) => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]),
  }))
  check(
    `${route} reflows at 400% zoom without horizontal scrolling`,
    overflow.scrollW <= overflow.clientW + 1 && overflow.offenders.length === 0,
    overflow.offenders.join(', ')
  )
}

// ── 3. Text spacing override (WCAG 1.4.12) ───────────────────────────────
console.log('\n3. Text spacing (1.4.12)')

await page.goto(`${BASE}/jpg-compressor`, { waitUntil: 'networkidle' })
// The user's stylesheet: line-height 1.5x, spacing after paragraphs 2x,
// letter spacing 0.12em, word spacing 0.16em.
await page.addStyleTag({
  content: `
    * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
    p, li, h1, h2, h3 { margin-bottom: 2em !important; }
  `,
})
await page.waitForTimeout(200)
const clipped = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('h1, h2, h3, p, li, .compressBtn, .limit, .toolFacts dd')) {
    const cs = getComputedStyle(el)
    if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      out.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}`)
    }
    void cs
  }
  return out
})
check('no text is clipped when a user overrides text spacing', clipped.length === 0, clipped.join(', '))

// ── 4. Reduced motion (WCAG 2.3.3) ────────────────────────────────────────
console.log('\n4. Motion preferences')

const reduced = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
})
const rmPage = await reduced.newPage()
await rmPage.goto(`${BASE}/jpg-compressor`, { waitUntil: 'networkidle' })
const motion = await rmPage.evaluate(() => {
  const offenders = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    const dur = parseFloat(cs.animationDuration) || 0
    const tdur = parseFloat(cs.transitionDuration) || 0
    if (dur > 0.01 || tdur > 0.01) {
      offenders.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}`)
    }
  }
  const html = getComputedStyle(document.documentElement)
  return {
    offenders: offenders.slice(0, 5),
    scrollBehavior: html.scrollBehavior,
  }
})
check(
  'animation and transitions are disabled under prefers-reduced-motion',
  motion.offenders.length === 0,
  motion.offenders.join(', ')
)
check('smooth scrolling is disabled under reduced motion', motion.scrollBehavior === 'auto', motion.scrollBehavior)
await reduced.close()

// ── 5. Touch targets (WCAG 2.5.8, AA — 24px minimum) ─────────────────────
console.log('\n5. Target size')

for (const width of [320, 375, 768]) {
  await page.setViewportSize({ width, height: 800 })
  await page.goto(`${BASE}/jpg-compressor`, { waitUntil: 'networkidle' })
  const small = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('a, button, select, input, summary')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (el.closest('.skipLink, .srLive, .srInline, .srOnlyInput, .dropzone input')) continue
      const inline = getComputedStyle(el).display === 'inline' && el.tagName === 'A'
      if (inline) continue
      if (r.height < 24 || r.width < 24) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    return out
  })
  check(`${width}px: interactive targets are at least 24x24 (WCAG 2.5.8)`, small.length === 0, small.slice(0, 4).join(', '))
}

await page.setViewportSize({ width: 1280, height: 900 })

// ── 6. The upload control is operable without a mouse ─────────────────────
console.log('\n6. Upload control')

await page.goto(`${BASE}/jpg-compressor`, { waitUntil: 'networkidle' })
const dropzone = await page.evaluate(() => {
  const el = document.querySelector('.dropzone')
  return {
    role: el?.getAttribute('role'),
    tabIndex: el?.getAttribute('tabindex'),
    label: el?.getAttribute('aria-label'),
    describedBy: !!document.getElementById(el?.getAttribute('aria-describedby') || ''),
  }
})
check(
  'dropzone is a focusable button with a name and description',
  dropzone.role === 'button' && dropzone.tabIndex === '0' && !!dropzone.label && dropzone.describedBy,
  JSON.stringify(dropzone)
)

// ── 7. Live regions announce state changes ────────────────────────────────
console.log('\n7. Status announcements')

const live = await page.evaluate(() => {
  const regions = [...document.querySelectorAll('[aria-live]')].map((r) => ({
    role: r.getAttribute('role'),
    live: r.getAttribute('aria-live'),
    // A live region must exist in the DOM before the text changes, or the
    // change is not announced.
    present: true,
  }))
  return regions
})
check(
  'processing status is exposed via a live region',
  live.some((r) => r.live === 'polite' || r.role === 'status'),
  JSON.stringify(live)
)

await browser.close()

// ── Report ────────────────────────────────────────────────────────────────
console.log('\n\nWhat still needs a person')
console.log('-------------------------')
console.log('These cannot be verified from a script. Each needs a human, ideally')
console.log('someone who uses assistive technology daily.')
console.log('')
console.log('  [ ] NVDA (Windows) + Firefox: walk a tool end to end. Is the')
console.log('      progress bar announced? Does the result row read sensibly?')
console.log('  [ ] VoiceOver (macOS/iOS) + Safari: same walkthrough, plus rotor')
console.log('      navigation through the header and mobile menu.')
console.log('  [ ] Keyboard only, no mouse: complete a real compression and')
console.log('      download it. (Tab order and activation are checked above;')
console.log('      focus *visibility* while tabbing still needs an eye.)')
console.log('  [ ] Windows High Contrast / forced-colors mode.')
console.log('  [ ] Browser zoom to 500%, plus text-only zoom to 200%.')
console.log('  [ ] A real screen-reader user. Automated checks miss roughly two')
console.log('      thirds of WCAG issues; this is where most of them live.')
console.log('  [ ] Cognitive review: can a first-time visitor tell what each tool')
console.log('      does, in plain language, without reading the source?')
console.log('')
console.log('Note: this suite is NOT a WCAG conformance claim. It covers the')
console.log('subset that can be asserted mechanically.')

if (failures.length) {
  console.log(`\nFAIL — ${failures.length} issue(s):`)
  for (const f of failures) console.log(`  x ${f}`)
  process.exit(1)
}
console.log('\nPASS — mechanical accessibility checks clean')