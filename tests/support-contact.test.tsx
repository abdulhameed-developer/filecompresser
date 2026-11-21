import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const support = vi.hoisted(() => ({ email: 'info@filecompresser.com' as string | undefined }))
vi.mock('@/lib/site-settings', async () => {
  const original = await vi.importActual<typeof import('@/lib/site-settings')>('@/lib/site-settings')
  return { ...original, getSiteSettings: () => ({ ...original.getSiteSettings(), supportEmail: support.email }) }
})
afterEach(() => { support.email = 'info@filecompresser.com'; vi.resetModules() })

async function renderSupport(email: string | undefined) {
  support.email = email
  vi.resetModules()
  const [{ default: ContactPage }, { default: SiteFooter }, { organizationJsonLd }] = await Promise.all([
    import('@/app/contact/page'), import('@/components/SiteFooter'), import('@/lib/seo'),
  ])
  return { contact: renderToStaticMarkup(<ContactPage />), footer: renderToStaticMarkup(<SiteFooter />), organization: organizationJsonLd() }
}

describe('verified public support contact', () => {
  it('uses the configured mailbox consistently without requesting private files', async () => {
    const result = await renderSupport('info@filecompresser.com')
    expect(result.contact).toContain('href="mailto:info@filecompresser.com"')
    expect(result.contact).toContain('Please do not email private files.')
    expect(result.footer).toContain('href="mailto:info@filecompresser.com"')
    expect(result.organization).toMatchObject({ contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'info@filecompresser.com' } })
  })

  it('hides email links and contact schema when the optional mailbox is cleared', async () => {
    const result = await renderSupport(undefined)
    expect(result.contact).not.toContain('mailto:')
    expect(result.footer).not.toContain('mailto:')
    expect(result.organization).not.toHaveProperty('contactPoint')
    expect(result.footer).toContain('Help &amp; contact')
  })
})
