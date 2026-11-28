import Link from 'next/link'
import type { ManagedPage, ManagedSection } from '@/lib/managed-pages'
import { InlineEditorialText } from './EditorialText'

/** Text nodes deliberately preserve safe editorial text without executing HTML. */
export function ManagedSectionBody({ section }: { section: ManagedSection }) {
  return <>
    {section.body.map((paragraph, i) => <p key={i}><InlineEditorialText value={paragraph} /></p>)}
    {section.items.length > 0 && <ul>{section.items.map((item, i) => <li key={i}><InlineEditorialText value={item} /></li>)}</ul>}
  </>
}

export default function ManagedPageSections({ sections }: { sections: ManagedSection[] }) {
  return <>{sections.map((section, i) => <section className="managedPageSection" key={i}>
    <h2 id={`page-section-${i}`} style={{ scrollMarginTop: '100px' }}>{section.heading}</h2>
    <ManagedSectionBody section={section} />
    {section.links.length > 0 && <p>{section.links.map((link, j) => <span key={j}>{j > 0 && ' · '}<Link className="editorialLink" prefetch={false} href={link.href}>{link.label}</Link></span>)}</p>}
  </section>)}</>
}

export function ManagedPageFooter({ footer }: { footer: NonNullable<ManagedPage['footer']> }) {
  return <><h2>{footer.heading}</h2><p>{footer.introduction}{' '}<Link prefetch={false} href={footer.link.href}>{footer.link.label}</Link>.</p></>
}
