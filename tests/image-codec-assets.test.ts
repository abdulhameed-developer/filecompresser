import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { checkImageCodecs, checkImageCodecDelivery, reviewedImageCodecFiles, validateImageCodecManifest } from '../scripts/check-image-codecs.mjs'
import { createStaticHandler } from '../scripts/serve-static.mjs'
import { prepareImageCodecs } from '../scripts/prepare-image-codecs.mjs'

const temporaryDirectories: string[] = []
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const requestURL = (input: Parameters<typeof fetch>[0]) => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'filecompresser-images-'))
  temporaryDirectories.push(root)
  const directory = path.join(root, 'image-worker')
  const files: { file: string; package?: string; bytes: number; sha256: string }[] = []
  for (const entry of reviewedImageCodecFiles) {
    const bytes = Buffer.from(`Synthetic fixture: ${entry.file}\n`)
    const filename = path.join(directory, entry.file)
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, bytes)
    files.push({ ...entry, bytes: bytes.length, sha256: hash(bytes) })
  }
  const manifest = { version: 1, files }
  await writeFile(path.join(directory, 'codec-manifest.json'), JSON.stringify(manifest))
  return { root, directory, manifest }
}

describe('reviewed static image codec assets', () => {
  it('prepares the real pinned browser quantizer with its upstream and bundled dependency licenses', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'filecompresser-codec-preparation-'))
    temporaryDirectories.push(directory)
    expect((await prepareImageCodecs(process.cwd(), directory)).files).toBe(20)
    const manifest = await checkImageCodecs(directory)
    const quantizer = manifest.files.find((entry: { file: string }) => entry.file === 'codecs/upng/UPNG.js')!
    expect(quantizer.sha256).toBe('911872ae298adadf47d9ae29f21441e6a5c823f6e550445da5bb2a03840239c2')
    expect(await readFile(path.join(directory, 'codecs/upng/LICENSE'), 'utf8')).toContain('MIT License')
    expect(await readFile(path.join(directory, 'codecs/upng/pako.LICENSE'), 'utf8')).toContain('MIT License')
    expect(await readFile(path.join(directory, 'codecs/upng/pako.ZLIB.LICENSE'), 'utf8')).toContain('zlib license')
    const packagedBuildLock = await readFile('node_modules/@pdf-lib/upng/yarn.lock', 'utf8')
    expect(packagedBuildLock).toMatch(/pako@\^1\.0\.10:\s+version "1\.0\.11"/)
  })

  it('requires the module worker, both codec engines and their license files', async () => {
    const { directory, manifest } = await fixture()
    expect(await checkImageCodecs(directory)).toEqual(manifest)
    expect(manifest.files).toHaveLength(20)
    for (const file of ['image-engine.mjs', 'image-png.mjs', 'codecs/upng/UPNG.js', 'codecs/upng/LICENSE', 'codecs/upng/pako.LICENSE', 'codecs/upng/pako.ZLIB.LICENSE', 'codecs/jpeg/codec/enc/mozjpeg_enc.wasm', 'codecs/oxipng/codec/pkg/squoosh_oxipng_bg.wasm', 'codecs/jpeg/codec/LICENSE.codec.md'])
      expect(manifest.files.some(entry => entry.file === file)).toBe(true)
  })

  it('rejects same-length corruption and incorrect byte lengths', async () => {
    const { directory, manifest } = await fixture()
    const entry = manifest.files.find(entry => entry.file === 'image-engine.mjs')!
    await writeFile(path.join(directory, entry.file), Buffer.alloc(entry.bytes, 1))
    await expect(checkImageCodecs(directory)).rejects.toThrow('integrity mismatch')
    await writeFile(path.join(directory, entry.file), 'short')
    await expect(checkImageCodecs(directory)).rejects.toThrow('size mismatch')
  })

  it('rejects absent modules, unreviewed legacy engines and symbolic links', async () => {
    const { root, directory } = await fixture()
    const worker = path.join(directory, 'image-engine.mjs')
    const bytes = await readFile(worker)
    await rm(worker)
    await expect(checkImageCodecs(directory)).rejects.toThrow()
    await writeFile(worker, bytes)
    const legacy = path.join(directory, 'browser-image-compression.js')
    await writeFile(legacy, 'legacy')
    await expect(checkImageCodecs(directory)).rejects.toThrow('Unreviewed image codec asset')
    await rm(legacy)
    await writeFile(path.join(root, 'outside.mjs'), bytes)
    await rm(worker)
    await symlink(path.join(root, 'outside.mjs'), worker)
    await expect(checkImageCodecs(directory)).rejects.toThrow('Symbolic link')
  })

  it('rejects traversal, duplicate entries, missing required assets and wrong package pins', async () => {
    const { manifest } = await fixture()
    for (const replacement of ['../../outside.js', 'https://example.com/engine.js', 'codecs\\jpeg\\encode.js']) {
      const changed = structuredClone(manifest)
      changed.files[0].file = replacement
      expect(() => validateImageCodecManifest(changed)).toThrow('unreviewed')
    }
    const duplicate = structuredClone(manifest)
    duplicate.files[1] = duplicate.files[0]
    expect(() => validateImageCodecManifest(duplicate)).toThrow('duplicate')
    expect(() => validateImageCodecManifest({ ...manifest, files: manifest.files.slice(1) })).toThrow('inventory')
    const changedPackage = structuredClone(manifest)
    changedPackage.files[0].package = '@jsquash/jpeg@0.0.0'
    expect(() => validateImageCodecManifest(changedPackage)).toThrow('unreviewed')
  })

  it('checks the actual preview delivery of every module, WASM and license against its manifest', async () => {
    const { root, manifest } = await fixture()
    await writeFile(path.join(root, '_headers'), await readFile('public/_headers'))
    const handler = await createStaticHandler(root)
    const fetcher: typeof fetch = async input => {
      class Capture extends Writable {
        status = 200
        headers = new Headers()
        parts: Buffer[] = []
        headersSent = false
        setHeader(name: string, value: string | number) { this.headers.set(name, String(value)) }
        writeHead(status: number, headers: Record<string, string> = {}) {
          this.status = status; this.headersSent = true
          for (const [name, value] of Object.entries(headers)) this.setHeader(name, value)
          return this
        }
        _write(bytes: Buffer, _encoding: BufferEncoding, done: () => void) { this.parts.push(Buffer.from(bytes)); done() }
      }
      const output = new Capture()
      const finished = new Promise<void>((resolve, reject) => { output.on('finish', resolve); output.on('error', reject) })
      await handler({ method: 'GET', url: new URL(requestURL(input)).pathname, headers: {} }, output)
      await finished
      return new Response(Buffer.concat(output.parts), { status: output.status, headers: output.headers })
    }
    expect(await checkImageCodecDelivery('http://localhost', manifest, fetcher)).toEqual(manifest)
    await expect(checkImageCodecDelivery('http://localhost', manifest, async input => {
      const response = await fetcher(input)
      if (requestURL(input).endsWith('.mjs')) response.headers.set('content-type', 'application/octet-stream')
      return response
    })).rejects.toThrow('invalid Content-Type')
    await expect(checkImageCodecDelivery('http://localhost', manifest, async input => {
      const response = await fetcher(input)
      if (requestURL(input).endsWith('.wasm')) return new Response('corrupt', { headers: response.headers })
      return response
    })).rejects.toThrow('integrity mismatch')
  })
})
