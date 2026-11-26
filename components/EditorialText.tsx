import { createElement, Fragment } from 'react'
import Link from 'next/link'
import { parseEditorialHtml, safeEditorialHref, splitEditorialLinks, type EditorialNode } from '@/lib/editorial-markup'

/** Inline Markdown links remain useful inside paragraphs, lists and tables. */
export function InlineEditorialText({ value }: { value: string }) {
  const parts = splitEditorialLinks(value)
  return <>{parts.map((part, i) => {
    if (typeof part === 'string') return <Fragment key={i}>{part}</Fragment>
    try { return <Link className="editorialLink" key={i} href={safeEditorialHref(part.href)}>{part.label}</Link> }
    catch { return <Fragment key={i}>{part.source}</Fragment> }
  })}</>
}

export function EditorialHtml({ value }: { value: string }) {
  const render = (nodes: EditorialNode[], prefix: string, literalLinks = false): React.ReactNode[] => nodes.map((node, i) => {
    const key = `${prefix}-${i}`
    if (typeof node === 'string') return literalLinks ? <Fragment key={key}>{node}</Fragment> : <InlineEditorialText key={key} value={node} />
    if (node.tag === 'a') return <Link className="editorialLink" key={key} href={node.href!}>{render(node.children, key, true)}</Link>
    return createElement(node.tag, { key }, node.tag === 'br' ? undefined : render(node.children, key, literalLinks || node.tag === 'code'))
  })
  return <>{render(parseEditorialHtml(value), 'html')}</>
}
