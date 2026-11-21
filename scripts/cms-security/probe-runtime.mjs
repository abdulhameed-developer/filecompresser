import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parentPort, workerData } from 'node:worker_threads'

const wait = delay => new Promise(resolve => setTimeout(resolve, delay))

function resourceFailure(result, reason) {
  assert.equal(result.success, false)
  assert.equal(result.error.issues.length, 1)
  assert.equal(result.error.issues[0].code, 'custom')
  assert.equal(result.error.issues[0].params.resourceLimit, reason)
}

async function formatProof(z) {
  let cases = 0
  assert.deepEqual(z.object({ value: z.string() }).parse({ value: 'ordinary input' }), { value: 'ordinary input' }); cases++
  assert.equal(z.string().safeParse(123).error.issues[0].code, 'invalid_type'); cases++
  const parsedFunction = z.function().args(z.number()).returns(z.number()).parse(value => value + 1)
  assert.equal(parsedFunction(2), 3)
  assert.throws(() => parsedFunction('wrong'), z.ZodError); cases++

  // Stay below the project graph caps here: these prove the honest upstream
  // upper-bound backport itself, rather than just its surrounding preflight.
  for (const kind of ['array-max', 'array-length', 'set-max', 'set-size']) {
    let visits = 0
    const item = z.preprocess(value => { visits++; return value }, z.string())
    const schema = kind === 'array-max' ? z.array(item).max(2)
      : kind === 'array-length' ? z.array(item).length(2)
        : kind === 'set-max' ? z.set(item).max(2) : z.set(item).size(2)
    const input = kind.startsWith('array') ? [0, 1, 2] : new Set([0, 1, 2])
    const result = schema.safeParse(input)
    assert.equal(visits, 0)
    assert.equal(result.success, false)
    assert.equal(result.error.issues.length, 1)
    assert.equal(result.error.issues[0].code, 'too_big')
    visits = 0
    const asynchronous = await schema.safeParseAsync(input)
    assert.equal(asynchronous.success, false)
    assert.equal(visits, 0)
    cases += 2
  }

  for (const input of [Array(4097).fill(0), new Set(Array.from({ length: 4097 }, (_, i) => i)), new Map(Array.from({ length: 4097 }, (_, i) => [i, i]))]) {
    resourceFailure(z.any().safeParse(input), 'container-size')
    resourceFailure(await z.any().safeParseAsync(input), 'container-size')
    cases += 2
  }
  const nodeFanout = Array.from({ length: 10 }, () => Array(3000).fill(0))
  resourceFailure(z.any().safeParse(nodeFanout), 'nodes'); cases++
  let deep = 0
  for (let i = 0; i < 66; i++) deep = { child: deep }
  resourceFailure(z.any().safeParse(deep), 'depth'); cases++
  const cycle = {}; cycle.self = cycle
  resourceFailure(z.any().safeParse(cycle), 'cycle'); cases++
  let getterVisited = false
  const accessor = Object.defineProperty({}, 'value', { get() { getterVisited = true; throw Error('must not execute') } })
  resourceFailure(z.any().safeParse(accessor), 'accessor')
  assert.equal(getterVisited, false); cases++

  const values = Array.from({ length: 1200 }, (_, i) => i)
  for (const asynchronous of [false, true]) {
    const item = z.any().superRefine(async (_value, context) => {
      if (asynchronous) await Promise.resolve()
      context.addIssue({ code: 'custom', message: 'synthetic invalid input' })
    })
    // A synchronous validator for the sync cases preserves ordinary API mode.
    const syncItem = z.any().superRefine((_value, context) => context.addIssue({ code: 'custom', message: 'synthetic invalid input' }))
    const validator = asynchronous ? item : syncItem
    const casesToRun = [
      [z.array(validator), values],
      [z.set(validator), new Set(values)],
      [z.map(z.number(), validator), new Map(values.map(value => [value, value]))],
      [z.record(validator), Object.fromEntries(values.map(value => [`key${value}`, value]))],
      [z.object(Object.fromEntries(values.map(value => [`key${value}`, validator]))), Object.fromEntries(values.map(value => [`key${value}`, value]))],
      [z.union(values.map(() => validator)), 'not-valid'],
    ]
    for (const [schema, input] of casesToRun) {
      const result = asynchronous ? await schema.safeParseAsync(input) : schema.safeParse(input)
      resourceFailure(result, 'issues')
      cases++
    }
  }

  const standard = z.array(z.string())['~standard'].validate(Array(4097).fill(0))
  assert.ok(!(standard instanceof Promise))
  assert.equal(standard.issues.length, 1)
  assert.match(standard.issues[0].message, /resource limit/); cases++
  assert.throws(() => z.any().parse(Array(4097).fill(0)), z.ZodError); cases++
  await assert.rejects(z.any().parseAsync(Array(4097).fill(0)), z.ZodError); cases++
  const ordinaryError = Error('ordinary callback failure')
  assert.throws(() => z.preprocess(() => { throw ordinaryError }, z.any()).safeParse(1), error => error === ordinaryError)
  await assert.rejects(z.any().refine(async () => { throw ordinaryError }).safeParseAsync(1), error => error === ordinaryError)
  cases += 2

  // A real async sibling may reject after another branch exhausts the issue
  // budget. Every dispatched promise remains observed, including branches
  // whose resource failure wins. Ordinary sequential first errors retain their
  // original identity. Strict worker rejection handling makes leaks fatal.
  for (const asyncCap of [false, true]) {
    for (const reverse of [false, true]) {
      for (const kind of ['array', 'map', 'set', 'object', 'record', 'union']) {
        const issueLoop = context => {
          for (let i = 0; i < 1100; i++) context.addIssue({ code: 'custom', message: 'synthetic issue fanout' })
        }
        const child = asyncCap
          ? z.any().superRefine(async (value, context) => {
            if (value === 'delay') { await new Promise(resolve => setImmediate(resolve)); throw ordinaryError }
            await Promise.resolve(); issueLoop(context)
          })
          : z.preprocess((value, context) => {
            if (value === 'delay') return new Promise((_, reject) => setImmediate(() => reject(ordinaryError)))
            issueLoop(context); return value
          }, z.any())
        const values = reverse ? ['cap', 'delay'] : ['delay', 'cap']
        let schema, input
        if (kind === 'array') { schema = z.array(child); input = values }
        if (kind === 'set') { schema = z.set(child); input = new Set(values) }
        if (kind === 'map') { schema = z.map(child, child); input = new Map([[values[0], values[1]]]) }
        if (kind === 'object') { schema = z.object({ a: child, b: child }); input = { a: values[0], b: values[1] } }
        if (kind === 'record') { schema = z.record(child); input = { a: values[0], b: values[1] } }
        if (kind === 'union') {
          const cap = z.preprocess(() => 'cap', child), delayed = z.preprocess(() => 'delay', child)
          schema = z.union(reverse ? [cap, delayed] : [delayed, cap]); input = null
        }
        if (!reverse && ['map', 'object', 'record'].includes(kind)) {
          await assert.rejects(schema.safeParseAsync(input), error => error === ordinaryError)
        } else resourceFailure(await schema.safeParseAsync(input), 'issues')
        for (let turn = 0; turn < 4; turn++) await new Promise(resolve => setImmediate(resolve))
        cases++
      }
    }
  }
  const learnedAsync = z.array(z.string()).refine(async () => true)
  assert.deepEqual(await learnedAsync['~standard'].validate(['valid']), { value: ['valid'] }); cases++
  const rejectedAsyncGraph = learnedAsync['~standard'].validate(Array(4097).fill(0))
  assert.ok(rejectedAsyncGraph instanceof Promise)
  assert.equal((await rejectedAsyncGraph).issues[0].params.resourceLimit, 'container-size'); cases++
  const asyncProbe = z.any().superRefine(async (_value, context) => {
    await Promise.resolve()
    for (let i = 0; i < 1100; i++) context.addIssue({ code: 'custom', message: 'synthetic async probe fanout' })
  })
  const probeResult = await asyncProbe['~standard'].validate(null)
  assert.equal(probeResult.issues.length, 1)
  assert.equal(probeResult.issues[0].params.resourceLimit, 'issues'); cases++
  await wait(25)
  return { cases, passed: true }
}

