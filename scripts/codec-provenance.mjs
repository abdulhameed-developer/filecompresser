/** Records the actual installed binary identities; does not certify source/license compliance. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const packages = []
for (const name of ['@ffmpeg/core', '@ffmpeg/ffmpeg', '@ffmpeg/util']) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'))
  const entry = lock.packages[`node_modules/${name}`]
  packages.push({ name, version: pkg.version, declaredLicense: pkg.license, repository: pkg.repository, resolved: entry.resolved, integrity: entry.integrity })
}
const assets = []
for (const file of ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm']) {
  const bytes = await readFile(file)
  assets.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile('docs/FFMPEG-PROVENANCE.json', JSON.stringify({ packages, assets, status: 'Binary identity inventory only. Exact corresponding-source/build scripts, complete notices and codec/license review remain required before public distribution.' }, null, 2) + '\n')
console.log('FFmpeg binary provenance recorded. This is not a compliance certification.')
