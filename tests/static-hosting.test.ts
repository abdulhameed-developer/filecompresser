import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { loadWasmCoreURL } from '@/lib/ffmpeg/wasm'
import { createStaticHandler } from '../scripts/serve-static.mjs'

const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])
const sha256 = createHash('sha256').update(bytes).digest('hex')
const file = `ffmpeg-core-${sha256}.part.wasm`
const manifest = { version: 1, size: bytes.length, sha256, chunks: [{ file, size: bytes.length, sha256 }] }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('static media engine loading', () => {
  it('reconstructs exactly the original WASM bytes from same-origin chunks', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(new Response(bytes))
    vi.stubGlobal('fetch', fetcher)
    let output: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { output = blob as Blob; return 'blob:engine' })
    expect(await loadWasmCoreURL()).toBe('blob:engine')
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/ffmpeg-core/wasm-manifest.json', `/ffmpeg-core/${file}`])
    expect(new Uint8Array(await output!.arrayBuffer())).toEqual(bytes)
    expect(output!.type).toBe('application/wasm')
  })
  it('refuses a changed or truncated chunk instead of running broken engine code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(new Response(new Uint8Array(bytes.length))))
    await expect(loadWasmCoreURL()).rejects.toThrow(/integrity/)
  })
  it('does not fetch paths outside the generated allow-list', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...manifest, chunks: [{ ...manifest.chunks[0], file: 'https://untrusted.example/engine.wasm' }] }))
    vi.stubGlobal('fetch', fetcher)
    await expect(loadWasmCoreURL()).rejects.toThrow(/manifest is invalid/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('handles missing manifest and network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    await expect(loadWasmCoreURL()).rejects.toThrow(/manifest could not/)
  })
  it('deploys strict public CSP and separately allows CMS authentication popups', async () => {
    const headers = await readFile('public/_headers', 'utf8')
    const publicRules = headers.split('/ffmpeg-core/*')[0]
    expect(publicRules).toContain("connect-src 'self' blob: data:")
    expect(publicRules).not.toContain('tina.io')
    expect(headers).toContain('/admin/*\n  ! Content-Security-Policy')
    expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin-allow-popups')
    expect(headers).toContain('X-Robots-Tag: noindex, nofollow')
  })
})

describe('exported-site preview', () => {
  let directory: string
  let handler: Awaited<ReturnType<typeof createStaticHandler>>
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'filecompresser-static-'))
    await Promise.all([
      writeFile(path.join(directory, 'index.html'), '<h1>Home</h1>'),
      writeFile(path.join(directory, 'tool.html'), '<h1>Tool</h1>'),
      writeFile(path.join(directory, '404.html'), '<h1>Missing</h1>'),
      writeFile(path.join(directory, 'engine.wasm'), bytes),
      writeFile(path.join(directory, '_headers'), "/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'self'; upgrade-insecure-requests\n/admin/*\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'self'; connect-src https://example.test\n"),
    ])
    handler = await createStaticHandler(directory)
  })
  afterAll(async () => { await rm(directory, { recursive: true, force: true }) })
  async function request(url: string, requestHeaders: Record<string, string> = {}) {
    class ResponseCapture extends Writable {
      status = 200
      headers = new Map<string, string>()
      chunks: Buffer[] = []
      headersSent = false
      setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), String(value)) }
      writeHead(status: number, values: Record<string, string> = {}) { this.status = status; this.headersSent = true; for (const [key, value] of Object.entries(values)) this.setHeader(key, value); return this }
      _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) { this.chunks.push(chunk); callback() }
    }
    const response = new ResponseCapture()
    const done = new Promise<void>(resolve => response.on('finish', resolve))
    await handler({ method: 'GET', url, headers: requestHeaders }, response)
    await done
    return { status: response.status, headers: response.headers, body: Buffer.concat(response.chunks) }
  }
  it('resolves clean HTML URLs and preserves a real 404', async () => {
    expect((await request('/tool')).body.toString()).toContain('<h1>Tool</h1>')
    const missing = await request('/missing')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('x-robots-tag')).toBe('noindex')
  })
  it('serves WASM bytes, ranges and same-origin security headers', async () => {
    const result = await request('/engine.wasm', { range: 'bytes=0-3' })
    expect(result.status).toBe(206)
    expect(result.body).toEqual(Buffer.from(bytes.subarray(0, 4)))
    expect(result.headers.get('content-type')).toBe('application/wasm')
    expect(result.headers.get('x-content-type-options')).toBe('nosniff')
    expect(result.headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests')
    expect((await request('/engine.wasm', { range: 'bytes=300-999' })).status).toBe(416)
  })
  it('does not expose hosting configuration or paths outside the export', async () => {
    expect((await request('/_headers')).status).toBe(404)
    expect((await request('/..%2f..%2fpackage.json')).status).toBe(404)
  })
})
