import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { collections } from '../tina/collections.mjs'
import { CMS_CONTENT_LIMITS, cmsRecordPublicationError } from '../lib/cms-content-limits.mjs'

const post = JSON.parse(readFileSync('content/posts/honest-file-size-reporting.json', 'utf8'))
const schema = collections.find((entry: { name: string }) => entry.name === 'post')!
const limit = CMS_CONTENT_LIMITS.maxFileBytes

describe('existing CMS publication resource limits', () => {
  it('rejects an actual Save whose record exceeds the build byte limit', async () => {
    const values = { ...post, description: 'A'.repeat(limit + 1) }
    await expect(schema.ui.beforeSubmit({ values }).then(() => 'ACCEPTED', (error: Error) => error.message)).resolves.toMatch(/2 MiB/)
  })

  it('rejects an actual Save whose block list exceeds the indexer container limit', async () => {
    const values = { ...post, body: Array.from({ length: 4097 }, () => structuredClone(post.body[0])) }
    await expect(schema.ui.beforeSubmit({ values }).then(() => 'ACCEPTED', (error: Error) => error.message)).resolves.toMatch(/container-size.*4096/)
  })

  it('accepts the exact formatted UTF-8 byte limit and rejects one extra byte', () => {
    const overhead = Buffer.byteLength(JSON.stringify({ text: '' }, null, 2) + '\n')
    expect(cmsRecordPublicationError({ text: 'A'.repeat(limit - overhead) })).toBeUndefined()
    expect(cmsRecordPublicationError({ text: 'A'.repeat(limit - overhead + 1) })).toMatch(/2 MiB/)
  })

  it('counts actual multibyte UTF-8 rather than JavaScript characters', () => {
    const overhead = Buffer.byteLength(JSON.stringify({ text: '' }, null, 2) + '\n')
    const remaining = limit - overhead
    const text = 'é'.repeat(Math.floor(remaining / 2)) + 'A'.repeat(remaining % 2)
    expect(cmsRecordPublicationError({ text })).toBeUndefined()
    expect(cmsRecordPublicationError({ text: text + 'é' })).toMatch(/2 MiB/)
  })

  it('rejects cycles and getters without invoking a getter or serialization', () => {
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic
    expect(cmsRecordPublicationError(cyclic)).toMatch(/publication limit/)
    let calls = 0
    const value = Object.defineProperty({}, 'text', { enumerable: true, get() { calls++; return 'secret' } })
    expect(cmsRecordPublicationError(value)).toMatch(/publication limit/)
    expect(calls).toBe(0)
  })

  it('rejects opaque React cycles and custom serialization without invoking them', () => {
    const value: { $$typeof: symbol; owner?: unknown } = { $$typeof: Symbol.for('react.element') }; value.owner = value
    expect(cmsRecordPublicationError(value)).toMatch(/ordinary JSON/)
    let calls = 0
    const custom = Object.defineProperty({ text: 'Example' }, 'toJSON', { value() { calls++; return {} } })
    expect(cmsRecordPublicationError(custom)).toMatch(/ordinary JSON/)
    expect(calls).toBe(0)
  })

  it('keeps optional undefined fields serializable and all 29 existing records within bounds', () => {
    expect(cmsRecordPublicationError({ optional: undefined, list: [], title: 'Example' })).toBeUndefined()
    let count = 0
    for (const directory of readdirSync('content', { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      for (const file of readdirSync(path.join('content', directory.name)).filter(file => file.endsWith('.json'))) {
        const name = path.join('content', directory.name, file)
        expect(cmsRecordPublicationError(JSON.parse(readFileSync(name, 'utf8'))), name).toBeUndefined()
        count++
      }
    }
    expect(count).toBe(29)
  })
})
