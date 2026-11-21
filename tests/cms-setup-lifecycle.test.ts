import { describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { setupCms } from '../scripts/setup-cms.mjs'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const securityScript = fileURLToPath(new URL('../scripts/cms-security.mjs', import.meta.url))
const installArguments = [
  'install', '--save-dev', '--save-exact', 'tinacms@3.15.2', '@tinacms/cli@4.0.5',
]

describe('CMS setup security lifecycle', () => {
  it('stops after a failed dependency install without applying or claiming a security proof', () => {
    const run = vi.fn().mockReturnValue({ status: 9 })
    expect(setupCms({ run })).toBe(9)
    expect(run).toHaveBeenCalledExactlyOnceWith(npmCommand, installArguments, { stdio: 'inherit' })
  })

  it('explicitly applies and verifies the patch after installing exact packages before reporting success', () => {
    const run = vi.fn().mockReturnValue({ status: 0 })
    expect(setupCms({ run })).toBe(0)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(1, npmCommand, installArguments, { stdio: 'inherit' })
    expect(run).toHaveBeenNthCalledWith(2, process.execPath, [securityScript, '--apply'], { stdio: 'inherit' })
  })

  it('propagates failed patch verification instead of returning a successful install status', () => {
    const run = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 7 })
    expect(setupCms({ run })).toBe(7)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenLastCalledWith(process.execPath, [securityScript, '--apply'], { stdio: 'inherit' })
  })
})
