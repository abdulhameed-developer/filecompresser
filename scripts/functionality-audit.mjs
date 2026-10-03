/**
 * Functionality audit: drives each engine with real files and reports what
 * actually happened, including failures and hangs.
 *
 * Separate from the unit tests on purpose — those call the engine functions
 * directly, while this exercises the full browser path a user takes: the React
 * queue, the engine loader, the worker, and the result UI.
 *
 *   PW_TOOLS=<dir> node scripts/functionality-audit.mjs [baseUrl]
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

/** Per-case budget. Anything still running at this point is reported as a hang. */
const TIMEOUT_MS = Number(process.env.CASE_TIMEOUT_MS || 90_000)

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * Run one file through whatever tool page we are on, and report the outcome.
 * Executed inside the page, so it can build the File and watch the queue.
 */
async function runCase({ route, fixture, filename, mime, settings, timeoutMs }) {
  const errorsBefore = consoleErrors.length

  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelectorAll('.fileActions .iconBtn').forEach((b) => b.click()))

  const outcome = await page.evaluate(
    async ({ fixture, filename, mime, settings, timeoutMs }) => {
      const res = await fetch(fixture)
      if (!res.ok) return { stage: 'fetch', error: `HTTP ${res.status} for ${fixture}` }
      const buf = await res.arrayBuffer()

      const dt = new DataTransfer()
      dt.items.add(new File([buf], filename, { type: mime }))
      const input = document.querySelector('.dropzone input[type=file]')
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))

      // Wait for validation to settle.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 100))
        const li = document.querySelector('.file')
        if (li && /queued|failed/.test(li.className)) break
      }

      const first = document.querySelector('.file')
      if (!first) return { stage: 'validate', error: 'no row appeared' }
      if (/failed/.test(first.className)) {
        return { stage: 'validate', error: first.querySelector('.fileError')?.textContent || 'rejected' }
      }

      if (settings) {
        for (const [id, value] of Object.entries(settings)) {
          const el = document.querySelector(`select[id*="${id}"], [name="${id}"]`)
          if (el) {
            el.value = value
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }
      }

      const btn = document.querySelector('.compressBtn')
      if (!btn || btn.disabled) return { stage: 'start', error: 'primary action unavailable' }
      btn.click()

      const started = Date.now()
      let lastStage = ''
      for (;;) {
        await new Promise((r) => setTimeout(r, 200))
        if (Date.now() - started > timeoutMs) {
          return {
            stage: 'hang',
            error: `still processing after ${Math.round((Date.now() - started) / 1000)}s`,
            lastStage,
          }
        }
        const rows = Array.from(document.querySelectorAll('.file'))
        if (!rows.length) return { stage: 'done', rows: [] }
        const st = rows[0].querySelector('.fileStatus')?.textContent || ''
        if (st !== lastStage) lastStage = st
        // Settled when nothing is still processing.
        if (!rows.some((li) => /processing|validating/.test(li.className))) {
          return {
            stage: 'done',
            rows: rows.map((li) => ({
              name: li.querySelector('.fileMeta strong')?.textContent,
              cls: li.className.replace('file status-', ''),
              facts: li.querySelector('.fileFacts')?.textContent,
              status: li.querySelector('.fileStatus')?.textContent,
              error: li.querySelector('.fileError')?.textContent || null,
              download: li.querySelector('.linkBtn')?.textContent?.trim() || null,
            })),
          }
        }
      }
    },
    { fixture, filename, mime, settings, timeoutMs }
  )

  return { ...outcome, newConsoleErrors: consoleErrors.slice(errorsBefore) }
}

const cases = [
  {
    name: 'JPG compression (real re-encode)',
    route: '/jpg-compressor',
    // Built in-page below rather than shipped as a binary fixture.
    inline: 'jpeg',
  },
  {
    name: 'PNG compression',
    route: '/png-compressor',
    inline: 'png',
  },
  {
    name: 'WEBP compression',
    route: '/webp-compressor',
    inline: 'webp',
  },
  {
    name: 'GIF compression (FFmpeg WASM)',
    route: '/gif-compressor',
    fixture: '/anim.gif',
    filename: 'anim.gif',
    mime: 'image/gif',
  },
  {
    name: 'MP3 compression',
    route: '/mp3-compressor',
    fixture: '/tone.wav',
    filename: 'tone.mp3',
    mime: 'audio/mpeg',
  },
  {
    name: 'WAV to MP3 (FFmpeg WASM)',
    route: '/wav-compressor',
    fixture: '/tone.wav',
    filename: 'tone.wav',
    mime: 'audio/wav',
  },
  {
    name: 'PDF optimization',
    route: '/pdf-compressor',
    fixture: '/sample.pdf',
    filename: 'sample.pdf',
    mime: 'application/pdf',
  },
  {
    name: 'ZIP creation',
    route: '/zip-compressor',
    fixture: '/normal.zip',
    filename: 'bundle.zip',
    mime: 'application/zip',
  },
  {
    name: 'ZIP extraction (safe archive)',
    route: '/archive-compressor',
    fixture: '/normal.zip',
    filename: 'normal.zip',
    mime: 'application/zip',
  },
  {
    name: 'ZIP extraction (path traversal blocked)',
    route: '/archive-compressor',
    fixture: '/traversal.zip',
    filename: 'traversal.zip',
    mime: 'application/zip',
    expectFailure: true,
  },
  {
    name: 'Compress Any File auto-routes a WAV to the audio engine',
    route: '/compress',
    fixture: '/tone.wav',
    filename: 'tone.wav',
    mime: 'audio/wav',
  },
  {
    name: 'Oversized file is rejected with a clear message',
    route: '/jpg-compressor',
    fixture: '/sample.pdf',
    filename: 'not-an-image.jpg',
    mime: 'image/jpeg',
    expectFailure: true,
  },
]

