import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { BLOG_POSTS } from '@/lib/blog'
import { BLOG_ART, articleImage } from '@/lib/blog-art'
import { TOOLS } from '@/lib/tools'
import { TOOL_GUIDES } from '@/lib/tool-guides'

describe('editorial publication integrity', () => {
  it('has distinct responsive raster assets and useful alt text for all articles', () => {
    expect(new Set(BLOG_POSTS.map(post => post.figure)).size).toBe(5)
    for (const post of BLOG_POSTS) {
      expect(BLOG_ART[post.figure].alt.length).toBeGreaterThan(25)
      for (const file of [articleImage(post.figure), articleImage(post.figure, true), `/blog/${post.figure}-640.webp`]) {
        const bytes = readFileSync(`public${file}`)
        expect(statSync(`public${file}`).size).toBeLessThan(200000)
        if (file.endsWith('webp')) expect(bytes.subarray(8, 12).toString()).toBe('WEBP')
        else expect([...bytes.subarray(0, 2)]).toEqual([255, 216])
      }
      for (const slug of BLOG_ART[post.figure].tools) expect(TOOLS.some(tool => tool.slug === slug)).toBe(true)
    }
  })
  it('gives every canonical tool distinct and complete decision guidance', () => {
    expect(Object.keys(TOOL_GUIDES).sort()).toEqual(TOOLS.map(tool => tool.slug).sort())
    expect(new Set(Object.values(TOOL_GUIDES).map(guide => guide.output)).size).toBe(14)
  })
  it('does not revive stale font-network or unsupported benchmark claims', () => {
    const text = JSON.stringify(BLOG_POSTS)
    expect(text).not.toMatch(/Web fonts are loaded from Google|405 KB to 308 KB|factor of three or four|architecture makes the thing impossible/)
  })
})
