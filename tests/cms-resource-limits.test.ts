import { describe, expect, it } from 'vitest'
import { Component, createElement, forwardRef, memo } from 'react'
import {
  CMS_VALIDATION_ISSUE_LIMIT,
  CMS_VALIDATION_LIMITS,
  cmsResourceIssue,
  consumeCmsValidationIssue,
  createCmsValidationBudget,
  inspectCmsValidationInput,
} from '../scripts/cms-security/resource-limits.mjs'

const containerLimit = { reason: 'container-size', limit: 4096 }

function captureThrown(action: () => void) {
  try { action() } catch (error) { return error }
  throw new Error('Expected resource policy to stop validation')
}

describe('CMS input graph policy', () => {
  it('uses fixed finite limits and accepts ordinary config data and opaque component values', () => {
    expect(CMS_VALIDATION_LIMITS).toEqual({ maxDepth: 64, maxNodes: 20000, maxContainerSize: 4096, maxIssues: 1000 })
    expect(Object.isFrozen(CMS_VALIDATION_LIMITS)).toBe(true)
    class ComponentConfiguration {
      self = this
      get implementation() { throw new Error('Class internals must remain opaque') }
    }
    const component = () => 'component'
    Object.defineProperty(component, 'internal', { get() { throw new Error('Function internals must remain opaque') } })
    const config = Object.freeze({
      name: 'articles', fields: [{ name: 'title', type: 'string' }],
      component, instance: new ComponentConfiguration(), published: new Date('2026-01-01'),
      metadata: new Map([['language', 'en']]), tags: new Set(['one', 'two']),
      optional: undefined, empty: null, nullPrototype: Object.assign(Object.create(null), { enabled: true }),
    })
    expect(inspectCmsValidationInput(config)).toBeNull()
    for (const value of [null, undefined, true, 1, 'text', Symbol('label'), component]) {
      expect(inspectCmsValidationInput(value)).toBeNull()
    }
  })

  it('accepts actual React elements with development ref getters, memo/forwardRef and class config values', () => {
    const element = createElement('button', { ref: { current: null } }, 'Save')
    // React 18 development props deliberately expose a warning getter for ref.
    expect(Object.getOwnPropertyDescriptor(element.props, 'ref')?.get).toBeTypeOf('function')
    const forwarded = forwardRef<HTMLButtonElement>(function ConfigForwardRef() { return null })
    const memoized = memo(function ConfigMemo() { return null })
    class ConfigComponent extends Component { render() { return null } }
    expect(inspectCmsValidationInput({
      icon: element, component: forwarded, memoized, instance: new ConfigComponent({}),
    })).toBeNull()
  })

  it('does not let a JSON string or accessor masquerade as a React Symbol tag', () => {
    let calls = 0
    const stringTag = { $$typeof: 'react.element' }
    Object.defineProperty(stringTag, 'ref', { get() { calls++; throw new Error('Must not run') } })
    expect(inspectCmsValidationInput(stringTag)).toEqual({ reason: 'accessor', limit: 0 })
    const getterTag = {}
    Object.defineProperty(getterTag, '$$typeof', { get() { calls++; return Symbol.for('react.element') } })
    expect(inspectCmsValidationInput(getterTag)).toEqual({ reason: 'accessor', limit: 0 })
    expect(calls).toBe(0)
  })

  it('checks array length before touching its iterator', () => {
    const value = new Array(4097)
    let calls = 0
    Object.defineProperty(value, Symbol.iterator, { get() { calls++; throw new Error('Must not enumerate') } })
    expect(inspectCmsValidationInput(value)).toEqual(containerLimit)
    expect(calls).toBe(0)
  })

  it.each(['map', 'set'])('checks native %s size before overridden size or enumeration getters', kind => {
    const values = Array.from({ length: 4097 }, (_, index) => index)
    const value = kind === 'map' ? new Map(values.map(index => [index, index])) : new Set(values)
    let calls = 0
    Object.defineProperty(value, 'size', { get() { calls++; throw new Error('Must use intrinsic size') } })
    Object.defineProperty(value, kind === 'map' ? 'entries' : 'values', { get() { calls++; throw new Error('Must not enumerate') } })
    expect(inspectCmsValidationInput(value)).toEqual(containerLimit)
    expect(calls).toBe(0)
  })

  it('accepts the container boundary and stops larger plain objects including hidden properties', () => {
    expect(inspectCmsValidationInput(new Array(4096))).toBeNull()
    const object = Object.fromEntries(Array.from({ length: 4096 }, (_, index) => [index, index]))
    expect(inspectCmsValidationInput(object)).toBeNull()
    expect(inspectCmsValidationInput({ ...object, overflow: true })).toEqual(containerLimit)
    const hidden = {}
    for (let index = 0; index < 4097; index++) Object.defineProperty(hidden, index, { value: index })
    expect(inspectCmsValidationInput(hidden)).toEqual(containerLimit)
  })

  it('counts scheduled nodes, holes and every repeated DAG occurrence before growing pending work', () => {
    // 1 root + 5 arrays + 19,994 primitive positions = exactly 20,000 nodes.
    const exact = [...Array.from({ length: 4 }, () => new Array(4096)), new Array(3610)]
    expect(inspectCmsValidationInput(exact)).toBeNull()
    exact[4].push(undefined)
    expect(inspectCmsValidationInput(exact)).toEqual({ reason: 'nodes', limit: 20000 })
    const shared = new Array(4096)
    expect(inspectCmsValidationInput([shared, shared, shared, shared, shared])).toEqual({ reason: 'nodes', limit: 20000 })
    expect(inspectCmsValidationInput({ left: { data: 1 }, right: { data: 1 } })).toBeNull()
    const smallShared = { data: 1 }
    expect(inspectCmsValidationInput({ left: smallShared, right: smallShared })).toBeNull()
  })

  it('counts both Map keys and values towards the graph node budget', () => {
    const map = new Map(Array.from({ length: 4096 }, (_, index) => [index, index]))
    // Three occurrences would schedule 24,576 scalar nodes plus containers.
    expect(inspectCmsValidationInput([map, map, map])).toEqual({ reason: 'nodes', limit: 20000 })
    expect(inspectCmsValidationInput(map)).toBeNull()
  })

  it('defines root depth as zero and rejects depth 65 without recursion', () => {
    let value: unknown = 0
    for (let depth = 0; depth < 64; depth++) value = { child: value }
    expect(inspectCmsValidationInput(value)).toBeNull()
    expect(inspectCmsValidationInput({ child: value })).toEqual({ reason: 'depth', limit: 64 })
  })

  it('rejects ancestor cycles across objects and native containers, without rejecting an acyclic DAG', () => {
    const object: { self?: unknown } = {}
    object.self = object
    const array: unknown[] = []
    array.push(array)
    const set = new Set<unknown>()
    set.add(set)
    const map = new Map<unknown, unknown>()
    map.set(map, 'value')
    for (const value of [object, array, set, map]) {
      expect(inspectCmsValidationInput(value)).toEqual({ reason: 'cycle', limit: 0 })
    }
    const shared = { title: 'same' }
    expect(inspectCmsValidationInput([shared, shared])).toBeNull()
  })

  it.each(['enumerable', 'hidden', 'symbol', 'array-index', 'map-property'])('rejects a %s own accessor without invoking it', kind => {
    let calls = 0
    const get = () => { calls++; throw new Error('Accessor executed') }
    let value: object
    if (kind === 'array-index') {
      value = new Array(1)
      Object.defineProperty(value, '0', { get, enumerable: true })
    } else if (kind === 'map-property') {
      value = new Map([['a', 'b']])
      Object.defineProperty(value, 'metadata', { get })
    } else {
      value = {}
      Object.defineProperty(value, kind === 'symbol' ? Symbol('hidden') : 'data', { get, enumerable: kind === 'enumerable' })
    }
    expect(inspectCmsValidationInput(value)).toEqual({ reason: 'accessor', limit: 0 })
    expect(calls).toBe(0)
  })

  it('rejects custom container iteration and subclasses before invoking their implementation', () => {
    let calls = 0
    const array = [1]
    Object.defineProperty(array, Symbol.iterator, { value() { calls++; throw new Error('Custom iterator') } })
    const map = new Map([['a', 'b']])
    Object.defineProperty(map, 'entries', { value() { calls++; throw new Error('Custom entries') } })
    class CustomSet extends Set { values(): never { calls++; throw new Error('Custom values') } }
    for (const value of [array, map, new CustomSet([1])]) {
      expect(inspectCmsValidationInput(value)).toEqual({ reason: 'container-behavior', limit: 0 })
    }
    expect(calls).toBe(0)
  })

  it('fails closed when ordinary reflective inspection fails', () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    expect(inspectCmsValidationInput(proxy)).toEqual({ reason: 'inspection', limit: 0 })
  })
})

