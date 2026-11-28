/** Build-time settings only. Keep this module out of Client Components. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { assertEditorialVocabulary } from './editorial-vocabulary.mjs'
import { safeSiteProfileHref, safeSocialImagePath, siteIdentityText } from './editorial-constraints.mjs'

export interface SiteSettings {
  siteName: string
  wordmark: string
  tagline: string
  titleSuffix: string
  defaultDescription: string
  organizationName: string
  socialImage: string
  socialImageAlt: string
  sameAs: string[]
  supportEmail?: string
}

/** A plain mailbox only; mailto headers and encoded control input are refused. */
export function parseSupportEmail(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid support email: use one plain email address.')
  const address = value.trim()
  if (!address) return undefined
  const parts = address.split('@')
  if (address.length > 254 || parts.length !== 2) throw new Error('Invalid support email: use one plain email address.')
  const [local, domain] = parts
  if (!/^[a-zA-Z0-9._+-]{1,64}$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
    !domain.includes('.') || domain.split('.').some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) {
    throw new Error('Invalid support email: use one plain email address without links or message headers.')
  }
  return `${local}@${domain.toLowerCase()}`
}

const text = siteIdentityText
export const parseSocialImage = safeSocialImagePath

export function parseSiteSettings(value: unknown): SiteSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Site settings must be a JSON object.')
  const input = value as Record<string, unknown>
  assertEditorialVocabulary(input, 'settings/site')
  if (input.sameAs !== undefined && !Array.isArray(input.sameAs)) throw new Error('Site sameAs must be a list of verified profile URLs.')
  const sameAs = ((input.sameAs ?? []) as unknown[]).map(safeSiteProfileHref)
  // Deliberately select editorial fields. Canonical origins, indexing, provider
  // credentials and verification values are never read from CMS content.
  return {
    siteName: text(input.siteName, 'siteName', 80),
    wordmark: text(input.wordmark, 'wordmark', 80),
    tagline: text(input.tagline, 'tagline', 140),
    titleSuffix: text(input.titleSuffix, 'titleSuffix', 80),
    defaultDescription: text(input.defaultDescription, 'defaultDescription', 350),
    organizationName: text(input.organizationName, 'organizationName', 120),
    socialImage: parseSocialImage(input.socialImage),
    socialImageAlt: text(input.socialImageAlt, 'socialImageAlt', 250),
    sameAs,
    supportEmail: parseSupportEmail(input.supportEmail),
  }
}

export function getSiteSettings(): SiteSettings {
  const filename = path.join(process.cwd(), 'content/settings/site.json')
  const settings = parseSiteSettings(JSON.parse(readFileSync(filename, 'utf8')) as unknown)
  if (settings.socialImage !== '/opengraph-image' && !existsSync(path.join(process.cwd(), 'public', settings.socialImage.slice(1)))) {
    throw new Error('The configured social image does not exist in public/. Upload it before publishing.')
  }
  return settings
}

/** Verification codes are public tokens, never full HTML tags or script. */
export function verificationToken(value: string | undefined, name: string): string | undefined {
  if (!value?.trim()) return undefined
  if (!/^[a-zA-Z0-9._-]{6,200}$/.test(value.trim())) throw new Error(`${name} must contain only the verification token, not HTML.`)
  return value.trim()
}
