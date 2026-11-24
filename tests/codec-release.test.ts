import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { CODEC_LIMITS, CORE_MEMBERS, assertVerifiedCodecRelease, createCodecNotice, readPairedCodecArchive, resolveCodecCore, seedCodecReleaseCache, validateCodecPins, validateCodecReleaseManifest, verifyExportedCodec } from '../scripts/codec-assets.mjs'
import { reviewedImageCodecFiles } from '../scripts/check-image-codecs.mjs'
import { assertNoExportedToken, packageSite } from '../scripts/package-site.mjs'

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const js = Buffer.from('export default function createFFmpegCore() {}\n')
const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])
const sourceUrl = 'https://github.com/abdulhameed-developer/filecompresser/releases/download/codec-v4-fixture/codec-source-and-new-core.tar.gz'
const buildMetadata = {
  buildLabel: 'FileCompresser minimal FFmpeg 5.1.10+19.b5d146d17cb4 (GPL-enabled, single-thread)',
  ffmpegVersion: '5.1.10', ffmpegSourceLabel: '5.1.10+19.b5d146d17cb4',
  ffmpegSourceCommit: 'b5d146d17cb45f3b00796dcf984897f1a0459945', postTagCommitCount: 19,
  evidenceMethod: 'Synthetic fixture for configure/header-derived metadata; not runtime evidence.',
  gplEnabled: true, sourcePinsSha256: hash(Buffer.from('synthetic source-pins fixture')),
}
const roots: string[] = []
type Entry = { name: string; data?: Buffer; type?: string; link?: string; declaredSize?: number }

beforeEach(() => { vi.stubEnv('CF_PAGES', ''); vi.stubEnv('NEXT_PUBLIC_ENABLE_INDEXING', 'false') })
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporary() {
  const root = await mkdtemp(path.join(tmpdir(), 'filecompresser-codec-test-'))
  roots.push(root)
  return root
}

// Synthetic test archives exercise container safety, not actual codec licensing.
function tar(entries: Entry[]) {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const bytes = entry.data ?? Buffer.alloc(0)
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100, 'utf8')
    header.write('0000644\0', 100, 'ascii')
    header.write('0000000\0', 108, 'ascii')
    header.write('0000000\0', 116, 'ascii')
    header.write(`${(entry.declaredSize ?? bytes.length).toString(8).padStart(11, '0')}\0`, 124, 'ascii')
    header.write('00000000000\0', 136, 'ascii')
    header.fill(32, 148, 156)
    header.write(entry.type ?? '0', 156, 'ascii')
    if (entry.link) header.write(entry.link, 157, 100, 'utf8')
    header.write('ustar\0', 257, 'ascii')
    header.write('00', 263, 'ascii')
    const checksum = header.reduce((total, byte) => total + byte, 0)
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii')
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)])
}

function pairedEntries(): Entry[] {
  const text = Buffer.from('Synthetic archive fixture.\n')
  return [
    { name: './', type: '5' },
    { name: `./${CORE_MEMBERS.js}`, data: js },
    { name: `./${CORE_MEMBERS.wasm}`, data: wasm },
    ...['source-pins.json', 'collection.json', 'READ-FIRST.txt', 'sdk-clang-resource-headers.tar.gz', 'official-toolchain-release-DEPS', 'official-sdk-release-mapping.json', 'source-archives/source.tar.gz', 'recipe/Dockerfile', 'evidence/result.json', 'build-metadata/ffmpeg-config.h', 'build-metadata/ffmpeg-config.mak', 'build-metadata/ffmpeg-version.h'].map(name => ({ name: `./${name}`, data: text })),
    { name: './notices/ORIGINAL-LICENSE.txt', data: Buffer.from('Original fixture notice and its author.\n') },
    { name: './build-metadata/codec-build.json', data: Buffer.from(JSON.stringify(buildMetadata)) },
  ]
}

async function bundle(entries = pairedEntries(), alterTar?: (value: Buffer) => Buffer) {
  const root = await temporary()
  const raw = alterTar ? alterTar(tar(entries)) : tar(entries)
  const compressed = gzipSync(raw)
  const filename = path.join(root, 'codec-source-and-new-core.tar.gz')
  await writeFile(filename, compressed)
  const pins = { archiveBytes: compressed.length, archiveSha256: hash(compressed), tarBytes: raw.length, core: {
    js: { member: CORE_MEMBERS.js, bytes: js.length, sha256: hash(js) },
    wasm: { member: CORE_MEMBERS.wasm, bytes: wasm.length, sha256: hash(wasm) },
  } }
  return { root, filename, compressed, pins }
}

