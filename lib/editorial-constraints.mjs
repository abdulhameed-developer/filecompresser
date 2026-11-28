/** Pure reader/editor boundaries. No network or filesystem access. */
export const SITE_TEXT_LIMITS = Object.freeze({ siteName: 80, wordmark: 80, tagline: 140, titleSuffix: 80, defaultDescription: 350, organizationName: 120, socialImageAlt: 250 })

export function siteIdentityText(value, key, maximum = SITE_TEXT_LIMITS[key] ?? 250) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid site setting ${key}: enter plain text up to ${maximum} characters.`)
  if (key === 'titleSuffix' && value.includes('%')) throw new Error('Site titleSuffix is plain brand text, not a template.')
  return value.trim()
}

export function safeSiteProfileHref(value) {
  if (typeof value !== 'string') throw new Error('Site profiles must be HTTPS URLs.')
  let url
  try { url = new URL(value) } catch { throw new Error('Site profiles must be HTTPS URLs.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Site profiles must be HTTPS URLs without credentials.')
  return url.href
}

export function safeSocialImagePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\?#%\s]/.test(value) || value.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid site setting socialImage: use an image path on this site.')
  if (value !== '/opengraph-image' && !/^\/(?:uploads|blog)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|avif|gif)$/i.test(value)) throw new Error('Invalid site setting socialImage: use /opengraph-image or an image in /uploads/ or /blog/.')
  return value
}

/** Preserve the existing encoded-filename and raster-only reader boundary. */
export function safeEditorialImagePath(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Choose a raster image stored under /uploads/.')
  let decoded
  try { decoded = decodeURIComponent(input) } catch { throw new Error('Invalid image path encoding.') }
  if (!input.startsWith('/uploads/') || /[?#]/.test(input) || /[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.split('/').slice(2).some(segment => !segment || segment.startsWith('.')) || !/\.(?:jpe?g|png|webp|gif|avif)$/i.test(decoded)) throw new Error('Choose a raster image stored under /uploads/.')
  return decoded.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

export function editorialImageFieldValidator({ required = true } = {}) {
  return value => {
    if (!required && (value === undefined || value === null || typeof value === 'string' && !value.trim())) return
    try { safeEditorialImagePath(value) } catch (error) { return error.message }
  }
}
