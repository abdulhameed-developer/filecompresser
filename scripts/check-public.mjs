import { readFile, readdir } from 'node:fs/promises'
import { checkUploads } from './check-uploads.mjs'
import { checkImageCodecs } from './check-image-codecs.mjs'
import { checkStockBlogArt } from './check-stock-blog-art.mjs'
import { readPublicRoutes, validateRedirectRules } from './prepare-redirects.mjs'
import { fileURLToPath } from 'node:url'
import { checkEditorialSource } from './check-editorial.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
checkEditorialSource(root)
const allowed = new Set([
  'logo.png',
  'logo-mark.png',
  'favicon-32.png',
  'favicon.ico',
  'favicon-192.png',
  'apple-touch-icon.png',
  'site.webmanifest',
  'THIRD-PARTY-NOTICES.txt',
  'blog',
  '_headers',
  '_redirects',
  'uploads',
  'admin',
  'ffmpeg-core',
  'image-worker',
])
const unexpected = (
  await readdir(new URL('../public/', import.meta.url))
).filter((name) => !allowed.has(name))
if (unexpected.length) {
  console.error(
    'Unexpected public assets; review before release:',
    unexpected.join(', '),
  )
  process.exit(1)
}
await checkUploads(root)
const faviconPng = await readFile(new URL('../public/favicon-32.png', import.meta.url))
const faviconIco = await readFile(new URL('../public/favicon.ico', import.meta.url))
if (faviconIco.length !== faviconPng.length + 22 || faviconIco.readUInt32LE(0) !== 65536 ||
    faviconIco.readUInt16LE(4) !== 1 || faviconIco[6] !== 32 || faviconIco[7] !== 32 ||
    faviconIco.readUInt32LE(14) !== faviconPng.length || faviconIco.readUInt32LE(18) !== 22 ||
    !faviconIco.subarray(22).equals(faviconPng)) throw Error('The fallback favicon must wrap the existing 32px PNG without changing its bytes.')
await checkImageCodecs(fileURLToPath(new URL('../public/image-worker/', import.meta.url)))
validateRedirectRules(JSON.parse(await readFile(new URL('../content/redirects/rules.json', import.meta.url), 'utf8')), await readPublicRoutes(root))

const blogAssets = new Set(['pipeline', 'sizebars', 'qualitycurve', 'dataflow', 'formattree'].flatMap(name => [`${name}.webp`, `${name}-640.webp`, `${name}-768.webp`, `${name}.jpg`]))
await checkStockBlogArt(root)
for (const asset of blogAssets) {
  if (!(await readFile(new URL(`../public/blog/${asset}`, import.meta.url))).length) throw new Error(`Missing or empty editorial asset: ${asset}`)
}
for (const entry of await readdir(new URL('../public/blog/', import.meta.url), { withFileTypes: true })) {
  if (!entry.isFile() || !blogAssets.has(entry.name)) throw new Error(`Unreviewed editorial asset: ${entry.name}`)
}
console.log('Public asset allowlist, image codec integrity, raster uploads and URL redirects passed.')
