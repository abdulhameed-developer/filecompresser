/** Actual compiled comparison, real generated input, native wheel/touch gestures.
 * No injected styles, event handlers, synthetic DOM events or app-state changes.
 */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const require = createRequire(path.resolve(process.env.PW_TOOLS || '.qa-results/phase2/qa-tools', 'qa.cjs'))
const engines = require('playwright-core')
const kind = process.env.TEST_BROWSER || 'chromium'
const base = process.argv[2]
const destination = path.resolve(process.env.QA_OUTPUT || '.qa-results/phase3/comparison/current')
const width = Number(process.env.QA_VIEWPORT_WIDTH || 390)
const height = Number(process.env.QA_VIEWPORT_HEIGHT || 844)
assert(base && ['chromium', 'firefox', 'webkit'].includes(kind))
mkdirSync(destination, { recursive: true })
const input = path.resolve('.qa-results/phase2/image-lab/inputs/screenshot-optimized.png')
const sha = value => createHash('sha256').update(value).digest('hex')
const manifest = JSON.parse(readFileSync('.qa-results/phase2/image-lab/manifest.json'))
const fixture = manifest.fixtures.find(item => item.file === path.basename(input))
assert.equal(sha(readFileSync(input)), fixture.sha256)
const errors = []
const failedRequests = []
const browser = await engines[kind].launch({ headless: true, executablePath: process.env.TEST_BROWSER_PATH || (kind === 'chromium' ? '/usr/bin/google-chrome' : undefined) })
const context = await browser.newContext({ viewport: { width, height }, hasTouch: kind !== 'firefox', deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('pageerror', error => errors.push(String(error)))
page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure() }))
const report = { capturedAt: new Date().toISOString(), base, kind, browser: browser.version(), harnessSha256: sha(readFileSync(new URL(import.meta.url))), viewport: { width, height }, fixture: { ...fixture, path: input }, gestures: [], errors, failedRequests, passed: false, physicalDevices: 'NOT TESTED: no physical Android/iOS device is connected.', pinchZoom: 'NOT TESTED: this audit does not equate a zoom select or wheel gesture with native pinch zoom.' }
const persist = () => writeFileSync(path.join(destination, 'result.json'), JSON.stringify(report, null, 2) + '\n')
const settle = () => page.evaluate(() => new Promise(resolve => {
  let last = '', stable = 0, samples = 0
  const tick = () => {
    const dialog = document.querySelector('.imageComparison')
    const value = [scrollY, dialog?.scrollTop, ...Array.from(document.querySelectorAll('.comparisonPane')).flatMap(p => [p.scrollTop, p.scrollLeft])].join(':')
    stable = value === last ? stable + 1 : 0; last = value
    if (stable >= 8 || ++samples > 180) resolve(value)
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}))
const state = () => page.evaluate(() => {
  const d = document.querySelector('.imageComparison')
  return { pageY: scrollY, dialogY: d.scrollTop, dialogMax: Math.max(0, d.scrollHeight - d.clientHeight), panes: Array.from(document.querySelectorAll('.comparisonPane')).map(p => ({ y: p.scrollTop, x: p.scrollLeft, maxY: Math.max(0, p.scrollHeight - p.clientHeight), maxX: Math.max(0, p.scrollWidth - p.clientWidth), overscrollY: getComputedStyle(p).overscrollBehaviorY, touchAction: getComputedStyle(p).touchAction })) }
})
// The start coordinate is proved against actual hit testing, rather than
// assuming a pane midpoint happens to touch its image at every viewport.
const hitPoint = (index, surface = 'image') => page.evaluate(({ index, surface }) => {
  const pane = document.querySelectorAll('.comparisonPane')[index]
  const img = pane.querySelector('img'), dialog = document.querySelector('.imageComparison')
  const p = pane.getBoundingClientRect(), i = img.getBoundingClientRect(), d = dialog.getBoundingClientRect()
  const visible = { left: Math.max(p.left + 4, d.left + 4, 4), right: Math.min(p.right - 4, d.right - 4, innerWidth - 4), top: Math.max(p.top + 4, d.top + 4, 4), bottom: Math.min(p.bottom - 4, d.bottom - 4, innerHeight - 4) }
  const candidates = surface === 'image'
    ? [{ x: (Math.max(visible.left, i.left) + Math.min(visible.right, i.right)) / 2, y: (Math.max(visible.top, i.top) + Math.min(visible.bottom, i.bottom)) / 2 }]
    : [{ x: visible.left + 4, y: visible.top + 4 }, { x: visible.right - 4, y: visible.top + 4 }, { x: visible.left + 4, y: visible.bottom - 4 }, { x: visible.right - 4, y: visible.bottom - 4 }]
  for (const point of candidates) {
    if (point.x <= visible.left || point.x >= visible.right || point.y <= visible.top || point.y >= visible.bottom) continue
    const hit = document.elementFromPoint(point.x, point.y)
    if (surface === 'image' ? hit === img : hit && pane.contains(hit) && hit !== img && !hit.closest('button,input,select,a,label')) return { ...point, hit: hit.tagName, alt: hit.getAttribute('alt'), surface, paneIndex: index, imageRect: { x: i.x, y: i.y, width: i.width, height: i.height } }
  }
  throw Error(`No verified visible ${surface} gesture start for pane ${index}`)
}, { index, surface })
try {
  const response = await page.goto(base + '/png-compressor', { waitUntil: 'networkidle' })
  assert.equal(response.status(), 200)
  report.homepageBefore = sha(await (await fetch(base)).text())
  await page.locator('input[type=file]').setInputFiles(input)
  await page.locator('.compressBtn:not([disabled])').waitFor({ timeout: 30000 })
  await page.locator('.compressBtn').click()
  await page.locator('.file.status-completed').waitFor({ timeout: 120000 })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file', exact: true }).click()
  const download = await downloadPromise
  const output = path.join(destination, 'actual-output.png')
  await download.saveAs(output)
  report.output = { file: output, bytes: readFileSync(output).length, sha256: sha(readFileSync(output)) }
  // Settle any earlier user-facing scrolling before taking the return baseline.
  await page.locator('.compareButton').scrollIntoViewIfNeeded()
  await settle()
  report.pageYBeforeOpen = await page.evaluate(() => scrollY)
  await page.locator('.compareButton').click()
  const dialog = page.getByRole('dialog', { name: 'Inspect the actual image', exact: true })
  await dialog.waitFor()
  await dialog.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await settle()
  const cdp = kind === 'chromium' ? await context.newCDPSession(page) : null
  const swipe = async (point, direction) => {
    if (cdp) {
      // Chrome156's synthesizeScrollGesture(touch) moved zero pixels even on
      // an independent plain 4000px native scroller. Actual trusted touch
      // input moves that positive control; retain its separate evidence.
      const distance = Math.min(160, direction === 1 ? height - 20 - point.y : point.y - 20)
      assert(distance > 24, 'The verified image point needs room for a real vertical swipe')
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] })
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + direction * distance * step / 10 }] })
        await page.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    else { await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -direction * 160) }
    await settle()
  }
  for (const [name, index, surface] of [['original', 0, 'image'], ['output', 1, 'image'], ['background', 0, 'background'], ['dialog-background', 0, 'dialog-background']]) {
    const surfaceLocator = surface === 'dialog-background' ? page.locator('.comparisonHeader p') : page.locator('.comparisonPane').nth(index)
    await surfaceLocator.scrollIntoViewIfNeeded()
    await settle()
    const point = surface === 'dialog-background' ? await surfaceLocator.evaluate(element => {
      const box = element.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2
      const hit = document.elementFromPoint(x, y)
      if (!hit || !element.contains(hit) || hit.closest('button,input,select,a,label')) throw Error('No verified non-interactive dialog background point')
      return { x, y, hit: hit.tagName, surface: 'dialog-background', text: hit.textContent }
    }) : await hitPoint(index, surface)
    const before = await state()
    const direction = before.dialogY >= before.dialogMax / 2 ? 1 : -1
    await page.screenshot({ path: path.join(destination, name + '-before.png') })
    await swipe(point, direction)
    const after = await state()
    const applicable = before.dialogMax > 2
    const moved = Math.abs(after.dialogY - before.dialogY) >= Math.min(20, before.dialogMax / 4)
    const backgroundStable = after.pageY === before.pageY
    const item = { name, input: cdp ? 'native Chromium touchStart/move/end input' : 'native wheel (touch unavailable in this automation engine)', hitTest: point, before, after, scrollApplicable: applicable, moved, backgroundStable, disposition: applicable ? 'Dialog has vertical overflow; gesture must move it.' : 'Dialog fits the viewport; no vertical scroll is required.', passed: (!applicable || moved) && backgroundStable }
    report.gestures.push(item)
    await page.screenshot({ path: path.join(destination, name + '-after.png') })
    persist()
  }
  await page.getByLabel('View at', { exact: true }).selectOption('2')
  await settle()
  const zoomed = await dialog.locator('img').first().evaluate(image => image.getBoundingClientRect().width)
  assert.equal(zoomed, 2880)
  const firstPane = page.locator('.comparisonPane').first()
  await firstPane.focus()
  await settle()
  const beforeKeyboard = await state()
  for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowRight')
  await settle()
  const afterHorizontal = await state()
  assert(afterHorizontal.panes[0].x > beforeKeyboard.panes[0].x, 'Keyboard must actually pan the enlarged original image')
  assert(Math.abs(afterHorizontal.panes[0].x - afterHorizontal.panes[1].x) <= 1, 'Horizontal panning must synchronize both images')
  assert.equal(afterHorizontal.pageY, beforeKeyboard.pageY)
  for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowDown')
  await settle()
  const afterVertical = await state()
  assert(afterVertical.panes[0].y > afterHorizontal.panes[0].y, 'Keyboard must actually pan vertically inside the enlarged image')
  assert(Math.abs(afterVertical.panes[0].y - afterVertical.panes[1].y) <= 1, 'Vertical panning must synchronize both images')
  assert.equal(afterVertical.dialogY, afterHorizontal.dialogY, 'An interior zoomed-image pan must not move the dialog')
  assert.equal(afterVertical.pageY, beforeKeyboard.pageY)
  report.zoomAndKeyboard = { width: zoomed, before: beforeKeyboard, horizontal: afterHorizontal, vertical: afterVertical, passed: true }
  await page.screenshot({ path: path.join(destination, 'zoom-keyboard-pan.png') })
  // Reach the pane's boundary using actual wheel input. The next gesture
  // must chain to the dialog if the dialog has content left in that direction.
  const beforeEdge = await state()
  const edgeDirection = beforeEdge.dialogY >= beforeEdge.dialogMax / 2 ? 1 : -1
  const preparationPoint = await hitPoint(0)
  const wheelToBoundary = edgeDirection === 1 ? -beforeEdge.panes[0].y : beforeEdge.panes[0].maxY - beforeEdge.panes[0].y
  await page.mouse.move(preparationPoint.x, preparationPoint.y)
  await page.mouse.wheel(0, wheelToBoundary)
  await settle()
  const boundary = await state()
  const expectedBoundary = edgeDirection === 1 ? 0 : boundary.panes[0].maxY
  assert(Math.abs(boundary.panes[0].y - expectedBoundary) <= 1, 'Native wheel must reach the focused pane boundary')
  assert(Math.abs(boundary.panes[0].y - boundary.panes[1].y) <= 1)
  if (kind === 'firefox') {
    report.nativeWheelGestureSeparation = { idleMs: 1700, reason: 'A native plain nested-scroller control proved the preparation wheel and next wheel within the default 1500ms transaction stay latched to the inner pane. Normal idle ends that gesture before testing a fresh boundary gesture; no browser preference or application behavior changes.' }
    await page.waitForTimeout(1700)
  }
  const edgePoint = await hitPoint(0)
  await swipe(edgePoint, edgeDirection)
  const afterEdge = await state()
  const edgeRoom = edgeDirection === 1 ? boundary.dialogY : boundary.dialogMax - boundary.dialogY
  const edgeApplicable = edgeRoom > 2
  const edgeMoved = Math.abs(afterEdge.dialogY - boundary.dialogY) >= Math.min(20, edgeRoom / 4)
  assert(!edgeApplicable || edgeMoved, 'At a zoomed pane boundary the gesture must scroll remaining dialog content')
  assert.equal(afterEdge.pageY, boundary.pageY)
  report.zoomBoundary = { input: cdp ? 'native touch after native wheel to the pane boundary' : 'native wheel after native wheel to the pane boundary', preparation: { hitTest: preparationPoint, wheelDeltaY: wheelToBoundary }, hitTest: edgePoint, boundary, after: afterEdge, remainingDialogScroll: edgeRoom, applicable: edgeApplicable, moved: edgeMoved, passed: true }
  await page.screenshot({ path: path.join(destination, 'zoom-boundary-after.png') })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  report.focusRestored = await page.locator('.compareButton').evaluate(button => button === document.activeElement)
  report.pageYAfterClose = await page.evaluate(() => scrollY)
  report.scrollRestored = report.pageYAfterClose === report.pageYBeforeOpen
  report.homepageAfter = sha(await (await fetch(base)).text())
  assert.equal(report.homepageAfter, report.homepageBefore)
  report.passed = report.gestures.every(item => item.passed) && report.zoomAndKeyboard.passed && report.zoomBoundary.passed && report.focusRestored && report.scrollRestored && !errors.length && !failedRequests.length
} catch (error) { report.failure = error.stack || String(error) }
finally { await context.close(); await browser.close(); report.closedNormally = true; report.harnessSha256After = sha(readFileSync(new URL(import.meta.url))); if (report.harnessSha256After !== report.harnessSha256) { report.passed = false; report.harnessChangedDuringRun = true }; persist() }
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.passed ? 0 : 1