async function configure(root: string, manifest: object) {
  await mkdir(path.join(root, 'scripts'), { recursive: true })
  await writeFile(path.join(root, 'scripts/codec-release.json'), JSON.stringify(manifest))
}

describe('pinned paired codec archive', () => {
  it('reads only the reviewed core bytes and preserves actual archived notice text', async () => {
    const fixture = await bundle()
    const selected = await readPairedCodecArchive(fixture.filename, fixture.pins)
    expect(selected.js).toEqual(js)
    expect(selected.wasm).toEqual(wasm)
    expect(selected.notices[0].content.toString()).toBe('Original fixture notice and its author.\n')
    expect(selected.buildLabel).toContain('5.1.10+19.b5d146d17cb4 (GPL-enabled, single-thread)')
    expect(selected.buildMetadata).toEqual(expect.objectContaining(buildMetadata))
    await expect(access(path.join(fixture.root, 'newly-built-core'))).rejects.toThrow()
  })

  it('preserves patched source identity and rejects a tag-only label for different source', async () => {
    const entries = pairedEntries().map(entry => entry.name.endsWith('codec-build.json') ? { ...entry, data: Buffer.from(JSON.stringify({ ...buildMetadata, buildLabel: 'FileCompresser minimal FFmpeg 5.1.10 (GPL-enabled, single-thread)' })) } : entry)
    const fixture = await bundle(entries)
    await expect(readPairedCodecArchive(fixture.filename, fixture.pins)).rejects.toThrow('build label differs from its source identity')
  })

  it('rejects whole-archive and individual-asset hash mismatches', async () => {
    const fixture = await bundle()
    await expect(readPairedCodecArchive(fixture.filename, { ...fixture.pins, archiveSha256: hash(Buffer.from('wrong')) })).rejects.toThrow('archive SHA-256')
    await expect(readPairedCodecArchive(fixture.filename, { ...fixture.pins, core: { ...fixture.pins.core, js: { ...fixture.pins.core.js, sha256: hash(Buffer.alloc(js.length)) } } })).rejects.toThrow('js asset hash')
  })

  it.each([
    { name: '../outside.txt', data: Buffer.from('unsafe') },
    { name: '/absolute.txt', data: Buffer.from('unsafe') },
    { name: 'source-archives/link', type: '2', link: '/outside' },
    { name: 'source-archives/hardlink', type: '1', link: '../outside' },
    { name: 'PaxHeader', type: 'x', data: Buffer.from('path=other') },
  ])('rejects unsafe or unsupported archive member $name', async entry => {
    const fixture = await bundle([...pairedEntries(), entry])
    await expect(readPairedCodecArchive(fixture.filename, fixture.pins)).rejects.toThrow(/unsafe path|link or unsupported/)
  })

  it('rejects duplicate assets, excessive members, unsupported sizes and malformed containers', async () => {
    const duplicate = await bundle([...pairedEntries(), { name: CORE_MEMBERS.js, data: js }])
    await expect(readPairedCodecArchive(duplicate.filename, duplicate.pins)).rejects.toThrow('duplicate members')
    const many = await bundle([...pairedEntries(), ...Array.from({ length: CODEC_LIMITS.entries }, (_, index) => ({ name: `extra/${index}`, data: Buffer.from('x') }))])
    await expect(readPairedCodecArchive(many.filename, many.pins)).rejects.toThrow('too many')
    const oversized = await bundle([{ name: 'oversized', declaredSize: CODEC_LIMITS.tar + 1 }])
    await expect(readPairedCodecArchive(oversized.filename, oversized.pins)).rejects.toThrow('invalid entry size')
    const badHeader = await bundle(pairedEntries(), value => { const changed = Buffer.from(value); changed[0] ^= 1; return changed })
    await expect(readPairedCodecArchive(badHeader.filename, badHeader.pins)).rejects.toThrow('header checksum')
    const afterEnd = await bundle(pairedEntries(), value => Buffer.concat([value, Buffer.alloc(512, 1)]))
    await expect(readPairedCodecArchive(afterEnd.filename, afterEnd.pins)).rejects.toThrow('after its end marker')
  })

  it('cannot mistake a core-only artifact for a complete paired source release', async () => {
    const fixture = await bundle(pairedEntries().filter(entry => entry.name.includes('newly-built-core')))
    await expect(readPairedCodecArchive(fixture.filename, fixture.pins)).rejects.toThrow('missing paired source')
  })

  it('accepts only bounded, aligned pins and fixed official project release URLs', async () => {
    const fixture = await bundle()
    expect(validateCodecReleaseManifest({ version: 1, state: 'pending' }).state).toBe('pending')
    expect(validateCodecReleaseManifest({ version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins }).state).toBe('verified')
    for (const url of [sourceUrl.replace('github.com', 'evil.example'), sourceUrl.replace('/filecompresser/', '/other/'), sourceUrl.replace('/codec-v4-fixture/', '/latest/'), sourceUrl.replace('https:', 'http:'), `${sourceUrl}?token=secret`]) {
      expect(() => validateCodecReleaseManifest({ version: 1, state: 'verified', archiveUrl: url, ...fixture.pins })).toThrow('exact HTTPS project release asset')
    }
    expect(() => validateCodecPins({ ...fixture.pins, tarBytes: fixture.pins.tarBytes + 1 })).toThrow('complete ustar blocks')
    expect(() => validateCodecPins({ ...fixture.pins, archiveBytes: CODEC_LIMITS.archive + 1 })).toThrow('size bound')
  })
})

