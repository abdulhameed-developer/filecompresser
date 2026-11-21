/** Real local inputs, downloaded outputs, independent decoders, and queue edge cases.
 * QA dependencies live in PW_TOOLS; no fixtures are copied to public/.
 */
import { createRequire } from 'node:module'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
import { unzipSync, zipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
const qa = createRequire(
  path.join(
    process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'),
    'qa.cjs',
  ),
)
const browsers = qa('playwright-core')
const browserName = process.env.TEST_BROWSER || 'chromium'
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('Unsupported TEST_BROWSER')
const ffmpeg = process.env.FFMPEG_PATH || qa('ffmpeg-static')
const ffprobe = process.env.FFPROBE_PATH || qa('ffprobe-static').path
const chrome =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const base = process.argv[2] || 'http://127.0.0.1:3198'
const fixtures = mkdtempSync(path.join(tmpdir(), 'filecompresser-fixtures-'))
const evidence = path.resolve('.qa-results')
mkdirSync(evidence, { recursive: true })
const media = (args, name) => {
  const out = path.join(fixtures, name)
  execFileSync(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-y', ...args, out],
    { timeout: 60000 },
  )
  return out
}
const png = media(
  ['-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=1', '-frames:v', '1'],
  'image.png',
)
const jpg = media(['-i', png, '-frames:v', '1'], 'image.jpg')
const webp = media(['-i', png, '-frames:v', '1'], 'image.webp')
const gif = media(
  ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=8', '-t', '1', '-loop', '2'],
  'animation.gif',
)
const wav = media(
  ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050', '-t', '2'],
  'tone.wav',
)
const mp3 = media(['-i', wav, '-b:a', '192k'], 'tone.mp3')
const otherAudio = ['m4a', 'flac', 'ogg'].map((ext) =>
  media(['-i', wav], `tone.${ext}`),
)
const transparent = media(
  [
    '-f',
    'lavfi',
    '-i',
    'color=c=red@0.0:s=64x64,format=rgba',
    '-frames:v',
    '1',
  ],
  'alpha.png',
)
const video = media(
  [
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=321x241:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440',
    '-t',
    '1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv444p',
    '-c:a',
    'aac',
  ],
  'video.mp4',
)
const mov = media(['-i', video, '-c', 'copy'], 'video.mov')
const longVideo = media(
  [
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=24',
    '-t',
    '5',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
  ],
  'cancel.mp4',
)
const pdf = await PDFDocument.create()
pdf.setTitle('QA document')
pdf.addPage([300, 400]).drawText('FileCompresser verification')
const pdfPath = path.join(fixtures, 'sample.pdf')
writeFileSync(pdfPath, await pdf.save())
const misnamedPdf = path.join(fixtures, 'misnamed.jpg')
writeFileSync(misnamedPdf, readFileSync(pdfPath))
const misnamedGif = path.join(fixtures, 'animation.bin')
writeFileSync(misnamedGif, readFileSync(gif))
const zipPath = path.join(fixtures, 'normal.zip')
writeFileSync(
  zipPath,
  zipSync({
    'one.txt': new TextEncoder().encode('first'),
    'folder/two.txt': new TextEncoder().encode('second'),
  }),
)
const hostile = path.join(fixtures, 'hostile.zip')
writeFileSync(hostile, zipSync({ '../unsafe.txt': new Uint8Array([1]) }))
const fake = path.join(fixtures, 'fake.mp3')
writeFileSync(fake, new Uint8Array([0xff]))
const oversized = path.join(fixtures, 'oversized.jpg')
writeFileSync(oversized, Buffer.alloc(51 * 1024 * 1024))
const browser = await browsers[browserName].launch(browserName === 'chromium' ? {
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
} : { headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) })
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1280, height: 900 },
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const requests = []
page.on('request', (request) => {
  if (['POST', 'PUT', 'PATCH'].includes(request.method()))
    requests.push(request.url())
})
const results = []
async function check(name, work) {
  try {
    const detail = await work()
    results.push({ name, pass: true, detail })
    console.log('PASS', name, detail || '')
  } catch (error) {
    results.push({ name, pass: false, error: String(error) })
    console.error('FAIL', name, String(error))
    await page
      .screenshot({
        path: path.join(evidence, `failure-${results.length}.png`),
      })
      .catch(() => {})
  }
}
async function upload(route, files) {
  await page.goto(base + route, { waitUntil: 'networkidle' })
  await page.locator('input[type=file]').setInputFiles(files)
  await page.waitForFunction(
    () => document.querySelectorAll('.status-validating').length === 0,
  )
}
async function processAndDownload(route, source, configure) {
  await upload(route, source)
  if (configure) await configure()
  await page.locator('.compressBtn').click()
  await page
    .locator('.file.status-completed, .file.status-failed')
    .first()
    .waitFor({ timeout: 180000 })
  const failure = await page.locator('.fileError').allTextContents()
  assert.deepEqual(failure, [])
  assert.equal(await page.locator('.compressBtn').count(), 0, 'Completed-only queues must not offer processing zero files')
  const promise = page.waitForEvent('download')
  await page.locator('.fileActions .linkBtn').first().click()
  const download = await promise
  const out = path.join(
    fixtures,
    `result-${results.length}-${download.suggestedFilename()}`,
  )
  await download.saveAs(out)
  assert(readFileSync(out).length > 0)
  return out
}
function probe(file) {
  return JSON.parse(
    execFileSync(
      ffprobe,
      [
        '-v',
        'error',
        '-count_frames',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        file,
      ],
      { timeout: 30000 },
    ).toString(),
  )
}
function decode(file) {
  execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], {
    timeout: 60000,
  })
}
try {
  for (const [route, input, codec] of [
    ['/jpg-compressor', jpg, 'mjpeg'],
    ['/png-compressor', png, 'png'],
    ['/webp-compressor', webp, 'webp'],
  ])
    await check(route + ' decoded output', async () => {
      const out = await processAndDownload(route, input)
      assert.equal(probe(out).streams[0].codec_name, codec)
      decode(out)
      return path.basename(out)
    })
  await check('JPG target size and stable KB input', async () => {
    const out = await processAndDownload('/jpg-compressor', jpg, async () => {
      await page.getByRole('button', { name: 'Maximum', exact: true }).click()
      await page.getByLabel('Target size (KB)', { exact: true }).fill('20')
      assert.equal(
        await page.getByLabel('Target size (KB)', { exact: true }).inputValue(),
        '20',
      )
    })
    assert(readFileSync(out).length <= 20 * 1024)
    decode(out)
  })
  for (const [format, codec] of [
    ['jpeg', 'mjpeg'],
    ['png', 'png'],
    ['webp', 'webp'],
  ])
    await check('Image conversion to ' + format, async () => {
      const out = await processAndDownload(
        '/image-compressor',
        format === 'jpeg' ? png : jpg,
        async () => {
          await page
            .getByLabel('Download as', { exact: true })
            .selectOption(format)
        },
      )
      assert.equal(probe(out).streams[0].codec_name, codec)
      decode(out)
    })
  await check(
    'Transparent JPG conversion is refused without losing the input',
    async () => {
      await upload('/image-compressor', transparent)
      await page.getByLabel('Download as', { exact: true }).selectOption('jpeg')
      await page.locator('.compressBtn').click()
      await page.locator('.status-failed').waitFor()
      assert.match(await page.locator('.fileError').innerText(), /transparency/)
      await page.getByLabel('Download as', { exact: true }).selectOption('webp')
      await page.getByRole('button', { name: /Retry/ }).click()
      await page.locator('.status-completed').waitFor()
    },
  )
  await check('Unreachable image target is reported honestly', async () => {
    await processAndDownload('/jpg-compressor', jpg, async () => {
      await page.getByRole('button', { name: 'Maximum', exact: true }).click()
      await page.getByLabel('Target size (KB)', { exact: true }).fill('1')
    })
    assert(
      (await page.locator('.fileNote').innerText()).includes(
        'could not be reached',
      ),
    )
  })
  await check('PNG output hides the unsupported target control', async () => {
    await upload('/png-compressor', png)
    await page.getByRole('button', { name: 'Maximum', exact: true }).click()
    assert.equal(
      await page.getByLabel('Target size (KB)', { exact: true }).count(),
      0,
    )
    await page.getByLabel('Download as', { exact: true }).selectOption('png')
    assert.equal(
      await page.getByLabel('Target size (KB)', { exact: true }).count(),
      0,
    )
  })
  await check('GIF animation and finite loop preservation', async () => {
    const out = await processAndDownload('/gif-compressor', misnamedGif)
    assert(out.endsWith('.gif'))
    decode(out)
    assert(Number(probe(out).streams[0].nb_read_frames) > 1)
    const bytes = readFileSync(out),
      i = bytes.indexOf('NETSCAPE2.0')
    assert(i >= 0)
    assert.equal(bytes.readUInt16LE(i + 13), 2)
  })
  for (const [route, input] of [
    ['/wav-compressor', wav],
    ['/mp3-compressor', mp3],
    ...otherAudio.map((input) => ['/mp3-compressor', input]),
  ])
    await check(
      route + ' ' + path.extname(input) + ' genuine audio source/output',
      async () => {
        const out = await processAndDownload(route, input)
        const metadata = probe(out)
        assert.equal(metadata.streams[0].codec_name, 'mp3')
        assert(Number(metadata.format.duration) > 1.5)
        decode(out)
      },
    )
  for (const input of [video, mov])
    await check(
      'Video encode ' + path.extname(input) + ' decoded H264/AAC output',
      async () => {
        const out = await processAndDownload('/video-compressor', input)
        const meta = probe(out)
        assert.equal(
          meta.streams.find((s) => s.codec_type === 'video').codec_name,
          'h264',
        )
        assert.equal(
          meta.streams.find((s) => s.codec_type === 'audio').codec_name,
          'aac',
        )
        assert.equal(meta.streams[0].width % 2, 0)
        assert.equal(meta.streams[0].height % 2, 0)
        decode(out)
        return meta.streams.map((s) => s.codec_name).join('/')
      },
    )
  await check('PDF readable content and page count', async () => {
    const out = await processAndDownload('/pdf-compressor', misnamedPdf)
    assert(out.endsWith('.pdf'))
    const output = await PDFDocument.load(readFileSync(out))
    assert.equal(output.getPageCount(), 1)
    assert.equal(output.getTitle(), '')
    assert(
      execFileSync('pdftotext', [out, '-'])
        .toString()
        .includes('FileCompresser verification'),
    )
  })
  await check('ZIP batch round trip and full original total', async () => {
    const out = await processAndDownload('/zip-compressor', [jpg, pdfPath])
    const entries = unzipSync(readFileSync(out))
    assert.deepEqual(Buffer.from(entries['image.jpg']), readFileSync(jpg))
    assert.deepEqual(Buffer.from(entries['sample.pdf']), readFileSync(pdfPath))
    assert((await page.locator('.fileFacts').innerText()).includes('2 inputs'))
  })
  await check(
    'Extraction downloads every file without compression claims',
    async () => {
      await upload('/archive-compressor', zipPath)
      await page.locator('.compressBtn').click()
      await page.locator('.file.status-completed').first().waitFor()
      assert.equal(await page.locator('.file.status-completed').count(), 2)
      assert.equal(await page.locator('.savings').count(), 0)
      const promise = page.waitForEvent('download')
      await page
        .getByRole('button', { name: 'ZIP download', exact: false })
        .click()
      const downloaded = await promise
      const bytes = readFileSync(await downloaded.path())
      const entries = unzipSync(bytes)
      assert.equal(new TextDecoder().decode(entries['one.txt']), 'first')
      assert.equal(
        new TextDecoder().decode(entries['folder__two.txt']),
        'second',
      )
    },
  )
  await check('Unsafe archive is blocked', async () => {
    await upload('/archive-compressor', hostile)
    await page.locator('.compressBtn').click()
    await page.locator('.status-failed').waitFor()
    assert.match(await page.locator('.fileError').innerText(), /unsafe/)
    assert.equal(await page.locator('.downloadActions').count(), 0)
  })
  for (const input of [fake, oversized])
    await check('Invalid/oversized input ' + path.basename(input), async () => {
      await upload(
        input === fake ? '/mp3-compressor' : '/jpg-compressor',
        input,
      )
      await page.locator('.status-failed').waitFor()
      assert.equal(await page.locator('.compressBtn').count(), 0, 'Invalid-only queues must not offer processing')
      await page.getByRole('button', { name: /Retry/ }).click()
      await page.locator('.status-failed').waitFor()
      assert.equal(await page.locator('.downloadActions').count(), 0)
    })
  await check('Mixed generic batch dispatch', async () => {
    await upload('/compress', [jpg, wav, pdfPath])
    await page.locator('.compressBtn').click()
    await page.waitForFunction(
      () => document.querySelectorAll('.file.status-completed').length === 3,
      {},
      { timeout: 180000 },
    )
    assert.equal(await page.locator('.fileError').count(), 0)
  })
  await check(
    'Cancel all prevents waiting video and retry succeeds',
    async () => {
      await upload('/video-compressor', [longVideo, video])
      await page.locator('.compressBtn').click()
      await page.locator('.status-processing').waitFor()
      await page
        .getByRole('button', { name: 'Cancel all', exact: true })
        .click()
      await page.waitForFunction(
        () => !document.querySelector('.status-processing'),
      )
      await page.waitForFunction(() =>
        document.querySelector('.status')?.textContent.includes('cancelled'),
      )
      assert.equal(await page.locator('.file.status-cancelled').count(), 2)
      await page
        .locator('.fileActions button')
        .filter({ hasText: 'Retry' })
        .first()
        .click()
      await page.locator('.status-completed').waitFor({ timeout: 180000 })
      assert.equal(await page.locator('.status-failed').count(), 0)
    },
  )
  await check(
    'No file-upload requests or unhandled browser exceptions',
    async () => {
      assert.deepEqual(requests, [])
      assert.deepEqual(errors, [])
    },
  )
} finally {
  writeFileSync(
    path.join(evidence, browserName === 'chromium' ? 'functionality.json' : `functionality-${browserName}.json`),
    JSON.stringify({ results, errors, requests }, null, 2),
  )
  await browser.close()
}
console.log(
  `${results.filter((r) => r.pass).length}/${results.length} real-output checks passed`,
)
if (results.some((r) => !r.pass)) process.exitCode = 1
