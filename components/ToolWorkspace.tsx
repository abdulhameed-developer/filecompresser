'use client'

import { useId, useMemo, useRef, useEffect, useState, useCallback, type KeyboardEvent } from 'react'
import type { ToolDefinition } from '@/lib/types'
import { useFileQueue } from '@/lib/useFileQueue'
import { savingsSummary } from '@/lib/format'
import { lockDialogScroll } from '@/lib/dialog-scroll'
import type { ImageSourceProbe } from '@/lib/engines/image'
import Icon from './Icon'
import FileDropzone from './FileDropzone'
import FileItem from './FileItem'
import CompressionSettings from './CompressionSettings'
import OutputFormatPicker from './OutputFormatPicker'
import DownloadActions from './DownloadActions'

interface ToolWorkspaceProps { tool: ToolDefinition; formatsLabel?: string }

export default function ToolWorkspace({ tool, formatsLabel }: ToolWorkspaceProps) {
  const queue = useFileQueue(tool)
  const errorId = useId()
  const galleryId = useId()
  const settingsId = useId()
  const settingsPanel = useRef<HTMLDialogElement>(null)
  const settingsTrigger = useRef<HTMLButtonElement>(null)
  const actionBar = useRef<HTMLDivElement>(null)
  const previouslyHadFiles = useRef(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => {
    if (!settingsOpen) return
    return lockDialogScroll()
  }, [settingsOpen])
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const gallery = useRef<HTMLUListElement>(null)
  const [galleryEdges, setGalleryEdges] = useState({ start: true, end: true })
  const measureGallery = useCallback(() => {
    const element = gallery.current
    if (!element) return
    const start = element.scrollLeft <= 2
    const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2
    setGalleryEdges(previous => previous.start === start && previous.end === end ? previous : { start, end })
  }, [])
  const [formatChecking, setFormatChecking] = useState(true)
  const [sourceProbes, setSourceProbes] = useState<ImageSourceProbe[]>([])
  const rememberProbes = useCallback((next: ImageSourceProbe[]) => setSourceProbes(previous => {
    const merged = new Map(previous.map(probe => [probe.file, probe]))
    for (const probe of next) merged.set(probe.file, probe)
    return [...merged.values()]
  }), [])
  const { items, selectedIds, busy, status } = queue
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const scope = items.filter(item => selected.has(item.id))
  useEffect(() => {
    setSourceProbes(previous => {
      const present = previous.filter(probe => items.some(item => item.file === probe.file))
      return present.length === previous.length ? previous : present
    })
  }, [items])
  const probesByFile = new Map(sourceProbes.map(probe => [probe.file, probe]))
  const hasItems = items.length > 0
  useEffect(() => {
    const firstSelection = hasItems && !previouslyHadFiles.current
    previouslyHadFiles.current = hasItems
    if (!firstSelection) return
    const frame = window.requestAnimationFrame(() => {
      actionBar.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hasItems])
  const pageCount = Math.max(1, Math.ceil(items.length / 6))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleItems = items.slice(currentPage * 6, currentPage * 6 + 6)
  const galleryPageKey = visibleItems.map(item => item.id).join(':')
  useEffect(() => {
    measureGallery()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measureGallery) : undefined
    if (gallery.current) observer?.observe(gallery.current)
    window.addEventListener('resize', measureGallery)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measureGallery) }
  }, [galleryPageKey, measureGallery])
  const turnPage = (next: number) => { setPage(Math.max(0, Math.min(next, pageCount - 1))); setExpandedId(null); gallery.current?.scrollTo?.({ left: 0 }) }
  const collective = tool.engine === 'zip-create'
  const validating = queue.validatingCount > 0
  const readyScope = scope.some(item => item.inputFormat || (collective && item.status !== 'validating'))
  const imageSettings = readyScope && queue.imageScope
  const scopeFormats = new Set(scope.map(item => item.inputFormat).filter(Boolean))
  const outputFormat = String(queue.settings.outputFormat || '')
  const hasPng = outputFormat ? outputFormat === 'png' : scopeFormats.has('png')
  const hasLossy = outputFormat ? outputFormat !== 'png' : scopeFormats.has('jpeg') || scopeFormats.has('webp')
  const scopeImages = queue.selectedImageFiles
  const hasSettings = readyScope && (imageSettings || tool.engine !== 'image-compress' && (!['pdf-compress', 'zip-create', 'zip-extract', 'webm-to-mp4'].includes(tool.engine) || Boolean(tool.settings?.length)))
  const runnable = scope.filter(item => !['validating', 'processing'].includes(item.status) && !(item.status === 'failed' && !item.inputFormat && tool.engine !== 'zip-create') && (item.status !== 'completed' || item.dirty))
  const changed = scope.filter(item => item.dirty).length
  const hasSaved = scope.some(item => item.result)
  const canRun = !busy && !validating && (!imageSettings || !formatChecking) && runnable.length > 0 && !queue.settingsError
  const downloads = useMemo(() => queue.resultItems.filter(item => selected.has(item.sourceId || item.id)), [queue.resultItems, selected])
  const olderSourceIds = new Set(scope.filter(item => item.result && (item.dirty || item.activeRunId || ['failed', 'cancelled'].includes(item.status))).map(item => item.id))
  const olderDownloads = downloads.filter(item => olderSourceIds.has(item.sourceId || item.id)).length
  const unmetTargets = downloads.filter(item => Number(item.result?.targetBytes) > 0 && item.result!.blob.size > Number(item.result!.targetBytes)).length
  const completedSources = items.filter(item => item.appliedConfig).length
  const totalOriginal = downloads.filter(item => item.comparison !== 'extraction').reduce((sum, item) => sum + item.originalSize, 0)
  const totalOutput = downloads.filter(item => item.comparison !== 'extraction').reduce((sum, item) => sum + (item.result?.blob.size || 0), 0)
  const phase = busy ? 'Processing' : validating ? 'Checking files' : changed ? collective ? 'Inputs changed' : 'Changes not applied' : queue.failedCount ? completedSources ? 'Partly complete' : 'Needs attention' : scope.some(item => item.status === 'cancelled') ? 'Cancelled' : unmetTargets ? unmetTargets === 1 ? 'Target not met' : 'Targets not met' : hasSaved && !runnable.length ? 'Results ready' : readyScope ? 'Ready' : 'Select a file'
  const moveCards = (direction: number) => gallery.current?.scrollBy?.({ left: direction * Math.max(180, gallery.current.clientWidth - 40), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  const processSelected = () => { if (canRun && !settingsPanel.current?.open) queue.reprocessSelected(selectedIds) }
  const openSettings = () => {
    const panel = settingsPanel.current
    if (!panel) return
    setSettingsOpen(true)
    if (!panel.open) {
      if (typeof panel.showModal === 'function') panel.showModal()
      else panel.setAttribute('open', '')
    }
    panel.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus({ preventScroll: true })
  }
  const closeSettings = () => {
    const panel = settingsPanel.current
    if (panel && typeof panel.close === 'function') panel.close()
    else if (panel) {
      panel.removeAttribute('open')
      panel.open = false
    }
    setSettingsOpen(false)
    settingsTrigger.current?.focus({ preventScroll: true })
  }
  const onSettingsKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]')]
      .filter(control => !control.matches(':disabled') && !control.closest('[hidden]'))
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  const changeSelection = (id: string, checked: boolean) => queue.setSelection(checked ? [...selectedIds, id] : selectedIds.filter(value => value !== id))
  const converting = imageSettings && Boolean(outputFormat) && scope.some(item => item.inputFormat !== outputFormat)
  const conversionTarget = converting ? outputFormat : tool.engine === 'audio-compress' && scope.some(item => item.inputFormat && item.inputFormat !== 'mp3') ? 'mp3' : ''
  const action = actionLabel(tool, hasSaved, runnable.length, conversionTarget, imageSettings)
  const singleApplied = scope.length === 1 && scope[0].appliedConfig && scope[0].dirty ? scope[0] : undefined

  return <section className={`compressCard toolCard workflowWorkspace${hasItems ? ' hasFiles' : ' emptyWorkspace'}`} aria-label={`${tool.title} workspace`}>
    <div className="workspaceIntro"><p>{hasItems ? 'Your files' : 'Smaller files start here.'}</p><span>Max {formatLimit(tool.maxFileSize)} / file</span></div>
    <FileDropzone accept={tool.accept} multiple={tool.engine !== 'zip-extract'} disabled={busy} label={hasItems ? 'Add more files' : 'Drop files here to get started'} hint={hasItems ? 'or choose from your device' : 'or browse files from your device'} formats={hasItems ? undefined : formatsLabel || tool.extensions.map(extension => extension.toUpperCase()).join(' · ')} onFiles={queue.addFiles} />
    <p className="workspacePrivacy"><Icon name="shield" />Files stay on your device.<span>500 files / 300 MB per queue{tool.category === 'image' ? ' · 32 MP per image' : ''}</span></p>

    {hasItems && <>
      <div className="workspaceScope">
        {(items.length > 1 || selectedIds.length !== items.length) && !collective ? <SelectAll checked={selectedIds.length === items.length} mixed={selectedIds.length > 0 && selectedIds.length < items.length} disabled={busy} onChange={checked => queue.setSelection(checked ? undefined : [])} /> : <strong>{items.length} {collective ? 'archive input' : 'file'}{items.length === 1 ? '' : 's'}</strong>}
        <span>{collective ? 'All files go into one ZIP' : items.length > 1 ? `${selectedIds.length} of ${items.length} selected` : 'Original source retained'}</span>
        {!collective && items.length > 1 && selectedIds.length > 0 && <button type="button" className="linkBtn scopeRemove" disabled={busy} onClick={() => selectedIds.forEach(queue.removeItem)}>Remove selected</button>}
        <button type="button" className="linkBtn clearQueue" disabled={busy} onClick={() => { items.forEach(item => queue.removeItem(item.id)); setPage(0); setExpandedId(null) }}>Clear all</button>
      </div>

      <form className="workflowForm" noValidate onSubmit={event => { event.preventDefault(); processSelected() }}>
        <div ref={actionBar} className={`workflowActionBar${changed ? ' hasDraftChanges' : ''}`}>
          <div className="workflowActionContext"><span className={`workflowPhase${changed || phase === 'Target not met' || phase === 'Targets not met' ? ' isDirty' : ''}`}>{phase}</span><p>{busy ? 'Settings are locked during this run.' : changed ? collective ? 'Saved ZIP uses previous inputs. Rebuild it to include the current files.' : `${changed} saved result${changed === 1 ? ' still uses' : 's still use'} previous settings.` : unmetTargets ? `${unmetTargets} result${unmetTargets === 1 ? ' exceeds its' : 's exceed their'} limit. Available to download; adjust settings to try again.` : downloads.length && !runnable.length ? totalOriginal > 0 ? savingsSummary(totalOriginal, totalOutput) : `${downloads.length} extracted files ready` : validating ? 'Reading and validating your files…' : imageSettings && formatChecking ? 'Checking image compatibility…' : runnable.length ? `${runnable.length} original file${runnable.length === 1 ? '' : 's'} to process` : 'Choose a file or select an existing source.'}</p></div>
          <div className="workflowPrimaryActions">
            {hasSettings && <button ref={settingsTrigger} type="button" className="workflowSettingsShortcut" aria-controls={settingsId} aria-expanded={settingsOpen} onClick={openSettings}><Icon name="settings" />Settings</button>}
            {busy ? <button key="cancel" type="button" className="downloadBtn secondary" onClick={event => { event.preventDefault(); queue.cancelAll() }}>Cancel processing</button> : runnable.length > 0 || validating ? <button key="process" type="submit" className="compressBtn" disabled={!canRun} aria-describedby={queue.settingsError ? errorId : undefined}>{validating ? 'Checking files…' : imageSettings && formatChecking ? 'Checking images…' : action}<Icon name="arrow" /></button> : null}
            {downloads.length > 0 && <DownloadActions items={downloads} compact previous={olderDownloads === downloads.length} olderCount={olderDownloads} zipName={`filecompresser-${tool.slug}.zip`} />}
          </div>
        </div>
        {readyScope && ['webm-to-mp4', 'video-compress', 'audio-compress'].includes(tool.engine) && <p className="workflowOutput"><Icon name="arrow" /><span>{tool.engine === 'video-compress' ? 'Encode to: ' : 'Output: '}{tool.engine === 'audio-compress' ? <strong>MP3 audio</strong> : <><strong>MP4</strong> · H.264 video, AAC audio when present</>}{tool.engine === 'video-compress' && <span className="workflowOutputNote">Compatible originals kept if re-encoding does not save space.</span>}</span></p>}
        <div className={`workflowBody${hasSettings ? ' withSettings' : ''}`}>
          <section className="workspaceGallery" aria-label="Uploaded files and results">
      <div className="workspaceResultsHeading"><h3>{completedSources ? 'Files & results' : 'Source files'}</h3>{queue.failedCount > 0 && <span className="summaryFailed">{queue.failedCount} need attention</span>}{visibleItems.length > 1 && <div className="galleryScrollControls"><button type="button" aria-label="Scroll file cards left" disabled={galleryEdges.start} aria-controls={galleryId} onClick={() => moveCards(-1)}><Icon name="arrow-left" /></button><button type="button" aria-label="Scroll file cards right" disabled={galleryEdges.end} aria-controls={galleryId} onClick={() => moveCards(1)}><Icon name="arrow" /></button></div>}</div>
      <ul id={galleryId} ref={gallery} onScroll={measureGallery} className={`fileList fileGallery${items.length === 1 ? ' singleFileGallery' : ''}`} tabIndex={items.length > 1 ? 0 : undefined} aria-label={items.length > 1 ? 'File cards. Scroll sideways to see more files.' : 'Selected file and result'}>
        {visibleItems.map(item => <FileItem key={item.id} compact expanded={expandedId === item.id} onExpanded={open => setExpandedId(open ? item.id : null)} item={item} tool={tool} onRemove={queue.removeItem} onRetry={queue.retryItem} onCancel={queue.cancelItem} onReprocess={queue.reprocessItem} onRestoreApplied={scope.length > 1 ? queue.restoreApplied : undefined} sourceInfo={probesByFile.get(item.file)} selected={selected.has(item.id)} onSelect={collective ? undefined : changeSelection} showSelection={!collective && (items.length > 1 || selectedIds.length !== items.length)} hideDownload={items.length === 1 && downloads.length > 0 && tool.engine !== 'zip-extract'} busy={busy} />)}
      </ul>
      <nav className="galleryPagination" aria-label="File pages"><span role="status">Showing {currentPage * 6 + 1}–{Math.min((currentPage + 1) * 6, items.length)} of {items.length} files</span>{pageCount > 1 && <div><button type="button" aria-label="Previous file page" aria-controls={galleryId} disabled={currentPage === 0} onClick={() => turnPage(currentPage - 1)}><Icon name="arrow-left" /></button><span>{currentPage + 1} / {pageCount}</span><button type="button" aria-label="Next file page" aria-controls={galleryId} disabled={currentPage === pageCount - 1} onClick={() => turnPage(currentPage + 1)}><Icon name="arrow" /></button></div>}<span className="gallerySwipeHint">{galleryEdges.start && galleryEdges.end ? 'All files on this page' : 'Scroll cards sideways'}</span></nav>
          </section>
          <div className="workspaceConfiguration">
        {hasSettings && <dialog id={settingsId} ref={settingsPanel} className="settingsDialog" aria-labelledby={`${settingsId}-title`} onKeyDown={onSettingsKeyDown} onClose={() => setSettingsOpen(false)} onCancel={event => { event.preventDefault(); closeSettings() }} onClick={event => { if (event.target === event.currentTarget) closeSettings() }}>
          <div className="settingsDialogShell"><header className="settingsDialogHeader"><div><span className="settingsDialogEyebrow">WORKSPACE SETTINGS</span><h2 id={`${settingsId}-title`}>Settings</h2><p>For {scope.length} selected file{scope.length === 1 ? '' : 's'}.</p></div><button type="button" className="iconBtn" aria-label="Close settings" onClick={closeSettings}><Icon name="close" /></button></header><fieldset className="workspaceSettings" disabled={busy} aria-describedby={queue.settingsError ? errorId : undefined}>
            <legend className="srInline">Draft settings for selected files</legend>
            {singleApplied && <div className="settingsHeading"><button type="button" className="linkBtn" onClick={() => queue.restoreApplied(singleApplied.id)}>Restore applied</button></div>}
            {imageSettings && scopeImages.length > 0 && <OutputFormatPicker file={scopeImages[0]} files={scopeImages} value={outputFormat} onChange={next => queue.setSetting('outputFormat', next)} onCheckingChange={setFormatChecking} onProbesChange={rememberProbes} />}
            <CompressionSettings tool={tool} level={queue.level} onLevel={queue.setLevel} settings={queue.settings} onSetting={queue.setSetting} imageSettings={imageSettings} imageFormat={outputFormat || (scopeFormats.size === 1 ? [...scopeFormats][0] : undefined)} hasPng={hasPng} hasLossy={hasLossy} targetAllowed={imageSettings} />
          </fieldset><footer className="settingsDialogFooter"><button type="button" className="linkBtn" disabled={busy} onClick={queue.resetSettings}>Reset</button><button type="button" className="downloadBtn secondary" onClick={closeSettings}>Done</button></footer></div>
        </dialog>}
        {readyScope && tool.slug === 'compress' && !imageSettings && <p className="mixedBatchHint">Each selected file uses its format’s default settings. Select only JPG, PNG or WEBP files to adjust image settings.</p>}
        {!scope.length && <p className="selectionHint">Select a file below to configure, process or download it.</p>}
        {queue.settingsError && hasSettings && <p id={errorId} className="settingsValidation" role="alert">{queue.settingsError}</p>}

          </div>
        </div>
      <div className="srLive" role="status" aria-live="polite">{status.text}</div>
      {status.kind !== 'idle' && !busy && <p className={`workflowStatus status-${status.kind}`}>{status.text}</p>}
      </form>
    </>}
  </section>
}

