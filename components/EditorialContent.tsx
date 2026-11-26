import type { EditorialContent as Content } from '@/lib/content'
import Link from 'next/link'

/** Render a deliberately tiny, validated link syntax. Raw HTML is never injected. */
function inlineText(value: string, keyPrefix: string) {
  const parts = value.split(/(\[[^\]\n]{1,120}\]\((?:\/[^\s)]+|https:\/\/[^\s)]+)\))/g)
  return parts.map((part, index) => {
    const match = part.match(/^\[([^\]]+)\]\((\/[^\s)]+|https:\/\/[^\s)]+)\)$/)
    if (!match) return <span key={`${keyPrefix}-text-${index}`}>{part}</span>
    const [ , label, href ] = match
    const external = href.startsWith('https://')
    return external
      ? <a key={`${keyPrefix}-link-${index}`} href={href} rel="noreferrer">{label}</a>
      : <Link key={`${keyPrefix}-link-${index}`} href={href}>{label}</Link>
  })
}

function RichText({ value, className }: { value: string; className?: string }) {
  return <>{value.split(/\n/).map((line, index) => <span className={className} key={index}>{index > 0 && <br />}{inlineText(line, String(index))}</span>)}</>
}

export default function EditorialContent({ content }: { content: Content }) {
  return (
    <section className="editorialContent" aria-labelledby="editorial-heading">
      <h2 id="editorial-heading">{content.heading}</h2>
      <p><RichText value={content.introduction} /></p>
      {content.sections.map((section, index) => (
        <section key={index}>
          <h3>{section.heading}</h3>
          {section.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => <p key={i}><RichText value={paragraph} /></p>)}
        </section>
      ))}
      {content.links.length > 0 && <nav aria-label="Further guidance"><ul>{content.links.map((link, i) => <li key={i}><Link href={link.href}>{link.label}</Link></li>)}</ul></nav>}
    </section>
  )
}
