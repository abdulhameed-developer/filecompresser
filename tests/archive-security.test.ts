import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { extractZip, inspectZip } from '@/lib/engines/zip'

/**
 * These build genuinely hostile archives and assert the extraction path
 * refuses them. The bytes are real ZIP structures, so this exercises the same
 * code path a malicious download would take.
 */

function zipOf(entries: Record<string, Uint8Array>): Uint8Array {
  // level 0 keeps the fixture cheap to build; the guards under test read the
  // declared sizes, not the compression ratio.
  return zipSync(entries, { level: 0 })
}

function asZipFile(bytes: Uint8Array, name = 'hostile.zip'): File {
  return new File([bytes], name, { type: 'application/zip' })
}

describe('malicious archive entries', () => {
  it('refuses a path traversal entry', async () => {
    const bytes = zipOf({
      '../../../../etc/passwd': new Uint8Array([1, 2, 3]),
      'innocent.txt': new Uint8Array([4, 5]),
    })

    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/unsafe file path/i)
  })

  it('refuses an absolute path entry', async () => {
    const bytes = zipOf({ '/etc/shadow': new Uint8Array([1, 2, 3]) })
    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/unsafe file path/i)
  })

  it('refuses a Windows drive-letter entry', async () => {
    const bytes = zipOf({ 'C:\\Windows\\System32\\evil.dll': new Uint8Array([1, 2, 3]) })
    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/unsafe file path/i)
  })

  it('refuses a UNC entry', async () => {
    const bytes = zipOf({ '\\\\attacker\\share\\payload.exe': new Uint8Array([1, 2, 3]) })
    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/unsafe file path/i)
  })

  it('refuses a traversal hidden behind a benign-looking folder', async () => {
    const bytes = zipOf({ 'photos/../../../../root/.ssh/authorized_keys': new Uint8Array([1]) })
    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/unsafe file path/i)
  })

  it('refuses the whole archive when it also contains a safe entry', async () => {
    // We never extract the "good" entries while skipping the bad, because that
    // hides the fact the archive as a whole is hostile.
    const bytes = zipOf({
      'readme.txt': new Uint8Array([1, 2, 3]),
      '../escape.txt': new Uint8Array([4, 5]),
    })
    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/unsafe file path/i)
  })

  it('refuses a Windows reserved device name', async () => {
    const bytes = zipOf({ 'CON.txt': new Uint8Array([1, 2, 3]) })
    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/unsafe file path/i)
  })
})

describe('archive bomb defences', () => {
  it('refuses many entries that together expand past the total ceiling', async () => {
    // 10 entries x 60 MB = 600 MB of declared data. No single entry trips the
    // 200 MB per-file ceiling, so this exercises the total-uncompressed ceiling
    // — the guard that actually bounds how much memory an archive can demand.
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i < 10; i++) {
      entries[`chunk-${i}.bin`] = new Uint8Array(60 * 1024 * 1024)
    }
    const bytes = zipOf(entries)

    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(
      /expands to over 100|more memory than this tool allows|larger than the/i
    )
  }, 30_000)

  it('refuses an archive with too many entries', async () => {
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i < 600; i++) {
      entries[`file-${i}.txt`] = new Uint8Array([1])
    }
    const bytes = zipOf(entries)

    await expect(extractZip(asZipFile(bytes))).rejects.toThrow(/more than 500 files|file limit/i)
  }, 30_000)

  it('still accepts a normal, highly-compressible archive', async () => {
    // Guards against the bomb checks being so aggressive they reject real files:
    // 4 MB of zeroes compresses thousands of times over and must extract
    // normally, well under every ceiling.
    const bytes = zipSync({ 'blank.bin': new Uint8Array(4 * 1024 * 1024) }, { level: 9 })
    const entries = await extractZip(asZipFile(bytes))

    expect(entries).toHaveLength(1)
    expect(entries[0].size).toBe(4 * 1024 * 1024)
  }, 30_000)

  it('extracts a large-but-legitimate archive', async () => {
    // ~12 MB of text-like data: the shape of a real large backup archive.
    const payload = new Uint8Array(12 * 1024 * 1024).map((_, i) => (i * 7 + (i >> 8)) % 251)
    const bytes = zipOf({ 'data.bin': payload })
    const entries = await extractZip(asZipFile(bytes))

    expect(entries).toHaveLength(1)
    expect(entries[0].size).toBe(payload.length)
  }, 30_000)
})

describe('inspection', () => {
  it('marks unsafe entries instead of extracting them', async () => {
    const bytes = zipOf({
      'safe.txt': new Uint8Array([1, 2]),
      '../unsafe.txt': new Uint8Array([3]),
    })

    // inspectZip reports rather than throws — it is used to show the user what
    // an archive holds before deciding whether to extract.
    const listing = await inspectZip(asZipFile(bytes))
    const unsafe = listing.find((e) => e.name === '../unsafe.txt')

    expect(unsafe).toBeDefined()
    expect(unsafe!.safe).toBe(false)
    expect(unsafe!.reason).toMatch(/unsafe/i)
  })

  it('lists safe entries with their real sizes', async () => {
    const bytes = zipOf({ 'a.txt': new Uint8Array(10), 'b.txt': new Uint8Array(20) })
    const listing = await inspectZip(asZipFile(bytes))

    expect(listing).toHaveLength(2)
    expect(listing.every((e) => e.safe)).toBe(true)
    expect(listing.find((e) => e.name === 'b.txt')!.size).toBe(20)
  })
})