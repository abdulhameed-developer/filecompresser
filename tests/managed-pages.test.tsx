import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ManagedPageSections from '@/components/ManagedPageSections'
import { getManagedPage, MANAGED_PAGE_SLUGS, managedDateLabel, managedPageMetadata, parseManagedPage, type ManagedPageSlug } from '@/lib/managed-pages'

const document = () => ({ title: 'Useful help', introduction: 'Start with your file format.', seoTitle: 'File help', seoDescription: 'Helpful file troubleshooting.', sections: [] })

describe('managed information pages', () => {
  it('loads every supported page from editable content with independent search metadata', () => {
    expect(MANAGED_PAGE_SLUGS).toEqual(['about', 'contact', 'privacy', 'terms', 'disclaimer', 'blog'])
    for (const slug of MANAGED_PAGE_SLUGS) {
      const page = getManagedPage(slug)
      expect(page.title.trim()).not.toBe('')
      expect(page.seoDescription.trim()).not.toBe('')
      const metadata = managedPageMetadata(slug)
      expect(String(metadata.alternates?.canonical)).toMatch(new RegExp(`/${slug}$`))
      expect(metadata.description).toBe(page.seoDescription)
    }
  })

  it('cannot read arbitrary filesystem paths or create arbitrary public documents', () => {
    expect(() => getManagedPage('../package' as ManagedPageSlug)).toThrow('unknown page')
    expect(() => getManagedPage('another-page' as ManagedPageSlug)).toThrow('unknown page')
  })

  it('keeps current factual content and layout groups after migration', () => {
    expect(getManagedPage('about').sections.filter(section => section.placement === 'card')).toHaveLength(3)
    const contact = getManagedPage('contact')
    expect(contact.sections.filter(section => section.placement === 'card')).toHaveLength(4)
    expect(contact.sections.at(-1)?.body.join(' ')).toContain('does not offer a file-submission form or advertise a monitored support mailbox')
    const privacy = getManagedPage('privacy')
    expect(privacy.sections.find(section => section.heading === 'Administrator accounts and editorial content')?.body.join(' ')).toContain('TinaCloud')
    expect(privacy.updated).toBe('2026-11-21')
    expect(managedDateLabel(privacy.updated!)).toBe('21 November 2026')
  })

  it('fails a build for missing required metadata or malformed review dates', () => {
    expect(() => parseManagedPage({ ...document(), seoTitle: '' }, 'page')).toThrow('seoTitle')
    expect(() => parseManagedPage({ ...document(), updated: '2026-02-30' }, 'page')).toThrow('real YYYY-MM-DD')
    expect(() => parseManagedPage({ ...document(), sections: 'paragraph' }, 'page')).toThrow('expected a list')
    expect(() => parseManagedPage({ ...document(), sections: [{ heading: 'Help', placement: 'script' }] }, 'page')).toThrow('display style')
  })

  it.each(['javascript:alert(1)', '//outside.example', 'http://outside.example', 'https://name:secret@outside.example', '/safe\\unsafe', '/line\nbreak'])('rejects unsafe editorial link %s', href => {
    expect(() => parseManagedPage({ ...document(), introCta: { label: 'Open', href } }, 'page')).toThrow('link')
  })

  it('accepts useful site-relative and HTTPS links while keeping editorial text escaped', () => {
    const page = parseManagedPage({ ...document(), sections: [{
      heading: '<script>alert(1)</script>', body: ['<img src=x onerror=alert(1)>'], items: ['A genuine list item'], links: [{ label: 'The guide', href: '/blog/choosing-a-compression-mode#section-1' }, { label: 'Reference', href: 'https://example.org/guide' }],
    }] }, 'page')
    const html = renderToStaticMarkup(<ManagedPageSections sections={page.sections} />)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<script>')
    expect(html).toContain('href="/blog/choosing-a-compression-mode#section-1"')
    expect(html).toContain('<li>A genuine list item</li>')
  })
})
