import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { copyFile, link, lstat, mkdir, mkdtemp, open, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { createGunzip } from 'node:zlib'

export const CODEC_LIMITS = Object.freeze({ archive: 195 * 1024 * 1024, tar: 256 * 1024 * 1024, entries: 512, js: 4 * 1024 * 1024, wasm: 64 * 1024 * 1024, notices: 4 * 1024 * 1024, noticeFile: 1024 * 1024 })
export const CORE_MEMBERS = Object.freeze({ js: 'newly-built-core/esm/ffmpeg-core.js', wasm: 'newly-built-core/esm/ffmpeg-core.wasm' })
const BUILD_METADATA = 'build-metadata/codec-build.json'
const PAIRED_FILES = ['source-pins.json', 'collection.json', 'READ-FIRST.txt', 'sdk-clang-resource-headers.tar.gz', 'official-toolchain-release-DEPS', 'official-sdk-release-mapping.json', BUILD_METADATA, 'build-metadata/ffmpeg-config.h', 'build-metadata/ffmpeg-config.mak', 'build-metadata/ffmpeg-version.h']
const PAIRED_PREFIXES = ['source-archives/', 'notices/', 'recipe/', 'evidence/']
const PROJECT_RELEASE_PREFIX = '/abdulhameed-developer/filecompresser/releases/download/'
const ARCHIVE_NAME = 'codec-source-and-new-core.tar.gz'
const HASH = /^[a-f0-9]{64}$/
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw new Error(`Codec release: ${message}`) }

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  return value
}
function size(value, maximum, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(`${label} exceeds its supported size bound`)
  return value
}
function hash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) fail(`${label} must be a real SHA-256 digest`)
  return value
}
export function validateCodecPins(value) {
  const input = record(value, 'pins')
  const core = record(input.core, 'core')
  const assets = {}
  for (const kind of ['js', 'wasm']) {
    const asset = record(core[kind], `${kind} asset`)
    if (asset.member !== CORE_MEMBERS[kind]) fail(`unexpected ${kind} archive member`)
    assets[kind] = { member: CORE_MEMBERS[kind], bytes: size(asset.bytes, CODEC_LIMITS[kind], `${kind} bytes`), sha256: hash(asset.sha256, `${kind} hash`) }
  }
  const tarBytes = size(input.tarBytes, CODEC_LIMITS.tar, 'expanded archive bytes')
  if (tarBytes < 1024 || tarBytes % 512 !== 0) fail('expanded archive must consist of complete ustar blocks')
  return {
    archiveBytes: size(input.archiveBytes, CODEC_LIMITS.archive, 'archive bytes'),
    archiveSha256: hash(input.archiveSha256, 'archive hash'),
    tarBytes,
    core: assets,
  }
}

export function validateCodecReleaseManifest(value) {
  const input = record(value, 'manifest')
  if (input.version !== 1) fail('unsupported manifest version')
  if (input.state === 'pending') return { version: 1, state: 'pending' }
  if (input.state !== 'verified') fail('manifest must be pending or verified')
  let url
  try { url = new URL(input.archiveUrl) } catch { fail('a verified manifest needs its durable source archive URL') }
  const tail = url.pathname.slice(PROJECT_RELEASE_PREFIX.length).split('/')
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash ||
    !url.pathname.startsWith(PROJECT_RELEASE_PREFIX) || tail.length !== 2 || tail[1] !== ARCHIVE_NAME ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(tail[0]) || /^(?:latest|main|master|nightly|current)$/i.test(tail[0])) {
    fail('source archive must be the exact HTTPS project release asset, with a fixed release tag')
  }
  return { version: 1, state: 'verified', archiveUrl: url.href, ...validateCodecPins(input) }
}

export async function readCodecReleaseManifest(root = process.cwd()) {
  return validateCodecReleaseManifest(JSON.parse(await readFile(path.join(root, 'scripts/codec-release.json'), 'utf8')))
}

