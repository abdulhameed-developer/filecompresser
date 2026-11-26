/** Real WebM upload → browser conversion → download → independent decode.
 * PW_TOOLS=/isolated/qa node scripts/webm-browser-audit.mjs [base] [recording]
 * Uses a separate headless QA browser and never uploads files to a server.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const ffmpeg = process.env.FFMPEG_PATH || qa('ffmpeg-static')
const ffprobe = process.env.FFPROBE_PATH || qa('ffprobe-static').path
const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const base = process.argv[2] || 'http://127.0.0.1:3000'
const recording = process.argv[3]
if (!recording) throw new Error('Pass the real WebM recording path as the second argument.')
const evidence = path.resolve(process.env.QA_RESULTS || '.qa-results')
mkdirSync(evidence, { recursive: true })
const directory = mkdtempSync(path.join(tmpdir(), 'filecompresser-browser-webm-'))
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const failedResources = []
const writes = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) writes.push(request.url()) })
page.on('response', response => { if (response.status() >= 400) failedResources.push({ status: response.status(), url: response.url() }) })
const probe = file => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 30000 }).toString())
const packetTimes = file => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts_time', '-of', 'json', file], { timeout: 30000 }).toString()).packets.map(packet => Number(packet.pts_time))
const hashes = file => execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-enc_time_base', '-1', '-f', 'framemd5', '-'], { timeout: 30000 }).toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim())
const summary = { generatedAt: new Date().toISOString(), base, browser: 'Chromium headless, separate QA context', inputBytes: readFileSync(recording).length, pass: false }
try {
  await page.goto(base + '/webm-to-mp4', { waitUntil: 'networkidle' })
  await page.locator('input[type=file]').setInputFiles(recording)
  await page.locator('.status-queued').waitFor({ timeout: 15000 })
  assert.match(await page.locator('.workflowOutput').innerText(), /MP4.*H.264/)
  assert.equal(await page.getByRole('group', { name: 'Compression level' }).count(), 0)
  assert.match(await page.locator('.compressBtn').innerText(), /Convert to MP4/)
  const started = performance.now()
  await page.locator('.compressBtn').click()
  await page.locator('.status-completed, .status-failed').first().waitFor({ timeout: 60000 })
  summary.clickToResultMs = Math.round(performance.now() - started)
  assert.deepEqual(await page.locator('.fileError').allTextContents(), [])
  assert.equal(await page.locator('.status-completed').count(), 1)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file', exact: true }).click()
  const download = await downloading
  summary.downloadName = download.suggestedFilename()
  assert.match(summary.downloadName, /\.mp4$/)
  assert(!summary.downloadName.includes('-compressed'), 'Conversion download must use a conversion filename')
  const output = path.join(directory, summary.downloadName)
  await download.saveAs(output)
  assert.equal(readFileSync(output).subarray(4, 8).toString(), 'ftyp', 'Downloaded bytes are an MP4 container')
  const before = probe(recording)
  const after = probe(output)
  const original = before.streams.find(stream => stream.codec_type === 'video')
  const encoded = after.streams.find(stream => stream.codec_type === 'video')
  assert.equal(encoded.codec_name, 'h264')
  assert.equal(encoded.width, original.width)
  assert.equal(encoded.height, original.height)
  assert.equal(encoded.nb_read_frames, original.nb_read_frames)
  const originalAudio = before.streams.filter(stream => stream.codec_type === 'audio')
  const outputAudio = after.streams.filter(stream => stream.codec_type === 'audio')
  assert.equal(outputAudio.length, originalAudio.length)
  outputAudio.forEach((stream, index) => { assert.equal(stream.codec_name, 'aac'); assert.equal(stream.channels, originalAudio[index].channels) })
  if (original.codec_name === 'h264' && original.pix_fmt === 'yuv420p') {
    assert.deepEqual(hashes(output), hashes(recording), 'Compatible video frames remain exact')
    const sourceTimes = packetTimes(recording)
    const outputTimes = packetTimes(output)
    assert.equal(sourceTimes.length, outputTimes.length)
    assert(sourceTimes.every((time, index) => Math.abs((time - sourceTimes[0]) - (outputTimes[index] - outputTimes[0])) < .001), 'Variable frame timestamps preserved within one millisecond')
  }
  execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-fps_mode', 'passthrough', '-enc_time_base', '-1', '-f', 'null', '-'], { timeout: 30000 })
  await page.locator('.toolCard').screenshot({ path: path.join(evidence, 'webm-browser-completed-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(overflow, false)
  await page.locator('.toolCard').screenshot({ path: path.join(evidence, 'webm-browser-completed-mobile.png') })
  assert.deepEqual(errors, [])
  assert.deepEqual(writes, [], 'No file upload or content write requests')
  assert.deepEqual(failedResources, [])
  summary.outputBytes = readFileSync(output).length
  summary.output = after
  summary.outputPath = output
  summary.mobile = { width: 390, height: 844, overflow }
  summary.pass = true
  console.log('PASS', JSON.stringify({ clickToResultMs: summary.clickToResultMs, inputBytes: summary.inputBytes, outputBytes: summary.outputBytes, frames: encoded.nb_read_frames, duration: after.format.duration, downloadName: summary.downloadName }))
} catch (error) {
  summary.error = String(error)
  await page.screenshot({ path: path.join(evidence, 'webm-browser-failed.png'), fullPage: true }).catch(() => {})
  console.error('FAIL', summary.error)
  process.exitCode = 1
} finally {
  Object.assign(summary, { errors, writes, failedResources })
  writeFileSync(path.join(evidence, 'webm-browser-audit.json'), JSON.stringify(summary, null, 2) + '\n')
  await browser.close()
}
