// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BLOG_POSTS } from '@/lib/blog'
import { postDateLabel, postUpdatedDate } from '@/lib/blog-dates'
import BlogIndexPage from '@/app/blog/page'
import BlogPostPage, { generateMetadata } from '@/app/blog/[slug]/page'
import FeaturedGuides from '@/components/FeaturedGuides'
import { GET } from '@/app/sitemap.xml/route'

function rendered(html: string): Document {
  const view = document.implementation.createHTMLDocument()
  view.documentElement.innerHTML = html
  return view
}

describe('one public article update date with truthful original metadata', () => {
  it('uses an existing publication date as the update fallback without inventing a date', () => {
    expect(postUpdatedDate({ date: '2026-09-04' })).toBe('2026-09-04')
    expect(postUpdatedDate({ date: '2026-09-04', updated: '2026-11-28' })).toBe('2026-11-28')
    expect(postDateLabel('2026-11-28')).toBe('November 28, 2026')
  })

  it('shows one Updated date per blog and featured card', () => {
    const index = rendered(renderToStaticMarkup(<BlogIndexPage />))
    expect(index.querySelectorAll('.postCard time')).toHaveLength(BLOG_POSTS.length)
    for (const time of index.querySelectorAll('.postCard time')) expect(time.textContent).toMatch(/^Updated \w+ \d+, \d{4}$/)
    const featured = rendered(renderToStaticMarkup(<FeaturedGuides posts={BLOG_POSTS.slice(0, 3)} />))
    expect(featured.querySelectorAll('time')).toHaveLength(3)
    expect(featured.body.textContent).not.toMatch(/Originally published|Created |Published /)
  })

  it('keeps original publication dates in article JSON-LD and metadata, with only the update visible', async () => {
    const sitemap = await GET().text()
    for (const post of BLOG_POSTS) {
      const params = Promise.resolve({ slug: post.slug })
      const metadata = await generateMetadata({ params })
      expect(metadata.openGraph).toMatchObject({ publishedTime: post.date, modifiedTime: post.updated ?? post.date })
      const view = rendered(renderToStaticMarkup(await BlogPostPage({ params })))
      const data = JSON.parse(view.querySelector('script[type="application/ld+json"]')!.textContent!)
      expect(data.find((item: { '@type': string }) => item['@type'] === 'BlogPosting')).toMatchObject({ datePublished: post.date, dateModified: post.updated ?? post.date })
      expect(view.querySelectorAll('.sectionLabel time')).toHaveLength(1)
      expect(view.querySelector('.sectionLabel time')!.getAttribute('dateTime')).toBe(post.updated ?? post.date)
      expect(view.querySelector('.sectionLabel time')!.textContent).toBe(`Updated ${postDateLabel(postUpdatedDate(post))}`)
      for (const time of view.querySelectorAll('.postRelated time')) expect(time.textContent).toMatch(/^Updated \w+ \d+, \d{4}$/)
      expect(view.querySelector('.postUpdated')).toBeNull()
      expect(sitemap).toContain(`/blog/${post.slug}</loc><lastmod>${post.updated ?? post.date}</lastmod>`)
    }
  })
})