export function isCodecDeploymentBuild() {
  return Boolean(process.env.CF_PAGES) || process.env.NEXT_PUBLIC_ENABLE_INDEXING === 'true'
}

export async function assertVerifiedCodecRelease(root = process.cwd()) {
  const manifest = await readCodecReleaseManifest(root)
  if (manifest.state !== 'verified') fail('public deployment is blocked: a reviewed, paired core/source release has not been pinned')
  return manifest
}

async function verifyArchive(filename, pins) {
  const info = await lstat(filename)
  if (!info.isFile() || info.size !== pins.archiveBytes) fail('archive is not a regular file with the exact pinned size')
  const hasher = createHash('sha256')
  let total = 0
  for await (const chunk of createReadStream(filename)) {
    total += chunk.length
    if (total > pins.archiveBytes) fail('archive grew beyond its pinned size')
    hasher.update(chunk)
  }
  if (total !== pins.archiveBytes || hasher.digest('hex') !== pins.archiveSha256) fail('archive SHA-256 does not match its reviewed pin')
}

function tarString(bytes) {
  const zero = bytes.indexOf(0)
  const used = zero < 0 ? bytes : bytes.subarray(0, zero)
  return new TextDecoder('utf-8', { fatal: true }).decode(used)
}
function tarOctal(bytes, label) {
  const value = tarString(bytes).trim()
  if (!/^[0-7]+$/.test(value)) fail(`invalid ${label} in source archive`)
  const number = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(number)) fail(`oversized ${label} in source archive`)
  return number
}
function tarHeader(header) {
  let checksum = 0
  for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i]
  if (checksum !== tarOctal(header.subarray(148, 156), 'header checksum')) fail('source archive header checksum failed')
  if (tarString(header.subarray(257, 263)) !== 'ustar') fail('source archive must use the reviewed ustar format')
  const type = header[156] === 0 ? '0' : String.fromCharCode(header[156])
  if (!['0', '5'].includes(type) || tarString(header.subarray(157, 257))) fail('source archive contains a link or unsupported entry type')
  const prefix = tarString(header.subarray(345, 500))
  let name = `${prefix ? `${prefix}/` : ''}${tarString(header.subarray(0, 100))}`
  if (name.startsWith('./')) name = name.slice(2)
  if (type === '5' && name.endsWith('/')) name = name.slice(0, -1)
  if (type === '5' && (name === '' || name === '.')) name = ''
  else if (!name || name.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) fail('source archive contains an unsafe path')
  const bytes = tarOctal(header.subarray(124, 136), 'entry size')
  if (bytes > CODEC_LIMITS.tar || type === '5' && bytes !== 0) fail('source archive contains an invalid entry size')
  return { name, type, bytes }
}

function readBuildMetadata(value) {
  const metadata = record(value, 'actual codec build metadata')
  const { ffmpegVersion, ffmpegSourceLabel, ffmpegSourceCommit, postTagCommitCount, evidenceMethod } = metadata
  if (typeof ffmpegVersion !== 'string' || ffmpegVersion.length > 40 || !/^[0-9]+(?:\.[0-9]+){1,3}$/.test(ffmpegVersion) ||
    typeof ffmpegSourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(ffmpegSourceCommit) ||
    !Number.isSafeInteger(postTagCommitCount) || postTagCommitCount < 0 || postTagCommitCount > 1000000 ||
    metadata.gplEnabled !== true || typeof evidenceMethod !== 'string' || evidenceMethod.length < 1 || evidenceMethod.length > 400 || /[\u0000-\u001f\u007f]/.test(evidenceMethod)) fail('actual codec build metadata has invalid source or configure evidence')
  const sourceLabel = postTagCommitCount === 0 ? ffmpegVersion : `${ffmpegVersion}+${postTagCommitCount}.${ffmpegSourceCommit.slice(0, 12)}`
  if (ffmpegSourceLabel !== sourceLabel || metadata.buildLabel !== `FileCompresser minimal FFmpeg ${sourceLabel} (GPL-enabled, single-thread)`) fail('actual codec build label differs from its source identity')
  return { buildLabel: metadata.buildLabel, gplEnabled: true, ffmpegVersion, ffmpegSourceLabel, ffmpegSourceCommit, postTagCommitCount, evidenceMethod, sourcePinsSha256: hash(metadata.sourcePinsSha256, 'collected source pins hash') }
}

