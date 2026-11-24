import { readFile, readdir } from 'node:fs/promises'
import { checkUploads } from './check-uploads.mjs'
import { checkImageCodecs } from './check-image-codecs.mjs'
import { readPublicRoutes, validateRedirectRules } from './prepare-redirects.mjs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const allowed = new Set([
  'logo.png',
  'logo-mark.png',
  'favicon-32.png',
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
await checkImageCodecs(fileURLToPath(new URL('../public/image-worker/', import.meta.url)))
validateRedirectRules(JSON.parse(await readFile(new URL('../content/redirects/rules.json', import.meta.url), 'utf8')), await readPublicRoutes(root))

const blogAssets = new Set(['pipeline', 'sizebars', 'qualitycurve', 'dataflow', 'formattree'].flatMap(name => [`${name}.webp`, `${name}-640.webp`, `${name}.jpg`]))
for (const entry of await readdir(new URL('../public/blog/', import.meta.url), { withFileTypes: true })) {
  if (!entry.isFile() || !blogAssets.has(entry.name)) throw new Error(`Unreviewed editorial asset: ${entry.name}`)
}
console.log('Public asset allowlist, image codec integrity, raster uploads and URL redirects passed.')
