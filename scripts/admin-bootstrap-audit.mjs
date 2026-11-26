/** Fresh-profile exported admin asset bootstrap, separate from CMS API/auth verification. */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const output = process.env.QA_OUTPUT || '.qa-results/admin-bootstrap'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const assets = []
const resourceFailures = []
const apiFailures = []
const errors = []
page.on('response', response => {
  const type = response.request().resourceType()
  if (['script', 'stylesheet'].includes(type)) assets.push({ url: response.url(), status: response.status(), type, contentType: response.headers()['content-type'] || '' })
  else if (response.status() >= 400 && ['fetch', 'xhr'].includes(type)) apiFailures.push({ url: response.url(), status: response.status() })
})
page.on('requestfailed', request => {
  const item = { url: request.url(), error: request.failure()?.errorText, type: request.resourceType() }
  if (['script', 'stylesheet'].includes(item.type)) resourceFailures.push(item)
  else if (['fetch', 'xhr'].includes(item.type)) apiFailures.push(item)
})
page.on('pageerror', error => errors.push(error.message))
let result
try {
  const response = await page.goto(`${base}/admin/index.html`, { waitUntil: 'networkidle' })
  assert.equal(response.status(), 200)
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0 || /(?:failed.*load|load.*failed).*TinaCMS assets|TinaCMS assets.*failed/i.test(document.body.innerText), { timeout: 30_000 })
  const text = await page.locator('body').innerText()
  assert.doesNotMatch(text, /(?:failed.*load|load.*failed).*TinaCMS assets|TinaCMS assets.*failed/i, 'The exported admin must not show the generic asset-loader fallback')
  assert.ok(assets.some(asset => asset.type === 'script'), 'At least one compiled admin script must load')
  assert.ok(assets.some(asset => asset.type === 'stylesheet'), 'The compiled admin stylesheet must load')
  for (const asset of assets.filter(asset => new URL(asset.url).origin === new URL(base).origin)) {
    assert.equal(asset.status, 200, `Admin asset failed: ${asset.url}`)
    assert.match(asset.contentType, asset.type === 'script' ? /(?:text|application)\/javascript/ : /text\/css/, `Wrong MIME for ${asset.url}`)
    assert.doesNotMatch(asset.url, /\/@vite\/|localhost:4013|127\.0\.0\.1:4013/)
  }
  assert.deepEqual(resourceFailures, [])
  const unexpected = errors.filter(error => !/fetch|network|graphql|localhost:4001/i.test(error))
  assert.deepEqual(unexpected, [])
  result = { pass: true, base, assets, resourceFailures, apiFailures, errors, visibleText: text.slice(0, 2000), limitation: 'Asset bootstrap only. The local GraphQL service is intentionally off; this does not establish connected TinaCloud authentication, content editing, or production publishing.' }
  console.log(`PASS — admin bootstrap: ${assets.length} script/style responses, no asset-loader fallback. API/auth verification is separate.`)
} catch (error) {
  result = { pass: false, base, error: error.stack || String(error), assets, resourceFailures, apiFailures, errors }
  console.error('FAIL — admin bootstrap:', result.error)
  process.exitCode = 1
} finally {
  await page.screenshot({ path: path.join(output, 'admin-bootstrap.png') }).catch(() => {})
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ capturedAt: new Date().toISOString(), ...result }, null, 2) + '\n')
  await browser.close()
}
