/**
 * Route crawler.
 *
 * Fetches every public route from the running production server and checks the
 * things that must hold on every page: a 200 status, exactly one <header>,
 * <main> and <footer>, exactly one <h1>, a unique title and description, a
 * canonical that points at the right host, and no internal link that 404s.
 *
 * Run with the production server up:  node scripts/route-crawl.mjs [baseUrl]
 */

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const HOST = 'filecompresser.com'

const PAGES = [
  '/',
  '/about',
  '/blog',
  '/blog/how-browser-compression-works',
  '/blog/honest-file-size-reporting',
  '/blog/choosing-a-compression-mode',
  '/blog/what-privacy-claim-really-means',
  '/blog/compressing-files-for-the-web',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/contact',
  '/sitemap',
  '/compress',
  '/image-compressor',
  '/jpg-compressor',
  '/jpeg-compressor',
  '/png-compressor',
  '/webp-compressor',
  '/gif-compressor',
  '/video-compressor',
  '/mp3-compressor',
  '/wav-compressor',
  '/pdf-compressor',
  '/zip-compressor',
  '/archive-compressor',
  // Known alias: must resolve, canonicalise to its primary tool.
  '/wav-to-mp3',
]

/**
 * Tools that were deliberately removed from the registry.
 *
 * These must now be a genuine 404 with `noindex` — not a redirect, not a soft
 * 200. Reintroducing one by accident is a silent SEO regression, so it is
 * asserted rather than assumed.
 */
const REMOVED = [
  '/image-converter',
  '/webp-to-png',
  '/webp-to-jpg',
  '/jfif-to-png',
  '/heic-to-jpg',
  '/heic-to-png',
  '/heic-to-pdf',
  '/svg-converter',
  '/jpg-to-pdf',
  '/pdf-to-jpg',
  '/video-converter',
  '/mp4-converter',
  '/mov-to-mp4',
  '/audio-converter',
  '/mp3-converter',
  '/mp4-to-mp3',
  '/video-to-mp3',
]

const problems = []
const titles = new Map()
const descriptions = new Map()
const seenHrefs = new Set()
const internalLinks = new Map()

function fail(route, message) {
  problems.push(`${route} — ${message}`)
}

function pick(html, pattern) {
  const match = html.match(pattern)
  return match ? match[1].trim() : null
}

function countOf(html, pattern) {
  return (html.match(pattern) || []).length
}

/** Absolute -> origin-relative, dropping the hash. */
function normalise(href, route) {
  if (!href) return null
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return null
  if (/^https?:\/\//.test(href)) {
    if (!href.startsWith(BASE)) return null
    href = href.slice(BASE.length) || '/'
  }
  if (href.startsWith('#')) return null
  const hash = href.indexOf('#')
  const clean = hash === -1 ? href : href.slice(0, hash)
  if (!clean.startsWith('/')) return null
  void route
  return clean
}

const pages = []

for (const route of PAGES) {
  const res = await fetch(BASE + route, { redirect: 'follow' })
  const html = await res.text()
  pages.push({ route, status: res.status, html })

  if (res.status !== 200) {
    fail(route, `HTTP ${res.status}`)
    continue
  }

  const headers = countOf(html, /<header[\s>]/g)
  const mains = countOf(html, /<main[\s>]/g)
  const footers = countOf(html, /<footer[\s>]/g)
  const h1s = countOf(html, /<h1[\s>]/g)

  if (headers !== 1) fail(route, `expected 1 <header>, found ${headers}`)
  if (mains !== 1) fail(route, `expected 1 <main>, found ${mains}`)
  if (footers !== 1) fail(route, `expected 1 <footer>, found ${footers}`)
  if (h1s !== 1) fail(route, `expected 1 <h1>, found ${h1s}`)

  // An alias shares its primary's title and description by design — that is
  // what its canonical is for. Anything else sharing one is a real defect.
  const isAlias = route === '/wav-to-mp3'

  const title = pick(html, /<title>([^<]*)<\/title>/)
  if (!title) fail(route, 'no <title>')
  if (!isAlias && title && titles.has(title))
    fail(route, `duplicate title, also on ${titles.get(title)}`)
  else if (title && !titles.has(title)) titles.set(title, route)

  const description = pick(html, /<meta name="description" content="([^"]*)"/)
  if (!description) fail(route, 'no meta description')
  if (!isAlias && description && descriptions.has(description))
    fail(route, `duplicate description, also on ${descriptions.get(description)}`)
  else if (description && !descriptions.has(description))
    descriptions.set(description, route)

  const canonical = pick(html, /<link rel="canonical" href="([^"]*)"/)
  if (!canonical) {
    fail(route, 'no canonical')
  } else {
    if (!canonical.includes(HOST)) fail(route, `canonical on wrong host: ${canonical}`)
    if (route === '/wav-to-mp3') {
      if (!canonical.endsWith('/wav-compressor')) {
        fail(route, `alias canonical does not point at its primary: ${canonical}`)
      }
    } else {
      // The homepage canonicalises to the bare origin, with no trailing path.
      const expectedPath = route === '/' ? '/' : route
      const canonicalPath = new URL(canonical).pathname
      if (canonicalPath !== expectedPath) {
        fail(route, `canonical does not match route: ${canonical}`)
      }
    }
  }

  const robots = pick(html, /<meta name="robots" content="([^"]*)"/)
  if (route !== '/wav-to-mp3' && robots && /noindex/.test(robots)) {
    fail(route, `accidentally noindex: ${robots}`)
  }

  const ogTitle = pick(html, /<meta property="og:title" content="([^"]*)"/)
  const ogDesc = pick(html, /<meta property="og:description" content="([^"]*)"/)
  const ogUrl = pick(html, /<meta property="og:url" content="([^"]*)"/)
  const twTitle = pick(html, /<meta name="twitter:title" content="([^"]*)"/)
  if (!ogTitle) fail(route, 'no og:title')
  if (!ogDesc) fail(route, 'no og:description')
  if (!ogUrl) fail(route, 'no og:url')
  if (!twTitle) fail(route, 'no twitter:title')

  const links = []
  for (const m of html.matchAll(/<a[^>]*href="([^"]+)"/g)) {
    const clean = normalise(m[1], route)
    if (clean) {
      links.push(clean)
      seenHrefs.add(clean)
    }
  }
  internalLinks.set(route, links)

  // Structured data must be valid JSON.
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  if (ldBlocks.length === 0) fail(route, 'no JSON-LD')
  for (const block of ldBlocks) {
    try {
      JSON.parse(block[1].replace(/\\u003c/g, '<'))
    } catch (e) {
      fail(route, `invalid JSON-LD: ${e.message}`)
    }
  }
}

