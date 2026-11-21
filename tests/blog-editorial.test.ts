// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BlogContent from '@/components/BlogContent'
import { BLOG_POSTS, postAuthor, postImage } from '@/lib/blog'
import { parsePublishedPost, readPublishedPosts } from '@/lib/content'
import { ORGANIZATION_NAME } from '@/lib/seo'

const fixture = () => ({
  published: true, title: 'A practical guide', description: 'Choose a useful output.',
  date: '2026-11-21', readingTime: '4 min', figure: 'pipeline',
  body: [{ _template: 'p', text: 'Keep the original.' }],
})

describe('blog editorial features', () => {
  it('archives a post without needing to delete or erase its stored content', () => {
    const stored = { ...fixture(), archived: true }
    expect(parsePublishedPost(stored, 'useful-guide')).toBeUndefined()
    expect(stored.body[0].text).toBe('Keep the original.')
    expect(() => parsePublishedPost({ ...stored, archived: 'true' }, 'useful-guide')).toThrow('archived')
  })

  it('supports supplied authors, taxonomy and local featured images without inventing attribution', () => {
    const post = parsePublishedPost({
      ...fixture(),
      author: { name: 'Editorial team', kind: 'Organization', url: '/about' },
      category: 'Image guides', tags: ['JPEG', 'File size'],
      featuredImage: { src: '/uploads/guide photos/comparison.final.png', alt: 'Two image outputs compared.', caption: 'Review both outputs.' },
    }, 'useful-guide')!
    expect(postAuthor(post)).toEqual({ name: 'Editorial team', kind: 'Organization', url: '/about' })
    expect(post.category).toBe('Image guides')
    expect(post.tags).toEqual(['JPEG', 'File size'])
    expect(postImage(post).src).toBe('/uploads/guide%20photos/comparison.final.png')
    expect(postImage(post).alt).toBe('Two image outputs compared.')
    expect(postAuthor(BLOG_POSTS[0])).toEqual({ name: ORGANIZATION_NAME, url: '/', kind: 'Organization' })
    expect(postImage(BLOG_POSTS[0]).src).toMatch(/^\/blog\/.*\.jpg$/)
  })

  it.each(['javascript:alert(1)', '//evil.example/photo.png', 'https://evil.example/photo.png', '/uploads/../outside.png', '/uploads/%2e%2e/outside.png', '/uploads/graphic.svg', '/uploads/photo.png?tracking=1'])('rejects unsafe or unmanaged featured image %s', src => {
    expect(() => parsePublishedPost({ ...fixture(), featuredImage: { src, alt: 'Description' } }, 'guide')).toThrow()
  })

  it.each(['javascript:alert(1)', 'data:text/html,hello', '//evil.example', '/%2fexample.invalid', 'https://name:password@example.invalid', '/about\nunsafe'])('rejects unsafe editorial link %s', href => {
    expect(() => parsePublishedPost({ ...fixture(), body: [{ _template: 'link', href, text: 'Read more' }] }, 'guide')).toThrow()
    expect(() => parsePublishedPost({ ...fixture(), author: { name: 'Author', url: href } }, 'guide')).toThrow()
  })

  it('fails a new publication if a managed image was removed while retaining archived documents', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'filecompresser-image-reference-'))
    try {
      const post = { ...fixture(), featuredImage: { src: '/uploads/missing-publication-test-image.png', alt: 'An expected illustration.' } }
      writeFileSync(path.join(directory, 'guide.json'), JSON.stringify(post))
      expect(() => readPublishedPosts(directory)).toThrow('referenced image is missing')
      writeFileSync(path.join(directory, 'guide.json'), JSON.stringify({ ...post, archived: true }))
      expect(readPublishedPosts(directory)).toEqual([])
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('validates table structure so a published table always has matching headers and cells', () => {
    const table = { _template: 'table', caption: 'Format choices', columns: ['Format', 'Use'], rows: [{ cells: ['JPEG', 'Photos'] }] }
    expect(parsePublishedPost({ ...fixture(), body: [table] }, 'guide')!.body[0]).toEqual({ type: 'table', caption: 'Format choices', columns: ['Format', 'Use'], rows: [{ cells: ['JPEG', 'Photos'] }] })
    expect(() => parsePublishedPost({ ...fixture(), body: [{ ...table, rows: [{ cells: ['Only one'] }] }] }, 'guide')).toThrow('column count')
    expect(() => parsePublishedPost({ ...fixture(), body: [{ ...table, columns: [] }] }, 'guide')).toThrow('column headings')
  })

  it('renders semantic headings, lists, links, tables and images while escaping all editorial markup', () => {
    const post = parsePublishedPost({ ...fixture(), body: [
      { _template: 'h2', text: 'Compare formats' },
      { _template: 'h3', text: 'For photographs' },
      { _template: 'p', text: '<script>alert(1)</script>' },
      { _template: 'ol', items: ['Choose an image', 'Compare the result'] },
      { _template: 'link', href: '/image-compressor', text: 'Use the image compressor' },
      { _template: 'link', href: 'https://example.org/guide', text: 'External reference' },
      { _template: 'table', columns: ['Format', 'Use'], rows: [{ cells: ['JPEG', '<img src=x onerror=alert(1)>'] }] },
      { _template: 'image', src: '/uploads/comparison.png', alt: 'Before and after image outputs.', caption: 'Compare visible detail.' },
    ] }, 'guide')!
    const html = renderToStaticMarkup(createElement(BlogContent, { blocks: post.body }))
    const view = document.createElement('div')
    view.innerHTML = html
    expect(view.querySelector('h2')?.id).toBe('section-0')
    expect(view.querySelector('h3')?.id).toBe('section-1')
    expect(view.querySelectorAll('ol li')).toHaveLength(2)
    expect(view.querySelector('a')?.getAttribute('href')).toBe('/image-compressor')
    expect(view.querySelectorAll('table th[scope=col]')).toHaveLength(2)
    expect(view.querySelectorAll('table td')).toHaveLength(2)
    expect(view.querySelector('script')).toBeNull()
    expect(view.querySelectorAll('img')).toHaveLength(1)
    expect(view.querySelector('img')?.alt).toBe('Before and after image outputs.')
    expect(view.querySelector('td:last-child')?.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
