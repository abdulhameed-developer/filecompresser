import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyAdminResourceBundle } from '../scripts/cms-security/install.mjs'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cms-admin-static-'))
  directories.push(root)
  for (const [relative, source] of Object.entries(files)) {
    const filename = path.join(root, 'public/admin', relative)
    mkdirSync(path.dirname(filename), { recursive: true })
    writeFileSync(filename, source)
  }
  return root
}

// Synthetic minified-style structure: this proves the static verifier's scope,
// never actual editor execution. Separate Zod runtime workers exercise semantics.
function guardedCode() {
  const root = `let l=inspect(d),b=budget(),c={common:{issues:[],fileCompresserBudget:b},parsedType:l?"unknown":type(d)};
    try{return parse(c)}catch(e){if(e!==s)throw e;return failure("issues")}`
  return `const s=Symbol.for("filecompresser.cms-zod.issue-limit.v1");
    const issue=r=>({message:\`CMS validation stopped at the \${r} resource limit.\`});
    function observe(p){return p instanceof Promise&&p.catch(()=>{}),p}
    class a{safeParse(d){${root}} async safeParseAsync(d){${root}} ["~validate"](d){${root}}
      async _parseAsync(i){return this._parse(i)}}
    class b extends a{_parse(i){try{return observe(result(i))}catch(e){
      if(e===s&&i.parent.common.async)return observe(Promise.reject(e));throw e}}}`
}

describe('entry-reachable generated admin structure', () => {
  it('reports bounded static coverage and file hashes, with browser runtime explicitly unverified', () => {
    const root = fixture({ 'index.html': '<script type="module" src="./entry.js"></script>',
      'entry.js': 'import "./chunks/guard.mjs"', 'chunks/guard.mjs': guardedCode() })
    const result = verifyAdminResourceBundle(root)
    expect(result).toEqual(expect.objectContaining({ verified: true, browserRuntimeVerified: false,
      coverage: 'static entry-reachable JavaScript structure', roots: 1, parsers: 1 }))
    expect(result.files.map((file: { path: string }) => file.path).sort()).toEqual(['chunks/guard.mjs', 'entry.js'])
    expect(result.files.every((file: { sha256: string }) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
  })

  it('rejects marker-only decoys even when no HTML entry exists', () => {
    const root = fixture({ 'unreferenced.js': '// filecompresser.cms-zod.issue-limit.v1\n// CMS validation stopped at' })
    expect(() => verifyAdminResourceBundle(root)).toThrow('HTML entry')
  })

  it('does not count a stale guarded chunk that the HTML module graph never imports', () => {
    const root = fixture({ 'index.html': '<script type="module" src="./entry.js"></script>',
      'entry.js': 'console.log("unguarded output")', 'stale.js': guardedCode() })
    expect(() => verifyAdminResourceBundle(root)).toThrow('entry-reachable')
  })

  it('rejects changed module bases/import maps and ignores commented-out script roots', () => {
    for (const html of ['<base href="https://external.example/"><script src="./entry.js"></script>',
      '<script type="importmap">{"imports":{}}</script><script src="./entry.js"></script>',
      '<!--<script src="./entry.js"></script>-->']) {
      const root = fixture({ 'index.html': html, 'entry.js': guardedCode() })
      expect(() => verifyAdminResourceBundle(root)).toThrow(/unsupported|entry-reachable/)
    }
    const root = fixture({ 'index.html': '<script src="./entry.js"></script>',
      'entry.js': guardedCode() + ';Z["prototype"]["safeParse"]=function(){};' })
    expect(() => verifyAdminResourceBundle(root)).toThrow('prototype-based')
  })

  it('rejects any unguarded Zod root reachable alongside a guarded copy', () => {
    const root = fixture({ 'index.html': '<script type="module" src="./entry.js"></script>',
      'entry.js': 'import "./guard.js";import "./old.js"', 'guard.js': guardedCode(),
      'old.js': guardedCode().replaceAll('fileCompresserBudget', 'removedBudget') })
    expect(() => verifyAdminResourceBundle(root)).toThrow('graph preflight/shared budget')
  })

  it('rejects an unobserved concrete parser and a promise observer that changes rejection results', () => {
    for (const source of [guardedCode().replace('return observe(result(i))', 'return result(i)'),
      guardedCode().replace('p instanceof Promise&&p.catch(()=>{}),p', 'p.catch(()=>{})')]) {
      const root = fixture({ 'index.html': '<script src="/admin/entry.js"></script>', 'entry.js': source })
      expect(() => verifyAdminResourceBundle(root)).toThrow('unguarded parser promise')
    }
  })

  it('rejects unknown constructor forms, external modules and unresolved dynamic imports', () => {
    const sources = ['const z="$ZodType";', 'import("https://example.com/unreviewed.js");',
      'const name="./unknown.js";import(name);', 'Z.prototype.safeParse=function(){};', 'require("./unreviewed.js");']
    for (const source of sources) {
      const root = fixture({ 'index.html': '<script type="module" src="./entry.js"></script>', 'entry.js': source })
      expect(() => verifyAdminResourceBundle(root)).toThrow(/unsupported|unverifiable|unresolved/)
    }
  })

  it('does not silently ignore a script with an unsupported source attribute', () => {
    const root = fixture({ 'index.html': '<script src="./entry.js"></script><script src=./unreviewed.js></script>', 'entry.js': guardedCode() })
    expect(() => verifyAdminResourceBundle(root)).toThrow('script source attribute')
  })

  it('follows literal dynamic imports and ignores guard marker comments', () => {
    const root = fixture({ 'index.html': '<script type="module">import("./entry.js")</script>',
      'entry.js': guardedCode().replace('Symbol.for("filecompresser.cms-zod.issue-limit.v1")', 'Symbol.for("wrong")')
        + '\n// filecompresser.cms-zod.issue-limit.v1\n' })
    expect(() => verifyAdminResourceBundle(root)).toThrow('entry-reachable')
  })
})
