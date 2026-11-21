'use client'

import Icon from './Icon'

import { useCallback, useMemo, useState } from 'react'
import type { ToolDefinition } from '@/lib/types'
import { useFileQueue } from '@/lib/useFileQueue'
import { savingsSummary } from '@/lib/format'
import FileDropzone from './FileDropzone'
import FileItem from './FileItem'
import CompressionSettings from './CompressionSettings'
import OutputFormatPicker from './OutputFormatPicker'
import DownloadActions from './DownloadActions'

interface ToolWorkspaceProps {
  tool: ToolDefinition
  formatsLabel?: string
}

export default function ToolWorkspace({
  tool,
  formatsLabel,
}: ToolWorkspaceProps) {
  const queue = useFileQueue(tool)
  const {
    items,
    busy,
    status,
    addFiles,
    removeItem,
    cancelItem,
    cancelAll,
    runAll,
    retryItem,
    pendingCount,
    validatingCount,
    completedCount,
    failedCount,
  } = queue

  const [summaryOpen, setSummaryOpen] = useState(false)

  const isCollective = tool.engine === 'zip-create'
  const processing = items.some((item) => item.status === 'processing')
  const busyDisabled = busy || processing

  // The format picker is driven by the first queued file, because it answers
  // "what should this download be?" — a question about the input the user added.
  const formatSource = useMemo(() => {
    const candidate = items.find((item) => item.status === 'queued') ?? items[0]
    return candidate && candidate.file.size > 0 ? candidate.file : null
  }, [items])

  const totalOriginal = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.status === 'completed' && item.comparison !== 'extraction',
        )
        .reduce((sum, item) => sum + item.originalSize, 0),
    [items],
  )
  const totalOutput = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.status === 'completed' && item.comparison !== 'extraction',
        )
        .reduce((sum, item) => sum + (item.outputSize ?? 0), 0),
    [items],
  )

  // The batch headline must never imply a saving that did not happen. A batch
  // whose output is larger says so, in words.
  const batchSavings = useMemo(
    () =>
      completedCount > 0 ? savingsSummary(totalOriginal, totalOutput) : '',
    [completedCount, totalOriginal, totalOutput],
  )

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      addFiles(files)
    },
    [addFiles],
  )

  const actionLabel = actionVerb(tool)
  const canStart = pendingCount > 0 && !busyDisabled && validatingCount === 0
  const hasItems = items.length > 0
  const hasSettings = !['pdf-compress', 'zip-create', 'zip-extract'].includes(tool.engine) || Boolean(tool.settings?.length) || Boolean(formatSource && supportsOutputPicker(tool))

  return (
    <section
      className="compressCard toolCard"
      aria-label={`${tool.title} upload area`}
    >
      <ol className="workspaceSteps" aria-label="File processing steps">
        {['Select files', 'Configure', 'Process', 'Download'].map((label, index) => {
          const current = busyDisabled ? 2 : pendingCount > 0 ? 1 : completedCount > 0 ? 3 : 0
          return <li key={label} aria-current={index === current ? 'step' : undefined}><b aria-hidden="true">{index + 1}</b>{label}</li>
        })}
      </ol>
      <div className="cardTop">
        <div>
          {/* No heading here: the page's H1 is the tool title, and a second
              heading repeating it was read twice by every screen reader. */}
          <p className="cardIntro">
            Choose files, review settings, then process privately on this
            device.
          </p>
        </div>
        <span className="limit">
          MAX {formatLimit(tool.maxFileSize)} PER FILE
        </span>
      </div>

      <FileDropzone
        accept={tool.accept}
        multiple={tool.engine !== 'zip-extract'}
        disabled={busyDisabled}
        formats={
          formatsLabel ??
          (tool.extensions.length
            ? tool.extensions.map((ext) => ext.toUpperCase()).join(' · ')
            : 'Any file type')
        }
        onFiles={handleFiles}
      />

      <p className="queueLimit">Up to 500 files / 300 MB per queue{tool.category === 'image' ? ' · 32 megapixels per image' : ''}.</p>

      {hasItems && (
        <>
          <div className="queueSummary">
            <span>
              {items.length} file{items.length === 1 ? '' : 's'}
            </span>
            {completedCount > 0 && (
              <span className="summarySavings">
                {totalOriginal > 0
                  ? batchSavings
                  : `${completedCount} extracted files ready`}
              </span>
            )}
            {failedCount > 0 && (
              <span className="summaryFailed">{failedCount} failed</span>
            )}
          </div>

          <ul className="fileList">
            {items.map((item) => (
              <FileItem
                key={item.id}
                item={item}
                tool={tool}
                onRemove={removeItem}
                onRetry={retryItem}
                onCancel={cancelItem}
                busy={busyDisabled}
              />
            ))}
          </ul>
        </>
      )}

      {hasSettings && <fieldset className="workspaceSettings" disabled={busyDisabled}>
        <legend className="srInline">Processing settings</legend>
        <CompressionSettings
          tool={tool}
          level={queue.level}
          onLevel={queue.setLevel}
          settings={queue.settings}
          onSetting={queue.setSetting}
          targetAllowed={
            queue.settings.outputFormat === 'jpeg' ||
            queue.settings.outputFormat === 'webp' ||
            (!queue.settings.outputFormat &&
              (items.length
                ? items.every(
                    (item) =>
                      item.inputFormat === 'jpeg' ||
                      item.inputFormat === 'webp',
                  )
                : [
                    'jpg-compressor',
                    'jpeg-compressor',
                    'webp-compressor',
                  ].includes(tool.slug)))
          }
        />

        {formatSource && supportsOutputPicker(tool) && (
          <OutputFormatPicker
            file={formatSource}
            value={String(queue.settings.outputFormat ?? '')}
            onChange={(next) => queue.setSetting('outputFormat', next)}
          />
        )}
      </fieldset>}

      {(pendingCount > 0 || busyDisabled || validatingCount > 0) && (
        <div className="actions">
          <button
            type="button"
            className="compressBtn"
            disabled={!canStart}
            onClick={runAll}
          >
            {busyDisabled
              ? 'Processing…'
              : validatingCount > 0
                ? 'Checking files…'
                : isCollective
                  ? `${actionLabel} ${pendingCount} file${pendingCount === 1 ? '' : 's'}`
                  : `${actionLabel} ${pendingCount} file${pendingCount === 1 ? '' : 's'}`}
            <Icon name="arrow" />
          </button>

          {processing && (
            <button
              type="button"
              className="downloadBtn secondary"
              onClick={cancelAll}
            >
              Cancel all
            </button>
          )}
        </div>
      )}

      {completedCount > 0 && (
        <DownloadActions
          items={items}
          zipName={`filecompresser-${tool.slug}.zip`}
          onClear={queue.clearCompleted}
        />
      )}

      {/* Single polite live region for the whole workspace, so screen readers
          hear one coherent status rather than a stream of competing ones. */}
      <div className="srLive" role="status" aria-live="polite">
        {status.text}
      </div>
      {status.kind !== 'idle' && (
        <p className={`status status-${status.kind}`}>{status.text}</p>
      )}

      <details
        className="howItWorks"
        open={summaryOpen}
        onToggle={(e) => setSummaryOpen(e.currentTarget.open)}
      >
        <summary><span>How your file is handled</span><Icon name="chevron" /></summary>
        <p>
          {tool.privacyClientSide
            ? 'Your file is read into this browser tab, processed on your own device, and never sent to a filecompresser server. Closing the tab releases it. Clearing your browser cache is not needed, because nothing is stored.'
            : 'This tool downloads its processing engine on first use. Your file itself is handled in this browser tab.'}
        </p>
      </details>
    </section>
  )
}

function formatLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`
}

function actionVerb(tool: ToolDefinition): string {
  switch (tool.engine) {
    case 'zip-create':
      return 'Create ZIP from'
    case 'zip-extract':
      return 'Extract'
    default:
      return 'Compress'
  }
}

/**
 * Which tools get the "Download as" picker.
 *
 * Only the image compressors: they are the tools where the input is a still
 * image and more than one real output encoder is available, so letting the user
 * pick the container is a genuine choice rather than a repackage.
 */
function supportsOutputPicker(tool: ToolDefinition): boolean {
  return tool.engine === 'image-compress' && tool.slug !== 'compress'
}
