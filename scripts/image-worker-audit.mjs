/** Exercise actual source leases in a real browser; private test bundle only.
 * node scripts/image-worker-audit.mjs BASE DATA_DIRECTORY OUTPUT_JSON
 */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'

const qa = createRequire(path.resolve(process.env.PW_TOOLS || path.join(os.homedir(), 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const [base, directory, destination] = process.argv.slice(2)
const report = { version: 1, base, timestamp: new Date().toISOString(), checks: [], errors: [] }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext()
const page = await context.newPage()
page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) report.errors.push({ unexpectedNetworkMethod: request.method(), url: request.url() }) })
page.on('requestfailed', request => report.errors.push({ resource: request.url(), error: request.failure()?.errorText }))
page.on('pageerror', error => report.errors.push({ page: error.message }))
const inputs = Object.fromEntries(['portrait-hq.jpg', 'screenshot.png', 'transparent.png'].map(name => [name, readFileSync(path.join(directory, 'inputs', name)).toString('base64')]))
// An intentionally malformed ICC payload inside an otherwise valid PNG. The
// exact chunk must not disappear merely because a decoder ignores its profile.
const originalPng = readFileSync(path.join(directory, 'inputs', 'transparent.png'))
const profilePayload = Buffer.concat([Buffer.from('Fixture\0\0'), deflateSync(Buffer.from('This is deliberately not a valid ICC profile'))])
const profileBody = Buffer.concat([Buffer.from('iCCP'), profilePayload])
let crc = 0xffffffff
for (const byte of profileBody) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1 }
const profileLength = Buffer.alloc(4), checksum = Buffer.alloc(4)
profileLength.writeUInt32BE(profilePayload.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
inputs['malformed-icc.png'] = Buffer.concat([originalPng.subarray(0, 33), profileLength, profileBody, checksum, originalPng.subarray(33)]).toString('base64')
try {
  await page.goto(`${base}/robots.txt`)
  await page.evaluate(async inputs => {
    window.workerEvents = []
    const NativeWorker = window.Worker
    let next = 0
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); this.benchmarkId = ++next; window.workerEvents.push({ type: 'created', id: this.benchmarkId, atMs: performance.now() }) }
      terminate() { window.workerEvents.push({ type: 'terminated', id: this.benchmarkId, atMs: performance.now() }); super.terminate() }
    }
    window.imageApi = await import('/bench-client.mjs')
    window.imageFixtures = Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, new File([Uint8Array.from(atob(value), c => c.charCodeAt(0))], name, { type: name.endsWith('.jpg') ? 'image/jpeg' : 'image/png' })]))
    window.imageHash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('')
  }, inputs)
  const warm = await page.evaluate(async () => {
    const first = await window.imageApi.compressImage(window.imageFixtures['portrait-hq.jpg'], { mode: 'balanced' })
    const second = await window.imageApi.compressImage(window.imageFixtures['portrait-hq.jpg'], { mode: 'balanced' })
    return { firstHash: await window.imageHash(first.blob), secondHash: await window.imageHash(second.blob), events: [...window.workerEvents] }
  })
  assert.equal(warm.firstHash, warm.secondHash)
  assert.equal(warm.events.filter(e => e.type === 'created').length, 1)
  assert.equal(warm.events.filter(e => e.type === 'terminated').length, 0)
  report.checks.push({ name: 'Two real JPEG encodes reuse one exclusively leased worker with identical output', passed: true, ...warm })
  const probes = await page.evaluate(async () => {
    const jpeg = await window.imageApi.availableOutputFormats(window.imageFixtures['portrait-hq.jpg'])
    const afterJpeg = [...window.workerEvents]
    const png = await window.imageApi.availableOutputFormats(window.imageFixtures['transparent.png'])
    const third = await window.imageApi.compressImage(window.imageFixtures['portrait-hq.jpg'], { mode: 'balanced' })
    return { jpeg, afterJpeg, png, thirdHash: await window.imageHash(third.blob), events: [...window.workerEvents] }
  })
  assert.deepEqual(probes.jpeg, ['jpeg', 'png', 'webp'])
  assert.equal(probes.afterJpeg.filter(e => e.type === 'created').length, 1)
  assert.deepEqual(probes.png, ['png', 'webp'])
  assert.equal(probes.events.filter(e => e.type === 'created').length, 2)
  assert.equal(probes.events.filter(e => e.type === 'terminated').length, 1)
  assert.equal(probes.thirdHash, warm.firstHash)
  report.checks.push({ name: 'Header-only JPEG probe and real transparent PNG probe preserve the warm encoder', passed: true, ...probes })
  const cancelled = await page.evaluate(async () => {
    let listener, code, cancelledAtStage
    const signal = { cancelled: false, subscribe(callback) { listener = callback; return () => { listener = undefined } } }
    try {
      await window.imageApi.compressImage(window.imageFixtures['screenshot.png'], { pngMode: 'maximum' }, (_progress, message) => {
        if (message.startsWith('Testing PNG color reduction')) { cancelledAtStage = message; signal.cancelled = true; listener?.() }
      }, signal)
    } catch (error) { code = error.code }
    return { code, cancelledAtStage, events: [...window.workerEvents] }
  })
  assert.equal(cancelled.code, 'cancelled')
  assert.match(cancelled.cancelledAtStage, /Testing PNG color reduction/)
  assert.equal(cancelled.events.filter(e => e.type === 'terminated' && e.id === 1).length, 1)
  report.checks.push({ name: 'Cancellation terminates the reused real PNG engine during a palette search', passed: true, ...cancelled })
  const retry = await page.evaluate(async () => {
    const result = await window.imageApi.compressImage(window.imageFixtures['portrait-hq.jpg'], { mode: 'balanced' })
    return { hash: await window.imageHash(result.blob), events: [...window.workerEvents] }
  })
  assert.equal(retry.hash, warm.firstHash)
  assert.equal(retry.events.filter(e => e.type === 'created').length, 3)
  report.checks.push({ name: 'Retry uses a fresh worker and produces the same verified JPEG', passed: true, ...retry })
  const profile = await page.evaluate(async () => {
    const input = window.imageFixtures['malformed-icc.png']
    const result = await window.imageApi.compressImage(input, { pngMode: 'lossless' })
    const icc = async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer)
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = view.getUint32(offset), name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
        if (name === 'iCCP') return Array.from(bytes.subarray(offset + 8, offset + 8 + length))
        offset += length + 12
      }
      return null
    }
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    return { inputProfile: await icc(input), outputProfile: await icc(result.blob), outcome: result.outcome, inspection: result.inspection, outputBase64: btoa(String.fromCharCode(...bytes)) }
  })
  assert.deepEqual(profile.outputProfile, profile.inputProfile)
  assert.ok(profile.inputProfile?.length)
  assert.deepEqual([profile.inspection.outputWidth, profile.inspection.outputHeight], [768, 512])
  const edgeOutput = path.join(path.dirname(path.resolve(destination)), 'malformed-icc-result.png')
  mkdirSync(path.dirname(edgeOutput), { recursive: true })
  writeFileSync(edgeOutput, Buffer.from(profile.outputBase64, 'base64'))
  delete profile.outputBase64
  report.checks.push({ name: 'Malformed-profile PNG never loses its original ICC chunk or dimensions', passed: true, ...profile, outputFile: edgeOutput })
  console.log('Actual encoding, probe isolation, active cancellation and retry PASS; waiting for 30-second idle cleanup')
  await page.waitForFunction(() => window.workerEvents.some(e => e.type === 'terminated' && e.id === 3), null, { timeout: 35000 })
  const events = await page.evaluate(() => [...window.workerEvents])
  const terminated = events.find(e => e.type === 'terminated' && e.id === 3)
  const created = events.find(e => e.type === 'created' && e.id === 3)
  assert.ok(terminated.atMs - created.atMs >= 30000)
  report.checks.push({ name: 'Actual idle encoder is terminated after the bounded 30-second lease', passed: true, events })
} catch (error) {
  report.errors.push({ assertion: error.message })
  process.exitCode = 1
} finally {
  await context.close(); await browser.close()
  mkdirSync(path.dirname(path.resolve(destination)), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`)
}
if (report.errors.length) process.exitCode = 1
