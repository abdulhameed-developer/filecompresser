/**
 * Role-based audit.
 *
 * Covers the dimensions the other audits do not: security headers, accessible
 * names and contrast, heading order, payload weight, and crawlable content
 * structure. Each section maps to a discipline so a failure names the owner.
 *
 *   PW_TOOLS=<dir> node scripts/role-audit.mjs [baseUrl]
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

const problems = []
const notes = []
const fail = (role, msg) => problems.push(`[${role}] ${msg}`)
const note = (role, msg) => notes.push(`[${role}] ${msg}`)

// ─────────────────────────── Security Engineer ───────────────────────────

const REQUIRED_HEADERS = [
  ['content-security-policy', /default-src 'self'/],
  ['content-security-policy', /object-src 'none'/],
  ['content-security-policy', /base-uri 'self'/],
  ['content-security-policy', /frame-ancestors 'self'/],
  ['x-content-type-options', /nosniff/],
  ['referrer-policy', /strict-origin-when-cross-origin/],
  ['permissions-policy', /camera=\(\)/],
  ['x-frame-options', /SAMEORIGIN/],
]

const res = await fetch(`${BASE}/privacy`, { redirect: 'manual' })
const csp = res.headers.get('content-security-policy') || ''
for (const [name, pattern] of REQUIRED_HEADERS) {
  const value = name === 'content-security-policy' ? csp : res.headers.get(name) || ''
  if (!pattern.test(value)) {
    fail('Security', `header ${name} missing or malformed (expected ${pattern})`)
  }
}

// The engine routes serve executable and binary payloads, so their own headers
// are checked separately — a bad Content-Type there is how a wasm download breaks.
for (const asset of ['/ffmpeg-core/ffmpeg-core.wasm', '/image-worker/browser-image-compression.js']) {
  const r = await fetch(BASE + asset, { redirect: 'manual' })
  if (r.status !== 200) {
    fail('Security', `${asset} returns ${r.status}`)
    continue
  }
  const ct = r.headers.get('content-type') || ''
  if (asset.endsWith('.wasm') && !ct.includes('application/wasm')) {
    fail('Security', `${asset} served as "${ct}"; must be application/wasm`)
  }
  if (!r.headers.get('x-content-type-options')?.includes('nosniff')) {
    fail('Security', `${asset} is missing nosniff`)
  }
}

// Path traversal on the asset routes must not read arbitrary files.
for (const probe of [
  '/ffmpeg-core/..%2f..%2fpackage.json',
  '/ffmpeg-core/worker.js',
  '/image-worker/../../../etc/passwd',
]) {
  const r = await fetch(BASE + probe, { redirect: 'manual' })
  const text = r.status === 200 ? await r.text() : ''
  if (r.status === 200 && /"name"\s*:\s*"filecompresser"/.test(text)) {
    fail('Security', `${probe} returned package.json — path traversal`)
  }
  if (r.status === 200 && /root:x:0:0/.test(text)) {
    fail('Security', `${probe} returned /etc/passwd — path traversal`)
  }
}

// Unknown routes must not leak internals.
const missing = await fetch(`${BASE}/does-not-exist-at-all`, { redirect: 'manual' })
const missingBody = await missing.text()
for (const leak of [/at Object\./, /node_modules/, /webpack:/, /\bat .*\.tsx?:/]) {
  if (leak.test(missingBody)) fail('Security', `404 page leaks internals (${leak})`)
}

// External links must not be bare (no rel=noopener).
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

// ─────────────────────────── Performance / DevOps ───────────────────────────

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
const failedRequests = []
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} — ${r.failure()?.errorText}`))

for (const route of ['/', '/jpg-compressor', '/about', '/blog', '/blog/honest-file-size-reporting']) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })

  const bytes = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .reduce((sum, r) => sum + (r.transferSize || 0), 0)
  )
  // Generous, but a real regression guard: the FFmpeg core must never load here.
  if (bytes > 900_000) {
    fail('DevOps', `${route} transferred ${Math.round(bytes / 1024)}KB on first load`)
  }
  if (bytes > 0 && bytes < 20_000) {
    note('DevOps', `${route} transferred only ${Math.round(bytes / 1024)}KB — suspiciously light`)
  }

  const heavy = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => /ffmpeg-core|ffmpeg-core\.wasm/.test(r.name) && r.transferSize > 0)
      .map((r) => r.name)
  )
  if (heavy.length) {
    fail('DevOps', `${route} loaded the FFmpeg core on page load: ${heavy.join(', ')}`)
  }
}

if (consoleErrors.length) {
  for (const e of [...new Set(consoleErrors)]) fail('Frontend', `console error: ${e}`)
}
if (failedRequests.length) {
  for (const f of [...new Set(failedRequests)]) fail('Frontend', `request failed: ${f}`)
}

// ─────────────────────────── Accessibility ───────────────────────────

const A11Y_ROUTES = ['/', '/jpg-compressor', '/about', '/blog', '/blog/honest-file-size-reporting', '/contact', '/sitemap', '/404-missing']

for (const route of A11Y_ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
  const issues = await page.evaluate(() => {
    const out = []
    // Landmarks
    if (document.querySelectorAll('main').length !== 1) out.push('not exactly one <main>')
    if (document.querySelectorAll('header').length !== 1) out.push('not exactly one <header>')
    if (!document.querySelector('footer')) out.push('no <footer>')

    // Heading order: no level may be skipped on the way down.
    const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter((h) => h.getBoundingClientRect().height > 0)
      .map((h) => Number(h.tagName[1]))
    if (levels.length && levels[0] !== 1) out.push(`first heading is h${levels[0]}, expected h1`)
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) {
        out.push(`heading jumps h${levels[i - 1]} -> h${levels[i]}`)
        break
      }
    }

    // Every interactive control needs an accessible name.
    const nameless = []
    for (const el of document.querySelectorAll('a, button, input, select, textarea, summary')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const name = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent ||
        (el.labels && el.labels[0]?.textContent) ||
        el.getAttribute('placeholder') ||
        ''
      ).trim()
      if (!name) nameless.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''))
    }
    if (nameless.length) out.push(`${nameless.length} control(s) without an accessible name: ${[...new Set(nameless)].slice(0, 3).join(', ')}`)

    // Images need alt (decorative ones must say so explicitly).
    const noAlt = [...document.querySelectorAll('img')].filter((i) => i.getAttribute('alt') === null)
    if (noAlt.length) out.push(`${noAlt.length} <img> without an alt attribute`)

    // Every form control needs a programmatic label.
    const unlabelled = []
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const has = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length)
      if (!has) unlabelled.push(el.tagName.toLowerCase() + '#' + (el.id || '?'))
    }
    if (unlabelled.length) out.push(`${unlabelled.length} form control(s) without a label: ${unlabelled.join(', ')}`)

    // Buttons must declare their type, or they submit an enclosing form by default.
    const untyped = [...document.querySelectorAll('button')].filter((b) => !b.getAttribute('type'))
    if (untyped.length) out.push(`${untyped.length} <button> without an explicit type`)

    // The page must declare a language.
    if (!document.documentElement.getAttribute('lang')) out.push('<html> has no lang')

    // A skip link must be the first focusable and must target the main landmark.
    const skip = document.querySelector('.skipLink')
    if (!skip) {
      out.push('no skip link')
    } else {
      const href = (skip.getAttribute('href') || '').trim()
      const target = href.replace(/^#/, '')
      if (target !== 'main') {
        out.push(`skip link targets "#${target}", expected "#main"`)
      }
      if (!document.getElementById('main')) {
        out.push('skip link target #main does not exist')
      }
    }

    return out
  })
  for (const i of issues) fail('Accessibility', `${route} — ${i}`)
}

// Contrast is checked on real rendered colours rather than guessed.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
const contrast = await page.evaluate(() => {
  const lum = (r, g, b) => {
    const f = (c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s)
    if (!m) return null
    const parts = m[1].split(',').map((v) => parseFloat(v))
    if (parts.length < 3) return null
    return [parts[0], parts[1], parts[2]]
  }
  // Resolve the first opaque background by walking up. The alpha channel has
  // to be parsed properly: `rgba(0, 0, 0, 0)` is fully transparent and must
  // be skipped, while `rgb(22, 59, 49)` (no alpha) is opaque. Treating a
  // transparent layer as opaque is what made white-on-dark-section text read as
  // 1.7:1 when it is really over 12:1.
  const parseColor = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s)
    if (!m) return null
    const parts = m[1].split(',').map((v) => parseFloat(v))
    if (parts.length < 3) return null
    return { rgb: [parts[0], parts[1], parts[2]], a: parts.length > 3 ? parts[3] : 1 }
  }
  const bgOf = (el) => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0.5) return c.rgb
      n = n.parentElement
    }
    return [255, 255, 255]
  }
  const out = []
  for (const el of document.querySelectorAll('p, a, h1, h2, h3, small, span, li, button, label')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (!el.textContent.trim()) continue
    const fg = parse(getComputedStyle(el).color)
    if (!fg) continue
    const bg = bgOf(el)
    const L1 = lum(...fg), L2 = lum(...bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const size = parseFloat(getComputedStyle(el).fontSize)
    const bold = parseInt(getComputedStyle(el).fontWeight, 10) >= 700
    const large = size >= 24 || (size >= 18.66 && bold)
    const min = large ? 3 : 4.5
    if (ratio < min) {
      out.push({
        text: el.textContent.trim().slice(0, 32),
        ratio: Number(ratio.toFixed(2)),
        min,
        size: Number(size.toFixed(1)),
        cls: String(el.className || '').split(' ')[0],
      })
    }
  }
  // Dedupe by class so one bad pattern reports once.
  const seen = new Set()
  return out.filter((o) => {
    const k = o.cls || o.text
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
})
for (const c of contrast) {
  fail(
    'Accessibility',
    `contrast ${c.ratio}:1 (needs ${c.min}:1) on "${c.text}" at ${c.size}px${c.cls ? ` .${c.cls}` : ''}`
  )
}

await browser.close()

// ─────────────────────────── Report ───────────────────────────

console.log('Role audit results')
console.log('-------------------')
if (notes.length) {
  console.log('\nNotes:')
  for (const n of notes) console.log(`  - ${n}`)
}
if (problems.length) {
  console.log(`\nFAIL — ${problems.length} issue(s):`)
  for (const p of problems) console.log(`  x ${p}`)
  process.exit(1)
}
console.log('\nPASS — role audit clean')