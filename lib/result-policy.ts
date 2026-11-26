import type { ProcessedResult } from './types'
import { replaceExtension } from './format'

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
    // Engines supply a verified container MIME here. Keep valid aliases, but
    // repair misleading input suffixes so a retained GIF/PDF still opens in
    // the appropriate application. Arbitrary extracted entries do not use
    // this policy and keep their own names.
    filename: verifiedOriginalFilename(original.name, mimeType),
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

function verifiedOriginalFilename(name: string, mimeType: string): string {
  const extensions: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg', 'jfif'], 'image/png': ['png'],
    'image/webp': ['webp'], 'image/gif': ['gif'], 'application/pdf': ['pdf'],
    'video/mp4': ['mp4', 'm4v'], 'video/quicktime': ['mov'],
    'audio/mpeg': ['mp3'], 'audio/wav': ['wav'],
  }
  const accepted = extensions[mimeType]
  if (!accepted) return name
  const current = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return accepted.includes(current) ? name : replaceExtension(name, accepted[0])
}
