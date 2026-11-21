import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { collectThirdPartyNotices, NOTICE_LIMITS } from '../scripts/collect-third-party-notices.mjs'

type LockedPackage = { name?: string; version?: string; resolved?: string; integrity?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
const roots: string[] = []
const original = Buffer.from('Synthetic original copyright (c) Fixture Author.\r\nPermission and original terms stay here.\r\n')
const native = Buffer.from('Synthetic native notice.\nCorresponding source: https://example.test/fixed-source.tar.gz\nArchive SHA-256: fixture only.\n')

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function temporary() {
  const root = await mkdtemp(path.join(tmpdir(), 'filecompresser-notices-test-'))
  roots.push(root)
  return root
}
async function put(root: string, relative: string, bytes: string | Buffer) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
  await writeFile(path.join(root, relative), bytes)
}
async function install(root: string, key: string, version: string, notice: Buffer | null = original) {
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)
  await put(root, `${key}/package.json`, JSON.stringify({ name, version, license: 'MIT' }))
  if (notice) await put(root, `${key}/LICENSE`, notice)
}
async function configure(root: string, packages: Record<string, LockedPackage>) {
  await put(root, 'package-lock.json', JSON.stringify({ lockfileVersion: 3, packages }))
  await put(root, 'public/ffmpeg-core/NOTICE.txt', native)
}
async function basic() {
  const root = await temporary()
  await install(root, 'node_modules/react', '18.3.1')
  const packages: Record<string, LockedPackage> = { '': { dependencies: { react: '18.3.1' } }, 'node_modules/react': { version: '18.3.1' } }
  await configure(root, packages)
  return { root, packages }
}
async function aliasFixture(alias = 'legacy-parser', target = 'actual-parser') {
  const { root, packages } = await basic()
  const key = `node_modules/${alias}`
  const license = Buffer.from(`Original ${target} author copyright.\r\nThe original alias target license terms remain unchanged.\r\n`)
  packages[''].dependencies![alias] = `npm:${target}@^1.2.0`
  packages[key] = { name: target, version: '1.2.3' }
  await install(root, key, '1.2.3', license)
  await put(root, `${key}/package.json`, JSON.stringify({ name: target, version: '1.2.3', license: 'MIT' }))
  await configure(root, packages)
  return { root, packages, key, alias, target, license }
}

