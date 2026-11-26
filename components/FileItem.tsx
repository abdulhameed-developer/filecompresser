'use client'

import { useState } from 'react'
import Icon from './Icon'
import ImageComparison from './ImageComparison'
import FilePreview from './FilePreview'
import WorkflowSummary from './WorkflowSummary'
import type { ImageOutcome, QueueItem, ToolDefinition } from '@/lib/types'
import { formatBytes, savingsLabel } from '@/lib/format'
import { downloadBlob } from '@/lib/downloads'

interface FileItemProps {
  item: QueueItem
  tool: ToolDefinition
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onCancel: (id: string) => void
  onReprocess?: (id: string) => void
  onRestoreApplied?: (id: string) => void
  selected?: boolean
  showSelection?: boolean
  onSelect?: (id: string, checked: boolean) => void
  hideDownload?: boolean
  sourceInfo?: { width: number; height: number }
  busy?: boolean
  compact?: boolean
  expanded?: boolean
  onExpanded?: (open: boolean) => void
}
const OUTCOMES: Record<ImageOutcome, { label: string; tone: string }> = {
  reduced: { label: 'Reduced', tone: 'good' }, unchanged: { label: 'Original retained', tone: 'neutral' },
  converted: { label: 'Format converted', tone: 'neutral' }, resized: { label: 'Resized', tone: 'neutral' },
  'target-met': { label: 'Target met', tone: 'good' }, 'target-unmet': { label: 'Target not met', tone: 'warning' },
}

