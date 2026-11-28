/** Real compiled UI inputs/downloads; independent native file checks follow.
 * PW_TOOLS=.qa-results/phase2/qa-tools node scripts/target-size-audit.mjs BASE OUTPUT
 * TARGET_FIXTURES comma-separated manifest ids; TARGET_BROWSER chromium|firefox|webkit.
 * Generated/licensed fixtures remain private. No output is accepted from a UI badge alone.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readVerifiedImageFixture } from './benchmark-fixture.mjs'
const require = createRequire(path.resolve(process.env.PW_TOOLS || '.qa-results/phase2/qa-tools', 'qa.cjs'))
const pw = require('playwright-core')
const [base, destination] = process.argv.slice(2)
if (!base || !destination) throw new Error('Supply actual candidate URL and a new output directory')
const output = path.resolve(destination)
if (existsSync(path.join(output, 'report.json'))) throw new Error('Preserve the previous report; choose a new output directory')
mkdirSync(path.join(output, 'downloads'), { recursive: true })
mkdirSync(path.join(output, 'screenshots'), { recursive: true })
const fixtureRoot = path.resolve(process.env.TARGET_FIXTURE_ROOT || '.qa-results/phase2/image-lab')
const manifest = JSON.parse(readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
const requested = process.env.TARGET_FIXTURES?.split(',')
const fixtures = manifest.fixtures.filter(f => !requested || requested.includes(f.id))
if (!fixtures.length || requested?.some(id => !fixtures.find(f => f.id === id))) throw new Error('Unknown fixture selection')
for (const f of fixtures) readVerifiedImageFixture(fixtureRoot, f)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const python = process.env.QUALITY_PYTHON || (existsSync('.qa-results/phase2/quality-venv/bin/python') ? '.qa-results/phase2/quality-venv/bin/python' : 'python3')
const workerFiles = ['image-pipeline.mjs', 'image-png.mjs', 'image-canvas.mjs', 'image-metadata.mjs', 'image-engine.mjs']
const expectedWorkerPins = Object.fromEntries(workerFiles.map(name => [name, sha(readFileSync(`workers/${name}`))]))
async function identity() {
  const resources = []
  for (const name of workerFiles) {
    const response = await fetch(`${base}/image-worker/${name}`)
    const bytes = Buffer.from(await response.arrayBuffer()), expected = expectedWorkerPins[name]
    resources.push({ name, status: response.status, sha256: sha(bytes), expectedSha256: expected })
    assert.equal(response.status, 200); assert.equal(sha(bytes), expected, `Stale worker: ${name}`)
  }
  return resources
}
const browserName = process.env.TARGET_BROWSER || 'chromium'
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('Unknown browser')
const routeOverride = process.env.TARGET_ROUTE
if (routeOverride && !['/compress', '/image-compressor', '/jpg-compressor', '/jpeg-compressor', '/png-compressor', '/webp-compressor'].includes(routeOverride)) throw new Error('Unknown target-size route')
const report = { version: 1, routeOverride, capturedAt: new Date().toISOString(), base, browserName, fixtureManifestSha256: sha(readFileSync(path.join(fixtureRoot, 'manifest.json'))), fixtureScope: fixtures.map(f => f.id), timingDefinition: 'Actual primary click to terminal queue state, including initialization/decode/encoding/verification/UI; excludes navigation, upload readiness, modal configuration and download. Serial shared-host samples, not universal timing.', cases: [], diagnostics: [], identityBefore: await identity() }
const browser = await pw[browserName].launch(browserName === 'chromium' ? { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] } : { headless: true })
report.browserVersion = await browser.version()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
let caseId, inProcessing = false
page.on('pageerror', error => report.diagnostics.push({ caseId, type: 'exception', error: String(error) }))
page.on('console', msg => { if (msg.type() === 'error') report.diagnostics.push({ caseId, type: 'console', error: msg.text() }) })
page.on('requestfailed', request => report.diagnostics.push({ caseId, inProcessing, type: 'requestfailed', url: request.url(), error: request.failure()?.errorText }))
await page.route('**/*', async route => {
  if (!['GET', 'HEAD'].includes(route.request().method())) {
    report.diagnostics.push({ caseId, type: 'unexpected-write', url: route.request().url(), method: route.request().method() })
    await route.abort(); return
  }
  await route.continue()
})
const save = () => writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
try {
  for (const fixture of fixtures) {
    const plans = process.env.TARGET_PLAN === 'smoke' ? [{ name: '20KB', bytes: 20000 }, { name: 'above-original', bytes: fixture.bytes + 1000 }, { name: '1B', bytes: 1 }] : [
      { name: '75percent', bytes: Math.floor(fixture.bytes * .75) },
      { name: '50percent', bytes: Math.floor(fixture.bytes * .5) },
      { name: '25percent', bytes: Math.floor(fixture.bytes * .25) },
      { name: '50KB', bytes: 50000 }, { name: '1MB', bytes: 1000000 },
      { name: 'above-original', bytes: fixture.bytes + 1000 }, { name: '1B', bytes: 1 },
    ]
    for (const plan of plans) {
      caseId = `${fixture.id}-${plan.name}`
      const route = routeOverride || (fixture.format === 'PNG' ? '/png-compressor' : fixture.format === 'WEBP' ? '/webp-compressor' : fixture.id === 'text-high-quality' ? '/jpeg-compressor' : '/jpg-compressor')
      const item = { id: caseId, route, fixture: fixture.id, inputFile: fixture.file, inputBytes: fixture.bytes, inputSha256: fixture.sha256, inputFormat: fixture.format, expectedDisplayDimensions: fixture.displayDimensions, targetName: plan.name, targetBytes: plan.bytes }
      try {
        await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
        readVerifiedImageFixture(fixtureRoot, fixture)
        await page.locator('input[type=file]').setInputFiles(path.join(fixtureRoot, 'inputs', fixture.file))
        await page.waitForFunction(() => document.querySelectorAll('.status-validating').length === 0, null, { timeout: 30000 })
        await page.locator('.compressBtn:enabled').waitFor({ timeout: 30000 })
        await page.getByRole('button', { name: 'Settings', exact: true }).click()
        await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Target size', exact: true }).click()
        await page.getByLabel('Custom maximum (KB)', { exact: true }).fill(String(plan.bytes / 1000))
        item.exactTargetText = await page.locator('.exactTarget').innerText()
        assert.ok(item.exactTargetText.includes(plan.bytes.toLocaleString('en-US')), 'Entered bytes must match the exact displayed limit')
        await page.getByRole('button', { name: 'Done', exact: true }).click()
        await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor({ state: 'hidden' })
        const started = performance.now(); inProcessing = true
        await page.locator('.compressBtn:enabled').click()
        await page.locator('.file.status-completed,.file.status-failed').first().waitFor({ timeout: 180000 })
        item.processingMs = Math.round(performance.now() - started); inProcessing = false
        if (await page.locator('.file.status-failed').count()) {
          item.status = 'UNREACHABLE_IN_TESTED_CONSTRAINTS'
          item.message = await page.locator('.fileError').innerText()
          assert.match(item.message, /Target not met/)
          assert.equal(await page.locator('.status-completed').count(), 0)
          assert.equal(await page.getByRole('button', { name: 'Download file', exact: true }).count(), 0)
          assert.equal(await page.locator('.filePendingFacts').count(), 1)
          item.outputBytes = null; item.noAboveLimitResult = true
          if (plan.bytes === 1) assert.ok(fixture.bytes > plan.bytes)
        } else {
          item.status = 'MET'
          assert.equal(await page.locator('.fileError').count(), 0)
          // Exact bytes live in the user's native Details disclosure. Open it
          // before asserting visible text, rather than reading hidden content.
          const details = page.locator('.file.status-completed .fileCardDetails')
          if (await details.count() && !await details.evaluate(element => element.open)) await details.locator('summary').first().click()
          await page.locator('.fileTarget').waitFor({ state: 'visible' })
          item.resultText = await page.locator('.fileTarget').innerText()
          assert.match(item.resultText, /Within your limit/)
          const pending = page.waitForEvent('download')
          await page.getByRole('button', { name: 'Download file', exact: true }).click()
          const download = await pending
          item.outputFile = path.join('downloads', `${caseId}-${download.suggestedFilename()}`)
          await download.saveAs(path.join(output, item.outputFile))
          const bytes = readFileSync(path.join(output, item.outputFile))
          item.outputBytes = bytes.length; item.outputSha256 = sha(bytes)
          assert.ok(bytes.length > 0 && bytes.length <= plan.bytes, 'An actual downloaded file must satisfy the exact target')
          assert.ok(item.resultText.includes(bytes.length.toLocaleString('en-US')), 'Result bytes displayed must equal the downloaded bytes')
          item.independent = JSON.parse(execFileSync(python, ['scripts/target-size-validate.py', path.join(fixtureRoot, 'inputs', fixture.file), path.join(output, item.outputFile)], { encoding: 'utf8', timeout: 60000 }))
          assert.equal(item.independent.format, fixture.format)
          assert.deepEqual(item.independent.dimensions, fixture.displayDimensions)
          assert.equal(item.independent.alphaExact, true)
          assert.equal(item.independent.bitDepthPreserved, true)
          if (plan.name === 'above-original') assert.equal(item.outputSha256, fixture.sha256, 'An already-fitting original must remain byte exact')
        }
        readVerifiedImageFixture(fixtureRoot, fixture)
        item.pass = true
        if (plan.name === '50KB' || plan.name === '1B') {
          item.screenshot = path.join('screenshots', `${caseId}.png`)
          await page.screenshot({ path: path.join(output, item.screenshot) })
        }
        await page.waitForLoadState('networkidle')
      } catch (error) {
        inProcessing = false; item.pass = false; item.error = String(error.stack || error)
        await page.screenshot({ path: path.join(output, 'screenshots', `${caseId}-failure.png`) }).catch(() => {})
      }
      report.cases.push(item); save()
      console.log(`${item.pass ? 'PASS' : 'FAIL'} ${caseId} ${item.status || ''} ${item.targetBytes} → ${item.outputBytes ?? '-'}B ${item.processingMs || '-'}ms`)
    }
  }
  report.identityAfter = await identity()
} finally {
  await context.close(); await browser.close()
  report.finishedAt = new Date().toISOString()
  report.normalBrowserClose = true
  report.passed = report.cases.every(c => c.pass) && report.diagnostics.length === 0 && Boolean(report.identityAfter)
  report.summary = { total: report.cases.length, passed: report.cases.filter(c => c.pass).length, met: report.cases.filter(c => c.status === 'MET').length, unreachable: report.cases.filter(c => c.status === 'UNREACHABLE_IN_TESTED_CONSTRAINTS').length, aboveTargetSuccesses: report.cases.filter(c => c.status === 'MET' && c.outputBytes > c.targetBytes).length }
  save()
}
if (!report.passed) process.exitCode = 1
