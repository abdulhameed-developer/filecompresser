import { CMS_VALIDATION_LIMITS } from './resource-limits.mjs'

const ADVISORY = 'GHSA-mrhx-c7xc-m3w5'
const ADVISORY_URL = `https://github.com/advisories/${ADVISORY}`
const ADVISORY_SOURCE = 1243066
const ZOD_VERSION = '3.25.76'
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical']
const PINS = Object.freeze({
  tinacms: '3.15.2',
  '@tinacms/cli': '4.0.5',
  '@tinacms/app': '2.6.0',
  '@tinacms/graphql': '4.1.0',
  '@tinacms/mdx': '2.4.2',
  '@tinacms/schema-tools': '2.11.0',
  '@tinacms/search': '1.2.26',
  zod: ZOD_VERSION,
})
const MAX_RECORDS = 10000
const MAX_LIST = 4096
const PACKAGE_NAME = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/
const NODE_PATH = /^node_modules\/(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(?:\/node_modules\/(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)*$/

function reject(reason) {
  throw new Error(`CMS dependency audit rejected: ${reason}`)
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) {
    reject(`${label} must be an object`)
  }
  return value
}

function nonnegative(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) reject(`${label} must be a nonnegative integer`)
}

function nonemptyString(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_LIST) {
    reject(`${label} must be a bounded nonempty string`)
  }
}

function list(value, label, allowEmpty = true) {
  if (!Array.isArray(value) || value.length > MAX_LIST || (!allowEmpty && !value.length)) {
    reject(`${label} must be a bounded${allowEmpty ? '' : ' nonempty'} array`)
  }
  return value
}

function packageName(value, label) {
  nonemptyString(value, label)
  if (!PACKAGE_NAME.test(value) || value === '.' || value === '..') reject(`${label} is not a package name`)
}

function nodePath(value, name, label) {
  nonemptyString(value, label)
  if (!NODE_PATH.test(value) || !value.endsWith(`node_modules/${name}`)
    || value.split('/').some(part => part === '.' || part === '..')) {
    reject(`${label} is not an installed path for ${name}`)
  }
}

function uniqueStrings(value, label, validate) {
  const strings = list(value, label)
  const seen = new Set()
  for (const item of strings) {
    validate(item, label)
    if (seen.has(item)) reject(`${label} contains a duplicate`)
    seen.add(item)
  }
  return seen
}

function advisory(value, label) {
  const issue = record(value, label)
  nonnegative(issue.source, `${label}.source`)
  if (!issue.source) reject(`${label}.source must identify an advisory`)
  packageName(issue.name, `${label}.name`)
  packageName(issue.dependency, `${label}.dependency`)
  nonemptyString(issue.title, `${label}.title`)
  nonemptyString(issue.url, `${label}.url`)
  if (!issue.url.startsWith('https://')) reject(`${label}.url must use HTTPS`)
  nonemptyString(issue.range, `${label}.range`)
  if (!SEVERITIES.includes(issue.severity)) reject(`${label}.severity is unknown`)
  return issue
}

