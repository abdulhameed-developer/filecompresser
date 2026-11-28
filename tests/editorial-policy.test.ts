import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PROHIBITED_EDITORIAL_TERMS, findProhibitedEditorialTerms, inspectEditorialVocabulary } from '../lib/editorial-vocabulary.mjs'
import { checkEditorialExport, checkEditorialSource } from '../scripts/check-editorial.mjs'
import { collections } from '../tina/collections.mjs'
import { editorialFieldPublicationError } from '../tina/editorial-policy.mjs'
import { parseEditorialContent, parsePublishedPost } from '@/lib/content'
import { parseManagedPage } from '@/lib/managed-pages'
import { getSiteSettings, parseSiteSettings } from '@/lib/site-settings'

const temporary: string[] = []
const directory = () => { const value = mkdtempSync(path.join(os.tmpdir(), 'filecompresser-editorial-')); temporary.push(value); return value }
afterEach(() => temporary.splice(0).forEach(value => rmSync(value, { recursive: true, force: true })))

describe('owner editorial vocabulary policy', () => {
  it.each(PROHIBITED_EDITORIAL_TERMS)('rejects a prohibited whole term without case dependence: %s', term => {
    expect(findProhibitedEditorialTerms(`A sentence: ${term.toUpperCase()}!`)).toContainEqual({ term, wordIndex: 2 })
  })

  it.each(["IN TODAY’S WORLD", 'in today&#39;s world', 'in—today’s—world', 'it’s worth noting', 'IT&#x27;S WORTH NOTING', 'game—changer', 'ever evolving'])('handles punctuation and apostrophe variation: %s', value => {
    expect(findProhibitedEditorialTerms(value)).toHaveLength(1)
  })

  it('checks safe HTML text and link labels while excluding paths and word substrings', () => {
    expect(findProhibitedEditorialTerms('<p>See <strong>valuable</strong> work.</p>')[0]?.term).toBe('valuable')
    expect(findProhibitedEditorialTerms('<robust> is displayed literally.')[0]?.term).toBe('robust')
    expect(findProhibitedEditorialTerms('ro<strong>bu</strong>st')[0]?.term).toBe('robust')
    expect(findProhibitedEditorialTerms('ro[bu](/about)st')[0]?.term).toBe('robust')
    expect(findProhibitedEditorialTerms('ro&#x62;ust')[0]?.term).toBe('robust')
    expect(findProhibitedEditorialTerms('ro\u200bbust')[0]?.term).toBe('robust')
    expect(findProhibitedEditorialTerms('in today’s <strong>world</strong>')[0]?.term).toBe("in today's world")
    expect(findProhibitedEditorialTerms('<p>ro</p><p>bust</p>')).toEqual([])
    expect(findProhibitedEditorialTerms('[Valuable guide](/blog/formats)')[0]?.term).toBe('valuable')
    expect(findProhibitedEditorialTerms('[View image](/uploads/landscape.jpg)')).toEqual([])
    expect(findProhibitedEditorialTerms('<a href="/landscape">View image</a>')).toEqual([])
    expect(findProhibitedEditorialTerms('navigateable innavigated robustness')).toEqual([])
    expect(inspectEditorialVocabulary({ featuredImage: { src: '/uploads/landscape.jpg', alt: 'Landscape photograph' } })).toEqual([{ field: 'featuredImage.alt', term: 'landscape', wordIndex: 0 }])
    expect(inspectEditorialVocabulary({ image: { url: '/uploads/landscape.jpg', caption: 'A valuable diagram' } })).toEqual([{ field: 'image.caption', term: 'valuable', wordIndex: 1 }])
  })

  it('keeps vocabulary and existing URL/markup checks active in real editor fields', () => {
    type Field = { name: string; fields?: Field[]; ui?: { validate?: (value: unknown, values?: unknown) => unknown } }
    const post = (collections as unknown as { name: string; fields: Field[] }[]).find(item => item.name === 'post')!
    const tool = (collections as unknown as { name: string; fields: Field[] }[]).find(item => item.name === 'toolPage')!
    expect(post.fields.find(item => item.name === 'title')?.ui?.validate?.('A robust tool')).toMatch(/robust/)
    const intro = tool.fields.find(item => item.name === 'introduction')!.ui!.validate!
    expect(intro('A valuable tool.')).toMatch(/valuable/)
    expect(intro('[Read](javascript:alert(1))')).toMatch(/site path|HTTPS/)
    expect(intro('Read [the guide](/blog).')).toBeUndefined()
  })

  it('guards all build readers while keeping draft posts unpublished', () => {
    expect(() => parseEditorialContent({ heading: 'A robust tool', introduction: 'Choose a file.' }, 'tool')).toThrow('tool.heading')
    expect(() => parseManagedPage({ title: 'About', seoTitle: 'About', seoDescription: 'A valuable guide', sections: [] }, 'about')).toThrow('about.seoDescription')
    expect(() => parseSiteSettings({ ...getSiteSettings(), socialImageAlt: 'A robust tool' })).toThrow('socialImageAlt')
    const post = { title: 'A robust draft', published: false }
    expect(parsePublishedPost(post, 'draft')).toBeUndefined()
    expect(() => parsePublishedPost({ ...post, published: true }, 'draft')).toThrow('draft.title')
  })

  it('reports precise published JSON fields and does not treat a draft or file path as public prose', () => {
    const root = directory()
    for (const collection of ['home', 'tools', 'pages', 'posts', 'settings']) mkdirSync(path.join(root, 'content', collection), { recursive: true })
    writeFileSync(path.join(root, 'content/posts/draft.json'), JSON.stringify({ published: false, title: 'A robust draft' }))
    writeFileSync(path.join(root, 'content/pages/about.json'), JSON.stringify({ title: 'Useful tools', featuredImage: { src: '/uploads/landscape.jpg', alt: 'A photograph' } }))
    expect(checkEditorialSource(root)).toEqual({ records: 1, violations: 0 })
    writeFileSync(path.join(root, 'content/pages/about.json'), JSON.stringify({ sections: [{ heading: 'A robust workflow' }] }))
    expect(() => checkEditorialSource(root)).toThrow('content/pages/about.json:sections[0].heading')
  })

  it('checks compiled visible text, metadata, alt and schema without reading executable scripts or attributes as prose', async () => {
    const output = directory()
    const filename = path.join(output, 'index.html')
    writeFileSync(filename, '<!doctype html><title>Useful tools</title><body><a href="/landscape">View image</a><script>const navigate = 1</script></body>')
    expect(await checkEditorialExport(output)).toEqual({ pages: 1, violations: 0 })
    for (const html of [
      '<title>A robust tool</title>',
      '<meta name="description" content="A valuable guide">',
      '<img src="/uploads/art.png" alt="A landscape">',
      '<p>It’s worth noting this.</p>',
      '<script type="application/ld+json">{"name":"A seamless tool"}</script>',
    ]) {
      writeFileSync(filename, `<!doctype html><html><head>${html}</head><body></body></html>`)
      await expect(checkEditorialExport(output)).rejects.toThrow('index.html:')
    }
  })
})

describe('cleared optional FAQ rows', () => {
  const content = { heading: 'Tool guide', introduction: 'Choose a file.' }
  const toolFields = (collections as unknown as { name: string; fields: { name: string; ui?: { validate?: (value: unknown) => unknown } }[] }[]).find(item => item.name === 'toolPage')!.fields
  const validate = (value: unknown) => editorialFieldPublicationError(toolFields.find(item => item.name === 'faq')!, value)

  it('ignores only entirely blank rows while keeping each complete entry and its order', () => {
    const faq = [{}, { q: null, a: ' ' }, { q: 'Where?', a: 'On your device.' }, { q: '', a: '' }]
    expect(parseEditorialContent({ ...content, faq }, 'tool').faq).toEqual([{ q: 'Where?', a: 'On your device.' }])
    expect(validate(faq)).toBeUndefined()
  })

  it.each([{ q: 'Where?', a: '' }, { q: '', a: 'On your device.' }, { extra: 'unfinished' }, null, 'not a group'])('rejects a partially written or malformed row in editor and reader: %j', row => {
    expect(typeof validate([row])).toBe('string')
    expect(() => parseEditorialContent({ ...content, faq: [row] }, 'tool')).toThrow()
  })
})
