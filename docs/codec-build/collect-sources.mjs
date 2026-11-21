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
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const validPath = value => typeof value === 'string' && !path.isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..') && !/[\\\u0000-\u001f\u007f]/.test(value)
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || manifest.originalNpmBinaryCorrespondenceVerified !== false || manifest.legalClearance !== false) throw Error('Unexpected review manifest.')
const names = new Set()
for (const source of manifest.sources) {
  if (!/^[a-z0-9-]+$/.test(source.name) || names.has(source.name)) throw Error('Unsafe or duplicate source pin.')
  if (source.sourceType === 'archive') {
    if (!/^https:\/\/downloads\.sourceforge\.net\/project\/lame\/lame\/[0-9.]+\/lame-[0-9.]+\.tar\.gz$/.test(source.archiveURL) || !/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-zA-Z0-9_.-]+$/.test(source.archiveRoot) || source.archiveRoot === '.' || source.archiveRoot === '..' || !Number.isSafeInteger(source.maxBytes) || source.maxBytes < 1 || source.maxBytes > 32 * 1024 * 1024 || source.submodules.length) throw Error('Unsafe or unbounded official source-archive pin.')
  } else if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository) || !gitHash.test(source.commit)) throw Error('Unsafe Git source pin.')
  if (source.gitURL && (source.name !== 'x264' || source.gitURL !== 'https://code.videolan.org/videolan/x264.git' || source.requireOfficialRef !== 'refs/heads/stable')) throw Error('Unexpected official Git source/ref override.')
  names.add(source.name)
  if (source.archivePaths && (!Array.isArray(source.archivePaths) || !source.archivePaths.length || source.archivePaths.some(item => !validPath(item)))) throw Error('Unsafe selected-source path.')
  for (const file of source.licenseFiles) if (!validPath(file.path) || (source.sourceType !== 'archive' && !gitHash.test(file.gitBlob)) || (file.gitBlob && !gitHash.test(file.gitBlob))) throw Error('Unsafe license-file pin.')
  for (const sourceModule of [...source.submodules, ...(source.excludedSubmodules || [])]) if (!validPath(sourceModule.path) || !gitHash.test(sourceModule.commit)) throw Error('Unsafe submodule pin.')
}
for (const source of manifest.sources) for (const sourceModule of source.submodules) if (!names.has(sourceModule.source) || manifest.sources.find(item => item.name === sourceModule.source).commit !== sourceModule.commit) throw Error('Missing submodule source.')
if (process.argv[2] === '--validate-only') {
  console.log(`Manifest structure verified: ${manifest.sources.length} pinned source inputs. No source was downloaded, built or cleared for distribution.`)
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
const officialSourceRefs = []
for (const source of manifest.sources) {
  if (source.sourceType === 'archive') {
    const response = await fetch(source.archiveURL, { signal: AbortSignal.timeout(120000) })
    if (!response.ok || !response.url.startsWith('https://')) throw Error(`Official source archive unavailable: ${source.name}`)
    const chunks = []
    let total = 0
    for await (const chunk of response.body) {
      total += chunk.length
      if (total > source.maxBytes) throw Error('Source archive exceeds its reviewed bound.')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    if (!bytes.length || sha256(bytes) !== source.sha256) throw Error(`Official source archive checksum failed: ${source.name}`)
    const filename = `${source.name}-${source.sha256}.tar.gz`
    const archive = path.join(archives, filename)
    writeFileSync(archive, bytes)
    const extracted = path.join(output, 'archive-inspection', source.name)
    mkdirSync(extracted, { recursive: true })
    execFileSync('python3', ['-c', 'import sys,tarfile\nwith tarfile.open(sys.argv[1],"r:gz") as archive:\n members=archive.getmembers()\n assert sum(m.size for m in members)<=128*1024*1024\n assert all(m.name.removeprefix("./").split("/")[0]==sys.argv[3] for m in members)\n archive.extractall(sys.argv[2],filter="data")', archive, extracted, source.archiveRoot], { stdio: 'pipe', timeout: 120000 })
    const sourceNotices = path.join(notices, source.name)
    mkdirSync(sourceNotices)
    const noticeRecords = []
    for (const file of source.licenseFiles) {
      const original = path.join(extracted, source.archiveRoot, file.path)
      const info = lstatSync(original)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw Error('Unexpected archive notice member.')
      const noticeBytes = readFileSync(original)
      const blob = createHash('sha1').update(`blob ${noticeBytes.length}\0`).update(noticeBytes).digest('hex')
      if (file.gitBlob && file.gitBlob !== blob) throw Error('Source archive notice identity mismatch.')
      const target = path.join(sourceNotices, file.path)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, noticeBytes)
      noticeRecords.push({ path: file.path, bytes: noticeBytes.length, sha256: sha256(noticeBytes), gitBlob: blob, protectedByOriginalArchiveSha256: source.sha256 })
    }
    results.push({ name: source.name, sourceType: 'archive', archiveURL: source.archiveURL, archiveRoot: source.archiveRoot, archive: filename, bytes: bytes.length, sha256: source.sha256, noticeRecords, submodules: [], excludedUnlinkedFixtures: [] })
    console.log(`Collected official ${source.name} release archive; verified ${bytes.length} bytes at SHA-256 ${source.sha256}.`)
    continue
  }
  const repository = path.join(repositories, source.name)
  mkdirSync(repository)
  git(repository, ['init', '--quiet'])
  const gitURL = source.gitURL || `https://github.com/${source.repository}.git`
  git(repository, ['remote', 'add', 'origin', gitURL])
  if (source.requireOfficialRef) {
    const response = git(repository, ['ls-remote', 'origin', source.requireOfficialRef, 'refs/heads/master'])
    const refs = response.trim().split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([a-f0-9]{40})\t(refs\/heads\/(?:stable|master))$/)
      if (!match) throw Error('Unexpected official source-ref response.')
      return { commit: match[1], ref: match[2] }
    })
    const matchesSelected = refs.find(item => item.ref === source.requireOfficialRef)?.commit === source.commit
    officialSourceRefs.push({ name: source.name, gitURL, checkedAt: new Date().toISOString(), selectedCommit: source.commit, requiredRef: source.requireOfficialRef, refs, matchesSelected, responseSha256: sha256(Buffer.from(response)) })
    writeFileSync(path.join(output, 'official-source-refs.json'), JSON.stringify(officialSourceRefs, null, 2) + '\n')
    console.log(`Official ${source.name} refs: ${JSON.stringify(refs)}; selected match=${matchesSelected}.`)
    if (!matchesSelected) throw Error('The selected x264 pin is not the current official stable head; no source build is permitted.')
  }
  git(repository, ['fetch', '--quiet', '--no-tags', '--depth=1', ...(source.archivePaths ? ['--filter=blob:none'] : []), 'origin', source.commit])
  const commit = git(repository, ['rev-parse', 'FETCH_HEAD']).trim()
  if (commit !== source.commit) throw Error(`Source revision mismatch: ${source.name}`)
  const selectedPaths = source.archivePaths || []
  const links = git(repository, ['ls-tree', '-r', commit, ...(selectedPaths.length ? ['--', ...selectedPaths] : [])]).split('\n').filter(line => line.startsWith('160000 ')).map(line => {
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
  git(repository, ['archive', '--format=tar.gz', `--prefix=${source.name}/`, `--output=${archive}`, commit, ...(selectedPaths.length ? ['--', ...selectedPaths] : [])])
  const bytes = readFileSync(archive)
  if (!lstatSync(archive).isFile() || !bytes.length) throw Error('Missing source archive.')
  results.push({ name: source.name, repository: source.repository, gitURL, commit, archive: path.basename(archive), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), archivePaths: selectedPaths.length ? selectedPaths : null, submodules: source.submodules, excludedUnlinkedFixtures: source.excludedSubmodules || [] })
  console.log(`Collected ${source.name} at ${source.commit}; ${bytes.length} archive bytes.`)
}
writeFileSync(path.join(output, 'collection.json'), JSON.stringify({
  schemaVersion: 1, collectedAt: new Date().toISOString(), sourcePinsSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  sourceArchives: results, officialSourceRefs, built: false, published: false, originalNpmBinaryCorrespondenceVerified: false, legalClearance: false,
  notes: ['Submodules are separate pinned archives and must be placed at their recorded paths when reconstructing a build tree.', 'The Docker image digest, SDL port download and real build/output comparison remain separate steps.', 'Retain notices and all source files; collection success is not legal clearance.'],
}, null, 2) + '\n')
console.log('Pinned source collection complete locally. Nothing was built or published.')
