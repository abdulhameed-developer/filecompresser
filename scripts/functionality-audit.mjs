/** Real local inputs, downloaded outputs, independent decoders, and queue edge cases.
 * QA dependencies live in PW_TOOLS; no fixtures are copied to public/.
 */
import { createRequire } from 'node:module'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  truncateSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
import { unzipSync, zipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
const qa = createRequire(
  path.join(
    process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'),
    'qa.cjs',
  ),
)
const browsers = qa('playwright-core')
const browserName = process.env.TEST_BROWSER || 'chromium'
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('Unsupported TEST_BROWSER')
const ffmpeg = process.env.FFMPEG_PATH || qa('ffmpeg-static')
const ffprobe = process.env.FFPROBE_PATH || qa('ffprobe-static').path
const chrome =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const base = process.argv[2] || 'http://127.0.0.1:3198'
const fixtures = mkdtempSync(path.join(tmpdir(), 'filecompresser-fixtures-'))
const evidence = path.resolve(process.env.QA_OUTPUT || '.qa-results')
mkdirSync(evidence, { recursive: true })
const media = (args, name) => {
  const out = path.join(fixtures, name)
  execFileSync(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-y', ...args, out],
    { timeout: 60000 },
  )
  return out
}
const png = media(
  ['-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=1', '-frames:v', '1'],
  'image.png',
)
const jpg = media(['-i', png, '-frames:v', '1'], 'image.jpg')
const webp = media(['-i', png, '-frames:v', '1'], 'image.webp')
const gif = media(
  ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=8', '-t', '1', '-loop', '2'],
  'animation.gif',
)
const wav = media(
  ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050', '-t', '2'],
  'tone.wav',
)
const mp3 = media(['-i', wav, '-b:a', '192k'], 'tone.mp3')
const lowRateWav = new Map([8000, 16000, 22050].map(rate => [rate, media(['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=${rate}`, '-ac', '2', '-t', '1'], `tone-${rate}.wav`)]))
const otherAudio = ['m4a', 'flac', 'ogg'].map((ext) =>
  media(['-i', wav], `tone.${ext}`),
)
// Explicit source codecs guard the native decoders when unused external codec
// libraries are removed. These are already accepted by the audio-family check.
const opusAudio = media(
  ['-i', wav, '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-f', 'ogg'],
  'tone-opus.ogg',
)
const alacAudio = media(
  ['-i', wav, '-c:a', 'alac', '-sample_fmt', 's32p', '-ar', '44100', '-ac', '2'],
  'tone-alac.m4a',
)
const transparent = media(
  [
    '-f',
    'lavfi',
    '-i',
    'color=c=red@0.0:s=64x64,format=rgba',
    '-frames:v',
    '1',
  ],
  'alpha.png',
)
const video = media(
  [
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440',
    '-t',
    '1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
  ],
  'video.mp4',
)
const mov = media(['-i', video, '-c', 'copy'], 'video.mov')
const hevcVideo = media(
  [
    '-i', video, '-vf', 'scale=320:240', '-c:v', 'libx265',
    '-preset', 'ultrafast', '-x265-params', 'pools=none:frame-threads=1',
    '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-c:a', 'aac', '-threads', '1',
  ],
  'video-hevc.mp4',
)
const proresVideo = media(
  [
    '-i', video, '-vf', 'scale=320:240', '-c:v', 'prores_ks', '-profile:v', '0',
    '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-threads', '1',
  ],
  'video-prores.mov',
)
const vp9Video = media(
  [
    '-i', video, '-vf', 'scale=320:240', '-c:v', 'libvpx-vp9',
    '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-threads', '1',
  ],
  'video-vp9.mp4',
)
const webmVideo = media(
  ['-i', video, '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-threads', '1'],
  'video.webm',
)
const longVideo = media(
  [
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=24',
    '-t',
    '5',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
  ],
  'cancel.mp4',
)
const pdf = await PDFDocument.create()
pdf.setTitle('QA document')
pdf.addPage([300, 400]).drawText('FileCompresser verification')
const pdfPath = path.join(fixtures, 'sample.pdf')
writeFileSync(pdfPath, await pdf.save())
const misnamedPdf = path.join(fixtures, 'misnamed.jpg')
writeFileSync(misnamedPdf, readFileSync(pdfPath))
const misnamedGif = path.join(fixtures, 'animation.bin')
writeFileSync(misnamedGif, readFileSync(gif))
const zipPath = path.join(fixtures, 'normal.zip')
writeFileSync(
  zipPath,
  zipSync({
    'one.txt': new TextEncoder().encode('first'),
    'folder/two.txt': new TextEncoder().encode('second'),
  }),
)
const hostile = path.join(fixtures, 'hostile.zip')
writeFileSync(hostile, zipSync({ '../unsafe.txt': new Uint8Array([1]) }))
const fake = path.join(fixtures, 'fake.mp3')
writeFileSync(fake, new Uint8Array([0xff]))
const oversized = path.join(fixtures, 'oversized.jpg')
// The all-zero file remains51MiB through the File API; sparse allocation avoids
// accumulating repeated physical zero buffers in the host's memory-backed /tmp.
writeFileSync(oversized, new Uint8Array())
truncateSync(oversized, 51 * 1024 * 1024)
const browser = await browsers[browserName].launch(browserName === 'chromium' ? {
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
} : { headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) })
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1280, height: 900 },
})
context.setDefaultTimeout(30_000)
if (process.env.QA_ACTION_TRACE) await context.addInitScript(traceScroll => {
  globalThis.__actionEvents = []
  const record = (type, event = {}, extra = {}) => {
    const button = document.querySelector('.compressBtn')
    if (!button) return
    const box = button.getBoundingClientRect()
    globalThis.__actionEvents.push({ type, at: performance.now(), target: event.target?.tagName, targetClass: event.target?.className, targetText: event.target?.textContent?.trim().slice(0, 80), x: event.clientX, y: event.clientY, defaultPrevented: event.defaultPrevented, scrollY, button: { text: button.textContent, disabled: button.disabled, x: box.x, y: box.y, width: box.width, height: box.height }, dialogOpen: Boolean(document.querySelector('.settingsDialog[open]')), cards: [...document.querySelectorAll('.file')].map(card => card.className), ...extra })
  }
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'submit', 'focusin']) {
    document.addEventListener(type, event => record(`${type}-capture`, event), { capture: true, passive: true })
    document.addEventListener(type, event => record(`${type}-bubble`, event), { passive: true })
  }
  if (traceScroll) {
    addEventListener('scroll', event => record('scroll', event), { passive: true })
    const scrollTo = window.scrollTo
    window.scrollTo = function (...args) { record('window.scrollTo-before', {}, { args, stack: new Error().stack }); const value = scrollTo.apply(this, args); record('window.scrollTo-after'); return value }
    const scrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...args) { record('Element.scrollIntoView-before', {}, { args, element: this.className, stack: new Error().stack }); const value = scrollIntoView.apply(this, args); record('Element.scrollIntoView-after'); return value }
  }
}, process.env.QA_ACTION_TRACE === 'scroll')
const page = await context.newPage()
const browserLifecycle = []
let currentCase = ''
let currentStep = ''
let closingBrowser = false
browser.on('disconnected', () => {
  if (!closingBrowser) browserLifecycle.push({ event: 'unexpected-disconnect', capturedAt: new Date().toISOString(), currentCase })
})
page.on('crash', () => browserLifecycle.push({ event: 'page-crash', capturedAt: new Date().toISOString(), currentCase }))
page.on('close', () => { if (!closingBrowser) browserLifecycle.push({ event: 'unexpected-page-close', capturedAt: new Date().toISOString(), currentCase }) })
const errors = []
const consoleMessages = []
const failedResources = []
const pendingRequests = new Map()
page.on('request', request => pendingRequests.set(request, { url: request.url(), type: request.resourceType(), method: request.method(), startedAt: new Date().toISOString() }))
page.on('requestfinished', request => pendingRequests.delete(request))
page.on('requestfailed', request => pendingRequests.delete(request))
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() }) })
page.on('response', response => { if (response.status() >= 400) failedResources.push({ status: response.status(), url: response.url() }) })
page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedResources.push({ error: request.failure()?.errorText, url: request.url() }) })
const requests = []
page.on('request', (request) => {
  if (['POST', 'PUT', 'PATCH'].includes(request.method()))
    requests.push(request.url())
})
const results = []
let caseOrdinal = 0
const caseRange = process.env.QA_CASE_RANGE?.split('-').map(Number)
if (caseRange && (caseRange.length !== 2 || caseRange.some(value => !Number.isInteger(value) || value < 1) || caseRange[0] > caseRange[1])) throw Error('QA_CASE_RANGE must be a positive inclusive range, for example51-74')
const timings = []
const comparisonDiagnostics = []
const writeProgress = () => writeFileSync(path.join(evidence, 'functionality-progress.json'), JSON.stringify({ capturedAt: new Date().toISOString(), caseFilter: process.env.QA_CASE_FILTER || null, caseRange: process.env.QA_CASE_RANGE || null, currentCase, completed: results.length, passed: results.filter(result => result.pass).length, results, browserLifecycle, errors, consoleMessages, failedResources, requests }, null, 2) + '\n')
const bounded = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error(`${label} did not respond within ${ms}ms`)), ms)
  promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
})
const readUiState = () => bounded(page.evaluate(() => ({ scrollY, readyState: document.readyState, text: document.querySelector('.workflowForm')?.textContent, dialogs: [...document.querySelectorAll('dialog')].map(dialog => ({ open: dialog.open, text: dialog.textContent?.slice(0, 100) })), cards: [...document.querySelectorAll('.file')].map(card => ({ className: card.className, text: card.textContent?.slice(0, 400) })), buttons: [...document.querySelectorAll('.workflowForm button')].filter(button => button.getClientRects().length).map(button => ({ text: button.textContent, disabled: button.disabled })), events: globalThis.__actionEvents || [] })), 5000, 'Read-only UI diagnostic')
let observing = false
const telemetry = setInterval(async () => {
  if (observing || page.isClosed()) return
  observing = true
  const state = await readUiState().catch(error => ({ diagnosticError: String(error) }))
  writeFileSync(path.join(evidence, 'live-state.json'), JSON.stringify({ capturedAt: new Date().toISOString(), currentCase, currentStep, url: page.url(), workers: page.workers().map(worker => worker.url()), pendingRequests: [...pendingRequests.values()], ...state }, null, 2))
  observing = false
}, 5000)
async function check(name, work) {
  caseOrdinal++
  if (caseRange && (caseOrdinal < caseRange[0] || caseOrdinal > caseRange[1])) return
  if (process.env.QA_CASE_FILTER && !new RegExp(process.env.QA_CASE_FILTER).test(name)) return
  currentCase = name
  writeProgress()
  if (!browser.isConnected() || page.isClosed()) {
    results.push({ ordinal: caseOrdinal, name, pass: false, status: 'not-run-browser-exit', error: 'The browser exited before this case. This is not an executed product check.' })
    console.error('BLOCKED', name, 'browser already exited')
    writeProgress()
    return
  }
  try {
    const detail = await work()
    results.push({ ordinal: caseOrdinal, name, pass: true, detail })
    console.log('PASS', name, detail || '')
  } catch (error) {
    results.push({ ordinal: caseOrdinal, name, pass: false, status: browser.isConnected() && !page.isClosed() ? 'failed' : 'browser-exited-during-case', error: error.stack || String(error) })
    console.error('FAIL', name, String(error))
    writeProgress()
    if (!page.isClosed()) await readUiState().then(state => writeFileSync(path.join(evidence, `failure-${results.length}-state.json`), JSON.stringify({ ...state, workers: page.workers().map(worker => worker.url()), pendingRequests: [...pendingRequests.values()] }, null, 2))).catch(() => {})
    await page
      .screenshot({
        path: path.join(evidence, `failure-${results.length}.png`),
        timeout: 10_000,
      })
      .catch(() => {})
  } finally {
    if (process.env.QA_ACTION_TRACE && !page.isClosed()) await readUiState().then(state => writeFileSync(path.join(evidence, `case-${results.length}-action-state.json`), JSON.stringify(state, null, 2))).catch(() => {})
    writeProgress()
  }
}
async function upload(route, files) {
  currentStep = 'navigate'
  await page.goto(base + route, { waitUntil: 'networkidle' })
  currentStep = 'select-files'
  await page.locator('input[type=file]').setInputFiles(files)
  currentStep = 'await-file-validation'
  await page.waitForFunction(
    () => document.querySelectorAll('.status-validating').length === 0,
    null,
    { timeout: 30_000 },
  )
}
async function processAndDownload(route, source, configure) {
  await upload(route, source)
  if (configure) {
    currentStep = 'open-settings'
    await openSettings()
    currentStep = 'configure-settings'
    await configure()
    currentStep = 'close-settings'
    await closeSettings()
  }
  currentStep = 'ready-screenshot'
  await page.screenshot({ path: path.join(evidence, `${route.slice(1)}-ready.png`) })
  const startedAt = performance.now()
  currentStep = 'primary-click'
  await page.locator('.compressBtn').click()
  currentStep = 'await-start'
  await page.locator('.file.status-validating, .file.status-processing, .file.status-completed, .file.status-failed').first().waitFor({ timeout: 15_000 })
  currentStep = 'await-processing-complete'
  await page
    .locator('.file.status-completed, .file.status-failed')
    .first()
    .waitFor({ timeout: 180000 })
  const failure = await page.locator('.fileError').allTextContents()
  assert.deepEqual(failure, [])
  const processingMs = Math.round(performance.now() - startedAt)
  currentStep = 'completed-screenshot'
  await page.screenshot({ path: path.join(evidence, `${route.slice(1)}-completed.png`) })
  assert.equal(await page.locator('.compressBtn').count(), 0, 'Completed-only queues must not offer processing zero files')
  const promise = page.waitForEvent('download')
  currentStep = 'download-click'
  await page.getByRole('button', { name: 'Download file', exact: true }).click()
  currentStep = 'await-download'
  const download = await promise
  const out = path.join(
    fixtures,
    `result-${results.length}-${download.suggestedFilename()}`,
  )
  await download.saveAs(out)
  assert(readFileSync(out).length > 0)
  const inputBytes = (Array.isArray(source) ? source : [source]).reduce((total, file) => total + readFileSync(file).length, 0)
  timings.push({ route, inputBytes, outputBytes: readFileSync(out).length, processingMs, output: out })
  return out
}
async function openSettings() {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
}
async function closeSettings() {
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor({ state: 'hidden' })
}
function probe(file) {
  return JSON.parse(
    execFileSync(
      ffprobe,
      [
        '-v',
        'error',
        '-count_frames',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        file,
      ],
      { timeout: 30000 },
    ).toString(),
  )
}
function decode(file) {
  execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], {
    timeout: 60000,
  })
}
function assertImageGeometry(input, output) {
  const before = probe(input).streams[0]
  const after = probe(output).streams[0]
  assert.equal(after.width, before.width)
  assert.equal(after.height, before.height)
  return { width: after.width, height: after.height, codec: after.codec_name }
}
function pixels(file) {
  return execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 })
}
function assertDurationPreserved(input, output) {
  const before = Number(input.format.duration)
  const after = Number(output.format.duration)
  assert(Number.isFinite(before) && before > 0, 'The source fixture must have a real duration')
  assert(Number.isFinite(after) && after > 0, 'The encoded output must have a real duration')
  assert(Math.abs(after - before) < 0.25, `Unexpected duration change: ${before}s to ${after}s`)
}
function assertAudibleOutput(file) {
  const pcm = execFileSync(
    ffmpeg,
    ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 's16le', '-'],
    { timeout: 60000, maxBuffer: 5 * 1024 * 1024 },
  )
  assert(pcm.length > 16000, 'Decoded audio is unexpectedly short')
  let absoluteTotal = 0
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) absoluteTotal += Math.abs(pcm.readInt16LE(offset))
  assert(absoluteTotal / (pcm.length / 2) > 100, 'The sine-wave fixture became silence')
}
try {
  for (const [route, input, codec] of [
    ['/jpg-compressor', jpg, 'mjpeg'],
    ['/jpeg-compressor', jpg, 'mjpeg'],
    ['/image-compressor', jpg, 'mjpeg'],
    ['/png-compressor', png, 'png'],
    ['/webp-compressor', webp, 'webp'],
  ])
    await check(route + ' decoded output', async () => {
      const out = await processAndDownload(route, input)
      assert.equal(probe(out).streams[0].codec_name, codec)
      assertImageGeometry(input, out)
      decode(out)
      return path.basename(out)
    })
  await check('Image comparison zoom, mobile bounds, background scroll and keyboard recovery', async () => {
    await processAndDownload('/jpg-compressor', jpg)
    const trigger = page.locator('.compareButton')
    for (const width of [390, 1280]) {
      const samples = []
      comparisonDiagnostics.push({ width, samples })
      const sample = async label => samples.push({ label, ...await page.evaluate(() => ({ y: window.scrollY, maxY: document.documentElement.scrollHeight - innerHeight, rootOverflow: getComputedStyle(document.documentElement).overflow, bodyOverflow: getComputedStyle(document.body).overflow, rootInline: document.documentElement.style.overflow, bodyInline: document.body.style.overflow, rootWidth: document.documentElement.clientWidth, scroller: document.scrollingElement?.tagName, active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName })) })
      const settle = async () => page.evaluate(() => new Promise(resolve => {
        let previous = -1
        let stable = 0
        const positions = []
        const tick = () => {
          const y = window.scrollY
          positions.push(y)
          stable = y === previous ? stable + 1 : 0
          previous = y
          if (stable >= 4 || positions.length >= 120) resolve(positions)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }))
      await page.setViewportSize({ width, height: 900 })
      await trigger.scrollIntoViewIfNeeded()
      samples.push({ label: 'settle-before-click', positions: await settle() })
      await sample('before-open')
      const lockedScrollY = await page.evaluate(() => window.scrollY)
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Inspect the actual image', exact: true })
      await dialog.waitFor()
      await sample('after-open')
      assert.equal(await page.evaluate(() => window.scrollY), lockedScrollY, 'Opening comparison must preserve the settled pre-click viewport')
      await dialog.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
      await sample('after-images-decoded')
      assert.equal(await page.evaluate(() => window.scrollY), lockedScrollY, 'The background must remain still after comparison becomes visible')
      const box = await dialog.boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900)
      for (const zoom of ['fit', '1', '2', '4']) {
        await page.getByLabel('View at', { exact: true }).selectOption(zoom)
        if (zoom !== 'fit') assert.equal(await dialog.locator('img').first().evaluate(image => image.getBoundingClientRect().width), 640 * Number(zoom))
        await sample(`zoom-${zoom}`)
        assert.equal(await page.evaluate(() => window.scrollY), lockedScrollY, 'Comparison zoom must not move the background page')
      }
      await page.getByLabel('View at', { exact: true }).selectOption('fit')
      await page.screenshot({ path: path.join(evidence, `image-comparison-${width}.png`) })
      await sample('after-screenshot')
      samples.push({ label: 'settle-before-wheel', positions: await settle() })
      const before = await page.evaluate(() => window.scrollY)
      await page.mouse.move(2, 2)
      await page.mouse.wheel(0, 600)
      await page.waitForTimeout(150)
      await sample('after-wheel')
      samples.push({ label: 'settle-after-wheel', positions: await settle() })
      assert.equal(await page.evaluate(() => window.scrollY), before, 'The background must remain still while image comparison is open')
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true)
      assert.equal(await page.evaluate(() => window.scrollY), lockedScrollY, 'Closing comparison must restore the same viewport')
    }
  })
  await check('Enter in settings does not start processing; Done then the primary action succeeds', async () => {
    await upload('/jpg-compressor', jpg)
    await openSettings()
    await page.getByRole('button', { name: 'Target size', exact: true }).click()
    await page.getByLabel('Custom maximum (KB)', { exact: true }).fill('50')
    await page.getByLabel('Custom maximum (KB)', { exact: true }).press('Enter')
    await page.waitForTimeout(100)
    assert.equal(await page.locator('.file.status-queued').count(), 1)
    assert.equal(await page.locator('.file.status-processing,.file.status-completed,.file.status-failed').count(), 0)
    assert.equal(await page.locator('.settingsDialog').evaluate(element => element.open), true)
    await closeSettings()
    await page.locator('.compressBtn:enabled').click()
    await page.locator('.status-completed').waitFor({ timeout: 180_000 })
    assert.equal(await page.locator('.fileError').count(), 0)
    const promise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download file', exact: true }).click()
    const download = await promise
    const file = await download.path()
    assertImageGeometry(jpg, file)
    decode(file)
    return { enterKeptQueued: true, explicitPrimaryCompleted: true }
  })
  for (const [route, input, codec] of [['/jpg-compressor', jpg, 'mjpeg'], ['/webp-compressor', webp, 'webp']]) {
    const sizes = {}
    for (const mode of ['Balanced', 'High quality', 'Maximum']) await check(`${route} real ${mode} preset`, async () => {
      const out = await processAndDownload(route, input, () => page.getByRole('button', { name: mode, exact: true }).click())
      assert.equal(probe(out).streams[0].codec_name, codec)
      const geometry = assertImageGeometry(input, out)
      decode(out)
      sizes[mode] = readFileSync(out).length
      return { ...geometry, bytes: sizes[mode] }
    })
    await check(`${route} Maximum produces no larger result than High quality`, async () => {
      assert.ok(sizes.Maximum <= sizes['High quality'])
      return sizes
    })
  }
  for (const mode of ['Lossless', 'Smart', 'Maximum']) await check(`PNG real ${mode} preset`, async () => {
    const out = await processAndDownload('/png-compressor', png, () => page.getByRole('button', { name: mode, exact: true }).click())
    assert.equal(probe(out).streams[0].codec_name, 'png')
    const geometry = assertImageGeometry(png, out)
    decode(out)
    if (mode === 'Lossless') assert.deepEqual(pixels(out), pixels(png), 'Lossless PNG must preserve every decoded pixel')
    return { ...geometry, bytes: readFileSync(out).length, losslessPixelsVerified: mode === 'Lossless' }
  })
  const convertedWebpSizes = {}
  for (const mode of ['High quality', 'Maximum']) await check(`PNG to WEBP real ${mode} preset`, async () => {
    const out = await processAndDownload('/image-compressor', png, async () => {
      await page.getByLabel('Save as', { exact: true }).selectOption('webp')
      await page.getByRole('button', { name: mode, exact: true }).click()
    })
    assert.equal(probe(out).streams[0].codec_name, 'webp')
    assertImageGeometry(png, out)
    decode(out)
    convertedWebpSizes[mode] = readFileSync(out).length
    return { bytes: convertedWebpSizes[mode] }
  })
  await check('WEBP conversion quality changes the real output byte size', async () => {
    assert.ok(convertedWebpSizes.Maximum < convertedWebpSizes['High quality'])
    return convertedWebpSizes
  })
  for (const [route, input] of [['/png-compressor', png], ['/webp-compressor', webp]]) await check(`${route} genuine target output and truthful limit status`, async () => {
    const out = await processAndDownload(route, input, async () => {
      await page.getByRole('button', { name: 'Target size', exact: true }).click()
      await page.getByLabel('Custom maximum (KB)', { exact: true }).fill('5')
    })
    const bytes = readFileSync(out).length
    assertImageGeometry(input, out)
    decode(out)
    assert.match(await page.locator('.fileTarget').textContent(), bytes <= 5000 ? /Within your limit/ : /Target not met/)
    return { bytes, targetBytes: 5000, met: bytes <= 5000 }
  })
  const customSizes = {}
  for (const quality of [10, 100]) await check(`JPEG real custom quality ${quality}%`, async () => {
    const out = await processAndDownload('/jpg-compressor', jpg, async () => {
      await page.getByRole('button', { name: 'Balanced', exact: true }).click()
      await page.locator('input[type=range]').press(quality === 10 ? 'Home' : 'End')
      assert.equal(await page.locator('input[type=range]').inputValue(), String(quality))
    })
    assertImageGeometry(jpg, out)
    decode(out)
    customSizes[quality] = readFileSync(out).length
    return { quality, bytes: customSizes[quality] }
  })
  await check('JPEG custom quality changes the real output byte size', async () => {
    assert.ok(customSizes[10] < customSizes[100])
    return customSizes
  })
  await check('JPG target size and stable KB input', async () => {
    const out = await processAndDownload('/jpg-compressor', jpg, async () => {
      await page.getByRole('button', { name: 'Target size', exact: true }).click()
      await page.getByLabel('Custom maximum (KB)', { exact: true }).fill('20')
      assert.equal(
        await page.getByLabel('Custom maximum (KB)', { exact: true }).inputValue(),
        '20',
      )
    })
    assert(readFileSync(out).length <= 20_000)
    decode(out)
  })
  for (const [format, codec] of [
    ['jpeg', 'mjpeg'],
    ['png', 'png'],
    ['webp', 'webp'],
  ])
    await check('Image conversion to ' + format, async () => {
      const out = await processAndDownload(
        '/image-compressor',
        format === 'jpeg' ? png : jpg,
        async () => {
          await page
            .getByLabel('Save as', { exact: true })
            .selectOption(format)
        },
      )
      assert.equal(probe(out).streams[0].codec_name, codec)
      assertImageGeometry(format === 'jpeg' ? png : jpg, out)
      decode(out)
    })
  await check(
    'Transparent JPG conversion is refused without losing the input',
    async () => {
      const out = await processAndDownload('/image-compressor', transparent, async () => {
        // Unsupported opaque output must be unavailable before a destructive conversion.
        assert.equal(await page.getByLabel('Save as', { exact: true }).locator('option[value="jpeg"]').count(), 0)
        await page.getByLabel('Save as', { exact: true }).selectOption('webp')
      })
      assertImageGeometry(transparent, out)
      const rgba = pixels(out)
      for (let index = 3; index < rgba.length; index += 4) assert.equal(rgba[index], 0)
    },
  )
  await check('Unreachable image target is reported honestly', async () => {
    const out = await processAndDownload('/jpg-compressor', jpg, async () => {
      await page.getByRole('button', { name: 'Target size', exact: true }).click()
      await page.getByLabel('Custom maximum (KB)', { exact: true }).fill('1')
    })
    assert(readFileSync(out).length > 1000)
    assert.match(await page.locator('.fileTarget').textContent(), /Target not met/)
  })
  await check('PNG target controls are contextual and retain exact byte units', async () => {
    await upload('/png-compressor', png)
    await openSettings()
    await page.getByRole('button', { name: 'Maximum', exact: true }).click()
    assert.equal(
      await page.getByLabel('Custom maximum (KB)', { exact: true }).count(),
      0,
    )
    await page.getByRole('button', { name: 'Target size', exact: true }).click()
    await page.getByLabel('Custom maximum (KB)', { exact: true }).fill('20')
    assert.match(await page.locator('.exactTarget').innerText(), /20,000 bytes/)
    await closeSettings()
  })
  await check('GIF animation and finite loop preservation', async () => {
    const out = await processAndDownload('/gif-compressor', misnamedGif)
    assert(out.endsWith('.gif'))
    decode(out)
    assert(Number(probe(out).streams[0].nb_read_frames) > 1)
    const bytes = readFileSync(out),
      i = bytes.indexOf('NETSCAPE2.0')
    assert(i >= 0)
    assert.equal(bytes.readUInt16LE(i + 13), 2)
  })
  for (const [route, input] of [
    ['/wav-compressor', wav],
    ['/wav-to-mp3', wav],
    ['/mp3-compressor', mp3],
    ...otherAudio.map((input) => ['/mp3-compressor', input]),
  ])
    await check(
      route + ' ' + path.extname(input) + ' genuine audio source/output',
      async () => {
        const out = await processAndDownload(route, input)
        const metadata = probe(out)
        assert.equal(metadata.streams[0].codec_name, 'mp3')
        assert(Number(metadata.format.duration) > 1.5)
        decode(out)
      },
    )
  for (const [label, input, sourceCodec] of [
    ['Ogg Opus', opusAudio, 'opus'],
    ['ALAC in M4A', alacAudio, 'alac'],
  ])
    await check(label + ' input decoded to genuine audible MP3', async () => {
      const before = probe(input)
      const sourceAudio = before.streams.find(stream => stream.codec_type === 'audio')
      assert.equal(sourceAudio?.codec_name, sourceCodec, 'The fixture must exercise its stated decoder')
      const out = await processAndDownload('/mp3-compressor', input)
      const after = probe(out)
      const outputAudio = after.streams.find(stream => stream.codec_type === 'audio')
      assert.equal(outputAudio?.codec_name, 'mp3')
      assert.equal(outputAudio.channels, sourceAudio.channels)
      assert.equal(Number(outputAudio.sample_rate), Number(sourceAudio.sample_rate))
      assertDurationPreserved(before, after)
      decode(out)
      assertAudibleOutput(out)
      return { sourceCodec, outputCodec: outputAudio.codec_name, channels: outputAudio.channels, sampleRate: outputAudio.sample_rate }
    })
  for (const [inputRate, bitrate, outputRate] of [[8000, '96k', 16000], [16000, '320k', 32000], [22050, '320k', 32000]]) await check(`Low-sample-rate audio: ${inputRate} Hz at ${bitrate}`, async () => {
    const input = lowRateWav.get(inputRate)
    const out = await processAndDownload('/wav-compressor', input, () => page.getByLabel('MP3 bitrate', { exact: true }).selectOption(bitrate))
    const before = probe(input)
    const after = probe(out)
    const audio = after.streams.find(stream => stream.codec_type === 'audio')
    assert.equal(audio.codec_name, 'mp3')
    assert.equal(Number(audio.bit_rate), Number(bitrate.replace('k', '')) * 1000)
    assert.equal(Number(audio.sample_rate), outputRate)
    assert.equal(audio.channels, 2)
    assertDurationPreserved(before, after)
    decode(out)
    assertAudibleOutput(out)
    await page.locator('.fileCardDetails > summary').click()
    const notes = (await page.locator('.fileNote').allTextContents()).join(' ')
    assert.match(notes, new RegExp(`${bitrate.replace('k', '')} kbps`))
    assert.match(notes, /Resampling does not restore missing detail/)
    await page.screenshot({ path: path.join(evidence, `audio-${inputRate}-${bitrate}-verified.png`) })
    return { inputRate, requestedBitrate: bitrate, actualBitrate: Number(audio.bit_rate), outputRate: Number(audio.sample_rate), channels: audio.channels }
  })
  for (const [label, input, sourceVideoCodec, sourceAudioCodec] of [
    ['H264/AAC MP4', video, 'h264', 'aac'],
    ['H264/AAC MOV', mov, 'h264', 'aac'],
    ['HEVC/AAC MP4', hevcVideo, 'hevc', 'aac'],
    ['ProRes/PCM MOV', proresVideo, 'prores', 'pcm_s16le'],
    ['VP9/AAC MP4', vp9Video, 'vp9', 'aac'],
  ])
    await check(
      label + ' input produces decoded H264/AAC MP4',
      async () => {
        const before = probe(input)
        const sourceVideo = before.streams.find(stream => stream.codec_type === 'video')
        const sourceAudio = before.streams.find(stream => stream.codec_type === 'audio')
        assert.equal(sourceVideo?.codec_name, sourceVideoCodec, 'The fixture must exercise its stated video decoder')
        assert.equal(sourceAudio?.codec_name, sourceAudioCodec, 'The fixture must exercise its stated audio decoder')
        const out = await processAndDownload('/video-compressor', input)
        const meta = probe(out)
        const outputVideo = meta.streams.find(stream => stream.codec_type === 'video')
        const outputAudio = meta.streams.find(stream => stream.codec_type === 'audio')
        assert.equal(
          outputVideo?.codec_name,
          'h264',
        )
        assert.equal(
          outputAudio?.codec_name,
          'aac',
        )
        assert.equal(outputVideo.pix_fmt, 'yuv420p')
        assert.equal(outputVideo.width, Math.floor(sourceVideo.width / 2) * 2)
        assert.equal(outputVideo.height, Math.floor(sourceVideo.height / 2) * 2)
        assert(Number(outputVideo.nb_read_frames) >= Number(sourceVideo.nb_read_frames) - 1, 'Output lost source video frames')
        assert.equal(outputAudio.channels, sourceAudio.channels)
        assertDurationPreserved(before, meta)
        decode(out)
        assertAudibleOutput(out)
        return { sourceVideoCodec, sourceAudioCodec, outputCodecs: meta.streams.map(stream => stream.codec_name), width: outputVideo.width, height: outputVideo.height }
      },
    )
  await check('WebM converter downloads a valid H264/AAC MP4 with original duration and dimensions', async () => {
    const before = probe(webmVideo)
    const out = await processAndDownload('/webm-to-mp4', webmVideo)
    const after = probe(out)
    const inputVideo = before.streams.find(stream => stream.codec_type === 'video')
    const outputVideo = after.streams.find(stream => stream.codec_type === 'video')
    assert.equal(outputVideo.codec_name, 'h264')
    assert.equal(after.streams.find(stream => stream.codec_type === 'audio').codec_name, 'aac')
    assert.equal(outputVideo.width, inputVideo.width)
    assert.equal(outputVideo.height, inputVideo.height)
    assertDurationPreserved(before, after)
    decode(out)
    assertAudibleOutput(out)
    return { codecs: after.streams.map(stream => stream.codec_name), duration: after.format.duration }
  })
  await check('PDF readable content and page count', async () => {
    const out = await processAndDownload('/pdf-compressor', misnamedPdf)
    assert(out.endsWith('.pdf'))
    const output = await PDFDocument.load(readFileSync(out))
    assert.equal(output.getPageCount(), 1)
    assert.ok(!output.getTitle(), 'The optimized PDF must not retain the source title metadata')
    assert(
      execFileSync('pdftotext', [out, '-'])
        .toString()
        .includes('FileCompresser verification'),
    )
  })
  await check('ZIP batch round trip and full original total', async () => {
    const out = await processAndDownload('/zip-compressor', [jpg, pdfPath, fake])
    const entries = unzipSync(readFileSync(out))
    assert.deepEqual(Buffer.from(entries['image.jpg']), readFileSync(jpg))
    assert.deepEqual(Buffer.from(entries['sample.pdf']), readFileSync(pdfPath))
    assert.deepEqual(Buffer.from(entries['fake.mp3']), readFileSync(fake), 'Archive creation must preserve arbitrary file bytes without trying to decode them')
    assert((await page.locator('.workspaceScope').innerText()).includes('3 archive inputs'))
  })
  await check(
    'Extraction downloads every file without compression claims',
    async () => {
      await upload('/archive-compressor', zipPath)
      await page.locator('.compressBtn').click()
      await page.locator('.file.status-completed').first().waitFor()
      assert.equal(await page.locator('.file.status-completed').count(), 1)
      assert.equal(await page.locator('.savings').count(), 0)
      await page
        .getByRole('button', { name: 'Prepare ZIP (2 files)', exact: true })
        .click()
      const promise = page.waitForEvent('download')
      await page.getByRole('link', { name: 'Save ZIP (2 files)', exact: true }).click()
      const downloaded = await promise
      const bytes = readFileSync(await downloaded.path())
      const entries = unzipSync(bytes)
      assert.equal(new TextDecoder().decode(entries['one.txt']), 'first')
      assert.equal(
        new TextDecoder().decode(entries['folder__two.txt']),
        'second',
      )
      await page.locator('.fileCardDetails > summary').click()
      const individualPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download one.txt', exact: true }).click()
      const individual = await individualPromise
      assert.equal(readFileSync(await individual.path(), 'utf8'), 'first')
    },
  )
  await check('Unsafe archive is blocked', async () => {
    await upload('/archive-compressor', hostile)
    await page.locator('.compressBtn').click()
    await page.locator('.status-failed').waitFor()
    assert.match(await page.locator('.fileError').innerText(), /unsafe/)
    assert.equal(await page.locator('.downloadActions').count(), 0)
    await page.screenshot({ path: path.join(evidence, 'unsafe-archive-error.png') })
    await page.getByRole('button', { name: 'Clear all', exact: true }).click()
    await page.locator('input[type=file]').setInputFiles(zipPath)
    await page.locator('.compressBtn:enabled').waitFor()
    assert.equal(await page.locator('.workflowStatus.status-error').count(), 0, 'A valid replacement queue must not display the previous failed-run banner')
  })
  for (const input of [fake, oversized])
    await check('Invalid/oversized input ' + path.basename(input), async () => {
      await upload(
        input === fake ? '/mp3-compressor' : '/jpg-compressor',
        input,
      )
      await page.locator('.status-failed').waitFor()
      assert.equal(await page.locator('.compressBtn').count(), 0, 'Invalid-only queues must not offer processing')
      assert.equal(await page.locator('.downloadActions').count(), 0)
      await page.screenshot({ path: path.join(evidence, `invalid-${path.basename(input)}.png`) })
      await page.getByRole('button', { name: 'Clear all', exact: true }).click()
      await page.locator('input[type=file]').setInputFiles(input === fake ? mp3 : jpg)
      await page.locator('.compressBtn:enabled').waitFor()
      assert.equal(await page.locator('.status-failed').count(), 0, 'Choosing a valid replacement must recover the workspace')
    })
  for (const [route, valid] of [
    ['/compress', jpg], ['/image-compressor', jpg], ['/jpg-compressor', jpg], ['/jpeg-compressor', jpg],
    ['/png-compressor', png], ['/webp-compressor', webp], ['/gif-compressor', gif],
    ['/video-compressor', video], ['/webm-to-mp4', webmVideo], ['/mp3-compressor', mp3],
    ['/wav-compressor', wav], ['/wav-to-mp3', wav], ['/pdf-compressor', pdfPath], ['/archive-compressor', zipPath],
  ]) await check(`Validation and recovery: ${route}`, async () => {
    // ZIP creation accepts arbitrary nonempty bytes; its equivalent case is
    // the archive round-trip above, not a manufactured unsupported-format error.
    const wrongFormat = route === '/compress' ? fake : route === '/pdf-compressor' ? jpg : pdfPath
    await upload(route, wrongFormat)
    await page.locator('.status-failed').waitFor()
    assert.ok(await page.locator('.fileError[role=alert]').count() > 0)
    assert.equal(await page.locator('.compressBtn').count(), 0)
    assert.equal(await page.locator('.downloadActions').count(), 0)
    await page.screenshot({ path: path.join(evidence, `${route.slice(1)}-rejected-input.png`) })
    await page.getByRole('button', { name: 'Clear all', exact: true }).click()
    await page.locator('input[type=file]').setInputFiles(fake)
    await page.locator('.status-failed').waitFor()
    assert.equal(await page.locator('.compressBtn').count(), 0)
    await page.getByRole('button', { name: 'Clear all', exact: true }).click()
    await page.locator('input[type=file]').setInputFiles(valid)
    await page.locator('.compressBtn:enabled').waitFor()
    assert.equal(await page.locator('.status-failed').count(), 0)
    return { unsupportedInputRejected: true, malformedInputRejected: true, validReplacementReady: true }
  })
  await check('Mixed generic batch dispatch', async () => {
    await upload('/compress', [jpg, wav, pdfPath])
    await page.locator('.compressBtn').click()
    await page.waitForFunction(
      () => document.querySelectorAll('.file.status-completed').length === 3,
      {},
      { timeout: 180000 },
    )
    assert.equal(await page.locator('.fileError').count(), 0)
    await page.getByRole('button', { name: 'Prepare ZIP (3 files)', exact: true }).click()
    const promise = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Save ZIP (3 files)', exact: true }).click()
    const download = await promise
    const entries = unzipSync(readFileSync(await download.path()))
    assert.equal(Object.keys(entries).length, 3)
    const verified = new Set()
    for (const [name, data] of Object.entries(entries)) {
      const file = path.join(fixtures, `mixed-${path.basename(name)}`)
      writeFileSync(file, data)
      if (/\.jpe?g$/i.test(name)) {
        assert.equal(probe(file).streams[0].codec_name, 'mjpeg')
        assertImageGeometry(jpg, file)
        decode(file)
        verified.add('image')
      } else if (/\.mp3$/i.test(name)) {
        assert.equal(probe(file).streams[0].codec_name, 'mp3')
        decode(file)
        assertAudibleOutput(file)
        verified.add('audio')
      } else if (/\.pdf$/i.test(name)) {
        assert.equal((await PDFDocument.load(data)).getPageCount(), 1)
        assert.match(execFileSync('pdftotext', [file, '-']).toString(), /FileCompresser verification/)
        verified.add('pdf')
      }
    }
    assert.deepEqual([...verified].sort(), ['audio', 'image', 'pdf'])
  })
  await check(
    'Cancel all prevents waiting video and retry succeeds',
    async () => {
      await upload('/video-compressor', [longVideo, video])
      await page.locator('.compressBtn').click()
      await page.locator('.status-processing').waitFor()
      await page.screenshot({ path: path.join(evidence, 'video-processing-before-cancel.png') })
      await page
        .getByRole('button', { name: 'Cancel processing', exact: true })
        .click()
      await page.waitForFunction(
        () => !document.querySelector('.status-processing'),
      )
      await page.waitForFunction(() =>
        document.querySelector('.workflowStatus')?.textContent.includes('cancelled'),
      )
      assert.equal(await page.locator('.file.status-cancelled').count(), 2)
      await page
        .locator('.fileActions button')
        .filter({ hasText: 'Retry' })
        .first()
        .click()
      await page.locator('.status-completed').waitFor({ timeout: 180000 })
      assert.equal(await page.locator('.status-failed').count(), 0)
      const promise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download file', exact: true }).click()
      const download = await promise
      const output = await download.path()
      assert.equal(probe(output).streams.find(stream => stream.codec_type === 'video').codec_name, 'h264')
      assertDurationPreserved(probe(longVideo), probe(output))
      decode(output)
    },
  )
  if (process.env.QA_WEBP_ENDPOINTS) {
    const sizes = {}
    for (const quality of [10, 100]) await check(`WebP real custom quality ${quality}%`, async () => {
      const out = await processAndDownload('/webp-compressor', webp, async () => {
        await page.getByRole('button', { name: 'Balanced', exact: true }).click()
        await page.locator('input[type=range]').press(quality === 10 ? 'Home' : 'End')
        assert.equal(await page.locator('input[type=range]').inputValue(), String(quality))
      })
      assertImageGeometry(webp, out)
      assert.equal(probe(out).streams[0].codec_name, 'webp')
      decode(out)
      sizes[quality] = readFileSync(out).length
      if (quality === 100) assert.ok(sizes[10] < sizes[100], 'The two WebP quality endpoints must affect real output size')
      return { quality, bytes: sizes[quality] }
    })
  }
  await check(
    'No file-upload requests or unhandled browser exceptions',
    async () => {
      assert.deepEqual(requests, [])
      assert.deepEqual(errors, [])
      assert.deepEqual(failedResources, [])
    },
  )
} finally {
  clearInterval(telemetry)
  writeFileSync(
    path.join(evidence, browserName === 'chromium' ? 'functionality.json' : `functionality-${browserName}.json`),
    JSON.stringify({ caseFilter: process.env.QA_CASE_FILTER || null, caseRange: process.env.QA_CASE_RANGE || null, results, timings, comparisonDiagnostics, browserLifecycle, fixtures, errors, consoleMessages, failedResources, requests }, null, 2),
  )
  closingBrowser = true
  await browser.close()
}
console.log(
  `${results.filter((r) => r.pass).length}/${results.length} real-output checks passed`,
)
if (results.some((r) => !r.pass)) process.exitCode = 1
