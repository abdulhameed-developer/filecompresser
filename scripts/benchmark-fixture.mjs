import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Never label changed fixture bytes with an earlier manifest's identity. */
export function readVerifiedImageFixture(directory, fixture) {
  const root = path.resolve(directory, 'inputs')
  const filename = path.resolve(root, fixture.file)
  if (!filename.startsWith(`${root}${path.sep}`)) throw new Error(`Fixture escapes the input directory: ${fixture.id}`)
  const bytes = readFileSync(filename)
  if (!Number.isSafeInteger(fixture.bytes) || bytes.length !== fixture.bytes) throw new Error(`Fixture byte size differs from its manifest: ${fixture.id}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== fixture.sha256) throw new Error(`Fixture SHA-256 differs from its manifest: ${fixture.id}`)
  return bytes
}
