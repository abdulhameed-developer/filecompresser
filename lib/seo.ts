import type { FaqEntry, ToolDefinition } from './types'

export const SITE_NAME = 'FileCompresser'
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://filecompresser.com'
export const SITE_TAGLINE = 'Private, browser-based file compression and conversion'
export const DEFAULT_DESCRIPTION =
  'Compress and convert images, video, audio, GIF, PDF and ZIP files directly in your browser. Processing runs on your device — files are never uploaded.'

/** Brand is rendered lowercase in the UI, but title-cased for search results. */
export const SITE_WORDMARK = 'filecompresser'

export function absoluteUrl(path = '/'): string {
  if (path.startsWith('http')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function toolJsonLd(tool: ToolDefinition) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.title,
    description: tool.description,
    url: absoluteUrl(`/${tool.slug}`),
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any (modern web browser)',
    browserRequirements: 'Requires JavaScript and a modern browser (Chrome, Edge, Firefox or Safari).',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  }
}

export function faqJsonLd(faq: FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_WORDMARK,
    alternateName: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    inLanguage: 'en',
  }
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    // Points at a file that exists, so the logo is resolvable by crawlers.
    logo: absoluteUrl('/icon-192.png'),
  }
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  }
}

/**
 * A truthful `WebPage` for the site's own utility pages (privacy, terms,
 * disclaimer, contact, sitemap).
 *
 * These are real, indexable documents about the product, so `WebPage` is the
 * correct type — but there is no author to attribute, no FAQ to mark up and no
 * product to describe, so nothing else is claimed. Inventing ratings, review
 * counts or an author identity here would be a fabrication, not enrichment.
 */
export function webPageJsonLd(page: {
  name: string
  description: string
  path: string
  dateModified?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.name,
    description: page.description,
    url: absoluteUrl(page.path),
    isPartOf: { '@type': 'WebSite', name: SITE_WORDMARK, url: SITE_URL },
    inLanguage: 'en',
    ...(page.dateModified ? { dateModified: page.dateModified } : {}),
  }
}

/** The last date these policy documents were meaningfully reviewed. */
export const POLICY_REVIEWED = '2026-10-01'

/**
 * Serialise JSON-LD for a `<script>` tag.
 *
 * The `<` escape is the one that matters: without it, a string containing
 * `</script>` inside any JSON value would terminate the tag early and let page
 * content escape into executable markup.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}