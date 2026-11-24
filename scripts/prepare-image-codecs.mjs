import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CODECS = [
  { name: '@jsquash/jpeg', version: '1.6.0', directory: 'jpeg', files: ['encode.js', 'meta.js', 'utils.js', 'codec/enc/mozjpeg_enc.js', 'codec/enc/mozjpeg_enc.wasm', 'LICENSE', 'codec/LICENSE.codec.md'] },
  // Use the single-threaded entry directly: no nested workers, bare imports,
  // SharedArrayBuffer, or cross-origin isolation requirement is introduced.
  { name: '@jsquash/oxipng', version: '2.3.0', directory: 'oxipng', files: ['codec/pkg/squoosh_oxipng.js', 'codec/pkg/squoosh_oxipng_bg.wasm', 'LICENSE', 'codec/LICENSE.codec.md'] },
  // The pinned UMD contains its Pako build; no bare package import is shipped.
  // Its upstream MIT notice and bundled Pako MIT/Zlib notice travel with it.
  { name: '@pdf-lib/upng', version: '1.0.1', directory: 'upng', files: [{ source: 'dist/UPNG.js', destination: 'UPNG.js', sha256: '911872ae298adadf47d9ae29f21441e6a5c823f6e550445da5bb2a03840239c2' }, 'LICENSE'] },
  { name: 'pako', version: '1.0.11', directory: 'upng', files: [{ source: 'LICENSE', destination: 'pako.LICENSE' }, { source: 'lib/zlib/README', destination: 'pako.ZLIB.LICENSE' }] },
]

/** Copy only the pinned encoder assets. None are loaded until an image needs them. */
export async function prepareImageCodecs(root, output = path.join(root, 'public/image-worker')) {
  const files = []
  for (const codec of CODECS) {
    const source = path.join(root, 'node_modules', codec.name)
    const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
    if (metadata.name !== codec.name || metadata.version !== codec.version)
      throw new Error(`Install the pinned ${codec.name}@${codec.version} before preparing image assets.`)
    for (const asset of codec.files) {
      const relative = typeof asset === 'string' ? asset : asset.source
      const destination = path.join(output, 'codecs', codec.directory, typeof asset === 'string' ? asset : asset.destination)
      await mkdir(path.dirname(destination), { recursive: true })
      const bytes = await readFile(path.join(source, relative))
      if (!bytes.length || bytes.length > 24 * 1024 * 1024) throw new Error(`Invalid image codec asset: ${relative}`)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (typeof asset !== 'string' && asset.sha256 && sha256 !== asset.sha256) throw new Error(`The pinned ${codec.name} browser artifact changed.`)
      await writeFile(destination, bytes)
      files.push({ file: path.relative(output, destination).split(path.sep).join('/'), bytes: bytes.length, sha256, package: `${codec.name}@${codec.version}` })
    }
  }
  const workers = (await readdir(path.join(root, 'workers'))).filter(name => /^image-[a-z-]+\.mjs$/.test(name)).sort()
  if (!workers.includes('image-engine.mjs')) throw new Error('The image worker entry is missing.')
  for (const name of workers) {
    const bytes = await readFile(path.join(root, 'workers', name))
    if (!bytes.length || bytes.length > 512 * 1024) throw new Error(`Invalid image worker module: ${name}`)
    await writeFile(path.join(output, name), bytes)
    files.push({ file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  await writeFile(path.join(output, 'codec-manifest.json'), `${JSON.stringify({ version: 1, files }, null, 2)}\n`)
  return { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }
}
