import { describe, expect, it } from 'vitest'
import { evaluateCmsDependencyAudit } from '../scripts/cms-security/audit-policy.mjs'

type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical'
type Advisory = {
  source: number
  name: string
  dependency: string
  title: string
  url: string
  severity: Severity
  range: string
}
type Finding = {
  name: string
  severity: Severity
  isDirect: boolean
  via: (string | Advisory)[]
  effects: string[]
  range: string
  nodes: string[]
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean }
}

const pins: Record<string, string> = {
  tinacms: '3.15.2',
  '@tinacms/cli': '4.0.5',
  '@tinacms/app': '2.6.0',
  '@tinacms/graphql': '4.1.0',
  '@tinacms/mdx': '2.4.2',
  '@tinacms/schema-tools': '2.11.0',
  '@tinacms/search': '1.2.26',
  zod: '3.25.76',
}

function issue(overrides: Partial<Advisory> = {}): Advisory {
  return {
    source: 1243066,
    name: 'zod',
    dependency: 'zod',
    title: 'Zod can exhaust memory while validating oversized constrained collections',
    url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5',
    severity: 'high',
    range: '<4.6.6',
    ...overrides,
  }
}

function finding(name: string, via: (string | Advisory)[], severity: Severity = 'high'): Finding {
  return {
    name,
    severity,
    isDirect: name === 'tinacms' || name === '@tinacms/cli',
    via,
    effects: [],
    range: name === 'zod' ? '<4.6.6' : '*',
    nodes: [`node_modules/${name}`],
    fixAvailable: { name: 'tinacms', version: '1.2.1', isSemVerMajor: true },
  }
}

function audit(vulnerabilities: Record<string, Finding> = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
  for (const value of Object.values(vulnerabilities)) {
    counts[value.severity]++
    counts.total++
  }
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: counts,
      // Optional/peer groups overlap. Their sum intentionally exceeds total.
      dependencies: { prod: 32, dev: 1308, optional: 144, peer: 13, peerOptional: 0, total: 1376 },
    },
  }
}

function fixture() {
  const vulnerabilities = Object.fromEntries(Object.keys(pins).map(name => [
    name,
    finding(name, name === 'zod' ? [issue()] : ['zod']),
  ]))
  // Tina's real dependency graph includes a strongly connected component.
  vulnerabilities.tinacms.via = ['@tinacms/app', 'zod', 'other-moderate']
  vulnerabilities['@tinacms/app'].via = ['tinacms', 'zod']
  vulnerabilities['other-moderate'] = finding('other-moderate', [issue({
    source: 111,
    name: 'other-moderate',
    dependency: 'other-moderate',
    url: 'https://github.com/advisories/GHSA-test-test-test',
    severity: 'moderate',
    range: '<2.0.0',
  })], 'moderate')
  vulnerabilities['other-low'] = finding('other-low', [issue({
    source: 222,
    name: 'other-low',
    dependency: 'other-low',
    url: 'https://github.com/advisories/GHSA-loww-loww-loww',
    severity: 'low',
    range: '<2.0.0',
  })], 'low')
  return {
    all: audit(vulnerabilities),
    production: audit(),
    evidence: {
      verified: true,
      advisory: 'GHSA-mrhx-c7xc-m3w5',
      version: '3.25.76',
      resourcePolicy: { maxDepth: 64, maxNodes: 20000, maxContainerSize: 4096, maxIssues: 1000 },
      proof: {
        passed: true,
        esm: true,
        cjs: true,
        issueBudget: true,
        graphCaps: true,
        boundedBackport: true,
        asyncObserved: true,
      },
      instances: [{
        nodePath: 'node_modules/zod',
        version: '3.25.76',
        originalFilesVerified: true,
        patchedFilesVerified: true,
        resourceHelpersVerified: true,
        proofPassed: true,
      }],
      consumers: Object.entries(pins).map(([name, version]) => ({
        name, version, nodePath: `node_modules/${name}`,
      })),
    },
  }
}

