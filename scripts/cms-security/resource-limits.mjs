// Policy for ordinary CMS/config data, not a sandbox for executable JavaScript.
// Functions, React values and non-plain class instances are opaque leaves.
// Pristine built-in prototypes are assumed. Proxy reflection, strings/regexes,
// preprocessors and schema fan-out need separate boundaries.
export const CMS_VALIDATION_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 20000,
  maxContainerSize: 4096,
  maxIssues: 1000,
})

export const CMS_VALIDATION_ISSUE_LIMIT = Symbol.for('filecompresser.cms-zod.issue-limit.v1')

const ownDescriptor = Object.getOwnPropertyDescriptor
const ownKeys = Reflect.ownKeys
const prototypeOf = Object.getPrototypeOf
const mapSize = ownDescriptor(Map.prototype, 'size').get
const setSize = ownDescriptor(Set.prototype, 'size').get
const mapEntries = Map.prototype.entries
const setValues = Set.prototype.values
const objectPrototype = Object.prototype
const arrayPrototype = Array.prototype
const mapPrototype = Map.prototype
const setPrototype = Set.prototype
const reactValueTypes = new Set([
  'react.element', 'react.transitional.element', 'react.portal', 'react.memo',
  'react.forward_ref', 'react.lazy', 'react.provider', 'react.context', 'react.consumer',
].map(name => Symbol.for(name)))

const violation = (reason, limit) => ({ reason, limit })

// First stop common large enumerable objects without explicitly materializing
// every key. Reflect.ownKeys is still necessary to reject hidden/symbol getters;
// JavaScript offers no bounded iterator over all own property descriptors.
function boundedOwnKeys(value, array) {
  let enumerable = 0
  for (const key in value) {
    if (ownDescriptor(value, key) && ++enumerable > CMS_VALIDATION_LIMITS.maxContainerSize) {
      return violation('container-size', CMS_VALIDATION_LIMITS.maxContainerSize)
    }
  }
  const keys = ownKeys(value)
  if (keys.length - (array ? 1 : 0) > CMS_VALIDATION_LIMITS.maxContainerSize) {
    return violation('container-size', CMS_VALIDATION_LIMITS.maxContainerSize)
  }
  return keys
}

/**
 * Root depth is zero. Count every scheduled occurrence, including primitives,
 * array holes, shared DAG references, and both Map keys and values. Reject
 * ancestor cycles; repeated acyclic references are accepted within the budget.
 * Traversed containers reject all own accessors without invoking them.
 */
