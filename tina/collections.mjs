import { redirectCollection } from './redirects.mjs'
import { editorialCollections } from './editorial.mjs'
import { managedPageCollection } from './managed-pages.mjs'
import { siteSettingsCollection } from './site-settings.mjs'

const figureOptions = [
  { value: 'pipeline', label: 'Compression pipeline' },
  { value: 'sizebars', label: 'File size comparison' },
  { value: 'qualitycurve', label: 'Image quality' },
  { value: 'dataflow', label: 'File privacy' },
  { value: 'formattree', label: 'File format choices' },
]

const textarea = (name, label, required = true) => ({
  type: 'string', name, label, required, ui: { component: 'textarea' },
})
const date = (name, label, required = false) => ({
  type: 'string', name, label, required,
  description: 'Use YYYY-MM-DD, for example 2026-11-21.',
  ui: {
    validate(value) {
      if (!value && !required) return
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Use YYYY-MM-DD.'
      const parsed = new Date(`${value}T00:00:00Z`)
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return 'Enter a real calendar date.'
    },
  },
})
const seoFields = () => [
  { type: 'string', name: 'seoTitle', label: 'SEO title', description: 'Optional. Aim for a clear, specific title of around 50–60 characters. Empty uses the existing page title.' },
  { ...textarea('seoDescription', 'SEO description', false), description: 'Optional. Write a useful search summary, usually around 140–160 characters. Empty uses the existing description.' },
]
const postImageFields = (required = true) => [
  { type: 'image', name: 'src', label: 'Image', required, description: 'Choose a raster image uploaded to this site.' },
  { type: 'string', name: 'alt', label: 'Alternative text', required },
  { type: 'string', name: 'caption', label: 'Caption' },
]
const hasOptionalValues = value => value && Object.values(value).some(item => item !== undefined && item !== null && String(item).trim() !== '')
const nonBlank = value => typeof value === 'string' && value.trim() !== ''
export const collections = [
  {
    name: 'post', label: 'Blog posts', path: 'content/posts', format: 'json', match: { include: '*' },
    ui: {
      filename: {
        slugify: values => (values.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      },
      allowedActions: { create: true, delete: false, createNestedFolder: false },
    },
    defaultItem: () => ({ published: false, archived: false, date: new Date().toISOString().slice(0, 10), readingTime: '5 min', figure: 'pipeline', body: [] }),
    fields: [
      { type: 'boolean', name: 'published', label: 'Publish this post', description: 'Off = draft. Saving a published post commits to GitHub and appears publicly after the next successful hosting build.' },
      { type: 'boolean', name: 'archived', label: 'Archive this post', description: 'Keeps the content file but removes the post from public pages and sitemaps after the next build. Add an appropriate redirect for an old indexed address.' },
      { type: 'string', name: 'title', label: 'Post title', isTitle: true, required: true },
      textarea('description', 'Short introduction'),
      date('date', 'Publication date', true), date('updated', 'Last updated'),
      { type: 'string', name: 'readingTime', label: 'Reading time', required: true, description: 'For example: 5 min' },
      { type: 'string', name: 'figure', label: 'Fallback illustration', options: figureOptions, required: true },
      {
        type: 'object', name: 'featuredImage', label: 'Featured image (optional)',
        description: 'Clear the image, alternative text and caption to use the fallback illustration.',
        ui: { validate(value) {
          if (!hasOptionalValues(value)) return
          if (!nonBlank(value.src) || !nonBlank(value.alt)) return 'Choose an image and add alternative text, or clear all fields to use the fallback.'
        } },
        fields: postImageFields(false),
      },
      { type: 'object', name: 'author', label: 'Author attribution', description: 'Leave all fields empty to use the configured site publisher.',
        ui: { validate(value) {
          if (!hasOptionalValues(value)) return
          if (!nonBlank(value.name)) return 'Add an author name, or clear every attribution field to use the site publisher.'
        } },
        fields: [
        { type: 'string', name: 'name', label: 'Author name' },
        { type: 'string', name: 'kind', label: 'Author type', options: ['Person', 'Organization'] },
        { type: 'string', name: 'url', label: 'Author page', description: 'Optional site path or HTTPS address.' },
      ] },
      { type: 'string', name: 'category', label: 'Category' },
      { type: 'string', name: 'tags', label: 'Tags', list: true },
      ...seoFields(),
      {
        type: 'object', name: 'body', label: 'Article content', list: true,
        ui: { validate(value, values = {}) {
          if (values.published === true && values.archived !== true && (!Array.isArray(value) || value.length === 0)) return 'Add at least one content block before publishing this post.'
        } },
        templates: [
          { name: 'p', label: 'Paragraph', fields: [textarea('text', 'Paragraph text')] },
          { name: 'h2', label: 'Section heading (H2)', fields: [{ type: 'string', name: 'text', label: 'Heading text', required: true }] },
          { name: 'h3', label: 'Subheading (H3)', fields: [{ type: 'string', name: 'text', label: 'Heading text', required: true }] },
          { name: 'ul', label: 'Bullet list', fields: [{ type: 'string', name: 'items', label: 'List items', list: true, required: true }] },
          { name: 'ol', label: 'Numbered list', fields: [{ type: 'string', name: 'items', label: 'List items', list: true, required: true }] },
          { name: 'link', label: 'Link', fields: [{ type: 'string', name: 'text', label: 'Link text', required: true }, { type: 'string', name: 'href', label: 'Destination', required: true, description: 'A site path such as /image-compressor, or a complete HTTPS address.' }] },
          { name: 'image', label: 'Uploaded image', fields: postImageFields() },
          { name: 'table', label: 'Data table', fields: [
            { type: 'string', name: 'caption', label: 'Table caption' },
            { type: 'string', name: 'columns', label: 'Column headings', list: true, required: true },
            { type: 'object', name: 'rows', label: 'Rows', list: true, required: true, fields: [{ type: 'string', name: 'cells', label: 'Cells (one for each column)', list: true, required: true }] },
          ] },
          { name: 'callout', label: 'Highlighted note', fields: [{ type: 'string', name: 'title', label: 'Note title', required: true }, textarea('text', 'Note text')] },
          { name: 'figure', label: 'Illustration', fields: [{ type: 'string', name: 'figure', label: 'Illustration', options: figureOptions, required: true }, { type: 'string', name: 'caption', label: 'Caption', required: true }] },
        ],
      },
      {
        type: 'object', name: 'references', label: 'Further reading', list: true,
        fields: [{ type: 'string', name: 'title', label: 'Link title', required: true }, { type: 'string', name: 'url', label: 'HTTPS address', required: true }],
      },
    ],
  },
  ...editorialCollections,
  managedPageCollection,
  siteSettingsCollection,
  redirectCollection,
]
