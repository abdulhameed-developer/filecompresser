'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CompressionLevel, EngineKind, QueueItem, SettingValue, ToolDefinition, WorkflowArtifact, WorkflowConfig } from './types'
import { assertNotCancelled, createCancelSignal, isCancellation, ProcessingError } from './types'
import { uid } from './format'
import { detectFormat, validateFileAgainstTool } from './validation'
import { concurrencyFor, engineForFormat, processFile } from './process'
import { revokeItemUrl } from './downloads'
import { imageSettingsError } from './image-settings'
import { sameWorkflowSources, scopeWorkflowOptions, workflowConfig, workflowDefaults } from './workflow-config'
import { canProcessQueueItem, isArchiveInputFailureCode } from './queue-eligibility'

export type StatusMessage = { kind: 'idle' | 'info' | 'success' | 'error'; text: string }
const QUEUE_BYTES = 300 * 1024 * 1024
const QUEUE_FILES = 500
const IMAGE_FORMATS = ['jpeg', 'png', 'webp']
type RunMode = 'pending' | 'selected' | 'changed' | 'force'
const sameMembers = <T,>(left: T[], right: T[]) => left.length === right.length && left.every((value, index) => value === right[index])

function allowedFormats(tool: ToolDefinition): string[] {
  const aliases: Record<string, string> = { jpg: 'jpeg', jfif: 'jpeg', jpe: 'jpeg', heif: 'heic', m4v: 'mp4' }
  return [...new Set(tool.extensions.map(extension => aliases[extension] ?? extension))]
}

function configError(config: WorkflowConfig): string | null {
  if (config.engine !== 'image-compress') return null
  const options = { ...config.options }
  if (options.pngMode) options.imageMode = options.pngMode === 'target' ? 'target' : 'balanced'
  return imageSettingsError(options)
}

