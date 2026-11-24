import { access, lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCodecReleaseManifest, verifyExportedCodec } from './codec-assets.mjs'
import { checkImageCodecs } from './check-image-codecs.mjs'

/** Check only the exact active build token, and never include it in an error. */
export function assertNoExportedToken(bytes, filename, token = process.env.TINA_TOKEN) {
  if (typeof token === 'string' && token.length >= 16 && bytes.includes(Buffer.from(token))) {
    throw new Error(`A build credential was found in an exported asset: ${filename.replaceAll(token, '[redacted]')}`)
  }
}

export async function packageSite(root = process.cwd()) {
  const target = path.join(root, 'out')
  for (const asset of ['index.html', '404.html', '_headers', 'THIRD-PARTY-NOTICES.txt', 'ffmpeg-core/wasm-manifest.json', 'ffmpeg-core/worker.js', 'ffmpeg-core/NOTICE.txt', 'image-worker/codec-manifest.json', 'image-worker/image-engine.mjs'])
    await access(path.join(target, asset))
  await checkImageCodecs(path.join(target, 'image-worker'))
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
  const nativeNotice = await readFile(path.join(target, 'ffmpeg-core/NOTICE.txt'))
  const aggregateNotice = await readFile(path.join(target, 'THIRD-PARTY-NOTICES.txt'))
  if (aggregateNotice.length > 25 * 1024 * 1024 || !aggregateNotice.includes(nativeNotice)) throw new Error('The aggregate third-party notices omit the current codec notice or exceed the hosting asset limit')
  const codec = verifyExportedCodec(manifest, await readCodecReleaseManifest(root), await readFile(path.join(target, 'ffmpeg-core/ffmpeg-core.js')), wasm, nativeNotice)
  async function inspect(directory, displayRoot = target, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.env') || ['.git', '.claude', '.qa-fixtures', '.qa-results', 'node_modules'].includes(entry.name))
        throw new Error(`Private development material in export: ${entry.name}`)
      const filename = path.join(directory, entry.name)
      const relative = path.join(prefix, path.relative(displayRoot, filename))
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in export: ${relative}`)
      if (entry.isDirectory()) await inspect(filename, displayRoot, prefix)
      else if (entry.isFile()) assertNoExportedToken(await readFile(filename), relative)
    }
  }
  await inspect(target)
  const admin = path.join(root, 'public/admin')
  const info = await lstat(admin).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
  if (info) {
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The generated admin directory must be a regular directory')
    await inspect(admin, admin, 'public/admin')
  }
  const release = { sha: process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || 'local-uncommitted', run: process.env.GITHUB_RUN_ID || null, codec }
  const releaseBytes = Buffer.from(JSON.stringify(release))
  assertNoExportedToken(releaseBytes, 'release.json')
  await writeFile(path.join(target, 'release.json'), releaseBytes)
  console.log(`Static export verified: HTML, workers and exact media-engine bytes (${codec.mode}); credential scan passed.`)
  return release
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await packageSite()