/** Validate npm audit v2 without changing or reducing any raw counts/findings. */
function auditReport(value, label) {
  const report = record(value, label)
  if (Object.hasOwn(report, 'error')) reject(`${label} contains an npm error`)
  if (report.auditReportVersion !== 2) reject(`${label} requires npm audit report version 2`)
  const metadata = record(report.metadata, `${label}.metadata`)
  const counts = record(metadata.vulnerabilities, `${label}.metadata.vulnerabilities`)
  if (Object.keys(counts).length !== SEVERITIES.length + 1) reject(`${label} has unknown vulnerability counts`)
  for (const key of [...SEVERITIES, 'total']) nonnegative(counts[key], `${label}.counts.${key}`)
  if (SEVERITIES.reduce((sum, key) => sum + counts[key], 0) !== counts.total) {
    reject(`${label} vulnerability counts do not sum to total`)
  }
  if (Object.hasOwn(metadata, 'dependencies')) {
    const dependencies = record(metadata.dependencies, `${label}.metadata.dependencies`)
    for (const key of ['prod', 'dev', 'optional', 'peer', 'peerOptional', 'total']) {
      nonnegative(dependencies[key], `${label}.dependencies.${key}`)
    }
    // npm categories overlap: optional/peer counts must not be summed.
    for (const [key, count] of Object.entries(dependencies)) nonnegative(count, `${label}.dependencies.${key}`)
  }
  const vulnerabilities = record(report.vulnerabilities, `${label}.vulnerabilities`)
  const entries = Object.entries(vulnerabilities)
  if (entries.length > MAX_RECORDS) reject(`${label} has too many vulnerability records`)
  const actual = Object.fromEntries(SEVERITIES.map(severity => [severity, 0]))
  let edges = 0
  for (const [name, value] of entries) {
    packageName(name, `${label} vulnerability key`)
    const finding = record(value, `${label}.${name}`)
    if (finding.name !== name) reject(`${label}.${name} has a mismatched name`)
    if (!SEVERITIES.includes(finding.severity)) reject(`${label}.${name} has an unknown severity`)
    actual[finding.severity]++
    if (typeof finding.isDirect !== 'boolean') reject(`${label}.${name}.isDirect must be boolean`)
    nonemptyString(finding.range, `${label}.${name}.range`)
    const nodes = uniqueStrings(finding.nodes, `${label}.${name}.nodes`, path => nodePath(path, name, `${name}.node`))
    if (!nodes.size) reject(`${label}.${name} has no installed nodes`)
    uniqueStrings(finding.effects, `${label}.${name}.effects`, packageName)
    const causes = list(finding.via, `${label}.${name}.via`, false)
    edges += causes.length
    if (edges > CMS_VALIDATION_LIMITS.maxNodes) reject(`${label} has too many advisory graph edges`)
    for (const via of causes) {
      if (typeof via === 'string') {
        packageName(via, `${label}.${name}.via`)
        if (!Object.hasOwn(vulnerabilities, via)) reject(`${label}.${name} has unknown via package ${via}`)
      } else {
        const issue = advisory(via, `${label}.${name}.via`)
        if (SEVERITIES.indexOf(issue.severity) > SEVERITIES.indexOf(finding.severity)) {
          reject(`${label}.${name} understates its advisory severity`)
        }
      }
    }
    if (typeof finding.fixAvailable !== 'boolean') {
      const fix = record(finding.fixAvailable, `${label}.${name}.fixAvailable`)
      packageName(fix.name, `${label}.${name}.fixAvailable.name`)
      nonemptyString(fix.version, `${label}.${name}.fixAvailable.version`)
      if (typeof fix.isSemVerMajor !== 'boolean') reject(`${label}.${name} has malformed fix metadata`)
    }
  }
  for (const severity of SEVERITIES) {
    if (actual[severity] !== counts[severity]) reject(`${label} has stale ${severity} vulnerability counts`)
  }
  return { counts: { ...counts }, vulnerabilities }
}

function samePaths(expected, actual, label) {
  if (expected.size !== actual.size || [...expected].some(path => !actual.has(path))) {
    reject(`${label} do not match exactly`)
  }
}

/** Evidence is produced by the installed-file hash checker and executed probes. */
function verifiedBackport(value, vulnerabilities) {
  const evidence = record(value, 'backport evidence')
  if (evidence.verified !== true || evidence.advisory !== ADVISORY || evidence.version !== ZOD_VERSION) {
    reject('the pinned Zod backport is not verified')
  }
  const limits = record(evidence.resourcePolicy, 'backport resource policy')
  if (Object.keys(limits).length !== Object.keys(CMS_VALIDATION_LIMITS).length
    || Object.entries(CMS_VALIDATION_LIMITS).some(([key, limit]) => limits[key] !== limit)) {
    reject('backport resource policy does not match the fixed limits')
  }
  const proof = record(evidence.proof, 'backport proof')
  for (const key of ['passed', 'esm', 'cjs', 'issueBudget', 'graphCaps', 'boundedBackport', 'asyncObserved']) {
    if (proof[key] !== true) reject(`backport proof ${key} did not pass`)
  }
  const instances = list(evidence.instances, 'backport instances', false)
  const instancePaths = new Set()
  for (const instance of instances) {
    record(instance, 'backport instance')
    nodePath(instance.nodePath, 'zod', 'backport instance path')
    if (instancePaths.has(instance.nodePath)) reject('duplicate backport instance')
    instancePaths.add(instance.nodePath)
    if (instance.version !== ZOD_VERSION) reject('backport instance has an unreviewed version')
    for (const key of ['originalFilesVerified', 'patchedFilesVerified', 'resourceHelpersVerified', 'proofPassed']) {
      if (instance[key] !== true) reject(`backport instance ${key} did not pass`)
    }
  }
  const zod = vulnerabilities.zod
  if (!zod || zod.severity !== 'high') reject('the expected Zod advisory is missing')
  samePaths(new Set(zod.nodes), instancePaths, 'audited and verified Zod instances')

  const consumers = new Map()
  for (const consumer of list(evidence.consumers, 'verified consumers', false)) {
    record(consumer, 'verified consumer')
    packageName(consumer.name, 'verified consumer name')
    if (!Object.hasOwn(PINS, consumer.name) || consumer.version !== PINS[consumer.name]) {
      reject(`unreviewed high consumer version: ${consumer.name}`)
    }
    nodePath(consumer.nodePath, consumer.name, 'verified consumer path')
    if (consumers.has(consumer.nodePath)) reject('duplicate verified consumer path')
    consumers.set(consumer.nodePath, consumer)
  }
  samePaths(instancePaths, new Set([...consumers.values()]
    .filter(consumer => consumer.name === 'zod').map(consumer => consumer.nodePath)),
  'verified Zod instances and consumers')
  return { instances, consumers }
}

