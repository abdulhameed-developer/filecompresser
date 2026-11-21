import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib'
import { replaceExtension, suffixFilename } from '../format'
import { assertNotCancelled } from '../validation'
import type { CancelSignal, ProcessedResult, ProgressCallback } from '../types'
import { ProcessingError } from '../types'

/**
 * Client-side PDF optimization:
 *
 *  1. Drop document metadata (title, author, producer, timestamps).
 *  2. Rewrite the file with cross-reference and object streams, which removes
 *     the byte cost of one xref entry per object.
 *
 * Honest caveat, surfaced in the UI: a PDF whose content is already compressed
 * may come out the same size or marginally larger. We never damage a document to
 * manufacture a smaller number, and the output is re-parsed before it is offered.
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

  try {
    stripMetadata(pdf)
  } catch {
    // Metadata removal is best-effort; a PDF without an info dict is fine.
  }

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
  return {
    blob: new Blob([out], { type: 'application/pdf' }),
    filename: replaceExtension(suffixFilename(file.name, '-compressed'), 'pdf'),
    mimeType: 'application/pdf',
  }
}

function stripMetadata(pdf: PDFDocument): void {
  pdf.setTitle('')
  pdf.setAuthor('')
  pdf.setSubject('')
  pdf.setKeywords([])
  pdf.setProducer('filecompresser')
  pdf.setCreator('filecompresser')

  const withInfo = pdf as unknown as {
    getInfoDict?: () => { delete: (k: ReturnType<typeof PDFName.of>) => void }
  }
  const info = withInfo.getInfoDict?.()
  if (info) {
    for (const key of ['ModDate', 'CreationDate', 'Trapped']) {
      try {
        info.delete(PDFName.of(key))
      } catch {
        /* key absent */
      }
    }
  }
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
