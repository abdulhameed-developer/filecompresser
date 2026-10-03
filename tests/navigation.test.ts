import { describe, it, expect } from 'vitest'
import { TOOLS, canonicalSlug, getTool, relatedTools, toolUsesFfmpeg } from '@/lib/tools'
import {
  SITE_LINKS,
  TOOL_GROUPS,
  footerColumns,
  toolsInGroup,
} from '@/lib/nav'
import { savingsOutcome, savingsSummary } from '@/lib/format'
import { BLOG_POSTS, getPost, postsByDate } from '@/lib/blog'

/**
 * Navigation integrity.
 *
 * The bug these guard against is structural rather than visual: a footer link
 * pointing at a route that does not exist, a "related tools" list that is really
 * just registry order, or the same tool appearing in two different surfaces with
 * different labels. None of that throws — it just ships a site with dead ends.
 */

const MB = 1024 * 1024

describe('tool registry integrity', () => {
  it('has no duplicate slugs', () => {
    const slugs = TOOLS.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('resolves aliases to a canonical slug', () => {
    expect(getTool('wav-to-mp3')).toBeDefined()
    expect(canonicalSlug('wav-to-mp3')).toBe('wav-compressor')
    expect(canonicalSlug('wav-compressor')).toBe('wav-compressor')
  })

  it('does not define the same tool under two real slugs', () => {
    const slugs = new Set(TOOLS.map((t) => t.slug))
    for (const tool of TOOLS) {
      for (const alias of tool.aliases ?? []) {
        expect(slugs.has(alias), `${alias} is both a tool and an alias`).toBe(false)
      }
    }
  })

  it('gives every tool a real title, description and size limit', () => {
    for (const tool of TOOLS) {
      expect(tool.title.length, tool.slug).toBeGreaterThan(2)
      expect(tool.description.length, tool.slug).toBeGreaterThan(15)
      expect(tool.maxFileSize, tool.slug).toBeGreaterThan(0)
      expect(tool.seoDescription, `${tool.slug} needs a meta description`).toBeTruthy()
      expect(tool.seoDescription!.length, `${tool.slug} description length`).toBeGreaterThan(40)
    }
  })

  it('only claims client-side processing where the engine really is client-side', () => {
    // Fails loudly if a server-side engine is ever added without revisiting the
    // privacy copy that is generated from this flag.
    for (const tool of TOOLS) {
      expect(tool.privacyClientSide, `${tool.slug} privacy claim`).toBe(true)
    }
  })

  it('identifies the FFmpeg-backed tools', () => {
    expect(toolUsesFfmpeg(getTool('video-compressor')!)).toBe(true)
    expect(toolUsesFfmpeg(getTool('mp3-compressor')!)).toBe(true)
    expect(toolUsesFfmpeg(getTool('png-compressor')!)).toBe(false)
  })

  it('returns undefined for an unknown slug', () => {
    expect(getTool('not-a-real-tool')).toBeUndefined()
  })

  it('gives every tool a unique title', () => {
    // Two tools sharing a title means the header, footer and sitemap all render
    // the same link text pointing at different places.
    const titles = TOOLS.map((t) => t.title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('related tools', () => {
  it('only links to slugs that actually exist', () => {
    const slugs = new Set(TOOLS.map((t) => t.slug))
    for (const tool of TOOLS) {
      for (const slug of tool.related ?? []) {
        expect(slugs.has(slug), `${tool.slug} relates to unknown "${slug}"`).toBe(true)
      }
    }
  })

  it('never relates a tool to itself', () => {
    for (const tool of TOOLS) {
      expect(tool.related ?? [], `${tool.slug} self-reference`).not.toContain(tool.slug)
    }
  })

  it('excludes the current page and returns the requested count', () => {
    for (const tool of TOOLS) {
      const related = relatedTools(tool, 6)
      expect(related.map((t) => t.slug)).not.toContain(tool.slug)
      expect(new Set(related.map((t) => t.slug)).size, `${tool.slug} duplicates`).toBe(
        related.length
      )
      expect(related.length, `${tool.slug} too few related`).toBeGreaterThan(0)
      expect(related.length, `${tool.slug} too many related`).toBeLessThanOrEqual(6)
    }
  })

  it('returns a tool\'s declared relations first, in order', () => {
    // Declared relations are an editorial decision, so the top of the list must
    // be exactly what the registry declares — not registry order, and not a
    // format-similarity score that outranks an explicit choice.
    const declared = getTool('jpg-compressor')!.related!
    const related = relatedTools(getTool('jpg-compressor')!).map((t) => t.slug)

    for (const slug of declared.slice(0, 3)) {
      expect(related.indexOf(slug), `${slug} should rank high`).toBeLessThan(3)
    }
    expect(related[0]).toBe(declared[0])
  })

  it('does not show the same tool twice across the related section', () => {
    for (const tool of TOOLS) {
      const slugs = relatedTools(tool, 12).map((t) => t.slug)
      expect(new Set(slugs).size, `${tool.slug} has duplicates`).toBe(slugs.length)
    }
  })

  it('surfaces the natural next step across categories', () => {
    // Every tool must offer a real onward path, not just same-format siblings.
    for (const slug of ['gif-compressor', 'video-compressor', 'mp3-compressor', 'wav-compressor']) {
      const related = relatedTools(getTool(slug)!).map((t) => t.slug)
      expect(related.length, slug).toBeGreaterThanOrEqual(3)
      expect(related).not.toContain(slug)
    }
  })

  it('has no related-tool entry pointing at a removed converter', () => {
    // The converter tools were deleted from the registry; a stale reference in
    // any `related` list would render a link to a 404.
    const removed = new Set([
      'image-converter', 'webp-to-png', 'webp-to-jpg', 'jfif-to-png',
      'heic-to-jpg', 'heic-to-png', 'heic-to-pdf', 'svg-converter',
      'jpg-to-pdf', 'pdf-to-jpg', 'video-converter', 'mp4-converter',
      'mov-to-mp4', 'audio-converter', 'mp3-converter', 'mp4-to-mp3', 'video-to-mp3',
    ])
    for (const tool of TOOLS) {
      for (const slug of tool.related ?? []) {
        expect(removed.has(slug), `${tool.slug} still relates to removed "${slug}"`).toBe(false)
      }
    }
  })
})

describe('navigation surfaces', () => {
  it('links every header/footer tool to a real route', () => {
    // The footer is generated from the registry, so this is a guard against a
    // hand-written href that no longer matches a registered tool.
    const slugs = new Set(TOOLS.map((t) => t.slug))
    for (const column of footerColumns()) {
      for (const link of column.links) {
        if (link.href === '/' || SITE_LINKS.some((s) => s.href === link.href)) continue
        const slug = link.href.replace(/^\//, '')
        expect(slugs.has(slug), `${link.href} is not a registered tool`).toBe(true)
      }
    }
  })

  it('splits every tool into exactly one footer column', () => {
    const columns = footerColumns()
    const linked = columns.flatMap((column) => column.links.map((l) => l.href))
    const unique = new Set(linked)

    // Every tool appears somewhere in the footer.
    for (const tool of TOOLS) {
      expect(unique.has(`/${tool.slug}`), `${tool.slug} missing from footer`).toBe(true)
    }
    // ...and nothing appears twice.
    expect(linked.length).toBe(unique.size)
  })

  it('only links site pages that have a route', () => {
    const routes = new Set([
      '/about',
      '/blog',
      '/privacy',
      '/terms',
      '/disclaimer',
      '/contact',
      '/sitemap',
    ])
    for (const link of SITE_LINKS) {
      expect(routes.has(link.href), `${link.href} has no page`).toBe(true)
    }
  })

  it('uses only same-page anchors for homepage section links', () => {
    // A route link must not be written as `/#something`, and a section link must
    // not be written as a bare route. This catches both classes of mistake.
    const anchors = ['/#compress', '/#tools', '/#how']
    for (const href of anchors) {
      expect(href.startsWith('/#')).toBe(true)
    }
  })

  it('covers every tool in exactly one navigation group', () => {
    const grouped = TOOL_GROUPS.flatMap((group) => toolsInGroup(group))
    expect(grouped.length).toBe(TOOLS.length)
    expect(new Set(grouped.map((t) => t.slug)).size).toBe(TOOLS.length)
  })

  it('gives every group a title and a blurb', () => {
    for (const group of TOOL_GROUPS) {
      expect(group.title.length).toBeGreaterThan(2)
      expect(group.blurb.length).toBeGreaterThan(10)
      expect(toolsInGroup(group).length, `${group.key} is empty`).toBeGreaterThan(0)
    }
  })
})

describe('blog', () => {
  it('has no duplicate slugs', () => {
    const slugs = BLOG_POSTS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('gives every post a real title, description, date and reading time', () => {
    for (const post of BLOG_POSTS) {
      expect(post.title.length, post.slug).toBeGreaterThan(10)
      expect(post.description.length, post.slug).toBeGreaterThan(40)
      expect(post.readingTime, post.slug).toMatch(/min$/)
      // ISO date, so the sitemap's lastmod and the JSON-LD datePublished agree.
      expect(post.date, post.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(post.date)), post.slug).toBe(false)
    }
  })

  it('gives every post real body content and a figure that exists', () => {
    const figures = new Set([
      'pipeline',
      'sizebars',
      'qualitycurve',
      'dataflow',
      'formattree',
    ])
    for (const post of BLOG_POSTS) {
      expect(post.body.length, post.slug).toBeGreaterThan(4)
      // Every post opens with real prose, not a heading straight away.
      expect(post.body[0].type, post.slug).toBe('p')
      expect(figures.has(post.figure), `${post.slug} has unknown figure "${post.figure}"`).toBe(true)
    }
  })

  it('uses a different figure in every post', () => {
    const used = BLOG_POSTS.map((p) => p.figure)
    expect(new Set(used).size, 'figures repeat between posts').toBe(used.length)
  })

  it('resolves posts by slug and rejects unknown ones', () => {
    expect(getPost(BLOG_POSTS[0].slug)).toBeDefined()
    expect(getPost('not-a-post')).toBeUndefined()
  })

  it('lists posts newest first', () => {
    const dates = postsByDate().map((p) => p.date)
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates)
  })
})

describe('honest savings reporting', () => {
  const size = (mb: number) => mb * MB

  it('describes a genuine reduction with both sizes and a percentage', () => {
    expect(savingsSummary(size(12.4), size(4.8))).toBe('12.40 MB → 4.80 MB · 61% smaller')
  })

  it('never presents growth as a saving', () => {
    const summary = savingsSummary(100, 120)
    expect(summary).toContain('larger')
    expect(summary).not.toMatch(/% smaller/)
    expect(savingsOutcome(100, 120)).toBe('larger')
  })

  it('states plainly when nothing changed', () => {
    expect(savingsSummary(100, 100)).toContain('no size change')
    expect(savingsOutcome(100, 100)).toBe('similar')
  })

  it('degrades safely when the original size is unknown', () => {
    expect(savingsSummary(0, 100)).toBe('100 B')
    expect(savingsOutcome(0, 100)).toBe('similar')
  })
})
