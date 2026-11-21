/** Build-time settings only. Keep this module out of Client Components. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

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
}

function text(value: unknown, key: string, maximum = 250): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`Invalid site setting ${key}: enter plain text up to ${maximum} characters.`)
  }
  return value.trim()
}

export function parseSocialImage(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\?#%\s]/.test(value) || value.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Invalid site setting socialImage: use an image path on this site.')
  }
  if (value !== '/opengraph-image' && !/^\/(?:uploads|blog)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|avif|gif)$/i.test(value)) {
    throw new Error('Invalid site setting socialImage: use /opengraph-image or an image in /uploads/ or /blog/.')
  }
  return value
}

export function parseSiteSettings(value: unknown): SiteSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Site settings must be a JSON object.')
  const input = value as Record<string, unknown>
  if (typeof input.titleSuffix === 'string' && input.titleSuffix.includes('%')) throw new Error('Site titleSuffix is plain brand text, not a template.')
  if (input.sameAs !== undefined && !Array.isArray(input.sameAs)) throw new Error('Site sameAs must be a list of verified profile URLs.')
  const sameAs = ((input.sameAs ?? []) as unknown[]).map(value => {
    if (typeof value !== 'string') throw new Error('Site profiles must be HTTPS URLs.')
    let url: URL
    try { url = new URL(value) } catch { throw new Error('Site profiles must be HTTPS URLs.') }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Site profiles must be HTTPS URLs without credentials.')
    return url.href
  })
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
