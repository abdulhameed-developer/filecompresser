/* eslint no-console: "off" */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mode, directory] = process.argv.slice(2)
if (!['success', 'failure'].includes(mode) || !directory || process.argv.length !== 4) throw Error('Expected success|failure and the probe directory.')
const failureMode = mode === 'failure'
const output = value => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `retain_diagnostics=${value}\n`) }
if (failureMode) output('false')
try {
  if (process.env.GITHUB_REPOSITORY !== 'abdulhameed-developer/filecompresser' || !process.env.GITHUB_TOKEN) throw Error('Read-only repository Actions metadata access is required to verify the cumulative budget.')
  const root = path.resolve(directory)
  const diagnostics = path.join(root, 'diagnostics')
  if (!existsSync(diagnostics)) throw Error('No diagnostics exist to retain.')
  let candidateBytes = 0
  let diagnosticBytes = 0
  for (const name of readdirSync(diagnostics)) {
    if (!/^[a-z-]+\.json$/.test(name)) throw Error('Unexpected diagnostic artifact.')
    const filename = path.join(diagnostics, name)
    const info = lstatSync(filename)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw Error('Unsafe or oversized diagnostic artifact.')
    JSON.parse(readFileSync(filename, 'utf8'))
    diagnosticBytes += info.size
  }
  if (diagnosticBytes > 1024 * 1024) throw Error('Diagnostic inputs exceed one MiB.')
  candidateBytes += diagnosticBytes
  if (!failureMode) {
    const status = JSON.parse(readFileSync(path.join(diagnostics, 'probe-status.json'), 'utf8'))
    if (status.status !== 'probe-complete-not-released' || !status.sourceCollected || !status.runtimeSourcePinsVerified || !status.built || status.ffmpegVersion !== '5.1.10' || status.ffmpegSourceCommit !== '19feb712f5c1821d8a3fa1ad63c5bd2e3b9672eb' || !status.intentionalDifferenceFromOriginalNpmCore || !status.embeddedPatchedFfmpegVersionPresent || status.originalNpmBinaryCorrespondenceVerified !== false || status.allNativeDependenciesCleared !== false || status.legalClearance !== false || status.deployed !== false || !status.artifact?.completeSourceAccompaniesNewBinary) throw Error('The patched source-accompanied build prerequisites did not all pass.')
    const filename = path.join(root, 'codec-source-and-new-core.tar.gz')
    const info = lstatSync(filename)
    const bytes = readFileSync(filename)
    if (!info.isFile() || info.isSymbolicLink() || bytes.length !== status.artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== status.artifact.sha256) throw Error('Complete bundle identity changed.')
    candidateBytes += bytes.length
    const entries = execFileSync('tar', ['-tzf', filename], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).split('\n')
    const includes = name => entries.includes(`./${name}`)
    for (const required of ['newly-built-core/esm/ffmpeg-core.wasm', 'newly-built-core/esm/ffmpeg-core.js', 'recipe/Dockerfile.original', 'recipe/Dockerfile.controlled', 'recipe/rebuild-probe.mjs', 'recipe/artifact-budget.mjs', 'recipe/ffmpeg-security-ancestry.json', 'source-pins.json', 'collection.json', 'sdk-clang-resource-headers.tar.gz', 'official-toolchain-release-DEPS', 'official-sdk-release-mapping.json']) if (!includes(required)) throw Error(`Missing retained input: ${required}`)
    const manifest = JSON.parse(readFileSync(path.join(root, 'sources/source-pins.json'), 'utf8'))
    for (const source of manifest.sources) {
      if (!includes(`source-archives/${source.name}-${source.commit}.tar.gz`)) throw Error(`Missing source archive: ${source.name}`)
      for (const file of source.licenseFiles) if (!includes(`notices/${source.name}/${file.path}`)) throw Error(`Missing notice: ${source.name}/${file.path}`)
    }
  }
  const existing = []
  let exhausted = false
  for (let page = 1; page <= 20; page++) {
    const response = await fetch(`https://api.github.com/repos/abdulhameed-developer/filecompresser/actions/artifacts?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw Error(`Cannot verify existing artifact budget: GitHub HTTP ${response.status}.`)
    const data = await response.json()
    if (!Array.isArray(data.artifacts)) throw Error('Unexpected Actions artifact metadata.')
    for (const artifact of data.artifacts) {
      if (!/^codec-(?:source-and-new-core|probe-failure)-/.test(artifact.name) || artifact.expired) continue
      if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0) throw Error('Invalid existing artifact size.')
      existing.push({ id: artifact.id, name: artifact.name, bytes: artifact.size_in_bytes, expiresAt: artifact.expires_at })
    }
    if (data.artifacts.length < 100) { exhausted = true; break }
  }
  if (!exhausted) throw Error('Artifact pagination limit reached; cumulative budget is unverified.')
  const existingBytes = existing.reduce((total, artifact) => total + artifact.bytes, 0)
  const reportReserve = 64 * 1024
  if (existingBytes + candidateBytes + reportReserve > 199 * 1024 * 1024) throw Error('Existing codec artifacts plus this candidate exceed the cumulative retention budget. No old artifact will be deleted automatically.')
  writeFileSync(path.join(diagnostics, 'artifact-retention-budget.json'), JSON.stringify({ checkedAt: new Date().toISOString(), mode, existing, existingBytes, candidateInputBytes: candidateBytes, reportReserveBytes: reportReserve, aggregateInputBudgetBytes: 199 * 1024 * 1024, hardRetainedBudgetBytes: 200 * 1024 * 1024, retentionDays: 1, deletedArtifacts: false }, null, 2) + '\n')
  if (failureMode) output('true')
  console.log(`Cumulative codec retention checked: ${existingBytes} existing bytes plus ${candidateBytes} new input bytes. One-day retention; no artifact was deleted.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (!failureMode) process.exitCode = 1
}
