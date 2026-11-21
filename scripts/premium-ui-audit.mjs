import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const base = process.argv[2] || 'http://127.0.0.1:3000'
const output = process.env.SCREENSHOT_DIR || '.qa-results/premium'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const results = []
const check = async (name, action) => { try { const detail = await action(); results.push({ name, pass: true, detail }); console.log('PASS', name) } catch (error) { results.push({ name, pass: false, error: String(error) }); console.error('FAIL', name, String(error)) } }
const shot = async name => page.screenshot({ path: path.join(output, `${name}.png`) })
try {
  await page.goto(base, { waitUntil: 'networkidle' }); await shot('homepage')
  await check('Navigation chevron, viewport bounds, pointer persistence and Escape', async () => {
    const trigger = page.getByRole('button', { name: 'Tools', exact: true })
    await trigger.click()
    await page.locator('.toolsDropdown.isOpen').waitFor()
    const bounds = await page.evaluate(() => {
      const trigger = document.querySelector('.navDropTrigger').getBoundingClientRect()
      const icon = document.querySelector('.caret').getBoundingClientRect()
      const panel = document.querySelector('.toolsDropdown').getBoundingClientRect()
      return { aligned: Math.abs(icon.y + icon.height / 2 - trigger.y - trigger.height / 2) < 2, inside: panel.x >= 0 && panel.right <= innerWidth, rotated: getComputedStyle(document.querySelector('.caret')).transform !== 'none', x: panel.x, y: panel.y }
    })
    assert.ok(bounds.aligned && bounds.inside && bounds.rotated)
    await page.mouse.move(bounds.x + 40, bounds.y + 50)
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
    await shot('dropdown')
    await page.keyboard.press('Escape')
    await page.locator('.toolsDropdown').waitFor({ state: 'detached' })
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.ok(await trigger.evaluate(el => el === document.activeElement))
    await trigger.click(); await page.mouse.click(8, 120); await page.locator('.toolsDropdown').waitFor({ state: 'detached' })
    await trigger.focus(); await page.keyboard.press('ArrowDown'); await page.locator('.toolsDropdownInner a').first().waitFor()
    await page.keyboard.press('Tab'); await page.getByRole('link', { name: 'About', exact: true }).focus(); await page.locator('.toolsDropdown').waitFor({ state: 'detached' })
    return bounds
  })
  const xml = await (await fetch(`${base}/sitemap.xml`)).text()
  const toolRoutes = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(item => new URL(item[1]).pathname).filter(route => /compress|archive/.test(route) && !route.startsWith('/blog'))
  let disclosures = 0
  for (const route of ['/', ...toolRoutes, '/wav-to-mp3']) {
    await check(`All disclosures operate and have indicators: ${route}`, async () => {
      await page.goto(base + route, { waitUntil: 'networkidle' })
      const details = page.locator('main details')
      const count = await details.count(); assert.ok(count > 0)
      for (let i = 0; i < count; i++) {
        const item = details.nth(i); const summary = item.locator('summary')
        const initial = await item.evaluate(el => el.open)
        await summary.focus(); await page.keyboard.press('Enter')
        assert.equal(await item.evaluate(el => el.open), !initial)
        assert.ok(await summary.locator('svg.uiIcon').count() > 0)
        await page.keyboard.press('Enter'); assert.equal(await item.evaluate(el => el.open), initial)
        disclosures++
      }
      assert.doesNotMatch(await page.locator('main').innerText(), /local preview|development preview|demo project|local contact/i)
      return count
    })
  }
  await page.goto(base); await page.locator('.homeFaq').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await page.locator('.homeFaq summary').first().click(); await page.waitForTimeout(260); await shot('faq')
  for (const width of [320, 375, 390, 430]) {
    await check(`Two-column footer and centered copyright at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 })
      await page.locator('.siteFooter').scrollIntoViewIfNeeded()
      const layout = await page.evaluate(() => {
        const footer = document.querySelector('.siteFooter').getBoundingClientRect()
        const copyright = document.querySelector('.footerBottom > span').getBoundingClientRect()
        return { columns: getComputedStyle(document.querySelector('.footerTop')).gridTemplateColumns.split(' ').length, centerOffset: Math.abs(copyright.x + copyright.width / 2 - footer.x - footer.width / 2), overflow: document.documentElement.scrollWidth > innerWidth }
      })
      assert.equal(layout.columns, 2); assert.ok(layout.centerOffset < 3); assert.equal(layout.overflow, false)
      if (width === 390) await shot('mobile-footer')
      return layout
    })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await check('Every article has a unique loaded raster image, social image and working contents links', async () => {
    await page.goto(`${base}/blog`, { waitUntil: 'networkidle' })
    const cards = page.locator('.postCardArt img'); assert.equal(await cards.count(), 5)
    const sources = new Set()
    for (let i = 0; i < 5; i++) { const img = cards.nth(i); await img.scrollIntoViewIfNeeded(); await img.evaluate(el => el.decode()); assert.ok((await img.getAttribute('alt')).length > 20); sources.add(await img.getAttribute('src')) }
    assert.equal(sources.size, 5)
    await page.evaluate(() => scrollTo(0, 0)); await shot('blog')
    const links = await page.locator('.postCardLink').evaluateAll(elements => elements.map(el => el.getAttribute('href')))
    for (const href of links) {
      await page.goto(base + href, { waitUntil: 'networkidle' })
      await page.locator('.articleHero img').evaluate(el => el.decode())
      assert.match(await page.locator('meta[property="og:image"]').getAttribute('content'), /\/blog\/.*\.jpg$/)
      assert.ok(await page.locator('.articleContents a').evaluateAll(elements => elements.every(el => document.getElementById(el.hash.slice(1)))))
      assert.ok(await page.locator('.articleToolCta a').count() > 0)
    }
    await shot('article'); return 5
  })
  await page.goto(`${base}/jpg-compressor`, { waitUntil: 'networkidle' }); await shot('tool')
  await check('Reduced motion disables navigation and disclosure animation', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Tools', exact: true }).click()
    const motion = await page.locator('.toolsDropdown').evaluate(el => ({ animation: getComputedStyle(el).animationName, transition: getComputedStyle(document.querySelector('.caret')).transitionDuration }))
    assert.equal(motion.animation, 'none'); assert.equal(motion.transition, '0s')
    await page.keyboard.press('Escape'); return motion
  })
  results.push({ name: 'Native disclosures exercised', pass: true, detail: disclosures })
} finally {
  writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  await browser.close()
}
console.log(`${results.filter(result => result.pass).length}/${results.length} premium UI checks passed`)
if (results.some(result => !result.pass)) process.exitCode = 1
