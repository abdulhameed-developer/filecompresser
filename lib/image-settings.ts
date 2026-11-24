import type { ProcessingOptions, QueueItem, ToolDefinition } from './types'

export const MAX_IMAGE_TARGET_BYTES = 200_000_000
export const MAX_IMAGE_DIMENSION = 32_768

const IMAGE_OPTION_KEYS = ['imageMode', 'quality', 'targetSize', 'resizeEnabled', 'resizeMaxWidth', 'resizeMaxHeight', 'outputFormat'] as const

/** Hidden image controls must never affect a generic mixed-file batch. */
export function optionsForQueue(tool: ToolDefinition, items: QueueItem[], options: ProcessingOptions): ProcessingOptions {
  const next = { ...options }
  if (tool.slug === 'compress' && !items.every(item => ['jpeg', 'png', 'webp'].includes(item.inputFormat ?? ''))) {
    for (const key of IMAGE_OPTION_KEYS) delete next[key]
    next.level = 'recommended'
  }
  return next
}

const absent = (value: unknown) => value === undefined || value === ''
const numeric = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN

/** Validate every active input instead of silently dropping invalid bounds. */
export function imageSettingsError(options: ProcessingOptions): string | null {
  if (options.imageMode === 'target') {
    if (absent(options.targetSize)) return 'Choose a target preset or enter a maximum output size before processing.'
    const bytes = numeric(options.targetSize)
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_IMAGE_TARGET_BYTES) return 'Maximum output size must be 1 to 200,000,000 whole bytes (up to 200,000 KB).'
  }
  if (options.resizeEnabled === true) {
    for (const [key, label] of [['resizeMaxWidth', 'Maximum width'], ['resizeMaxHeight', 'Maximum height']] as const) {
      const value = options[key]
      if (!absent(value)) {
        const dimension = numeric(value)
        if (!Number.isInteger(dimension) || dimension < 1 || dimension > MAX_IMAGE_DIMENSION) return `${label} must be a whole number from 1 to 32,768 pixels, or left blank.`
      }
    }
    if (absent(options.resizeMaxWidth) && absent(options.resizeMaxHeight)) return 'Enter a maximum width or height, or turn resizing off.'
  }
  return null
}
