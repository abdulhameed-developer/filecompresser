import { describe, expect, it } from 'vitest'
import { collections } from '../tina/collections.mjs'
import { editorialFieldPublicationError } from '../tina/editorial-policy.mjs'
import { editorialCollections } from '../tina/editorial.mjs'
import { parseEditorialContent, parsePublishedPost } from '@/lib/content'
import { parseEditorialHtml } from '@/lib/editorial-markup'
import { parseEditorialHtml as editorParser } from '../lib/editorial-markup.mjs'
import { parseManagedPage } from '@/lib/managed-pages'

interface Field { name: string; ui?: { validate?: (value: unknown, values?: Record<string, unknown>) => string | undefined }; fields?: Field[]; templates?: Field[] }
const tools = editorialCollections as unknown as { name: string; fields: Field[] }[]
const posts = collections as unknown as { name: string; fields: Field[] }[]
const field = (fields: Field[], name: string) => fields.find(item => item.name === name)!
const toolFields = tools.find(item => item.name === 'toolPage')!.fields
const sectionBody = field(field(toolFields, 'sections').fields!, 'body').ui!.validate!
const introduction = field(toolFields, 'introduction').ui!.validate!
const answer = field(field(toolFields, 'faq').fields!, 'a').ui!.validate!
const templates = field(posts.find(item => item.name === 'post')!.fields, 'body').templates!
const htmlBlock = field(field(templates, 'html').fields!, 'html').ui!.validate!
const paragraph = field(field(templates, 'p').fields!, 'text').ui!.validate!
const section = (body: string) => ({ heading: 'Guide', introduction: 'Choose a file.', sections: [{ heading: 'Steps', body }] })
const post = (html: string) => ({ published: true, title: 'Guide', description: 'A useful guide.', date: '2026-11-26', readingTime: '2 min', figure: 'pipeline', body: [{ _template: 'html', html }] })
const postFields = posts.find(item => item.name === 'post')!.fields
const managedFields = posts.find(item => item.name === 'managedPage')!.fields
const helpfulLink = field(field(toolFields, 'links').fields!, 'href').ui!.validate!
const articleLink = field(field(templates, 'link').fields!, 'href').ui!.validate!
const authorLink = field(field(postFields, 'author').fields!, 'url').ui!.validate!
const referenceLink = field(field(postFields, 'references').fields!, 'url').ui!.validate!
const managedLink = field(field(field(managedFields, 'sections').fields!, 'links').fields!, 'href').ui!.validate!
const optionalManagedLink = field(field(managedFields, 'introCta').fields!, 'href').ui!.validate!
const managedPage = (href: string) => ({ title: 'Page', introduction: 'A useful page.', seoTitle: 'Page', seoDescription: 'A useful page.', sections: [{ heading: 'Information', body: ['Read more.'], links: [{ label: 'Read more', href }] }] })

describe('editor publication dates match the published reader', () => {
  const publicationDate = field(postFields, 'date').ui!.validate!
  const updatedDate = field(postFields, 'updated').ui!.validate!
  const publish = field(postFields, 'published').ui!.validate!
  const archive = field(postFields, 'archived').ui!.validate!

  it('blocks an earlier update when either date field is edited on a published post', () => {
    const values = { ...post('<p>Valid.</p>'), updated: '2026-11-25' }
    expect(publicationDate(values.date, values)).toMatch(/earlier than publication date/i)
    expect(updatedDate(values.updated, values)).toMatch(/earlier than publication date/i)
    expect(() => parsePublishedPost(values, 'guide')).toThrow('last updated cannot be earlier than publication date')
  })

  it.each(['2026-11-26', '2026-11-27', '2027-01-01'])('accepts equal or later updates without changing publication: %s', updated => {
    const values = { ...post('<p>Valid.</p>'), updated }
    expect(publicationDate(values.date, values)).toBeUndefined()
    expect(updatedDate(updated, values)).toBeUndefined()
    expect(parsePublishedPost(values, 'guide')).toMatchObject({ date: values.date, updated })
  })

  it.each([undefined, null, ''])('preserves a clearable optional update: %s', updated => {
    const values = { ...post('<p>Valid.</p>'), updated }
    expect(updatedDate(updated, values)).toBeUndefined()
    expect(publicationDate(values.date, values)).toBeUndefined()
    expect(parsePublishedPost(values, 'guide')?.updated).toBeUndefined()
    expect(typeof publicationDate(undefined, values)).toBe('string')
  })

  it.each(['2026-2-01', '2026-02-30', 'not-a-date'])('retains format and real-calendar validation: %s', invalid => {
    const values = { ...post('<p>Valid.</p>'), updated: invalid }
    expect(typeof updatedDate(invalid, values)).toBe('string')
    expect(publicationDate(values.date, values)).toBeUndefined()
    expect(() => parsePublishedPost(values, 'guide')).toThrow()
  })

  it.each([{ published: false }, { archived: true }])('keeps unpublished date ordering editable: %j', state => {
    const values = { ...post('<p>Valid.</p>'), updated: '2026-11-25', ...state }
    expect(publicationDate(values.date, values)).toBeUndefined()
    expect(updatedDate(values.updated, values)).toBeUndefined()
    expect(parsePublishedPost(values, 'guide')).toBeUndefined()
  })

  it('checks the incoming Publish value even when the previous form state is a draft', () => {
    const draft = { ...post('<p>Valid.</p>'), published: false, updated: '2026-11-25' }
    expect(publish(true, draft)).toMatch(/earlier than publication date/i)
    expect(() => parsePublishedPost({ ...draft, published: true }, 'guide')).toThrow('earlier than publication')
    expect(publish(false, draft)).toBeUndefined()
    expect(publish(true, { ...draft, updated: '2026-11-26' })).toBeUndefined()
  })

  it('checks reactivation without blocking archiving an inverted-date post', () => {
    const archived = { ...post('<p>Valid.</p>'), archived: true, updated: '2026-11-25' }
    expect(archive(false, archived)).toMatch(/earlier than publication date/i)
    expect(() => parsePublishedPost({ ...archived, archived: false }, 'guide')).toThrow('earlier than publication')
    expect(archive(true, archived)).toBeUndefined()
    expect(archive(false, { ...archived, updated: '2026-11-26' })).toBeUndefined()
  })
})

