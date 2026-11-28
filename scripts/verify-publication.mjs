/** Read-only custom-domain acceptance after Cloudflare's independent build. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditContentParity } from './content-parity.mjs'

export async function waitForPublishedCommit({ expectedCommit, base = 'https://filecompresser.com', timeoutMs = 900_000, intervalMs = 15_000, fetcher = fetch, now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? '')) throw new Error('Expected publication must be a full Git commit.')
  const origin = new URL(base)
  if (origin.origin !== base || origin.username || origin.password || !['https://filecompresser.com', 'http://127.0.0.1:3323'].includes(base)) throw new Error('Publication checks are restricted to the product domain or the explicit local acceptance preview.')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1_200_000 || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 60_000) throw new Error('Invalid bounded publication wait.')
  const started = now()
  /** @type {{ at: string, status?: number, observedCommit?: string | null, error?: string }[]} */
  const attempts = []
  let first = true
  while (first || now() - started < timeoutMs) {
    first = false
    /** @type {{ at: string, status?: number, observedCommit?: string | null, error?: string }} */
    const attempt = { at: new Date().toISOString() }
    try {
      const response = await fetcher(`${base}/release.json`, { redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store' })
      attempt.status = response.status
      if (response.status === 200) {
        const release = await response.json()
        attempt.observedCommit = typeof release.sha === 'string' && /^[a-f0-9]{40}$/.test(release.sha) ? release.sha : null
        if (attempt.observedCommit === expectedCommit) {
          attempts.push(attempt)
          return { passed: true, expectedCommit, base, attempts, elapsedMs: now() - started }
        }
      }
    } catch (error) { attempt.error = error instanceof Error ? error.message : String(error) }
    attempts.push(attempt)
    await delay(Math.min(intervalMs, Math.max(0, timeoutMs - (now() - started))))
  }
  return { passed: false, expectedCommit, base, attempts, elapsedMs: now() - started, error: 'The intended commit did not reach the custom domain within the bounded wait. Saving or pushing alone is not publication.' }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = '.qa-results/publication-verification.json'
  const report = { startedAt: new Date().toISOString(), passed: false }
  try {
    const expectedCommit = process.env.EXPECTED_PUBLIC_COMMIT
    const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    assert.equal(currentCommit, expectedCommit, 'Verify the exact checked-out commit, not a moving branch.')
    report.identity = await waitForPublishedCommit({ expectedCommit })
    assert.equal(report.identity.passed, true, report.identity.error)
    report.content = await auditContentParity({ baseUrl: 'https://filecompresser.com', requireCommitted: true })
    assert.equal(report.content.passed, true, 'The deployed commit must also display its intended content, metadata, dates and schemas.')
    report.finalIdentity = await waitForPublishedCommit({ expectedCommit, timeoutMs: 1, intervalMs: 1 })
    assert.equal(report.finalIdentity.passed, true, 'Publication identity changed during content acceptance.')
    report.passed = true
    console.log(`Published source and all ${report.content.manifest.pages.length} served content routes verified on filecompresser.com.`)
  } catch (error) { report.error = error instanceof Error ? error.message : String(error); console.error(report.error); process.exitCode = 1 }
  finally { report.finishedAt = new Date().toISOString(); mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n') }
}
