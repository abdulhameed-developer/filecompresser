import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const target = path.resolve('out')
for (const asset of ['index.html', '404.html', '_headers', 'ffmpeg-core/wasm-manifest.json', 'ffmpeg-core/worker.js', 'image-worker/browser-image-compression.js'])
  await access(path.join(target, asset))
const manifest = JSON.parse(await readFile(path.join(target, 'ffmpeg-core/wasm-manifest.json'), 'utf8'))
const chunks = []
for (const chunk of manifest.chunks) {
  if (!/^ffmpeg-core-[a-f0-9]{64}\.part\.wasm$/.test(chunk.file)) throw new Error('Invalid engine asset name')
  const bytes = await readFile(path.join(target, 'ffmpeg-core', chunk.file))
  if (bytes.length !== chunk.size || bytes.length > 25 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== chunk.sha256)
    throw new Error('Corrupt or oversized engine chunk')
  chunks.push(bytes)
}
const wasm = Buffer.concat(chunks)
if (wasm.length !== manifest.size || createHash('sha256').update(wasm).digest('hex') !== manifest.sha256)
  throw new Error('The exported media engine differs from its source')
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.env') || ['.git', '.claude', '.qa-fixtures', '.qa-results', 'node_modules'].includes(entry.name))
      throw new Error(`Private development material in release: ${entry.name}`)
    if (entry.isDirectory()) await inspect(path.join(directory, entry.name))
  }
}
await inspect(target)
await writeFile(path.join(target, 'release.json'), JSON.stringify({ sha: process.env.GITHUB_SHA || 'local-uncommitted', run: process.env.GITHUB_RUN_ID || null }))
console.log('Static release verified: HTML, workers and exact media-engine bytes; no server or private source files.')
