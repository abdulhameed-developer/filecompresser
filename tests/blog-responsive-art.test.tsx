// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BlogImage from '@/components/BlogImage'
import { stockBlogFigure } from '@/lib/stock-blog-art'
import BlogPostPage, { generateMetadata } from '@/app/blog/[slug]/page'
import type { BlogPost, FigureId } from '@/lib/blog'
import { checkStockBlogArt } from '@/scripts/check-stock-blog-art.mjs'

const editorial = vi.hoisted(() => ({ post: undefined as BlogPost | undefined }))
vi.mock('server-only', () => ({}))
// This test checks authored markup, not Next's separately verified image loader.
vi.mock('next/image', () => ({ default: 'img' }))
vi.mock('@/lib/blog', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/blog')>()
  return { ...original, getPost: () => editorial.post, postsByDate: () => [] }
})

const figures: FigureId[] = ['pipeline', 'sizebars', 'qualitycurve', 'dataflow', 'formattree']
const originalRoot = process.cwd()
let directory: string

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'filecompresser-stock-art-'))
  mkdirSync(path.join(directory, 'public/blog'), { recursive: true })
  mkdirSync(path.join(directory, 'public/uploads'), { recursive: true })
  for (const figure of figures) {
    for (const suffix of ['.webp', '-640.webp', '-768.webp']) {
      copyFileSync(path.join(originalRoot, 'public/blog', `${figure}${suffix}`), path.join(directory, 'public/blog', `${figure}${suffix}`))
    }
    copyFileSync(path.join(originalRoot, 'public/blog', `${figure}.webp`), path.join(directory, 'public/uploads', `${figure}.webp`))
  }
  vi.spyOn(process, 'cwd').mockReturnValue(directory)
  editorial.post = {
    slug: 'reviewed-guide', title: 'An authored guide', description: 'How these files work.',
    date: '2026-11-27', readingTime: '4 min', figure: 'pipeline',
    body: [{ type: 'p', text: 'Keep the original source.' }],
    featuredImage: { src: '/uploads/pipeline.webp', alt: 'The authored alternative description.', caption: 'A supplied caption remains visible.' },
  }
})
afterEach(() => { vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }) })

describe('reviewed stock artwork identity', () => {
  it.each(figures)('recognizes only exact reviewed %s aliases', figure => {
    expect(stockBlogFigure(`/uploads/${figure}.webp`)).toBe(figure)
    expect(stockBlogFigure(`/blog/${figure}.webp`)).toBe(figure)
  })

  it('rechecks a same-path CMS replacement instead of keeping old responsive artwork', () => {
    expect(stockBlogFigure('/uploads/pipeline.webp')).toBe('pipeline')
    writeFileSync(path.join(directory, 'public/uploads/pipeline.webp'), 'A different authored image')
    expect(stockBlogFigure('/uploads/pipeline.webp')).toBeUndefined()
  })

  it('does not treat matching replacements of both full sources as reviewed stock', () => {
    const replacement = readFileSync(path.join(directory, 'public/blog/dataflow.webp'))
    writeFileSync(path.join(directory, 'public/uploads/pipeline.webp'), replacement)
    writeFileSync(path.join(directory, 'public/blog/pipeline.webp'), replacement)
    expect(stockBlogFigure('/uploads/pipeline.webp')).toBeUndefined()
  })

  it.each(['public/uploads/pipeline.webp', 'public/blog/pipeline-768.webp'])('falls back when %s is missing', filename => {
    rmSync(path.join(directory, filename))
    expect(stockBlogFigure('/uploads/pipeline.webp')).toBeUndefined()
  })

  it.each(['/uploads/new-art.webp', '/uploads/../blog/pipeline.webp', '/uploads/%70ipeline.webp', '/uploads/pipeline.webp?revision=2', 'https://example.com/pipeline.webp'])('does not resolve an unknown or changed path %s', src => {
    expect(stockBlogFigure(src)).toBeUndefined()
  })

  it('requires every advertised stock candidate before release', async () => {
    await expect(checkStockBlogArt(directory)).resolves.toBeUndefined()
    rmSync(path.join(directory, 'public/blog/pipeline-768.webp'))
    await expect(checkStockBlogArt(directory)).rejects.toThrow()
  })

  it('refuses changed candidate bytes, dimensions and containers before release', async () => {
    const filename = path.join(directory, 'public/blog/pipeline-768.webp')
    const original = readFileSync(filename)
    const corrupted = Buffer.from(original); corrupted[corrupted.length - 4] ^= 1
    writeFileSync(filename, corrupted)
    await expect(checkStockBlogArt(directory)).rejects.toThrow('Review changed editorial stock artwork')
    const wrongDimensions = Buffer.from(original); wrongDimensions.writeUInt16LE(700, 26)
    writeFileSync(filename, wrongDimensions)
    await expect(checkStockBlogArt(directory)).rejects.toThrow('Unexpected editorial stock dimensions')
    writeFileSync(filename, 'This is not a WebP file')
    await expect(checkStockBlogArt(directory)).rejects.toThrow('Invalid reviewed WebP container')
  })
})

