import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import path from 'node:path'
import type { BlogPost } from '@/lib/blog'

const state = vi.hoisted(() => ({ files: {} as Record<string, unknown>, posts: undefined as BlogPost[] | undefined }))
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>()
  return { ...original, readFileSync(filename: unknown, ...options: unknown[]) {
    if (typeof filename === 'string' && Object.hasOwn(state.files, filename)) return JSON.stringify(state.files[filename])
    return Reflect.apply(original.readFileSync, original, [filename, ...options])
  } }
})
vi.mock('@/lib/blog', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/blog')>()
  return { ...original, postsByDate: () => state.posts ?? original.postsByDate() }
})
vi.mock('@/components/HomeCompress', () => ({ default: () => <div data-testid="file-workspace" /> }))
vi.mock('@/components/ProcessingStory', () => ({ default: () => <div /> }))

afterEach(() => { state.files = {}; state.posts = undefined; vi.resetModules() })

function managed(slug: string, title: string, updated = '2026-11-23') {
  state.files[path.join(process.cwd(), 'content/pages', `${slug}.json`)] = {
    title, seoTitle: `${title} SEO`, seoDescription: `${title} description`, updated, introduction: `${title} introduction`, sections: [],
  }
}
function post(slug: string, title: string): BlogPost {
  return { slug, title, description: `${title} introduction`, date: '2026-11-21', updated: '2026-11-23', readingTime: '3 min', figure: 'pipeline', body: [{ type: 'p', text: title }] }
}

describe('sitewide editorial consistency', () => {
  it('keeps home and information-page HTML/metadata fresh after modules have loaded', async () => {
    const homePath = path.join(process.cwd(), 'content/home/home.json')
    const home = (label: string) => ({ heading: `${label} content`, introduction: `${label} introduction`, seoTitle: `${label} SEO`, seoDescription: `${label} description`, hero: { lead: label, emphasis: 'Files', description: 'Local tools.' }, faq: [], faqMode: 'hidden' })
    state.files[homePath] = home('Original home')
    managed('about', 'Original about')
    managed('contact', 'Original contact')
    managed('privacy', 'Original privacy')
    const [homepage, about, contact, privacy] = await Promise.all([
      import('@/app/page'), import('@/app/about/page'), import('@/app/contact/page'), import('@/app/privacy/page'),
    ])
    expect(renderToStaticMarkup(<homepage.default />)).toContain('Original home')
    state.files[homePath] = home('Edited home')
    managed('about', 'Edited about')
    managed('contact', 'Edited contact')
    managed('privacy', 'Edited privacy')
    for (const [route, title] of [[homepage, 'Edited home'], [about, 'Edited about'], [contact, 'Edited contact'], [privacy, 'Edited privacy']] as const) {
      const html = renderToStaticMarkup(<route.default />)
      expect(html).toContain(title)
      expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1)
      expect(route.generateMetadata()).toMatchObject({ title: title === 'Edited home' ? { absolute: `${title} SEO` } : `${title} SEO`, description: `${title} description` })
    }
  })

  it('keeps current blog cards, Blog JSON-LD and both sitemap formats on the same published set', async () => {
    state.posts = [post('old-public-guide', 'Old public guide')]
    const [blog, sitemap, xml] = await Promise.all([import('@/app/blog/page'), import('@/app/sitemap/page'), import('@/app/sitemap.xml/route')])
    expect(renderToStaticMarkup(<blog.default />)).toContain('Old public guide')
    state.posts = [post('current-public-guide', 'Current public guide')]
    managed('about', 'Current about', '2026-11-22')
    for (const route of [blog, sitemap]) {
      const html = renderToStaticMarkup(<route.default />)
      expect(html).toContain('Current public guide')
      expect(html).not.toContain('Old public guide')
    }
    const html = renderToStaticMarkup(<blog.default />)
    const data = JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1])
    expect(data.find((item: { '@type': string }) => item['@type'] === 'Blog').blogPost).toMatchObject([{ headline: 'Current public guide' }])
    const body = await xml.GET().text()
    expect(body).toContain('/blog/current-public-guide')
    expect(body).not.toContain('/blog/old-public-guide')
    expect(body).toMatch(/<loc>[^<]*\/about<\/loc><lastmod>2026-11-22<\/lastmod>/)
    expect(body).not.toContain('/wav-to-mp3')
    state.posts = []
    expect(renderToStaticMarkup(<blog.default />)).toContain('No published guides yet')
  })

  it('honors explicit FAQ modes even when custom rows remain stored', async () => {
    const { resolveEditorialFaq } = await import('@/lib/content')
    const stored = [{ q: 'Custom question', a: 'Custom answer' }]
    const fallback = [{ q: 'Default question', a: 'Default answer' }]
    expect(resolveEditorialFaq({ faqMode: 'default', faq: stored }, fallback)).toEqual(fallback)
    expect(resolveEditorialFaq({ faqMode: 'custom', faq: stored }, fallback)).toEqual(stored)
    expect(resolveEditorialFaq({ faqMode: 'hidden', faq: stored }, fallback)).toEqual([])
    expect(resolveEditorialFaq({ faqMode: 'custom', faq: [] }, fallback)).toEqual([])
  })

  it('retains configured sharing images and alt text on every managed page', async () => {
    const { managedPageMetadata, MANAGED_PAGE_SLUGS } = await import('@/lib/managed-pages')
    const { absoluteUrl, DEFAULT_SOCIAL_IMAGE, DEFAULT_SOCIAL_IMAGE_ALT } = await import('@/lib/seo')
    for (const slug of MANAGED_PAGE_SLUGS) {
      expect(managedPageMetadata(slug)).toMatchObject({
        openGraph: { images: [{ url: absoluteUrl(DEFAULT_SOCIAL_IMAGE), alt: DEFAULT_SOCIAL_IMAGE_ALT }] },
        twitter: { images: [{ url: absoluteUrl(DEFAULT_SOCIAL_IMAGE), alt: DEFAULT_SOCIAL_IMAGE_ALT }] },
      })
    }
  })

  it('uses supplied guide images and avoids empty or single-card carousel controls', async () => {
    const { default: FeaturedGuides } = await import('@/components/FeaturedGuides')
    expect(renderToStaticMarkup(<FeaturedGuides posts={[]} />)).toBe('')
    const guide = { ...post('image-guide', 'Image guide'), featuredImage: { src: '/uploads/guide.webp', alt: 'A supplied guide illustration.' } }
    const html = renderToStaticMarkup(<FeaturedGuides posts={[guide]} />)
    expect(decodeURIComponent(html)).toContain('/uploads/guide.webp')
    expect(html).toContain('alt="A supplied guide illustration."')
    expect(html).not.toContain('Next guide')
    expect(html).not.toContain('of 0 guides')
  })
})
