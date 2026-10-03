import type { Metadata } from 'next'
import Link from 'next/link'
import { TOOLS } from '@/lib/tools'
import { BLOG_POSTS } from '@/lib/blog'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'
import type { ToolCategory } from '@/lib/types'

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

const GROUPS: { key: ToolCategory; title: string; blurb: string }[] = [
  {
    key: 'image',
    title: 'Image compression',
    blurb: 'Shrink JPG, PNG and WEBP images.',
  },
  {
    key: 'video',
    title: 'Video compression',
    blurb: 'Re-encode MP4 and MOV video to a web-playable H.264 MP4.',
  },
  {
    key: 'audio',
    title: 'Audio',
    blurb: 'Re-encode MP3, and turn WAV into a smaller MP3.',
  },
  { key: 'gif', title: 'GIF optimization', blurb: 'Re-quantize animated GIF frames.' },
  { key: 'pdf', title: 'PDF', blurb: 'Optimize PDFs for delivery.' },
  { key: 'archive', title: 'ZIP archives', blurb: 'Create ZIPs and extract them safely.' },
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
  { href: '/contact', label: 'Contact', description: 'Support, feedback and security reports.' },
  { href: '/sitemap.xml', label: 'sitemap.xml', description: 'The machine-readable sitemap.' },
]

export default function SitemapPage() {
  const grouped = new Map<string, typeof TOOLS>()
  for (const tool of TOOLS) {
    const list = grouped.get(tool.category) ?? []
    list.push(tool)
    grouped.set(tool.category, list)
  }

  return (
    <div className="legal sitemapPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Sitemap</span>
      </nav>

      <h1>Sitemap</h1>
      <p className="legalUpdated">
        Every page on filecompresser. The machine-readable version is at{' '}
        <a href="/sitemap.xml">/sitemap.xml</a>.
      </p>

      <h2>Site pages</h2>
      <ul className="sitemapList">
        {PAGES.map((page) => (
          <li key={page.href}>
            <Link href={page.href}>{page.label}</Link>
            <span>{page.description}</span>
          </li>
        ))}
      </ul>

      {GROUPS.map((group) => {
        const tools = grouped.get(group.key)
        if (!tools?.length) return null
        return (
          <section key={group.key}>
            <h2>{group.title}</h2>
            <p className="sitemapBlurb">{group.blurb}</p>
            <ul className="sitemapList">
              {tools.map((tool) => (
                <li key={tool.slug}>
                  <Link href={`/${tool.slug}`}>{tool.title}</Link>
                  <span>{tool.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <section>
        <h2>Blog</h2>
        <p className="sitemapBlurb">Notes on how these tools actually work.</p>
        <ul className="sitemapList">
          {BLOG_POSTS.map((post) => (
            <li key={post.slug}>
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              <span>{post.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
