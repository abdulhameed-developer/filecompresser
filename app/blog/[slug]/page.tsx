import Icon from '@/components/Icon'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { allPostSlugs, getPost, postAuthor, postImage, postsByDate } from '@/lib/blog'
import { ORGANIZATION_NAME, SITE_NAME, SITE_WORDMARK, SITE_INDEXABLE, absoluteUrl, breadcrumbJsonLd, jsonLdScript } from '@/lib/seo'
import BlogContent from '@/components/BlogContent'
import BlogImage from '@/components/BlogImage'
import { BLOG_ART } from '@/lib/blog-art'
import { getTool } from '@/lib/tools'

export function generateStaticParams() {
  return allPostSlugs().map((slug) => ({ slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)

  if (!post) {
    return { title: 'Post not found', robots: { index: false, follow: true } }
  }

  const title = post.seoTitle ?? post.title
  const description = post.seoDescription ?? post.description
  const canonical = absoluteUrl(`/blog/${post.slug}`)
  const image = postImage(post)
  const author = postAuthor(post)

  return {
    title,
    description,
    alternates: { canonical },
    authors: [{ name: author.name, ...(author.url ? { url: absoluteUrl(author.url) } : {}) }],
    ...(post.tags?.length ? { keywords: post.tags } : {}),
    openGraph: {
      type: 'article',
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      images: [{ url: absoluteUrl(image.src), alt: image.alt, ...(!post.featuredImage ? { width: 1200, height: 800 } : {}) }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [absoluteUrl(image.src)] },
    robots: { index: SITE_INDEXABLE, follow: true },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()
  const image = postImage(post)
  const author = postAuthor(post)

  const others = postsByDate()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3)
  const sections = post.body.flatMap((block, index) => block.type === 'h2' ? [{ index, text: block.text }] : [])

  // Truthful only: headline, dates, author and description. No ratings, review
  // counts, awards or user numbers, because none of those exist here.
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
      inLanguage: 'en',
      mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
      author: {
        '@type': author.kind ?? 'Person',
        name: author.name,
        ...(author.url ? { url: absoluteUrl(author.url) } : {}),
      },
      publisher: {
        '@type': 'Organization',
        name: ORGANIZATION_NAME,
        url: absoluteUrl('/'),
      },
      image: absoluteUrl(image.src),
      articleSection: post.category ?? BLOG_ART[post.figure].category,
      ...(post.tags?.length ? { keywords: post.tags.join(', ') } : {}),
      isPartOf: {
        '@type': 'Blog',
        name: `${SITE_WORDMARK} blog`,
        url: absoluteUrl('/blog'),
      },
    },
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
  ]

  return (
    <article className="blogPage postPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link prefetch={false} href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link prefetch={false} href="/blog">Blog</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{post.title}</span>
      </nav>

      <div className="sectionLabel">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span className="postMetaDot" aria-hidden="true">
          ·
        </span>
        {post.readingTime} read
        <span className="postMetaDot" aria-hidden="true">·</span>
        <span>By {author.url ? <Link prefetch={false} href={author.url}>{author.name}</Link> : author.name}</span>
      </div>

      <h1>{post.title}</h1>
      <p className="toolIntro">{post.description}</p>
      {post.updated && post.updated !== post.date && <p className="postUpdated">Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time></p>}

      <figure className="articleHero">
        {post.featuredImage ? <Image src={image.src} alt={image.alt} width={1200} height={800} sizes="(max-width: 860px) 100vw, 860px" loading="eager" fetchPriority="high" style={{ width: '100%', height: 'auto' }} /> : <BlogImage figure={post.figure} sizes="(max-width: 860px) 100vw, 860px" priority />}
        {image.caption && <figcaption>{image.caption}</figcaption>}
      </figure>
      {post.tags?.length ? <ul className="postTags" aria-label="Article topics">{post.tags.map(tag => <li key={tag}>{tag}</li>)}</ul> : null}
      {sections.length > 0 && <nav className="articleContents" aria-label="On this page">
        <strong>In this guide</strong>
        <ol>{sections.map(section => <li key={section.index}><a href={`#section-${section.index}`}>{section.text}</a></li>)}</ol>
      </nav>}
      <BlogContent blocks={post.body} />

      {post.references && <section className="articleReferences" aria-labelledby="references-heading"><h2 id="references-heading">Further reading</h2><ul>{post.references.map(reference => <li key={reference.url}><a href={reference.url}>{reference.title}</a></li>)}</ul></section>}
      <aside className="articleToolCta" aria-label="Try these tools">
        <h2>Put this guide into practice</h2>
        <p>Choose a tool and process your files on your own device.</p>
        <div>{BLOG_ART[post.figure].tools.map(slug => <Link prefetch={false} key={slug} href={`/${slug}`}>{getTool(slug)?.title}<Icon name="arrow" /></Link>)}</div>
      </aside>
      <nav className="relatedTools postRelated" aria-labelledby="more-posts">
        <h2 id="more-posts">More from the blog</h2>
        <ul>
          {others.map((other) => (
            <li key={other.slug}>
              <Link prefetch={false} href={`/blog/${other.slug}`}>
                {other.title}
                <small>{other.description}</small>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="postFooter">
        <Link prefetch={false} className="textLink" href="/blog">
          <Icon name="arrow-left" />All posts
        </Link>
      </p>
    </article>
  )
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
