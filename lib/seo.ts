import type { FaqEntry, ToolDefinition } from './types'
import type { Metadata } from 'next'
import { getSiteSettings, verificationToken } from './site-settings'

const settings = getSiteSettings()
export const SITE_NAME = settings.siteName
function siteOrigin(value: string): string {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'NEXT_PUBLIC_SITE_URL must be a plain HTTP(S) origin without credentials, path or query.',
    )
  return url.origin
}
export const SITE_URL = siteOrigin(
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
)
const cloudflarePreview = Boolean(process.env.CF_PAGES_BRANCH) &&
  process.env.CF_PAGES_BRANCH !== (process.env.NEXT_PUBLIC_TINA_BRANCH || 'main')
export const SITE_INDEXABLE = process.env.NEXT_PUBLIC_ENABLE_INDEXING === 'true' && Boolean(process.env.NEXT_PUBLIC_SITE_URL) &&
  new URL(SITE_URL).protocol === 'https:' && !cloudflarePreview &&
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(SITE_URL).hostname)
export const SITE_TAGLINE = settings.tagline
export const DEFAULT_DESCRIPTION = settings.defaultDescription

/** Brand is rendered lowercase in the UI, but title-cased for search results. */
export const SITE_WORDMARK = settings.wordmark
export const SITE_TITLE_SUFFIX = settings.titleSuffix
export const ORGANIZATION_NAME = settings.organizationName
export const DEFAULT_SOCIAL_IMAGE = settings.socialImage
export const DEFAULT_SOCIAL_IMAGE_ALT = settings.socialImageAlt
export const DEFAULT_SOCIAL_DIMENSIONS = settings.socialImage === '/opengraph-image' ? { width: 1200, height: 630 } : {}
export const DEFAULT_SITE_TITLE = `${SITE_WORDMARK} — ${SITE_TAGLINE}`
const googleVerification = verificationToken(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION, 'NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION')
const bingVerification = verificationToken(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION, 'NEXT_PUBLIC_BING_SITE_VERIFICATION')
export const SEARCH_VERIFICATION: Metadata['verification'] = {
  ...(googleVerification ? { google: googleVerification } : {}),
  ...(bingVerification ? { other: { 'msvalidate.01': bingVerification } } : {}),
}

export function absoluteUrl(path = '/'): string {
  if (path.startsWith('http')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** A complete page-specific social object avoids shallow metadata inheritance. */
export function pageMetadata(page: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const image = { url: absoluteUrl(DEFAULT_SOCIAL_IMAGE), ...DEFAULT_SOCIAL_DIMENSIONS, alt: DEFAULT_SOCIAL_IMAGE_ALT }
  return {
    title: page.absoluteTitle ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: absoluteUrl(page.path) },
    openGraph: { type: 'website', locale: 'en_US', title: page.title, description: page.description, url: absoluteUrl(page.path), siteName: SITE_NAME, images: [image] },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description, images: [image] },
    robots: { index: SITE_INDEXABLE, follow: true, googleBot: { index: SITE_INDEXABLE, follow: true, 'max-image-preview': 'large' } },
  }
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
    browserRequirements:
      'Requires JavaScript and a modern browser (Chrome, Edge, Firefox or Safari).',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  }
}

export function faqJsonLd(faq: FaqEntry[]) {
  // Semantic Schema.org description of visible content. Google discontinued
  // FAQ rich results in 2026; this markup makes no rich-result promise.
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
    '@id': absoluteUrl('/#organization'),
    name: ORGANIZATION_NAME,
    url: SITE_URL,
    // Points at a file that exists, so the logo is resolvable by crawlers.
    logo: absoluteUrl('/favicon-192.png'),
    ...(settings.sameAs.length ? { sameAs: settings.sameAs } : {}),
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
export const POLICY_REVIEWED = '2026-11-04'

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
