import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Production-only installs have neither the CMS nor its TypeScript transformer.
// Do this cheap absent-CMS check before loading development-only dependencies.
export async function applyCmsSecurity(options = {}) {
  const root = path.resolve(options.projectRoot || process.cwd())
  if (options.ifPresent && !existsSync(path.join(root, 'node_modules/tinacms/package.json'))
    && !existsSync(path.join(root, 'node_modules/@tinacms/cli/package.json'))) {
    return { skipped: true, reason: 'CMS dependencies have not been installed yet' }
  }
  const installer = await import('./cms-security/install.mjs')
  return installer.applyCmsSecurity({ ...options, projectRoot: root })
}

export async function verifyCmsSecurity(options) {
  const installer = await import('./cms-security/install.mjs')
  return installer.verifyCmsSecurity(options)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 1 || !['--apply', '--apply-if-present', '--verify', '--verify-admin'].includes(args[0])) {
      throw Error('Use cms-security.mjs --apply, --apply-if-present, --verify or --verify-admin.')
    }
    const evidence = args[0].startsWith('--apply')
      ? await applyCmsSecurity({ ifPresent: args[0] === '--apply-if-present' })
      : await verifyCmsSecurity({ verifyAdmin: args[0] === '--verify-admin' })
    if (evidence.skipped) console.log(`CMS security patch deferred: ${evidence.reason}.`)
    else {
      console.log(`CMS security verified: ${evidence.instances.length} exact zod@${evidence.version} instance(s), ESM/CJS hashes and real runtime/schema probes passed. Raw npm advisory ${evidence.advisory} is retained with an explicit local-patch disposition.`)
      if (evidence.adminBundle) console.log(`Admin bundle static coverage: ${evidence.adminBundle.roots} guarded Zod root(s), ${evidence.adminBundle.parsers} guarded parser(s), ${evidence.adminBundle.files.length} entry-reachable JavaScript files. Browser runtime behavior is a separate check.`)
      if (args[0] === '--verify-admin' && process.env.CMS_SECURITY_EVIDENCE_FILE) {
        const filename = path.resolve(process.env.CMS_SECURITY_EVIDENCE_FILE)
        mkdirSync(path.dirname(filename), { recursive: true })
        writeFileSync(filename, JSON.stringify(evidence, null, 2) + '\n')
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
