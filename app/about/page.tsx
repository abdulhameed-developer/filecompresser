import { Fragment } from 'react'
import Link from 'next/link'
import Icon from '@/components/Icon'
import ProcessingStory from '@/components/ProcessingStory'
import ManagedPageSections, { ManagedSectionBody } from '@/components/ManagedPageSections'
import { getManagedPage, managedPageMetadata } from '@/lib/managed-pages'
import { breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'

export function generateMetadata() { return managedPageMetadata('about') }

export default function AboutPage() {
  const page = getManagedPage('about')
  const structuredData = [
    webPageJsonLd({ name: 'About filecompresser', description: page.seoDescription, path: '/about', dateModified: page.updated }),
    breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]),
  ]
  const cards = page.sections.filter(section => section.placement === 'card')
  const details = page.sections.filter(section => section.placement === 'detail')
  return <div className="productPage aboutPage">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }} />
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">About</span></nav>
    <div className="productIntro"><span className="sectionLabel">{page.label}</span><h1>{page.title.split('\n').map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</h1><p>{page.introduction}</p>{page.introCta && <Link className="primaryAction" href={page.introCta.href}>{page.introCta.label}<Icon name="arrow" /></Link>}</div>
    <div className="principleGrid">{cards.map((section, i) => <section key={i}>{section.icon && <Icon name={section.icon} />}<h2>{section.heading}</h2><ManagedSectionBody section={section} />{section.links.map((link, j) => <Link key={j} href={link.href}>{link.label}</Link>)}</section>)}</div>
    <ProcessingStory />
    {details.map((section, i) => <section className="productLimits" key={i}><div>{section.label && <span className="sectionLabel">{section.label}</span>}<h2>{section.heading}</h2></div><div><ManagedSectionBody section={section} /><div className="inlineActions">{section.links.map((link, j) => <Link className="tertiaryAction" key={j} href={link.href}>{link.label}<Icon name="arrow" /></Link>)}</div></div></section>)}
    <ManagedPageSections sections={page.sections.filter(section => section.placement === 'text')} />
    {page.support && <div className="supportStrip"><Icon name="file" /><p>{page.support.text}<br /><strong>{page.support.emphasis}</strong></p><Link className="tertiaryAction" href={page.support.link.href}>{page.support.link.label}<Icon name="arrow" /></Link></div>}
  </div>
}
