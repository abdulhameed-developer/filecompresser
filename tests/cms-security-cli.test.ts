import { afterEach, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

function productionOnlyCheckout() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cms-security-cli-'))
  directories.push(root)
  mkdirSync(path.join(root, 'scripts'))
  const filename = path.join(root, 'scripts/cms-security.mjs')
  copyFileSync(new URL('../scripts/cms-security.mjs', import.meta.url), filename)
  expect(existsSync(path.join(root, 'node_modules'))).toBe(false)
  expect(existsSync(path.join(root, 'scripts/cms-security/install.mjs'))).toBe(false)
  return { root, filename }
}

// A fresh Worker exercises Node's real module loader and CLI argument branch
// without depending on child-process permissions or Vitest's module cache.
function runCli(root: string, filename: string, argument: string) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const worker = new Worker(`
      const { workerData } = require('node:worker_threads')
      const { pathToFileURL } = require('node:url')
      process.argv = [process.execPath, workerData.filename, workerData.argument]
      // Worker threads cannot chdir; isolate the CLI's project-root lookup.
      process.cwd = () => workerData.root
      import(pathToFileURL(workerData.filename).href).catch(error => {
        console.error(error)
        process.exitCode = 1
      })
    `, { eval: true, workerData: { root, filename, argument }, execArgv: [], stdout: true, stderr: true })
    let stdout = ''
    let stderr = ''
    worker.stdout.on('data', chunk => { stdout += chunk.toString() })
    worker.stderr.on('data', chunk => { stderr += chunk.toString() })
    const timer = setTimeout(() => {
      void worker.terminate()
      reject(Error('Isolated CMS CLI did not finish'))
    }, 5000)
    worker.on('error', error => { clearTimeout(timer); reject(error) })
    worker.on('exit', exitCode => {
      clearTimeout(timer)
      resolve({ exitCode, stdout, stderr })
    })
  })
}

describe('CMS CLI without development dependencies', () => {
  it('defers optional postinstall before loading the absent installer or TypeScript', async () => {
    const { root, filename } = productionOnlyCheckout()
    const result = await runCli(root, filename, '--apply-if-present')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('CMS security patch deferred: CMS dependencies have not been installed yet.')
    expect(result.stdout).not.toContain('CMS security verified:')
    expect(result.stderr).toBe('')
  })

  it('fails explicit verification when the CMS installer is absent', async () => {
    const { root, filename } = productionOnlyCheckout()
    const result = await runCli(root, filename, '--verify')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('cms-security/install.mjs')
    expect(result.stdout).not.toContain('CMS security patch deferred:')
    expect(result.stdout).not.toContain('CMS security verified:')
  })
})
