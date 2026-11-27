/** Populated workspaces, real file validation and native modal keyboard/reflow checks. */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { zipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'

const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const axeQa = process.env.AXE_TOOLS ? createRequire(path.join(process.env.AXE_TOOLS, 'qa.cjs')) : qa
const browsers = qa('playwright-core')
const browserName = process.env.TEST_BROWSER || 'chromium'
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw Error('Unsupported TEST_BROWSER')
const ffmpeg = process.env.FFMPEG_PATH || qa('ffmpeg-static')
const fixtures = mkdtempSync(path.join(tmpdir(), 'filecompresser-workspace-'))
const output = process.env.QA_OUTPUT || '.qa-results/workspace-states'
mkdirSync(output, { recursive: true })
const make = (name, args) => {
  const file = path.join(fixtures, name)
  execFileSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', ...args, file], { timeout: 60_000 })
  return file
}
const png = make('sample.png', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=1', '-frames:v', '1'])
const jpg = make('sample.jpg', ['-i', png, '-frames:v', '1'])
const webp = make('sample.webp', ['-i', png, '-frames:v', '1'])
const gif = make('sample.gif', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5', '-t', '1'])
const mp4 = make('sample.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'])
const webm = make('sample.webm', ['-i', mp4, '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8'])
const wav = make('sample.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1'])
const mp3 = make('sample.mp3', ['-i', wav, '-b:a', '192k'])
const pdf = await PDFDocument.create()
pdf.addPage().drawText('Workspace accessibility fixture')
const pdfPath = path.join(fixtures, 'sample.pdf')
writeFileSync(pdfPath, await pdf.save())
const zip = path.join(fixtures, 'sample.zip')
writeFileSync(zip, zipSync({ 'sample.txt': new TextEncoder().encode('Workspace validation fixture') }))
const tools = [
  ['compress', jpg], ['image-compressor', jpg], ['jpg-compressor', jpg], ['jpeg-compressor', jpg],
  ['png-compressor', png], ['webp-compressor', webp], ['gif-compressor', gif],
  ['video-compressor', mp4], ['webm-to-mp4', webm], ['mp3-compressor', mp3],
  ['wav-compressor', wav], ['pdf-compressor', pdfPath], ['zip-compressor', jpg], ['archive-compressor', zip],
]
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const widths = process.env.STATE_WIDTHS ? process.env.STATE_WIDTHS.split(',').map(Number) : [320, 390, 768, 1440]
const height = process.env.STATE_HEIGHT ? Number(process.env.STATE_HEIGHT) : 900
const selectedTools = process.env.STATE_TOOLS ? tools.filter(([slug]) => process.env.STATE_TOOLS.split(',').includes(slug)) : tools
const browser = await browsers[browserName].launch(browserName === 'chromium'
  ? { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  : { headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) })
const page = await browser.newPage()
const results = []
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  for (const width of widths) for (const [slug, file] of selectedTools) {
    const record = { slug, width, height, pass: false, modal: false }
    try {
      await page.setViewportSize({ width, height })
      await page.goto(`${base}/${slug}`, { waitUntil: 'networkidle' })
      assert.equal(await page.locator('.settingsDialog[open]').count(), 0)
      const sourceName = process.env.STATE_LONG_FILENAMES ? `source-${'verylongfilename'.repeat(10)}${path.extname(file)}` : path.basename(file)
      record.sourceName = sourceName
      await page.locator('input[type=file]').setInputFiles(process.env.STATE_LONG_FILENAMES ? { name: sourceName, mimeType: '', buffer: readFileSync(file) } : file)
      await page.locator('.workflowPrimaryActions .compressBtn:enabled').waitFor({ timeout: 15_000 })
      // The ready action can precede the deferred file-details chunk. Capture
      // and inspect the real source row, rather than its loading placeholder.
      await page.locator('.fileTitle strong').first().waitFor({ timeout: 15_000 })
      assert.equal(await page.locator('.fileError').count(), 0)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Populated workspace overflows horizontally')
      record.selectionScrollY = await page.evaluate(() => window.scrollY)
      // Let finite entrance animations finish, then capture the entire document
      // from its top so the sticky header is not composited mid-page. This only
      // normalizes evidence capture; the original selection scroll is retained.
      await page.evaluate(async () => {
        await Promise.allSettled(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished))
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      await page.screenshot({ path: path.join(output, `${slug}-${width}-ready.png`), fullPage: true })
      const details = page.locator('.fileCardDetails').first()
      await details.locator('summary').click()
      assert.equal(await details.evaluate(el => el.open), true)
      await details.locator('summary').click()
      assert.equal(await details.evaluate(el => el.open), false)
      const trigger = page.getByRole('button', { name: 'Settings', exact: true })
      if (await trigger.count()) {
        record.modal = true
        const open = async () => {
          await trigger.click()
          await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
        }
        await open()
        const geometry = await page.locator('.settingsDialog').evaluate(el => {
          const box = el.getBoundingClientRect()
          return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, focusedInside: el.contains(document.activeElement), locked: getComputedStyle(document.body).overflow === 'hidden', scroll: window.scrollY }
        })
        assert.ok(geometry.x >= 0 && geometry.right <= width && geometry.y >= 0 && geometry.bottom <= height)
        const doneBox = await page.getByRole('button', { name: 'Done', exact: true }).boundingBox()
        assert.ok(doneBox.y >= geometry.y && doneBox.y + doneBox.height <= geometry.bottom, 'Modal Done action must remain visible inside the viewport')
        if (['mp3-compressor', 'wav-compressor', 'video-compressor'].includes(slug)) {
          record.settingsFieldLayout = await page.locator('.settingsDialog .settings').evaluate(container => {
            const parent = container.getBoundingClientRect()
            return [...container.querySelectorAll(':scope > .settingField')].map(field => {
              const box = field.getBoundingClientRect()
              return { containerWidth: parent.width, fieldWidth: box.width, left: box.left - parent.left }
            })
          })
          assert.ok(record.settingsFieldLayout.length > 0)
          assert.ok(record.settingsFieldLayout.every(field => Math.abs(field.left) <= 1 && field.fieldWidth >= field.containerWidth - 1), 'Dialog fields must fill their available column without the legacy auto margin')
        }
        assert.ok(geometry.focusedInside && geometry.locked)
        if (process.env.STATE_TARGET_LAYOUT && await page.getByRole('button', { name: 'Target size', exact: true }).count()) {
          await page.getByRole('button', { name: 'Target size', exact: true }).click()
          const target = page.getByRole('spinbutton', { name: 'Custom maximum (KB)', exact: true })
          await target.fill('50')
          await target.focus()
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const targetBox = await target.boundingBox()
          const targetDone = await page.getByRole('button', { name: 'Done', exact: true }).boundingBox()
          const visibility = await target.evaluate(input => {
            const box = input.getBoundingClientRect()
            const dialog = input.closest('.settingsDialog')
            const header = dialog.querySelector('.settingsDialogHeader').getBoundingClientRect()
            const footer = dialog.querySelector('.settingsDialogFooter').getBoundingClientRect()
            const focusFrame = input.closest('.numberField') || input
            const frameBox = focusFrame.getBoundingClientRect()
            const frameStyle = getComputedStyle(focusFrame)
            const ring = (parseFloat(frameStyle.outlineWidth) || 0) + Math.max(0, parseFloat(frameStyle.outlineOffset) || 0)
            // Sample inside the four corner regions, clear of rounded painted
            // borders, and at center. A viewport box alone misses sticky overlap.
            const inset = Math.min(8, box.width / 4, box.height / 4)
            const points = [[box.left + inset, box.top + inset], [box.right - inset, box.top + inset], [box.left + inset, box.bottom - inset], [box.right - inset, box.bottom - inset], [box.left + box.width / 2, box.top + box.height / 2]]
            return {
              aboveFooter: box.bottom <= footer.top + 1,
              belowHeader: box.top >= header.bottom - 1,
              focusRingAboveFooter: frameBox.bottom + ring <= footer.top + 1,
              focusRingBelowHeader: frameBox.top - ring >= header.bottom - 1,
              focusRing: { top: frameBox.top - ring, bottom: frameBox.bottom + ring, footerTop: footer.top, headerBottom: header.bottom },
              hitTests: points.map(([x, y]) => {
                const hit = document.elementFromPoint(x, y)
                return { x, y, reachesInput: hit === input || input.contains(hit), actualElement: hit ? `${hit.tagName}.${hit.className}` : null }
              }),
            }
          })
          record.targetLayout = { input: targetBox, done: targetDone, visibility }
          assert.ok(targetBox.x >= 0 && targetBox.x + targetBox.width <= width && targetBox.y >= 0 && targetBox.y + targetBox.height <= height, 'Focused custom target input must fit within the short viewport')
          assert.ok(targetDone.y >= 0 && targetDone.y + targetDone.height <= height, 'Target settings must retain the visible Done action')
          assert.ok(visibility.aboveFooter && visibility.belowHeader && visibility.focusRingAboveFooter && visibility.focusRingBelowHeader && visibility.hitTests.every(point => point.reachesInput), 'Focused custom target and its complete focus ring must remain exposed between the dialog header/footer and reachable at all four corners and its center')
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
          await page.screenshot({ path: path.join(output, `${slug}-${width}-target-settings.png`) })
        }
        await page.getByRole('button', { name: 'Close settings', exact: true }).focus()
        await page.keyboard.press('Shift+Tab')
        assert.equal(await page.getByRole('button', { name: 'Done', exact: true }).evaluate(el => el === document.activeElement), true)
        await page.keyboard.press('Tab')
        assert.equal(await page.getByRole('button', { name: 'Close settings', exact: true }).evaluate(el => el === document.activeElement), true)
        await page.screenshot({ path: path.join(output, `${slug}-${width}-settings.png`) })
        if ([390, 1440].includes(width)) {
          await page.addScriptTag({ path: axeQa.resolve('axe-core/axe.min.js') })
          const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })))
          record.violations = violations
          assert.deepEqual(violations, [])
        }
        await page.keyboard.press('Escape')
        assert.equal(await page.locator('.settingsDialog').evaluate(el => el.open), false)
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'), false)
        assert.equal(await page.evaluate(() => window.scrollY), geometry.scroll)
        await open()
        await page.getByRole('button', { name: 'Done', exact: true }).click()
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
        await open()
        await page.mouse.click(2, 2)
        assert.equal(await page.locator('.settingsDialog').evaluate(el => el.open), false)
      } else if (slug === 'webm-to-mp4') {
        assert.match(await page.locator('.workflowOutput').innerText(), /MP4/)
        assert.match(await page.locator('.compressBtn').innerText(), /Convert to MP4/)
      }
      record.pass = true
      console.log('PASS', slug, width, record.modal ? 'modal + ready' : 'ready')
    } catch (error) {
      record.error = error.stack || String(error)
      record.focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 100), className: document.activeElement?.className, dialogOpen: document.querySelector('.settingsDialog')?.open })).catch(() => null)
      console.error('FAIL', slug, width, record.error)
      await page.screenshot({ path: path.join(output, `${slug}-${width}-failure.png`) }).catch(() => {})
    }
    results.push(record)
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ base, browserName, browserVersion: browser.version(), capturedAt: new Date().toISOString(), fixtures, results, errors }, null, 2) + '\n')
  }
} finally { await browser.close() }
console.log(`${results.filter(result => result.pass).length}/${results.length} populated workspace checks passed`)
if (results.some(result => !result.pass) || errors.length) process.exitCode = 1
