'use client'

import { useState } from 'react'
import type { QueueItem } from '@/lib/types'
import { downloadAllAsZip, downloadItemsIndividually } from '@/lib/downloads'

interface DownloadActionsProps {
  items: QueueItem[]
  zipName?: string
  onClear?: () => void
}

export default function DownloadActions({ items, zipName, onClear }: DownloadActionsProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const done = items.filter((item) => item.status === 'completed' && item.result)
  if (!done.length) return null

  const run = async (action: () => Promise<void>, label: string) => {
    setBusy(true)
    setMessage(`${label}…`)
    try {
      await action()
      setMessage(`${label} started.`)
    } catch {
      setMessage('The download could not be prepared. Try again, or use a single-file download.')
    } finally {
      setBusy(false)
    }
  }

  const totalBytes = done.reduce((sum, item) => sum + (item.outputSize ?? 0), 0)

  return (
    <div className="downloadActionsWrap">
      <div className="downloadActions">
        {done.length === 1 ? (
          <button
            type="button"
            className="downloadBtn"
            disabled={busy}
            onClick={() => run(() => downloadItemsIndividually(done), 'Preparing download')}
          >
            Download ↓
          </button>
        ) : (
          <>
            <button
              type="button"
              className="downloadBtn secondary"
              disabled={busy}
              onClick={() => run(() => downloadItemsIndividually(done), 'Preparing downloads')}
            >
              Download all
            </button>
            <button
              type="button"
              className="downloadBtn"
              disabled={busy}
              onClick={() => run(() => downloadAllAsZip(done, zipName), 'Building ZIP')}
            >
              ZIP download ↓
            </button>
          </>
        )}

        {onClear && (
          <button type="button" className="linkBtn" onClick={onClear} disabled={busy}>
            Clear results
          </button>
        )}
      </div>

      <p className="downloadSummary">
        {done.length} file{done.length === 1 ? '' : 's'} ready · {formatTotal(totalBytes)}
      </p>

      <div className="srLive" role="status" aria-live="polite">
        {message}
      </div>
    </div>
  )
}

function formatTotal(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB total`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB total`
}