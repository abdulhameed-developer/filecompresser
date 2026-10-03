import type { Metadata } from 'next'
import Link from 'next/link'
import { TOOL_GROUPS, toolsInGroup } from '@/lib/nav'

/**
 * 404.
 *
 * Rendered by the root layout, so it inherits the same header, footer and
 * navigation as every other page. It exposes no internal detail (no stack
 * traces, no route internals) and its only job is to get someone to a tool.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  description: 'That page does not exist on filecompresser. Browse the available file tools instead.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  const groups = TOOL_GROUPS.map((group) => ({ group, tools: toolsInGroup(group) })).filter(
    (entry) => entry.tools.length > 0
  )

  return (
    <div className="notFoundPage">
      <p className="notFoundCode">Error 404</p>
      <h1>That page is missing.</h1>
      <p className="notFoundLead">
        The address you followed does not exist here. Nothing is broken on your side — the link
        just points somewhere this site does not have.
      </p>

      <div className="notFoundActions">
        <Link className="navbtn" href="/">
          Back home →
        </Link>
        <Link className="navbtn secondary" href="/sitemap">
          See every tool
        </Link>
      </div>

      <nav className="notFoundTools" aria-labelledby="notfound-tools">
        <h2 id="notfound-tools">Popular tools</h2>
        {groups.map(({ group, tools }) => (
          <div key={group.key} className="notFoundGroup">
            <h3>{group.title}</h3>
            <ul>
              {tools.slice(0, 4).map((tool) => (
                <li key={tool.slug}>
                  <Link href={`/${tool.slug}`}>{tool.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
