import type { EditorialContent as Content } from '@/lib/content'
import Link from 'next/link'

/** React escapes editorial text; the editor cannot inject HTML or scripts. */
export default function EditorialContent({ content }: { content: Content }) {
  return (
    <section className="editorialContent" aria-labelledby="editorial-heading">
      <h2 id="editorial-heading">{content.heading}</h2>
      <p>{content.introduction}</p>
      {content.sections.map((section, index) => (
        <section key={index}>
          <h3>{section.heading}</h3>
          {section.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </section>
      ))}
      {content.links.length > 0 && <nav aria-label="Further guidance"><ul>{content.links.map((link, i) => <li key={i}><Link href={link.href}>{link.label}</Link></li>)}</ul></nav>}
    </section>
  )
}