describe('editor feedback matches the published content boundary', () => {
  it('uses the same runtime parser for Tina and TypeScript consumers', () => {
    expect(editorParser).toBe(parseEditorialHtml)
  })

  it.each([
    '<script>alert(1)</script>', '<p', '<p>Unclosed paragraph', '<a href="javascript:alert(1)">Unsafe</a>',
    '<p style="color:red">Unsupported style</p>', '<strong><em>Mismatch</strong></em>', '<p>[Unsafe](javascript:alert)</p>',
  ])('blocks invalid HTML in the editor before it can fail deployment: %s', html => {
    const sectionError = sectionBody(html)
    const postError = htmlBlock(html)
    expect(typeof sectionError).toBe('string')
    expect(typeof postError).toBe('string')
    expect(() => parseEditorialContent(section(html), 'tool')).toThrow(sectionError!)
    expect(() => parsePublishedPost(post(html), 'guide')).toThrow(postError!)
  })

  it.each([
    '<p>Use <strong>originals</strong> and <a href="/privacy">check privacy</a>.</p>',
    '<ol><li>Choose a file</li><li>Review it</li></ol>',
    '<blockquote><p>Keep a backup.</p></blockquote>',
    '<p>Read [format](https://example.org/Test_(format)) and <a href="/uploads/Team%20Photo.webp">the photo</a>.</p>',
    '<a href="/about">[This is literal inside a link](/contact)</a>',
    '<a href="/about">[This is literal](javascript:alert)</a><code>[Also literal](javascript:alert)</code>',
  ])('accepts supported HTML consistently in editor and build: %s', html => {
    expect(sectionBody(html)).toBeUndefined()
    expect(htmlBlock(html)).toBeUndefined()
    expect(() => parseEditorialContent(section(html), 'tool')).not.toThrow()
    expect(() => parsePublishedPost(post(html), 'guide')).not.toThrow()
  })

  it.each(['Read [format](https://example.org/wiki/Test_(format)).', 'Open [the photo](/uploads/Team%20Photo.webp).'])('accepts complete common link destinations in every prose validator: %s', value => {
    for (const validate of [sectionBody, introduction, answer, paragraph]) expect(validate(value)).toBeUndefined()
    expect(() => parseEditorialContent({ ...section(value), faq: [{ q: 'Where?', a: value }] }, 'tool')).not.toThrow()
    expect(() => parsePublishedPost({ ...post('<p>Valid.</p>'), body: [{ _template: 'p', text: value }] }, 'guide')).not.toThrow()
  })

  it.each(['Read [this](javascript:alert(1))', 'Read [this](https://example.org/with space)', 'Read [this](//example.org)', 'Read [this](https://example.org/%00)', 'Read [this](https://example.org/%7f)', 'Read [this](/%2foutside.example)', 'Read [this](https://name:secret@example.org/Test_(format))'])('validates Markdown links immediately in prose, sections and FAQs: %s', value => {
    for (const validate of [sectionBody, introduction, answer, paragraph]) expect(typeof validate(value)).toBe('string')
    expect(() => parseEditorialContent(section(value), 'tool')).toThrow(sectionBody(value)!)
    expect(() => parseEditorialContent({ ...section('Valid content.'), faq: [{ q: 'Where?', a: value }] }, 'tool')).toThrow(answer(value)!)
  })

  it('permits useful plain text and Markdown while steering intentional HTML to its supported fields', () => {
    const value = 'Read the [privacy policy](/privacy).\n- Keep originals\n1. Choose a file'
    for (const validate of [sectionBody, introduction, answer, paragraph]) expect(validate(value)).toBeUndefined()
    expect(typeof introduction('<p>Use the section body.</p>')).toBe('string')
    expect(typeof answer('<p>Use plain text here.</p>')).toBe('string')
    // Existing Paragraph blocks still escape HTML-looking source as text.
    expect(paragraph('<script>This stays literal.</script>')).toBeUndefined()
    expect(typeof htmlBlock('   ')).toBe('string')
  })
})

