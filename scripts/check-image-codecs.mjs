import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

// Keep this reviewed inventory independent of the generated manifest: a stale
// worker or an omitted codec must not become trusted just by changing that file.
export const reviewedImageCodecFiles = Object.freeze([
  ...['encode.js', 'meta.js', 'utils.js', 'codec/enc/mozjpeg_enc.js', 'codec/enc/mozjpeg_enc.wasm', 'LICENSE', 'codec/LICENSE.codec.md']
    .map(file => Object.freeze({ file: `codecs/jpeg/${file}`, package: '@jsquash/jpeg@1.6.0' })),
  ...['codec/pkg/squoosh_oxipng.js', 'codec/pkg/squoosh_oxipng_bg.wasm', 'LICENSE', 'codec/LICENSE.codec.md']
    .map(file => Object.freeze({ file: `codecs/oxipng/${file}`, package: '@jsquash/oxipng@2.3.0' })),
  ...['UPNG.js', 'LICENSE'].map(file => Object.freeze({ file: `codecs/upng/${file}`, package: '@pdf-lib/upng@1.0.1' })),
  Object.freeze({ file: 'codecs/upng/pako.LICENSE', package: 'pako@1.0.11' }),
  Object.freeze({ file: 'codecs/upng/pako.ZLIB.LICENSE', package: 'pako@1.0.11' }),
  ...['image-canvas.mjs', 'image-engine.mjs', 'image-metadata.mjs', 'image-pipeline.mjs', 'image-png.mjs'].map(file => Object.freeze({ file })),
])
const reviewed = new Map(reviewedImageCodecFiles.map(entry => [entry.file, entry]))
const manifestFile = 'codec-manifest.json'
const maximumAssetBytes = 24 * 1024 * 1024
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export function validateImageCodecManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length !== reviewed.size)
    throw new Error('Invalid image codec manifest inventory')
  const seen = new Set()
  for (const entry of manifest.files) {
    const expected = entry && reviewed.get(entry.file)
    if (!expected || seen.has(entry.file) || entry.package !== expected.package ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > maximumAssetBytes ||
        typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))
      throw new Error('Invalid, duplicate or unreviewed image codec manifest entry')
    seen.add(entry.file)
  }
  return manifest
}

/** Verify generated files as regular, self-contained assets before packaging. */
export async function checkImageCodecs(directory) {
  const root = path.resolve(directory)
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Image codec assets must be a regular directory')
  const manifestInfo = await lstat(path.join(root, manifestFile))
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 100_000)
    throw new Error('Invalid image codec manifest file')
  const manifest = validateImageCodecManifest(JSON.parse(await readFile(path.join(root, manifestFile), 'utf8')))
  const expected = new Set([manifestFile, ...reviewed.keys()])
  async function inspect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in image codec assets: ${relative}`)
      if (entry.isDirectory()) {
        if (![...expected].some(file => file.startsWith(`${relative}/`))) throw new Error(`Unreviewed image codec directory: ${relative}`)
        await inspect(path.join(directory, entry.name), `${relative}/`)
      } else if (!entry.isFile() || !expected.has(relative)) throw new Error(`Unreviewed image codec asset: ${relative}`)
    }
  }
  await inspect(root)
  for (const entry of manifest.files) {
    const filename = path.join(root, entry.file)
    const info = await lstat(filename)
    if (!info.isFile() || info.isSymbolicLink() || info.size !== entry.bytes) throw new Error(`Image codec size mismatch: ${entry.file}`)
    if (digest(await readFile(filename)) !== entry.sha256) throw new Error(`Image codec integrity mismatch: ${entry.file}`)
  }
  return manifest
}

function assertDeliveryHeaders(response, file) {
  if (response.status !== 200) throw new Error(`Image codec ${file} returns ${response.status}`)
  const type = response.headers.get('content-type') || ''
  const expectedType = /\.m?js$/.test(file) ? /^(text|application)\/javascript(?:;|$)/i
    : file.endsWith('.wasm') ? /^application\/wasm(?:;|$)/i
    : file.endsWith('.json') ? /^application\/json(?:;|$)/i : null
  if (expectedType && !expectedType.test(type)) throw new Error(`Image codec ${file} has invalid Content-Type: ${type}`)
  if (response.headers.get('x-content-type-options') !== 'nosniff' ||
      response.headers.get('cross-origin-resource-policy') !== 'same-origin' ||
      !/\bnoindex\b/.test(response.headers.get('x-robots-tag') || ''))
    throw new Error(`Image codec ${file} is missing same-origin security headers`)
  const csp = response.headers.get('content-security-policy') || ''
  for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "worker-src 'self'", "'wasm-unsafe-eval'"])
    if (!csp.includes(directive)) throw new Error(`Image codec ${file} is missing the required CSP: ${directive}`)
}

/** Audit actual static responses, including MIME under nosniff and exact bytes. */
export async function checkImageCodecDelivery(base, expectedManifest, fetcher = fetch) {
  const response = await fetcher(`${base}/image-worker/${manifestFile}`, { redirect: 'manual' })
  assertDeliveryHeaders(response, manifestFile)
  const manifest = validateImageCodecManifest(await response.json())
  if (expectedManifest) {
    const expected = new Map(validateImageCodecManifest(expectedManifest).files.map(entry => [entry.file, entry]))
    for (const entry of manifest.files) {
      const original = expected.get(entry.file)
      if (entry.bytes !== original.bytes || entry.sha256 !== original.sha256) throw new Error(`Delivered image codec manifest differs from export: ${entry.file}`)
    }
  }
  for (const entry of manifest.files) {
    const asset = await fetcher(`${base}/image-worker/${entry.file}`, { redirect: 'manual' })
    assertDeliveryHeaders(asset, entry.file)
    const bytes = Buffer.from(await asset.arrayBuffer())
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error(`Delivered image codec integrity mismatch: ${entry.file}`)
  }
  return manifest
}
