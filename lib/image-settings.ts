import type { ProcessingOptions, QueueItem, ToolDefinition } from './types'

export const MAX_IMAGE_TARGET_BYTES = 200_000_000
// Image dimensions are always preserved; resizing is intentionally not exposed.

const IMAGE_OPTION_KEYS = ['imageMode', 'quality', 'targetSize', 'outputFormat'] as const

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
  return null
}

/** Strict bytes from the actual setting, shared by dispatch and final checks. */
export function parseImageTargetBytes(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined
  const bytes = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isSafeInteger(bytes) && bytes >= 1 && bytes <= MAX_IMAGE_TARGET_BYTES ? bytes : undefined
}

/** Decimal KB to exact whole bytes, including ordinary exponent notation.
 * Invalid drafts retain their entered KB text and cannot parse as byte limits.
 * String arithmetic avoids both IEEE tails (0.029KB) and upward rounding of
 * fractional bytes. The small input bound prevents unbounded exponent work.
 */
export function parseTargetKilobytes(input: string): number | string {
  if (input === '') return ''
  const invalid = () => `${input} KB`
  if (input.length > 64) return invalid()
  const match = /^\+?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(input)
  if (!match || !(match[1] || match[2])) return invalid()
  const exponent = Number(match[3] || 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 64) return invalid()
  let digits = `${match[1]}${match[2] || ''}`.replace(/^0+/, '') || '0'
  const shift = 3 + exponent - (match[2]?.length || 0)
  if (shift < 0) {
    const fractionalDigits = -shift
    if (fractionalDigits > digits.length || !digits.endsWith('0'.repeat(fractionalDigits))) return invalid()
    digits = digits.slice(0, -fractionalDigits) || '0'
  } else {
    if (digits.length + shift > 9) return invalid()
    digits += '0'.repeat(shift)
  }
  return parseImageTargetBytes(Number(digits)) ?? invalid()
}

export function targetKilobytesDisplay(value: unknown): string {
  if (value === undefined || value === '') return ''
  if (typeof value === 'string' && value.endsWith(' KB')) return value.slice(0, -3)
  return String(Number(value) / 1000)
}
