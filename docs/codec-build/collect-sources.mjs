/* eslint no-console: "off" */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Review tool only. This downloads pinned upstream source and produces local
// archives; it never builds, installs, uploads, publishes or edits the app.
const directory = path.dirname(fileURLToPath(import.meta.url))
const manifestBytes = readFileSync(path.join(directory, 'source-pins.json'))
const manifest = JSON.parse(manifestBytes)
const gitHash = /^[a-f0-9]{40}$/
const validPath = value => typeof value === 'string' && !path.isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..') && !/[\\\u0000-\u001f\u007f]/.test(value)
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || manifest.originalNpmBinaryCorrespondenceVerified !== false || manifest.legalClearance !== false) throw Error('Unexpected review manifest.')
const names = new Set()
for (const source of manifest.sources) {
  if (!/^[a-z0-9-]+$/.test(source.name) || names.has(source.name) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository) || !gitHash.test(source.commit)) throw Error('Unsafe or duplicate source pin.')
  names.add(source.name)
  for (const file of source.licenseFiles) if (!validPath(file.path) || !gitHash.test(file.gitBlob)) throw Error('Unsafe license-file pin.')
  for (const sourceModule of [...source.submodules, ...(source.excludedSubmodules || [])]) if (!validPath(sourceModule.path) || !gitHash.test(sourceModule.commit)) throw Error('Unsafe submodule pin.')
}
for (const source of manifest.sources) for (const sourceModule of source.submodules) if (!names.has(sourceModule.source) || manifest.sources.find(item => item.name === sourceModule.source).commit !== sourceModule.commit) throw Error('Missing submodule source.')
if (process.argv[2] === '--validate-only') {
  console.log(`Manifest structure verified: ${manifest.sources.length} pinned source repositories. No source was downloaded, built or cleared for distribution.`)
  process.exit(0)
}
if (!process.argv[2] || process.argv.length !== 3) throw Error('Provide one new local output directory, or --validate-only.')
const output = path.resolve(process.argv[2])
if (existsSync(output)) throw Error('Refusing to overwrite an existing output directory.')
mkdirSync(output, { recursive: true, mode: 0o700 })
const repositories = path.join(output, 'repositories')
const archives = path.join(output, 'archives')
const notices = path.join(output, 'notices')
for (const item of [repositories, archives, notices]) mkdirSync(item)
writeFileSync(path.join(output, 'source-pins.json'), manifestBytes)
const gitEnvironment = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }
const git = (cwd, args, options = {}) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=never', ...args], { cwd, env: gitEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024, ...options })
const results = []
for (const source of manifest.sources) {
  const repository = path.join(repositories, source.name)
  mkdirSync(repository)
  git(repository, ['init', '--quiet'])
  git(repository, ['remote', 'add', 'origin', `https://github.com/${source.repository}.git`])
  git(repository, ['fetch', '--quiet', '--no-tags', '--depth=1', 'origin', source.commit])
  const commit = git(repository, ['rev-parse', 'FETCH_HEAD']).trim()
  if (commit !== source.commit) throw Error(`Source revision mismatch: ${source.name}`)
  const links = git(repository, ['ls-tree', '-r', commit]).split('\n').filter(line => line.startsWith('160000 ')).map(line => {
    const tab = line.indexOf('\t')
    return { path: line.slice(tab + 1), commit: line.slice(14, tab) }
  })
  const expectedLinks = [...source.submodules, ...(source.excludedSubmodules || [])].map(({ path, commit }) => ({ path, commit }))
  if (JSON.stringify(links.sort((a, b) => a.path.localeCompare(b.path))) !== JSON.stringify(expectedLinks.sort((a, b) => a.path.localeCompare(b.path)))) throw Error(`Unrecorded or mismatched submodules: ${source.name}`)
  const sourceNotices = path.join(notices, source.name)
  mkdirSync(sourceNotices)
  for (const file of source.licenseFiles) {
    if (git(repository, ['rev-parse', `${commit}:${file.path}`]).trim() !== file.gitBlob) throw Error(`Notice identity mismatch: ${source.name}/${file.path}`)
    const target = path.join(sourceNotices, file.path)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, git(repository, ['show', `${commit}:${file.path}`], { encoding: null }))
  }
  // Override export-ignore so source files are not omitted by archive rules.
  writeFileSync(path.join(repository, '.git/info/attributes'), '* -export-ignore\n** -export-ignore\n')
  const archive = path.join(archives, `${source.name}-${source.commit}.tar.gz`)
  git(repository, ['archive', '--format=tar.gz', `--prefix=${source.name}/`, `--output=${archive}`, commit])
  const bytes = readFileSync(archive)
  if (!lstatSync(archive).isFile() || !bytes.length) throw Error('Missing source archive.')
  results.push({ name: source.name, repository: source.repository, commit, archive: path.basename(archive), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), submodules: source.submodules, excludedUnlinkedFixtures: source.excludedSubmodules || [] })
  console.log(`Collected ${source.name} at ${source.commit}; ${bytes.length} archive bytes.`)
}
writeFileSync(path.join(output, 'collection.json'), JSON.stringify({
  schemaVersion: 1, collectedAt: new Date().toISOString(), sourcePinsSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  sourceArchives: results, built: false, published: false, originalNpmBinaryCorrespondenceVerified: false, legalClearance: false,
  notes: ['Submodules are separate pinned archives and must be placed at their recorded paths when reconstructing a build tree.', 'The Docker image digest, SDL port download and real build/output comparison remain separate steps.', 'Retain notices and all source files; collection success is not legal clearance.'],
}, null, 2) + '\n')
console.log('Pinned source collection complete locally. Nothing was built or published.')
