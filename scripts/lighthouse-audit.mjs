/** Reproducible local lab audits. Install Lighthouse in PW_TOOLS, never in the shipped app. */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const cli = qa.resolve('lighthouse/cli/index.js')
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const output = process.env.QA_OUTPUT || '.qa-results/lighthouse'
const routes = process.env.LH_ROUTES ? process.env.LH_ROUTES.split(',') : ['/', '/jpg-compressor', '/webm-to-mp4', '/pdf-compressor', '/blog/how-browser-compression-works']
const modes = process.env.LH_MODES ? process.env.LH_MODES.split(',') : ['mobile', 'desktop']
const results = []
mkdirSync(output, { recursive: true })
for (const route of routes) for (const mode of modes) {
  if (!['mobile', 'desktop'].includes(mode)) throw Error(`Unknown Lighthouse mode: ${mode}`)
  const prefix = path.resolve(output, `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '--')}-${mode}`)
  const args = [cli, base + route, '--quiet', '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage', '--only-categories=performance,accessibility,best-practices,seo', '--output=json', '--output=html', `--output-path=${prefix}`]
  if (mode === 'desktop') args.push('--preset=desktop')
  try {
    execFileSync(process.execPath, args, { env: process.env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 })
    const report = JSON.parse(readFileSync(`${prefix}.report.json`, 'utf8'))
    const scores = Object.fromEntries(Object.entries(report.categories).map(([name, category]) => [name, category.score === null ? null : Math.round(category.score * 100)]))
    const metrics = Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map(name => [name, report.audits[name]?.numericValue]))
    const failed = Object.values(report.audits).filter(audit => audit.score !== null && audit.score < 1 && !['manual', 'notApplicable', 'informative'].includes(audit.scoreDisplayMode)).map(audit => ({ id: audit.id, title: audit.title, score: audit.score, displayValue: audit.displayValue }))
    results.push({ route, mode, capturedAt: report.fetchTime, version: report.lighthouseVersion, scores, metrics, failed, warnings: report.runWarnings, runtimeError: report.runtimeError, json: `${prefix}.report.json`, html: `${prefix}.report.html` })
    console.log(route, mode, JSON.stringify(scores))
  } catch (error) {
    results.push({ route, mode, error: String(error) })
    console.error('FAIL', route, mode, String(error).slice(0, 600))
  }
  writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ base, capturedAt: new Date().toISOString(), note: 'Local lab measurements on a shared host. Not field Core Web Vitals or a ranking guarantee. A preview configured with noindex will have a lower SEO score; the final production-public configuration enables indexing. Baseline and final indexing configurations must be compared separately from code improvements.', results }, null, 2) + '\n')
}
if (results.some(result => result.error || result.runtimeError)) process.exitCode = 1