/**
 * Builds a real file of the requested kind in the page. Defined per evaluate
 * because every `goto` discards the previous page's globals.
 */
const MAKE_FIXTURE = `
  (async function makeFixture(kind) {
    if (kind === 'svg') {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#1e6b5a"/><circle cx="120" cy="80" r="60" fill="#c9ed4b"/></svg>'
      return new File([new Blob([svg], { type: 'image/svg+xml' })], 'logo.svg', { type: 'image/svg+xml' })
    }
    const canvas = document.createElement('canvas')
    canvas.width = kind === 'png' ? 800 : 1000
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 7 + 13) % 256
      img.data[i + 1] = (i * 31 + 77) % 256
      img.data[i + 2] = (i * 97 + 41) % 256
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const type = kind === 'png' ? 'image/png' : kind === 'webp' ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise((r) => canvas.toBlob(r, type, 0.9))
    const name = kind === 'png' ? 'noise.png' : kind === 'webp' ? 'noise.webp' : 'noise.jpg'
    return new File([blob], name, { type })
  })
`

for (const testCase of cases) {
  let outcome
  if (testCase.inline) {
    await page.goto(`${BASE}${testCase.route}`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.querySelectorAll('.fileActions .iconBtn').forEach((b) => b.click()))
    outcome = await page.evaluate(
      async ({ kind, timeoutMs, makeSrc }) => {
        const makeFixture = eval(`(${makeSrc})`)
        const file = await makeFixture(kind)
        const dt = new DataTransfer()
        dt.items.add(file)
        const input = document.querySelector('.dropzone input[type=file]')
        input.files = dt.files
        input.dispatchEvent(new Event('change', { bubbles: true }))

        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 100))
          const li = document.querySelector('.file')
          if (li && /queued|failed/.test(li.className)) break
        }
        const first = document.querySelector('.file')
        if (!first) return { stage: 'validate', error: 'no row appeared' }
        if (/failed/.test(first.className)) {
          return { stage: 'validate', error: first.querySelector('.fileError')?.textContent }
        }
        document.querySelector('.compressBtn').click()

        const started = Date.now()
        for (;;) {
          await new Promise((r) => setTimeout(r, 200))
          if (Date.now() - started > timeoutMs) {
            return {
              stage: 'hang',
              error: `still processing after ${Math.round((Date.now() - started) / 1000)}s`,
              lastStage: document.querySelector('.fileStatus')?.textContent,
            }
          }
          const rows = Array.from(document.querySelectorAll('.file'))
          if (!rows.length) return { stage: 'done', rows: [] }
          if (!rows.some((li) => /processing|validating/.test(li.className))) {
            return {
              stage: 'done',
              rows: rows.map((li) => ({
                name: li.querySelector('.fileMeta strong')?.textContent,
                cls: li.className.replace('file status-', ''),
                facts: li.querySelector('.fileFacts')?.textContent,
                download: li.querySelector('.linkBtn')?.textContent?.trim() || null,
              })),
            }
          }
        }
      },
      { kind: testCase.inline, timeoutMs: TIMEOUT_MS, makeSrc: MAKE_FIXTURE }
    )
  } else {
    outcome = await runCase({ ...testCase, timeoutMs: TIMEOUT_MS })
  }

  const detail = JSON.stringify(outcome)
  if (testCase.expectFailure) {
    const blocked = outcome.stage === 'validate' || (outcome.rows || []).some((r) => r.cls === 'failed')
    record(testCase.name, blocked, detail.slice(0, 220))
  } else if (outcome.stage === 'done' && (outcome.rows || []).length) {
    const allOk = outcome.rows.every((r) => r.cls === 'completed')
    record(testCase.name, allOk, detail.slice(0, 260))
  } else {
    record(testCase.name, false, detail.slice(0, 260))
  }
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} functionality checks passed`)
if (consoleErrors.length) {
  console.log(`\nconsole errors (${consoleErrors.length}):`)
  for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log(`  ! ${e}`)
}
if (failed.length) process.exit(1)
console.log('PASS — functionality audit clean')