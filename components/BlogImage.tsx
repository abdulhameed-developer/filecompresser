import Image from 'next/image'
import type { FigureId } from '@/lib/blog'
import { BLOG_ART, articleImage } from '@/lib/blog-art'

/** Pre-sized WebP sources avoid runtime encoding; JPEG is the browser fallback. */
export default function BlogImage({ figure, sizes, priority = false }: { figure: FigureId; sizes: string; priority?: boolean }) {
  return <picture>
    <source type="image/webp" srcSet={`/blog/${figure}-640.webp 640w, /blog/${figure}.webp 1200w`} sizes={sizes} />
    <Image src={articleImage(figure, true)} alt={BLOG_ART[figure].alt} width={1200} height={800} sizes={sizes} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} />
  </picture>
}
