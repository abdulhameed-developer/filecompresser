import { lstat, open, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const extensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
const startsWith = (bytes, signature) => bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)

/** Basic format signatures, coupled with raster-only names and safe MIME types. */
export function isRasterSignature(bytes, extension) {
  const text = (start, end) => Buffer.from(bytes.subarray(start, end)).toString('ascii')
  switch (extension.toLowerCase()) {
    case '.jpg': case '.jpeg': return startsWith(bytes, [255, 216, 255]) && bytes.length >= 4
    case '.png': return startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10]) && bytes.length >= 24 && text(12, 16) === 'IHDR'
    case '.gif': return bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(text(0, 6))
    case '.webp': return bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP'
    case '.avif': {
      if (bytes.length < 16 || text(4, 8) !== 'ftyp') return false
      const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
      if (size < 16 || size > bytes.length || size % 4 !== 0) return false
      if (['avif', 'avis'].includes(text(8, 12))) return true
      for (let index = 16; index + 4 <= size; index += 4) if (['avif', 'avis'].includes(text(index, index + 4))) return true
      return false
    }
    default: return false
  }
}

/** Only repo-managed raster images are allowed into the public media folder. */
export async function checkUploads(root = process.cwd()) {
  const directory = path.join(root, 'public/uploads')
  const uploads = []
  async function inspect(current) {
    let details
    try { details = await lstat(current) }
    catch (error) { if (error.code === 'ENOENT' && current === directory) return; throw error }
    const label = path.relative(root, current)
    if (details.isSymbolicLink()) throw new Error(`Unsafe upload: symbolic links are not allowed (${label}).`)
    if (details.isDirectory()) {
      for (const entry of await readdir(current)) {
        if (entry.startsWith('.') || /[\\\u0000-\u001f\u007f]/.test(entry)) throw new Error(`Unsafe upload name in ${label}.`)
        await inspect(path.join(current, entry))
      }
      return
    }
    if (!details.isFile()) throw new Error(`Unsafe upload: only image files and folders are allowed (${label}).`)
    const extension = path.extname(current).toLowerCase()
    if (!extensions.has(extension)) throw new Error(`Unsupported upload: ${label}. Use JPG, PNG, WEBP, GIF or AVIF.`)
    if (details.size < 1 || details.size > MAX_UPLOAD_BYTES) throw new Error(`Upload ${label} must be nonempty and at most 10 MiB.`)
    const handle = await open(current, 'r')
    let header
    try {
      const buffer = Buffer.alloc(Math.min(details.size, 4096))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      header = buffer.subarray(0, bytesRead)
    } finally { await handle.close() }
    if (!isRasterSignature(header, extension)) throw new Error(`Upload ${label} does not match its raster image format.`)
    uploads.push({ path: path.relative(directory, current), size: details.size })
  }
  await inspect(directory)
  return uploads
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Validated ${(await checkUploads()).length} raster uploads (10 MiB maximum per image).`)
}
