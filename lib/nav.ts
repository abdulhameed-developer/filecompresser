import type { ToolDefinition } from './types'
import { TOOLS } from './tools'

/**
 * The single source of truth for site navigation.
 *
 * The header, the mobile menu, the footer and the homepage category grid all
 * used to build their own link lists from ad-hoc filters over `TOOLS`. That is
 * how the three drifted apart and how footer entries ended up in the wrong
 * column. They now all read from this module, so a tool can only be added once
 * and every surface agrees about where it lives.
 *
 * Design note: this must stay server-safe. No `'use client'`, no DOM.
 */

export interface ToolGroup {
  key: string
  title: string
  blurb: string
  icon: string
  categories: string[]
}

/** Same three groups as the homepage grid and the header dropdown. */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    key: 'image',
    title: 'Images',
    blurb: 'Shrink JPG, PNG and WEBP',
    icon: '▧',
    categories: ['image'],
  },
  {
    key: 'media',
    title: 'Video & Audio',
    blurb: 'Re-encode MP4/MOV, MP3 and WAV',
    icon: '▷',
    categories: ['video', 'audio', 'gif'],
  },
  {
    key: 'documents',
    title: 'PDF & Archives',
    blurb: 'Optimize PDFs, build and open ZIPs',
    icon: '▤',
    categories: ['pdf', 'archive'],
  },
]

export function toolsInGroup(group: ToolGroup): ToolDefinition[] {
  return TOOLS.filter((tool) => group.categories.includes(tool.category))
}

export interface SiteLink {
  href: string
  label: string
  /** One-line purpose, used as the `title` attribute on bare-icon links. */
  note?: string
}

/**
 * Every secondary page, used by the mobile menu and the header.
 */
export const SITE_LINKS: SiteLink[] = [
  { href: '/about', label: 'About', note: 'What this site is and how it works' },
  { href: '/blog', label: 'Blog', note: 'Notes on compression and privacy' },
  { href: '/privacy', label: 'Privacy Policy', note: 'How your files are handled' },
  { href: '/terms', label: 'Terms of Service', note: 'The rules for using these tools' },
  { href: '/disclaimer', label: 'Disclaimer', note: 'What we do and do not guarantee' },
  { href: '/contact', label: 'Contact', note: 'Support and security reports' },
  { href: '/sitemap', label: 'Sitemap', note: 'Every page on this site' },
]

/**
 * The footer's Site column: policy and index pages only.
 *
 * About, Blog and Contact are deliberately absent. They are already in the
 * header and the mobile menu, and a footer that repeats every header link
 * turns the bottom of the page into a second, redundant navigation — while
 * burying the legal pages, which are the ones a visitor actually scrolls to
 * the footer to find. The footer's job here is trust, not wayfinding.
 */
export const FOOTER_SITE_LINKS: SiteLink[] = SITE_LINKS.filter(
  (link) => !['/about', '/blog', '/contact'].includes(link.href)
)

export const CONTACT_EMAIL = 'hello@filecompresser.com'

/** Stable href for the contact page, so every surface links the same URL. */
export const CONTACT_HREF = '/contact'

/**
 * Footer columns.
 *
 * The tool columns mirror `TOOL_GROUPS` exactly, so the footer, the header
 * dropdown and the homepage grid all group the same tools under the same
 * headings. Every column is derived from the tool registry, so a new tool
 * appears automatically rather than being forgotten in one surface.
 */
export interface FooterColumn {
  title: string
  links: { href: string; label: string; description?: string }[]
}

export function footerColumns(): FooterColumn[] {
  return [
    ...TOOL_GROUPS.map((group) => ({
      title: group.title,
      links: toolsInGroup(group).map((tool) => ({
        href: `/${tool.slug}`,
        label: tool.title,
        description: tool.description,
      })),
    })),
    {
      title: 'Legal',
      links: FOOTER_SITE_LINKS.map((link) => ({
        href: link.href,
        label: link.label,
        description: link.note,
      })),
    },
  ]
}