describe('responsive article artwork', () => {
  it('preserves authored fallback/alternative text and supplies honest stock candidates', () => {
    const html = renderToStaticMarkup(createElement(BlogImage, {
      figure: 'pipeline', fallbackSrc: '/uploads/pipeline.webp', alt: 'Authored image description.',
      sizes: '(max-width: 900px) calc(100vw - 40px), 860px', priority: true,
    }))
    const view = document.createElement('div'); view.innerHTML = html
    expect(view.querySelector('picture > source')?.getAttribute('srcset')).toBe('/blog/pipeline-640.webp 640w, /blog/pipeline-768.webp 768w, /blog/pipeline.webp 1200w')
    expect(view.querySelector('source')?.getAttribute('sizes')).toBe('(max-width: 900px) calc(100vw - 40px), 860px')
    const image = view.querySelector('picture > img')!
    expect(image.getAttribute('src')).toBe('/uploads/pipeline.webp')
    expect(image.getAttribute('alt')).toBe('Authored image description.')
    expect(image.getAttribute('width')).toBe('1200')
    expect(image.getAttribute('height')).toBe('800')
    expect(image.getAttribute('loading')).toBe('eager')
    expect(image.getAttribute('fetchpriority')).toBe('high')
    expect(view.querySelector('link[rel=preload]')).toBeNull()
  })

  it.each(['stock', 'unknown', 'replacement'])('preserves authored hero content and metadata for %s artwork', async scenario => {
    if (scenario === 'unknown') editorial.post!.featuredImage!.src = '/uploads/new-art.webp'
    if (scenario === 'replacement') writeFileSync(path.join(directory, 'public/uploads/pipeline.webp'), 'A new author upload at the same address')
    const element = await BlogPostPage({ params: Promise.resolve({ slug: 'reviewed-guide' }) })
    const view = document.createElement('div'); view.innerHTML = renderToStaticMarkup(element)
    const hero = view.querySelector('.articleHero')!
    expect(hero.querySelector('img')?.getAttribute('src')).toBe(editorial.post!.featuredImage!.src)
    expect(hero.querySelector('img')?.getAttribute('alt')).toBe('The authored alternative description.')
    expect(hero.querySelector('figcaption')?.textContent).toBe('A supplied caption remains visible.')
    expect(Boolean(hero.querySelector('picture'))).toBe(scenario === 'stock')
    expect(hero.querySelector('img')?.getAttribute('loading')).toBe('eager')
    expect(hero.querySelector('img')?.getAttribute('fetchpriority')).toBe('high')
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'reviewed-guide' }) })
    expect(JSON.stringify(metadata.openGraph)).toContain(editorial.post!.featuredImage!.src)
    expect(JSON.stringify(metadata.openGraph)).toContain('The authored alternative description.')
  })
})
