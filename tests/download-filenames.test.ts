// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob, safeDownloadFilename } from '@/lib/downloads'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('download filenames', () => {
  it('preserves a normal user filename and real extension', () => {
    expect(safeDownloadFilename('Family Photo 01.jpg', 'image/jpeg')).toBe('Family Photo 01.jpg')
  })
  it('flattens paths and removes direction-changing controls', () => {
    const result = safeDownloadFilename('../../folder\\image\u202e.jpg', 'image/jpeg')
    expect(result).not.toMatch(/[\\/\u202e]/)
    expect(result.endsWith('.jpg')).toBe(true)
  })
  it.each(['CON.txt', 'NUL', 'file\u0000.pdf', 'file\r\n.pdf'])('refuses unsafe platform/control filename %s', name => {
    expect(safeDownloadFilename(name, 'application/pdf')).toBe('download.pdf')
  })
  it('bounds filesystem bytes without dropping the output extension', () => {
    const name = safeDownloadFilename(`${'写'.repeat(150)}.png`, 'image/png')
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(200)
    expect(name.endsWith('.png')).toBe(true)
  })
  it('uses the safe basename on the actual download anchor and releases its URL later', () => {
    vi.useFakeTimers()
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:download-test'), revokeObjectURL: revoke })
    let observed = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { observed = this.download })
    downloadBlob(new Blob(['data'], { type: 'application/pdf' }), 'CON.pdf')
    expect(observed).toBe('download.pdf')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4000)
    expect(revoke).toHaveBeenCalledWith('blob:download-test')
  })
})
