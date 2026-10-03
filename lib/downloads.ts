import { zip } from 'fflate'
import { flattenArchivePath } from './validation'
import type { QueueItem } from './types'

/**
 * Trigger a browser download for a blob.
 *
 * The temporary Object URL is revoked on the next tick *and* after a longer
 * grace period — Safari needs the URL to still be alive when the download
 * starts, so an immediate revoke can cancel the save.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
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
  return items.filter((item) => item.status === 'completed' && item.result?.blob)
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
    name = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`
    n++
  }
  used.add(name.toLowerCase())
  return name
}

/** Build a ZIP blob from already-encoded results. */
async function zipEntries(entries: Record<string, Uint8Array>): Promise<Blob> {
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
export async function downloadAllAsZip(
  items: QueueItem[],
  zipName = 'filecompresser-results.zip'
): Promise<void> {
  const done = completedItems(items)
  if (!done.length) return

  const entries: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  for (const item of done) {
    const result = item.result!
    const name = uniqueName(used, flattenArchivePath(result.filename || item.name))
    entries[name] = new Uint8Array(await result.blob.arrayBuffer())
  }

  downloadBlob(await zipEntries(entries), zipName)
}

/**
 * Save each result as its own file, spaced out so the browser does not drop
 * all but the last one when many downloads are fired in quick succession.
 */
export async function downloadItemsIndividually(items: QueueItem[]): Promise<void> {
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