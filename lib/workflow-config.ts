import type { CompressionLevel, EngineKind, ProcessingOptions, QueueItem, SettingValue, ToolDefinition, WorkflowConfig } from './types'
import { optionsForQueue } from './image-settings'

// Color-reducing PNG optimization is an explicit choice, including mixed queues.
const DEFAULT_IMAGE_SETTINGS = { imageMode: 'balanced', pngMode: 'lossless' } as const

export function workflowDefaults(tool: ToolDefinition): Record<string, SettingValue> {
  return {
    ...(tool.engine === 'image-compress' ? DEFAULT_IMAGE_SETTINGS : {}),
    ...Object.fromEntries((tool.settings ?? []).map(setting => [setting.id, setting.defaultValue])),
  }
}

export function workflowEngine(tool: ToolDefinition, format?: string): EngineKind {
  if (tool.slug !== 'compress') return tool.engine
  if (format === 'pdf') return 'pdf-compress'
  if (format === 'gif') return 'gif-compress'
  if (format === 'mp4' || format === 'mov') return 'video-compress'
  if (['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(format ?? '')) return 'audio-compress'
  if (format === 'zip') return 'zip-extract'
  return 'image-compress'
}

const numberValue = (value: SettingValue | undefined) => {
  if (value === undefined || value === '') return undefined
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
}

/** Normalize only effects the engine actually consumes, not hidden UI controls. */
export function normalizedWorkflowOptions(engine: EngineKind, format: string | undefined, options: ProcessingOptions): ProcessingOptions {
  const level = options.level === 'maximum' ? 'maximum' : 'recommended'
  if (engine === 'image-compress') {
    const imageMode = ['balanced', 'high-quality', 'maximum', 'target'].includes(String(options.imageMode))
      ? options.imageMode! : level === 'maximum' ? 'maximum' : 'balanced'
    const outputFormat = ['jpeg', 'png', 'webp'].includes(String(options.outputFormat)) ? options.outputFormat : undefined
    const result: ProcessingOptions = { imageMode }
    // Explicitly selecting the detected source container has the same effect as Keep original.
    if (outputFormat && outputFormat !== format) result.outputFormat = outputFormat
    const pngOutput = (outputFormat ?? format) === 'png'
    if (pngOutput) {
      const pngMode = ['lossless', 'smart', 'maximum', 'target'].includes(String(options.pngMode)) ? options.pngMode! : 'lossless'
      delete result.imageMode
      result.pngMode = pngMode
      if (pngMode === 'target') result.targetSize = numberValue(options.targetSize)
    } else if (imageMode === 'target') result.targetSize = numberValue(options.targetSize)
    else {
      const preset = imageMode === 'high-quality' ? 0.93 : imageMode === 'maximum' ? 0.6 : 0.82
      const quality = numberValue(options.quality)
      result.quality = typeof quality === 'number' ? Math.min(1, Math.max(0.1, quality)) : preset
    }
    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined))
  }
  if (engine === 'video-compress') return { level, resolution: ['1080', '720', '480'].includes(String(options.resolution)) ? options.resolution : 'original' }
  if (engine === 'audio-compress') return { bitrate: typeof options.bitrate === 'string' && options.bitrate ? options.bitrate : level === 'maximum' ? '96k' : '192k' }
  if (engine === 'gif-compress') return { level }
  return {}
}

export function scopeWorkflowOptions(tool: ToolDefinition, scope: QueueItem[], level: CompressionLevel, settings: Record<string, SettingValue>): ProcessingOptions {
  const options = optionsForQueue(tool, scope, { level, ...settings })
  if (tool.slug === 'compress' && (!scope.length || scope.some(item => !['jpeg', 'png', 'webp'].includes(item.inputFormat ?? '')))) {
    for (const key of ['imageMode', 'pngMode', 'quality', 'targetSize', 'outputFormat']) delete options[key]
    options.level = 'recommended'
    // Only the image defaults carry into mixed queues. Hidden transformations
    // and targets never apply; media keep their own recommended defaults.
    options.imageMode = DEFAULT_IMAGE_SETTINGS.imageMode
    options.pngMode = DEFAULT_IMAGE_SETTINGS.pngMode
  }
  return options
}

export function workflowConfig(tool: ToolDefinition, item: Pick<QueueItem, 'inputFormat'>, level: CompressionLevel, settings: Record<string, SettingValue>, scopedOptions: ProcessingOptions): WorkflowConfig {
  const engine = workflowEngine(tool, item.inputFormat)
  const options = normalizedWorkflowOptions(engine, item.inputFormat, scopedOptions)
  const ordered = Object.fromEntries(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)))
  return Object.freeze({
    toolSlug: tool.slug, engine, level,
    settings: Object.freeze({ ...settings }),
    options: Object.freeze(options),
    fingerprint: JSON.stringify([tool.slug, engine, ordered]),
  })
}

export function sameWorkflowSources(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}
