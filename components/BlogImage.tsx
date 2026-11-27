import Image from 'next/image'
import type { FigureId } from '@/lib/blog'
import { BLOG_ART, articleImage } from '@/lib/blog-art'

/** Pre-sized WebP sources avoid runtime encoding; preserve an authored fallback. */
export default function BlogImage({ figure, sizes, priority = false, alt = BLOG_ART[figure].alt, fallbackSrc = articleImage(figure, true) }: { figure: FigureId; sizes: string; priority?: boolean; alt?: string; fallbackSrc?: string }) {
  return <picture>
    <source type="image/webp" srcSet={`/blog/${figure}-640.webp 640w, /blog/${figure}-768.webp 768w, /blog/${figure}.webp 1200w`} sizes={sizes} />
    <Image src={fallbackSrc} alt={alt} width={1200} height={800} sizes={sizes} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} />
  </picture>
}