describe('bounded original third-party notice inventory', () => {
  it('reproducibly preserves exact original texts from nested runtime, Next and Tina bundles', async () => {
    const { root, packages } = await basic()
    packages[''].dependencies!.next = '16.4.5'
    packages[''].devDependencies = { tinacms: '3.15.2' }
    packages['node_modules/react'].dependencies = { shared: '1.0.0' }
    packages['node_modules/next'] = { version: '16.4.5', dependencies: { shared: '2.0.0' }, optionalDependencies: { 'absent-platform': '1.0.0' } }
    packages['node_modules/shared'] = { version: '1.0.0' }
    packages['node_modules/next/node_modules/shared'] = { version: '2.0.0' }
    packages['node_modules/absent-platform'] = { version: '1.0.0' }
    packages['node_modules/tinacms'] = { version: '3.15.2' }
    for (const [key, entry] of Object.entries(packages)) if (key && key !== 'node_modules/absent-platform') await install(root, key, entry.version!)
    const nextNotice = Buffer.from('Synthetic Next compiled contributor notice.\n')
    const tinaNotice = Buffer.from('Synthetic Tina bundled contributor notice.\n')
    await put(root, 'node_modules/next/dist/compiled/vendor/LICENSE', nextNotice)
    await put(root, 'node_modules/tinacms/dist/assets/editor.js.LICENSE.txt', tinaNotice)
    await put(root, 'public/admin/assets/editor.js.LICENSE.txt', tinaNotice)
    await put(root, 'node_modules/shared/CopyrightNotice.txt', 'Synthetic additional author attribution.\n')
    await put(root, 'node_modules/shared/licenses/vendor.txt', 'Synthetic contributor terms inside a plural licenses directory.\n')
    await put(root, 'node_modules/shared/notices/additional.txt', 'Synthetic attribution inside a plural notices directory.\n')
    await put(root, 'node_modules/react/README.md', 'Private-looking README sentinel that is outside the notice scope.')
    await put(root, 'node_modules/next/dist/compiled/vendor/index.js', 'Unselected JavaScript sentinel.')
    await configure(root, packages)
    const first = await collectThirdPartyNotices(root)
    const bytes = await readFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'))
    expect(bytes.includes(original)).toBe(true)
    expect(bytes.includes(native)).toBe(true)
    expect(bytes.includes(nextNotice)).toBe(true)
    expect(bytes.includes(tinaNotice)).toBe(true)
    expect(bytes.toString()).toContain('node_modules/next/node_modules/shared')
    expect(bytes.toString()).toContain('additional author attribution')
    expect(bytes.toString()).toContain('contributor terms inside a plural licenses directory')
    expect(bytes.toString()).toContain('attribution inside a plural notices directory')
    expect(bytes.toString()).not.toContain('README sentinel')
    expect(bytes.toString()).not.toContain('JavaScript sentinel')
    expect(bytes.toString()).not.toContain(root)
    expect(bytes.toString()).toContain('not a determination that every listed package is shipped')
    expect(first.absentPackages).toBe(1)
    expect(await collectThirdPartyNotices(root)).toEqual(first)
    expect(await readFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'))).toEqual(bytes)
  })

  it('uses only the reviewed version-specific original FFmpeg wrapper fallback', async () => {
    const { root, packages } = await basic()
    packages[''].dependencies!['@ffmpeg/ffmpeg'] = '0.12.15'
    packages['node_modules/@ffmpeg/ffmpeg'] = {"version": "0.12.15", "resolved": "https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz", "integrity": "sha512-1C8Obr4GsN3xw+/1Ww6PFM84wSQAGsdoTuTWPOj2OizsRDLT4CXTaVjPhkw6ARyDus1B9X/L2LiXHqYYsGnRFw=="}
    await install(root, 'node_modules/@ffmpeg/ffmpeg', '0.12.15', null)
    await configure(root, packages)
    await collectThirdPartyNotices(root)
    const content = await readFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'), 'utf8')
    expect(content).toContain('Copyright (c) 2019 Jerome Wu')
    expect(content).toContain('71aa99d37c02a7b4c435275ca9ef50e612f6efa1/LICENSE')
    expect(content).toContain('original upstream LICENSE omitted from this npm package')
    packages['node_modules/@ffmpeg/ffmpeg'].integrity = 'synthetic-unreviewed-package-identity'
    await configure(root, packages)
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('fallback does not cover')
    packages['node_modules/@ffmpeg/ffmpeg'].version = '0.12.16'
    await install(root, 'node_modules/@ffmpeg/ffmpeg', '0.12.16', null)
    await configure(root, packages)
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('fallback does not cover')
  })

  it('adds exact reviewed musl text only for the matching published core/source identity', async () => {
    const { root } = await basic()
    const provenance = {
      mode: 'paired-release',
      archiveSha256: '6d3326d6e2456fdf7973ac7ab1d83620a41a99acc5b65b316d139ffbfc148818',
      core: { js: { sha256: 'cea5a18a8ef99258fa2299b8feb57ca641c0222e88de077fd0562b4eeef7bfed' }, wasm: { sha256: '584febef0d37a76379d5c2c53539250e78c250e2c5f2710493301ea55198d5ab' } },
      buildMetadata: { sourcePinsSha256: 'e25ff55c61088a636a5703a40eb3ea6a222cf2b5957477df0a75129f75809d75' },
    }
    await put(root, 'public/ffmpeg-core/wasm-manifest.json', JSON.stringify({ provenance }))
    await collectThirdPartyNotices(root)
    const aggregate = await readFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'))
    const start = aggregate.indexOf(Buffer.from('musl as a whole is licensed under the following standard MIT license:'))
    expect(start).toBeGreaterThan(0)
    expect(createHash('sha256').update(aggregate.subarray(start, start + 6204)).digest('hex')).toBe('f9bc4423732350eb0b3f7ed7e91d530298476f8fec0c6c427a1c04ade22655af')
    expect(await readFile(path.join(root, 'public/ffmpeg-core/NOTICE.txt'))).toEqual(native)
    provenance.core.js.sha256 = '0'.repeat(64)
    await put(root, 'public/ffmpeg-core/wasm-manifest.json', JSON.stringify({ provenance }))
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('does not match the prepared codec/source identity')
  })

  it('fails missing direct shipped notices but reports ancillary omissions honestly', async () => {
    const { root, packages } = await basic()
    packages['node_modules/react'].dependencies = { support: '1.0.0' }
    packages['node_modules/support'] = { version: '1.0.0' }
    await install(root, 'node_modules/support', '1.0.0', null)
    await configure(root, packages)
    expect((await collectThirdPartyNotices(root)).missingNotices).toBe(1)
    expect(await readFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'), 'utf8')).toContain('node_modules/support@1.0.0')
    await rm(path.join(root, 'node_modules/react/LICENSE'))
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('required shipped root has no packaged license text')
  })

  it('rejects a notice symlink before reading material outside its known package root', async () => {
    const { root } = await basic()
    const outside = await temporary()
    await put(outside, 'private.txt', 'A private sentinel must never enter generated notices.')
    await rm(path.join(root, 'node_modules/react/LICENSE'))
    await symlink(path.join(outside, 'private.txt'), path.join(root, 'node_modules/react/LICENSE'))
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('symbolic links are not allowed')
    await expect(readFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'))).rejects.toThrow()
  })

  it('refuses a generated-output symlink without overwriting its outside target', async () => {
    const { root } = await basic()
    const outside = await temporary()
    await put(outside, 'keep.txt', 'Original outside contents stay unchanged.')
    await symlink(path.join(outside, 'keep.txt'), path.join(root, 'public/THIRD-PARTY-NOTICES.txt'))
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('symbolic links are not allowed')
    expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('Original outside contents stay unchanged.')
  })

  it('rejects changed package identities, traversal names and oversized notice input', async () => {
    const { root, packages } = await basic()
    await install(root, 'node_modules/react', '18.3.2')
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('installed identity differs')
    await install(root, 'node_modules/react', '18.3.1', Buffer.alloc(NOTICE_LIMITS.file + 1, 65))
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('oversized notice input')
    packages[''].dependencies = { '../outside': '1.0.0' }
    await configure(root, packages)
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('invalid locked dependency name')
  })

  it.each([
    ['legacy-parser', 'actual-parser'],
    ['@compat/parser', '@vendor/parser'],
  ])('preserves original LICENSE bytes for explicitly locked npm alias %s -> %s', async (alias, target) => {
    const { root, key, license } = await aliasFixture(alias, target)
    const result = await collectThirdPartyNotices(root)
    expect(result.installedPackages).toBe(2)
    expect((await readFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'))).includes(license)).toBe(true)
    expect(await readFile(path.join(root, `${key}/LICENSE`))).toEqual(license)
  })

  it.each([
    { scenario: 'missing lock target', error: /installed identity differs/ },
    { scenario: 'empty lock target', error: /invalid locked alias target/ },
    { scenario: 'mismatched lock target', error: /installed identity differs/ },
    { scenario: 'missing npm alias declaration', error: /locked alias has no matching npm declaration/ },
    { scenario: 'mismatched declaration target', error: /locked alias has no matching npm declaration/ },
  ])('rejects aliases with $scenario', async ({ scenario, error }) => {
    const { root, packages, key, alias } = await aliasFixture()
    if (scenario === 'missing lock target') delete packages[key].name
    if (scenario === 'empty lock target') packages[key].name = ''
    if (scenario === 'mismatched lock target') {
      packages[key].name = 'unrelated-parser'
      packages[''].dependencies![alias] = 'npm:unrelated-parser@^1.2.0'
    }
    if (scenario === 'missing npm alias declaration') packages[''].dependencies![alias] = '^1.2.0'
    if (scenario === 'mismatched declaration target') packages[''].dependencies![alias] = 'npm:unrelated-parser@^1.2.0'
    await configure(root, packages)
    await expect(collectThirdPartyNotices(root)).rejects.toThrow(error)
  })

  it('does not authorize an outer alias using a declaration that resolves to a different nested package', async () => {
    const { root, packages, key, alias, target } = await aliasFixture()
    packages[''].dependencies![alias] = '^1.2.0'
    packages[''].dependencies!.unrelated = '1.0.0'
    const nested = `node_modules/unrelated/node_modules/${alias}`
    packages['node_modules/unrelated'] = { version: '1.0.0', dependencies: { [alias]: `npm:${target}@^1.2.0` } }
    packages[nested] = { name: target, version: '1.2.3' }
    await install(root, 'node_modules/unrelated', '1.0.0')
    await install(root, nested, '1.2.3')
    await put(root, `${nested}/package.json`, JSON.stringify({ name: target, version: '1.2.3', license: 'MIT' }))
    await configure(root, packages)
    await expect(collectThirdPartyNotices(root)).rejects.toThrow(`locked alias has no matching npm declaration: ${key}`)
  })

  it('rejects installed version drift even when both alias target identities and the declaration match', async () => {
    const { root, key, target } = await aliasFixture()
    await put(root, `${key}/package.json`, JSON.stringify({ name: target, version: '1.2.4', license: 'MIT' }))
    await expect(collectThirdPartyNotices(root)).rejects.toThrow('installed identity differs')
  })
})
