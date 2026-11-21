import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSiteSettings, parseSiteSettings, parseSupportEmail, verificationToken } from '@/lib/site-settings'
import { siteSettingsCollection } from '../tina/site-settings.mjs'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('safe editorial site settings', () => {
  it('loads the current identity and verified support mailbox', () => {
    const settings = getSiteSettings()
    expect(settings.siteName).toBe('FileCompresser')
    expect(settings.socialImage).toBe('/opengraph-image')
    expect(settings.sameAs).toEqual([])
    expect(settings).not.toHaveProperty('email')
    expect(settings.supportEmail).toBe('info@filecompresser.com')
  })

  it('does not accept canonical, indexing or credential controls from content', async () => {
    const settings = parseSiteSettings({ ...getSiteSettings(), canonicalBaseUrl: 'https://other.invalid', indexing: true, token: 'ignored' })
    expect(settings).not.toHaveProperty('canonicalBaseUrl')
    expect(settings).not.toHaveProperty('indexing')
    expect(settings).not.toHaveProperty('token')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://filecompresser.com')
    vi.stubEnv('NEXT_PUBLIC_ENABLE_INDEXING', 'false')
    const seo = await import('@/lib/seo')
    expect(seo.SITE_URL).toBe('https://filecompresser.com')
    expect(seo.SITE_INDEXABLE).toBe(false)
  })

  it.each(['//other.invalid/image.png', 'javascript:alert(1)', '/uploads/../secret.png', '/uploads/image.svg', '/uploads/file.png?remote=1'])('refuses unsafe sharing image %s', image => {
    expect(() => parseSiteSettings({ ...getSiteSettings(), socialImage: image })).toThrow('socialImage')
  })

  it('accepts official HTTPS profiles and rejects executable links or credentials', () => {
    expect(parseSiteSettings({ ...getSiteSettings(), sameAs: ['https://example.com/profile'] }).sameAs).toEqual(['https://example.com/profile'])
    expect(() => parseSiteSettings({ ...getSiteSettings(), sameAs: ['javascript:alert(1)'] })).toThrow('HTTPS')
    expect(() => parseSiteSettings({ ...getSiteSettings(), sameAs: ['https://user:password@example.com'] })).toThrow('credentials')
  })

  it('accepts verification tokens rather than arbitrary HTML', () => {
    expect(verificationToken('abcDEF_123-456', 'verification')).toBe('abcDEF_123-456')
    expect(verificationToken('', 'verification')).toBeUndefined()
    expect(() => verificationToken('<meta name="google-site-verification">', 'verification')).toThrow('not HTML')
  })

  it('supports a cleared mailbox without creating an empty mailto link', () => {
    expect(parseSupportEmail('')).toBeUndefined()
    expect(parseSupportEmail(undefined)).toBeUndefined()
    expect(parseSiteSettings({ ...getSiteSettings(), supportEmail: '' }).supportEmail).toBeUndefined()
    expect(parseSupportEmail('Support@FILECOMPRESSER.COM')).toBe('Support@filecompresser.com')
  })

  it.each(['mailto:info@filecompresser.com', 'info@filecompresser.com?subject=test', 'info@filecompresser.com\r\nBcc:other@example.com', 'info%0d%0a@example.com', 'info@example.com,other@example.com', '.info@example.com', 'info..team@example.com', 'info@example', 'info@-example.com', 'javascript:alert(1)', '\r\n'])('rejects unsafe or malformed support address %s', email => {
    expect(() => parseSupportEmail(email)).toThrow('support email')
    expect(siteSettingsCollection.fields.find(field => field.name === 'supportEmail')?.ui?.validate?.(email)).toMatch(/plain email address/)
  })
})

describe('production search configuration', () => {
  it('keeps Cloudflare preview branches unindexable even if a public flag was inherited', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://filecompresser.com')
    vi.stubEnv('NEXT_PUBLIC_ENABLE_INDEXING', 'true')
    vi.stubEnv('CF_PAGES_BRANCH', 'editorial-preview')
    vi.stubEnv('NEXT_PUBLIC_TINA_BRANCH', 'main')
    expect((await import('@/lib/seo')).SITE_INDEXABLE).toBe(false)
  })

  it('keeps social metadata complete when a page changes its title and description', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://filecompresser.com')
    const { pageMetadata } = await import('@/lib/seo')
    const metadata = pageMetadata({ title: 'Private file tools', description: 'Choose a tool for your files.', path: '/', absoluteTitle: true })
    expect(metadata.alternates?.canonical).toBe('https://filecompresser.com/')
    expect(metadata.openGraph).toMatchObject({ url: 'https://filecompresser.com/', siteName: 'FileCompresser', type: 'website', title: 'Private file tools' })
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', description: 'Choose a tool for your files.' })
  })
})