describe('development, candidate and deployment separation', () => {
  it('retains an explicitly unverified development baseline even for an ordinary production-mode local build', async () => {
    const root = await temporary()
    await configure(root, { version: 1, state: 'pending' })
    const directory = path.join(root, 'node_modules/@ffmpeg/core/dist/esm')
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, 'ffmpeg-core.js'), js)
    await writeFile(path.join(directory, 'ffmpeg-core.wasm'), wasm)
    vi.stubEnv('NODE_ENV', 'production')
    const selected = await resolveCodecCore(root)
    expect(selected.provenance.mode).toBe('development-baseline')
    expect(createCodecNotice(selected).toString()).toContain('Public deployment is blocked')
  })

  it('allows an explicit verified CI candidate but blocks it and the baseline for real deployment', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'pending' })
    const selected = await resolveCodecCore(fixture.root, { candidateBundle: { path: fixture.filename, pins: fixture.pins } })
    expect(selected.provenance.mode).toBe('verified-ci-candidate')
    const notice = createCodecNotice(selected).toString()
    expect(notice).toContain('Original fixture notice and its author.')
    expect(notice).toContain(fixture.pins.archiveSha256)
    expect(notice).toContain('not approved for public deployment')
    await expect(assertVerifiedCodecRelease(fixture.root)).rejects.toThrow('public deployment is blocked')
    vi.stubEnv('CF_PAGES', '1')
    await expect(resolveCodecCore(fixture.root, { candidateBundle: { path: fixture.filename, pins: fixture.pins } })).rejects.toThrow('cannot be used for public deployment')
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow('public deployment is blocked')
    vi.stubEnv('CF_PAGES', '')
    vi.stubEnv('NEXT_PUBLIC_ENABLE_INDEXING', 'true')
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow('public deployment is blocked')
  })

  it('downloads only its pinned release and does not fall back when fetching fails', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    const fetcher = vi.fn().mockRejectedValue(new Error('Network unavailable'))
    vi.stubGlobal('fetch', fetcher)
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow('Network unavailable')
    fetcher.mockResolvedValue(new Response(Buffer.alloc(fixture.compressed.length), { headers: { 'Content-Length': String(fixture.compressed.length) } }))
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow('downloaded archive hash')
    fetcher.mockResolvedValue(new Response(fixture.compressed, { headers: { 'Content-Length': String(fixture.compressed.length) } }))
    const selected = await resolveCodecCore(fixture.root)
    expect(selected.js).toEqual(js)
    expect(selected.provenance.mode).toBe('paired-release')
    expect('archiveUrl' in selected.provenance && selected.provenance.archiveUrl).toBe(sourceUrl)
  })

  it('verifies a complete source pair across small streamed download and tar chunks', async () => {
    const fixture = await bundle([...pairedEntries(), { name: './source-archives/stream-boundary-fixture.bin', data: randomBytes(256 * 1024) }])
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    let offset = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === fixture.compressed.length) { controller.close(); return }
        const end = Math.min(offset + 137, fixture.compressed.length)
        controller.enqueue(fixture.compressed.subarray(offset, end))
        offset = end
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'Content-Length': String(fixture.compressed.length) } })))
    const selected = await resolveCodecCore(fixture.root)
    expect(selected.js).toEqual(js)
    expect(selected.wasm).toEqual(wasm)
    expect('buildMetadata' in selected && selected.buildMetadata?.ffmpegSourceLabel).toBe(buildMetadata.ffmpegSourceLabel)
    expect(createCodecNotice(selected).toString()).toContain(buildMetadata.ffmpegSourceCommit)
    expect(Object.keys(selected).sort()).toEqual(['buildLabel', 'buildMetadata', 'js', 'notices', 'provenance', 'wasm'])
  })

  it('rejects redirects outside GitHub asset delivery before contacting that destination', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://evil.example/archive' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow('outside official GitHub')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rechecks packaged assets and notices against the exact configured release', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'pending' })
    const candidate = await resolveCodecCore(fixture.root, { candidateBundle: { path: fixture.filename, pins: fixture.pins } })
    const selected = { ...candidate, provenance: { ...candidate.provenance, mode: 'paired-release', archiveUrl: sourceUrl } }
    const notice = createCodecNotice(selected)
    const manifest = { provenance: { ...selected.provenance, noticeBytes: notice.length, noticeSha256: hash(notice) } }
    const release = validateCodecReleaseManifest({ version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    expect(verifyExportedCodec(manifest, release, js, wasm, notice).mode).toBe('paired-release')
    expect(() => verifyExportedCodec(manifest, release, Buffer.from('changed'), wasm, notice)).toThrow('exported js')
    expect(() => verifyExportedCodec(manifest, release, js, wasm, Buffer.from('changed notice'))).toThrow('exported codec notice')
    expect(() => verifyExportedCodec(manifest, { version: 1, state: 'pending' }, js, wasm, notice)).toThrow('pinned source release')
  })
})

