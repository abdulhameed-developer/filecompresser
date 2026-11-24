import type { ProcessedResult } from './types'

export type ResultOperation = 'reduce' | 'convert' | 'resize'

/** Keep reduction claims tied to bytes; conversions and requested resizing are separate operations. */
export function applyResultPolicy(
  original: File,
  candidate: ProcessedResult,
  operation: ResultOperation = 'reduce',
): ProcessedResult {
  if (operation !== 'reduce') {
    return { ...candidate, outcome: operation === 'convert' ? 'converted' : 'resized' }
  }
  if (candidate.blob.size < original.size) return { ...candidate, outcome: 'reduced' }
  return unchangedResult(original, candidate.mimeType, undefined, candidate)
}

export function unchangedResult(
  original: File,
  mimeType: string,
  note = 'No smaller safe result was found. Your original file is unchanged (0% reduction).',
  attempted?: ProcessedResult,
): ProcessedResult {
  return {
    blob: original.type === mimeType ? original : original.slice(0, original.size, mimeType),
    filename: original.name,
    mimeType,
    outcome: 'unchanged',
    note,
    inspection: attempted?.inspection ? {
      ...attempted.inspection,
      outputWidth: attempted.inspection.inputWidth,
      outputHeight: attempted.inspection.inputHeight,
      outputFormat: attempted.inspection.inputFormat,
      metadataNote: 'Original bytes and metadata retained unchanged.',
    } : undefined,
  }
}
