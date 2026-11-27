import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { STOCK_BLOG_ART } from '../lib/stock-blog-art-data.mjs'

/** All pinned artwork is single-frame RGB WebP with a reviewed VP8 header. */
export async function checkStockBlogArt(root) {
  for (const [figure, variants] of Object.entries(STOCK_BLOG_ART)) {
    for (const [widthText, expectedHash] of Object.entries(variants)) {
      const width = Number(widthText)
      const name = width === 1200 ? `${figure}.webp` : `${figure}-${width}.webp`
      const filename = path.join(root, 'public/blog', name)
      const file = await lstat(filename)
      if (!file.isFile()) throw new Error(`Editorial stock artwork is not a regular file: ${name}`)
      const bytes = await readFile(filename)
      if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) + 8 !== bytes.length ||
          bytes.toString('ascii', 8, 16) !== 'WEBPVP8 ' || !bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) {
        throw new Error(`Invalid reviewed WebP container: ${name}`)
      }
      if ((bytes.readUInt16LE(26) & 16383) !== width || (bytes.readUInt16LE(28) & 16383) !== Math.round(width * 2 / 3)) {
        throw new Error(`Unexpected editorial stock dimensions: ${name}`)
      }
      if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error(`Review changed editorial stock artwork before release: ${name}`)
    }
  }
}
