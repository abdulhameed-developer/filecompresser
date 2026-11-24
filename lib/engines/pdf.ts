import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream } from 'pdf-lib'
import { replaceExtension, suffixFilename } from '../format'
import { assertNotCancelled } from '../validation'
import type { CancelSignal, ProcessedResult, ProgressCallback } from '../types'
import { ProcessingError } from '../types'
import { applyResultPolicy, unchangedResult } from '../result-policy'

/**
 * Client-side PDF optimization:
 *
 *  1. Drop document metadata (title, author, producer, timestamps).
 *  2. Rewrite the file with cross-reference and object streams, which removes
 *     the byte cost of one xref entry per object.
 *
 * Honest caveat, surfaced in the UI: a PDF whose content is already compressed
 * may not become smaller. In that case the original bytes are returned unchanged.
 * A rewritten output is re-parsed before it is offered.
 *
 * We deliberately do not rasterize pages or recompress embedded images here —
 * that would visibly degrade text and photos, which this tool refuses to do.
 */
export async function compressPdf(
  file: File,
  onProgress?: ProgressCallback,
  signal?: CancelSignal,
): Promise<ProcessedResult> {
  assertNotCancelled(signal)
  if (file.size > 50 * 1024 * 1024) throw new ProcessingError('This PDF exceeds the 50 MB input limit.')
  onProgress?.(5, 'Reading PDF…')

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new ProcessingError(
      'This PDF could not be read into memory. Try a smaller file.',
    )
  }

  // A file that does not even start with %PDF- is not worth handing to a parser.
  const header = String.fromCharCode(...bytes.slice(0, 5))
  if (header !== '%PDF-') {
    throw new ProcessingError(
      'This file is not a valid PDF. It may be corrupted, or renamed from another format.',
    )
  }

  assertNotCancelled(signal)
  onProgress?.(20, 'Parsing document…')

  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (/encrypt/i.test(message)) {
      throw new ProcessingError(
        'This PDF is password-protected. Remove the password before optimizing it.',
      )
    }
    throw new ProcessingError(
      'This PDF could not be opened. It may be corrupted, or use features this tool cannot process.',
    )
  }

  // Rewriting invalidates digital signatures; do not silently offer an unsigned result.
  const pending: unknown[] = pdf.context.enumerateIndirectObjects().map(([, object]) => object)
  const visited = new Set<unknown>()
  let signed = false
  while (pending.length) {
    const object = pending.pop()
    if (visited.has(object)) continue
    visited.add(object)
    if (object instanceof PDFDict) {
      if (object.get(PDFName.of('Type')) === PDFName.of('Sig') || object.has(PDFName.of('ByteRange'))) {
        signed = true
        break
      }
      pending.push(...object.values())
    } else if (object instanceof PDFArray) pending.push(...object.asArray())
  }
  if (signed) throw new ProcessingError('Digitally signed PDFs cannot be optimized without invalidating their signatures. Keep the original document.')
  assertNotCancelled(signal)
  onProgress?.(40, 'Optimizing…')

  if (!stripMetadata(pdf)) return unchangedResult(file, 'application/pdf', 'This PDF uses shared or unsupported metadata structures. Your original file was retained to preserve its integrity (0% reduction).')

  assertNotCancelled(signal)
  onProgress?.(55, 'Rewriting structure…')

  onProgress?.(85, 'Saving…')

  let out: Uint8Array
  try {
    out = await pdf.save({ useObjectStreams: true, addDefaultPage: false })
  } catch {
    throw new ProcessingError(
      'The optimized PDF could not be written. The original is unchanged.',
    )
  }

  // Never hand back something we cannot prove is a readable PDF.
  await verifyOutput(out, pdf.getPageCount())

  assertNotCancelled(signal)
  onProgress?.(100, 'Done')
  return applyResultPolicy(file, {
    blob: new Blob([out], { type: 'application/pdf' }),
    filename: replaceExtension(suffixFilename(file.name, '-compressed'), 'pdf'),
    mimeType: 'application/pdf',
    note: 'Rewrote the document without document-info or catalog XMP metadata. Embedded content and attachments are not sanitized.',
  })
}

function stripMetadata(pdf: PDFDocument): boolean {
  const info = pdf.context.trailerInfo.Info
  const metadataKey = PDFName.of('Metadata')
  const metadata = pdf.catalog.get(metadataKey)
  // PDF serialization retains orphan indirect objects. Delete the metadata
  // objects as well as their links, but never leave a shared reference dangling.
  if (info && !(info instanceof PDFRef)) return false
  if (info && hasOtherReference(pdf, info)) return false
  if (metadata instanceof PDFRef && hasOtherReference(pdf, metadata, pdf.catalog, metadataKey)) return false
  if (info) pdf.context.delete(info)
  pdf.context.trailerInfo.Info = undefined
  pdf.catalog.delete(metadataKey)
  if (metadata instanceof PDFRef) pdf.context.delete(metadata)
  return true
}

function hasOtherReference(pdf: PDFDocument, target: PDFRef, excluded?: PDFDict, excludedKey?: PDFName): boolean {
  const pending: unknown[] = pdf.context.enumerateIndirectObjects().filter(([reference]) => reference !== target).map(([, object]) => object)
  const visited = new Set<unknown>()
  while (pending.length) {
    const object = pending.pop()
    if (object === target) return true
    if (visited.has(object)) continue
    visited.add(object)
    if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) if (object !== excluded || key !== excludedKey) pending.push(value)
    } else if (object instanceof PDFArray) pending.push(...object.asArray())
    else if (object instanceof PDFStream) pending.push(object.dict)
  }
  return false
}

/**
 * Re-parse the freshly written bytes and confirm the page count survived. If the
 * round trip fails we refuse the output rather than hand back a broken file.
 */
async function verifyOutput(
  out: Uint8Array,
  expectedPages: number,
): Promise<void> {
  const header = String.fromCharCode(...out.slice(0, 5))
  if (header !== '%PDF-') {
    throw new ProcessingError(
      'Optimization produced an invalid PDF. The original is unchanged.',
    )
  }
  if (expectedPages === 0) {
    throw new ProcessingError(
      'This PDF has no pages, so there is nothing to optimize.',
    )
  }
  try {
    const reloaded = await PDFDocument.load(out, { updateMetadata: false })
    if (reloaded.getPageCount() !== expectedPages) {
      throw new ProcessingError(
        'Optimization changed the document structure. The original file was left unchanged.',
      )
    }
  } catch (e) {
    if (e instanceof ProcessingError) throw e
    throw new ProcessingError(
      'The optimized PDF failed a read-back check. The original is unchanged.',
    )
  }
}
