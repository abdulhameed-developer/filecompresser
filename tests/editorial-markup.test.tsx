// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseEditorialHtml, splitEditorialLinks, validateInlineLinks } from '@/lib/editorial-markup'
import { parsePublishedPost, parseEditorialContent } from '@/lib/content'
import BlogContent from '@/components/BlogContent'
import EditorialContent from '@/components/EditorialContent'
import { InlineEditorialText } from '@/components/EditorialText'
import { faqJsonLd, jsonLdScript } from '@/lib/seo'

const section = (body: string) => ({ heading: 'Guide', introduction: 'Choose a file.', sections: [{ heading: 'How it works', body }] })
const article = (body: unknown[]) => ({ published: true, title: 'Guide', description: 'A useful guide', date: '2026-11-26', readingTime: '2 min', figure: 'pipeline', body })

describe('safe editorial formatting', () => {
  it.each([
    ['/uploads/My%20Guide.pdf', 'guide'],
    ['https://example.org/wiki/Test_(format)', 'format'],
    ['https://example.org/wiki/Test_((nested)_format)', 'nested format'],
  ])('keeps encoded-space and balanced-parenthesis destinations intact: %s', (href, label) => {
    const text = `Before [${label}](${href}) after.`
    const post = parsePublishedPost(article([{ _template: 'p', text }]), 'working-links')!
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(BlogContent, { blocks: post.body }))
    expect(view.querySelectorAll('a')).toHaveLength(1)
    expect(view.querySelector('a')?.getAttribute('href')).toBe(href)
    expect(view.textContent).toBe(`Before ${label} after.`)
  })

  it('uses the same balanced link boundaries for visible FAQ text and structured data', () => {
    const answer = 'Read [format](https://example.org/wiki/Test_(format)) and [the guide](/My%20Guide).'
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(InlineEditorialText, { value: answer }))
    const data = faqJsonLd([{ q: 'Where?', a: answer }])
    expect(data.mainEntity[0].acceptedAnswer.text).toBe('Read format and the guide.')
    expect(data.mainEntity[0].acceptedAnswer.text).toBe(view.textContent)
    expect(jsonLdScript(data)).not.toContain('<script>')
  })

  it('preserves unsafe links literally and keeps JSON-LD escaping intact', () => {
    const answer = 'Keep <script>alert(1)</script> [Unsafe](javascript:alert(1)) and [safe](https://example.org/Test_(format)).'
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(InlineEditorialText, { value: answer }))
    expect(view.querySelectorAll('a')).toHaveLength(1)
    expect(view.querySelector('a')?.getAttribute('href')).toBe('https://example.org/Test_(format)')
    expect(view.querySelector('script')).toBeNull()
    expect(view.textContent).toContain('[Unsafe](javascript:alert(1))')
    const data = faqJsonLd([{ q: 'Where?', a: answer }])
    expect(data.mainEntity[0].acceptedAnswer.text).toBe(view.textContent)
    expect(jsonLdScript(data)).not.toContain('<script>')
    expect(() => validateInlineLinks(answer)).toThrow()
  })

  it.each([
    '[x]('.repeat(6000),
    `[x](https://example.org/${'('.repeat(24000)}`,
    `[x](https://example.org/${'a'.repeat(24000)}`,
  ])('keeps adversarial unclosed scans linear and preserves their literal text', input => {
    let reads = 0
    // Count indexed reads instead of using a timing threshold on a shared host.
    const observed = new Proxy({ length: input.length, slice: input.slice.bind(input) }, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) { reads++; return input[Number(key)] }
        return Reflect.get(target, key)
      },
    })
    const parts = splitEditorialLinks(observed as unknown as string)
    expect(parts.map(part => typeof part === 'string' ? part : part.source).join('')).toBe(input)
    expect(parts.every(part => typeof part === 'string')).toBe(true)
    expect(reads).toBeLessThan(input.length * 16 + 128)
  })

  it.each(['[broken](https://example.org/Test_(format)', `[long](https://example.org/${'a'.repeat(4097)})`, `[deep](https://example.org/${'('.repeat(17)}x${')'.repeat(17)})`])('leaves unsupported/incomplete link fragments literal instead of truncating a destination', value => {
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(InlineEditorialText, { value }))
    expect(view.querySelector('a')).toBeNull()
    expect(view.textContent).toBe(value)
  })

  it('provides working section links for long editorial content without collapsing its body', () => {
    const content = parseEditorialContent({ ...section('First section.'), sections: Array.from({ length: 5 }, (_, i) => ({ heading: `Section ${i + 1}`, body: `Visible paragraph ${i + 1}.` })) }, 'test')
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(EditorialContent, { content }))
    const links = [...view.querySelectorAll<HTMLAnchorElement>('.editorialContents a')]
    expect(links).toHaveLength(5)
    for (const link of links) expect(view.querySelector(link.getAttribute('href')!)).not.toBeNull()
    expect(view.querySelectorAll('.editorialContent > section')).toHaveLength(5)
    expect(view.querySelector('h3')?.closest('details')).toBeNull()
  })

  it('keeps paragraph line breaks and Markdown lists readable instead of joining adjacent lines', () => {
    const content = parseEditorialContent(section('First line\nSecond line\n- A bullet\n- [A link](/privacy)\n1. First step\n2. Second step'), 'test')
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(EditorialContent, { content }))
    expect(view.querySelector('.editorialParagraph p br')).not.toBeNull()
    expect(view.querySelectorAll('.editorialParagraph ul li')).toHaveLength(2)
    expect(view.querySelectorAll('.editorialParagraph ol li')).toHaveLength(2)
    expect(view.querySelector('a')?.getAttribute('href')).toBe('/privacy')
  })

  it('renders HTML paragraphs, formatting, links, bullets and numbered steps as semantic React elements', () => {
    const body = '<p>Use <strong>original files</strong> &amp; <a href="/image-compressor">compare outputs</a>.</p><ul><li>Choose a file</li></ul><ol><li>Review it</li><li>Download it</li></ol>'
    const content = parseEditorialContent(section(body), 'test')
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(EditorialContent, { content }))
    expect(view.querySelector('strong')?.textContent).toBe('original files')
    expect(view.querySelector('a')?.getAttribute('href')).toBe('/image-compressor')
    expect(view.querySelectorAll('ul li')).toHaveLength(1)
    expect(view.querySelectorAll('ol li')).toHaveLength(2)
    expect(view.textContent).toContain('original files & compare outputs')
  })

  it('supports blog inline links and an explicit HTML content block without changing existing plain text escaping', () => {
    const post = parsePublishedPost(article([
      { _template: 'p', text: 'Try the [image tool](/image-compressor).' },
      { _template: 'ul', items: ['Read our [privacy policy](/privacy)'] },
      { _template: 'html', html: '<p>A <em>useful</em> <a href="https://example.org/?a=1&amp;b=2">reference</a>.</p>' },
      { _template: 'p', text: '<script>alert(1)</script>' },
    ]), 'formatting')!
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(BlogContent, { blocks: post.body }))
    expect(view.querySelectorAll('a')).toHaveLength(3)
    expect(view.querySelector('em')?.textContent).toBe('useful')
    expect(view.querySelector('script')).toBeNull()
    expect(view.textContent).toContain('<script>alert(1)</script>')
  })

  it('keeps Markdown-looking text literal inside HTML links and code instead of producing nested anchors', () => {
    const post = parsePublishedPost(article([{ _template: 'html', html: '<a href="/about"><strong>[Contact](/contact)</strong></a><code>[Format](https://example.org/Test_(format))</code>' }]), 'no-nested-links')!
    const html = renderToStaticMarkup(createElement(BlogContent, { blocks: post.body }))
    expect(html.match(/<a /g)).toHaveLength(1)
    const view = document.createElement('div')
    view.innerHTML = html
    expect(view.querySelector('a')?.textContent).toBe('[Contact](/contact)')
    expect(view.querySelector('code')?.textContent).toBe('[Format](https://example.org/Test_(format))')
  })

  it.each([
    '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<p style="color:red">Text</p>',
    '<a href="javascript:alert(1)">Link</a>', '<a href="&#106;avascript:alert(1)">Link</a>',
    '<a href="//example.org">Link</a>', '<a href="/%2fexample.org">Link</a>',
    '<a href="https://example.org" onclick="alert(1)">Link</a>', '<iframe></iframe>',
    '<ul>Missing item</ul>', '<li>Missing list</li>', '<p><ul><li>Nested</li></ul></p>',
    '<p>Unclosed', '<strong><em>Mismatch</strong></em>', '<!-- comment -->',
  ])('rejects unsafe or malformed HTML before a public build: %s', html => {
    expect(() => parseEditorialHtml(html)).toThrow()
    expect(() => parseEditorialContent(section(html), 'test')).toThrow()
    expect(() => parsePublishedPost(article([{ _template: 'html', html }]), 'invalid')).toThrow()
  })
})