describe('verified local paired-release cache', () => {
  const cacheDirectory = (root: string) => path.join(root, 'node_modules/.cache/filecompresser-codecs')

  it('downloads once, publishes only verified bytes, then reuses the complete pair without networking', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    const fetcher = vi.fn().mockImplementation(async () => new Response(fixture.compressed))
    vi.stubGlobal('fetch', fetcher)
    const downloaded = await resolveCodecCore(fixture.root)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const expectedName = `${fixture.pins.archiveSha256}.tar.gz`
    expect(await readdir(cacheDirectory(fixture.root))).toEqual([expectedName])
    expect(await readFile(path.join(cacheDirectory(fixture.root), expectedName))).toEqual(fixture.compressed)
    fetcher.mockRejectedValue(new Error('Offline'))
    const cached = await resolveCodecCore(fixture.root)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(cached.js).toEqual(downloaded.js)
    expect(cached.wasm).toEqual(downloaded.wasm)
    expect(cached.provenance).toEqual(downloaded.provenance)
    expect(cached.provenance.mode).toBe('paired-release')
    expect('archiveUrl' in cached.provenance && cached.provenance.archiveUrl).toBe(sourceUrl)
  })

  it('can seed a verified offline archive without weakening production provenance', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    const fetcher = vi.fn().mockRejectedValue(new Error('No network permitted'))
    vi.stubGlobal('fetch', fetcher)
    const seeded = await seedCodecReleaseCache(fixture.root, fixture.filename)
    expect(seeded.archiveSha256).toBe(fixture.pins.archiveSha256)
    expect(seeded.archiveBytes).toBe(fixture.pins.archiveBytes)
    expect(await readFile(seeded.filename)).toEqual(fixture.compressed)
    vi.stubEnv('CF_PAGES', '1')
    const selected = await resolveCodecCore(fixture.root)
    expect(selected.provenance.mode).toBe('paired-release')
    expect(selected.js).toEqual(js)
    expect(selected.buildMetadata).toEqual(expect.objectContaining(buildMetadata))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails explicitly for a same-size corrupted cache without downloading or replacing it', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    const seeded = await seedCodecReleaseCache(fixture.root, fixture.filename)
    const changed = Buffer.from(fixture.compressed)
    changed[0] ^= 1
    await writeFile(seeded.filename, changed)
    const fetcher = vi.fn().mockResolvedValue(new Response(fixture.compressed))
    vi.stubGlobal('fetch', fetcher)
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow(/cached pinned archive failed verification.*archive SHA-256/)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await readFile(seeded.filename)).toEqual(changed)
  })

  it('rechecks inner assets on cache hits, not only the archive filename and outer hash', async () => {
    const fixture = await bundle()
    const pins = { ...fixture.pins, core: { ...fixture.pins.core, js: { ...fixture.pins.core.js, sha256: hash(Buffer.alloc(js.length)) } } }
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...pins })
    await mkdir(cacheDirectory(fixture.root), { recursive: true })
    await writeFile(path.join(cacheDirectory(fixture.root), `${pins.archiveSha256}.tar.gz`), fixture.compressed)
    const fetcher = vi.fn().mockRejectedValue(new Error('Offline'))
    vi.stubGlobal('fetch', fetcher)
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow(/cached pinned archive failed verification.*js asset hash/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not leave a cache entry or temporary archive after failed download or seeding', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.alloc(fixture.compressed.length))))
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow('downloaded archive hash')
    expect(await readdir(cacheDirectory(fixture.root))).toEqual([])
    await writeFile(fixture.filename, Buffer.alloc(fixture.compressed.length))
    await expect(seedCodecReleaseCache(fixture.root, fixture.filename)).rejects.toThrow('archive SHA-256')
    expect(await readdir(cacheDirectory(fixture.root))).toEqual([])
  })

  it('atomically handles concurrent verified downloads without exposing partial cache files', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(fixture.compressed)))
    const [first, second] = await Promise.all([resolveCodecCore(fixture.root), resolveCodecCore(fixture.root)])
    expect(first.provenance).toEqual(second.provenance)
    expect(await readdir(cacheDirectory(fixture.root))).toEqual([`${fixture.pins.archiveSha256}.tar.gz`])
    expect(await readFile(path.join(cacheDirectory(fixture.root), `${fixture.pins.archiveSha256}.tar.gz`))).toEqual(fixture.compressed)
  })

  it('rejects symlinked cache entries and directories instead of following them', async () => {
    const fixture = await bundle()
    await configure(fixture.root, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    await mkdir(cacheDirectory(fixture.root), { recursive: true })
    const filename = path.join(cacheDirectory(fixture.root), `${fixture.pins.archiveSha256}.tar.gz`)
    await symlink(fixture.filename, filename)
    const fetcher = vi.fn().mockRejectedValue(new Error('Offline'))
    vi.stubGlobal('fetch', fetcher)
    await expect(resolveCodecCore(fixture.root)).rejects.toThrow(/cached pinned archive failed verification.*regular file/)
    const other = await temporary()
    await configure(other, { version: 1, state: 'verified', archiveUrl: sourceUrl, ...fixture.pins })
    await mkdir(path.join(other, 'node_modules'))
    const outside = await temporary()
    await symlink(outside, path.join(other, 'node_modules/.cache'))
    await expect(resolveCodecCore(other)).rejects.toThrow('real local directories')
    expect(await readdir(outside)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('exported CMS credential guard', () => {
  it('fails for the exact active build token without revealing it in the error', () => {
    const canary = ['fixture', 'build', 'token', 'keep', 'private'].join('-')
    let message = ''
    try { assertNoExportedToken(Buffer.from(`const credential = '${canary}'`), `assets/${canary}.js`, canary) } catch (error) { message = (error as Error).message }
    expect(message).toContain('build credential')
    expect(message).not.toContain(canary)
    expect(() => assertNoExportedToken(Buffer.from('Public client ID only'), 'admin/assets/app.js', canary)).not.toThrow()
  })

  it('rejects credential canaries in script and binary publish assets before writing a release record', async () => {
    const root = await temporary()
    await configure(root, { version: 1, state: 'pending' })
    const core = { js: { bytes: js.length, sha256: hash(js) }, wasm: { bytes: wasm.length, sha256: hash(wasm) } }
    const baseline = { notices: [], provenance: { mode: 'development-baseline', core } }
    const notice = createCodecNotice(baseline)
    const chunk = `ffmpeg-core-${hash(wasm)}.part.wasm`
    const manifest = { version: 1, size: wasm.length, sha256: hash(wasm), chunks: [{ file: chunk, size: wasm.length, sha256: hash(wasm) }], provenance: { ...baseline.provenance, noticeBytes: notice.length, noticeSha256: hash(notice) } }
    const files: Record<string, Buffer> = {
      'THIRD-PARTY-NOTICES.txt': Buffer.concat([Buffer.from('Synthetic aggregate notice fixture\n'), notice]),
      'index.html': Buffer.from('<h1>Test export</h1>'), '404.html': Buffer.from('Missing'), '_headers': Buffer.from('/*\n'),
      'ffmpeg-core/wasm-manifest.json': Buffer.from(JSON.stringify(manifest)), 'ffmpeg-core/ffmpeg-core.js': js,
      [`ffmpeg-core/${chunk}`]: wasm, 'ffmpeg-core/worker.js': Buffer.from(''), 'ffmpeg-core/NOTICE.txt': notice,
      'admin/assets/app.js': Buffer.from('const credential="fixture-production-read-token"'),
    }
    const imageFiles = reviewedImageCodecFiles.map(entry => {
      const bytes = Buffer.from(`Synthetic image asset fixture: ${entry.file}\n`)
      files[`image-worker/${entry.file}`] = bytes
      return { ...entry, bytes: bytes.length, sha256: hash(bytes) }
    })
    files['image-worker/codec-manifest.json'] = Buffer.from(JSON.stringify({ version: 1, files: imageFiles }))
    for (const [filename, bytes] of Object.entries(files)) {
      const target = path.join(root, 'out', filename)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes)
    }
    vi.stubEnv('TINA_TOKEN', 'fixture-production-read-token')
    await writeFile(path.join(root, 'out/THIRD-PARTY-NOTICES.txt'), 'Stale aggregate that omits the current native source notice.')
    await expect(packageSite(root)).rejects.toThrow('omit the current codec notice')
    await writeFile(path.join(root, 'out/THIRD-PARTY-NOTICES.txt'), files['THIRD-PARTY-NOTICES.txt'])
    await expect(packageSite(root)).rejects.toThrow('admin/assets/app.js')
    await expect(readFile(path.join(root, 'out/release.json'))).rejects.toThrow()
    await rm(path.join(root, 'out/admin/assets/app.js'))
    // A binary publish asset with invalid UTF-8 must receive the same check.
    const binary = path.join(root, 'out/admin/assets/opaque.dat')
    await writeFile(binary, Buffer.concat([Buffer.from([0xff, 0, 0x81]), Buffer.from('fixture-production-read-token'), Buffer.from([0, 0xff])]))
    await expect(packageSite(root)).rejects.toThrow('admin/assets/opaque.dat')
    await expect(readFile(path.join(root, 'out/release.json'))).rejects.toThrow()
    await writeFile(binary, Buffer.from([0xff, 0, 0x81, 0, 0xff]))
    await mkdir(path.join(root, 'public/admin/assets'), { recursive: true })
    await writeFile(path.join(root, 'public/admin/assets/app.js'), files['admin/assets/app.js'])
    await expect(packageSite(root)).rejects.toThrow('public/admin/assets/app.js')
    await writeFile(path.join(root, 'public/admin/assets/app.js'), 'const publicClientId="safe"')
    vi.stubEnv('GITHUB_SHA', '')
    vi.stubEnv('CF_PAGES_COMMIT_SHA', 'b'.repeat(40))
    expect((await packageSite(root)).sha).toBe('b'.repeat(40))
    vi.stubEnv('GITHUB_SHA', 'fixture-production-read-token')
    await expect(packageSite(root)).rejects.toThrow('release.json')
    expect(await readFile(path.join(root, 'out/release.json'), 'utf8')).not.toContain('fixture-production-read-token')
    vi.stubEnv('GITHUB_SHA', 'a'.repeat(40))
    expect((await packageSite(root)).sha).toBe('a'.repeat(40))
  })
})