/** Validate every outer member; extract only the two pinned assets into memory. */
export async function readPairedCodecArchive(filename, inputPins) {
  const pins = validateCodecPins(inputPins)
  await verifyArchive(filename, pins)
  const compressed = createReadStream(filename)
  const unzip = createGunzip()
  const parsedArchiveHash = createHash('sha256')
  let parsedArchiveBytes = 0
  compressed.on('data', chunk => {
    parsedArchiveBytes += chunk.length
    if (parsedArchiveBytes > pins.archiveBytes) { compressed.destroy(new Error('Codec release: source archive grew while being inspected')); return }
    parsedArchiveHash.update(chunk)
  })
  compressed.on('error', error => unzip.destroy(error))
  compressed.pipe(unzip)
  const found = {}
  const notices = []
  const pairedFiles = new Set()
  const pairedPrefixes = new Set()
  let noticeBytes = 0
  const names = new Set()
  let total = 0
  let entries = 0
  let header = Buffer.alloc(0)
  let active
  let padding = 0
  let footer = false
  let footerBytes = 0
  try {
    for await (const chunk of unzip) {
      total += chunk.length
      if (total > pins.tarBytes || total > CODEC_LIMITS.tar) fail('expanded source archive exceeds its pinned bound')
      let offset = 0
      while (offset < chunk.length) {
        if (footer) {
          const rest = chunk.subarray(offset)
          if (rest.some(byte => byte !== 0)) fail('source archive has data after its end marker')
          footerBytes += rest.length
          break
        }
        if (active) {
          const count = Math.min(active.remaining, chunk.length - offset)
          if (active.kind || active.notice || active.metadata) active.parts.push(chunk.subarray(offset, offset + count))
          active.remaining -= count
          offset += count
          if (active.remaining !== 0) continue
          if (active.kind) {
            const bytes = Buffer.concat(active.parts)
            const expected = pins.core[active.kind]
            if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) fail(`${active.kind} asset hash or size failed`)
            found[active.kind] = bytes
          }
          if (active.notice) {
            const bytes = Buffer.concat(active.parts)
            new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            if (bytes.includes(0)) fail('a notice member contains non-text data')
            notices.push({ member: active.name, content: bytes })
          }
          if (active.metadata) {
            found.buildMetadata = readBuildMetadata(JSON.parse(Buffer.concat(active.parts).toString('utf8')))
            found.buildLabel = found.buildMetadata.buildLabel
          }
          active = undefined
          continue
        }
        if (padding) {
          const count = Math.min(padding, chunk.length - offset)
          if (chunk.subarray(offset, offset + count).some(byte => byte !== 0)) fail('source archive has nonzero entry padding')
          padding -= count
          offset += count
          continue
        }
        const count = Math.min(512 - header.length, chunk.length - offset)
        header = Buffer.concat([header, chunk.subarray(offset, offset + count)])
        offset += count
        if (header.length !== 512) continue
        if (header.every(byte => byte === 0)) {
          footer = true
          footerBytes = 512
          header = Buffer.alloc(0)
          continue
        }
        const entry = tarHeader(header)
        header = Buffer.alloc(0)
        entries++
        if (entries > CODEC_LIMITS.entries || names.has(entry.name)) fail('source archive has too many or duplicate members')
        names.add(entry.name)
        if (entry.type === '0' && entry.bytes > 0) {
          if (PAIRED_FILES.includes(entry.name)) pairedFiles.add(entry.name)
          for (const prefix of PAIRED_PREFIXES) if (entry.name.startsWith(prefix)) pairedPrefixes.add(prefix)
        }
        const kind = Object.keys(CORE_MEMBERS).find(key => CORE_MEMBERS[key] === entry.name)
        if (kind && (entry.type !== '0' || entry.bytes !== pins.core[kind].bytes)) fail(`invalid ${kind} asset member`)
        const notice = entry.type === '0' && entry.name.startsWith('notices/')
        const metadata = entry.type === '0' && entry.name === BUILD_METADATA
        if (notice) {
          noticeBytes += entry.bytes
          if (entry.bytes > CODEC_LIMITS.noticeFile || noticeBytes > CODEC_LIMITS.notices || notices.length >= 64) fail('notice files exceed their text limits')
        }
        if (metadata && entry.bytes > 64 * 1024) fail('codec build metadata is oversized')
        padding = (512 - entry.bytes % 512) % 512
        if (entry.bytes) active = { name: entry.name, remaining: entry.bytes, kind, notice, metadata, parts: [] }
        else if (kind) fail(`empty ${kind} asset member`)
      }
    }
  } finally {
    compressed.destroy()
    unzip.destroy()
  }
  if (active || padding || header.length || !footer || footerBytes < 1024 || total !== pins.tarBytes) fail('source archive is truncated or has the wrong expanded size')
  if (parsedArchiveBytes !== pins.archiveBytes || parsedArchiveHash.digest('hex') !== pins.archiveSha256) fail('source archive changed while it was being inspected')
  if (!found.js || !found.wasm) fail('paired archive is missing a pinned core asset')
  if (PAIRED_FILES.some(name => !pairedFiles.has(name)) || PAIRED_PREFIXES.some(prefix => !pairedPrefixes.has(prefix)) || !notices.length) fail('archive is missing paired source, recipe, notices or build evidence')
  if (found.wasm.length < 8 || !found.wasm.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) fail('selected core is not a WebAssembly v1 module')
  new TextDecoder('utf-8', { fatal: true }).decode(found.js)
  return { js: found.js, wasm: found.wasm, notices, buildLabel: found.buildLabel, buildMetadata: found.buildMetadata }
}