describe('CMS shared validation issue budget', () => {
  it('allows 1000 issues and stops the next attempted issue with a stable sentinel', () => {
    expect(CMS_VALIDATION_ISSUE_LIMIT).toBe(Symbol.for('filecompresser.cms-zod.issue-limit.v1'))
    const budget = createCmsValidationBudget()
    const ctx = { common: { fileCompresserBudget: budget } }
    for (let index = 0; index < 1000; index++) consumeCmsValidationIssue(ctx)
    expect(budget.issues).toBe(1000)
    expect(captureThrown(() => consumeCmsValidationIssue(ctx))).toBe(CMS_VALIDATION_ISSUE_LIMIT)
    expect(budget.issues).toBe(1001)
  })

  it('shares cumulative consumption across spread-cloned union/catch branch contexts', () => {
    const budget = createCmsValidationBudget()
    const root = { common: { fileCompresserBudget: budget, issues: [] } }
    const left = { common: { ...root.common, issues: [] } }
    const right = { common: { ...root.common, issues: [] } }
    expect(left.common.fileCompresserBudget).toBe(right.common.fileCompresserBudget)
    for (let index = 0; index < 500; index++) consumeCmsValidationIssue(left)
    for (let index = 0; index < 500; index++) consumeCmsValidationIssue(right)
    expect(captureThrown(() => consumeCmsValidationIssue(root))).toBe(CMS_VALIDATION_ISSUE_LIMIT)
    expect(budget.issues).toBe(1001)
    expect(root.common.issues).toEqual([])
  })

  it('does not create branch-local replacement budgets, and fails closed on invalid counters', () => {
    expect(captureThrown(() => consumeCmsValidationIssue({ common: {} }))).toBe(CMS_VALIDATION_ISSUE_LIMIT)
    for (const issues of [NaN, Infinity, -1, 0.5]) {
      expect(captureThrown(() => consumeCmsValidationIssue({ common: { fileCompresserBudget: { issues } } }))).toBe(CMS_VALIDATION_ISSUE_LIMIT)
    }
    const first = createCmsValidationBudget()
    const second = createCmsValidationBudget()
    consumeCmsValidationIssue({ common: { fileCompresserBudget: first } })
    expect(second.issues).toBe(0)
  })

  it('provides ordinary Zod3 custom issue data for a security-policy rejection', () => {
    expect(cmsResourceIssue('nodes')).toEqual({
      code: 'custom', message: 'CMS validation stopped at the nodes resource limit.',
      params: { resourceLimit: 'nodes' },
    })
  })
})
