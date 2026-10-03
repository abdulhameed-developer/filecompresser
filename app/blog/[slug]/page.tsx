import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { allPostSlugs, getPost, postsByDate } from '@/lib/blog'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript } from '@/lib/seo'
import BlogFigure from '@/components/BlogFigure'

export function generateStaticParams() {
  return allPostSlugs().map((slug) => ({ slug }))
}

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

  const title = post.seoTitle ?? `${post.title} — filecompresser`
  const description = post.seoDescription ?? post.description
  const canonical = absoluteUrl(`/blog/${post.slug}`)

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      title,
      description,
      url: canonical,
      siteName: 'filecompresser',
      publishedTime: post.date,
    },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: true, follow: true },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const others = postsByDate().filter((p) => p.slug !== post.slug).slice(0, 3)

  // Truthful only: headline, dates, author and description. No ratings, review
  // counts, awards or user numbers, because none of those exist here.
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      inLanguage: 'en',
      mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
      author: { '@type': 'Organization', name: 'filecompresser', url: absoluteUrl('/') },
      publisher: { '@type': 'Organization', name: 'filecompresser', url: absoluteUrl('/') },
      image: absoluteUrl('/logo-mark.png'),
      isPartOf: { '@type': 'Blog', name: 'filecompresser blog', url: absoluteUrl('/blog') },
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
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/blog">Blog</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{post.title}</span>
      </nav>

      <div className="sectionLabel">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span className="postMetaDot" aria-hidden="true">
          ·
        </span>
        {post.readingTime} read
      </div>

      <h1>{post.title}</h1>
      <p className="toolIntro">{post.description}</p>

      {post.body.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return <h2 key={i}>{block.text}</h2>
          case 'p':
            return <p key={i}>{block.text}</p>
          case 'ul':
            return (
              <ul key={i}>
                {block.items.map((item) => (
                  <li key={item.slice(0, 40)}>{item}</li>
                ))}
              </ul>
            )
          case 'callout':
            return (
              <aside className="postCallout" key={i}>
                <strong>{block.title}</strong>
                <p>{block.text}</p>
              </aside>
            )
          case 'figure':
            return (
              <figure className="postFigure" key={i}>
                <BlogFigure figure={block.figure} />
                <figcaption>{block.caption}</figcaption>
              </figure>
            )
          default:
            return null
        }
      })}

      <nav className="relatedTools postRelated" aria-labelledby="more-posts">
        <h2 id="more-posts">More from the blog</h2>
        <ul>
          {others.map((other) => (
            <li key={other.slug}>
              <Link href={`/blog/${other.slug}`}>
                {other.title}
                <small>{other.description}</small>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="postFooter">
        <Link className="textLink" href="/blog">
          ← All posts
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