describe('dedicated editor URL controls match public readers', () => {
  it.each(['/about', '/blog/guide#section-1', '#page-section-0', '/uploads/Team%20Photo.webp', 'https://example.org/My%20Guide', 'https://example.org/Test_(format)'])('accepts the same navigation URL in every dedicated field: %s', href => {
    for (const validate of [helpfulLink, articleLink, authorLink, managedLink, optionalManagedLink]) expect(validate(href)).toBeUndefined()
    expect(() => parseEditorialContent({ ...section('Valid.'), links: [{ label: 'Read', href }] }, 'tool')).not.toThrow()
    expect(() => parsePublishedPost({ ...post('<p>Valid.</p>'), body: [{ _template: 'link', href, text: 'Read' }], author: { name: 'Editor', url: href } }, 'guide')).not.toThrow()
    expect(() => parseManagedPage(managedPage(href), 'page')).not.toThrow()
  })

  it.each(['javascript:alert(1)', '//outside.example', '/%2foutside.example', '/%5coutside.example', '/%0aescape', '/%00escape', '/%1fescape', '/%7fescape', '/with space', 'https://name:secret@example.org', 'https://example.org/%ZZ'])('blocks unsafe dedicated links before saving: %s', href => {
    for (const validate of [helpfulLink, articleLink, authorLink, managedLink, optionalManagedLink]) expect(typeof validate(href)).toBe('string')
    expect(() => parseEditorialContent({ ...section('Valid.'), links: [{ label: 'Read', href }] }, 'tool')).toThrow()
    expect(() => parsePublishedPost({ ...post('<p>Valid.</p>'), body: [{ _template: 'link', href, text: 'Read' }] }, 'guide')).toThrow()
    expect(() => parsePublishedPost({ ...post('<p>Valid.</p>'), author: { name: 'Editor', url: href } }, 'guide')).toThrow()
    expect(() => parseManagedPage(managedPage(href), 'page')).toThrow()
  })

  it('preserves clearable optional URLs and validates nested managed link groups', () => {
    for (const value of [undefined, null, '']) {
      expect(authorLink(value)).toBeUndefined()
      expect(optionalManagedLink(value)).toBeUndefined()
      expect(typeof helpfulLink(value)).toBe('string')
    }
    const support = field(managedFields, 'support')
    expect(typeof editorialFieldPublicationError(support, { text: 'Read', emphasis: 'A guide', link: { label: 'Guide', href: '/%2foutside.example' } })).toBe('string')
    const clearable = field(managedFields, 'introCta')
    expect(editorialFieldPublicationError(clearable, { label: '', href: '' })).toBeUndefined()
    expect(typeof editorialFieldPublicationError(clearable, { label: 'Read more', href: '' })).toBe('string')
  })

  it.each(['https://example.org/reference', 'http://example.org/reference', 'https://example.org/My%20Reference', 'http://example.org/Test_(format)'])('keeps the existing HTTP(S)-only reference policy consistent: %s', url => {
    expect(referenceLink(url)).toBeUndefined()
    expect(() => parsePublishedPost({ ...post('<p>Valid.</p>'), references: [{ title: 'Reference', url }] }, 'guide')).not.toThrow()
  })

  it.each(['/about', '#section-1', 'javascript:alert(1)', 'https://name:secret@example.org', 'https://example.org/%0apath'])('rejects non-reference or unsafe reference URLs in editor and build: %s', url => {
    expect(typeof referenceLink(url)).toBe('string')
    expect(() => parsePublishedPost({ ...post('<p>Valid.</p>'), references: [{ title: 'Reference', url }] }, 'guide')).toThrow()
  })
})
