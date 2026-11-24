import type { Metadata } from 'next'
import Link from 'next/link'
import { postsByDate } from '@/lib/blog'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'
import { TOOL_GROUPS, toolsInGroup } from '@/lib/nav'
import Icon from '@/components/Icon'

const DESCRIPTION = 'Every tool on filecompresser, grouped by type.'

export const metadata: Metadata = {
  title: 'Sitemap',
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/sitemap') },
}

const structuredData = [
  webPageJsonLd({ name: 'Sitemap', description: DESCRIPTION, path: '/sitemap' }),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Sitemap', path: '/sitemap' },
  ]),
]

const PAGES = [
  { href: '/', label: 'Home', description: 'Compress any file, and browse every tool.' },
  { href: '/about', label: 'About', description: 'What this site is and how it works.' },
  { href: '/blog', label: 'Blog', description: 'Notes on compression, formats and privacy.' },
  { href: '/privacy', label: 'Privacy Policy', description: 'How your files are handled.' },
  { href: '/terms', label: 'Terms of Service', description: 'The rules for using these tools.' },
  {
    href: '/disclaimer',
    label: 'Disclaimer',
    description: 'What we do and do not guarantee about results.',
  },
  { href: '/contact', label: 'Contact', description: 'Processing and download troubleshooting.' },
  { href: '/sitemap.xml', label: 'sitemap.xml', description: 'The machine-readable sitemap.' },
]

export default function SitemapPage() {
  return <div className="productPage siteMapIndex">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }} />
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Sitemap</span></nav>
    <div className="productIntro"><span className="sectionLabel">FIND YOUR WAY</span><h1>Every tool. Every guide.</h1><p>A quick route to the file task or information you need.</p></div>
    <div className="siteMapGrid">
      {TOOL_GROUPS.map(group => <nav className="mapGroup" key={group.key} aria-label={group.title}><h2><Icon name={group.key === 'image' ? 'image' : group.key === 'media' ? 'media' : 'archive'} />{group.title}</h2><ul>{toolsInGroup(group).map(tool => <li key={tool.slug}><Link href={`/${tool.slug}`}><span>{tool.title}</span><Icon name="arrow" /></Link></li>)}</ul></nav>)}
      <nav className="mapGroup" aria-label="Site pages"><h2><Icon name="file" />Product & information</h2><ul>{PAGES.map(page => <li key={page.href}><Link href={page.href}><span>{page.label}</span><Icon name="arrow" /></Link></li>)}</ul></nav>
      <nav className="mapGroup mapGuides" aria-label="File guides"><h2><Icon name="file" />File guides</h2><ul>{postsByDate().map(post => <li key={post.slug}><Link href={`/blog/${post.slug}`}><span>{post.title}</span><Icon name="arrow" /></Link></li>)}</ul></nav>
    </div>
  </div>
}
