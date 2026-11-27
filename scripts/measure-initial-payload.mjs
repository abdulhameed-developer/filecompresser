import { readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

// Deterministic source-artifact comparison. These are raw bytes and gzip
// estimates of HTML-referenced resources, not browser/Cloudflare transfer data.
const root = path.resolve(process.argv[2] || 'out')
const output = process.argv[3]
const routes = process.argv.slice(4)
if (!routes.length) routes.push('/', '/image-compressor', '/webm-to-mp4', '/blog/how-browser-compression-works')
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
function fileRecord(relative) {
  const filename = path.resolve(root, `.${decodeURIComponent(relative)}`)
  if (!filename.startsWith(`${root}${path.sep}`)) throw Error('Resource escapes the exported site')
  const bytes = readFileSync(filename)
  return { path: relative, bytes: bytes.length, gzipEstimate: gzipSync(bytes).length, sha256: hash(bytes) }
}
function routeFile(route) {
  if (route === '/') return '/index.html'
  if (!route.startsWith('/') || route.includes('..') || /[?#]/.test(route)) throw Error('Use a canonical exported route')
  try { if (statSync(path.join(root, `${route}.html`)).isFile()) return `${route}.html` } catch { /* directory export */ }
  return `${route.replace(/\/$/, '')}/index.html`
}
const report = {
  root,
  capturedAt: new Date().toISOString(),
  method: 'Unique script src and stylesheet href references in exported HTML; raw file bytes and per-resource gzip estimates. Includes legacy nomodule references; not actual modern-browser transfers. Inline scripts are already included in HTML bytes. No codec/WASM startup is exercised.',
  routes: routes.map(route => {
    const html = fileRecord(routeFile(route))
    const markup = readFileSync(path.join(root, html.path), 'utf8')
    const scriptPaths = [...new Set([...markup.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]))]
    const stylePaths = [...new Set([...markup.matchAll(/<link\b[^>]*>/g)].filter(match => /\brel="stylesheet"/.test(match[0])).map(match => match[0].match(/\bhref="([^"]+)"/)?.[1]).filter(Boolean))]
    const scripts = scriptPaths.map(fileRecord)
    const styles = stylePaths.map(fileRecord)
    const total = [html, ...scripts, ...styles]
    return {
      route, html, scripts, styles,
      scriptBytes: scripts.reduce((sum, file) => sum + file.bytes, 0),
      scriptGzipEstimate: scripts.reduce((sum, file) => sum + file.gzipEstimate, 0),
      allReferencedBytes: total.reduce((sum, file) => sum + file.bytes, 0),
      allReferencedGzipEstimate: total.reduce((sum, file) => sum + file.gzipEstimate, 0),
    }
  }),
}
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
else console.log(JSON.stringify(report, null, 2))