export default function FileItem({ item, tool, onRemove, onRetry, onCancel, onReprocess, onRestoreApplied, selected = true, showSelection, onSelect, hideDownload, sourceInfo, busy, compact = false, expanded = false, onExpanded }: FileItemProps) {
  const [comparing, setComparing] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const outputs = item.artifact?.outputs ?? item.outputs ?? (item.result ? [item.result] : [])
  const result = item.result ?? outputs[0]
  const inspection = result?.inspection
  const extraction = item.comparison === 'extraction'
  const comparisonOriginalSize = item.comparison === 'archive' ? item.artifact?.sourceBytes ?? item.originalSize : item.originalSize
  const outputSize = extraction ? outputs.reduce((sum, output) => sum + output.blob.size, 0) : result?.blob.size ?? item.outputSize
  const canDownload = Boolean(result)
  const active = ['validating', 'processing'].includes(item.status) || Boolean(item.activeRunId)
  const canRetry = ['failed', 'cancelled'].includes(item.status) && Boolean(item.inputFormat || tool.engine === 'zip-create')
  const targetBytes = result?.targetBytes
  const outcome = targetBytes && targetBytes > 0 && outputSize !== undefined ? outputSize <= targetBytes ? 'target-met' : 'target-unmet' : result?.outcome
  const badge = outcome ? OUTCOMES[outcome] : undefined
  const retained = result?.outcome === 'unchanged' || result?.blob === item.file || inspection?.compressionKind === 'original' || inspection?.encoder === 'Original file'
  const draftChanged = Boolean(item.dirty && selected)
  const previous = canDownload && (draftChanged || active || ['failed', 'cancelled'].includes(item.status))
  const canCompare = Boolean(canDownload && !extraction && inspection && ['jpeg', 'png', 'webp'].includes(inspection.inputFormat) && ['jpeg', 'png', 'webp'].includes(inspection.outputFormat) && [inspection.inputWidth, inspection.inputHeight, inspection.outputWidth, inspection.outputHeight].every(value => Number.isFinite(value) && value > 0))
  const elapsed = inspection?.elapsedMs ?? result?.durationMs
  const changedDimensions = inspection && (inspection.inputWidth !== inspection.outputWidth || inspection.inputHeight !== inspection.outputHeight)
  const converted = result?.outcome === 'converted' || Boolean(inspection && inspection.inputFormat !== inspection.outputFormat)
  const effectiveEngine = item.draftConfig?.engine ?? tool.engine
  const draftOutput = item.draftConfig?.options.outputFormat
  const conversionRequested = effectiveEngine === 'webm-to-mp4' || (effectiveEngine === 'audio-compress' && item.inputFormat !== 'mp3') || (effectiveEngine === 'image-compress' && Boolean(draftOutput) && draftOutput !== item.inputFormat)
  const applyAction = effectiveEngine === 'zip-create' ? 'Rebuild ZIP' : effectiveEngine === 'zip-extract' ? 'Extract again' : effectiveEngine === 'pdf-compress' ? 'Optimize again' : conversionRequested ? 'Convert again' : 'Recompress'
  const changeNotice = effectiveEngine === 'zip-create' ? 'Inputs have changed. Rebuild ZIP to include the current files.' : `Settings have changed. ${applyAction} to apply them.`
  const repeatAction = effectiveEngine === 'zip-extract' ? 'Extract again' : effectiveEngine === 'pdf-compress' ? 'Optimize again' : conversionRequested ? 'Convert again' : 'Process again'
  const notes = [...new Set([result?.targetNote ?? item.targetNote, result?.note].filter((note): note is string => Boolean(note)))]
  const download = (output = result) => {
    if (!output) return
    try { downloadBlob(output.blob, output.filename); setDownloadError('') }
    catch { setDownloadError('The download could not start. Try again, or prepare a ZIP.') }
  }

  const detailContent = <>
      {active && item.runConfig && <WorkflowSummary config={item.runConfig} sourceFormat={item.inputFormat} label="Processing setup" />}
      {previous && <p className="previousResultNotice"><strong>Previous result</strong>{active ? 'Processing again. This previous download is unchanged.' : draftChanged ? changeNotice : 'Still available from the last successful run.'}</p>}

      {canDownload && <>
        {item.appliedConfig && <WorkflowSummary config={item.appliedConfig} sourceFormat={item.inputFormat} label={retained ? 'Attempted setup' : 'Applied setup'} />}
        <dl className="fileMetrics">
          {!extraction && <div><dt>{item.sourceCount && item.sourceCount > 1 ? `${item.sourceCount} source files` : 'Original'}</dt><dd><strong>{formatBytes(comparisonOriginalSize)}</strong><span>{comparisonOriginalSize.toLocaleString('en-US')} bytes</span>{inspection && <span>{inspection.inputWidth.toLocaleString('en-US')} × {inspection.inputHeight.toLocaleString('en-US')} px · {formatName(inspection.inputFormat)}</span>}</dd></div>}
          <div><dt>{extraction ? `${outputs.length} extracted file${outputs.length === 1 ? '' : 's'}` : previous ? 'Previous output' : retained ? 'Original download' : 'Result'}</dt><dd><strong>{formatBytes(outputSize ?? 0)}</strong><span>{(outputSize ?? 0).toLocaleString('en-US')} bytes</span>{inspection && <span>{inspection.outputWidth.toLocaleString('en-US')} × {inspection.outputHeight.toLocaleString('en-US')} px · {formatName(inspection.outputFormat)}</span>}</dd></div>
        </dl>
        <div className="fileResultSummary">
          {!extraction && outputSize !== undefined && comparisonOriginalSize > 0 && <span className={`savings ${outputSize < comparisonOriginalSize ? 'good' : outputSize > comparisonOriginalSize ? 'larger' : 'neutral'}`}>{savingsLabel(comparisonOriginalSize, outputSize)}</span>}
          {inspection && <span>{changedDimensions ? 'Dimensions changed' : 'Dimensions preserved'}</span>}
          {inspection?.outputFormat === 'png' && inspection.compressionKind && <span className="pngResultKind">{inspection.compressionKind === 'lossy' ? 'Color-reduced PNG' : inspection.compressionKind === 'lossless' ? 'Lossless PNG' : 'Original PNG retained'}{inspection.colorLimit ? ` · ${inspection.colorLimit} color limit` : ''}</span>}
          {elapsed !== undefined && Number.isFinite(elapsed) && <span>{formatDuration(elapsed)} processing</span>}
        </div>
        {targetBytes !== undefined && <p className={`fileTarget ${outcome === 'target-unmet' ? 'targetWarning' : ''}`}><strong>{outcome === 'target-unmet' ? 'Target not met.' : 'Within your limit.'}</strong> Maximum {targetBytes.toLocaleString('en-US')} bytes; result {(outputSize ?? 0).toLocaleString('en-US')} bytes.</p>}
        {!extraction && outputSize !== undefined && outputSize > comparisonOriginalSize && <p className="fileNote largerNote">{converted ? 'This format conversion produced a larger file.' : tool.engine === 'zip-create' ? 'The ZIP container is larger than the source files.' : 'The output is larger than the original.'}</p>}
        {notes.map(note => <p className={`fileNote${outcome === 'target-unmet' ? ' targetWarning' : ''}`} key={note}>{note}</p>)}
        {extraction && <ul className="extractedFiles" aria-label={`Extracted files from ${item.name}`}>{outputs.map((output, index) => <li key={`${index}:${output.filename}`}><span><strong>{output.filename}</strong><small>{formatBytes(output.blob.size)} · {output.blob.size.toLocaleString('en-US')} bytes</small></span><button type="button" className="linkBtn" onClick={() => download(output)}>Download<span className="srInline"> {output.filename}</span></button></li>)}</ul>}
        {inspection && <details className="resultDetails"><summary>File details</summary><p>{inspection.encoder}</p><p>{inspection.metadataNote}</p>{inspection.qualityUsed !== undefined && <p>Encoder setting: {Math.round(inspection.qualityUsed * 100)}%. This is not a measured quality score.</p>}<p className="outputFilename">Download filename: {result?.filename}</p></details>}
      </>}
  </>

  return <li className={`file resultFile status-${item.status}${outcome === 'target-unmet' ? ' targetUnmetFile' : ''}${draftChanged ? ' dirtyResultFile' : ''}${!selected ? ' unselectedFile' : ''}${compact ? ' fileCard' : ''}`}>
    {compact && <FilePreview item={item} dimensions={sourceInfo ?? (inspection ? { width: inspection.inputWidth, height: inspection.inputHeight } : undefined)} />}
    <div className="fileLeading">{showSelection && onSelect ? <label className="fileSelect"><input type="checkbox" checked={selected} disabled={busy} onChange={event => onSelect(item.id, event.target.checked)} /><span className="srInline">Select {item.name}</span></label> : <span className="fileIcon" aria-hidden="true"><Icon name="file" /></span>}</div>
    <div className="fileMeta">
      <div className="fileTitle"><strong title={item.name}>{item.name}</strong>{canDownload && badge && <span className={`resultBadge tone-${badge.tone}`}>{badge.label}</span>}</div>
      <p className="filePendingFacts">Source · {formatBytes(item.originalSize)}{item.inputFormat ? ` · ${formatName(item.inputFormat)}` : ''}{sourceInfo ? ` · ${sourceInfo.width.toLocaleString('en-US')} × ${sourceInfo.height.toLocaleString('en-US')} px` : ''}</p>
      {item.status !== 'completed' && <div className="fileStatus"><Icon className={active ? 'activityIcon' : ''} name={item.status === 'failed' ? 'error' : item.status === 'cancelled' ? 'close' : 'clock'} /><span>{item.status === 'processing' ? item.stage || 'Processing…' : item.status === 'validating' ? 'Checking file…' : item.status === 'queued' ? active ? 'Waiting for this run' : 'Ready' : item.status === 'cancelled' ? 'Latest attempt cancelled' : 'Latest attempt failed'}</span></div>}
      {item.status === 'processing' && <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress > 0 ? Math.round(item.progress) : undefined} aria-valuetext={item.stage ?? 'Processing'} aria-label={`Processing ${item.name}`}><div className={`progressBar${item.progress > 0 ? '' : ' indeterminate'}`} style={item.progress > 0 ? { width: `${item.progress}%` } : undefined} /></div>}
      {item.status === 'failed' && item.error && <p className="fileError" role="alert">{item.error}</p>}
      {compact && previous && <p className="cardPreviousNotice">Previous result · {active ? 'New run in progress' : draftChanged ? 'Changes not applied' : 'Last successful run'}</p>}
      {compact && canDownload && <div className="fileCardResult"><span>{formatBytes(comparisonOriginalSize)} <Icon name="arrow" /> <strong>{formatBytes(outputSize ?? 0)}</strong></span><span>{extraction ? `${outputs.length} extracted` : outputSize !== undefined && comparisonOriginalSize > 0 ? savingsLabel(comparisonOriginalSize, outputSize) : ''}</span></div>}
      {compact ? <details className="fileCardDetails" open={expanded} onToggle={event => { if (event.currentTarget.open !== expanded) onExpanded?.(event.currentTarget.open) }}>
        <summary>Details<span className="srInline"> for {item.name}</span><Icon name="chevron" /></summary>
        <div className="fileCardDetailBody"><p className="cardFullName">{item.name}</p><p className="cardSourceDetails">Source: {item.originalSize.toLocaleString('en-US')} bytes{item.inputFormat ? ` · ${formatName(item.inputFormat)}` : ''}{sourceInfo ? ` · ${sourceInfo.width.toLocaleString('en-US')} × ${sourceInfo.height.toLocaleString('en-US')} px` : ''}</p>
        {detailContent}
        {item.appliedConfig && draftChanged && onRestoreApplied && <button type="button" className="linkBtn" disabled={busy} onClick={() => onRestoreApplied(item.id)}>Use applied settings<span className="srInline"> for {item.name}</span></button>}
        {item.status === 'completed' && selected && !item.dirty && onReprocess && !item.batchOwnerId && <button type="button" className="linkBtn" disabled={busy} onClick={() => onReprocess(item.id)}>{repeatAction}<span className="srInline"> {item.name}</span></button>}
        </div>
      </details> : <>
        {detailContent}
      </>}
      {!result && item.status === 'completed' && item.batchOwnerId && <p className="fileNote">Included in the saved ZIP archive.</p>}
      {downloadError && <p className="fileError" role="alert">{downloadError}</p>}
    </div>
    <div className="fileActions">
      {canCompare && <button type="button" className="linkBtn compareButton" onClick={() => setComparing(true)}>Compare<span className="srInline"> original and {previous ? 'previous' : 'current'} result for {item.name}</span></button>}
      {canDownload && !hideDownload && !extraction && <button type="button" className="linkBtn fileDownloadButton" onClick={() => download()}><Icon name="download" />{previous ? 'Download previous' : retained ? 'Download original' : 'Download'}<span className="srInline"> {result?.filename}</span></button>}
      {!compact && item.appliedConfig && draftChanged && onRestoreApplied && <button type="button" className="linkBtn" disabled={busy} onClick={() => onRestoreApplied(item.id)}>Use applied settings<span className="srInline"> for {item.name}</span></button>}
      {canRetry && <button type="button" className="linkBtn" disabled={busy} onClick={() => onRetry(item.id)}>Retry<span className="srInline"> {item.name}</span></button>}
      {!compact && item.status === 'completed' && selected && !item.dirty && onReprocess && !item.batchOwnerId && <button type="button" className="linkBtn" disabled={busy} onClick={() => onReprocess(item.id)}>{repeatAction}<span className="srInline"> {item.name}</span></button>}
      {active && <button type="button" className="linkBtn" onClick={event => { event.preventDefault(); onCancel(item.id) }}>Cancel<span className="srInline"> processing of {item.name}</span></button>}
      <button type="button" className="iconBtn fileRemoveButton" aria-label={effectiveEngine === 'zip-create' ? `Remove ${item.name} from ZIP inputs` : `Remove source and results for ${item.name}`} onClick={() => onRemove(item.id)}><Icon name="close" /></button>
    </div>
    {comparing && result && inspection && <ImageComparison original={item.file} output={result.blob} outputName={result.filename} resultLabel={previous ? 'Previous result' : 'Result'} inputWidth={inspection.inputWidth} inputHeight={inspection.inputHeight} outputWidth={inspection.outputWidth} outputHeight={inspection.outputHeight} onClose={() => setComparing(false)} />}
  </li>
}
function formatName(format: string) { return format === 'jpeg' ? 'JPG' : format.toUpperCase() }
function formatDuration(milliseconds: number) { return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)} s` }
