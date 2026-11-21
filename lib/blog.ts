/** Public editorial data is read from versioned JSON at build time. */
import { readPublishedPosts } from './content'
import { BLOG_ART, articleImage } from './blog-art'
import { ORGANIZATION_NAME } from './seo'

export interface EditorialImage { src: string; alt: string; caption?: string }
export interface PostAuthor { name: string; url?: string; kind?: 'Person' | 'Organization' }

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'link'; href: string; text: string }
  | ({ type: 'image' } & EditorialImage)
  | { type: 'table'; columns: string[]; rows: { cells: string[] }[]; caption?: string }
  | { type: 'callout'; title: string; text: string }
  | { type: 'figure'; figure: FigureId; caption: string }

export type FigureId =
  | 'pipeline'
  | 'sizebars'
  | 'qualitycurve'
  | 'dataflow'
  | 'formattree'

export interface BlogPost {
  slug: string
  title: string
  description: string
  /** ISO date, used for `datePublished` and the byline. */
  date: string
  updated?: string
  readingTime: string
  figure: FigureId
  body: Block[]
  seoTitle?: string
  seoDescription?: string
  references?: { title: string; url: string }[]
  featuredImage?: EditorialImage
  author?: PostAuthor
  category?: string
  tags?: string[]
}

export const BLOG_POSTS: BlogPost[] = readPublishedPosts()

const bySlug = new Map(BLOG_POSTS.map((post) => [post.slug, post]))

export function getPost(slug: string): BlogPost | undefined {
  return bySlug.get(slug)
}

export function allPostSlugs(): string[] {
  return BLOG_POSTS.map((post) => post.slug)
}

/** Newest first; only published documents enter discovery or sitemaps. */
export function postsByDate(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date))
}

/** A custom image is optional; the five existing illustrations stay intact. */
export function postImage(post: BlogPost): EditorialImage {
  return post.featuredImage ?? { src: articleImage(post.figure, true), alt: BLOG_ART[post.figure].alt }
}

/** Never invent a named author for an article without supplied attribution. */
export function postAuthor(post: BlogPost): PostAuthor {
  return post.author ?? { name: ORGANIZATION_NAME, url: '/', kind: 'Organization' }
}
