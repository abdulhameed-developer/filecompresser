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

  it('reports the generated asset, import position and bounded loader context without permitting it', () => {
    const root = fixture({ 'index.html': '<script type="module" src="./assets/entry.js"></script>',
      'assets/entry.js': `const loader = target => import(target);\n${guardedCode()}` })
    let failure = ''
    try { verifyAdminResourceBundle(root) } catch (error) { failure = (error as Error).message }
    expect(failure).toContain('unresolved dynamic module import')
    const diagnostic = JSON.parse(failure.split('diagnostic=')[1])
    expect(diagnostic.asset).toBe('assets/entry.js')
    expect(diagnostic.imports[0]).toEqual(expect.objectContaining({ line: 1, column: 26,
      expression: 'import(target)', context: 'target => import(target)', contextName: 'loader' }))
    expect(diagnostic.candidateScan).toEqual(expect.objectContaining({ roots: 1, parsers: 1, truncated: false }))
    expect(diagnostic.generatedInventory.classes).toEqual(expect.arrayContaining([
      expect.objectContaining({ asset: 'assets/entry.js', className: 'a', methods: expect.arrayContaining(['safeParse', 'safeParseAsync']) }),
      expect.objectContaining({ asset: 'assets/entry.js', className: 'b', methods: ['_parse'] }),
    ]))
    expect(diagnostic.partialInspection).toEqual(expect.objectContaining({ roots: 0, parsers: 0, files: 1 }))
  })

  it('caps import expressions, surrounding code and the same-file diagnostic list', () => {
    const code = `function dependencyLoader(target) { return import(target + ${JSON.stringify('x'.repeat(4000))}); }\n`
      + Array.from({ length: 25 }, (_, index) => `function loader${index}(target) { return import(target); }`).join('\n')
    const root = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': code })
    let failure = ''
    try { verifyAdminResourceBundle(root) } catch (error) { failure = (error as Error).message }
    const diagnostic = JSON.parse(failure.split('diagnostic=')[1])
    expect(diagnostic.imports).toHaveLength(20)
    expect(diagnostic.additionalImportsOmitted).toBe(true)
    expect(diagnostic.imports[0].expressionTruncated).toBe(true)
    expect(diagnostic.imports[0].contextTruncated).toBe(true)
    expect(diagnostic.imports[0].contextKind).toBe('FunctionDeclaration')
    expect(diagnostic.imports[0].contextName).toBe('dependencyLoader')
    for (const item of diagnostic.imports) {
      expect(item.expression.length).toBeLessThanOrEqual(240)
      expect(item.context.length).toBeLessThanOrEqual(600)
      expect(item.expression).not.toMatch(/[\r\n]/)
      expect(item.context).not.toMatch(/[\r\n]/)
    }
    expect(failure.length).toBeLessThan(14000)
  })

  it('inventories computed and literal imports in other generated assets on failure without following them', () => {
    const root = fixture({ 'index.html': '<script src="./entry.js"></script>',
      'entry.js': 'function loader(target) { return import(target) }',
      'chunks/unreferenced.js': 'function optional(target) { return import(target) }; import(`./missing-optional.js`)' })
    let failure = ''
    try { verifyAdminResourceBundle(root) } catch (error) { failure = (error as Error).message }
    expect(failure).toContain('unresolved dynamic module import')
    const diagnostic = JSON.parse(failure.split('diagnostic=')[1])
    expect(diagnostic.generatedInventory).toEqual(expect.objectContaining({ files: 2, computedImports: 2, literalImports: 1, truncated: false }))
    expect(diagnostic.imports).toHaveLength(3)
    expect(diagnostic.imports[0].asset).toBe('entry.js')
    expect(diagnostic.imports.filter((item: { asset: string }) => item.asset === 'chunks/unreferenced.js')).toHaveLength(2)
    expect(diagnostic.partialInspection.files).toBe(1)
  })

  it('accepts conventional no-substitution template imports while keeping interpolated imports blocked', () => {
    const root = fixture({ 'index.html': '<script type="module">import(`./entry.js`)</script>', 'entry.js': guardedCode() })
    expect(verifyAdminResourceBundle(root).verified).toBe(true)
    const dynamic = fixture({ 'index.html': '<script src="./entry.js"></script>',
      'entry.js': 'const target="optional"; import(`./${target}.js`)' })
    expect(() => verifyAdminResourceBundle(dynamic)).toThrow('unresolved dynamic module import')
  })

  it('caps diagnostic class records and lists method names without class bodies', () => {
    const code = 'function loader(target) { return import(target) };'
      + Array.from({ length: 60 }, (_, index) => `class Parser${index} { _parse() { return "CLASS_BODY_NOT_IN_RECORD" } }`).join('\n')
    const root = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': code })
    let failure = ''
    try { verifyAdminResourceBundle(root) } catch (error) { failure = (error as Error).message }
    const diagnostic = JSON.parse(failure.split('diagnostic=')[1])
    expect(diagnostic.generatedInventory.classes).toHaveLength(50)
    expect(diagnostic.generatedInventory.classRecordsOmitted).toBe(true)
    expect(JSON.stringify(diagnostic.generatedInventory.classes)).not.toContain('CLASS_BODY_NOT_IN_RECORD')
    expect(diagnostic.generatedInventory.classes.every((item: { methods: string[] }) => item.methods.length === 1 && item.methods[0] === '_parse')).toBe(true)
  })
})
