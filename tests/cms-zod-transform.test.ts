import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { resourceModuleSource, transformZodParseUtil, transformZodTypes } from '../scripts/cms-security/transform-zod.mjs'

const require = createRequire(import.meta.url)

function packageRoot() {
  const explicit = process.env.FILECOMPRESSER_ZOD_TEST_ROOT
  const candidates: string[] = explicit ? [path.resolve(explicit)] : []
  for (const specifier of ['zod/package.json', 'tinacms/package.json', '@tinacms/cli/package.json', '@tinacms/schema-tools/package.json']) {
    try {
      const resolved = require.resolve(specifier)
      candidates.push(path.dirname(specifier === 'zod/package.json' ? resolved : createRequire(resolved).resolve('zod/package.json')))
    } catch { /* Report the complete missing-runtime condition below. */ }
  }
  for (const root of candidates) {
    if (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version === '3.25.76') return root
  }
  throw new Error('CMS Zod runtime tests require exact zod@3.25.76 from the pinned Tina install. Install the reviewed lockfile first; FILECOMPRESSER_ZOD_TEST_ROOT may explicitly select an isolated source-derived proof fixture, which is not npm-dist verification.')
}

function runtimeFixture(format: 'esm' | 'cjs') {
  const original = packageRoot()
  const extension = format === 'esm' ? '.js' : '.cjs'
  const temporary = mkdtempSync(path.join(tmpdir(), `filecompresser-zod-${format}-`))
  const copy = (relative: string) => {
    for (const entry of readdirSync(path.join(original, relative), { withFileTypes: true })) {
      const filename = path.join(relative, entry.name)
      if (entry.isDirectory()) copy(filename)
      else if (entry.name.endsWith(extension)) {
        const backup = path.join(original, 'filecompresser-security-original', filename)
        const source = existsSync(backup) ? backup : path.join(original, filename)
        const target = path.join(temporary, filename)
        mkdirSync(path.dirname(target), { recursive: true })
        writeFileSync(target, readFileSync(source))
      }
    }
  }
  try {
    copy('v3')
    writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ type: 'module', private: true }))
    const types = path.join(temporary, `v3/types${extension}`)
    const parseUtil = path.join(temporary, `v3/helpers/parseUtil${extension}`)
    const originalTypes = readFileSync(types, 'utf8')
    // Computed string names and ordinary string method names are both emitted by
    // upstream build tools. Exercise the normalized AST matching in both forms.
    const computed = originalTypes.replace(/(?:"~validate"|\["~validate"\])\(/, '["~validate"](')
    expect(transformZodTypes(computed, format)).toContain('fileCompresserResourceFailure')
    const transformedTypes = transformZodTypes(originalTypes, format)
    expect(() => transformZodTypes(transformedTypes, format)).toThrow('already transformed')
    expect(() => transformZodTypes(originalTypes.replace('class ZodReadonly', 'class ChangedReadonly'), format)).toThrow('ZodReadonly')
    writeFileSync(types, transformedTypes)
    writeFileSync(parseUtil, transformZodParseUtil(readFileSync(parseUtil, 'utf8'), format))
    writeFileSync(path.join(temporary, `v3/filecompresser-resources${extension}`), resourceModuleSource(format))
    return { temporary, entry: path.join(temporary, `v3/index${extension}`) }
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

// Execute actual transformed parser modules in a fresh Node worker. Strict
// rejection handling makes a stranded async child promise a failing test.
const runtimeProof = String.raw`
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parentPort } from 'node:worker_threads';
const entry = process.argv[2], format = process.argv[3];
const z = format === 'esm' ? await import(pathToFileURL(entry).href) : createRequire(import.meta.url)(entry);
const drain = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function resource(result, reason) {
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'custom');
  assert.equal(result.error.issues[0].params.resourceLimit, reason);
  return result.error.issues;
}
function standardResource(result, reason) {
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].params.resourceLimit, reason);
}
for (const kind of ['array', 'map', 'set']) {
  let visits = 0;
  const child = z.preprocess(value => { visits++; return value; }, z.string());
  const schema = kind === 'array' ? z.array(child) : kind === 'set' ? z.set(child) : z.map(child, child);
  const values = Array.from({ length: 10000 }, (_, i) => i);
  const input = kind === 'array' ? values : kind === 'set' ? new Set(values) : new Map(values.map(i => [i, i]));
  resource(schema.safeParse(input), 'container-size');
  assert.throws(() => schema.parse(input), error => error instanceof z.ZodError && error.issues[0].params.resourceLimit === 'container-size');
  resource(await schema.safeParseAsync(input), 'container-size');
  await assert.rejects(schema.parseAsync(input), error => error instanceof z.ZodError && error.issues[0].params.resourceLimit === 'container-size');
  standardResource(await schema['~standard'].validate(input), 'container-size');
  assert.equal(visits, 0);
}
for (const bound of ['array.max', 'array.length', 'set.max', 'set.size']) {
  for (const async of [false, true]) {
    let visits = 0;
    const child = z.preprocess(value => { visits++; return value; }, z.string());
    const [kind, method] = bound.split('.');
    const schema = (kind === 'array' ? z.array(child) : z.set(child))[method](3, 'upper bound');
    const input = kind === 'array' ? [1, 2, 3, 4] : new Set([1, 2, 3, 4]);
    const result = async ? await schema.safeParseAsync(input) : schema.safeParse(input);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, 'too_big');
    assert.equal(result.error.issues[0].message, 'upper bound');
    assert.equal(visits, 0);
  }
}
const normal = z.object({ title: z.string(), count: z.number() });
assert.deepEqual(normal.parse({ title: 'article', count: 2 }), { title: 'article', count: 2 });
assert.deepEqual(await normal.parseAsync({ title: 'article', count: 2 }), { title: 'article', count: 2 });
assert.equal(normal.safeParse({ title: 3, count: 2 }).error.issues[0].code, 'invalid_type');
assert.equal((await normal.safeParseAsync({ title: 3, count: 2 })).error.issues[0].code, 'invalid_type');
assert.equal(z.array(z.string()).min(3).safeParse(['a', 2]).error.issues.length, 2);
assert.equal(z.set(z.string()).min(3).safeParse(new Set(['a', 2])).error.issues.length, 2);
assert.deepEqual(z.array(z.string()).max(3).parse(['a', 'b', 'c']), ['a', 'b', 'c']);
assert.equal(z.function().safeParse(() => null).success, true);
const reactLike = { $$typeof: Symbol.for('react.element') };
Object.defineProperty(reactLike, 'ref', { get() { throw new Error('React warning getter must not execute'); } });
assert.equal(z.object({ icon: z.any(), component: z.any() }).safeParse({ icon: reactLike, component: () => null }).success, true);
const cycle = {}; cycle.self = cycle;
resource(z.any().safeParse(cycle), 'cycle');
let getterCalls = 0;
const accessor = {}; Object.defineProperty(accessor, 'then', { get() { getterCalls++; throw new Error('Must not run'); } });
resource(z.any().safeParse(accessor), 'accessor');
assert.equal(getterCalls, 0);
let mapped = 0;
const invalid = Array.from({ length: 1100 }, (_, i) => i);
resource(z.array(z.string()).safeParse(invalid, { errorMap() { mapped++; return { message: 'mapped' }; } }), 'issues');
assert.equal(mapped, 1000);
let ordinaryMapped = 0;
const mappedFailure = z.string().safeParse(2, { errorMap() { ordinaryMapped++; return { message: 'ordinary mapped' }; } });
assert.equal(mappedFailure.error.issues[0].message, 'ordinary mapped');
assert.equal(ordinaryMapped, 1);
resource(await z.array(z.string()).safeParseAsync(invalid), 'issues');
resource(z.array(z.string()).catch([]).safeParse(invalid), 'issues');
resource(await z.array(z.string()).catch([]).safeParseAsync(invalid), 'issues');
standardResource(await z.array(z.string())['~standard'].validate(invalid), 'issues');
const learnedAsync = z.array(z.string()).refine(async () => true);
assert.deepEqual(await learnedAsync['~standard'].validate(['a']), { value: ['a'] });
const asyncPreflight = learnedAsync['~standard'].validate(new Array(10000));
assert.equal(asyncPreflight instanceof Promise, true);
standardResource(await asyncPreflight, 'container-size');
const union = z.union(Array.from({ length: 5 }, () => z.array(z.string())));
resource(union.safeParse(invalid.slice(0, 300)), 'issues');
resource(await union.safeParseAsync(invalid.slice(0, 300)), 'issues');
const laterValidUnion = z.union([z.array(z.string()), z.any()]);
resource(laterValidUnion.safeParse(invalid), 'issues');
resource(await laterValidUnion.safeParseAsync(invalid), 'issues');
// Stable returned resource errors are detached from pending branch issue arrays.
const stable = resource(await union.safeParseAsync(invalid.slice(0, 300)), 'issues');
const stableText = JSON.stringify(stable);
await drain(); assert.equal(JSON.stringify(stable), stableText);
const ordinary = new Error('ordinary callback failure');
const throws = z.preprocess(() => { throw ordinary; }, z.any());
assert.throws(() => throws.safeParse(null), error => error === ordinary);
await assert.rejects(throws.safeParseAsync(null), error => error === ordinary);
await assert.rejects(throws['~standard'].validate(null), error => error === ordinary);
const rejects = z.any().superRefine(async () => { throw ordinary; });
await assert.rejects(rejects.safeParseAsync(null), error => error === ordinary);
await assert.rejects(rejects['~standard'].validate(null), error => error === ordinary);
// Cover direct _parse dispatch in Map/Set/Object/Record and _parseAsync in Array,
// with synchronous and post-await budget exhaustion and delayed ordinary errors.
for (const asyncCap of [false, true]) {
  for (const reverse of [false, true]) {
    for (const kind of ['array', 'map', 'set', 'object', 'record', 'union']) {
      const issueLoop = ctx => { for (let i = 0; i < 1100; i++) ctx.addIssue({ code: 'custom', message: 'fanout' }); };
      const child = asyncCap
        ? z.any().superRefine(async (value, ctx) => {
            if (value === 'delay') { await new Promise(resolve => setImmediate(resolve)); throw ordinary; }
            await Promise.resolve(); issueLoop(ctx);
          })
        : z.preprocess((value, ctx) => {
            if (value === 'delay') return new Promise((_, reject) => setImmediate(() => reject(ordinary)));
            issueLoop(ctx); return value;
          }, z.any());
      const values = reverse ? ['cap', 'delay'] : ['delay', 'cap'];
      let schema, input;
      if (kind === 'array') { schema = z.array(child); input = values; }
      if (kind === 'set') { schema = z.set(child); input = new Set(values); }
      if (kind === 'map') { schema = z.map(child, child); input = new Map([[values[0], values[1]]]); }
      if (kind === 'object') { schema = z.object({ a: child, b: child }); input = { a: values[0], b: values[1] }; }
      if (kind === 'record') { schema = z.record(child); input = { a: values[0], b: values[1] }; }
      if (kind === 'union') {
        const cap = z.preprocess(() => 'cap', child), delayed = z.preprocess(() => 'delay', child);
        schema = z.union(reverse ? [cap, delayed] : [delayed, cap]); input = null;
      }
      // Map/object/record preserve their sequential first-error behavior. When
      // the first awaited child is the ordinary failure it must still reject
      // with that same Error, while later sentinel rejections stay observed.
      const ordinaryFirst = !reverse && ['map', 'object', 'record'].includes(kind);
      if (ordinaryFirst) await assert.rejects(schema.safeParseAsync(input), error => error === ordinary);
      else resource(await schema.safeParseAsync(input), 'issues');
      await drain();
    }
  }
}
// Standard Schema retries an async refinement after a sync probe. Both attempts
// share the budget; even the discarded probe promise must remain observed.
const probe = z.any().superRefine(async (_, ctx) => {
  await Promise.resolve();
  for (let i = 0; i < 1100; i++) ctx.addIssue({ code: 'custom', message: 'probe fanout' });
});
const probeResult = await probe['~standard'].validate(null);
standardResource(probeResult, 'issues');
await drain();
assert.equal(probeResult.issues.length, 1);
const summary = { status: 'PASS', format, parserWrappers: 36, effectProbeObservers: 3, asyncMixedCases: 24 };
if (parentPort) parentPort.postMessage(summary); else console.log(JSON.stringify(summary));
`

function runProof(fixture: { temporary: string; entry: string }, format: 'esm' | 'cjs') {
  const filename = path.join(fixture.temporary, 'runtime-proof.mjs')
  writeFileSync(filename, runtimeProof)
  return new Promise<unknown>((resolve, reject) => {
    const worker = new Worker(filename, { argv: [fixture.entry, format], execArgv: ['--unhandled-rejections=strict'] })
    let result: unknown
    const timeout = setTimeout(() => { void worker.terminate(); reject(new Error('Zod runtime proof worker timed out')) }, 30000)
    worker.on('message', value => { result = value })
    worker.once('error', error => { clearTimeout(timeout); reject(error) })
    worker.once('exit', code => {
      clearTimeout(timeout)
      if (code === 0 && result !== undefined) resolve(result)
      else reject(new Error(`Zod runtime proof worker exited with code ${code}`))
    })
  })
}

describe('CMS Zod transformer unit guards', () => {
  it('converts the standalone resource helper without changing its public API', () => {
    const source = resourceModuleSource('cjs')
    const commonJsModule = { exports: {} as Record<string, unknown> }
    vm.runInNewContext(source, { module: commonJsModule, Object, Reflect, Map, Set, Array, Symbol, WeakSet, Number })
    expect(Object.keys(commonJsModule.exports).sort()).toEqual([
      'CMS_VALIDATION_ISSUE_LIMIT', 'CMS_VALIDATION_LIMITS', 'cmsResourceIssue',
      'consumeCmsValidationIssue', 'createCmsValidationBudget', 'inspectCmsValidationInput',
    ])
    expect(resourceModuleSource('esm')).toContain('export function inspectCmsValidationInput')
  })

  it('places budget consumption before error maps and makeIssue, in both module formats', () => {
    const source = 'export function addIssueToContext(ctx, issueData) { const issue = makeIssue(issueData); ctx.common.issues.push(issue); }'
    for (const format of ['esm', 'cjs'] as const) {
      const transformed = transformZodParseUtil(format === 'cjs' ? source.replace('export ', '') : source, format)
      expect(transformed.indexOf('consumeCmsValidationIssue(ctx)')).toBeLessThan(transformed.indexOf('makeIssue(issueData)'))
      expect(transformed).toContain(format === 'esm' ? '../filecompresser-resources.js' : '../filecompresser-resources.cjs')
      expect(() => transformZodParseUtil(transformed, format)).toThrow('already transformed')
    }
  })

  it('fails closed on malformed, missing or duplicated target patterns and invalid formats', () => {
    expect(() => transformZodTypes('class ZodType {}')).toThrow('ZodString class')
    expect(() => transformZodTypes('class {')).toThrow('syntax')
    expect(() => transformZodParseUtil('function unrelated() {}')).toThrow('declaration count')
    const declaration = 'function addIssueToContext(ctx, issueData) { makeIssue(issueData); }'
    expect(() => transformZodParseUtil(`${declaration}\n${declaration}`)).toThrow('declaration count')
    expect(() => transformZodTypes('', 'invalid')).toThrow('module format')
    expect(() => resourceModuleSource('invalid')).toThrow('module format')
  })
})

describe('CMS exact Zod3 transformed runtime', () => {
  it.each(['esm', 'cjs'] as const)('validates actual %s parser behavior and observes every normal async container path', async format => {
    const fixture = runtimeFixture(format)
    try {
      const output = await runProof(fixture, format)
      expect(output).toEqual({ status: 'PASS', format, parserWrappers: 36, effectProbeObservers: 3, asyncMixedCases: 24 })
      const transformed = readFileSync(path.join(fixture.temporary, `v3/types${format === 'esm' ? '.js' : '.cjs'}`), 'utf8')
      const compiled = ts.transpileModule(transformed, { reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } })
      expect(compiled.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([])
    } finally { rmSync(fixture.temporary, { recursive: true, force: true }) }
  }, 40000)
})
