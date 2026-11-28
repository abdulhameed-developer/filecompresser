import { describe, expect, it, vi } from 'vitest'
import { waitForPublishedCommit } from '../scripts/verify-publication.mjs'

const commit = 'a'.repeat(40)
function clock() {
  let time = 0
  return { now: () => time, delay: async (ms: number) => { time += ms } }
}
describe('custom-domain publication acceptance', () => {
  it('waits for the intended deployed commit rather than accepting the last good release', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ sha: 'b'.repeat(40) })).mockResolvedValueOnce(Response.json({ sha: commit }))
    const result = await waitForPublishedCommit({ expectedCommit: commit, fetcher, timeoutMs: 100, intervalMs: 10, ...clock() })
    expect(result.passed).toBe(true)
    expect(result.attempts.map(attempt => attempt.observedCommit)).toEqual(['b'.repeat(40), commit])
    expect(fetcher.mock.calls[0][1].redirect).toBe('error')
  })
  it('fails a bounded stale release and preserves observed evidence', async () => {
    const result = await waitForPublishedCommit({ expectedCommit: commit, fetcher: async () => Response.json({ sha: 'b'.repeat(40) }), timeoutMs: 20, intervalMs: 10, ...clock() })
    expect(result.passed).toBe(false)
    expect(result.attempts).toHaveLength(2)
  })
  it('does not accept a 404, malformed JSON, an abbreviated commit or a transport failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response('<html>challenge</html>')).mockResolvedValueOnce(Response.json({ sha: 'aaaaaaa' })).mockRejectedValueOnce(new Error('connection reset'))
    const result = await waitForPublishedCommit({ expectedCommit: commit, fetcher, timeoutMs: 40, intervalMs: 10, ...clock() })
    expect(result.passed).toBe(false)
    expect(result.attempts).toHaveLength(4)
    expect(result.attempts[0].status).toBe(404)
    expect(result.attempts[3].error).toContain('connection reset')
  })
  it('rejects unknown destinations, credentials, query strings and invalid commit identities before requests', async () => {
    const fetcher = vi.fn()
    for (const base of ['https://other.example', 'https://filecompresser.com/?key=value', 'https://user:secret@filecompresser.com']) await expect(waitForPublishedCommit({ expectedCommit: commit, base, fetcher })).rejects.toThrow()
    await expect(waitForPublishedCommit({ expectedCommit: 'main', fetcher })).rejects.toThrow(/full Git commit/)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
