import 'server-only'

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { FigureId } from './blog'
import { STOCK_BLOG_ART } from './stock-blog-art-data.mjs'

// Only these reviewed stock bytes have the bundled responsive derivatives.
// An author can replace an upload at the same URL; never substitute old art.
const stockHashes: Record<FigureId, Record<640 | 768 | 1200, string>> = STOCK_BLOG_ART

/** Resolve only exact stock aliases at build/render time, never an arbitrary path. */
export function stockBlogFigure(src: string): FigureId | undefined {
  for (const figure of Object.keys(stockHashes) as FigureId[]) {
    const upload = `/uploads/${figure}.webp`
    const canonical = `/blog/${figure}.webp`
    if (src !== upload && src !== canonical) continue
    try {
      const directory = path.join(process.cwd(), 'public')
      const full = readFileSync(path.join(directory, 'blog', `${figure}.webp`))
      const authored = src === upload
        ? readFileSync(path.join(directory, 'uploads', `${figure}.webp`))
        : full
      const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
      const derivativesReady = [640, 768].every(width => {
        const file = statSync(path.join(directory, 'blog', `${figure}-${width}.webp`))
        return file.isFile() && file.size > 0
      })
      return derivativesReady && hash(full) === stockHashes[figure][1200] && hash(authored) === stockHashes[figure][1200]
        ? figure : undefined
    } catch {
      // Missing/replaced custom images keep their authored source and fallback.
      return undefined
    }
  }
  return undefined
}
