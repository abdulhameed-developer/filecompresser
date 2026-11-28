import { SITE_TEXT_LIMITS, safeSiteProfileHref, safeSocialImagePath, siteIdentityText } from '../lib/editorial-constraints.mjs'

function validateSupportEmail(value) {
  if (value === undefined || value === null || value === '') return
  const message = 'Use one plain email address without mailto:, message headers or a subject line.'
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return message
  const address = value.trim()
  if (!address) return
  const parts = address.split('@')
  if (address.length > 254 || parts.length !== 2) return message
  const [local, domain] = parts
  if (!/^[a-zA-Z0-9._+-]{1,64}$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
    !domain.includes('.') || domain.split('.').some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) return message
}

export const siteSettingsCollection = {
  name: 'siteSettings',
  label: 'Site identity and SEO defaults',
  path: 'content/settings',
  format: 'json',
  match: { include: 'site' },
  ui: { global: true, allowedActions: { create: false, delete: false, createNestedFolder: false } },
  fields: [
    { type: 'string', name: 'siteName', label: 'Site name', isTitle: true, required: true },
    { type: 'string', name: 'wordmark', label: 'Brand wordmark in metadata', required: true },
    { type: 'string', name: 'tagline', label: 'Tagline', required: true },
    { type: 'string', name: 'titleSuffix', label: 'Page title suffix', required: true, description: 'Appended after page titles, for example: Blog | filecompresser.' },
    { type: 'string', name: 'defaultDescription', label: 'Default search description', required: true, ui: { component: 'textarea' } },
    { type: 'string', name: 'organizationName', label: 'Publisher name', required: true, description: 'Use the real site or organization name. Do not invent business details.' },
    { type: 'string', name: 'supportEmail', label: 'Support email address', description: 'Use one verified, monitored mailbox. Leave empty to hide the contact and footer email links. Do not add mailto:, a subject line or message headers.', ui: { validate: validateSupportEmail } },
    { type: 'string', name: 'socialImage', label: 'Default sharing image', required: true, description: 'Use /opengraph-image or an existing local image path in /uploads/ or /blog/.' },
    { type: 'string', name: 'socialImageAlt', label: 'Sharing image description', required: true },
    { type: 'string', name: 'sameAs', label: 'Verified official profile URLs', list: true, description: 'Optional HTTPS profiles that actually represent FileCompresser. Leave empty when none are verified.' },
  ].map(field => {
    const existing = field.ui?.validate
    if (!(field.name in SITE_TEXT_LIMITS) && !['socialImage', 'sameAs'].includes(field.name)) return field
    return { ...field, ui: { ...field.ui, ...(field.name === 'sameAs' ? { field: { component: 'text', validate(value) { try { safeSiteProfileHref(value) } catch (error) { return error.message } } } } : {}), validate(value, values, meta) {
      const error = existing?.(value, values, meta)
      if (error) return error
      try {
        if (field.name in SITE_TEXT_LIMITS) siteIdentityText(value, field.name)
        else if (field.name === 'socialImage') safeSocialImagePath(value)
        else {
          if (value === undefined) return
          if (!Array.isArray(value)) return 'Site profiles must be a list of HTTPS URLs.'
          for (const entry of value) safeSiteProfileHref(entry)
        }
      } catch (error) { return error.message }
    } } }
  }),
}