async function downloadArchive(url, filename, pins) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180000)
  let current = new URL(url)
  let response
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (current.protocol !== 'https:' || current.port || current.username || current.password || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(current.hostname)) fail('release download redirected outside official GitHub asset delivery')
      if (current.hostname === 'github.com' && current.pathname !== new URL(url).pathname) fail('release download changed its pinned project asset path')
      response = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/octet-stream' } })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location || redirects === 3) fail('release download has an invalid redirect chain')
      try { current = new URL(location, current) } catch { fail('release download returned an invalid redirect location') }
    }
    if (!response?.ok || !response.body) fail('pinned source archive could not be downloaded')
    const length = response.headers.get('content-length')
    if (length && (!/^\d+$/.test(length) || Number(length) !== pins.archiveBytes)) fail('release archive Content-Length differs from its reviewed size')
    const output = await open(filename, 'wx', 0o600)
    const hasher = createHash('sha256')
    let total = 0
    try {
      for await (const chunk of response.body) {
        total += chunk.length
        if (total > pins.archiveBytes) fail('release download exceeds its pinned size')
        hasher.update(chunk)
        await output.writeFile(chunk)
      }
    } finally { await output.close() }
    if (total !== pins.archiveBytes || hasher.digest('hex') !== pins.archiveSha256) fail('downloaded archive hash or size differs from its reviewed pins')
  } finally { clearTimeout(timeout); controller.abort() }
}

