import type { EditorialContent as Content } from '@/lib/content'
import Link from 'next/link'
import * as React from 'react'
import { hasEditorialHtml } from '@/lib/editorial-markup'
import { EditorialHtml, InlineEditorialText } from './EditorialText'

function RichText({ value, className }: { value: string; className?: string }) {
  return <>{value.split(/\n/).map((line, index) => <span className={className} key={index}>{index > 0 && <br />}<InlineEditorialText value={line} /></span>)}</>
}

function RichBody({ value }: { value: string }) {
  const lines = value.split(/\n/)
  const nodes: React.ReactNode[] = []
  let paragraph: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  const flush = () => { if (list) { const List = list.type; nodes.push(<List key={`list-${nodes.length}`}>{list.items.map((item, i) => <li key={i}><RichText value={item} /></li>)}</List>); list = null } }
  const flushParagraph = () => { if (paragraph.length) { nodes.push(<p key={`paragraph-${nodes.length}`}><RichText value={paragraph.join('\n')} /></p>); paragraph = [] } }
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (bullet || numbered) {
      flushParagraph()
      const type = bullet ? 'ul' : 'ol'
      if (!list || list.type !== type) { flush(); list = { type, items: [] } }
      list.items.push((bullet ?? numbered)![1])
    } else if (line.trim()) { flush(); paragraph.push(line) }
  }
  flush()
  flushParagraph()
  return <>{nodes}</>
}

export default function EditorialContent({ content }: { content: Content }) {
  return (
    <section className="editorialContent" aria-labelledby="editorial-heading">
      <h2 id="editorial-heading">{content.heading}</h2>
      <p><RichText value={content.introduction} /></p>
      {content.sections.length >= 5 && <nav className="editorialContents" aria-label="In this guide"><details><summary>In this guide <span>({content.sections.length} sections)</span></summary><ol>{content.sections.map((section, index) => <li key={index}><a href={`#editorial-section-${index}`}>{section.heading}</a></li>)}</ol></details></nav>}
      {content.sections.map((section, index) => (
        <section key={index}>
          <h3 id={`editorial-section-${index}`} style={{ scrollMarginTop: '100px' }}>{section.heading}</h3>
          {hasEditorialHtml(section.body) ? <div className="editorialParagraph"><EditorialHtml value={section.body} /></div> : section.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => <div className="editorialParagraph" key={i}><RichBody value={paragraph} /></div>)}
        </section>
      ))}
      {content.links.length > 0 && <nav aria-label="Further guidance"><ul>{content.links.map((link, i) => <li key={i}><Link prefetch={false} href={link.href}>{link.label}</Link></li>)}</ul></nav>}
    </section>
  )
}
