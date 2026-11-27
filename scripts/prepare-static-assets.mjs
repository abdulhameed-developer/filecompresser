import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkUploads } from './check-uploads.mjs'
import { prepareRedirects } from './prepare-redirects.mjs'
import { createCodecNotice, resolveCodecCore } from './codec-assets.mjs'
import { prepareImageCodecs } from './prepare-image-codecs.mjs'

// Cloudflare Pages permits at most 25 MiB per asset. Keep engine chunks below
// that limit without changing the WASM bytes. The browser reconstructs a Blob.
export const WASM_CHUNK_SIZE = 16 * 1024 * 1024
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Bare browser/admin pages also request /favicon.ico. Embed the existing PNG
// unchanged in a standard single-frame ICO instead of creating different art.
async function prepareFallbackIcon(root) {
  const png = await readFile(path.join(root, 'public/favicon-32.png'))
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.readUInt32BE(16) !== 32 || png.readUInt32BE(20) !== 32) throw Error('Review the 32px favicon source before generating its ICO wrapper.')
  const header = Buffer.alloc(22)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header[6] = header[7] = 32
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(header.length, 18)
  await writeFile(path.join(root, 'public/favicon.ico'), Buffer.concat([header, png]))
}

export async function prepareStaticAssets(root = process.cwd(), options = {}) {
  await prepareFallbackIcon(root)
  await checkUploads(root)
  await prepareRedirects(root)
  const adminOutput = path.join(root, 'public/admin')
  await mkdir(adminOutput, { recursive: true })
  try {
    await copyFile(path.join(root, 'scripts/admin-setup.html'), path.join(adminOutput, 'index.html'), constants.COPYFILE_EXCL)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  const selectedCore = await resolveCodecCore(root, options)
  const worker = path.join(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm')
  const wasm = selectedCore.wasm
  if (wasm.length === 0 || wasm.length > 64 * 1024 * 1024)
    throw new Error('Unexpected FFmpeg core size; review the engine before release.')

  const output = path.join(root, 'public/ffmpeg-core')
  const imageOutput = path.join(root, 'public/image-worker')
  // These directories are generated only, never editorial or user uploads.
  await rm(output, { recursive: true, force: true })
  await rm(imageOutput, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await mkdir(imageOutput, { recursive: true })

  await writeFile(path.join(output, 'ffmpeg-core.js'), selectedCore.js)
  const notice = createCodecNotice(selectedCore)
  await writeFile(path.join(output, 'NOTICE.txt'), notice)
  for (const name of ['worker.js', 'const.js', 'errors.js', 'utils.js', 'types.js'])
    await copyFile(path.join(worker, name), path.join(output, name))
  await prepareImageCodecs(root, imageOutput)

  const chunks = []
  for (let offset = 0; offset < wasm.length; offset += WASM_CHUNK_SIZE) {
    const bytes = wasm.subarray(offset, offset + WASM_CHUNK_SIZE)
    const hash = sha256(bytes)
    const file = `ffmpeg-core-${hash}.part.wasm`
    await writeFile(path.join(output, file), bytes)
    chunks.push({ file, size: bytes.length, sha256: hash })
  }
  const manifest = { version: 1, size: wasm.length, sha256: sha256(wasm), chunks, provenance: { ...selectedCore.provenance, noticeBytes: notice.length, noticeSha256: sha256(notice) } }
  await writeFile(path.join(output, 'wasm-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await prepareStaticAssets()
  console.log(`Prepared media engine: ${manifest.chunks.length} static chunks, ${manifest.size} bytes; image worker ready.`)
}