function SelectAll({ checked, mixed, disabled, onChange }: { checked: boolean; mixed: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (input.current) input.current.indeterminate = mixed }, [mixed])
  return <label className="selectAllFiles"><input ref={input} type="checkbox" checked={checked} aria-checked={mixed ? 'mixed' : checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />Select all</label>
}
function formatLimit(bytes: number) { return bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${Math.round(bytes / 1024)} KB` }
function actionLabel(tool: ToolDefinition, saved: boolean, count: number, conversionFormat: string, imageOnly: boolean) {
  const suffix = count > 1 ? ` ${count} files` : ''
  if (tool.slug === 'compress' && !imageOnly) return count === 1 ? 'Process file' : `Process ${count} files`
  if (tool.engine === 'zip-create') return saved ? 'Rebuild ZIP' : 'Create ZIP'
  if (tool.engine === 'zip-extract') return saved ? 'Extract again' : 'Extract ZIP'
  if (tool.engine === 'audio-compress' && tool.extensions.includes('wav') && !tool.extensions.includes('mp3')) return `${saved ? 'Convert again' : 'Convert to MP3'}${suffix}`
  if (tool.engine === 'pdf-compress') return `${saved ? 'Optimize again' : 'Optimize PDF'}${suffix}`
  if (tool.engine === 'webm-to-mp4') return `${saved ? 'Convert again' : 'Convert to MP4'}${suffix}`
  if (conversionFormat) return `Convert to ${conversionFormat === 'jpeg' ? 'JPG' : conversionFormat.toUpperCase()}${suffix}`
  return `${saved ? 'Recompress' : 'Compress'}${suffix}`
}
