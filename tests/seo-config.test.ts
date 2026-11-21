import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
async function config(origin: string, indexing = 'false') {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
  vi.stubEnv('NEXT_PUBLIC_ENABLE_INDEXING', indexing)
  vi.resetModules()
  return await import('@/lib/seo')
}
describe('publication identity without accidental indexing', () => {
  it('builds intended public URLs without enabling indexing implicitly', async () => {
    const seo = await config('https://filecompresser.com')
    expect(seo.absoluteUrl('/blog')).toBe('https://filecompresser.com/blog')
    expect(seo.SITE_INDEXABLE).toBe(false)
  })
  it('requires an explicit indexing flag for a configured public origin', async () => {
    expect((await config('https://filecompresser.com', 'true')).SITE_INDEXABLE).toBe(true)
  })
  it.each(['http://localhost:3210', 'http://127.0.0.1:3210', 'http://[::1]:3000'])('never indexes loopback origin %s', async origin => {
    expect((await config(origin, 'true')).SITE_INDEXABLE).toBe(false)
  })
  it.each(['https://example.invalid/path', 'https://name:secret@example.invalid', 'ftp://example.invalid'])('rejects unsafe site origin %s', async origin => {
    await expect(config(origin)).rejects.toThrow()
  })
})
