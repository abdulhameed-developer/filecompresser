import { spawnSync } from 'node:child_process'

// One-time setup updates package.json AND its lockfile together. Exact releases
// are selected; no credentials are read or stored by this installer.
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'install', '--save-dev', '--save-exact', 'tinacms@3.15.2', '@tinacms/cli@4.0.5',
], { stdio: 'inherit' })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
