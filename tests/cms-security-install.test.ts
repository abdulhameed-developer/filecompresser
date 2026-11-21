import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { applyCmsSecurity, buildRuntimePatch, inventoryCmsDependencies, verifyAdminResourceBundle, verifyCmsSecurity } from '@/scripts/cms-security/install.mjs'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('../scripts/cms-security/manifest.json', import.meta.url), 'utf8'))
const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function temporary() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'cms-patch-install-'))
  directories.push(directory)
  return directory
}
function originals() {
  let root = process.env.FILECOMPRESSER_ZOD_TEST_ROOT
  if (!root) {
    try { root = path.dirname(require.resolve('zod/package.json')) } catch {
      throw Error('Exact Zod3 runtime bytes are required. Run setup:cms or explicitly select the source-derived proof fixture; final installed-Tina CI remains mandatory.')
    }
  }
  return new Map<string, Buffer>(Object.keys(manifest.originalFiles).map(relative => {
    const backup = path.join(root, 'filecompresser-security-original', relative)
    return [relative, readFileSync(existsSync(backup) ? backup : path.join(root, relative))]
  }))
}

describe('pinned CMS runtime installation', () => {
  it('reproduces every separately pinned patched file from authenticated originals without mutating them', () => {
    const source = originals()
    const before = new Map([...source].map(([name, bytes]) => [name, hash(bytes)]))
    const outputs = buildRuntimePatch(source)
    expect(outputs.size).toBe(6)
    for (const [name, bytes] of outputs) expect(hash(bytes)).toBe(manifest.patchedFiles[name].sha256)
    for (const [name, bytes] of source) expect(hash(bytes)).toBe(before.get(name))
  })

  it('rejects even a one-byte change to original runtime input', () => {
    const source = originals()
    const first = source.get('v3/types.js')!
    source.set('v3/types.js', Buffer.concat([first, Buffer.from('\n')]))
    expect(() => buildRuntimePatch(source)).toThrow('unrecognized bytes')
  })

  it('finds nested package copies and aliases by their real package name', () => {
    const root = temporary()
    for (const directory of ['node_modules/zod', 'node_modules/example/node_modules/zod', 'node_modules/validation-alias']) {
      mkdirSync(path.join(root, directory), { recursive: true })
      writeFileSync(path.join(root, directory, 'package.json'), JSON.stringify({ name: 'zod', version: '3.25.76' }))
    }
    writeFileSync(path.join(root, 'node_modules/example/package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }))
    expect(inventoryCmsDependencies(root).instances.map(instance => instance.nodePath).sort()).toEqual([
      'node_modules/example/node_modules/zod', 'node_modules/validation-alias', 'node_modules/zod',
    ])
  })

  it('refuses an unreviewed Zod version rather than silently patching another implementation', () => {
    const root = temporary()
    mkdirSync(path.join(root, 'node_modules/zod'), { recursive: true })
    writeFileSync(path.join(root, 'node_modules/zod/package.json'), JSON.stringify({ name: 'zod', version: '3.25.75' }))
    expect(() => inventoryCmsDependencies(root)).toThrow('unreviewed zod version')
  })

  it('never grants verified evidence for a deferred or absent CMS install', async () => {
    const root = temporary()
    expect(await applyCmsSecurity({ projectRoot: root, ifPresent: true })).toEqual({ skipped: true, reason: 'CMS dependencies have not been installed yet' })
    await expect(verifyCmsSecurity({ projectRoot: root })).rejects.toThrow('missing tinacms')
  })

  it('rejects missing or pre-patch admin output', () => {
    const root = temporary()
    expect(() => verifyAdminResourceBundle(root)).toThrow('absent')
    mkdirSync(path.join(root, 'public/admin'), { recursive: true })
    writeFileSync(path.join(root, 'public/admin/index.js'), 'console.log("unpatched admin")')
    expect(() => verifyAdminResourceBundle(root)).toThrow('does not contain')
  })
})
