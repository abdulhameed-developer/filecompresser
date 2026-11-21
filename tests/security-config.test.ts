import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
async function headers(origin: string) {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
  vi.resetModules()
  return (await import('../next.config.mjs')).securityHeaders
}
describe('HTTP preview and future HTTPS policy', () => {
  it('does not upgrade local HTTP assets or set HSTS', async () => {
    const values = await headers('')
    expect(values.find(item => item.key === 'Content-Security-Policy')?.value).not.toContain('upgrade-insecure-requests')
    expect(values.find(item => item.key === 'Strict-Transport-Security')).toBeUndefined()
    expect(values.find(item => item.key === 'Content-Security-Policy')?.value).toContain("object-src 'none'")
  })
  it('retains upgrades and HSTS for an explicitly configured HTTPS origin', async () => {
    const values = await headers('https://example.invalid')
    expect(values.find(item => item.key === 'Content-Security-Policy')?.value).toContain('upgrade-insecure-requests')
    expect(values.find(item => item.key === 'Strict-Transport-Security')?.value).toContain('max-age=')
  })
})
