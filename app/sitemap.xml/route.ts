import { TOOLS } from '@/lib/tools'
import { BLOG_POSTS } from '@/lib/blog'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-static'

interface Entry {
  path: string
  changefreq: string
  priority: string
  /** ISO date. Present only where it is true; a placeholder would be a lie. */
  lastmod?: string
}

/**
 * The date the content was last meaningfully reviewed. Static pages are legal
 * and policy text that changes rarely; tool pages change when the registry
 * changes, which has no reliable per-tool timestamp, so they are listed without
 * one rather than carrying a fabricated date.
 */
const REVIEWED = '2026-10-01'

export function GET() {
  const entries: Entry[] = [
    { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: REVIEWED },
    { path: '/about', changefreq: 'monthly', priority: '0.6', lastmod: REVIEWED },
    { path: '/blog', changefreq: 'weekly', priority: '0.7', lastmod: REVIEWED },
    { path: '/privacy', changefreq: 'yearly', priority: '0.3', lastmod: REVIEWED },
    { path: '/terms', changefreq: 'yearly', priority: '0.2', lastmod: REVIEWED },
    { path: '/disclaimer', changefreq: 'yearly', priority: '0.2', lastmod: REVIEWED },
    { path: '/contact', changefreq: 'yearly', priority: '0.2', lastmod: REVIEWED },
    { path: '/sitemap', changefreq: 'monthly', priority: '0.2', lastmod: REVIEWED },
    // Each post carries its own publication date, which is a real lastmod.
    ...BLOG_POSTS.map((post) => ({
      path: `/blog/${post.slug}`,
      changefreq: 'yearly',
      priority: '0.6',
      lastmod: post.date,
    })),
    // Only canonical tool URLs. Aliases are omitted here because they
    // canonicalise elsewhere and listing both would compete with themselves.
    ...TOOLS.map((tool) => ({ path: `/${tool.slug}`, changefreq: 'monthly', priority: '0.8' })),
  ]

  // Escape the only characters that are not legal unescaped in XML. The site
  // URL comes from an environment variable, so this is a real (if unlikely)
  // injection point rather than a theoretical one.
  const escapeXml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    entries
      .map((entry) => {
        const loc = escapeXml(`${SITE_URL}${entry.path}`)
        const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''
        return (
          `<url><loc>${loc}</loc>` +
          `${lastmod}` +
          `<changefreq>${entry.changefreq}</changefreq>` +
          `<priority>${entry.priority}</priority></url>`
        )
      })
      .join('') +
    `</urlset>`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
