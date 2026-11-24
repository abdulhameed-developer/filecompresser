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
    expect(parsed.getTitle()).toBeUndefined()
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

  it('returns exact original bytes and name when a minimal PDF cannot be reduced', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([200, 200])
    pdf.context.trailerInfo.Info = undefined
    const input = new File([await pdf.save({ useObjectStreams: true })], 'minimal.pdf', { type: 'application/pdf' })
    const result = await compressPdf(input)
    expect(result.outcome).toBe('unchanged')
    expect(result.filename).toBe(input.name)
    expect(result.note).toMatch(/original.*unchanged.*0%/i)
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await input.arrayBuffer()))
    expect(result.blob.size).toBe(input.size)
  })

  it('removes document-info and catalog XMP bytes without changing the page geometry', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([612, 792])
    pdf.setTitle('Private Document Title')
    pdf.setAuthor('Private Author')
    const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/">${'Private XMP Author '.repeat(1000)}</x:xmpmeta>`
    const stream = pdf.context.stream(new TextEncoder().encode(xml), { Type: 'Metadata', Subtype: 'XML' })
    pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(stream))
    const input = await source(pdf)
    const result = await compressPdf(input)
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const parsed = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(result.outcome).toBe('reduced')
    expect(result.blob.size).toBeLessThan(input.size)
    expect(parsed.context.trailerInfo.Info).toBeUndefined()
    expect(parsed.getTitle()).toBeUndefined()
    expect(parsed.getAuthor()).toBeUndefined()
    expect(parsed.catalog.has(PDFName.of('Metadata'))).toBe(false)
    expect(new TextDecoder().decode(bytes)).not.toContain('Private XMP Author')
    expect(new TextDecoder().decode(bytes)).not.toContain('Private Document Title')
    expect(parsed.getPages()[0].getSize()).toEqual({ width: 612, height: 792 })
  })

  it('retains original bytes if removing shared metadata would leave a dangling reference', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const metadata = pdf.context.register(pdf.context.stream(new TextEncoder().encode('shared metadata'), { Type: 'Metadata', Subtype: 'XML' }))
    pdf.catalog.set(PDFName.of('Metadata'), metadata)
    pdf.catalog.set(PDFName.of('CustomSharedObject'), metadata)
    const input = await source(pdf)
    const result = await compressPdf(input)
    expect(result.outcome).toBe('unchanged')
    expect(result.note).toMatch(/shared.*metadata.*integrity/i)
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await input.arrayBuffer()))
  })
})