// ── The sitemap must list every indexable route and nothing that 404s ──
const sitemapRes = await fetch(`${BASE}/sitemap.xml`)
const sitemap = await sitemapRes.text()
if (sitemapRes.status !== 200) fail('/sitemap.xml', `HTTP ${sitemapRes.status}`)

const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
for (const loc of sitemapLocs) {
  const clean = new URL(loc).pathname
  const res = await fetch(BASE + clean)
  if (res.status !== 200) fail('/sitemap.xml', `lists ${clean} which returns ${res.status}`)
}
for (const route of PAGES) {
  // Aliases canonicalise elsewhere and must not compete with their primary.
  if (route === '/wav-to-mp3') continue
  if (!sitemapLocs.some((loc) => new URL(loc).pathname === route)) {
    fail('/sitemap.xml', `missing ${route}`)
  }
}
if (sitemapLocs.some((loc) => new URL(loc).pathname === '/wav-to-mp3')) {
  fail('/sitemap.xml', 'lists the /wav-to-mp3 alias, which canonicalises elsewhere')
}

const robotsRes = await fetch(`${BASE}/robots.txt`)
const robotsTxt = await robotsRes.text()
if (robotsRes.status !== 200) fail('/robots.txt', `HTTP ${robotsRes.status}`)
if (!robotsTxt.includes(`Sitemap: https://${HOST}/sitemap.xml`)) {
  fail('/robots.txt', 'no sitemap directive for the canonical host')
}

// ── Every internal link must resolve ──
const linkRoutes = [...seenHrefs].filter(
  (href) => !href.startsWith('/_next') && !href.startsWith('/sitemap.xml')
)
for (const href of [...new Set(linkRoutes)]) {
  const res = await fetch(BASE + href, { redirect: 'manual' })
  if (res.status >= 400) fail(href, `internal link returns ${res.status}`)
}

// ── Unknown routes must be a real 404 ──
const notFound = await fetch(`${BASE}/this-route-does-not-exist`, { redirect: 'manual' })
if (notFound.status !== 404) fail('/this-route-does-not-exist', `expected 404, got ${notFound.status}`)

// ── Removed tools must be a real, noindex 404 ──
for (const route of REMOVED) {
  const res = await fetch(BASE + route, { redirect: 'manual' })
  if (res.status !== 404) {
    fail(route, `removed tool returns ${res.status}, expected 404`)
    continue
  }
  const html = await res.text()
  if (!/name="robots"[^>]*content="[^"]*noindex/.test(html)) {
    fail(route, '404 page is not marked noindex')
  }
  if (sitemapLocs.some((loc) => new URL(loc).pathname === route)) {
    fail(route, 'removed tool is still listed in the sitemap')
  }
}

console.log(`routes crawled: ${PAGES.length}`)
console.log(`unique titles:   ${titles.size}`)
console.log(`unique descriptions: ${descriptions.size}`)
console.log(`sitemap urls:    ${sitemapLocs.length}`)
console.log(`internal link targets checked: ${new Set(linkRoutes).size}`)

if (problems.length) {
  console.log(`\nFAIL — ${problems.length} problem(s):`)
  for (const p of problems) console.log(`  ✗ ${p}`)
  process.exit(1)
}

console.log('\nPASS — route crawl clean')