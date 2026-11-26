/** Visible file-chooser, touch/keyboard primary actions and genuine downloads. */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const browsers = qa('playwright-core')
const ffmpeg = process.env.FFMPEG_PATH || qa('ffmpeg-static')
const ffprobe = process.env.FFPROBE_PATH || qa('ffprobe-static').path
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const output = process.env.QA_OUTPUT || '.qa-results/activation'
mkdirSync(output, { recursive: true })
const fixtures = mkdtempSync(path.join(tmpdir(), 'filecompresser-activation-'))
const fixture = path.join(fixtures, 'sample.jpg')
execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=1', '-frames:v', '1', fixture], { timeout: 30_000 })
const sourceName = `source-${'verylongfilename'.repeat(10)}.jpg`
const fingerprint = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const indexSha256 = await fingerprint()
const results = []
for (const [name, mode] of [['chromium', 'touch'], ['chromium', 'keyboard'], ['firefox', 'keyboard'], ['webkit', 'touch'], ['webkit', 'keyboard']]) {
  const record = { browser: name, mode, viewportWidth: 390, viewportHeight: 844, sourceName, pass: false }
  let browser
  try {
    const options = name === 'chromium'
      ? { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] }
      : name === 'webkit' ? { ...(process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {}), env: { ...process.env, ...(process.env.WEBKIT_LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.WEBKIT_LD_LIBRARY_PATH } : {}) } } : {}
    browser = await browsers[name].launch(options)
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: mode === 'touch', acceptDownloads: true })
    context.setDefaultTimeout(30_000)
    const page = await context.newPage()
    const errors = []
    const uploads = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) uploads.push(request.url()) })
    await page.goto(`${base}/jpg-compressor`, { waitUntil: 'networkidle' })
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 15_000 })
    if (mode === 'touch') await page.locator('.dropzone').tap()
    else await page.locator('.dropzone').press('Enter')
    await (await chooserPromise).setFiles({ name: sourceName, mimeType: 'image/jpeg', buffer: readFileSync(fixture) })
    record.realFileChooserOpened = true
    await page.locator('.compressBtn:enabled').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.ok((await page.locator('.file').first().textContent()).includes(sourceName))
    await page.screenshot({ path: path.join(output, `${name}-${mode}-ready.png`), timeout: 10_000 })
    if (mode === 'touch') await page.locator('.compressBtn').tap()
    else await page.locator('.compressBtn').press('Enter')
    await page.locator('.file.status-completed').waitFor({ timeout: 180_000 })
    assert.equal(await page.locator('.fileError').count(), 0)
    await page.screenshot({ path: path.join(output, `${name}-${mode}-completed.png`), timeout: 10_000 })
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 })
    const button = page.getByRole('button', { name: 'Download file', exact: true })
    if (mode === 'touch') await button.tap()
    else await button.press('Enter')
    const download = await downloadPromise
    const file = path.join(output, `${name}-${mode}-${download.suggestedFilename()}`)
    await download.saveAs(file)
    const metadata = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', file], { timeout: 30_000 }))
    assert.equal(metadata.streams[0].codec_name, 'mjpeg')
    assert.equal(metadata.streams[0].width, 640)
    assert.equal(metadata.streams[0].height, 480)
    execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { timeout: 30_000 })
    assert.deepEqual(errors, [])
    assert.deepEqual(uploads, [])
    Object.assign(record, { pass: true, output: file, outputBytes: readFileSync(file).length, outputWidth: 640, outputHeight: 480, engineVersion: browser.version(), errors, uploads })
    console.log('PASS', name, mode, 'visible chooser, long filename, primary action and decoded download')
  } catch (error) {
    record.error = String(error)
    console.log('FAIL', name, mode, record.error)
  } finally {
    if (browser) await browser.close()
    results.push(record)
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ capturedAt: new Date().toISOString(), indexSha256, fixture, note: 'Emulated390px touch or genuine keyboard activation. Native file chooser is opened through the visible upload control. No physical-device or screen-reader claim.', results }, null, 2))
  }
}
assert.equal(await fingerprint(), indexSha256)
if (results.some(result => !result.pass)) process.exitCode = 1
