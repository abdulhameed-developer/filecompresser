import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { postImage, postsByDate } from '@/lib/blog'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd, SITE_NAME } from '@/lib/seo'
import BlogImage from '@/components/BlogImage'
import { BLOG_ART } from '@/lib/blog-art'
import ManagedPageSections from '@/components/ManagedPageSections'
import { getManagedPage, managedPageMetadata } from '@/lib/managed-pages'

export function generateMetadata(): Metadata {
  const metadata = managedPageMetadata('blog')
  const image = { url: absoluteUrl('/blog/formattree.jpg'), width: 1200, height: 800, alt: BLOG_ART.formattree.alt }
  return { ...metadata, openGraph: { ...metadata.openGraph, images: [image] }, twitter: { ...metadata.twitter, images: [image] } }
}


export default function BlogIndexPage() {
  const page = getManagedPage('blog')
  const posts = postsByDate()
  const structuredData = [
    webPageJsonLd({ name: `${SITE_NAME} blog`, description: page.seoDescription, path: '/blog' }),
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: `${SITE_NAME} blog`,
      description: page.seoDescription,
      url: absoluteUrl('/blog'),
      inLanguage: 'en',
      blogPost: posts.map((post) => ({
        '@type': 'BlogPosting',
        headline: post.title,
        url: absoluteUrl(`/blog/${post.slug}`),
        datePublished: post.date,
        dateModified: post.updated ?? post.date,
        image: absoluteUrl(postImage(post).src),
      })),
    },
  ]

  return (
    <div className="blogPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Blog</span>
      </nav>

      <div className="sectionLabel">{page.label}</div>
      <h1>{page.title}</h1>
      <p className="toolIntro">
        {page.introduction}
      </p>

      {posts.length === 0 && <p>No published guides yet. <Link href="/#tools">Explore the file tools</Link>.</p>}
      <ul className="postList">
        {posts.map((post) => (
          <li key={post.slug} className="postCard">
            <Link className="postCardLink" href={`/blog/${post.slug}`}>
              <div className="postCardArt">
                {post.featuredImage ? <Image src={post.featuredImage.src} alt={post.featuredImage.alt} width={1200} height={800} sizes="(max-width: 760px) 100vw, 540px" style={{ width: '100%', height: 'auto' }} /> : <BlogImage figure={post.figure} sizes="(max-width: 760px) 100vw, 540px" />}
              </div>
              <div className="postCardBody">
                <span className="articleCategory">{post.category ?? BLOG_ART[post.figure].category}</span>
                <h2>{post.title}</h2>
                <p>{post.description}</p>
                <div className="postMeta">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{post.readingTime} read</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <ManagedPageSections sections={page.sections} />
    </div>
  )
}

function formatDate(iso: string): string {
  // Fixed locale and UTC so the rendered date never shifts with the server's
  // timezone, which would make the same post show different days to users.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
