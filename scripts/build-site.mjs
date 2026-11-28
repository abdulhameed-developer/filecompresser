import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { checkEditorialExport, checkEditorialSource } from './check-editorial.mjs'

const require = createRequire(import.meta.url)
const editorial = checkEditorialSource()
console.log(`Editorial policy passed for ${editorial.records} published source records.`)

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

child.on('exit', async (code, signal) => {
  if (signal) {
    console.error(`The production build was interrupted by ${signal}`)
    process.exitCode = 1
    return
  }
  process.exitCode = code ?? 1
  if (code === 0) {
    try {
      const result = await checkEditorialExport('out')
      console.log(`Editorial policy passed for ${result.pages} generated public HTML files.`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
})
