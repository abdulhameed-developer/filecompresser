import type { Metadata } from 'next'
import Link from 'next/link'
import { BLOG_POSTS, postsByDate } from '@/lib/blog'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'
import BlogFigure from '@/components/BlogFigure'

const DESCRIPTION =
  'Notes on how browser-based compression works, why honest size reporting matters, and what these tools do and do not promise.'

export const metadata: Metadata = {
  title: 'Blog',
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/blog') },
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

      <div className="sectionLabel">BLOG</div>
      <h1>Notes on how this actually works</h1>
      <p className="toolIntro">
        Everything here is about the tools on this site: how they compress, what they refuse
        to claim, and where their limits are. No growth-hacking, no listicles.
      </p>

      <ul className="postList">
        {posts.map((post) => (
          <li key={post.slug} className="postCard">
            <Link className="postCardLink" href={`/blog/${post.slug}`}>
              <div className="postCardArt">
                <BlogFigure figure={post.figure} />
              </div>
              <div className="postCardBody">
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
