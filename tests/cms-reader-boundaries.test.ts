import { describe, expect, it } from 'vitest'
import { collections } from '../tina/collections.mjs'
import { SITE_TEXT_LIMITS, safeEditorialImagePath, safeSiteProfileHref, safeSocialImagePath } from '../lib/editorial-constraints.mjs'
import { parsePublishedPost, parseEditorialContent } from '@/lib/content'
import { getSiteSettings, parseSiteSettings } from '@/lib/site-settings'
import { parseManagedPage } from '@/lib/managed-pages'

type Collection = { name: string; ui: { beforeSubmit: (args: { values: Record<string, unknown> }) => Promise<unknown> } }
const submit = (name: string, values: Record<string, unknown>) => (collections as unknown as Collection[]).find(c => c.name === name)!.ui.beforeSubmit({ values })
const post = { published: true, archived: false, title: 'A useful guide', description: 'Review a copy.', date: '2026-09-04', updated: '2026-11-28', readingTime: '4 min', figure: 'pipeline', body: [{ _template: 'p', text: 'Keep a source.' }] }
const tool = { heading: 'Tool guide', introduction: 'Choose a file.' }
const managed = { title: 'About', seoTitle: 'About', seoDescription: 'A useful page.', sections: [] }
const settings = getSiteSettings()

describe('reader and CMS share image and identity syntax boundaries', () => {
  it.each(['https://example.com/a.png', '//example.com/a.png', '/uploads/a.svg', '/uploads/../a.png', '/uploads/.hidden.png', '/uploads/a.png?x=1', '/uploads/a.png#x', '/uploads/a%00.png', '/uploads/%2e%2e/a.png', '/uploads/a%5Cb.png', '/uploads/a%ZZ.png', '/blog/a.png'])('rejects the same invalid featured/body image path before Save and rendering: %s', async src => {
    expect(() => safeEditorialImagePath(src)).toThrow()
    for (const values of [{ ...post, featuredImage: { src, alt: 'A drawing.' } }, { ...post, body: [{ _template: 'image', src, alt: 'A drawing.' }] }]) {
      expect(() => parsePublishedPost(values, 'guide')).toThrow()
      await expect(submit('post', values)).rejects.toThrow(/image|uploads/i)
    }
  })

  it.each(['/uploads/art.png', '/uploads/white space.JPG', '/uploads/nested/تصویر.webp', '/uploads/already%20encoded.avif', '/uploads/animation.gif'])('keeps supported raster filenames, encoding and source values: %s', async src => {
    const values = { ...post, featuredImage: { src, alt: 'A drawing.' } }
    expect(parsePublishedPost(values, 'guide')!.featuredImage!.src).toBe(safeEditorialImagePath(src))
    await expect(submit('post', values)).resolves.toBe(values)
    expect(values.featuredImage.src).toBe(src)
  })

  it.each(['javascript:alert(1)', 'http://example.com', 'https://name:secret@example.com', '//example.com', 'invalid', ''])('rejects an invalid official profile before Save and rendering: %s', async url => {
    const values = { ...settings, sameAs: [url] }
    expect(() => safeSiteProfileHref(url)).toThrow()
    expect(() => parseSiteSettings(values)).toThrow()
    await expect(submit('siteSettings', values)).rejects.toThrow()
  })

  it.each(['https://example.com/profile', 'https://github.com/example', 'https://example.com/name?section=files#about'])('keeps HTTPS official-profile URL semantics: %s', async url => {
    const values = { ...settings, sameAs: [url] }
    expect(parseSiteSettings(values).sameAs).toEqual([safeSiteProfileHref(url)])
    await expect(submit('siteSettings', values)).resolves.toBe(values)
  })

  it.each(['https://example.com/a.png', '//example.com/a.png', '/uploads/a.svg', '/uploads/../a.png', '/uploads/a.png?x=1', '/uploads/a%20b.png', '/other/a.png', '/uploads/a b.png'])('rejects an invalid sharing-image path before Save and rendering: %s', async socialImage => {
    const values = { ...settings, socialImage }
    expect(() => safeSocialImagePath(socialImage)).toThrow()
    expect(() => parseSiteSettings(values)).toThrow()
    await expect(submit('siteSettings', values)).rejects.toThrow()
  })

  it.each(['/opengraph-image', '/uploads/art.png', '/blog/art.webp'])('keeps supported sharing-image path syntax: %s', async socialImage => {
    const values = { ...settings, socialImage }
    expect(parseSiteSettings(values).socialImage).toBe(socialImage)
    await expect(submit('siteSettings', values)).resolves.toBe(values)
  })

  it.each(Object.entries(SITE_TEXT_LIMITS))('applies the exact shared text boundary for %s', async (key, maximum) => {
    for (const invalid of ['x'.repeat(maximum + 1), 'bad\nline', 'bad\u0000value', '   ']) {
      const values = { ...settings, [key]: invalid }
      expect(() => parseSiteSettings(values)).toThrow()
      await expect(submit('siteSettings', values)).rejects.toThrow()
    }
    const values = { ...settings, [key]: 'x'.repeat(maximum) }
    expect(() => parseSiteSettings(values)).not.toThrow()
    await expect(submit('siteSettings', values)).resolves.toBe(values)
  })

  it('keeps the existing non-template title suffix rule', async () => {
    const values = { ...settings, titleSuffix: '%s | FileCompresser' }
    expect(() => parseSiteSettings(values)).toThrow('plain brand text')
    await expect(submit('siteSettings', values)).rejects.toThrow('plain brand text')
  })
})

