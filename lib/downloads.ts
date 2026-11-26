import {
  flattenArchivePath,
  sanitizeArchivePath,
  ARCHIVE_LIMITS,
} from './validation'
import type { QueueItem } from './types'

/** A download gets a basename, never an input-supplied path or platform device name. */
export function safeDownloadFilename(filename: string, mimeType = ''): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'application/pdf': 'pdf', 'application/zip': 'zip', 'video/mp4': 'mp4',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'text/plain': 'txt',
  }
  const fallback = `download${extensions[mimeType] ? `.${extensions[mimeType]}` : ''}`
  const visible = filename.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
  const safe = sanitizeArchivePath(flattenArchivePath(visible))?.replace(/[. ]+$/g, '')
  if (!safe || safe === '.' || safe === '..') return fallback
  const dot = safe.lastIndexOf('.')
  const suffix = dot > 0 && safe.length - dot <= 20 ? safe.slice(dot) : ''
  const base = suffix ? safe.slice(0, -suffix.length) : safe
  const encoder = new TextEncoder()
  let shortened = ''
  // Bound UTF-8 bytes, so non-Latin filenames fit common filesystem component limits too.
  for (const character of base) {
    if (encoder.encode(shortened + character + suffix).length > 200) break
    shortened += character
  }
  return shortened ? shortened + suffix : fallback
}

/**
 * Trigger a browser download for a blob.
 *
 * The temporary Object URL is revoked after a grace period — Safari needs
 * the URL to still be alive when the download
 * starts, so an immediate revoke can cancel the save.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeDownloadFilename(filename, blob.type)
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4_000)
}

/** Release a queue item's preview URL. Safe to call more than once. */
export function revokeItemUrl(item: QueueItem): void {
  if (item.objectUrl) {
    URL.revokeObjectURL(item.objectUrl)
    item.objectUrl = undefined
  }
}

function completedItems(items: QueueItem[]): QueueItem[] {
  return items.filter(
    (item) => item.status === 'completed' && item.result?.blob,
  )
}

/**
 * Make names unique inside a ZIP without mangling the extension, so two
 * `photo.jpg` results do not silently overwrite one another.
 */
function uniqueName(used: Set<string>, candidate: string): string {
  let name = candidate
  let n = 2
  while (used.has(name.toLowerCase())) {
    const dot = name.lastIndexOf('.')
    name =
      dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`
    n++
  }
  used.add(name.toLowerCase())
  return name
}

/** Build a ZIP blob from already-encoded results. */
async function zipEntries(entries: Record<string, Uint8Array>): Promise<Blob> {
  const { zip } = await import('fflate')
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    // fflate's async zip delivers the finished archive in a single callback.
    zip(entries, { level: 6 }, (err, chunk) => {
      if (err) reject(err)
      else resolve(chunk)
    })
  })
  return new Blob([bytes], { type: 'application/zip' })
}

/**
 * Bundle every successful result into one ZIP.
 *
 * Failed and cancelled items are deliberately excluded — the archive contains
 * only files that actually exist as real output.
 */
export async function prepareDownloadZip(items: QueueItem[]): Promise<Blob> {
  const done = completedItems(items)
  if (!done.length) throw new Error('No completed results are available to prepare as a ZIP.')

  if (
    done.length > ARCHIVE_LIMITS.maxEntries ||
    done.reduce((sum, item) => sum + item.result!.blob.size, 0) >
      ARCHIVE_LIMITS.maxBatchBytes
  )
    throw new Error('Download fewer than 500 files and 300 MB as one ZIP.')
  const entries: Record<string, Uint8Array> = Object.create(null)
  const used = new Set<string>()
  for (const item of done) {
    const result = item.result!
    const name = uniqueName(
      used,
      safeDownloadFilename(result.filename || item.name, result.mimeType),
    )
    entries[name] = new Uint8Array(await result.blob.arrayBuffer())
  }

  return zipEntries(entries)
}

/** Legacy immediate-save API. Interactive batch UI prepares before a real save link is clicked. */
export async function downloadAllAsZip(
  items: QueueItem[],
  zipName = 'filecompresser-results.zip',
): Promise<void> {
  if (!completedItems(items).length) return
  downloadBlob(await prepareDownloadZip(items), zipName)
}

/**
 * Save each result as its own file, spaced out so the browser does not drop
 * all but the last one when many downloads are fired in quick succession.
 */
export async function downloadItemsIndividually(
  items: QueueItem[],
): Promise<void> {
  const done = completedItems(items)
  for (let i = 0; i < done.length; i++) {
    const item = done[i]
    const result = item.result!
    downloadBlob(result.blob, result.filename || item.name)
    if (i < done.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 220))
    }
  }
}
