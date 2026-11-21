const MAX_CHUNK_SIZE = 16 * 1024 * 1024
interface WasmChunk { file: string; size: number; sha256: string }
interface WasmManifest { version: 1; size: number; sha256: string; chunks: WasmChunk[] }

function isManifest(value: unknown): value is WasmManifest {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<WasmManifest>
  if (entry.version !== 1 || !Number.isSafeInteger(entry.size) || !entry.size || entry.size < 1 || entry.size > 64 * 1024 * 1024 ||
    typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    !Array.isArray(entry.chunks) || entry.chunks.length < 1 || entry.chunks.length > 4) return false
  return entry.chunks.every(chunk => chunk && typeof chunk === 'object' &&
    typeof chunk.sha256 === 'string' && /^[a-f0-9]{64}$/.test(chunk.sha256) &&
    chunk.file === `ffmpeg-core-${chunk.sha256}.part.wasm` &&
    Number.isSafeInteger(chunk.size) && chunk.size > 0 && chunk.size <= MAX_CHUNK_SIZE) &&
    entry.chunks.reduce((total, chunk) => total + chunk.size, 0) === entry.size
}

/** Same-origin static chunks avoid both server-function and static-file limits. */
export async function loadWasmCoreURL(base = '/ffmpeg-core'): Promise<string> {
  const response = await fetch(`${base}/wasm-manifest.json`, { redirect: 'error' })
  if (!response.ok) throw new Error('The media engine manifest could not be downloaded.')
  const manifest: unknown = await response.json()
  if (!isManifest(manifest)) throw new Error('The media engine manifest is invalid.')
  const chunks: ArrayBuffer[] = []
  // Sequential downloads limit peak memory on mobile devices. Each response is
  // checked against its build-generated size and digest before creating a Blob.
  for (const chunk of manifest.chunks) {
    const result = await fetch(`${base}/${chunk.file}`, { redirect: 'error' })
    if (!result.ok) throw new Error('A media engine chunk could not be downloaded.')
    const bytes = await result.arrayBuffer()
    if (bytes.byteLength !== chunk.size) throw new Error('A media engine chunk is incomplete.')
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    if (hash !== chunk.sha256) throw new Error('A media engine chunk failed its integrity check.')
    chunks.push(bytes)
  }
  return URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }))
}
