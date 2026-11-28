import { inspectCmsValidationInput } from '../scripts/cms-security/resource-limits.mjs'

// Existing publication limits, shared by the editor and filesystem preflight.
export const CMS_CONTENT_LIMITS = Object.freeze({
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxFiles: 10000,
  maxDirectoryDepth: 8,
})

const byteError = 'Content exceeds the existing 2 MiB limit for one record. Shorten it or split it into separate articles before saving.'

/** Check one ordinary JSON form before recursive editorial validation.
 * Repository totals, file existence and redirect graphs remain build checks.
 */
export function cmsRecordPublicationError(value) {
  const rejected = inspectCmsValidationInput(value)
  if (rejected) return `Content exceeds the existing ${rejected.reason} publication limit (${rejected.limit}). Reduce this record before saving.`

  // Avoid creating a huge serialization first. UTF-16 string/key lengths are
  // lower bounds for their JSON UTF-8 bytes; all containers are already bounded.
  const pending = [value]
  let minimum = 0
  while (pending.length) {
    const current = pending.pop()
    if (typeof current === 'string') minimum += current.length
    else if (current && typeof current === 'object') {
      const prototype = Object.getPrototypeOf(current)
      if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) return 'Content must contain ordinary JSON values.'
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== 'string') return 'Content must contain ordinary JSON values.'
        const entry = Object.getOwnPropertyDescriptor(current, key)
        if (!entry || !('value' in entry)) return 'Content must contain ordinary JSON values.'
        if (['function', 'symbol', 'bigint'].includes(typeof entry.value)) return 'Content must contain ordinary JSON values.'
        if (!entry.enumerable) continue
        if (entry.value === undefined) continue
        if (!Array.isArray(current)) minimum += key.length
        pending.push(entry.value)
      }
    } else if (typeof current === 'function' || typeof current === 'symbol' || typeof current === 'bigint' || typeof current === 'number' && !Number.isFinite(current)) return 'Content must contain ordinary JSON values.'
    if (minimum > CMS_CONTENT_LIMITS.maxFileBytes) return byteError
  }
  try {
    const json = JSON.stringify(value, null, 2)
    if (typeof json !== 'string') return 'Content must contain ordinary JSON values.'
    if (json.length + 1 > CMS_CONTENT_LIMITS.maxFileBytes || new TextEncoder().encode(json + '\n').byteLength > CMS_CONTENT_LIMITS.maxFileBytes) return byteError
  } catch { return 'Content must contain ordinary JSON values.' }
}