async function zodProof(directory) {
  const metadata = createRequire(import.meta.url)(path.join(directory, 'package.json'))
  assert.equal(metadata.name, 'zod')
  assert.equal(metadata.version, '3.25.76')
  const require = createRequire(import.meta.url)
  const cjs = require(path.join(directory, 'v3', 'index.cjs'))
  const esm = await import(pathToFileURL(path.join(directory, 'v3', 'index.js')).href)
  const cjsResult = await formatProof(cjs.z)
  const esmResult = await formatProof(esm.z)
  return { passed: true, cjs: cjsResult, esm: esmResult, boundedBackport: true, graphCaps: true, issueBudget: true, asyncObserved: true }
}

async function cmsContractProof(projectRoot) {
  const require = createRequire(path.join(projectRoot, 'package.json'))
  const schemaTools = await import(pathToFileURL(require.resolve('@tinacms/schema-tools')).href)
  assert.equal(typeof schemaTools.validateSchema, 'function')
  const { collections } = await import(pathToFileURL(path.join(projectRoot, 'tina', 'collections.mjs')).href)
  schemaTools.validateSchema({ schema: { collections } })
  assert.throws(() => schemaTools.validateSchema({ schema: { collections: [{
    name: 'invalid name', path: 'content/posts', fields: [{ type: 'string', name: 'title' }],
  }] } }), error => error.name === 'TinaSchemaValidationError' && error.message.length > 0)
  assert.throws(() => schemaTools.validateSchema({ schema: { collections: Array(4097).fill(collections[0]) } }),
    error => error.name === 'TinaSchemaValidationError' && /resource limit/.test(error.message))
  return { passed: true, cases: 3, actualApi: '@tinacms/schema-tools.validateSchema', configuredSchemaAccepted: true, invalidSchemaRejected: true, oversizedSchemaRejected: true }
}

if (!parentPort) throw Error('Run CMS regression probes through the guarded CMS security verifier.')
const result = workerData.mode === 'cms-contract'
  ? await cmsContractProof(workerData.projectRoot)
  : await zodProof(workerData.directory)
parentPort.postMessage(result)
