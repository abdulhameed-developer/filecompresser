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
    { type: 'string', name: 'socialImage', label: 'Default sharing image', required: true, description: 'Use /opengraph-image or an existing local image path in /uploads/ or /blog/.' },
    { type: 'string', name: 'socialImageAlt', label: 'Sharing image description', required: true },
    { type: 'string', name: 'sameAs', label: 'Verified official profile URLs', list: true, description: 'Optional HTTPS profiles that actually represent FileCompresser. Leave empty when none are verified.' },
  ],
}
