import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees } from 'pdf-lib'
import { compressPdf } from '@/lib/engines/pdf'

async function source(pdf: PDFDocument, streams = true) {
  return new File([await pdf.save({ useObjectStreams: streams })], 'complex.pdf', { type: 'application/pdf' })
}
describe('PDF document integrity', () => {
  it.each([true, false])('preserves pages, forms, attachment and rotation with object streams %s', async streams => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < 12; i++) pdf.addPage().drawText(`Page ${i + 1}`, { font })
    pdf.getPages()[1].setRotation(degrees(90))
    pdf.setTitle('Private title')
    const field = pdf.getForm().createTextField('name')
    field.setText('Keep this value')
    field.addToPage(pdf.getPages()[0])
    await pdf.attach(new TextEncoder().encode('attachment survives'), 'note.txt')
    const result = await compressPdf(await source(pdf, streams))
    const parsed = await PDFDocument.load(await result.blob.arrayBuffer())
    expect(parsed.getPageCount()).toBe(12)
    expect(parsed.getPages()[1].getRotation().angle).toBe(90)
    expect(parsed.getForm().getTextField('name').getText()).toBe('Keep this value')
    expect(parsed.getTitle()).toBe('')
    expect(parsed.catalog.has(PDFName.of('Names'))).toBe(true)
  })
  it.each([true, false])('refuses an indirect/direct signature dictionary (%s)', async indirect => {
    const pdf = await PDFDocument.create(); pdf.addPage()
    const signature = pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', Contents: PDFString.of('signature'), ByteRange: [0, 100, 200, 100] })
    pdf.catalog.set(PDFName.of('TestSignature'), indirect ? pdf.context.register(signature) : signature)
    await expect(compressPdf(await source(pdf))).rejects.toThrow(/signed PDFs/)
  })
  it('rejects an empty document', async () => {
    const pdf = await PDFDocument.create()
    const bytes = await pdf.save({ addDefaultPage: false })
    await expect(compressPdf(new File([bytes], 'empty.pdf'))).rejects.toThrow(/no pages/)
  })
})
