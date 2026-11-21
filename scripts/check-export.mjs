import { Writable } from 'node:stream'
import { createStaticHandler } from './serve-static.mjs'

// Exercise the existing crawler against the actual export and preview handler,
// without opening a network socket. This is not a browser/encoding test.
const handler = await createStaticHandler('out')
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
process.argv[2] = base
await import('./route-crawl.mjs')