describe('CMS dependency audit disposition', () => {
  it('accepts only the verified backport while preserving all raw findings and downgrade advice', () => {
    const { all, production, evidence } = fixture()
    const before = JSON.stringify({ all, production, evidence })
    const result = evaluateCmsDependencyAudit(all, production, evidence)

    expect(result.status).toBe('verified-backport-disposition')
    expect(result.raw).toEqual({
      all: { info: 0, low: 1, moderate: 1, high: 8, critical: 0, total: 10 },
      production: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    })
    expect(result.findings.all).toBe(all.vulnerabilities)
    expect(result.findings.all['other-moderate']).toEqual(all.vulnerabilities['other-moderate'])
    expect(result.findings.all.tinacms.fixAvailable).toEqual({
      name: 'tinacms', version: '1.2.1', isSemVerMajor: true,
    })
    expect(result.disposition).toMatchObject({
      advisory: 'GHSA-mrhx-c7xc-m3w5', source: 1243066, package: 'zod', version: '3.25.76',
      resourcePolicy: evidence.resourcePolicy,
    })
    expect(result.disposition?.affectedPackages).toHaveLength(8)
    expect(JSON.stringify({ all, production, evidence })).toBe(before)
  })

  it('does not require a disposition when audit reports contain no high or critical findings', () => {
    const { all, production } = fixture()
    const lowerOnly = audit({ 'other-low': all.vulnerabilities['other-low'] })
    expect(evaluateCmsDependencyAudit(lowerOnly, production, undefined)).toMatchObject({
      status: 'clean', disposition: null, raw: { all: { low: 1, high: 0, total: 1 } },
    })
    expect(evaluateCmsDependencyAudit(audit(), production, undefined).raw.all.total).toBe(0)
  })

  it.each([undefined, null, {}, { verified: false }])('rejects absent or unusable proof %j', evidence => {
    const { all, production } = fixture()
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/rejected/)
  })

  it.each(['passed', 'esm', 'cjs', 'issueBudget', 'graphCaps', 'boundedBackport', 'asyncObserved'] as const)(
    'requires the executed %s proof', key => {
      const { all, production, evidence } = fixture()
      evidence.proof[key] = false
      expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/backport proof/)
    },
  )

  it('rejects missing ESM proof as well as a failed ESM probe', () => {
    const { all, production, evidence } = fixture()
    const missing = { ...evidence, proof: { ...evidence.proof, esm: undefined } }
    expect(() => evaluateCmsDependencyAudit(all, production, missing)).toThrow(/proof esm/)
  })

  it.each(['originalFilesVerified', 'patchedFilesVerified', 'resourceHelpersVerified', 'proofPassed'] as const)(
    'requires every installed-instance %s check', key => {
      const { all, production, evidence } = fixture()
      evidence.instances[0][key] = false
      expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/backport instance/)
    },
  )

  it('rejects changed resource caps', () => {
    const { all, production, evidence } = fixture()
    evidence.resourcePolicy.maxIssues++
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/fixed limits/)
  })

  it.each(['source', 'name', 'dependency', 'url', 'range'] as const)(
    'does not generalize the exception to another advisory %s', field => {
      const { all, production, evidence } = fixture()
      const changed = issue()
      if (field === 'source') changed.source++
      else changed[field] = field === 'url' ? 'https://github.com/advisories/GHSA-neww-neww-neww' : 'unexpected'
      all.vulnerabilities.zod.via = [changed]
      expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/unreviewed concrete high/)
    },
  )

  it('rejects an additional high advisory even on an otherwise approved parent', () => {
    const { all, production, evidence } = fixture()
    all.vulnerabilities.tinacms.via.push(issue({ source: 333, name: 'tinacms', dependency: 'tinacms' }))
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/unreviewed concrete high/)
  })

  it('rejects any critical finding', () => {
    const { all, production, evidence } = fixture()
    const critical = finding('critical-package', [issue({ severity: 'critical' })], 'critical')
    const changed = audit({ ...all.vulnerabilities, 'critical-package': critical })
    expect(() => evaluateCmsDependencyAudit(changed, production, evidence)).toThrow(/critical/)
  })

  it('rejects even a low production vulnerability', () => {
    const { all, evidence } = fixture()
    const production = audit({ 'other-low': all.vulnerabilities['other-low'] })
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/production dependencies contain/)
  })

  it('rejects a new high parent even when it reaches the approved advisory', () => {
    const { all, production, evidence } = fixture()
    const changed = audit({ ...all.vulnerabilities, unknown: finding('unknown', ['zod']) })
    expect(() => evaluateCmsDependencyAudit(changed, production, evidence)).toThrow(/unreviewed high package unknown/)
  })

  it('rejects a known parent with an unaudited path', () => {
    const { all, production, evidence } = fixture()
    all.vulnerabilities.tinacms.nodes.push('node_modules/other/node_modules/tinacms')
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/unverified high package path/)
  })

  it('rejects a consumer version drift', () => {
    const { all, production, evidence } = fixture()
    evidence.consumers.find(consumer => consumer.name === 'tinacms')!.version = '3.15.3'
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/unreviewed high consumer version/)
  })

  it('rejects an unexpected Zod version instead of pretending the upstream range is fixed', () => {
    const { all, production, evidence } = fixture()
    evidence.instances[0].version = '4.6.6'
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/unreviewed version/)
  })

  it('requires exact coverage of nested audited Zod instances', () => {
    const { all, production, evidence } = fixture()
    all.vulnerabilities.zod.nodes.push('node_modules/nested/node_modules/zod')
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/instances do not match exactly/)
  })

  it('rejects a verified instance omitted from the audit', () => {
    const { all, production, evidence } = fixture()
    evidence.instances.push({ ...evidence.instances[0], nodePath: 'node_modules/nested/node_modules/zod' })
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/instances do not match exactly/)
  })

  it('accepts multiple Zod instances only when each audited instance and consumer is verified', () => {
    const { all, production, evidence } = fixture()
    const nodePath = 'node_modules/nested/node_modules/zod'
    all.vulnerabilities.zod.nodes.push(nodePath)
    evidence.instances.push({ ...evidence.instances[0], nodePath })
    evidence.consumers.push({ name: 'zod', version: '3.25.76', nodePath })
    expect(evaluateCmsDependencyAudit(all, production, evidence).disposition?.instances).toHaveLength(2)
  })

  it('rejects a closed propagation cycle with no route to the approved advisory', () => {
    const { all, production, evidence } = fixture()
    all.vulnerabilities.tinacms.via = ['@tinacms/app']
    all.vulnerabilities['@tinacms/app'].via = ['tinacms']
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/does not reach/)
  })

  it('rejects unknown propagation references even if another route reaches Zod', () => {
    const { all, production, evidence } = fixture()
    all.vulnerabilities.tinacms.via.push('unknown')
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/unknown via package unknown/)
  })

  it('rejects fabricated dependency paths', () => {
    const { all, production, evidence } = fixture()
    all.vulnerabilities.zod.nodes = ['node_modules/../node_modules/zod']
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/installed path/)
  })

  it.each([-1, Number.NaN, 0.5, '8'])('rejects invalid metadata counts %j', count => {
    const { all, production, evidence } = fixture()
    const changed = { ...all, metadata: { ...all.metadata, vulnerabilities: { ...all.metadata.vulnerabilities, high: count } } }
    expect(() => evaluateCmsDependencyAudit(changed, production, evidence)).toThrow(/nonnegative integer/)
  })

  it('rejects inconsistent and stale counts', () => {
    const { all, production, evidence } = fixture()
    all.metadata.vulnerabilities.total++
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/sum to total/)
    all.metadata.vulnerabilities.total--
    all.metadata.vulnerabilities.high--
    all.metadata.vulnerabilities.moderate++
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/stale/)
  })

  it.each([
    { auditReportVersion: 1 },
    { error: { code: 'ENOAUDIT' } },
    { vulnerabilities: [] },
    { vulnerabilities: { tinacms: 'not-an-object' } },
    { metadata: null },
  ])('rejects unusable npm report shapes %j', overrides => {
    const { all, production, evidence } = fixture()
    expect(() => evaluateCmsDependencyAudit({ ...all, ...overrides }, production, evidence)).toThrow(/rejected/)
  })

  it('validates production report metadata even when its total claims zero', () => {
    const { all, production, evidence } = fixture()
    production.metadata.vulnerabilities.low = -1
    expect(() => evaluateCmsDependencyAudit(all, production, evidence)).toThrow(/nonnegative integer/)
  })
})