export function inspectCmsValidationInput(value) {
  const stack = [{ value, depth: 0, exit: false }]
  const ancestors = new WeakSet()
  let scheduled = 1

  try {
    while (stack.length) {
      const frame = stack.pop()
      if (frame.exit) {
        ancestors.delete(frame.value)
        continue
      }
      const current = frame.value
      if (current === null || typeof current !== 'object') continue

      // React development values can contain warning getters and owner cycles.
      // An own data Symbol tag identifies trusted config values; JSON content
      // cannot manufacture this capability. Never evaluate a tag getter.
      const reactType = ownDescriptor(current, '$$typeof')
      if (reactType && 'value' in reactType && reactValueTypes.has(reactType.value)) continue

      let kind
      let arrayLength = 0
      if (Array.isArray(current)) {
        kind = 'array'
        // Native arrays have an own, non-accessor length property.
        arrayLength = ownDescriptor(current, 'length').value
        if (arrayLength > CMS_VALIDATION_LIMITS.maxContainerSize) {
          return violation('container-size', CMS_VALIDATION_LIMITS.maxContainerSize)
        }
        if (prototypeOf(current) !== arrayPrototype) return violation('container-behavior', 0)
      } else if (current instanceof Map) {
        kind = 'map'
        if (mapSize.call(current) > CMS_VALIDATION_LIMITS.maxContainerSize) {
          return violation('container-size', CMS_VALIDATION_LIMITS.maxContainerSize)
        }
        if (prototypeOf(current) !== mapPrototype) return violation('container-behavior', 0)
      } else if (current instanceof Set) {
        kind = 'set'
        if (setSize.call(current) > CMS_VALIDATION_LIMITS.maxContainerSize) {
          return violation('container-size', CMS_VALIDATION_LIMITS.maxContainerSize)
        }
        if (prototypeOf(current) !== setPrototype) return violation('container-behavior', 0)
      } else {
        const prototype = prototypeOf(current)
        // Dates and other class/config instances are opaque, as are functions.
        if (prototype !== null && prototype !== objectPrototype) continue
        kind = 'object'
      }

      if (ancestors.has(current)) return violation('cycle', 0)
      const keys = boundedOwnKeys(current, kind === 'array')
      if (!Array.isArray(keys)) return keys

      // Validate behavior before enumerating native container entries. Downstream
      // Zod uses instance iterators, so accepting overrides would bypass this gate.
      for (const key of keys) {
        const descriptor = ownDescriptor(current, key)
        if (!descriptor || !('value' in descriptor)) return violation('accessor', 0)
        if ((kind === 'array' && key === Symbol.iterator)
          || ((kind === 'map' || kind === 'set') && (key === 'size' || key === Symbol.iterator))
          || (kind === 'map' && key === 'entries')
          || (kind === 'set' && key === 'values')) {
          return violation('container-behavior', 0)
        }
      }

      ancestors.add(current)
      // An exit frame replaces the popped container frame. Child scheduling is
      // capped before pushing, so pending stack storage is also node-bounded.
      stack.push({ value: current, depth: frame.depth, exit: true })
      const schedule = child => {
        if (frame.depth >= CMS_VALIDATION_LIMITS.maxDepth) {
          return violation('depth', CMS_VALIDATION_LIMITS.maxDepth)
        }
        if (scheduled >= CMS_VALIDATION_LIMITS.maxNodes) {
          return violation('nodes', CMS_VALIDATION_LIMITS.maxNodes)
        }
        scheduled++
        stack.push({ value: child, depth: frame.depth + 1, exit: false })
        return null
      }

      if (kind === 'array') {
        for (let index = 0; index < arrayLength; index++) {
          const descriptor = ownDescriptor(current, String(index))
          const rejected = schedule(descriptor ? descriptor.value : undefined)
          if (rejected) return rejected
        }
      } else if (kind === 'map') {
        for (const [key, entry] of mapEntries.call(current)) {
          const rejected = schedule(key) || schedule(entry)
          if (rejected) return rejected
        }
      } else if (kind === 'set') {
        for (const entry of setValues.call(current)) {
          const rejected = schedule(entry)
          if (rejected) return rejected
        }
      }

      for (const key of keys) {
        if (kind === 'array' && (key === 'length'
          || (typeof key === 'string' && String(Number(key)) === key
            && Number.isInteger(Number(key)) && Number(key) >= 0 && Number(key) < arrayLength))) continue
        const rejected = schedule(ownDescriptor(current, key).value)
        if (rejected) return rejected
      }
    }
  } catch {
    // A reflective operation failed (for example a revoked or branded proxy).
    // Reflection itself can run Proxy traps; this is not a JavaScript sandbox.
    return violation('inspection', 0)
  }
  return null
}

export function createCmsValidationBudget() {
  return { issues: 0 }
}

export function consumeCmsValidationIssue(ctx) {
  // Every root parse must install this shared object before cloning contexts.
  // Creating a branch-local fallback here would let union branches reset it.
  const budget = ctx.common.fileCompresserBudget
  if (!budget || !Number.isSafeInteger(budget.issues) || budget.issues < 0) {
    throw CMS_VALIDATION_ISSUE_LIMIT
  }
  budget.issues++
  if (budget.issues > CMS_VALIDATION_LIMITS.maxIssues) throw CMS_VALIDATION_ISSUE_LIMIT
}

export function cmsResourceIssue(reason) {
  return {
    code: 'custom',
    message: `CMS validation stopped at the ${reason} resource limit.`,
    params: { resourceLimit: reason },
  }
}
