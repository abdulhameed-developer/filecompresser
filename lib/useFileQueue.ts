'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CompressionLevel,
  EngineKind,
  ProcessingOptions,
  QueueItem,
  SettingValue,
  ToolDefinition,
} from './types'
import {
  assertNotCancelled,
  createCancelSignal,
  isCancellation,
  ProcessingError,
} from './types'
import { uid } from './format'
import { detectFormat, validateFileAgainstTool } from './validation'
import { concurrencyFor, engineForFormat, processFile } from './process'
import { revokeItemUrl } from './downloads'

export type StatusMessage = {
  kind: 'idle' | 'info' | 'success' | 'error'
  text: string
}
const QUEUE_BYTES = 300 * 1024 * 1024
const QUEUE_FILES = 500
function defaults(tool: ToolDefinition): Record<string, SettingValue> {
  return Object.fromEntries(
    (tool.settings ?? []).map((setting) => [setting.id, setting.defaultValue]),
  )
}
function allowedFormats(tool: ToolDefinition): string[] {
  return [
    ...new Set(
      tool.extensions.map(
        (ext) =>
          ({
            jpg: 'jpeg',
            jfif: 'jpeg',
            jpe: 'jpeg',
            heif: 'heic',
            m4v: 'mp4',
          })[ext] ?? ext,
      ),
    ),
  ]
}