describe('empty values preserve optional groups without permitting build-invalid text', () => {
  it.each(['seoTitle', 'seoDescription', 'category'])('rejects whitespace-only optional post %s', async key => {
    const values = { ...post, [key]: '   ' }
    expect(() => parsePublishedPost(values, 'guide')).toThrow()
    await expect(submit('post', values)).rejects.toThrow(key)
  })
  it.each(['seoTitle', 'seoDescription'])('rejects whitespace-only optional tool %s', async key => {
    const values = { ...tool, [key]: '   ' }
    expect(() => parseEditorialContent(values, 'tool')).toThrow()
    await expect(submit('toolPage', values)).rejects.toThrow(key)
  })
  it.each(['label', 'introduction'])('rejects whitespace-only optional managed-page %s', async key => {
    const values = { ...managed, [key]: '   ' }
    expect(() => parseManagedPage(values, 'about')).toThrow()
    await expect(submit('managedPage', values)).rejects.toThrow(key)
  })
  it.each([
    { ...post, author: { name: 'Editor', url: '   ' } },
    { ...post, featuredImage: { src: '/uploads/art.png', alt: 'A drawing.', caption: '   ' } },
    { ...post, body: [{ _template: 'image', src: '/uploads/art.png', alt: 'A drawing.', caption: '   ' }] },
    { ...post, body: [{ _template: 'table', caption: '   ', columns: ['A'], rows: [{ cells: ['A value'] }] }] },
  ])('rejects whitespace-only nested optional values: %j', async values => {
    expect(() => parsePublishedPost(values, 'guide')).toThrow()
    await expect(submit('post', values)).rejects.toThrow()
  })
  it('retains all-cleared optional image, author, hero, FAQ and support-email semantics', async () => {
    for (const values of [{ ...post, featuredImage: { src: ' ', alt: '\t', caption: '\n' } }, { ...post, author: { name: ' ', kind: '', url: ' ' } }]) {
      expect(() => parsePublishedPost(values, 'guide')).not.toThrow()
      await expect(submit('post', values)).resolves.toBe(values)
    }
    const home = { ...tool, hero: { lead: ' ', emphasis: ' ', description: ' ' }, faq: [{ q: ' ', a: ' ' }] }
    expect(() => parseEditorialContent(home, 'home')).not.toThrow()
    await expect(submit('homepage', home)).resolves.toBe(home)
    const values = { ...settings, supportEmail: '   ' }
    expect(parseSiteSettings(values).supportEmail).toBeUndefined()
    await expect(submit('siteSettings', values)).resolves.toBe(values)
  })
  it('rejects explicit empty FAQ/display choices but keeps optional author-kind fallback', async () => {
    await expect(submit('toolPage', { ...tool, faqMode: '' })).rejects.toThrow('faqMode')
    expect(() => parseEditorialContent({ ...tool, faqMode: '' }, 'tool')).toThrow()
    const page = { ...managed, sections: [{ heading: 'Information', placement: '' }] }
    expect(() => parseManagedPage(page, 'about')).toThrow()
    await expect(submit('managedPage', page)).rejects.toThrow('placement')
    const values = { ...post, author: { name: 'Editor', kind: '' } }
    expect(parsePublishedPost(values, 'guide')!.author!.kind).toBe('Person')
    await expect(submit('post', values)).resolves.toBe(values)
  })
  it.each(['published', 'archived'])('rejects malformed %s values rather than treating them as drafts', async key => {
    for (const invalid of [null, 'true', 1]) {
      const values = { ...post, [key]: invalid }
      expect(() => parsePublishedPost(values, 'guide')).toThrow()
      await expect(submit('post', values)).rejects.toThrow(key)
    }
  })
  it('blocks malformed optional list/group values before backend submission, without confusing null fallbacks with empty strings', async () => {
    for (const values of [{ ...tool, sections: '' }, { ...tool, links: '' }, { ...tool, relatedTools: '' }, { ...tool, hero: '' }]) {
      expect(() => parseEditorialContent(values, 'tool')).toThrow()
      await expect(submit('hero' in values ? 'homepage' : 'toolPage', values)).rejects.toThrow()
    }
    const values = { ...settings, sameAs: null }
    expect(() => parseSiteSettings(values)).toThrow()
    await expect(submit('siteSettings', values)).rejects.toThrow('sameAs')
    const cleared = { ...tool, sections: null, links: null, relatedTools: null, hero: null }
    expect(() => parseEditorialContent(cleared, 'tool')).not.toThrow()
    await expect(submit('homepage', cleared)).resolves.toBe(cleared)
  })

})
