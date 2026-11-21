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

const reactRouterLoader = [
  'async function qrn(e,t){if(e.id in t)return t[e.id];try{let n=await import(e.module);return t[e.id]=n,n}catch(n){return console.error(',
  '`Error loading route module \\`${e.module}\\`, reloading page...`',
  '),console.error(n),window.__reactRouterContext&&window.__reactRouterContext.isSpaMode,window.location.reload(),new Promise(()=>{})}}',
].join('')

describe('entry-reachable generated admin structure', () => {
  it('reports bounded static coverage and file hashes, with browser runtime explicitly unverified', () => {
    const root = fixture({ 'index.html': '<script type="module" src="./entry.js"></script>',
      'entry.js': 'import "./chunks/guard.mjs"', 'chunks/guard.mjs': guardedCode() })
    const result = verifyAdminResourceBundle(root)
    expect(result).toEqual(expect.objectContaining({ verified: true, browserRuntimeVerified: false,
      coverage: 'static all-emitted-local-JS guard structure with guarded entry graph', roots: 1, parsers: 1 }))
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

  it('recognizes only the complete cached React Router loader and reports its target as opaque', () => {
    for (const loader of [reactRouterLoader, reactRouterLoader.replace(/\be\b/g, 'route').replace(/\bt\b/g, 'cache').replace(/\bn\b/g, 'loaded')]) {
      const main = guardedCode() + '\n' + loader
      const optional = 'console.log("emitted optional module")'
      const root = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': main, 'chunks/optional.js': optional })
      const result = verifyAdminResourceBundle(root)
      expect(result.opaqueLoaderCount).toBe(1)
      expect(result.computedModuleTargetsResolved).toBe(false)
      expect(result.browserRuntimeVerified).toBe(false)
      expect(result.opaqueLoaders[0]).toEqual(expect.objectContaining({ asset: 'entry.js', functionName: 'qrn', targetResolved: false,
        contract: 'React Router cached route-module loader AST v1' }))
      expect(result.opaqueLoaders[0].sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(result.entryGraph).toEqual(expect.objectContaining({ roots: 1, parsers: 1, files: 1, bytes: Buffer.byteLength(main) }))
      expect(result.emittedFilesystem).toEqual(expect.objectContaining({ files: 2, bytes: Buffer.byteLength(main) + Buffer.byteLength(optional), inventoryComplete: true, inspectionComplete: true }))
      expect(result.inspectionLimits.maxAstNodes).toBe(8000000)
      expect(result.files.map((item: { path: string }) => item.path).sort()).toEqual(['chunks/optional.js', 'entry.js'])
    }
  })

  it('rejects near-match loader mutations instead of permitting arbitrary property imports', () => {
    const mutations = [
      reactRouterLoader.replace('import(e.module)', 'import(e.other)'),
      reactRouterLoader.replace('await import(e.module)', 'import(e.module)'),
      reactRouterLoader.replace('if(e.id in t)', 'if(e.other in t)'),
      reactRouterLoader.replace('t[e.id]=n,n', 't[e.other]=n,n'),
      reactRouterLoader.replace('t[e.id]=n,n', 't[e.id]=n,e'),
      reactRouterLoader.replace('window.location.reload()', 'window.location.assign()'),
      reactRouterLoader.replace('window.location.reload()', 'window.location?.reload()'),
      reactRouterLoader.replace('new Promise(()=>{})', 'new Promise(()=>{return 1})'),
      reactRouterLoader.replace('console.error(n)', 'console.error(e)'),
      reactRouterLoader.replace('try{let n', 'try{console.log("extra");let n'),
      reactRouterLoader.replace('catch(n){return', 'catch(n){throw n;return'),
      reactRouterLoader.replace('window.__reactRouterContext.isSpaMode', 'window.__reactRouterContext.isSpaMode()'),
      reactRouterLoader.replace(/\be\b/g, 'window'),
      'async function unrelated(e){return await import(e.module)}',
    ]
    for (const loader of mutations) {
      const root = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': guardedCode() + '\n' + loader })
      expect(() => verifyAdminResourceBundle(root)).toThrow('unresolved dynamic module import')
    }
  })

  it('keeps unrelated computed imports blocked beside a recognized loader', () => {
    const root = fixture({ 'index.html': '<script src="./entry.js"></script>',
      'entry.js': guardedCode() + '\n' + reactRouterLoader + ';function unrelated(target){return import(target)}' })
    expect(() => verifyAdminResourceBundle(root)).toThrow('unresolved dynamic module import')
  })

  it('checks unreferenced emitted JavaScript for unguarded Zod code without letting it establish entry coverage', () => {
    const unguarded = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': guardedCode() + '\n' + reactRouterLoader,
      'chunks/old.js': guardedCode().replaceAll('fileCompresserBudget', 'removedBudget') })
    expect(() => verifyAdminResourceBundle(unguarded)).toThrow('graph preflight/shared budget')
    const decoy = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': reactRouterLoader,
      'chunks/stale.js': guardedCode() })
    expect(() => verifyAdminResourceBundle(decoy)).toThrow('entry-reachable')
  })

  it('distinguishes lexical local require calls from unresolved global CommonJS without executing targets', () => {
    const cases = [
      ['function', 'require("value"); function require(value){return value}'],
      ['var', 'function factory(){require("value");if(true){var require=value=>value}}'],
      ['var', 'require("value");if(true){var require=value=>value}'],
      ['let', '{require("value");let require=value=>value}'],
      ['const', '{const require=value=>value;require("value")}'],
      ['parameter', 'function factory(require){require("value")}'],
      ['parameter', 'function factory({shim:require}){require("value")}'],
      ['import', 'import require from "./shim.js";require("value")'],
      ['import', 'import {shim as require} from "./shim.js";require("value")'],
      ['named-function', 'const factory=function require(){return require("value")}'],
      ['catch', 'try{throw value=>value}catch(require){require("value")}'],
      ['loop-lexical', 'for(let require of []){require("value")}'],
    ]
    for (const [kind, code] of cases) {
      const root = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': guardedCode() + '\n' + code,
        'shim.js': 'export default value=>value;export function shim(value){return value}' })
      const result = verifyAdminResourceBundle(root)
      expect(result.localRequireCallCount).toBe(1)
      expect(result.localRequireCalls[0]).toEqual(expect.objectContaining({ asset: 'entry.js', targetResolved: false,
        binding: expect.objectContaining({ status: 'lexically-bound-local', kind }) }))
      expect(result.localRequireCalls[0].sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(result.browserRuntimeVerified).toBe(false)
      expect(result.emittedFilesystem.inspectionComplete).toBe(true)
    }
  })

  it('does not leak sibling, nested, loop, catch, destructuring-property or function-name bindings', () => {
    const cases = [
      '{let require=value=>value}require("global")',
      'function sibling(require){}require("global")',
      'function sibling(){var require=value=>value}require("global")',
      'for(let require of []){}require("global")',
      'const {require:alias}=object;require("global")',
      'import {require as alias} from "./shim.js";require("global")',
      'function factory(value=require("global")){var require=value=>value}',
      'function factory(value=require("global")){function require(){}}',
      'try{}catch(require){}require("global")',
      'const factory=function require(){};require("global")',
      'const object={require(){}};require("global")',
      'function factory(){{const require=value=>value}return require("global")}',
    ]
    for (const code of cases) {
      const root = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': guardedCode() + '\n' + code,
        'shim.js': 'export function require(value){return value}' })
      expect(() => verifyAdminResourceBundle(root)).toThrow('unresolved CommonJS import')
    }
  })

  it('reports bounded require expressions with binding hints across generated assets', () => {
    const root = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': guardedCode() + ';require("global")',
      'chunks/local.js': 'function factory(require){return require("opaque")}' })
    let failure = ''
    try { verifyAdminResourceBundle(root) } catch (error) { failure = (error as Error).message }
    expect(failure).toContain('unresolved CommonJS import')
    const diagnostic = JSON.parse(failure.split('diagnostic=')[1])
    expect(diagnostic.imports[0]).toEqual(expect.objectContaining({ asset: 'entry.js', kind: 'require-call',
      expression: 'require("global")', binding: { status: 'unbound-global' } }))
    expect(diagnostic.generatedInventory.requireCalls).toBe(2)
    expect(diagnostic.imports).toEqual(expect.arrayContaining([expect.objectContaining({ asset: 'chunks/local.js', kind: 'require-call',
      binding: expect.objectContaining({ status: 'lexically-bound-local', kind: 'parameter' }) })]))
    for (const item of diagnostic.imports) { expect(item.expression.length).toBeLessThanOrEqual(240); expect(item.context.length).toBeLessThanOrEqual(600) }
  })

  it('keeps unknown ESM imports and Zod guard validation mandatory inside local require shims', () => {
    const dynamic = fixture({ 'index.html': '<script src="./entry.js"></script>',
      'entry.js': guardedCode() + ';function require(target){return import(target)}require("opaque")' })
    expect(() => verifyAdminResourceBundle(dynamic)).toThrow('unresolved dynamic module import')
    const unguarded = fixture({ 'index.html': '<script src="./entry.js"></script>', 'entry.js': guardedCode(),
      'chunks/local.js': 'function require(target){' + guardedCode().replaceAll('fileCompresserBudget', 'removedBudget') + '}require("opaque")' })
    expect(() => verifyAdminResourceBundle(unguarded)).toThrow('graph preflight/shared budget')
  })
})