export function useFileQueue(tool: ToolDefinition) {
  const [storedItems, setStoredItems] = useState<QueueItem[]>([])
  const itemsRef = useRef<QueueItem[]>([])
  const [level, updateLevel] = useState<CompressionLevel>('recommended')
  const levelRef = useRef<CompressionLevel>('recommended')
  const [settings, updateSettings] = useState<Record<string, SettingValue>>(() => workflowDefaults(tool))
  const settingsRef = useRef(settings)
  const [selection, updateSelection] = useState<string[] | null>(null)
  const selectionRef = useRef<string[] | null>(null)
  const [sources, setSources] = useState<{ imageFiles: File[]; selectedImageFiles: File[]; selectedIds: string[] }>({ imageFiles: [], selectedImageFiles: [], selectedIds: [] })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<StatusMessage>({ kind: 'idle', text: '' })
  const running = useRef(false)
  const epoch = useRef(0)
  const mounted = useRef(true)
  const signals = useRef(new Map<string, ReturnType<typeof createCancelSignal>>())
  const toolRef = useRef(tool)
  toolRef.current = tool
  const toolIdentity = `${tool.slug}:${tool.engine}`
  const invalidate = useCallback(() => { epoch.current++ }, [])
  const syncSources = useCallback((rows: QueueItem[]) => {
    const selected = selectionRef.current === null ? rows : rows.filter(item => selectionRef.current!.includes(item.id))
    const imageFiles = rows.filter(item => IMAGE_FORMATS.includes(item.inputFormat ?? '')).map(item => item.file)
    const selectedImageFiles = selected.filter(item => IMAGE_FORMATS.includes(item.inputFormat ?? '')).map(item => item.file)
    const selectedIds = selected.map(item => item.id)
    setSources(previous => {
      const next = {
        imageFiles: sameMembers(previous.imageFiles, imageFiles) ? previous.imageFiles : imageFiles,
        selectedImageFiles: sameMembers(previous.selectedImageFiles, selectedImageFiles) ? previous.selectedImageFiles : selectedImageFiles,
        selectedIds: sameMembers(previous.selectedIds, selectedIds) ? previous.selectedIds : selectedIds,
      }
      return next.imageFiles === previous.imageFiles && next.selectedImageFiles === previous.selectedImageFiles && next.selectedIds === previous.selectedIds ? previous : next
    })
  }, [])

  // Original uploads are authoritative. Generated outputs live only in artifacts.
  const update = useCallback((change: (previous: QueueItem[]) => QueueItem[]) => {
    if (!mounted.current) return
    itemsRef.current = change(itemsRef.current)
    syncSources(itemsRef.current)
    setStoredItems(itemsRef.current)
  }, [syncSources])
  const patch = useCallback((id: string, value: Partial<QueueItem>) => {
    update(previous => previous.map(item => item.id === id ? { ...item, ...value } : item))
  }, [update])

  useEffect(() => {
    mounted.current = true
    const cancelMap = signals.current
    return () => {
      mounted.current = false
      invalidate()
      cancelMap.forEach(signal => signal.cancel('unmounted'))
      cancelMap.clear()
      itemsRef.current.forEach(revokeItemUrl)
    }
  }, [invalidate])

  useEffect(() => {
    epoch.current++
    signals.current.forEach(signal => signal.cancel('tool changed'))
    signals.current.clear()
    itemsRef.current.forEach(revokeItemUrl)
    update(() => [])
    running.current = false
    setBusy(false)
    levelRef.current = 'recommended'
    updateLevel('recommended')
    settingsRef.current = workflowDefaults(toolRef.current)
    updateSettings(settingsRef.current)
    selectionRef.current = null
    updateSelection(null)
    setStatus({ kind: 'idle', text: '' })
  }, [toolIdentity, update])

  const scopedItems = useCallback((ids?: string[]) => {
    const selected = ids ?? selectionRef.current
    return selected === null ? itemsRef.current : itemsRef.current.filter(item => selected.includes(item.id))
  }, [])
  const configFor = useCallback((item: QueueItem, scope: QueueItem[], capturedLevel = levelRef.current, capturedSettings = settingsRef.current) => {
    const currentTool = toolRef.current
    return workflowConfig(currentTool, item, capturedLevel, capturedSettings, scopeWorkflowOptions(currentTool, scope, capturedLevel, capturedSettings))
  }, [])
  const isDirty = useCallback((item: QueueItem, config: WorkflowConfig) => {
    if (!item.appliedConfig) return false
    if (item.appliedConfig.fingerprint !== config.fingerprint) return true
    if (toolRef.current.engine !== 'zip-create') return false
    const owner = itemsRef.current.find(row => row.id === (item.batchOwnerId ?? item.id))
    return !owner?.artifact || !sameWorkflowSources(owner.artifact.sourceIds, itemsRef.current.map(row => row.id))
  }, [])

  const validate = useCallback(async (item: QueueItem, signal: ReturnType<typeof createCancelSignal>) => {
    const currentTool = toolRef.current
    assertNotCancelled(signal)
    if (!item.file.size && currentTool.engine !== 'zip-create') throw new ProcessingError('This file is empty.')
    if (item.file.size > currentTool.maxFileSize)
      throw new ProcessingError(`This file is larger than ${currentTool.maxFileSize / 1024 / 1024} MB, which this tool allows.`)
    let format: string | undefined
    if (currentTool.engine !== 'zip-create') {
      const result = await validateFileAgainstTool(item.file, { allowedFormats: allowedFormats(currentTool), maxSize: currentTool.maxFileSize }, signal)
      format = result.format ?? undefined
      if (!result.ok) throw new ProcessingError(result.error ?? 'This file type is not supported.')
    }
    assertNotCancelled(signal)
    return format
  }, [])

  const setSelection = useCallback((ids?: string[]) => {
    if (running.current) return
    const next = ids === undefined ? null : [...new Set(ids)].filter(id => itemsRef.current.some(item => item.id === id))
    selectionRef.current = next
    updateSelection(next)
    syncSources(itemsRef.current)
  }, [syncSources])
  const setLevel = useCallback((value: CompressionLevel) => {
    if (running.current) return
    levelRef.current = value
    updateLevel(value)
  }, [])
  const setSetting = useCallback((id: string, value: SettingValue) => {
    if (running.current) return
    settingsRef.current = { ...settingsRef.current, [id]: value }
    updateSettings(settingsRef.current)
  }, [])
  const resetSettings = useCallback(() => {
    if (running.current) return
    levelRef.current = 'recommended'
    settingsRef.current = workflowDefaults(toolRef.current)
    updateLevel(levelRef.current)
    updateSettings(settingsRef.current)
  }, [])
  const restoreApplied = useCallback((id: string) => {
    if (running.current) return
    const config = itemsRef.current.find(item => item.id === id)?.appliedConfig
    if (!config) return
    levelRef.current = config.level
    settingsRef.current = { ...config.settings }
    updateLevel(config.level)
    updateSettings(settingsRef.current)
    selectionRef.current = toolRef.current.engine === 'zip-create' ? null : [id]
    updateSelection(selectionRef.current)
    syncSources(itemsRef.current)
  }, [syncSources])

  const addFiles = useCallback((list: FileList | File[]) => {
    if (running.current) return
    const incoming = Array.from(list)
    if (!incoming.length) return
    const total = [...itemsRef.current.map(item => item.file), ...incoming]
    if (total.length > QUEUE_FILES || total.reduce((sum, file) => sum + file.size, 0) > QUEUE_BYTES) {
      setStatus({ kind: 'error', text: 'Add at most 500 files and 300 MB in one queue. Remove files before adding more.' })
      return
    }
    setStatus({ kind: 'idle', text: '' })
    const version = epoch.current
    const prepared: QueueItem[] = incoming.map(file => ({ id: uid(), file, name: file.name, mimeType: file.type, originalSize: file.size, status: 'validating', progress: 0 }))
    update(previous => [...previous, ...prepared])
    if (selectionRef.current !== null) {
      selectionRef.current = [...selectionRef.current, ...prepared.map(item => item.id)]
      updateSelection(selectionRef.current)
      syncSources(itemsRef.current)
    }
    for (const item of prepared) {
      const signal = createCancelSignal()
      signals.current.set(item.id, signal)
      void validate(item, signal).then(format => {
        if (epoch.current === version && !signal.cancelled) patch(item.id, { status: 'queued', inputFormat: format })
      }).catch((error: unknown) => {
        if (epoch.current === version && !signal.cancelled) patch(item.id, { status: 'failed', error: error instanceof Error ? error.message : 'The file could not be checked.' })
      }).finally(() => {
        if (signals.current.get(item.id) === signal) signals.current.delete(item.id)
      })
    }
  }, [patch, syncSources, update, validate])

  const cancelItem = useCallback((id: string) => {
    const batch = toolRef.current.engine === 'zip-create' && running.current
    if (batch) signals.current.forEach(signal => signal.cancel('user'))
    else signals.current.get(id)?.cancel('user')
    update(previous => previous.map(item => (batch && item.activeRunId) || item.id === id
      ? { ...item, status: 'cancelled', stage: undefined, progress: 0, error: undefined }
      : item))
  }, [update])
  const cancelAll = useCallback(() => {
    signals.current.forEach(signal => signal.cancel('user'))
    update(previous => previous.map(item => ['queued', 'processing', 'validating'].includes(item.status)
      ? { ...item, status: 'cancelled', progress: 0, stage: undefined, error: undefined }
      : item))
  }, [update])
  const removeItem = useCallback((id: string) => {
    if (!running.current && itemsRef.current.some(item => item.id === id)) setStatus({ kind: 'idle', text: '' })
    if (toolRef.current.engine === 'zip-create' && running.current) cancelItem(id)
    signals.current.get(id)?.cancel('removed')
    update(previous => {
      previous.filter(item => item.id === id).forEach(revokeItemUrl)
      const removed = previous.find(item => item.id === id)
      const remaining = previous.filter(item => item.id !== id)
      // Removing an archive input must not silently destroy its saved archive.
      if (removed?.artifact && removed.artifact.sourceIds.length > 1 && remaining.length) {
        const nextOwner = remaining[0].id
        return remaining.map((item, index) => ({ ...item, batchOwnerId: nextOwner,
          ...(index === 0 ? { artifact: removed.artifact, appliedConfig: removed.artifact!.config, result: removed.result, outputs: removed.outputs, outputSize: removed.outputSize, comparison: removed.comparison, sourceCount: removed.sourceCount } : {}),
        }))
      }
      return remaining
    })
  }, [cancelItem, update])
  const clearCompleted = useCallback(() => {
    if (running.current) return
    update(previous => {
      previous.filter(item => item.status === 'completed').forEach(revokeItemUrl)
      return previous.filter(item => item.status !== 'completed')
    })
    setStatus({ kind: 'idle', text: '' })
  }, [update])

  const start = useCallback((ids?: string[], mode: RunMode = 'pending') => {
    if (running.current) return
    if ((ids ?? selectionRef.current)?.length === 0) return
    const currentTool = toolRef.current
    const batch = currentTool.engine === 'zip-create'
    const scope = batch ? itemsRef.current : scopedItems(ids)
    // A row action selects work, not a new settings panel. Retry/Process again
    // must use the same visible effective settings as the current workspace.
    const configurationScope = mode === 'force' && !batch ? scopedItems() : scope
    const configs = new Map(scope.map(item => [item.id, configFor(item, configurationScope)]))
    const eligible = (item: QueueItem) => canProcessQueueItem(item, configs.get(item.id)!.engine, currentTool.maxFileSize)
    // A collective ZIP must include every input; never silently omit bad rows.
    if (batch && scope.some(item => !eligible(item))) return
    const requested = scope.filter(item => {
      if (!eligible(item)) return false
      if (mode === 'force') return true
      if (mode === 'changed') return !!item.appliedConfig && isDirty(item, configs.get(item.id)!)
      if (mode === 'selected') return item.status !== 'completed' || isDirty(item, configs.get(item.id)!)
      return item.status === 'queued'
    })
    const candidates = batch && requested.length ? scope : requested
    if (!candidates.length || itemsRef.current.some(item => item.status === 'validating')) return
    const invalid = candidates.map(item => configError(configs.get(item.id)!)).find(Boolean)
    if (invalid) { setStatus({ kind: 'error', text: invalid }); return }
    running.current = true
    setBusy(true)
    const version = epoch.current
    const runId = uid()
    for (const item of candidates) signals.current.set(item.id, createCancelSignal())
    update(previous => previous.map(item => candidates.some(candidate => candidate.id === item.id)
      ? { ...item, activeRunId: runId, runConfig: configs.get(item.id) } : item))
    setStatus({ kind: 'info', text: `Processing ${candidates.length} original file${candidates.length === 1 ? '' : 's'}…` })

    const run = async (item: QueueItem, inputs: QueueItem[] = [item]): Promise<'completed' | 'failed' | 'cancelled'> => {
      const signal = signals.current.get(item.id)!
      const config = configs.get(item.id)!
      const current = () => mounted.current && version === epoch.current && itemsRef.current.some(row => row.id === item.id && row.activeRunId === runId)
      const patchInputs = (value: Partial<QueueItem>) => update(previous => previous.map(row => inputs.some(input => input.id === row.id) && row.activeRunId === runId ? { ...row, ...value } : row))
      let engine: EngineKind | null = null
      try {
        assertNotCancelled(signal)
        if (!current()) return 'cancelled'
        patchInputs({ status: 'validating', error: undefined, archiveFailureCode: undefined, progress: 0, stage: 'Checking original file…' })
        for (const input of inputs) {
          assertNotCancelled(signals.current.get(input.id))
          if (!itemsRef.current.some(row => row.id === input.id)) throw new ProcessingError('A batch input was removed. Retry with the remaining original files.', 'cancelled')
          await validate(input, signal)
        }
        engine = currentTool.engine
        if (currentTool.slug === 'compress') engine = await engineForFormat(await detectFormat(item.file))
        if (!engine) throw new ProcessingError('This file type is not supported by this tool.')
        assertNotCancelled(signal)
        if (!current()) return 'cancelled'
        patchInputs({ status: 'processing', stage: 'Starting…', progress: 0 })
        const started = performance.now()
        const result = await processFile({ engine, file: item.file, allFiles: inputs.map(input => input.file), options: { ...config.options }, signal,
          onProgress: (progress, stage) => { if (current() && !signal.cancelled) patchInputs({ progress, stage }) },
        })
        assertNotCancelled(signal)
        if (!current()) return 'cancelled'
        const durationMs = Math.max(0, performance.now() - started)
        const outputs = (Array.isArray(result) ? result : [result]).map(output => ({ ...output, durationMs: output.durationMs ?? durationMs }))
        if (!outputs.length || outputs.some(output => output.blob.size === 0 && engine !== 'zip-extract')) throw new ProcessingError('No valid output was produced.')
        const artifact: WorkflowArtifact = { id: uid(), runId, config, outputs, sourceIds: inputs.map(input => input.id), sourceBytes: inputs.reduce((sum, input) => sum + input.file.size, 0), createdAt: Date.now() }
        update(previous => previous.map(row => {
          if (!inputs.some(input => input.id === row.id) || row.activeRunId !== runId) return row
          revokeItemUrl(row)
          const owner = row.id === item.id
          return { ...row, status: 'completed', progress: 100, stage: undefined, error: undefined, archiveFailureCode: undefined, activeRunId: undefined, runConfig: undefined,
            appliedConfig: configs.get(row.id), batchOwnerId: batch ? item.id : undefined,
            artifact: owner ? artifact : undefined, result: owner ? outputs[0] : undefined, outputs: owner ? outputs : undefined,
            outputSize: owner ? outputs.reduce((sum, output) => sum + output.blob.size, 0) : undefined,
            comparison: engine === 'zip-extract' ? 'extraction' : batch ? 'archive' : 'compression',
            sourceCount: inputs.length, targetNote: owner ? outputs[0].targetNote : undefined,
          }
        }))
        return 'completed'
      } catch (error) {
        const cancelled = signal.cancelled || isCancellation(error)
        const archiveFailureCode = !cancelled && engine === 'zip-extract' && error instanceof ProcessingError && isArchiveInputFailureCode(error.code) ? error.code : undefined
        if (mounted.current && version === epoch.current) patchInputs({ status: cancelled ? 'cancelled' : 'failed', progress: 0, stage: undefined,
          error: cancelled ? undefined : error instanceof Error ? error.message : 'This file could not be processed.', archiveFailureCode, activeRunId: undefined, runConfig: undefined,
        })
        return cancelled ? 'cancelled' : 'failed'
      }
    }
    void (async () => {
      const outcomes: string[] = []
      try {
        if (batch) outcomes.push(await run(candidates[0], candidates))
        else {
          let cursor = 0
          const limit = currentTool.slug === 'compress' ? 1 : concurrencyFor(currentTool.engine)
          await Promise.all(Array.from({ length: Math.min(limit, candidates.length) }, async () => {
            while (cursor < candidates.length && epoch.current === version) outcomes.push(await run(candidates[cursor++]))
          }))
        }
        if (version !== epoch.current || !mounted.current) return
        const complete = outcomes.filter(value => value === 'completed').length
        const failed = outcomes.filter(value => value === 'failed').length
        const cancelled = outcomes.filter(value => value === 'cancelled').length
        const runArtifacts = itemsRef.current.filter(item => item.artifact?.runId === runId)
        const retained = runArtifacts.filter(item => item.result?.outcome === 'unchanged').length
        const unmet = runArtifacts.filter(item => item.result?.outcome === 'target-unmet').length
        const previousAvailable = itemsRef.current.some(item => item.artifact && item.artifact.runId !== runId)
        setStatus({ kind: failed ? 'error' : cancelled || unmet || retained ? 'info' : 'success',
          text: `${complete} job${complete === 1 ? '' : 's'} finished${retained ? `, ${retained} original${retained === 1 ? '' : 's'} retained` : ''}${unmet ? `, ${unmet} target${unmet === 1 ? '' : 's'} not met` : ''}${failed ? `, ${failed} failed` : ''}${cancelled ? `, ${cancelled} cancelled` : ''}. ${(failed || cancelled) && previousAvailable ? 'Previous successful results remain available. ' : ''}Results stay in this tab until you remove them.`,
        })
      } finally {
        if (version === epoch.current) {
          candidates.forEach(item => signals.current.delete(item.id))
          update(previous => previous.map(item => item.activeRunId === runId ? { ...item, activeRunId: undefined, runConfig: undefined } : item))
          running.current = false
          if (mounted.current) setBusy(false)
        }
      }
    })()
  }, [configFor, isDirty, scopedItems, update, validate])

  const scope = useMemo(() => selection === null ? storedItems : storedItems.filter(item => selection.includes(item.id)), [selection, storedItems])
  const effectiveOptions = useMemo(() => scopeWorkflowOptions(tool, scope, level, settings), [tool, scope, level, settings])
  const items = useMemo(() => storedItems.map(item => {
    const draftConfig = configFor(item, scope, level, settings)
    return { ...item, draftConfig, dirty: isDirty(item, draftConfig) }
  }), [storedItems, scope, level, settings, configFor, isDirty])
  const resultItems = useMemo<QueueItem[]>(() => items.flatMap(item => item.artifact?.outputs.map((result, index) => ({ ...item,
    id: `${item.id}:result:${item.artifact!.id}:${index}`, sourceId: item.id, name: result.filename, status: 'completed' as const,
    result, outputs: undefined, outputSize: result.blob.size, originalSize: index ? 0 : item.comparison === 'archive'
      ? item.artifact!.sourceBytes : item.originalSize,
  })) ?? []), [items])
  const imageScope = tool.engine === 'image-compress' && (tool.slug !== 'compress' || (scope.length > 0 && scope.every(item => IMAGE_FORMATS.includes(item.inputFormat ?? ''))))
  const settingsError = scope.map(item => configError(configFor(item, scope, level, settings))).find(Boolean) ?? null
  const draftConfig = scope.length ? configFor(scope[0], scope, level, settings) : undefined

  return {
    items, resultItems, imageFiles: sources.imageFiles, selectedImageFiles: sources.selectedImageFiles, selectedIds: sources.selectedIds, setSelection, imageScope, effectiveOptions, draftConfig,
    level, setLevel, settings, setSetting, settingsError, resetSettings, restoreApplied,
    busy, status, addFiles, removeItem, cancelItem, cancelAll, clearCompleted,
    runAll: useCallback(() => start(undefined, 'pending'), [start]),
    retryItem: useCallback((id: string) => {
      const item = itemsRef.current.find(row => row.id === id)
      if (item && ['failed', 'cancelled'].includes(item.status)) start([id], 'force')
    }, [start]),
    reprocessItem: useCallback((id: string) => start([id], 'force'), [start]),
    reprocessSelected: useCallback((ids: string[]) => start(ids, 'selected'), [start]),
    reprocessChanged: useCallback((ids?: string[]) => start(ids, 'changed'), [start]),
    dirtyCount: items.filter(item => item.dirty).length,
    pendingCount: items.filter(item => item.status === 'queued').length,
    validatingCount: items.filter(item => item.status === 'validating').length,
    completedCount: items.filter(item => item.status === 'completed').length,
    failedCount: items.filter(item => item.status === 'failed').length,
  }
}
export type FileQueue = ReturnType<typeof useFileQueue>
