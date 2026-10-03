export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function savingsPercent(original: number, output: number): number | null {
  if (!original || original <= 0) return null
  return Math.round(((original - output) / original) * 100)
}

export function savingsLabel(original: number, output: number): string {
  const pct = savingsPercent(original, output)
  if (pct === null) return ''
  if (pct > 0) return `${pct}% smaller`
  if (pct < 0) return `${Math.abs(pct)}% larger`
  return 'Similar size'
}

/**
 * A direction word for a result, used where a bare percentage would read as a
 * claim to have saved something.
 */
export function savingsOutcome(original: number, output: number): 'reduced' | 'similar' | 'larger' {
  if (!original || original <= 0) return 'similar'
  if (output < original) return 'reduced'
  if (output > original) return 'larger'
  return 'similar'
}

/**
 * "12.4 MB → 4.8 MB · 61% smaller" — the one line that describes a result.
 *
 * Returns a neutral description when the output came out the same size or
 * larger, so a failed reduction is never presented as a saving.
 */
export function savingsSummary(original: number, output: number): string {
  if (!original || original <= 0) return formatBytes(output)
  const pct = savingsPercent(original, output)
  const arrow = `${formatBytes(original)} → ${formatBytes(output)}`
  if (pct === null) return arrow
  if (pct > 0) return `${arrow} · ${pct}% smaller`
  if (pct < 0) return `${arrow} · ${Math.abs(pct)}% larger than the original`
  return `${arrow} · no size change`
}

export function replaceExtension(filename: string, newExt: string): string {
  const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename
  const ext = newExt.startsWith('.') ? newExt.slice(1) : newExt
  return `${base}.${ext}`
}

export function suffixFilename(filename: string, suffix: string): string {
  const i = filename.lastIndexOf('.')
  if (i < 0) return `${filename}${suffix}`
  return `${filename.slice(0, i)}${suffix}${filename.slice(i)}`
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    zip: 'application/zip',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    svg: 'image/svg+xml',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  return new Uint8Array(await new Response(blob).arrayBuffer())
}
