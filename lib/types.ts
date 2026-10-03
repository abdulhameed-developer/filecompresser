export type FileStatus =
  | 'queued'
  | 'validating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CompressionLevel = 'recommended' | 'maximum'

/** Output containers an engine can genuinely re-encode to. */
export type OutputFormat =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'mp4'
  | 'mp3'
  | 'wav'
  | 'pdf'

export interface OutputFormatOption {
  value: OutputFormat
  label: string
  /** MIME type written into the result blob. */
  mimeType: string
}

/**
 * Values a tool setting can hold. Kept narrow so engines can read options
 * without casting through `any`.
 */
export type SettingValue = string | number | boolean

export interface ProcessingOptions {
  level?: CompressionLevel
  quality?: number
  bitrate?: string
  resolution?: string
  outputFormat?: string
  /** User's hard target size in bytes, from the Maximum-mode size field. */
  targetSize?: number
  asPdf?: boolean
  [key: string]: SettingValue | undefined
}

export interface ProcessedResult {
  blob: Blob
  filename: string
  mimeType: string
}

export interface QueueItem {
  id: string
  file: File
  name: string
  mimeType: string
  originalSize: number
  status: FileStatus
  /** 0–100. Engines that cannot measure progress leave this at 0 and set `indeterminate`. */
  progress: number
  /** True while an engine runs without a measurable percentage (e.g. a single ffmpeg pass). */
  indeterminate?: boolean
  /** Human-readable stage label, e.g. "Encoding…". Announced politely for screen readers. */
  stage?: string
  error?: string
  result?: ProcessedResult
  outputSize?: number
  objectUrl?: string
  /**
   * Set when a Maximum-mode target size could not be met, so the UI can say why
   * instead of silently handing back an oversized file.
   */
  targetNote?: string
  /** For multi-output tools (ZIP extraction, PDF→images): the output files this item produced. */
  outputs?: ProcessedResult[]
}

export interface ToolSetting {
  id: string
  label: string
  type: 'select' | 'range' | 'number'
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  /** Unit suffix shown next to a `number` input, e.g. "KB". */
  suffix?: string
  placeholder?: string
  defaultValue: SettingValue
  /** Short explanation shown beneath the control. */
  help?: string
}

export interface FaqEntry {
  q: string
  a: string
}

export type ToolCategory = 'image' | 'video' | 'audio' | 'gif' | 'pdf' | 'archive'

export type EngineKind =
  | 'image-compress'
  | 'gif-compress'
  | 'video-compress'
  | 'audio-compress'
  | 'pdf-compress'
  | 'zip-create'
  | 'zip-extract'

export interface ToolDefinition {
  slug: string
  title: string
  description: string
  category: ToolCategory
  engine: EngineKind
  /** Value for the native file input's `accept` attribute. */
  accept: string
  /** Extensions used for magic-byte validation. Empty means "any file" (ZIP creator). */
  extensions: string[]
  mimeTypes: string[]
  maxFileSize: number
  /** Extra slugs that render this same tool. Aliases get a canonical pointing at the primary slug. */
  aliases?: string[]
  settings?: ToolSetting[]
  faq?: FaqEntry[]
  seoTitle?: string
  seoDescription?: string
  /**
   * Slugs of tools that pair naturally with this one, best first. Drives the
   * "Related tools" block so it reflects a real next step rather than whatever
   * happens to sit next to this tool in the registry.
   */
  related?: string[]
  /**
   * True only when the tool genuinely runs entirely in the browser. Drives the
   * "never uploaded" banner, so it must never be set optimistically.
   */
  privacyClientSide: boolean
  /** Free-form note shown under the workspace, e.g. honest output-format wording. */
  note?: string
}

/** Engines whose output is a single archive produced from the whole batch. */
export const BATCH_ENGINES: ReadonlySet<EngineKind> = new Set<EngineKind>(['zip-create'])

export interface ProgressCallback {
  (progress: number, message?: string): void
}

/**
 * Long-running engines cannot be aborted mid-flight, so cancellation is
 * cooperative: they check the flag between steps and discard partial output.
 */
export interface CancelSignal {
  readonly cancelled: boolean
  /** Human-readable reason shown when cancellation is requested. */
  readonly reason?: string
}

export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ProcessingError'
  }
}

export const CANCELLED_CODE = 'cancelled'

export function isCancellation(error: unknown): boolean {
  return error instanceof ProcessingError && error.code === CANCELLED_CODE
}

export function createCancelSignal(): CancelSignal & { cancel: (reason?: string) => void } {
  const state = { cancelled: false as boolean, reason: undefined as string | undefined, cancel: (_reason?: string) => {} }
  state.cancel = (reason?: string) => {
    state.cancelled = true
    state.reason = reason
  }
  return state
}

/** Throws a user-facing cancellation error when the signal has been tripped. */
export function assertNotCancelled(signal?: CancelSignal): void {
  if (signal?.cancelled) {
    throw new ProcessingError('Processing was cancelled.', CANCELLED_CODE)
  }
}