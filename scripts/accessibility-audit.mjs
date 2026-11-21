/** Optional deeper axe-core audit. Install axe-core outside the app, then set AXE_TOOLS and PW_TOOLS. */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const axe = createRequire(path.join(process.env.AXE_TOOLS || process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const { chromium } = qa('playwright-core')
const base = process.argv[2] || 'http://127.0.0.1:3000'
const xml = await (await fetch(`${base}/sitemap.xml`)).text()
const routes = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname).concat('/wav-to-mp3'))]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const results = []
try {
  const page = await browser.newPage()
  for (const route of routes) {
    await page.goto(`${base}${route}`)
    await page.addScriptTag({ path: axe.resolve('axe-core/axe.min.js') })
    const result = await page.evaluate(async () => await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    results.push({ route, violations: result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) })), incomplete: result.incomplete.length })
    console.log(route, result.violations.length)
  }
} finally {
  mkdirSync('.qa-results', { recursive: true })
  writeFileSync('.qa-results/axe.json', JSON.stringify(results, null, 2))
  await browser.close()
}
console.log(`${results.length} pages scanned. Incomplete checks require manual review; this is not accessibility certification.`)
if (results.some(result => result.violations.length)) process.exitCode = 1
