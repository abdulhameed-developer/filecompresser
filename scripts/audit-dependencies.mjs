import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateCmsDependencyAudit } from './cms-security/audit-policy.mjs'
import { verifyCmsSecurity } from './cms-security/install.mjs'

function runAudit(args, projectRoot) {
  const npmCli = process.env.npm_execpath
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const commandArgs = npmCli ? [npmCli, 'audit', ...args, '--json'] : ['audit', ...args, '--json']
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    shell: !npmCli && process.platform === 'win32',
    cwd: projectRoot,
  })
  if (result.error || result.signal || result.status === null) throw Error('The dependency audit process failed; no previous report is reused.')
  let report
  try { report = JSON.parse(result.stdout) } catch { throw Error('npm audit did not return valid JSON; the audit gate has failed.') }
  if (report.error || !report.metadata?.vulnerabilities) throw Error('npm audit did not return a usable current report; the audit gate has failed.')
  return { report, raw: result.stdout }
}

/** @param {{ allFile?: string, productionFile?: string, outputDirectory?: string, projectRoot?: string }} [options] */
export async function checkDependencyAudits({ allFile, productionFile, outputDirectory, projectRoot = process.cwd() } = {}) {
  if (Boolean(allFile) !== Boolean(productionFile)) throw Error('Provide both current all-dependency and production npm audit reports.')
  const directory = outputDirectory || mkdtempSync(path.join(os.tmpdir(), 'filecompresser-dependency-audit-'))
  mkdirSync(directory, { recursive: true })
  const all = allFile ? { report: JSON.parse(readFileSync(allFile, 'utf8')), raw: readFileSync(allFile, 'utf8') }
    : runAudit(['--include=dev'], projectRoot)
  const production = productionFile ? { report: JSON.parse(readFileSync(productionFile, 'utf8')), raw: readFileSync(productionFile, 'utf8') }
    : runAudit(['--omit=dev'], projectRoot)
  // Preserve original npm output. A locally verified backport does not rewrite
  // the registry advisory, package version, severity or suggested downgrade.
  writeFileSync(path.join(directory, 'audit-all.json'), all.raw)
  writeFileSync(path.join(directory, 'audit-production.json'), production.raw)
  const evidence = await verifyCmsSecurity({ projectRoot })
  writeFileSync(path.join(directory, 'cms-security-proof.json'), JSON.stringify(evidence, null, 2) + '\n')
  const decision = evaluateCmsDependencyAudit(all.report, production.report, evidence)
  writeFileSync(path.join(directory, 'audit-disposition.json'), JSON.stringify(decision, null, 2) + '\n')
  return { ...decision, evidenceDirectory: directory }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}
    const args = process.argv.slice(2)
    for (let index = 0; index < args.length; index += 2) {
      if (!['--all', '--production', '--output-dir'].includes(args[index]) || !args[index + 1]) throw Error('Use audit-dependencies.mjs [--all report.json --production report.json] [--output-dir directory].')
      options[args[index] === '--all' ? 'allFile' : args[index] === '--production' ? 'productionFile' : 'outputDirectory'] = path.resolve(args[index + 1])
    }
    const decision = await checkDependencyAudits(options)
    console.log(`Raw dependency audit: production total=${decision.raw.production.total}; all high=${decision.raw.all.high}, critical=${decision.raw.all.critical}, moderate=${decision.raw.all.moderate}, low=${decision.raw.all.low}.`)
    if (decision.disposition) console.log(`Explicit disposition: ${decision.disposition.advisory}, original zod@3.25.76 version retained; all installed ESM/CJS patch hashes, resource caps and runtime/schema regressions verified. Other high/critical findings remain blocking.`)
    console.log(`Dependency audit gate passed (${decision.status}); original reports and verified proof: ${decision.evidenceDirectory}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
