'use client'

import type { QueueItem, ToolDefinition } from '@/lib/types'
import { formatBytes, savingsLabel } from '@/lib/format'
import { downloadBlob } from '@/lib/downloads'

interface FileItemProps {
  item: QueueItem
  tool: ToolDefinition
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onCancel: (id: string) => void
}

/**
 * Whether this tool shrinks files or changes their format.
 *
 * It decides how an output that came out *larger* is explained: "already
 * efficiently compressed" is only true of a compressor. A converter growing its
 * input is the expected consequence of changing format.
 */
const COMPRESSION_ENGINES = new Set([
  'image-compress',
  'gif-compress',
  'video-compress',
  'audio-compress',
  'pdf-compress',
])

export default function FileItem({ item, tool, onRemove, onRetry, onCancel }: FileItemProps) {
  const extension = item.name.split('.').pop()?.toUpperCase() || 'FILE'
  const canDownload = item.status === 'completed' && !!item.result
  const canRetry = item.status === 'failed' || item.status === 'cancelled'
  const canCancel = item.status === 'processing'
  const isCompression = COMPRESSION_ENGINES.has(tool.engine)

  return (
    <li className={`file status-${item.status}`}>
      <span className="fileIcon" aria-hidden="true">
        {extension.slice(0, 4)}
      </span>

      <div className="fileMeta">
        <strong title={item.name}>{item.name}</strong>

        <small className="fileFacts">
          <span>{formatBytes(item.originalSize)}</span>
          {item.outputSize != null && (
            <>
              <span aria-hidden="true"> → </span>
              <span className="srInline">{item.name} is now</span>
              <span>{formatBytes(item.outputSize)}</span>
            </>
          )}
        </small>

        <small className="fileStatus">
          {item.outputSize != null && item.originalSize > 0 && (
            <span className={`savings ${savingsTone(item.originalSize, item.outputSize)}`}>
              {savingsLabel(item.originalSize, item.outputSize)}
            </span>
          )}
          {/*
            An output that came out bigger is not a success story, and a bare
            "2% larger" reads like a footnote. When the result is genuinely
            larger, say so in words so the user is never left believing the
            tool compressed something it did not.

            The reason is tool-dependent: a converter that rasterises or
            transcodes into a different format is *expected* to grow the file
            (a PDF turned into page images is the obvious case), so claiming it
            was "already efficiently compressed" there would be nonsense. Only
            the compression tools get that explanation.
          */}
          {item.outputSize != null &&
            item.originalSize > 0 &&
            item.outputSize > item.originalSize * 1.05 && (
              <span className="savingsWords">
                Output is larger than the original
                {isCompression
                  ? ' — this file was already efficiently compressed.'
                  : ' — expected, because this tool converts into a different format.'}
              </span>
            )}
          {item.status === 'processing' && item.stage && <span>{item.stage}</span>}
          {item.status === 'processing' && !item.stage && (
            <span>{item.progress > 0 ? `Processing ${item.progress}%` : 'Processing…'}</span>
          )}
          {item.status === 'queued' && <span>Ready</span>}
          {item.status === 'validating' && <span>Checking…</span>}
          {item.status === 'completed' && <span>Done</span>}
          {item.status === 'cancelled' && <span>Cancelled</span>}
          {item.status === 'failed' && <span className="failedLabel">Failed</span>}
        </small>

        {item.status === 'processing' && (
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            // FFmpeg reports against output duration; when a stage has no
            // measurable percentage we say so rather than inventing one.
            aria-valuenow={item.progress > 0 ? Math.round(item.progress) : undefined}
            aria-valuetext={item.stage ?? 'Processing'}
            aria-label={`Processing ${item.name}`}
          >
            <div
              className={`progressBar${item.progress > 0 ? '' : ' indeterminate'}`}
              style={item.progress > 0 ? { width: `${item.progress}%` } : undefined}
            />
          </div>
        )}

        {item.status === 'failed' && item.error && (
          <p className="fileError" role="alert">
            {item.error}
          </p>
        )}

        {item.status === 'completed' && item.targetNote && (
          <p className="fileNote">{item.targetNote}</p>
        )}
      </div>

      <div className="fileActions">
        {canDownload && (
          <button
            type="button"
            className="linkBtn"
            onClick={() => downloadBlob(item.result!.blob, item.result!.filename)}
          >
            Download
            <span className="srInline"> {item.result!.filename}</span>
          </button>
        )}
        {canRetry && (
          <button type="button" className="linkBtn" onClick={() => onRetry(item.id)}>
            Retry
            <span className="srInline"> {item.name}</span>
          </button>
        )}
        {canCancel && (
          <button type="button" className="linkBtn" onClick={() => onCancel(item.id)}>
            Cancel
            <span className="srInline"> processing of {item.name}</span>
          </button>
        )}
        <button
          type="button"
          className="iconBtn"
          aria-label={`Remove ${item.name}`}
          onClick={() => onRemove(item.id)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </li>
  )
}

function savingsTone(original: number, output: number): string {
  if (output <= original) return 'good'
  if (output <= original * 1.02) return 'neutral'
  return 'larger'
}