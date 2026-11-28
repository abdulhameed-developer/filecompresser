import { Writable } from 'node:stream'
import { mkdir, writeFile } from 'node:fs/promises'
import { createStaticHandler } from './serve-static.mjs'
import { checkImageCodecs, checkImageCodecDelivery } from './check-image-codecs.mjs'
import { checkEditorialExport, checkEditorialSource } from './check-editorial.mjs'
import { auditContentParity } from './content-parity.mjs'

// Exercise the existing crawler against the actual export and preview handler,
// without opening a network socket. This is not a browser/encoding test.
const handler = await createStaticHandler('out')
checkEditorialSource()
const editorial = await checkEditorialExport('out')
console.log(`Public editorial policy passed for ${editorial.pages} generated HTML files.`)
const canonicalOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').origin
const previewBranch = Boolean(process.env.CF_PAGES_BRANCH) && process.env.CF_PAGES_BRANCH !== (process.env.NEXT_PUBLIC_TINA_BRANCH || 'main')
const expectIndexable = process.env.NEXT_PUBLIC_ENABLE_INDEXING === 'true' && Boolean(process.env.NEXT_PUBLIC_SITE_URL) && new URL(canonicalOrigin).protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(canonicalOrigin).hostname) && !previewBranch
// CI intentionally builds noindex/follow. Published-domain verification has
// its own hard index/follow default and forbids remote noindex overrides.
const parity = await auditContentParity({ exportDirectory: 'out', origin: canonicalOrigin, expectedIndexable: expectIndexable, expectedFollow: true })
await mkdir('.qa-results', { recursive: true })
await writeFile('.qa-results/content-parity-export.json', JSON.stringify(parity, null, 2) + '\n')
if (!parity.passed) {
  const failures = parity.reports.flatMap(report => report.pages.flatMap(page => page.error ? [`${page.route}: ${page.error}`] : page.mismatches.map(item => `${page.route} ${item.record}:${item.field}`)))
  throw new Error(`CMS/export parity failed. ${failures.slice(0, 20).join('; ')}. Full expected/actual values: .qa-results/content-parity-export.json`)
}
console.log(`CMS/export content parity passed: ${parity.manifest.pages.length} served views; expected ${expectIndexable ? 'index' : 'noindex'}, follow.`)
const imageManifest = await checkImageCodecs('out/image-worker')
const base = 'http://127.0.0.1:3198'
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, base)
  if (url.origin !== base) throw new Error('Export checks only read local output.')
  class Capture extends Writable {
    status = 200
    headers = new Headers()
    parts = []
    headersSent = false
    setHeader(key, value) { this.headers.set(key, String(value)) }
    writeHead(status, headers = {}) {
      this.status = status
      this.headersSent = true
      for (const [key, value] of Object.entries(headers)) this.setHeader(key, value)
      return this
    }
    _write(part, _encoding, callback) { this.parts.push(Buffer.from(part)); callback() }
  }
  const output = new Capture()
  const done = new Promise((resolve, reject) => { output.on('finish', resolve); output.on('error', reject) })
  await handler({ method: init.method || 'GET', url: `${url.pathname}${url.search}`, headers: Object.fromEntries(new Headers(init.headers)) }, output)
  await done
  return new Response([204, 304].includes(output.status) ? null : Buffer.concat(output.parts), { status: output.status, headers: output.headers })
}
await checkImageCodecDelivery(base, imageManifest)
console.log('Exported image codec bytes, JavaScript/WASM MIME types and same-origin security headers passed.')
process.argv[2] = base
await import('./route-crawl.mjs')
