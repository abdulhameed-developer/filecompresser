/**
 * Build-time content reader. Import only from Server Components or build tools:
 * content is emitted as HTML and never fetched from the editor in visitors' tabs.
 */
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Block, BlogPost, EditorialImage, FigureId } from './blog'
import { TOOLS, canonicalSlug } from './tools'
import { parseEditorialHtml, safeEditorialHref, safeReferenceHref, validateEditorialValue } from './editorial-markup'

export interface EditorialContent {
  heading: string
  introduction: string
  sections: { heading: string; body: string }[]
  faq: { q: string; a: string }[]
  faqMode: 'default' | 'custom' | 'hidden'
  links: { label: string; href: string }[]
  relatedTools: string[]
  hero?: { lead: string; emphasis: string; description: string }
  steps?: { title: string; description: string }[]
  seoTitle?: string
  seoDescription?: string
}

const contentRoot = path.join(process.cwd(), 'content')
const figures = new Set(['pipeline', 'sizebars', 'qualitycurve', 'dataflow', 'formattree'])
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function fail(location: string, message: string): never {
  throw new Error(`Invalid content in ${location}: ${message}`)
}

function object(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(location, 'expected an object')
  }
  return value as Record<string, unknown>
}

function isBlankOptionalValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.every(isBlankOptionalValue)
  if (typeof value === 'object') return Object.values(value).every(isBlankOptionalValue)
  return false
}

/** Tina can retain a cleared group as an object of empty/null fields. */
function optionalObject(value: unknown, location: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  const item = object(value, location)
  return isBlankOptionalValue(item) ? undefined : item
}

function text(value: unknown, location: string, optional = false): string {
  if (optional && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || !value.trim()) return fail(location, 'expected non-empty text')
  return value
}

function list(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) return fail(location, 'expected a list')
  return value
}

function isoDate(value: unknown, location: string): string {
  const date = text(value, location)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(location, 'use a date in YYYY-MM-DD format')
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return fail(location, 'date does not exist')
  }
  return date
}

function figure(value: unknown, location: string): FigureId {
  const id = text(value, location)
  if (!figures.has(id)) return fail(location, `unknown illustration "${id}"`)
  return id as FigureId
}

/** Editorial URLs are navigation links, never executable schemes. */
function editorialLink(value: unknown, location: string): string {
  const href = text(value, location)
  try { return safeEditorialHref(href) }
  catch (error) { return fail(location, error instanceof Error ? error.message : 'Invalid link address') }
}

/** Use the editor's exact validation boundary before public rendering. */
function editorialText(value: unknown, location: string, optional = false, allowHtml = false): string {
  const result = text(value, location, optional)
  if (!result) return result
  try { validateEditorialValue(result, { allowHtml }) }
  catch (error) { return fail(location, error instanceof Error ? error.message : 'Invalid editorial content') }
  return result
}

