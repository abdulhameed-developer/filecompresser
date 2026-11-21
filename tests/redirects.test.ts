import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { parseRedirectFile, prepareRedirects, readPublicRoutes, validateRedirectRules } from '../scripts/prepare-redirects.mjs'
import { createStaticHandler } from '../scripts/serve-static.mjs'

const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))) })
const publicRoutes = new Set(['/', '/about', '/blog', '/image-compressor', '/blog/new-guide'])
const rules = (from: string, to: string) => ({ rules: [{ from, to }] })

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'filecompresser-redirects-'))
  temporary.push(root)
  for (const directory of ['app/about', 'content/tools', 'content/posts', 'content/redirects', 'public']) await mkdir(path.join(root, directory), { recursive: true })
  await Promise.all([
    writeFile(path.join(root, 'app/about/page.tsx'), 'export default function Page() {}'),
    writeFile(path.join(root, 'content/tools/image-compressor.json'), '{}'),
    writeFile(path.join(root, 'content/posts/new-guide.json'), JSON.stringify({ published: true })),
    writeFile(path.join(root, 'content/posts/draft.json'), JSON.stringify({ published: false })),
    writeFile(path.join(root, 'content/posts/archived.json'), JSON.stringify({ published: true, archived: true })),
    writeFile(path.join(root, 'content/redirects/rules.json'), JSON.stringify(rules('/blog/old-guide', '/blog/new-guide'))),
    writeFile(path.join(root, 'public/_headers'), '/*\n  X-Content-Type-Options: nosniff\n'),
    writeFile(path.join(root, 'public/index.html'), '<h1>Home</h1>'),
    writeFile(path.join(root, 'public/404.html'), '<h1>Missing</h1>'),
  ])
  return root
}

describe('safe editor-managed redirects', () => {
  it('allows an old URL to point directly to a real published page', () => {
    expect(validateRedirectRules(rules('/blog/old-guide', '/blog/new-guide'), publicRoutes)).toEqual([{ from: '/blog/old-guide', to: '/blog/new-guide' }])
    expect(validateRedirectRules(rules('/old-home', '/'), publicRoutes)).toHaveLength(1)
  })
  it.each([
    ['https://other.example/old', '/about'], ['/old', '//other.example'], ['/old?query=1', '/about'],
    ['/old', '/about#fragment'], ['/old/', '/about'], ['/old/*', '/about'], ['/old\\path', '/about'],
    ['/admin', '/about'], ['/uploads', '/about'], ['/ffmpeg-core', '/about'], ['/old', '/admin'], ['/wav-to-mp3', '/about'],
  ])('rejects unsafe or reserved paths %s → %s', (from, to) => {
    expect(() => validateRedirectRules(rules(from, to), publicRoutes)).toThrow(/safe exact/)
  })
  it('rejects duplicate sources, self-redirects, cycles and chains', () => {
    expect(() => validateRedirectRules({ rules: [{ from: '/old', to: '/' }, { from: '/old', to: '/about' }] }, publicRoutes)).toThrow(/duplicate/)
    expect(() => validateRedirectRules(rules('/old', '/old'), publicRoutes)).toThrow(/itself/)
    expect(() => validateRedirectRules({ rules: [{ from: '/old', to: '/other' }, { from: '/other', to: '/old' }] }, publicRoutes)).toThrow(/loop/)
    expect(() => validateRedirectRules({ rules: [{ from: '/old', to: '/other' }, { from: '/other', to: '/about' }] }, publicRoutes)).toThrow(/chain/)
  })
  it('cannot override a current page or lead readers to a missing destination', () => {
    expect(() => validateRedirectRules(rules('/image-compressor', '/about'), publicRoutes)).toThrow(/still has a public page/)
    expect(() => validateRedirectRules(rules('/old', '/missing'), publicRoutes)).toThrow(/not an existing public page/)
  })
  it('discovers routes from source and excludes drafts and archived articles', async () => {
    const root = await fixture()
    const routes = await readPublicRoutes(root)
    expect([...routes].sort()).toEqual(['/', '/about', '/blog/new-guide', '/image-compressor'])
    for (const target of ['/blog/draft', '/blog/archived']) expect(() => validateRedirectRules(rules('/blog/old', target), routes)).toThrow(/draft or archived/)
    await prepareRedirects(root)
    expect(await readFile(path.join(root, 'public/_redirects'), 'utf8')).toContain('/blog/old-guide /blog/new-guide 301\n')
  })
  it('rejects an externally linked settings file and unsafe generated rules', async () => {
    const root = await fixture()
    const filename = path.join(root, 'content/redirects/rules.json')
    await rm(filename)
    await symlink(path.join(root, 'public/index.html'), filename)
    await expect(prepareRedirects(root)).rejects.toThrow(/symbolic link/)
    expect(() => parseRedirectFile('/old //other.example 301')).toThrow(/invalid exact 301/)
    expect(() => parseRedirectFile('/old /about 302')).toThrow(/invalid exact 301/)
  })
  it('returns an exact 301 in local static previews before looking up assets', async () => {
    const root = await fixture()
    await prepareRedirects(root)
    await writeFile(path.join(root, 'public/blog-old.html'), '<h1>Old asset</h1>')
    const handler = await createStaticHandler(path.join(root, 'public'))
    async function request(url: string) {
      class Capture extends Writable {
        status = 200
        headers = new Map<string, string>()
        parts: Buffer[] = []
        headersSent = false
        setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), String(value)) }
        writeHead(status: number, headers: Record<string, string> = {}) { this.status = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); return this }
        _write(part: Buffer, _encoding: BufferEncoding, callback: () => void) { this.parts.push(Buffer.from(part)); callback() }
      }
      const response = new Capture()
      const done = new Promise<void>(resolve => response.on('finish', resolve))
      await handler({ method: 'GET', url, headers: {} }, response)
      await done
      return response
    }
    const moved = await request('/blog/old-guide')
    expect(moved.status).toBe(301)
    expect(moved.headers.get('location')).toBe('/blog/new-guide')
    expect(Buffer.concat(moved.parts).length).toBe(0)
    expect((await request('/blog/old-guide-more')).status).toBe(404)
  })
})
