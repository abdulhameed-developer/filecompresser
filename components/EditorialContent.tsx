import type { EditorialContent as Content } from '@/lib/content'
import Link from 'next/link'
import * as React from 'react'

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

function RichBody({ value }: { value: string }) {
  const lines = value.split(/\n/)
  const nodes: React.ReactNode[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  const flush = () => { if (list) { const List = list.type; nodes.push(<List key={`list-${nodes.length}`}>{list.items.map((item, i) => <li key={i}><RichText value={item} /></li>)}</List>); list = null } }
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol'
      if (!list || list.type !== type) { flush(); list = { type, items: [] } }
      list.items.push((bullet ?? numbered)![1])
    } else if (line.trim()) { flush(); nodes.push(<span key={`line-${nodes.length}`}><RichText value={line} /></span>) }
  }
  flush()
  return <>{nodes.map((node, i) => <React.Fragment key={i}>{i > 0 && !React.isValidElement(node) ? <br /> : null}{node}</React.Fragment>)}</>
}

export default function EditorialContent({ content }: { content: Content }) {
  return (
    <section className="editorialContent" aria-labelledby="editorial-heading">
      <h2 id="editorial-heading">{content.heading}</h2>
      <p><RichText value={content.introduction} /></p>
      {content.sections.map((section, index) => (
        <section key={index}>
          <h3>{section.heading}</h3>
          {section.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => <div className="editorialParagraph" key={i}><RichBody value={paragraph} /></div>)}
        </section>
      ))}
      {content.links.length > 0 && <nav aria-label="Further guidance"><ul>{content.links.map((link, i) => <li key={i}><Link href={link.href}>{link.label}</Link></li>)}</ul></nav>}
    </section>
  )
}
