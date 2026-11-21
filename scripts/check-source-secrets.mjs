import { execFileSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
// Repository-owned tracked/unignored files only. Never traverse user folders,
// installed dependencies, environment files or Git object storage.
let inventory
if (process.argv.includes('--files-stdin')) {
  inventory = ''
  for await (const chunk of process.stdin) inventory += chunk.toString('utf8')
}
else {
  try { inventory = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString('utf8') }
  catch { console.error('Cannot enumerate repository source. Pipe git ls-files -z --cached --others --exclude-standard into this script with --files-stdin.'); process.exit(1) }
}
const filenames = inventory.split('\0').filter(Boolean)
const findings = []
const patterns = [
  ['private key', /-{5}BEGIN (?:[A-Z]+ )?PRIVATE KEY-{5}/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['AWS access credential', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['npm credential', /\bnpm_[A-Za-z0-9]{30,}\b/],
  ['Google API credential', /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ['literal secret assignment', /\b[A-Za-z_]*(?:token|secret|password|api_?key)\s*[:=]\s*['"][A-Za-z0-9/+_=.-]{24,}['"]/i],
]
for (const filename of new Set(filenames)) {
  const label = JSON.stringify(filename)
  if (path.isAbsolute(filename) || filename.split('/').some(segment => segment === '..') || /[\\\u0000-\u001f\u007f]/.test(filename)) {
    findings.push(`${label}: unsafe repository-relative path`); continue
  }
  if (filename.split('/').some(segment => ['.aws', '.ssh'].includes(segment)) ||
    /(?:^|\/)(?:\.env(?:\..+)?|\.npmrc|\.pypirc|id_rsa|id_ed25519|credentials)$/i.test(filename) && !filename.endsWith('/.env.example') && filename !== '.env.example' ||
    /\.(?:pem|key|p12|pfx|bundle|wasm|zip|tgz|tar|7z|rar)$/i.test(filename)) {
    // Staged deletions and removed historical fixtures are intentionally absent.
    try { await lstat(path.join(root, filename)); findings.push(`${label}: excluded credential/archive/binary path`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    continue
  }
  let details
  try { details = await lstat(path.join(root, filename)) }
  catch (error) { if (error.code === 'ENOENT') continue; throw error }
  if (!details.isFile() || details.isSymbolicLink()) { findings.push(`${label}: unsupported source file type`); continue }
  if (details.size > 20 * 1024 * 1024) { findings.push(`${label}: oversized source file`); continue }
  const bytes = await readFile(path.join(root, filename))
  if (bytes.includes(0)) continue // Binary editorial images are checked separately.
  const source = bytes.toString('utf8')
  for (const [name, pattern] of patterns) {
    const match = pattern.exec(source)
    if (match) findings.push(`${label}:${source.slice(0, match.index).split('\n').length}: possible ${name}`)
  }
}
if (findings.length) {
  console.error('Source review stopped. Only file locations and finding types are shown; matched values are never printed.')
  for (const finding of findings) console.error(finding)
  process.exitCode = 1
} else console.log(`Source checks passed for ${new Set(filenames).size} repository-owned file paths. This heuristic scan does not replace a human secret review.`)
