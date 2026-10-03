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
  BATCH_ENGINES,
  assertNotCancelled,
  createCancelSignal,
  isCancellation,
  ProcessingError,
} from './types'
import { uid } from './format'
import { detectFormat, validateFileAgainstTool } from './validation'
import { concurrencyFor, engineForFormat, processFile } from './process'
import { revokeItemUrl } from './downloads'

/** Engines that consume the whole queue once and emit a single result. */
function isBatchEngine(engine: EngineKind): boolean {
  return BATCH_ENGINES.has(engine)
}

export type StatusMessage =
  | { kind: 'idle'; text: '' }
  | { kind: 'info'; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

/** Map a tool's declared extensions onto the format names detection returns. */
function allowedFormats(tool: ToolDefinition): string[] {
  if (!tool.extensions.length) return [] // ZIP creator accepts anything
  const mapped = tool.extensions.map((ext) => {
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' || ext === 'jpe') return 'jpeg'
    if (ext === 'heif') return 'heic'
    if (ext === 'm4v') return 'mp4'
    return ext
  })
  return [...new Set(mapped)]
}

/** Engines that accept any file type (used by the ZIP creator and the homepage). */
function acceptsAnyFormat(tool: ToolDefinition): boolean {
  return tool.engine === 'zip-create'
}

/**
 * What a single run produced.
 *
 * Reported by `runOne` rather than re-read from state, because React state
 * updates are asynchronous: counting rows immediately after the last job
 * settles reads the pre-update list, which is how a finished batch ends up
 * announcing "0 files processed".
 */
type RunOutcome = 'completed' | 'failed' | 'cancelled'

export interface FileQueue {
  items: QueueItem[]
  level: CompressionLevel
  setLevel: (level: CompressionLevel) => void
  settings: Record<string, SettingValue>
  setSetting: (id: string, value: SettingValue) => void
  busy: boolean
  status: StatusMessage
  addFiles: (files: FileList | File[]) => void
  removeItem: (id: string) => void
  cancelItem: (id: string) => void
  cancelAll: () => void
  runAll: () => void
  retryItem: (id: string) => void
  clearCompleted: () => void
  pendingCount: number
  completedCount: number
  failedCount: number
}

export function useFileQueue(tool: ToolDefinition): FileQueue {
  const [items, setItems] = useState<QueueItem[]>([])
  const [level, setLevel] = useState<CompressionLevel>('recommended')
  const [settings, setSettings] = useState<Record<string, SettingValue>>(() => {
    const initial: Record<string, SettingValue> = {}
    for (const setting of tool.settings ?? []) initial[setting.id] = setting.defaultValue
    return initial
  })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<StatusMessage>({ kind: 'idle', text: '' })

  const itemsRef = useRef<QueueItem[]>([])
  itemsRef.current = items

  const cancelsRef = useRef(new Map<string, (reason?: string) => void>())
  const mountedRef = useRef(true)
  const runningRef = useRef(false)

  // A tool change (client navigation between tool routes) resets the workspace.
  useEffect(() => {
    setItems([])
    setBusy(false)
    setStatus({ kind: 'idle', text: '' })
    setLevel('recommended')
    const initial: Record<string, SettingValue> = {}
    for (const setting of tool.settings ?? []) initial[setting.id] = setting.defaultValue
    setSettings(initial)
  }, [tool.slug, tool.settings])

  // Release every Object URL and abort in-flight work when the page goes away.
  useEffect(() => {
    mountedRef.current = true
    const cancels = cancelsRef.current
    return () => {
      mountedRef.current = false
      itemsRef.current.forEach(revokeItemUrl)
      cancels.forEach((cancel) => cancel('unmounted'))
      cancels.clear()
    }
  }, [])

  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list)
      if (!incoming.length) return

      const prepared: QueueItem[] = incoming.map((file) => ({
        id: uid(),
        file,
        name: file.name,
        mimeType: file.type,
        originalSize: file.size,
        status: 'validating',
        progress: 0,
      }))

      setItems((prev) => [...prev, ...prepared])

      // Validate outside the state updater so async work cannot race React.
      void (async () => {
        for (const item of prepared) {
          if (!mountedRef.current) return

          if (item.file.size === 0) {
            patchItem(item.id, { status: 'failed', error: 'This file is empty.' })
            continue
          }
          if (item.file.size > tool.maxFileSize) {
            patchItem(item.id, {
              status: 'failed',
              error: `This file is larger than ${Math.round(tool.maxFileSize / (1024 * 1024))} MB, which this tool allows.`,
            })
            continue
          }

          if (acceptsAnyFormat(tool)) {
            patchItem(item.id, { status: 'queued' })
            continue
          }

          const result = await validateFileAgainstTool(item.file, {
            allowedFormats: allowedFormats(tool),
            maxSize: tool.maxFileSize,
          })
          if (!mountedRef.current) return

          patchItem(item.id, {
            status: result.ok ? 'queued' : 'failed',
            error: result.error,
          })
        }
      })()
    },
    [patchItem, tool]
  )

  const removeItem = useCallback(
    (id: string) => {
      cancelsRef.current.get(id)?.('removed')
      cancelsRef.current.delete(id)
      setItems((prev) => {
        const target = prev.find((item) => item.id === id)
        if (target) revokeItemUrl(target)
        return prev.filter((item) => item.id !== id)
      })
    },
    []
  )

  const clearCompleted = useCallback(() => {
    setItems((prev) => {
      const remaining = prev.filter((item) => item.status !== 'completed')
      prev.filter((item) => item.status === 'completed').forEach(revokeItemUrl)
      return remaining
    })
  }, [])

  const cancelItem = useCallback(
    (id: string) => {
      const cancel = cancelsRef.current.get(id)
      if (!cancel) return
      cancel('user')
      patchItem(id, { status: 'cancelled', stage: 'Cancelled', progress: 0 })
    },
    [patchItem]
  )

  const cancelAll = useCallback(() => {
    cancelsRef.current.forEach((cancel) => cancel('user'))
  }, [])

  const options = useMemo<ProcessingOptions>(
    () => ({ level, ...settings }),
    [level, settings]
  )

  /** Resolve which engine actually handles this item (the homepage routes by format). */
  const resolveEngine = useCallback(
    async (item: QueueItem): Promise<EngineKind | null> => {
      if (tool.slug !== 'compress') return tool.engine

      const fmt = (await detectFormat(item.file)) ?? null
      return engineForFormat(fmt)
    },
    [tool.engine, tool.slug]
  )

  const completeItem = useCallback(
    (item: QueueItem, result: Awaited<ReturnType<typeof processFile>>) => {
      const outputs = Array.isArray(result) ? result : [result]

      if (outputs.length === 0) {
        patchItem(item.id, { status: 'failed', error: 'No output was produced.', progress: 0 })
        return
      }

      // The first output takes over the item the user dropped; the rest become
      // their own rows so each is individually downloadable.
      const primary = outputs[0]
      patchItem(item.id, {
        status: 'completed',
        progress: 100,
        stage: undefined,
        result: primary,
        outputSize: primary.blob.size,
        objectUrl: URL.createObjectURL(primary.blob),
        // Engines explain here when a requested size could not be reached.
        targetNote: (primary as { targetNote?: string }).targetNote,
      })

      if (outputs.length > 1) {
        setItems((prev) => [
          ...prev,
          ...outputs.slice(1).map((output) => ({
            id: uid(),
            file: item.file,
            name: output.filename,
            mimeType: output.mimeType,
            originalSize: output.blob.size,
            status: 'completed' as const,
            progress: 100,
            result: output,
            outputSize: output.blob.size,
            objectUrl: URL.createObjectURL(output.blob),
          })),
        ])
      }
    },
    [patchItem]
  )

  const failItem = useCallback(
    (id: string, error: unknown, cancelled: boolean) => {
      if (cancelled || isCancellation(error)) {
        patchItem(id, { status: 'cancelled', stage: undefined, progress: 0, error: undefined })
        return
      }
      const message =
        error instanceof ProcessingError
          ? error.message
          : 'This file could not be processed. It may be corrupted, or use an unsupported format.'
      patchItem(id, { status: 'failed', stage: undefined, progress: 0, error: message })
    },
    [patchItem]
  )

  const runOne = useCallback(
    async (item: QueueItem, batchFiles?: File[]): Promise<RunOutcome> => {
      const signal = createCancelSignal()
      cancelsRef.current.set(item.id, signal.cancel)

      patchItem(item.id, { status: 'processing', progress: 1, error: undefined, stage: 'Starting…' })

      try {
        const engine = await resolveEngine(item)
        if (!engine) {
          throw new ProcessingError('This file type is not supported by this tool.')
        }

        const result = await processFile({
          engine,
          file: item.file,
          allFiles: batchFiles,
          options,
          signal,
          onProgress: (progress, message) => {
            if (!mountedRef.current || signal.cancelled) return
            patchItem(item.id, { progress, stage: message })
          },
        })

        assertNotCancelled(signal)
        completeItem(item, result)
        return 'completed'
      } catch (e) {
        const cancelled = signal.cancelled || isCancellation(e)
        failItem(item.id, e, cancelled)
        return cancelled ? 'cancelled' : 'failed'
      } finally {
        cancelsRef.current.delete(item.id)
      }
    },
    [completeItem, failItem, options, patchItem, resolveEngine]
  )

  /**
   * ZIP creation turns the whole queue into one archive, so it is driven once
   * rather than per file. Everything else processes each queued item.
   */
  const runAll = useCallback(() => {
    if (runningRef.current) return

    const queued = itemsRef.current.filter((item) => item.status === 'queued')
    if (!queued.length) return

    runningRef.current = true
    setBusy(true)
    setStatus({ kind: 'info', text: `Processing ${queued.length} file${queued.length === 1 ? '' : 's'}…` })

    void (async () => {
      const tally: RunOutcome[] = []

      try {
        if (isBatchEngine(tool.engine)) {
          // ZIP creation consumes the whole queue once.
          tally.push(await runOne(queued[0], queued.map((item) => item.file)))
          // Other queued rows were inputs to the single output; drop them so
          // the user is not left with duplicate "ready" rows for the same job.
          if (mountedRef.current) {
            setItems((prev) => {
              const keep = new Set([queued[0].id])
              prev
                .filter((item) => queued.some((q) => q.id === item.id) && !keep.has(item.id))
                .forEach(revokeItemUrl)
              return prev.filter((item) => !queued.some((q) => q.id === item.id) || keep.has(item.id))
            })
          }
        } else {
          const limit = Math.max(1, concurrencyFor(tool.engine))
          let cursor = 0
          let active = 0

          await new Promise<void>((resolve) => {
            const pump = () => {
              while (active < limit && cursor < queued.length) {
                const next = queued[cursor++]
                active++
                void runOne(next)
                  .then((outcome) => {
                    tally.push(outcome)
                  })
                  .finally(() => {
                    active--
                    if (cursor >= queued.length && active === 0) resolve()
                    else pump()
                  })
              }
              if (cursor >= queued.length && active === 0) resolve()
            }
            pump()
          })
        }

        if (!mountedRef.current) return

        const completed = tally.filter((outcome) => outcome === 'completed').length
        const failed = tally.filter((outcome) => outcome === 'failed').length
        const cancelled = tally.filter((outcome) => outcome === 'cancelled').length

        if (failed > 0) {
          setStatus({
            kind: 'error',
            text: `${completed} finished, ${failed} failed. Check the message on each failed file.`,
          })
        } else if (cancelled > 0 && completed === 0) {
          setStatus({ kind: 'info', text: 'Cancelled. Nothing was changed.' })
        } else {
          setStatus({
            kind: 'success',
            text: `Done — ${completed} file${completed === 1 ? '' : 's'} processed on this device.`,
          })
        }
      } finally {
        runningRef.current = false
        if (mountedRef.current) setBusy(false)
      }
    })()
  }, [runOne, tool.engine])

  const retryItem = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((x) => x.id === id)
      if (!item) return
      revokeItemUrl(item)
      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? { ...x, status: 'queued', error: undefined, stage: undefined, progress: 0, result: undefined, outputSize: undefined, targetNote: undefined }
            : x
        )
      )
      // Re-queue and let the shared runner pick it up immediately.
      runningRef.current = true
      setBusy(true)
      void runOne({ ...item, status: 'queued', error: undefined, result: undefined }).then(
        (outcome) => {
          if (!mountedRef.current) return
          setStatus(
            outcome === 'completed'
              ? { kind: 'success', text: 'Retry finished. The file was processed on this device.' }
              : outcome === 'cancelled'
                ? { kind: 'info', text: 'Retry cancelled.' }
                : { kind: 'error', text: 'The retry did not succeed. Check the message on the file.' }
          )
        }
      ).finally(() => {
        runningRef.current = false
        if (mountedRef.current) setBusy(false)
      })
    },
    [runOne]
  )

  const pendingCount = items.filter((item) => item.status === 'queued').length
  const completedCount = items.filter((item) => item.status === 'completed').length
  const failedCount = items.filter((item) => item.status === 'failed').length

  return {
    items,
    level,
    setLevel,
    settings,
    setSetting: useCallback((id: string, value: SettingValue) => {
      setSettings((prev) => ({ ...prev, [id]: value }))
    }, []),
    busy,
    status,
    addFiles,
    removeItem,
    cancelItem,
    cancelAll,
    runAll,
    retryItem,
    clearCompleted,
    pendingCount,
    completedCount,
    failedCount,
  }
}