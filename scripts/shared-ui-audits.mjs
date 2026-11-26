/** Run the existing shared interaction checks sequentially and preserve their evidence. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const output = process.env.QA_OUTPUT || '.qa-results/shared-ui'
const allowed = ['navigation', 'role', 'a11y-manual', 'design-system', 'premium-ui']
const audits = process.env.QA_UI_AUDITS ? process.env.QA_UI_AUDITS.split(',') : allowed
if (audits.some(name => ![...allowed, 'functionality'].includes(name))) throw Error('Unknown UI audit requested')
mkdirSync(output, { recursive: true })
const fingerprint = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const indexSha256 = await fingerprint()
const results = []
writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ base, indexSha256, startedAt: new Date().toISOString(), status: 'running', results }, null, 2) + '\n')
for (const name of audits) {
  const started = performance.now()
  const stdoutFile = path.join(output, `${name}.stdout.log`)
  const stderrFile = path.join(output, `${name}.stderr.log`)
  writeFileSync(stdoutFile, '')
  writeFileSync(stderrFile, '')
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [`scripts/${name}-audit.mjs`, base], { env: { ...process.env, SCREENSHOT_DIR: path.join(output, name) }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let error
    const timeout = setTimeout(() => { error = Error('Audit exceeded its outer watchdog deadline'); child.kill('SIGTERM') }, name === 'functionality' ? 1_800_000 : 300_000)
    child.stdout.on('data', data => { appendFileSync(stdoutFile, data); stdout = (stdout + data).slice(-8192); process.stdout.write(data) })
    child.stderr.on('data', data => { appendFileSync(stderrFile, data); stderr = (stderr + data).slice(-8192) })
    child.on('error', value => { error = value })
    child.on('close', (status, signal) => { clearTimeout(timeout); resolve({ status, signal, error, stdout, stderr }) })
  })
  const item = { name, pass: result.status === 0 && !result.error && !result.signal, exitCode: result.status, signal: result.signal, error: result.error?.message, durationMs: Math.round(performance.now() - started), stdout: path.join(output, `${name}.stdout.log`), stderr: path.join(output, `${name}.stderr.log`) }
  results.push(item)
  console.log(item.pass ? 'PASS' : 'FAIL', name, (result.stdout || result.stderr || '').trim().split('\n').slice(-2).join(' | '))
  writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ base, indexSha256, capturedAt: new Date().toISOString(), results }, null, 2) + '\n')
}
const finalIndexSha256 = await fingerprint()
const artifactUnchanged = finalIndexSha256 === indexSha256
writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ base, indexSha256, finalIndexSha256, artifactUnchanged, capturedAt: new Date().toISOString(), results }, null, 2) + '\n')
if (results.some(result => !result.pass) || !artifactUnchanged) process.exitCode = 1
