import { ARCHIVE_INPUT_FAILURE_CODES } from './types'
import type { ArchiveInputFailureCode, EngineKind, QueueItem } from './types'

const archiveInputCodes: ReadonlySet<string> = new Set(Object.values(ARCHIVE_INPUT_FAILURE_CODES))
export const ARCHIVE_REPLACE_GUIDANCE = 'Remove this ZIP and choose another file.'

export function isArchiveInputFailureCode(code: unknown): code is ArchiveInputFailureCode {
  return typeof code === 'string' && archiveInputCodes.has(code)
}

export function hasTerminalArchiveFailure(item: QueueItem, engine: EngineKind): boolean {
  return engine === 'zip-extract' && item.status === 'failed' && isArchiveInputFailureCode(item.archiveFailureCode)
}

/** Shared by visible actions and the queue itself, including forced row actions. */
export function canProcessQueueItem(item: QueueItem, engine: EngineKind, maxFileSize: number): boolean {
  if (item.activeRunId || item.status === 'validating' || item.status === 'processing') return false
  if (item.file.size > maxFileSize) return false
  if (hasTerminalArchiveFailure(item, engine)) return false
  return !(item.status === 'failed' && !item.inputFormat && engine !== 'zip-create')
}
