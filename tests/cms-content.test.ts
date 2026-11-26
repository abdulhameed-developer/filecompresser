import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getHomeContent, getToolContent, parseEditorialContent, parsePublishedPost, readPublishedPosts } from '@/lib/content'
import { BLOG_POSTS, allPostSlugs, getPost } from '@/lib/blog'
import { TOOLS } from '@/lib/tools'
import { editorialCollections } from '../tina/editorial.mjs'

const temporaryDirectories: string[] = []
afterEach(() => temporaryDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

function document() {
  return {
    title: 'A useful guide', description: 'A short summary.', date: '2026-11-21', readingTime: '3 min', figure: 'pipeline', published: true,
    body: [{ _template: 'h2', text: 'Choosing a format' }, { _template: 'p', text: 'Inspect the result before replacing the original.' }],
  }
}

describe('CMS publication boundaries', () => {
  it('excludes drafts and incomplete new posts from every public collection', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'filecompresser-content-'))
    temporaryDirectories.push(directory)
    writeFileSync(path.join(directory, 'public-guide.json'), JSON.stringify(document()))
    writeFileSync(path.join(directory, 'unfinished-draft.json'), JSON.stringify({ published: false }))
    writeFileSync(path.join(directory, 'unapproved-guide.json'), JSON.stringify({ ...document(), published: undefined }))
    expect(readPublishedPosts(directory).map(post => post.slug)).toEqual(['public-guide'])
    expect(parsePublishedPost({ published: false }, 'unfinished-draft')).toBeUndefined()
  })

  it('takes the public URL from the safe filename, not an editable data property', () => {
    expect(parsePublishedPost({ ...document(), slug: '../../other-page' }, 'useful-guide')?.slug).toBe('useful-guide')
    expect(() => parsePublishedPost(document(), '../escape')).toThrow('filename')
  })

  it('fails publication for malformed content instead of silently publishing broken HTML or dates', () => {
    expect(() => parsePublishedPost({ ...document(), title: '' }, 'guide')).toThrow('title')
    expect(() => parsePublishedPost({ ...document(), date: '2026-02-30' }, 'guide')).toThrow('date does not exist')
    expect(() => parsePublishedPost({ ...document(), updated: '2026-11-20' }, 'guide')).toThrow('earlier than publication')
    expect(() => parsePublishedPost({ ...document(), figure: 'unknown' }, 'guide')).toThrow('illustration')
    expect(() => parsePublishedPost({ ...document(), published: 'true' }, 'guide')).toThrow('published')
    expect(() => parsePublishedPost({ ...document(), body: [{ _template: 'script', text: 'alert(1)' }] }, 'guide')).toThrow('supported')
    expect(() => parsePublishedPost({ ...document(), references: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] }, 'guide')).toThrow('HTTP(S)')
  })

  it('normalizes editor templates to the existing article renderer without changing text', () => {
    const post = parsePublishedPost({ ...document(), body: [
      { _template: 'p', text: '<b>This remains text.</b>' },
      { _template: 'ul', items: ['First', 'Second'] },
      { _template: 'callout', title: 'Keep the original', text: 'Compare the output.' },
      { _template: 'figure', figure: 'pipeline', caption: 'The processing stages.' },
    ] }, 'guide')
    expect(post?.body).toEqual([
      { type: 'p', text: '<b>This remains text.</b>' },
      { type: 'ul', items: ['First', 'Second'] },
      { type: 'callout', title: 'Keep the original', text: 'Compare the output.' },
      { type: 'figure', figure: 'pipeline', caption: 'The processing stages.' },
    ])
  })

  it('keeps all public discovery APIs on the same validated post set', () => {
    expect(allPostSlugs()).toEqual(BLOG_POSTS.map(post => post.slug))
    for (const post of BLOG_POSTS) expect(getPost(post.slug)).toBe(post)
    expect(getPost('missing-post')).toBeUndefined()
  })
})

describe('SEO content for homepage and tools', () => {
  it('provides valid editable content for every canonical tool and resolves the WAV alias', () => {
    const collection = editorialCollections.find(collection => collection.name === 'toolPage')!
    const editableSlugs = collection.match.include.replace(/[{}]/g, '').split(',')
    expect(editableSlugs.sort()).toEqual(TOOLS.map(tool => tool.slug).sort())
    for (const tool of TOOLS) {
      const content = getToolContent(tool.slug)
      expect(content.heading.trim()).not.toBe('')
      expect(content.sections.length).toBeGreaterThan(0)
    }
    expect(getToolContent('wav-to-mp3')).toEqual(getToolContent('wav-compressor'))
    expect(() => getToolContent('../outside')).toThrow('unknown tool')
    expect(getHomeContent().introduction.trim()).not.toBe('')
  })

  it('treats blank SEO overrides as fallback and rejects incomplete visible FAQ entries', () => {
    expect(parseEditorialContent({ heading: 'About this tool', introduction: 'Choose your settings.', seoTitle: '', seoDescription: '' }, 'tool').seoTitle).toBeUndefined()
    expect(() => parseEditorialContent({ heading: 'About this tool', introduction: 'Choose your settings.', faq: [{ q: 'A question', a: '' }] }, 'tool')).toThrow('faq[0].a')
  })
})
