import Link from 'next/link'
import ManagedPageSections, { ManagedPageFooter } from './ManagedPageSections'
import { getManagedPage, managedDateLabel, type ManagedPageSlug } from '@/lib/managed-pages'
import { breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'

export default function ManagedLegalPage({ slug }: { slug: ManagedPageSlug }) {
  const page = getManagedPage(slug)
  const structuredData = [
    webPageJsonLd({ name: page.title, description: page.seoDescription, path: `/${slug}`, dateModified: page.updated }),
    breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: page.title, path: `/${slug}` }]),
  ]
  return <div className="legal">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }} />
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{page.title}</span></nav>
    <h1>{page.title}</h1>
    {page.updated && <p className="legalUpdated">Last updated: {managedDateLabel(page.updated)}</p>}
    {page.introduction && <p>{page.introduction}</p>}
    <ManagedPageSections sections={page.sections} />
    {page.footer && <ManagedPageFooter footer={page.footer} />}
  </div>
}
