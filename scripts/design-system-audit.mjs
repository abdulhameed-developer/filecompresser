/** Interaction evidence for the product composition. QA tools remain outside runtime dependencies. */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const base = process.argv[2] || 'http://127.0.0.1:3000'
const out = process.env.SCREENSHOT_DIR || '.qa-results/design-system'
mkdirSync(out, { recursive: true })
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const results = []
const toolCount = [...readFileSync('lib/tools.ts', 'utf8').matchAll(/^\s+slug: '/gm)].length
async function check(name, work) { try { const detail = await work(); results.push({ name, pass: true, detail }); console.log('PASS', name) } catch (error) { results.push({ name, pass: false, error: String(error) }); console.error('FAIL', name, String(error)) } }
try {
  await check('Header active, hover and focus states share a balanced 44px frame', async () => {
    await p.setViewportSize({ width: 1440, height: 1000 }); await p.goto(`${base}/about`, { waitUntil: 'networkidle' })
    const metrics = await p.evaluate(() => [...document.querySelectorAll('.navlinks > a.navlink, .navlinks .navDropTrigger')].map(el => {
      const box = el.getBoundingClientRect(), text = document.createRange(); text.selectNodeContents(el)
      const label = text.getBoundingClientRect(), style = getComputedStyle(el)
      return { label: el.textContent.trim(), active: el.getAttribute('aria-current') === 'page', h: box.height, textH: label.height, centerDelta: Math.abs(box.y + box.height / 2 - label.y - label.height / 2), padding: style.padding, radius: style.borderRadius }
    }))
    assert.equal(metrics.length, 4); assert.ok(metrics.every(item => item.h === 44 && item.centerDelta < 1 && item.padding === '10px 12px' && item.radius === '9px'))
    assert.equal(metrics.filter(item => item.active).length, 1)
    const about = p.getByRole('link', { name: 'About', exact: true }), blog = p.getByRole('link', { name: 'Blog', exact: true })
    const activeBox = await about.boundingBox(); const inactiveBox = await blog.boundingBox()
    assert.ok(activeBox.width > (await about.evaluate(el => { const r=document.createRange();r.selectNodeContents(el);return r.getBoundingClientRect().width })) + 20)
    await blog.hover(); await p.waitForTimeout(180)
    const hover = await blog.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, box: el.getBoundingClientRect().toJSON() }))
    assert.equal(hover.bg, 'rgb(242, 244, 240)'); assert.equal(hover.box.height, inactiveBox.height)
    await blog.focus()
    assert.notEqual(await blog.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
    await p.screenshot({ path: path.join(out, 'header-active-hover-focus.png') })
    return { controls: metrics, hover: hover.bg }
  })
  await check('Tools dropdown hover and focus surfaces follow labels without layout shifts', async () => {
    await p.goto(base, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Tools', exact: true }).click(); await p.waitForTimeout(240)
    const links = p.locator('.toolsDropdownInner a'), count = await links.count(); assert.equal(count, toolCount)
    const measurements = []
    for (let i = 0; i < count; i++) {
      const link = links.nth(i), before = await link.boundingBox(); await link.hover(); await p.waitForTimeout(170)
      const item = await link.evaluate(el => {
        const box=el.getBoundingClientRect(), range=document.createRange();range.selectNodeContents(el)
        const text=range.getBoundingClientRect(), style=getComputedStyle(el)
        return { label: el.textContent.trim(), width: box.width, height: box.height, textWidth: text.width, textCenterDelta: Math.abs(box.y+box.height/2-text.y-text.height/2), padding: style.padding, bg: style.backgroundColor }
      })
      assert.equal(item.height, 44); assert.ok(item.width <= item.textWidth + 26, `${item.label} hover target is unexpectedly wide (${item.width}px for ${item.textWidth}px text)`)
      assert.ok(item.textCenterDelta < 1); assert.equal(item.padding, '10px 12px'); assert.equal(item.bg, 'rgb(241, 243, 239)')
      const after = await link.boundingBox(); assert.deepEqual(after, before)
      measurements.push(item)
    }
    await p.keyboard.press('Escape')
    const trigger = p.getByRole('button', { name: 'Tools', exact: true })
    await trigger.focus()
    await p.screenshot({ path: path.join(out, 'nav-tools-trigger-focus.png') })
    await trigger.focus(); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(40)
    assert.notEqual(await links.first().evaluate(el => getComputedStyle(el).outlineStyle), 'none')
    await p.screenshot({ path: path.join(out, 'dropdown-item-focus.png') })
    await p.keyboard.press('Escape'); return { count, samples: measurements.slice(0, 3) }
  })
  for (const width of [1024, 1280, 1440, 1920]) await check(`Menu is header-centered and bounded at ${width}px`, async () => {
    await p.setViewportSize({ width, height: 1000 }); await p.goto(base, { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Tools', exact: true }).click(); await p.waitForTimeout(250)
    const bounds = await p.locator('.toolsDropdown').evaluate(el => {
      const r = el.getBoundingClientRect(); const nav = document.querySelector('.nav').getBoundingClientRect()
      return { width: r.width, left: r.left, right: r.right, delta: Math.abs(r.left + r.width / 2 - nav.left - nav.width / 2) }
    })
    assert.ok(bounds.width <= 720 && bounds.left >= 12 && bounds.right <= width - 12 && bounds.delta < 2)
    if (width === 1440) await p.screenshot({ path: path.join(out, 'menu-desktop.png') })
    await p.keyboard.press('Escape'); return bounds
  })
  await check('Selected tool menu has balanced active, hover and keyboard focus states', async () => {
    await p.setViewportSize({ width: 1440, height: 1000 })
    await p.goto(`${base}/webm-to-mp4`, { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Tools', exact: true }).click()
    const active = p.locator('.toolsDropdownInner a[href="/webm-to-mp4"]')
    assert.equal(await active.getAttribute('aria-current'), 'page')
    for (const slug of ['jpg-compressor', 'pdf-compressor', 'webm-to-mp4']) {
      await p.locator(`.toolsDropdownInner a[href="/${slug}"]`).hover()
      await p.waitForTimeout(180)
      await p.screenshot({ path: path.join(out, `nav-menu-hover-${slug}.png`) })
    }
    await p.locator('.toolsDropdownInner a[href="/jpg-compressor"]').focus()
    await p.screenshot({ path: path.join(out, 'selected-tool-menu-active-hover-focus.png') })
    await p.keyboard.press('Escape')
    await p.locator('.toolsDropdown').waitFor({ state: 'detached' })
  })
  await check('Mobile tool navigation exposes the selected converter with large touch targets', async () => {
    await p.setViewportSize({ width: 390, height: 900 })
    await p.goto(`${base}/webm-to-mp4`, { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Open menu', exact: true }).click()
    const group = p.locator('.mobileGroup').filter({ has: p.locator('a[href="/webm-to-mp4"]') })
    await group.locator('summary').click()
    const selected = group.locator('a[href="/webm-to-mp4"]')
    assert.equal(await selected.getAttribute('aria-current'), 'page')
    assert.ok((await selected.boundingBox()).height >= 44)
    await p.screenshot({ path: path.join(out, 'nav-mobile-media-expanded-390.png') })
    await p.keyboard.press('Escape')
    await p.locator('.mobileMenu').waitFor({ state: 'detached' })
  })
  await check('Directory combines search and categories without removing tools', async () => {
    await p.setViewportSize({ width: 1440, height: 1000 })
    await p.goto(base, { waitUntil: 'networkidle' }); await p.locator('.toolDirectory').scrollIntoViewIfNeeded()
    assert.equal(await p.locator('.toolTile').count(), toolCount)
    await p.getByRole('button', { name: 'PDF & Archives', exact: true }).click()
    assert.equal(await p.locator('.toolTile').count(), 3)
    await p.getByRole('searchbox', { name: 'Find your tool' }).fill('jpg')
    assert.equal(await p.locator('.toolTile').count(), 0)
    await p.getByRole('button', { name: 'Reset filters' }).click()
    assert.equal(await p.locator('.toolTile').count(), toolCount)
    await p.locator('.toolTile').first().hover()
    await p.locator('.toolDirectory').screenshot({ path: path.join(out, 'directory-hover.png') })
  })
  for (const width of [320, 375, 390, 430, 768]) await check(`Guide rail navigation, keyboard and focus at ${width}px`, async () => {
    await p.setViewportSize({ width, height: 1000 }); await p.goto(base, { waitUntil: 'networkidle' })
    const rail = p.locator('.guideRail'); await rail.scrollIntoViewIfNeeded()
    if (width > 760) { assert.equal(await p.locator('.railControls').isVisible(), false); return 'desktop grid at tablet landscape' }
    assert.ok(await p.getByRole('button', { name: 'Previous guide' }).isDisabled())
    await p.getByRole('button', { name: 'Next guide' }).click()
    await p.waitForFunction(() => document.querySelector('.railControls [role=status]').textContent.startsWith('2 of'))
    assert.ok(await p.getByRole('button', { name: 'Next guide' }).evaluate(el => el === document.activeElement))
    await rail.locator('a').nth(1).focus(); await p.keyboard.press('ArrowRight')
    await p.waitForFunction(() => document.querySelector('.railControls [role=status]').textContent.startsWith('3 of'))
    assert.ok(await p.getByRole('button', { name: 'Next guide' }).isDisabled())
    await p.getByRole('button', { name: 'Previous guide' }).click()
    await p.waitForFunction(() => document.querySelector('.railControls [role=status]').textContent.startsWith('2 of'))
    await p.waitForFunction(() => { const el = document.querySelector('.guideRail'); return Math.abs(el.children[1].getBoundingClientRect().left - el.getBoundingClientRect().left) < 3 })
    const box = await rail.evaluate(el => { const c = el.children[1].getBoundingClientRect(); const r = el.getBoundingClientRect(); return { delta: Math.abs(c.left - r.left), fits: c.width <= r.width + 1 } })
    assert.ok(box.delta < 3 && box.fits)
    if (width === 390) await p.locator('.featuredGuides').screenshot({ path: path.join(out, 'guides-mobile.png') })
    // Native scrolling represents touch/swipe movement without a custom gesture handler.
    await rail.evaluate(el => el.scrollTo({ left: 0, behavior: 'instant' }))
    await p.waitForFunction(() => document.querySelector('.railControls [role=status]').textContent.startsWith('1 of'))
    return box
  })
  await check('Reduced motion preserves immediate rail navigation', async () => {
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.setViewportSize({ width: 390, height: 1000 }); await p.goto(base)
    await p.getByRole('button', { name: 'Next guide' }).click()
    await p.waitForFunction(() => document.querySelector('.railControls [role=status]').textContent.startsWith('2 of'))
    assert.equal(await p.locator('.editorialCard img').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s')
    await p.emulateMedia({ reducedMotion: 'no-preference' })
  })
  await check('Decorative interface arrows are SVG, not text glyphs', async () => {
    for (const route of ['', '/jpg-compressor', '/about', '/contact', '/sitemap', '/blog/compressing-files-for-the-web']) {
      await p.goto(base + route, { waitUntil: 'networkidle' })
      const glyphs = await p.locator('a,button,summary,[aria-hidden=true]').evaluateAll(elements => elements.filter(el => /[→←↗↓↑✓◉✦×☰▾▷▧▤]/.test(el.textContent)).map(el => el.textContent.trim()))
      assert.deepEqual(glyphs, [])
    }
  })
  await check('Tools without controls do not render empty settings panels', async () => {
    for (const slug of ['pdf-compressor', 'zip-compressor', 'archive-compressor']) {
      await p.goto(`${base}/${slug}`)
      assert.equal(await p.locator('.workspaceSettings').count(), 0)
    }
  })
  await check('Tool facts are near selection and supporting guidance stays available', async () => {
    await p.goto(`${base}/jpg-compressor`)
    assert.match(await p.locator('.workspaceIntro').innerText(), /50 MB/)
    assert.match(await p.locator('.formats').innerText(), /JPG/)
    assert.equal(await p.locator('.toolFacts,.toolNoteBlock,.processExplainer').count(), 0)
    await p.getByText('Limits and quality', { exact: true }).click()
    assert.ok(await p.locator('.guideDisclosures').getByText(/32|500/).count() > 0)
    await p.getByText('How to use this tool', { exact: true }).click()
    assert.ok(await p.locator('.guideDisclosures ol').isVisible())
  })
} finally { writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); await b.close() }
console.log(`${results.filter(x => x.pass).length}/${results.length} design-system checks passed`)
if (results.some(x => !x.pass)) process.exitCode = 1
