'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { QueueItem } from '@/lib/types'
import { prepareDownloadZip, downloadItemsIndividually, safeDownloadFilename } from '@/lib/downloads'
import { formatBytes } from '@/lib/format'
import Icon from './Icon'

interface DownloadActionsProps { items: QueueItem[]; zipName?: string; onClear?: () => void; compact?: boolean; previous?: boolean; olderCount?: number }
interface PreparedZip { key: string; url: string; filename: string; count: number }
const blobIds = new WeakMap<Blob, number>()
let nextBlobId = 0
function blobId(blob: Blob) { let id = blobIds.get(blob); if (!id) { id = ++nextBlobId; blobIds.set(blob, id) } return id }

export default function DownloadActions({ items, zipName, onClear, compact, previous, olderCount = 0 }: DownloadActionsProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [prepared, setPrepared] = useState<PreparedZip | null>(null)
  const preparedUrl = useRef<string | null>(null)
  const generation = useRef(0)
  const contextId = useId()
  const done = items.filter(item => item.result?.blob)
  // Draft edits and status updates do not invalidate an unchanged saved artifact.
  const key = done.map(item => `${item.sourceId || item.id}:${blobId(item.result!.blob)}:${item.result!.filename}`).join('|')
  useEffect(() => {
    generation.current += 1
    setBusy(false); setMessage(''); setPrepared(null)
    return () => {
      generation.current += 1
      if (preparedUrl.current) URL.revokeObjectURL(preparedUrl.current)
      preparedUrl.current = null
    }
  }, [key, zipName])
  if (!done.length) return null

  const prepareZip = async () => {
    const request = ++generation.current
    setBusy(true); setMessage('Preparing ZIP…')
    try {
      const blob = await prepareDownloadZip(done)
      if (request !== generation.current) return
      const url = URL.createObjectURL(blob)
      if (preparedUrl.current) URL.revokeObjectURL(preparedUrl.current)
      preparedUrl.current = url
      setPrepared({ key, url, filename: safeDownloadFilename(zipName || 'filecompresser-results.zip', 'application/zip'), count: done.length })
      setMessage('ZIP ready. Choose Save ZIP to download.')
    } catch { if (request === generation.current) setMessage('Could not prepare the ZIP. Try again or download each result.') }
    finally { if (request === generation.current) setBusy(false) }
  }
  const saveSingle = async () => {
    const request = ++generation.current
    setBusy(true); setMessage('Preparing download…')
    try { await downloadItemsIndividually(done); if (request === generation.current) setMessage('Your browser is handling the download.') }
    catch { if (request === generation.current) setMessage('Could not start the download. Please try again.') }
    finally { if (request === generation.current) setBusy(false) }
  }
  const clear = () => {
    generation.current++
    if (preparedUrl.current) URL.revokeObjectURL(preparedUrl.current)
    preparedUrl.current = null
    setPrepared(null); setBusy(false); setMessage(''); onClear?.()
  }
  const ready = prepared?.key === key ? prepared : null
  const total = done.reduce((sum, item) => sum + item.result!.blob.size, 0)
  const older = previous ? done.length : Math.min(done.length, Math.max(0, olderCount))
  const allPrevious = older === done.length
  const mixed = older > 0 && !allPrevious

  return <div className={`downloadActionsWrap${compact ? ' compactDownloads' : ''}${allPrevious ? ' previousDownloads' : ''}`}>
    {!compact && <div className="downloadResultsHeading"><div><h3>{allPrevious ? 'Previous results' : mixed ? 'Available outputs' : 'Downloads ready'}</h3><p>{done.length} file{done.length === 1 ? '' : 's'} · {formatBytes(total)} · {total.toLocaleString('en-US')} bytes</p></div></div>}
    <div className="downloadActions">
      {done.length === 1 ? <button type="button" className={`downloadBtn${allPrevious ? ' secondary' : ''}`} disabled={busy} onClick={saveSingle} aria-describedby={mixed ? contextId : undefined}>{busy ? 'Preparing…' : allPrevious ? 'Download previous' : 'Download file'}<Icon name="download" /></button>
        : ready ? <a className={`downloadBtn${allPrevious ? ' secondary' : ''}`} href={ready.url} download={ready.filename} aria-describedby={mixed ? contextId : undefined}>Save {allPrevious ? 'previous ' : mixed ? 'available ' : ''}ZIP ({ready.count} files)<Icon name="download" /></a>
          : <button type="button" className={`downloadBtn${allPrevious ? ' secondary' : ''}`} disabled={busy} onClick={prepareZip} aria-describedby={mixed ? contextId : undefined}>{busy ? 'Preparing ZIP…' : allPrevious ? `Prepare previous ZIP (${done.length})` : mixed ? `Prepare available ZIP (${done.length})` : compact ? `Prepare ZIP (${done.length} files)` : `Prepare ${done.length} results as ZIP`}<Icon name="download" /></button>}
      {onClear && <button type="button" className="linkBtn" onClick={clear}>Remove completed files</button>}
    </div>
    {mixed && <p className="downloadSummary" id={contextId}>{done.length - older} current · {older} previous result{older === 1 ? '' : 's'}</p>}
    {message && <p className="downloadSummary" role="status" aria-live="polite">{message}</p>}
  </div>
}
