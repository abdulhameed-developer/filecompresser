/** Source-engine PDF/ZIP evidence with generated files and independent decoders.
 * node scripts/document-benchmark.mjs
 * Requires native pdftotext/pdfinfo and Python's standard ZIP decoder.
 * Not a browser UI, download-delivery or cold browser-startup benchmark.
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib'

const directory = path.resolve(process.env.QA_OUTPUT || '.qa-results/document-benchmark')
mkdirSync(directory, { recursive: true })
const bundle = path.join(directory, 'document-engines.mjs')
await build({
  stdin: { contents: "export { compressPdf } from './lib/engines/pdf'; export { createZip, extractZip } from './lib/engines/zip'", resolveDir: process.cwd() },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle,
})
const { compressPdf, createZip, extractZip } = await import(pathToFileURL(bundle).href)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const median = values => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]
const records = []

const text = await PDFDocument.create()
const font = await text.embedFont(StandardFonts.Helvetica)
for (let index = 0; index < 24; index++) {
  const page = text.addPage([612, 792])
  for (let line = 0; line < 30; line++) page.drawText(`Page ${index + 1}, line ${line + 1}: preserve searchable text and document geometry.`, { font, size: 10, x: 32, y: 750 - line * 22 })
}
text.setTitle('Generated optimization fixture')
text.setSubject('Removable document metadata. '.repeat(2000))

const interactive = await PDFDocument.create()
const page = interactive.addPage([612, 792])
page.drawText('Generated interactive document: preserve this text.')
page.setRotation(degrees(90))
const field = interactive.getForm().createTextField('retained-answer')
field.setText('The form value survives.')
field.addToPage(page, { x: 32, y: 200, width: 250, height: 40 })
await interactive.attach(new TextEncoder().encode('The attachment bytes survive.'), 'note.txt')
interactive.setSubject('Removable document metadata. '.repeat(1000))

const optimized = await PDFDocument.create()
optimized.addPage([200, 300]).drawText('Already optimized text.')
optimized.context.trailerInfo.Info = undefined

// Raster image embedded in a PDF: a valid image-dominated scan surrogate, not a
// claim that this structural engine recompresses real scanned photographs.
const imagePdf = await PDFDocument.create()
const width = 960, height = 1280
const pixels = new Uint8Array(width * height * 3)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const offset = (y * width + x) * 3
  const ink = y % 44 < 5 && x > 40 && x < 900 ? (x * 17 + y * 7) % 200 : 244 + (x + y) % 12
  pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = ink
}
const stream = imagePdf.context.flateStream(pixels, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 })
const imageReference = imagePdf.context.register(stream)
const scannedPage = imagePdf.addPage([600, 800])
scannedPage.node.setXObject(PDFName.of('Scan'), imageReference)
const content = imagePdf.context.register(imagePdf.context.flateStream(new TextEncoder().encode('q 600 0 0 800 0 0 cm /Scan Do Q')))
scannedPage.node.addContentStream(content)
imagePdf.context.trailerInfo.Info = undefined

const cases = [
  { id: 'text-24-pages', pdf: text, objectStreams: false },
  { id: 'interactive-attachment', pdf: interactive, objectStreams: false },
  { id: 'already-optimized', pdf: optimized, objectStreams: true },
  { id: 'image-dominated-scan-surrogate', pdf: imagePdf, objectStreams: true },
]
for (const fixture of cases) {
  const inputBytes = await fixture.pdf.save({ useObjectStreams: fixture.objectStreams })
  const originalPath = path.join(directory, `${fixture.id}-input.pdf`)
  writeFileSync(originalPath, inputBytes)
  const originalText = execFileSync(process.env.PDFTOTEXT_PATH || 'pdftotext', [originalPath, '-']).toString()
  const times = []
  let record
  for (let repetition = 0; repetition < 3; repetition++) {
    const started = performance.now()
    const result = await compressPdf(new File([inputBytes], `${fixture.id}.pdf`, { type: 'application/pdf' }))
    times.push(performance.now() - started)
    const outputBytes = new Uint8Array(await result.blob.arrayBuffer())
    const outputPath = path.join(directory, `${fixture.id}-output.pdf`)
    writeFileSync(outputPath, outputBytes)
    const outputText = execFileSync(process.env.PDFTOTEXT_PATH || 'pdftotext', [outputPath, '-']).toString()
    assert.equal(outputText, originalText, 'Independent searchable text must survive exactly')
    const parsed = await PDFDocument.load(outputBytes, { updateMetadata: false })
    assert.equal(parsed.getPageCount(), fixture.pdf.getPageCount())
    const beforeGeometry = fixture.pdf.getPages().map(item => ({ size: item.getSize(), rotation: item.getRotation().angle }))
    assert.deepEqual(parsed.getPages().map(item => ({ size: item.getSize(), rotation: item.getRotation().angle })), beforeGeometry)
    // A separate PDF implementation must be able to parse the written file.
    execFileSync(process.env.PDFINFO_PATH || 'pdfinfo', [outputPath])
    if (fixture.id === 'interactive-attachment') {
      assert.equal(parsed.getForm().getTextField('retained-answer').getText(), 'The form value survives.')
      assert(parsed.catalog.has(PDFName.of('Names')), 'Attachment name tree retained')
      const attachmentPath = path.join(directory, 'extracted-note.txt')
      execFileSync(process.env.PDFDETACH_PATH || 'pdfdetach', ['-savefile', 'note.txt', '-o', attachmentPath, outputPath])
      assert.equal(readFileSync(attachmentPath, 'utf8'), 'The attachment bytes survive.')
    }
    if (fixture.id === 'image-dominated-scan-surrogate' && repetition === 0) {
      for (const [file, label] of [[originalPath, 'original'], [outputPath, 'output']]) {
        execFileSync(process.env.PDFTOPPM_PATH || 'pdftoppm', ['-singlefile', '-r', '72', '-png', file, path.join(directory, `scan-${label}`)])
      }
      assert.equal(sha256(readFileSync(path.join(directory, 'scan-original.png'))), sha256(readFileSync(path.join(directory, 'scan-output.png'))), 'Independent rendered scan pixels must survive')
    }
    record = { id: fixture.id, inputBytes: inputBytes.length, outputBytes: outputBytes.length, reductionPercent: 100 * (1 - outputBytes.length / inputBytes.length), inputSha256: sha256(inputBytes), outputSha256: sha256(outputBytes), outcome: result.outcome, note: result.note, pages: parsed.getPageCount(), pageGeometryPreserved: true, independentTextExact: true, nativePdfInfoParsed: true, ...(fixture.id === 'interactive-attachment' ? { formValuePreserved: true, nativeAttachmentBytesExact: true } : {}), ...(fixture.id === 'image-dominated-scan-surrogate' ? { nativeRenderedScanExact: true } : {}) }
  }
  records.push({ ...record, repetitionsMs: times, medianMs: median(times) })
}

const originals = Array.from({ length: 500 }, (_, index) => ({
  name: `entry-${index}.txt`, bytes: new TextEncoder().encode(`Generated original ${index}: ${'useful text '.repeat(15)}`),
}))
const zipTimes = []
let zipRecord
for (let repetition = 0; repetition < 3; repetition++) {
  const started = performance.now()
  const result = await createZip(originals.map(item => new File([item.bytes], item.name)))
  zipTimes.push(performance.now() - started)
  const bytes = new Uint8Array(await result.blob.arrayBuffer())
  const outputPath = path.join(directory, 'created-500-files.zip')
  writeFileSync(outputPath, bytes)
  const expected = Object.fromEntries(originals.map(item => [item.name, sha256(item.bytes)]))
  const actual = JSON.parse(execFileSync(process.env.PYTHON_PATH || 'python3', ['-c', 'import hashlib,json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n print(json.dumps({name:hashlib.sha256(z.read(name)).hexdigest() for name in z.namelist()}))', outputPath]).toString())
  assert.deepEqual(actual, expected, 'Independent Python ZIP extraction must preserve every source byte')
  const extracted = await extractZip(new File([bytes], 'created-500-files.zip'))
  assert.equal(extracted.length, 500)
  zipRecord = { id: 'create-zip-500-files', sourceBytes: originals.reduce((sum, item) => sum + item.bytes.length, 0), outputBytes: bytes.length, fileCount: 500, nativeZipByteHashesExact: true }
}
records.push({ ...zipRecord, repetitionsMs: zipTimes, medianMs: median(zipTimes) })
const report = { version: 1, measuredAt: new Date().toISOString(), runtime: process.version, platform: process.platform, method: 'Bundled actual source engines in Node. Three repetitions; times include processing only, exclude generation and independent native output validation. First PDF repetition includes first-use module/runtime effects; all are the same process. Not browser UI or universal speed evidence.', sourceHashes: Object.fromEntries(['lib/engines/pdf.ts', 'lib/engines/zip.ts'].map(file => [file, sha256(readFileSync(file))])), records }
writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
