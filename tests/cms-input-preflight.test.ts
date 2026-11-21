import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkCmsInputs, CMS_CONTENT_LIMITS } from '@/scripts/check-cms-inputs.mjs'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))
function project() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'cms-inputs-'))
  directories.push(directory)
  mkdirSync(path.join(directory, 'content', 'posts'), { recursive: true })
  return directory
}

describe('CMS authored JSON boundary before indexing', () => {
  it('accepts normal published and draft data without imposing publication rules', () => {
    const root = project()
    writeFileSync(path.join(root, 'content/posts/draft.json'), JSON.stringify({ published: false, body: [] }))
    writeFileSync(path.join(root, 'content/posts/post.json'), JSON.stringify({ title: 'A guide', body: [{ _template: 'p', text: 'Keep the original.' }] }))
    expect(checkCmsInputs(root).files).toBe(2)
  })

  it('refuses oversized raw bytes before JSON parsing', () => {
    const root = project()
    writeFileSync(path.join(root, 'content/posts/oversized.json'), Buffer.alloc(CMS_CONTENT_LIMITS.maxFileBytes + 1, 32))
    expect(() => checkCmsInputs(root)).toThrow('2 MiB')
  })

  it('rejects ordinary JSON graph width before Tina can create per-element issues', () => {
    const root = project()
    writeFileSync(path.join(root, 'content/posts/wide.json'), JSON.stringify({ body: Array(4097).fill(0) }))
    expect(() => checkCmsInputs(root)).toThrow('container-size')
  })

  it('caps total graph nodes even when each individual array is within its limit', () => {
    const root = project()
    writeFileSync(path.join(root, 'content/posts/fanout.json'), JSON.stringify(Array.from({ length: 10 }, () => Array(3000).fill(0))))
    expect(() => checkCmsInputs(root)).toThrow('nodes')
  })

  it('reports the file for malformed JSON without dumping its private contents', () => {
    const root = project()
    writeFileSync(path.join(root, 'content/posts/broken.json'), '{"private-value":"do-not-print",oops}')
    expect(() => checkCmsInputs(root)).toThrow('content/posts/broken.json')
    expect(() => checkCmsInputs(root)).not.toThrow('do-not-print')
  })

  it.skipIf(process.platform === 'win32')('does not follow content links outside the reviewed checkout', () => {
    const root = project()
    const target = path.join(root, 'outside.json')
    writeFileSync(target, '{"outside":true}')
    symlinkSync(target, path.join(root, 'content/posts/link.json'))
    expect(() => checkCmsInputs(root)).toThrow('symbolic link')
  })
})