export function useFileQueue(tool: ToolDefinition) {
  const [items, setItems] = useState<QueueItem[]>([])
  const itemsRef = useRef<QueueItem[]>([])
  const [level, setLevel] = useState<CompressionLevel>('recommended')
  const [settings, setSettings] = useState<Record<string, SettingValue>>(() =>
    defaults(tool),
  )
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<StatusMessage>({
    kind: 'idle',
    text: '',
  })
  const running = useRef(false)
  const epoch = useRef(0)
  const mounted = useRef(true)
  const signals = useRef(
    new Map<string, ReturnType<typeof createCancelSignal>>(),
  )

  // Keep the authoritative queue synchronous; event handlers never read stale React state.
  const update = useCallback(
    (change: (previous: QueueItem[]) => QueueItem[]) => {
      if (!mounted.current) return
      itemsRef.current = change(itemsRef.current)
      setItems(itemsRef.current)
    },
    [],
  )
  const patch = useCallback(
    (id: string, value: Partial<QueueItem>) => {
      update((previous) =>
        previous.map((item) => (item.id === id ? { ...item, ...value } : item)),
      )
    },
    [update],
  )

  const invalidate = useCallback(() => {
    epoch.current++
  }, [])
  useEffect(() => {
    mounted.current = true
    const cancelMap = signals.current
    return () => {
      mounted.current = false
      invalidate()
      cancelMap.forEach((signal) => signal.cancel('unmounted'))
      cancelMap.clear()
      itemsRef.current.forEach(revokeItemUrl)
    }
  }, [invalidate])

  useEffect(() => {
    epoch.current++
    signals.current.forEach((signal) => signal.cancel('tool changed'))
    signals.current.clear()
    itemsRef.current.forEach(revokeItemUrl)
    update(() => [])
    running.current = false
    setBusy(false)
    setLevel('recommended')
    setSettings(defaults(tool))
    setStatus({ kind: 'idle', text: '' })
  }, [tool, update])

  const validate = useCallback(
    async (item: QueueItem, signal: ReturnType<typeof createCancelSignal>) => {
      assertNotCancelled(signal)
      if (!item.file.size) throw new ProcessingError('This file is empty.')
      if (item.file.size > tool.maxFileSize)
        throw new ProcessingError(
          `This file is larger than ${tool.maxFileSize / 1024 / 1024} MB, which this tool allows.`,
        )
      let format: string | undefined
      if (tool.engine !== 'zip-create') {
        const result = await validateFileAgainstTool(
          item.file,
          { allowedFormats: allowedFormats(tool), maxSize: tool.maxFileSize },
          signal,
        )
        format = result.format ?? undefined
        if (!result.ok)
          throw new ProcessingError(
            result.error ?? 'This file type is not supported.',
          )
      }
      assertNotCancelled(signal)
      return format
    },
    [tool],
  )

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      if (running.current) return
      const incoming = Array.from(list)
      const total = [...itemsRef.current.map((item) => item.file), ...incoming]
      if (
        total.length > QUEUE_FILES ||
        total.reduce((sum, file) => sum + file.size, 0) > QUEUE_BYTES
      ) {
        setStatus({
          kind: 'error',
          text: 'Add at most 500 files and 300 MB in one queue. Remove results before adding more.',
        })
        return
      }
      const version = epoch.current
      const prepared: QueueItem[] = incoming.map((file) => ({
        id: uid(),
        file,
        name: file.name,
        mimeType: file.type,
        originalSize: file.size,
        status: 'validating',
        progress: 0,
      }))
      update((previous) => [...previous, ...prepared])
      for (const item of prepared) {
        const signal = createCancelSignal()
        signals.current.set(item.id, signal)
        void validate(item, signal)
          .then((format) => {
            if (epoch.current === version && !signal.cancelled)
              patch(item.id, { status: 'queued', inputFormat: format })
          })
          .catch((error: unknown) => {
            if (epoch.current === version && !signal.cancelled)
              patch(item.id, {
                status: 'failed',
                error:
                  error instanceof Error
                    ? error.message
                    : 'The file could not be checked.',
              })
          })
          .finally(() => {
            if (signals.current.get(item.id) === signal)
              signals.current.delete(item.id)
          })
      }
    },
    [patch, update, validate],
  )

  const removeItem = useCallback(
    (id: string) => {
      if (tool.engine === 'zip-create' && running.current)
        signals.current.forEach((signal) =>
          signal.cancel('batch input removed'),
        )
      signals.current.get(id)?.cancel('removed')
      update((previous) => {
        previous.filter((item) => item.id === id).forEach(revokeItemUrl)
        return previous.filter((item) => item.id !== id)
      })
    },
    [update, tool.engine],
  )
  const cancelItem = useCallback(
    (id: string) => {
      if (tool.engine === 'zip-create' && running.current)
        signals.current.forEach((signal) => signal.cancel('user'))
      signals.current.get(id)?.cancel('user')
      patch(id, {
        status: 'cancelled',
        stage: undefined,
        progress: 0,
        error: undefined,
      })
    },
    [patch, tool.engine],
  )
  const cancelAll = useCallback(() => {
    signals.current.forEach((signal) => signal.cancel('user'))
    update((previous) =>
      previous.map((item) =>
        ['queued', 'processing', 'validating'].includes(item.status)
          ? { ...item, status: 'cancelled', progress: 0, stage: undefined }
          : item,
      ),
    )
  }, [update])
  const clearCompleted = useCallback(() => {
    update((previous) => {
      previous
        .filter((item) => item.status === 'completed')
        .forEach(revokeItemUrl)
      return previous.filter((item) => item.status !== 'completed')
    })
  }, [update])
  const options = useMemo<ProcessingOptions>(
    () => ({ level, ...settings }),
    [level, settings],
  )

  const start = useCallback(
    (selection?: string[]) => {
      if (running.current) return
      const batch = tool.engine === 'zip-create'
      const candidates = itemsRef.current.filter((item) =>
        selection ? selection.includes(item.id) : item.status === 'queued',
      )
      if (
        !candidates.length ||
        itemsRef.current.some((item) => item.status === 'validating')
      )
        return
      running.current = true
      setBusy(true)
      const version = epoch.current
      const runOptions = { ...options }
      for (const item of candidates)
        signals.current.set(item.id, createCancelSignal())
      setStatus({
        kind: 'info',
        text: `Processing ${candidates.length} file${candidates.length === 1 ? '' : 's'}…`,
      })

      const run = async (
        item: QueueItem,
        inputs: QueueItem[] = [item],
      ): Promise<'completed' | 'failed' | 'cancelled'> => {
        const signal = signals.current.get(item.id)!
        const current = () =>
          mounted.current &&
          version === epoch.current &&
          itemsRef.current.some((row) => row.id === item.id)
        try {
          assertNotCancelled(signal)
          if (!current()) return 'cancelled'
          patch(item.id, {
            status: 'validating',
            error: undefined,
            progress: 0,
            stage: 'Checking file…',
          })
          for (const input of inputs) {
            assertNotCancelled(signals.current.get(input.id))
            if (!itemsRef.current.some((row) => row.id === input.id))
              throw new ProcessingError(
                'A batch input was removed. Add it again and retry.',
                'cancelled',
              )
            await validate(input, signal)
          }
          let engine: EngineKind | null = tool.engine
          if (tool.slug === 'compress')
            engine = await engineForFormat(await detectFormat(item.file))
          if (!engine)
            throw new ProcessingError(
              'This file type is not supported by this tool.',
            )
          assertNotCancelled(signal)
          patch(item.id, {
            status: 'processing',
            stage: 'Starting…',
            progress: 0,
          })
          const result = await processFile({
            engine,
            file: item.file,
            allFiles: inputs.map((input) => input.file),
            options: runOptions,
            signal,
            onProgress: (progress, stage) => {
              if (current() && !signal.cancelled)
                patch(item.id, { progress, stage })
            },
          })
          assertNotCancelled(signal)
          if (!current()) return 'cancelled'
          const outputs = Array.isArray(result) ? result : [result]
          if (
            !outputs.length ||
            outputs.some(
              (output) => output.blob.size === 0 && engine !== 'zip-extract',
            )
          )
            throw new ProcessingError('No valid output was produced.')
          const extracted = engine === 'zip-extract'
          update((previous) => {
            const ids = new Set(inputs.map((input) => input.id))
            const primary: QueueItem = {
              ...item,
              status: 'completed',
              progress: 100,
              stage: undefined,
              error: undefined,
              name: extracted || batch ? outputs[0].filename : item.name,
              result: outputs[0],
              outputSize: outputs[0].blob.size,
              originalSize: batch
                ? inputs.reduce((sum, input) => sum + input.originalSize, 0)
                : item.originalSize,
              comparison: extracted
                ? 'extraction'
                : batch
                  ? 'archive'
                  : 'compression',
              sourceCount: inputs.length,
              targetNote: (outputs[0] as { targetNote?: string }).targetNote,
            }
            return [
              ...previous.flatMap((row) =>
                row.id === item.id
                  ? [primary]
                  : batch && ids.has(row.id)
                    ? []
                    : [row],
              ),
              ...outputs.slice(1).map(
                (output): QueueItem => ({
                  ...item,
                  id: uid(),
                  name: output.filename,
                  originalSize: 0,
                  status: 'completed',
                  progress: 100,
                  result: output,
                  outputSize: output.blob.size,
                  comparison: 'extraction',
                }),
              ),
            ]
          })
          return 'completed'
        } catch (error) {
          const cancelled = signal.cancelled || isCancellation(error)
          if (current()) {
            for (const input of inputs)
              patch(input.id, {
                status: cancelled ? 'cancelled' : 'failed',
                progress: 0,
                stage: undefined,
                error: cancelled
                  ? undefined
                  : error instanceof Error
                    ? error.message
                    : 'This file could not be processed.',
              })
          }
          return cancelled ? 'cancelled' : 'failed'
        }
      }
      void (async () => {
        const outcomes: string[] = []
        try {
          if (batch) outcomes.push(await run(candidates[0], candidates))
          else {
            let cursor = 0
            // Generic batches are deliberately serial: their actual engines differ.
            const limit =
              tool.slug === 'compress' ? 1 : concurrencyFor(tool.engine)
            await Promise.all(
              Array.from(
                { length: Math.min(limit, candidates.length) },
                async () => {
                  while (
                    cursor < candidates.length &&
                    epoch.current === version
                  ) {
                    const item = candidates[cursor++]
                    outcomes.push(await run(item))
                  }
                },
              ),
            )
          }
          if (version !== epoch.current || !mounted.current) return
          const complete = outcomes.filter(
            (value) => value === 'completed',
          ).length
          const failed = outcomes.filter((value) => value === 'failed').length
          const cancelled = outcomes.filter(
            (value) => value === 'cancelled',
          ).length
          setStatus({
            kind: failed ? 'error' : cancelled ? 'info' : 'success',
            text: `${complete} job${complete === 1 ? '' : 's'} finished${failed ? `, ${failed} failed` : ''}${cancelled ? `, ${cancelled} cancelled` : ''}. Results stay in this tab until you clear them.`,
          })
        } finally {
          if (version === epoch.current) {
            candidates.forEach((item) => signals.current.delete(item.id))
            running.current = false
            if (mounted.current) setBusy(false)
          }
        }
      })()
    },
    [tool, options, patch, update, validate],
  )

  const runAll = useCallback(() => start(), [start])
  const retryItem = useCallback(
    (id: string) => {
      if (running.current) return
      const item = itemsRef.current.find((row) => row.id === id)
      if (!item || !['failed', 'cancelled'].includes(item.status)) return
      // A ZIP retry includes every failed/cancelled input from the retained batch.
      start(
        tool.engine === 'zip-create'
          ? itemsRef.current
              .filter((row) =>
                ['queued', 'failed', 'cancelled'].includes(row.status),
              )
              .map((row) => row.id)
          : [id],
      )
    },
    [start, tool.engine],
  )
  return {
    items,
    level,
    setLevel,
    settings,
    setSetting: useCallback(
      (id: string, value: SettingValue) =>
        setSettings((previous) => ({ ...previous, [id]: value })),
      [],
    ),
    busy,
    status,
    addFiles,
    removeItem,
    cancelItem,
    cancelAll,
    runAll,
    retryItem,
    clearCompleted,
    pendingCount: items.filter((item) => item.status === 'queued').length,
    validatingCount: items.filter((item) => item.status === 'validating')
      .length,
    completedCount: items.filter((item) => item.status === 'completed').length,
    failedCount: items.filter((item) => item.status === 'failed').length,
  }
}
export type FileQueue = ReturnType<typeof useFileQueue>
