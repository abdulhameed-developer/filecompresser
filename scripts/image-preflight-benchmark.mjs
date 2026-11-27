/** Actual availableOutputFormats API, separately from encoding and page load.
 * Requires an isolated bench-client.mjs built from the stated source revision.
 * node scripts/image-preflight-benchmark.mjs BASE DATA_DIRECTORY OUTPUT_JSON
 */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'

const qa = createRequire(path.resolve(process.env.PW_TOOLS || path.join(os.homedir(), 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const [base, directory, destination] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
const wanted = new Set(['portrait-hq', 'portrait-large', 'orientation-6', 'transparent', 'landscape-hq-webp', 'precision-16'])
const report = { version: 1, base, timestamp: new Date().toISOString(), method: 'Actual source preflight API. Fresh context per input; three API calls in that context. Excludes fixture serialization and benchmark bundle import. No compression is performed and headers do not establish decodability.', cases: [], errors: [] }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
report.browser = await browser.version()
try {
  for (const fixture of manifest.fixtures.filter(f => wanted.has(f.id))) {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('requestfailed', r => report.errors.push({ resource: r.url(), message: r.failure()?.errorText }))
    page.on('pageerror', error => report.errors.push({ page: error.message }))
    await page.goto(`${base}/robots.txt`)
    await page.evaluate(async ({ encoded, fileName, type }) => {
      window.benchmarkFile = new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], fileName, { type })
      window.workerEvents = []
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); window.workerEvents.push('created') }
        terminate() { window.workerEvents.push('terminated'); super.terminate() }
      }
      window.preflight = (await import('/bench-client.mjs')).availableOutputFormats
    }, { encoded: readFileSync(path.join(directory, 'inputs', fixture.file)).toString('base64'), fileName: fixture.file, type: { JPEG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp' }[fixture.format] })
    for (let repetition = 1; repetition <= 3; repetition++) {
      const result = await page.evaluate(async () => {
        let source
        const started = performance.now(), eventsBefore = window.workerEvents.length
        const formats = await window.preflight(window.benchmarkFile, undefined, value => {
          const { file: _file, ...metadata } = value
          source = metadata
        })
        return { elapsedMs: performance.now() - started, formats, source, workerEvents: window.workerEvents.slice(eventsBefore) }
      })
      assert.deepEqual([result.source.width, result.source.height], fixture.displayDimensions)
      if (fixture.format === 'JPEG') {
        assert.deepEqual(result.formats, ['jpeg', 'png', 'webp'])
        assert.equal(result.source.hasAlpha, false)
      }
      if (fixture.id === 'transparent') {
        assert.equal(result.source.hasAlpha, true)
        assert.equal(result.formats.includes('jpeg'), false)
      }
      report.cases.push({ fixture: fixture.id, inputSha256: fixture.sha256, repetition, ...result })
      console.log(fixture.id, repetition, Math.round(result.elapsedMs), result.workerEvents.join(','))
    }
    await context.close()
  }
} finally {
  await browser.close()
  mkdirSync(path.dirname(path.resolve(destination)), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`)
}
if (report.errors.length) process.exitCode = 1
