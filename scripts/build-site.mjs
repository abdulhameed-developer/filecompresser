import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// The FFmpeg wrapper supports Webpack's worker handling. Tina's local build
// command can inherit NODE_ENV=development, so set production explicitly for
// the exported site, including its security headers and React runtime.
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--webpack'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
})

child.on('error', (error) => {
  console.error(`Could not start the production build: ${error.message}`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`The production build was interrupted by ${signal}`)
    process.exitCode = 1
    return
  }
  process.exitCode = code ?? 1
})