function expectedAdvisory(issue, owner) {
  return owner === 'zod' && issue.source === ADVISORY_SOURCE && issue.name === 'zod'
    && issue.dependency === 'zod' && issue.url === ADVISORY_URL
    && issue.severity === 'high' && issue.range === '<4.6.6'
}

/** Iterative traversal tolerates Tina's cycles but rejects cycles without Zod. */
function reachesBackport(name, vulnerabilities) {
  const pending = [name]
  const visited = new Set()
  let reaches = false
  while (pending.length) {
    const current = pending.pop()
    if (visited.has(current)) continue
    visited.add(current)
    for (const via of vulnerabilities[current].via) {
      if (typeof via === 'string') {
        if (!visited.has(via)) pending.push(via)
      } else if (expectedAdvisory(via, current)) reaches = true
    }
  }
  return reaches
}

/**
 * Apply one explicit advisory disposition, never a severity-wide exception.
 * Original npm findings and counts remain visible, including moderate/low
 * findings and npm's unsafe downgrade recommendations. No dependency is edited.
 *
 * @param {unknown} all npm audit --json output
 * @param {unknown} production npm audit --omit=dev --json output
 * @param {unknown} evidence Installed hashes, resource limits and executed probes
 */
export function evaluateCmsDependencyAudit(all, production, evidence) {
  const full = auditReport(all, 'all dependencies')
  const prod = auditReport(production, 'production dependencies')
  if (prod.counts.total > 0) reject('production dependencies contain vulnerabilities')
  if (full.counts.critical > 0) reject('critical vulnerabilities have no disposition')
  const report = {
    status: 'clean',
    raw: { all: full.counts, production: prod.counts },
    findings: { all: full.vulnerabilities, production: prod.vulnerabilities },
    disposition: null,
  }
  if (full.counts.high === 0) return report

  const verified = verifiedBackport(evidence, full.vulnerabilities)
  const affectedPackages = []
  // Inspect all concrete advisories before following parent links, so a changed
  // root advisory is reported directly rather than as a missing graph route.
  for (const [name, finding] of Object.entries(full.vulnerabilities)) {
    for (const via of finding.via) {
      if (typeof via !== 'string' && via.severity === 'high' && !expectedAdvisory(via, name)) {
        reject(`unreviewed concrete high advisory in ${name}`)
      }
    }
  }
  for (const [name, finding] of Object.entries(full.vulnerabilities)) {
    if (finding.severity !== 'high') continue
    if (!Object.hasOwn(PINS, name)) reject(`unreviewed high package ${name}`)
    for (const path of finding.nodes) {
      const consumer = verified.consumers.get(path)
      if (!consumer || consumer.name !== name || consumer.version !== PINS[name]) {
        reject(`unverified high package path ${path}`)
      }
    }
    if (!reachesBackport(name, full.vulnerabilities)) reject(`${name} does not reach the verified Zod advisory`)
    affectedPackages.push({ name, version: PINS[name], nodes: [...finding.nodes] })
  }
  return {
    ...report,
    status: 'verified-backport-disposition',
    disposition: {
      advisory: ADVISORY,
      source: ADVISORY_SOURCE,
      package: 'zod',
      version: ZOD_VERSION,
      reason: 'Verified local Zod 3.25.76 backport and bounded parser resource policy; npm still reports the upstream affected range.',
      resourcePolicy: { ...CMS_VALIDATION_LIMITS },
      instances: verified.instances,
      affectedPackages,
    },
  }
}
