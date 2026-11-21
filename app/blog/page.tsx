import Link from 'next/link'
import Image from 'next/image'
import { BLOG_POSTS, postImage, postsByDate } from '@/lib/blog'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd, SITE_NAME } from '@/lib/seo'
import BlogImage from '@/components/BlogImage'
import { BLOG_ART } from '@/lib/blog-art'
import ManagedPageSections from '@/components/ManagedPageSections'
import { getManagedPage, managedPageMetadata } from '@/lib/managed-pages'

const page = getManagedPage('blog')
const DESCRIPTION = page.seoDescription
export const metadata = {
  ...managedPageMetadata('blog'),
  openGraph: { type: 'website' as const, url: absoluteUrl('/blog'), siteName: SITE_NAME, title: page.seoTitle, description: DESCRIPTION, images: [{ url: absoluteUrl('/blog/formattree.jpg'), width: 1200, height: 800 }] },
}

const structuredData = [
  webPageJsonLd({ name: 'filecompresser blog', description: DESCRIPTION, path: '/blog' }),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
  ]),
  {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'filecompresser blog',
    description: DESCRIPTION,
    url: absoluteUrl('/blog'),
    inLanguage: 'en',
    blogPost: BLOG_POSTS.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: absoluteUrl(`/blog/${post.slug}`),
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
      image: absoluteUrl(postImage(post).src),
    })),
  },
]

export default function BlogIndexPage() {
  const posts = postsByDate()

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
