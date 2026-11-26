import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ToolWorkspace from '@/components/ToolWorkspace'
import ToolGuide from '@/components/ToolGuide'
import {
  allToolSlugs,
  canonicalSlug,
  getTool,
  relatedTools,
} from '@/lib/tools'
import { pageMetadata, breadcrumbJsonLd, faqJsonLd, jsonLdScript, toolJsonLd } from '@/lib/seo'
import Icon from '@/components/Icon'
import EditorialContent from '@/components/EditorialContent'
import { InlineEditorialText } from '@/components/EditorialText'
import { getToolContent, resolveEditorialFaq } from '@/lib/content'

export function generateStaticParams() {
  return [...allToolSlugs(), 'wav-to-mp3'].map((tool) => ({ tool }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>
}): Promise<Metadata> {
  const { tool: slug } = await params
  const tool = getTool(slug)

  // A 404 must not be indexable and must not advertise itself as a tool page.
  if (!tool) {
    return {
      title: 'Tool not found',
      robots: { index: false, follow: true },
    }
  }

  const content = getToolContent(tool.slug)
  const title = content.seoTitle ?? tool.seoTitle ?? `${tool.title} — Free, Private & Browser-Based`
  const description =
    content.seoDescription ?? tool.seoDescription ??
    `${tool.description} Runs entirely on your device — no upload, no account, no sign-up.`

  // Alias slugs canonicalise to the primary tool so we do not index duplicates.

  return pageMetadata({ title, description, path: `/${canonicalSlug(slug)}` })
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params
  const tool = getTool(slug)
  if (!tool) notFound()

  const canonical = canonicalSlug(slug)
  const isAlias = canonical !== slug
  const content = getToolContent(tool.slug)
  const faq = resolveEditorialFaq(content, tool.faq ?? [])
  const related = content.relatedTools.length ? content.relatedTools.map(slug => getTool(slug)!).filter(other => other.slug !== tool.slug) : relatedTools(tool)

  const structuredData = [
    toolJsonLd(tool),
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: tool.title, path: `/${tool.slug}` },
    ]),
    ...(faq?.length ? [faqJsonLd(faq)] : []),
  ]


  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <div className="toolPage">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link prefetch={false} href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{tool.title}</span>
        </nav>

        <div className="sectionLabel">
          {tool.privacyClientSide ? 'PRIVATE BROWSER TOOL' : 'BROWSER TOOL'}
        </div>
        <h1>{tool.title}</h1>
        <p className="toolIntro">{tool.description}</p>


        {isAlias && (
          <p className="aliasNotice">
            This URL is an alias for <Link prefetch={false} href={`/${canonical}`}>{tool.title}</Link>. Both
            addresses run the same tool.
          </p>
        )}

        <ToolWorkspace tool={tool} />

        <EditorialContent content={content} />

        <ToolGuide tool={tool} />

        {faq && faq.length > 0 && (
          <section className="faq" aria-labelledby="faq-heading">
            <h2 id="faq-heading">Frequently asked questions</h2>
            {faq.map((entry) => (
              <details key={entry.q}>
                <summary><span>{entry.q}</span><Icon name="chevron" /></summary>
                <p><InlineEditorialText value={entry.a} /></p>
              </details>
            ))}
          </section>
        )}

        <nav className="relatedTools" aria-labelledby="related-heading">
          <h2 id="related-heading">Related tools</h2>
          <ul>
            {related.map((other) => (
              <li key={other.slug}>
                <Link prefetch={false} href={`/${other.slug}`}>
                  <span>{other.title}</span><Icon name="arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
