export type FileStatus =
  | 'queued'
  | 'validating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CompressionLevel = 'recommended' | 'maximum'

/** Image modes have separate encoder policies; media retain their existing levels. */
export type ImageMode = 'balanced' | 'high-quality' | 'maximum' | 'target'
export type PngMode = 'lossless' | 'smart' | 'maximum' | 'target'
export type ImageOutcome = 'reduced' | 'unchanged' | 'converted' | 'resized' | 'target-met' | 'target-unmet'

/** Dimensions are decoded, orientation-normalized display pixels. */
export interface ImageInspection {
  inputWidth: number
  inputHeight: number
  outputWidth: number
  outputHeight: number
  inputFormat: string
  outputFormat: string
  elapsedMs: number
  encoder: string
  metadataNote: string
  qualityUsed?: number
  inputHasAlpha?: boolean
  outputHasAlpha?: boolean
  compressionKind?: 'lossless' | 'lossy' | 'original'
  colorLimit?: number
}

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
  imageMode?: ImageMode
  pngMode?: PngMode
  resizeEnabled?: boolean
  resizeMaxWidth?: number
  resizeMaxHeight?: number
  quality?: number
  bitrate?: string
  resolution?: string
  outputFormat?: string
  /** Explicit maximum output bytes, independent from display units. */
  targetSize?: number
  asPdf?: boolean
  [key: string]: SettingValue | undefined
}

export interface ProcessedResult {
  blob: Blob
  filename: string
  mimeType: string
  outcome?: ImageOutcome
  inspection?: ImageInspection
  durationMs?: number
  targetBytes?: number
  targetNote?: string
  note?: string
}

/** A frozen run snapshot, including the UI values needed to restore its settings. */
export interface WorkflowConfig {
  toolSlug: string
  engine: EngineKind
  level: CompressionLevel
  settings: Readonly<Record<string, SettingValue>>
  /** Only options that affect this engine and source format. */
  options: Readonly<ProcessingOptions>
  fingerprint: string
}

/** Last successful output is independent of a subsequent attempt's state. */
export interface WorkflowArtifact {
  id: string
  runId: string
  config: WorkflowConfig
  outputs: ProcessedResult[]
  sourceIds: string[]
  /** Snapshot denominator for collective archives, independent of later removals. */
  sourceBytes: number
  createdAt: number
}

export interface QueueItem {
  id: string
  /** Present on derived download rows; identifies their original upload. */
  sourceId?: string
  file: File
  name: string
  mimeType: string
  originalSize: number
  inputFormat?: string
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
  comparison?: 'compression' | 'archive' | 'extraction'
  sourceCount?: number
  /**
   * Set when a Maximum-mode target size could not be met, so the UI can say why
   * instead of silently handing back an oversized file.
   */
  targetNote?: string
  /** For multi-output tools (ZIP extraction, PDF→images): the output files this item produced. */
  outputs?: ProcessedResult[]
  /** Original upload fields above never become generated/extracted files. */
  draftConfig?: WorkflowConfig
  runConfig?: WorkflowConfig
  appliedConfig?: WorkflowConfig
  activeRunId?: string
  artifact?: WorkflowArtifact
  /** ZIP creation shares a collective artifact, owned by one original row. */
  batchOwnerId?: string
  dirty?: boolean
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

export type ToolCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'gif'
  | 'pdf'
  | 'archive'

export type EngineKind =
  | 'image-compress'
  | 'gif-compress'
  | 'video-compress'
  | 'webm-to-mp4'
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
export const BATCH_ENGINES: ReadonlySet<EngineKind> = new Set<EngineKind>([
  'zip-create',
])

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
  subscribe?: (listener: () => void) => () => void
}

export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ProcessingError'
  }
}

export const CANCELLED_CODE = 'cancelled'

export function isCancellation(error: unknown): boolean {
  return error instanceof ProcessingError && error.code === CANCELLED_CODE
}

export function createCancelSignal(): CancelSignal & {
  cancel: (reason?: string) => void
} {
  const listeners = new Set<() => void>()
  const state = {
    cancelled: false,
    reason: undefined as string | undefined,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (state.cancelled) listener()
      return () => {
        listeners.delete(listener)
      }
    },
    cancel(reason?: string) {
      if (state.cancelled) return
      state.cancelled = true
      state.reason = reason
      listeners.forEach((listener) => listener())
      listeners.clear()
    },
  }
  return state
}

/** Subscribe when available; support plain cooperative signals from external callers. */
export function listenForCancellation(
  signal: CancelSignal | undefined,
  listener: () => void,
): () => void {
  if (!signal) return () => {}
  if (signal.subscribe) return signal.subscribe(listener)
  if (signal.cancelled) {
    listener()
    return () => {}
  }
  const timer = setInterval(() => {
    if (signal.cancelled) listener()
  }, 100)
  return () => clearInterval(timer)
}

/** Throws a user-facing cancellation error when the signal has been tripped. */
export function assertNotCancelled(signal?: CancelSignal): void {
  if (signal?.cancelled) {
    throw new ProcessingError('Processing was cancelled.', CANCELLED_CODE)
  }
}
