import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRedirectFile } from './prepare-redirects.mjs'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
}

function headerRules(source) {
  const rules = []
  let current
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const pattern = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
      current = { match: new RegExp(`^${pattern}$`), headers: [] }
      rules.push(current)
    } else if (current) current.headers.push(line.trim())
  }
  return rules
}

/** Local QA server for the exported files. It never exposes the source tree. */
export async function createStaticHandler(directory = 'out') {
  const root = await realpath(path.resolve(directory))
  const rules = headerRules(await readFile(path.join(root, '_headers'), 'utf8'))
  let redirects = new Map()
  try { redirects = parseRedirectFile(await readFile(path.join(root, '_redirects'), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  return async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
        response.writeHead(404); response.end(); return
      }
      // Cloudflare applies exact redirects before static assets and headers.
      if (redirects.has(pathname)) {
        response.writeHead(301, { Location: redirects.get(pathname), 'Content-Length': '0' })
        response.end(); return
      }
      const requested = path.resolve(root, `.${pathname}`)
      if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
        response.writeHead(404); response.end(); return
      }
      let file
      let info
      for (const candidate of [requested, `${requested}.html`, path.join(requested, 'index.html')]) {
        try {
          const resolved = await realpath(candidate)
          if (!resolved.startsWith(`${root}${path.sep}`)) continue
          const details = await stat(resolved)
          if (details.isFile() && !['_headers', '_redirects'].includes(path.basename(resolved))) { file = resolved; info = details; break }
        } catch { /* Try the clean-URL or directory-index alternative. */ }
      }
      const missing = !file
      if (missing) { file = path.join(root, '404.html'); info = await stat(file) }
      const values = new Map()
      for (const rule of rules) {
        if (!rule.match.test(pathname)) continue
        for (const entry of rule.headers) {
          if (entry.startsWith('! ')) { values.delete(entry.slice(2).toLowerCase()); continue }
          const colon = entry.indexOf(':')
          if (colon < 1) continue
          const key = entry.slice(0, colon).toLowerCase()
          const value = entry.slice(colon + 1).trim()
          values.set(key, values.has(key) ? `${values.get(key)}, ${value}` : value)
        }
      }
      // Production Pages is HTTPS. Local QA must remain usable on plain HTTP.
      values.delete('strict-transport-security')
      if (values.has('content-security-policy')) values.set('content-security-policy', values.get('content-security-policy').replace(/;?\s*upgrade-insecure-requests/g, ''))
      for (const [key, value] of values) response.setHeader(key, value)
      response.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
      if (missing) response.setHeader('X-Robots-Tag', 'noindex')
      const etag = `W/"${info.size}-${info.mtimeMs}"`
      response.setHeader('ETag', etag)
      response.setHeader('Accept-Ranges', 'bytes')
      if (!missing && request.headers['if-none-match'] === etag) {
        response.writeHead(304); response.end(); return
      }
      let start = 0
      let end = info.size - 1
      let partial = false
      if (!missing && request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]))
          end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
          partial = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < info.size
        }
        if (!partial) {
          response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return
        }
        response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`)
      }
      response.setHeader('Content-Length', end - start + 1)
      response.writeHead(missing ? 404 : partial ? 206 : 200)
      if (request.method === 'HEAD') { response.end(); return }
      const stream = createReadStream(file, { start, end })
      stream.on('error', () => response.destroy())
      stream.pipe(response)
    } catch {
      if (!response.headersSent) response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Unable to serve this static asset.')
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const handler = await createStaticHandler(process.argv[2] || 'out')
  const host = process.env.PREVIEW_HOST || '127.0.0.1'
  const port = Number(process.env.PORT || 3000)
  createServer(handler).listen(port, host, () => console.log(`Static preview: http://${host}:${port}`))
}
