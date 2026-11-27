/** Real shipped browser worker benchmarks; private fixtures/outputs stay outside public/.
 * PW_TOOLS points to an isolated QA dependency directory. No production telemetry.
 * node scripts/image-benchmark.mjs BASE DATA_DIRECTORY OUTPUT_DIRECTORY
 * IMAGE_BENCH_REPEATS=2; IMAGE_BENCH_FILTER=portrait-hq,screenshot (optional).
 */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { readVerifiedImageFixture } from './benchmark-fixture.mjs'

const qa = createRequire(path.resolve(process.env.PW_TOOLS || path.join(os.homedir(), 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const [base = 'http://127.0.0.1:3205', data = '.qa-results/phase2/image-lab', destination = '.qa-results/phase2/image-lab/baseline'] = process.argv.slice(2)
const output = path.resolve(destination)
mkdirSync(output, { recursive: true })
const manifest = JSON.parse(readFileSync(path.join(data, 'manifest.json'), 'utf8'))
if (new Set(manifest.fixtures.map(f => f.id)).size !== manifest.fixtures.length) throw new Error('Fixture identifiers must be unique')
const filters = process.env.IMAGE_BENCH_FILTER?.split(',')
const fixtures = manifest.fixtures.filter(f => !filters || filters.includes(f.id))
// Fail before starting a browser; recheck the bytes actually used below too.
for (const fixture of fixtures) readVerifiedImageFixture(data, fixture)
const repetitions = Number(process.env.IMAGE_BENCH_REPEATS || 2)
const useClient = process.env.IMAGE_BENCH_CLIENT === '1'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const report = { version: 1, timestamp: new Date().toISOString(), base, clientEntry: useClient, browser: await browser.version(), environment: { platform: os.platform(), architecture: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() }, timingDefinition: useClient ? 'Timer starts at the actual compressImage client call and ends on its resolved verified result. Includes header checks, actual production worker-lease policy, lazy codecs, decode, encode, verification and worker return. Excludes page load, benchmark bundle import/input serialization and output serialization. New browser context per fixture; later runs can reuse the idle worker only if the source implementation supports it.' : 'Timer starts immediately before posting a File to the shipped module worker; ends on receiving result. Includes worker initialization, header checks, decode, lazy codec fetch/compile, encoding, validation and worker message delivery. Excludes page load, input base64 transfer and output serialization. Cold first request in a new browser context per fixture; warm HTTP-cache repeat still uses a newly owned worker, as production does.', cases: [], errors: [] }
try {
  for (const fixture of fixtures) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const resourceFailures = []
    page.on('requestfailed', request => resourceFailures.push({ url: request.url(), error: request.failure()?.errorText }))
    // A plain same-origin response isolates codec work from application hydration.
    await page.goto(`${base}/robots.txt`, { waitUntil: 'load' })
    const bytes = readVerifiedImageFixture(data, fixture)
    const modeList = process.env.IMAGE_BENCH_OPTIONS ? JSON.parse(process.env.IMAGE_BENCH_OPTIONS) : fixture.format === 'PNG'
      ? [{ mode: 'balanced', pngMode: 'lossless' }, { mode: 'balanced', pngMode: 'smart' }, { mode: 'maximum', pngMode: 'maximum' }]
      : [{ mode: 'balanced' }, { mode: 'high-quality' }, { mode: 'maximum' }]
    await page.evaluate(async ({ encoded, fileName, type, useClient }) => {
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, value => value.charCodeAt(0))
      window.benchmarkFile = new File([bytes], fileName, { type })
      if (useClient) {
        window.benchmarkWorkerEvents = []
        const NativeWorker = window.Worker
        window.Worker = class extends NativeWorker {
          constructor(...args) { super(...args); window.benchmarkWorkerEvents.push({ event: 'created', atMs: performance.now() }) }
          terminate() { window.benchmarkWorkerEvents.push({ event: 'terminated', atMs: performance.now() }); return super.terminate() }
        }
        window.benchmarkClient = await import('/bench-client.mjs')
      }
    }, { encoded: bytes.toString('base64'), fileName: fixture.file, type: { JPEG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp' }[fixture.format], useClient })
    for (const options of modeList) for (let repetition = 0; repetition < repetitions; repetition++) {
      const id = `${fixture.id}-${options.pngMode || options.mode}${typeof options.quality === 'number' ? `-q${Math.round(options.quality * 100)}` : ''}-${repetition + 1}`
      try {
        const result = await page.evaluate(async options => {
          const stages = []
          const serialize = async (result, receivedMs) => {
            const output = new Uint8Array(await result.blob.arrayBuffer())
            const chunks = []
            for (let offset = 0; offset < output.length; offset += 32768) chunks.push(String.fromCharCode(...output.subarray(offset, offset + 32768)))
            return { elapsedMs: receivedMs, stages, inspection: result.inspection, outcome: result.outcome, note: result.targetNote, outputBytes: output.length, outputBase64: btoa(chunks.join('')), ...(window.benchmarkWorkerEvents ? { workerEvents: [...window.benchmarkWorkerEvents] } : {}) }
          }
          const started = performance.now()
          if (window.benchmarkClient) {
            const result = await window.benchmarkClient.compressImage(window.benchmarkFile, options, (progress, message) => stages.push({ atMs: performance.now() - started, progress, message }))
            return serialize(result, performance.now() - started)
          }
          const worker = new Worker('/image-worker/image-engine.mjs', { type: 'module', name: 'FileCompresser controlled benchmark' })
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Image benchmark timed out at180s')) }, 180000)
            worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message || 'Worker failed')) }
            worker.onmessage = async ({ data }) => {
              if (data.type === 'progress') { stages.push({ atMs: performance.now() - started, progress: data.progress, message: data.message }); return }
              const receivedMs = performance.now() - started
              clearTimeout(timeout); worker.terminate()
              if (data.type === 'error') { reject(new Error(data.message)); return }
              resolve(await serialize(data.result, receivedMs))
            }
            worker.postMessage({ file: window.benchmarkFile, options })
          })
        }, options)
        const file = `${id}.${result.inspection.outputFormat === 'jpeg' ? 'jpg' : result.inspection.outputFormat}`
        const encoded = Buffer.from(result.outputBase64, 'base64')
        delete result.outputBase64
        writeFileSync(path.join(output, file), encoded)
        report.cases.push({ id, fixture: fixture.id, inputFile: fixture.file, inputBytes: fixture.bytes, inputSha256: fixture.sha256, options, repetition: repetition + 1, cache: options === modeList[0] && repetition === 0 ? 'cold context' : useClient ? 'warm context, source-owned worker policy' : 'warm HTTP cache, new worker', ...result, outputFile: file, outputSha256: createHash('sha256').update(encoded).digest('hex'), reduction: (1 - encoded.length / fixture.bytes) * 100 })
        console.log(`${id} ${Math.round(result.elapsedMs)}ms ${fixture.bytes}→${encoded.length}B ${report.cases.at(-1).reduction.toFixed(2)}%`)
      } catch (error) { report.errors.push({ id, error: error.message }); console.log(`FAIL ${id}: ${error.message}`) }
      writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
    }
    report.errors.push(...resourceFailures.map(failure => ({ fixture: fixture.id, resourceFailure: failure })))
    await context.close()
  }
} finally {
  await browser.close()
  writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
}
if (report.errors.length) process.exitCode = 1
