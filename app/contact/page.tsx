import Link from 'next/link'
import Icon from '@/components/Icon'
import ManagedPageSections, { ManagedSectionBody } from '@/components/ManagedPageSections'
import { getManagedPage, managedPageMetadata } from '@/lib/managed-pages'
import { breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'
import { getSiteSettings } from '@/lib/site-settings'
import SupportEmailLink from '@/components/SupportEmailLink'

const page = getManagedPage('contact')
export const metadata = managedPageMetadata('contact')
const structuredData = [
  webPageJsonLd({ name: 'Contact filecompresser', description: page.seoDescription, path: '/contact', dateModified: page.updated }),
  breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }]),
]

export default function ContactPage() {
  const { supportEmail } = getSiteSettings()
  const cards = page.sections.filter(section => section.placement === 'card')
  const details = page.sections.filter(section => section.placement === 'detail')
  return <div className="productPage helpPage">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }} />
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Contact</span></nav>
    <div className="productIntro"><span className="sectionLabel">{page.label}</span><h1>{page.title}</h1><p>{page.introduction}</p>{page.introCta && <Link className="primaryAction" href={page.introCta.href}>{page.introCta.label}<Icon name="arrow" /></Link>}</div>
    {supportEmail && <section className="reportGuidance" aria-labelledby="support-contact-heading"><div><h2 id="support-contact-heading">Contact FileCompresser Support</h2><p>Email <SupportEmailLink email={supportEmail} editorial /> about a tool or website issue.</p><p>Include the tool name, your browser and the error message. Please do not email private files.</p></div></section>}
    <div className="helpGrid">{cards.map((section, i) => <section key={i}>{section.icon && <Icon name={section.icon} />}<h2>{section.heading}</h2><ManagedSectionBody section={section} />{section.links.map((link, j) => <Link key={j} href={link.href}>{link.label}</Link>)}</section>)}</div>
    {details.map((section, i) => <section className="reportGuidance" key={i}>{section.icon && <Icon name={section.icon} />}<div><h2>{section.heading}</h2><ManagedSectionBody section={section} /><div className="inlineActions">{section.links.map((link, j) => <Link className="tertiaryAction" href={link.href} key={j}>{link.label}<Icon name="arrow" /></Link>)}</div></div></section>)}
    <ManagedPageSections sections={page.sections.filter(section => section.placement === 'text')} />
    {page.support && <div className="supportStrip"><Icon name="file" /><p>{page.support.text}<br /><strong>{page.support.emphasis}</strong></p><Link className="tertiaryAction" href={page.support.link.href}>{page.support.link.label}<Icon name="arrow" /></Link></div>}
  </div>
}
