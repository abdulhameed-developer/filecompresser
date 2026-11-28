'use client'
import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { BlogPost } from '@/lib/blog'
import { postDateLabel, postUpdatedDate } from '@/lib/blog-dates'
import BlogImage from './BlogImage'
import Icon from './Icon'
export default function FeaturedGuides({ posts }: { posts: Pick<BlogPost, 'slug' | 'title' | 'figure' | 'readingTime' | 'featuredImage' | 'date' | 'updated'>[] }) {
  const rail = useRef<HTMLDivElement>(null)
  const id = useId()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const element = rail.current
    if (!element) return
    const update = () => {
      const cards = [...element.children] as HTMLElement[]
      let nearest = 0
      let distance = Infinity
      cards.forEach((card, i) => { const delta = Math.abs(card.offsetLeft - element.scrollLeft); if (delta < distance) { nearest = i; distance = delta } })
      setIndex(nearest)
    }
    element.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update); resize.observe(element); update()
    return () => { element.removeEventListener('scroll', update); resize.disconnect() }
  }, [posts])
  const move = (direction: number) => {
    const element = rail.current
    if (!element) return
    const target = element.children[Math.max(0, Math.min(posts.length - 1, index + direction))] as HTMLElement | undefined
    if (target) element.scrollTo({ left: target.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  if (!posts.length) return null
  return <section className="featuredGuides" aria-labelledby="featured-heading">
    <div className="sectionHeading"><div><span className="sectionLabel">THE FILE GUIDE</span><h2 id="featured-heading">Make the right file choice.</h2></div><Link prefetch={false} className="tertiaryAction" href="/blog">All guides<Icon name="arrow" /></Link></div>
    <div id={id} className="guideRail" ref={rail} onKeyDown={event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1) }
    }}>
      {posts.map(post => <Link prefetch={false} className="editorialCard" key={post.slug} href={`/blog/${post.slug}`} onFocus={event => {
        if (rail.current && rail.current.scrollWidth > rail.current.clientWidth) {
          const left = event.currentTarget.offsetLeft
          rail.current.scrollTo({ left, behavior: 'instant' })
        }
      }}>{post.featuredImage ? <picture><Image src={post.featuredImage.src} alt={post.featuredImage.alt} width={1200} height={800} sizes="(max-width:760px) calc(100vw - 40px), 350px" /></picture> : <BlogImage figure={post.figure} sizes="(max-width:760px) calc(100vw - 40px), 350px" />}<div><span className="editorialMeta"><time dateTime={postUpdatedDate(post)}>Updated {postDateLabel(postUpdatedDate(post))}</time> · {post.readingTime} read</span><h3>{post.title}</h3><Icon name="arrow" /></div></Link>)}
    </div>
    {posts.length > 1 && <div className="railControls"><span role="status" aria-live="polite">{index + 1} of {posts.length} guides</span><button type="button" aria-label="Previous guide" aria-controls={id} disabled={index === 0} onClick={() => move(-1)}><Icon name="arrow-left" /></button><button type="button" aria-label="Next guide" aria-controls={id} disabled={index === posts.length - 1} onClick={() => move(1)}><Icon name="arrow" /></button></div>}
  </section>
}