function provenance(mode, pins, archiveUrl, assets) {
  return {
    mode,
    ...(pins ? { archiveSha256: pins.archiveSha256, archiveBytes: pins.archiveBytes, tarBytes: pins.tarBytes } : {}),
    ...(archiveUrl ? { archiveUrl } : {}),
    ...(pins ? { core: pins.core } : {}),
    ...(assets ? { buildLabel: assets.buildLabel, buildMetadata: assets.buildMetadata, notices: assets.notices.map(notice => ({ member: notice.member, bytes: notice.content.length, sha256: digest(notice.content) })) } : {}),
  }
}

async function codecCacheDirectory(root) {
  // Cache identity is derived only from reviewed manifest pins. Never follow
  // cache-directory symlinks or accept an environment/URL cache override.
  let directory = root
  for (const component of ['node_modules', '.cache', 'filecompresser-codecs']) {
    directory = path.join(directory, component)
    try { await mkdir(directory, { mode: 0o700 }) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) fail('the codec cache must use real local directories, not symbolic links')
  }
  return directory
}

async function readCachedArchive(filename, pins) {
  try { await lstat(filename) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  try {
    // A cache hit is not trust: perform the same complete source/core/archive
    // verification used for a newly downloaded release on every reuse.
    return await readPairedCodecArchive(filename, pins)
  } catch (error) {
    fail(`cached pinned archive failed verification; remove or restore the corrupted cache explicitly. ${error instanceof Error ? error.message : 'Invalid cached archive.'}`)
  }
}

async function publishVerifiedArchive(filename, destination, pins, assets) {
  try {
    // Exclusive hard-link publication is atomic on this same filesystem. It
    // exposes a complete verified inode without replacing a racing cache file.
    await link(filename, destination)
    return assets
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const cached = await readCachedArchive(destination, pins)
    if (!cached) fail('the codec cache changed while a verified archive was being published')
    return cached
  }
}

/** Seed an offline checkout using bytes that still must match every release pin. */
export async function seedCodecReleaseCache(root, sourceFilename) {
  const manifest = await assertVerifiedCodecRelease(root)
  const directory = await codecCacheDirectory(root)
  const destination = path.join(directory, `${manifest.archiveSha256}.tar.gz`)
  const cached = await readCachedArchive(destination, manifest)
  if (!cached) {
    const temporary = await mkdtemp(path.join(directory, '.seed-'))
    try {
      const filename = path.join(temporary, ARCHIVE_NAME)
      await copyFile(sourceFilename, filename, constants.COPYFILE_EXCL)
      const assets = await readPairedCodecArchive(filename, manifest)
      await publishVerifiedArchive(filename, destination, manifest, assets)
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  return { filename: destination, archiveBytes: manifest.archiveBytes, archiveSha256: manifest.archiveSha256 }
}

/** Candidate overrides are internal QA arguments, never URLs/env bypasses. */
export async function resolveCodecCore(root = process.cwd(), options = {}) {
  const manifest = await readCodecReleaseManifest(root)
  if (options.candidateBundle) {
    if (isCodecDeploymentBuild()) fail('CI candidate bundles cannot be used for public deployment')
    const pins = validateCodecPins(options.candidateBundle.pins)
    const assets = await readPairedCodecArchive(options.candidateBundle.path, pins)
    return { ...assets, provenance: provenance('verified-ci-candidate', pins, undefined, assets) }
  }
  if (manifest.state === 'pending') {
    if (isCodecDeploymentBuild()) fail('public deployment is blocked until the paired core/source release is pinned')
    const directory = path.join(root, 'node_modules/@ffmpeg/core/dist/esm')
    const js = await readFile(path.join(directory, 'ffmpeg-core.js'))
    const wasm = await readFile(path.join(directory, 'ffmpeg-core.wasm'))
    console.log('Codec source release pending: using the installed development baseline. Public deployment remains blocked.')
    return { js, wasm, notices: [], provenance: { mode: 'development-baseline', core: {
      js: { bytes: js.length, sha256: digest(js) }, wasm: { bytes: wasm.length, sha256: digest(wasm) },
    } } }
  }
  const directory = await codecCacheDirectory(root)
  const destination = path.join(directory, `${manifest.archiveSha256}.tar.gz`)
  const cached = await readCachedArchive(destination, manifest)
  if (cached) return { ...cached, provenance: provenance('paired-release', manifest, manifest.archiveUrl, cached) }
  const temporary = await mkdtemp(path.join(directory, '.download-'))
  try {
    const filename = path.join(temporary, ARCHIVE_NAME)
    await downloadArchive(manifest.archiveUrl, filename, manifest)
    const assets = await readPairedCodecArchive(filename, manifest)
    const selected = await publishVerifiedArchive(filename, destination, manifest, assets)
    return { ...selected, provenance: provenance('paired-release', manifest, manifest.archiveUrl, selected) }
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

/** Recheck the bytes actually packaged, not just the preparation-time record. */
export function verifyExportedCodec(manifest, release, js, wasm, notice) {
  const selected = record(manifest.provenance, 'exported provenance')
  const core = record(selected.core, 'exported core pins')
  for (const [kind, bytes] of [['js', js], ['wasm', wasm]]) {
    if (core[kind]?.bytes !== bytes.length || core[kind]?.sha256 !== digest(bytes)) fail(`exported ${kind} asset differs from preparation-time pins`)
  }
  if (!notice || selected.noticeBytes !== notice.length || selected.noticeSha256 !== digest(notice)) fail('exported codec notice differs from preparation-time text')
  if (isCodecDeploymentBuild() && selected.mode !== 'paired-release') fail('public deployment cannot package a baseline or candidate codec')
  if (release.state === 'verified' && selected.mode === 'development-baseline') fail('a pinned source release cannot package the old development baseline')
  if (selected.mode === 'paired-release') {
    if (release.state !== 'verified' || selected.archiveUrl !== release.archiveUrl || selected.archiveSha256 !== release.archiveSha256 || selected.archiveBytes !== release.archiveBytes || selected.tarBytes !== release.tarBytes) fail('exported codec does not match the pinned source release')
    for (const kind of ['js', 'wasm']) if (core[kind].sha256 !== release.core[kind].sha256 || core[kind].bytes !== release.core[kind].bytes) fail(`exported ${kind} does not match the pinned release`)
  } else if (!['development-baseline', 'verified-ci-candidate'].includes(selected.mode)) fail('unknown exported codec mode')
  return selected
}

export function createCodecNotice(selected) {
  const record = selected.provenance
  if (record.mode === 'development-baseline') return Buffer.from('Development codec baseline only.\nA reviewed paired source/core release has not been pinned. Public deployment is blocked.\n')
  const header = [
    selected.buildLabel,
    `FFmpeg source commit: ${selected.buildMetadata.ffmpegSourceCommit}`,
    `FFmpeg source label: ${selected.buildMetadata.ffmpegSourceLabel} (${selected.buildMetadata.postTagCommitCount} commits after the base tag)`,
    `Build evidence: ${selected.buildMetadata.evidenceMethod}`,
    record.mode === 'paired-release' ? 'Released custom codec and corresponding-source archive.' : 'Verified CI candidate only; not approved for public deployment.',
    record.archiveUrl ? `Complete source, recipe, evidence and native assets: ${record.archiveUrl}` : 'Durable public source release: not configured for this CI candidate.',
    `Complete archive SHA-256: ${record.archiveSha256}`,
    `Core JavaScript SHA-256: ${record.core.js.sha256}`,
    `Core WebAssembly SHA-256: ${record.core.wasm.sha256}`,
    'The original notice/license texts from the verified archive follow. Their authors and terms remain their own.',
    '',
  ].join('\n')
  return Buffer.concat([Buffer.from(header), ...[...selected.notices].sort((a, b) => a.member.localeCompare(b.member)).flatMap(notice => [Buffer.from(`\n===== ${notice.member} =====\n`), notice.content, Buffer.from('\n')])])
}
