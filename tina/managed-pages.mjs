import { editorialUrlFieldValidator } from '../lib/editorial-markup.mjs'

const linkValidation = editorialUrlFieldValidator()
const optionalLinkValidation = editorialUrlFieldValidator({ required: false })
const string = (name, label, required = true) => ({ type: 'string', name, label, required })
const textarea = (name, label, required = true) => ({ ...string(name, label, required), ui: { component: 'textarea' } })
const link = (name, label, required = false) => ({
  type: 'object', name, label, required,
  fields: [string('label', 'Link text'), { ...string('href', 'Address'), ui: { validate: linkValidation }, description: 'Use a path on this site, such as /blog, a #section anchor or a full HTTPS address.' }],
})
const cleared = value => {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  return typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(cleared)
}
const atPath = (value, path) => path.split('.').reduce((item, key) => item && typeof item === 'object' && !Array.isArray(item) ? item[key] : undefined, value)
const completeText = value => typeof value === 'string' && Boolean(value.trim())
const optionalGroupValidator = (paths, label) => value => {
  if (value === undefined || value === null) return
  if (typeof value !== 'object' || Array.isArray(value)) return `${label} must be a group of fields.`
  if (cleared(value)) return
  if (!paths.every(path => completeText(atPath(value, path)))) return `Complete every ${label.toLowerCase()} field, or clear all of them to remove it.`
  for (const path of paths.filter(path => path.endsWith('href'))) {
    const error = linkValidation(atPath(value, path))
    if (error) return error
  }
}
const clearableLink = (name, label) => ({
  type: 'object', name, label,
  description: 'Clear both fields to remove this link.',
  ui: { validate(value) {
    const error = optionalGroupValidator(['label', 'href'], label)(value)
    if (error || cleared(value)) return error
    return linkValidation(value.href)
  } },
  fields: [string('label', 'Link text', false), { ...string('href', 'Address', false), ui: { validate: optionalLinkValidation }, description: 'Use a path on this site, such as /blog, a #section anchor or a full HTTPS address.' }],
})

export const managedPageCollection = {
  name: 'managedPage', label: 'Information pages', path: 'content/pages', format: 'json',
  match: { include: '{about,contact,privacy,terms,disclaimer,blog}' },
  ui: { allowedActions: { create: false, delete: false, createNestedFolder: false } },
  fields: [
    { ...textarea('title', 'Page heading'), isTitle: true, description: 'About can use a line break. Other page headings should stay on one line.' },
    string('label', 'Small section label', false),
    textarea('introduction', 'Introduction', false),
    string('seoTitle', 'SEO title'),
    textarea('seoDescription', 'SEO description'),
    {
      ...string('updated', 'Last reviewed date', false), description: 'Use YYYY-MM-DD. Only update after the document is actually reviewed.',
      ui: { validate(value) {
        if (!value) return
        const parsed = new Date(`${value}T00:00:00Z`)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return 'Use a real YYYY-MM-DD date.'
      } },
    },
    {
      type: 'object', name: 'sections', label: 'Page sections', list: true,
      defaultItem: { placement: 'text', body: [], items: [], links: [] },
      description: 'About and Contact support cards, detail sections and normal text. Policy pages use normal text sections. Review technical and privacy claims before changing them.',
      ui: { itemProps: item => ({ label: item?.heading || 'Page section' }) },
      fields: [
        string('heading', 'Section heading'),
        { type: 'string', name: 'placement', label: 'Display style', options: [{ value: 'card', label: 'Feature or help card' }, { value: 'detail', label: 'Detailed explanation' }, { value: 'text', label: 'Normal text section' }] },
        string('label', 'Section label', false),
        { type: 'string', name: 'icon', label: 'Existing icon', options: ['file', 'shield', 'check', 'clock', 'image', 'download'] },
        { ...string('body', 'Paragraphs', false), list: true, description: 'Inline links use `[link text](/page)` or `[link text](https://example.com)`. HTML is displayed as text here.', ui: { component: 'list', field: { component: 'textarea' } } },
        { ...string('items', 'Bullet list items', false), list: true, description: 'Add one bullet per item. Inline Markdown links are supported.', ui: { component: 'list', field: { component: 'textarea' } } },
        { ...link('links', 'Section links'), list: true },
      ],
    },
    clearableLink('introCta', 'Introductory action'),
    {
      type: 'object', name: 'support', label: 'Guide strip',
      description: 'Complete both lines and the guide link, or clear all fields to hide this strip.',
      ui: { validate: optionalGroupValidator(['text', 'emphasis', 'link.label', 'link.href'], 'Guide strip') },
      fields: [string('text', 'First line', false), string('emphasis', 'Emphasized line', false), clearableLink('link', 'Guide link')],
    },
    {
      type: 'object', name: 'footer', label: 'Document footer',
      description: 'Complete the heading, introduction and footer link, or clear all fields to hide this footer.',
      ui: { validate: optionalGroupValidator(['heading', 'introduction', 'link.label', 'link.href'], 'Document footer') },
      fields: [string('heading', 'Footer heading', false), string('introduction', 'Introductory word', false), clearableLink('link', 'Footer link')],
    },
  ],
}