function editorialImage(value: unknown, location: string): EditorialImage {
  const item = object(value, location)
  const input = text(item.src, `${location}.src`)
  let decoded: string
  try { decoded = decodeURIComponent(input) } catch { return fail(location, 'invalid image path encoding') }
  // Only repo-managed raster images, with each filename encoded independently.
  // Ordinary spaces/non-Latin filenames work without allowing traversal or SVG.
  if (!input.startsWith('/uploads/') || /[?#]/.test(input) || /[\\\u0000-\u001f\u007f]/.test(decoded) ||
    decoded.split('/').slice(2).some(segment => !segment || segment.startsWith('.')) ||
    !/\.(?:jpe?g|png|webp|gif|avif)$/i.test(decoded)) {
    return fail(location, 'choose a raster image stored under /uploads/')
  }
  const src = decoded.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return {
    src,
    alt: text(item.alt, `${location}.alt`),
    ...(item.caption ? { caption: text(item.caption, `${location}.caption`) } : {}),
  }
}

function block(value: unknown, location: string): Block {
  const item = object(value, location)
  // Tina object templates record `_template`; the page renderer retains its
  // existing discriminated union so every original article renders unchanged.
  const type = item._template ?? item.type
  switch (type) {
    case 'html': {
      const html = text(item.html, `${location}.html`)
      try { parseEditorialHtml(html) } catch (error) { return fail(location, error instanceof Error ? error.message : 'Invalid HTML') }
      return { type, html }
    }
    case 'h2':
    case 'h3':
      return { type, text: text(item.text, `${location}.text`) }
    case 'p':
      {
        const value = text(item.text, `${location}.text`)
        try { validateEditorialValue(value, { literalHtml: true }) } catch (error) { return fail(location, error instanceof Error ? error.message : 'Invalid link') }
        return { type, text: value }
      }
    case 'ul':
    case 'ol':
      return { type, items: list(item.items, `${location}.items`).map((entry, i) => text(entry, `${location}.items[${i}]`)) }
    case 'callout':
      return { type, title: text(item.title, `${location}.title`), text: text(item.text, `${location}.text`) }
    case 'figure':
      return { type, figure: figure(item.figure, `${location}.figure`), caption: text(item.caption, `${location}.caption`) }
    case 'link':
      return { type, href: editorialLink(item.href, `${location}.href`), text: text(item.text, `${location}.text`) }
    case 'image':
      return { type, ...editorialImage(item, location) }
    case 'table': {
      const columns = list(item.columns, `${location}.columns`).map((value, i) => text(value, `${location}.columns[${i}]`))
      if (!columns.length || columns.length > 12) return fail(location, 'tables need between 1 and 12 column headings')
      const rows = list(item.rows, `${location}.rows`).map((value, rowIndex) => {
        const row = object(value, `${location}.rows[${rowIndex}]`)
        const cells = list(row.cells, `${location}.rows[${rowIndex}].cells`).map((cell, cellIndex) => text(cell, `${location}.rows[${rowIndex}].cells[${cellIndex}]`))
        if (cells.length !== columns.length) return fail(location, 'each table row must match the column count')
        return { cells }
      })
      if (!rows.length) return fail(location, 'tables need at least one data row')
      return { type, columns, rows, ...(item.caption ? { caption: text(item.caption, `${location}.caption`) } : {}) }
    }
    default:
      return fail(location, 'choose a supported paragraph, heading, list, link, image, table, callout or figure block')
  }
}

/** Missing publication permission defaults to a draft, never a public page. */
export function parsePublishedPost(value: unknown, slug: string): BlogPost | undefined {
  if (!slugPattern.test(slug)) return fail(slug, 'filename must contain lowercase letters, numbers and single hyphens')
  const item = object(value, slug)
  if (item.published !== undefined && typeof item.published !== 'boolean') {
    return fail(slug, 'published must be true or false')
  }
  if (item.archived !== undefined && typeof item.archived !== 'boolean') return fail(slug, 'archived must be true or false')
  if (item.published !== true || item.archived === true) return undefined
  const post: BlogPost = {
    slug,
    title: text(item.title, `${slug}.title`),
    description: text(item.description, `${slug}.description`),
    date: isoDate(item.date, `${slug}.date`),
    readingTime: text(item.readingTime, `${slug}.readingTime`),
    figure: figure(item.figure, `${slug}.figure`),
    body: list(item.body, `${slug}.body`).map((entry, i) => block(entry, `${slug}.body[${i}]`)),
  }
  if (!post.body.length) return fail(slug, 'published articles need at least one content block')
  if (item.updated) {
    post.updated = isoDate(item.updated, `${slug}.updated`)
    if (post.updated < post.date) return fail(slug, 'last updated cannot be earlier than publication date')
  }
  if (item.seoTitle) post.seoTitle = text(item.seoTitle, `${slug}.seoTitle`)
  if (item.seoDescription) post.seoDescription = text(item.seoDescription, `${slug}.seoDescription`)
  const featuredImage = optionalObject(item.featuredImage, `${slug}.featuredImage`)
  if (featuredImage) post.featuredImage = editorialImage(featuredImage, `${slug}.featuredImage`)
  const author = optionalObject(item.author, `${slug}.author`)
  if (author) {
    if (author.kind && !['Person', 'Organization'].includes(String(author.kind))) return fail(slug, 'author kind must be Person or Organization')
    post.author = {
      name: text(author.name, `${slug}.author.name`),
      ...(author.url ? { url: editorialLink(author.url, `${slug}.author.url`) } : {}),
      kind: author.kind === 'Organization' ? 'Organization' : 'Person',
    }
  }
  if (item.category) post.category = text(item.category, `${slug}.category`)
  if (item.tags) post.tags = list(item.tags, `${slug}.tags`).map((tag, index) => text(tag, `${slug}.tags[${index}]`))
  if (item.references) {
    post.references = list(item.references, `${slug}.references`).map((entry, i) => {
      const reference = object(entry, `${slug}.references[${i}]`)
      const url = text(reference.url, `${slug}.references[${i}].url`)
      const title = text(reference.title, `${slug}.references[${i}].title`)
      try {
        return { title, url: safeReferenceHref(url) }
      } catch {
        return fail(slug, 'reference links must be HTTP(S) URLs without credentials')
      }
    })
  }
  return post
}

function readJson(filename: string): unknown {
  try {
    return JSON.parse(readFileSync(filename, 'utf8')) as unknown
  } catch (error) {
    throw new Error(`Cannot read content file ${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The directory parameter also supports isolated publication tests. */
export function readPublishedPosts(directory = path.join(contentRoot, 'posts')): BlogPost[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const post = parsePublishedPost(readJson(path.join(directory, entry.name)), entry.name.slice(0, -5))
      if (post) {
        const images = [
          ...(post.featuredImage ? [post.featuredImage] : []),
          ...post.body.filter((block): block is Extract<Block, { type: 'image' }> => block.type === 'image'),
        ]
        for (const image of images) {
          const filename = path.join(process.cwd(), 'public', ...decodeURIComponent(image.src).split('/').slice(1))
          try {
            if (!lstatSync(filename).isFile()) throw new Error('not a regular file')
          } catch {
            return fail(post.slug, `referenced image is missing or not a regular file: ${image.src}`)
          }
        }
      }
      return post ? [post] : []
    })
}

export function parseEditorialContent(value: unknown, location: string): EditorialContent {
  const item = object(value, location)
  const faqMode = item.faqMode ?? 'default'
  if (!['default', 'custom', 'hidden'].includes(String(faqMode))) return fail(location, 'choose a valid FAQ mode')
  const hero = optionalObject(item.hero, `${location}.hero`)
  return {
    heading: text(item.heading, `${location}.heading`),
    introduction: editorialText(item.introduction, `${location}.introduction`),
    sections: list(item.sections ?? [], `${location}.sections`).map((entry, i) => {
      const section = object(entry, `${location}.sections[${i}]`)
      return { heading: text(section.heading, `${location}.sections[${i}].heading`), body: editorialText(section.body, `${location}.sections[${i}].body`, false, true) }
    }),
    faq: list(item.faq ?? [], `${location}.faq`).map((entry, i) => {
      const faq = object(entry, `${location}.faq[${i}]`)
      return { q: text(faq.q, `${location}.faq[${i}].q`), a: editorialText(faq.a, `${location}.faq[${i}].a`) }
    }),
    faqMode: faqMode as EditorialContent['faqMode'],
    links: list(item.links ?? [], `${location}.links`).map((entry, i) => {
      const link = object(entry, `${location}.links[${i}]`)
      return { label: text(link.label, `${location}.links[${i}].label`), href: editorialLink(link.href, `${location}.links[${i}].href`) }
    }),
    relatedTools: list(item.relatedTools ?? [], `${location}.relatedTools`).map((entry, i) => {
      const slug = text(entry, `${location}.relatedTools[${i}]`)
      if (!TOOLS.some(tool => tool.slug === slug)) return fail(location, 'related tools must use existing canonical tool names')
      return slug
    }),
    ...(hero ? { hero: { lead: text(hero.lead, `${location}.hero.lead`), emphasis: text(hero.emphasis, `${location}.hero.emphasis`), description: text(hero.description, `${location}.hero.description`) } } : {}),
    ...(item.steps ? { steps: list(item.steps, `${location}.steps`).map((entry, i) => {
      const step = object(entry, `${location}.steps[${i}]`)
      return { title: text(step.title, `${location}.steps[${i}].title`), description: text(step.description, `${location}.steps[${i}].description`) }
    }) } : {}),
    seoTitle: text(item.seoTitle, `${location}.seoTitle`, true) || undefined,
    seoDescription: text(item.seoDescription, `${location}.seoDescription`, true) || undefined,
  }
}

/** An explicit editor display mode wins over retained custom FAQ rows. */
export function resolveEditorialFaq(content: Pick<EditorialContent, 'faqMode' | 'faq'>, fallback: { q: string; a: string }[]) {
  if (content.faqMode === 'hidden') return []
  return content.faqMode === 'custom' ? content.faq : fallback
}

export function getToolContent(slug: string): EditorialContent {
  const canonical = canonicalSlug(slug)
  if (!canonical || !TOOLS.some(tool => tool.slug === canonical)) return fail(slug, 'unknown tool')
  return parseEditorialContent(readJson(path.join(contentRoot, 'tools', `${canonical}.json`)), `tool/${canonical}`)
}

export function getHomeContent(): EditorialContent {
  return parseEditorialContent(readJson(path.join(contentRoot, 'home', 'home.json')), 'homepage')
}
