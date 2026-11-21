import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkDependencyAudits } from '@/scripts/audit-dependencies.mjs'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))
function temporary() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'cms-audit-command-'))
  directories.push(directory)
  return directory
}

describe('current npm audit evidence', () => {
  it('requires both current reports rather than mixing a supplied and another audit', async () => {
    await expect(checkDependencyAudits({ allFile: 'unused.json' })).rejects.toThrow('both current')
    await expect(checkDependencyAudits({ productionFile: 'unused.json' })).rejects.toThrow('both current')
  })

  it('preserves exact raw reports when actual installed-package verification fails', async () => {
    const root = temporary()
    const outputDirectory = path.join(root, 'evidence')
    const allFile = path.join(root, 'current-all.json')
    const productionFile = path.join(root, 'current-production.json')
    const all = '{\n "auditReportVersion":2, "metadata":{"vulnerabilities":{"high":8}}, "rawFinding":"retained"\n}\n'
    const production = '{"auditReportVersion":2,"metadata":{"vulnerabilities":{"total":0}}}\n'
    writeFileSync(allFile, all)
    writeFileSync(productionFile, production)
    // A stale attestation must never substitute for real installed CMS files.
    mkdirSync(path.join(root, 'node_modules/zod'), { recursive: true })
    writeFileSync(path.join(root, 'node_modules/zod/package.json'), JSON.stringify({ name: 'zod', version: '3.25.76' }))
    writeFileSync(path.join(root, 'node_modules/zod/filecompresser-security-attestation.json'), JSON.stringify({ verified: true }))
    await expect(checkDependencyAudits({ allFile, productionFile, outputDirectory, projectRoot: root })).rejects.toThrow('missing tinacms')
    expect(readFileSync(path.join(outputDirectory, 'audit-all.json'), 'utf8')).toBe(all)
    expect(readFileSync(path.join(outputDirectory, 'audit-production.json'), 'utf8')).toBe(production)
    expect(() => readFileSync(path.join(outputDirectory, 'audit-disposition.json'))).toThrow()
  })
})
