import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// One-time setup updates package.json AND its lockfile together. Exact releases
// are selected; no credentials are read or stored by this installer.
/** @param {{ run?: (command: string, args: string[], options: { stdio: 'inherit' }) => { status: number | null, error?: Error } }} [options] */
export function setupCms({ run = spawnSync } = {}) {
  const installation = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'install', '--save-dev', '--save-exact', 'tinacms@3.15.2', '@tinacms/cli@4.0.5',
  ], { stdio: 'inherit' })
  if (installation.error) console.error(installation.error.message)
  if (installation.error || installation.status !== 0) return installation.status || 1

  // npm install <named packages> does not run the root project's postinstall.
  // Apply and verify immediately, before any CMS test or build can execute.
  const security = run(process.execPath, [
    fileURLToPath(new URL('./cms-security.mjs', import.meta.url)), '--apply',
  ], { stdio: 'inherit' })
  if (security.error) console.error(security.error.message)
  return security.error ? 1 : security.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = setupCms()
}
