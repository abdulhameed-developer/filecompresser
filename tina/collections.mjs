import { redirectCollection } from './redirects.mjs'
import { editorialCollections } from './editorial.mjs'
import { managedPageCollection } from './managed-pages.mjs'
import { siteSettingsCollection } from './site-settings.mjs'
import { editorialFieldValidator, editorialUrlFieldValidator } from '../lib/editorial-markup.mjs'
import { withEditorialPolicy } from './editorial-policy.mjs'
import { editorialImageFieldValidator } from '../lib/editorial-constraints.mjs'

const htmlValidation = editorialFieldValidator({ htmlOnly: true })
const paragraphValidation = editorialFieldValidator({ literalHtml: true })
const linkValidation = editorialUrlFieldValidator()
const authorLinkValidation = editorialUrlFieldValidator({ required: false })
const referenceValidation = editorialUrlFieldValidator({ reference: true })

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
const isIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const publicationDateOrderError = values => {
  if (values?.published === true && values?.archived !== true && isIsoDate(values.date) && isIsoDate(values.updated) && values.updated < values.date) return 'Last updated cannot be earlier than publication date.'
}
const date = (name, label, required = false) => ({
  type: 'string', name, label, required,
  description: 'Use YYYY-MM-DD, for example 2026-11-21.',
  ui: {
    validate(value, values = {}) {
      if (!value && !required) return
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Use YYYY-MM-DD.'
      if (!isIsoDate(value)) return 'Enter a real calendar date.'
      return publicationDateOrderError({ ...values, [name]: value })
    },
  },
})
const seoFields = () => [
  { type: 'string', name: 'seoTitle', label: 'SEO title', description: 'Optional. Aim for a clear, specific title of around 50–60 characters. Empty uses the existing page title.' },
  { ...textarea('seoDescription', 'SEO description', false), description: 'Optional. Write a useful search summary, usually around 140–160 characters. Empty uses the existing description.' },
]
const postImageFields = (required = true) => [
  { type: 'image', name: 'src', label: 'Image', required, ui: { validate: editorialImageFieldValidator({ required }) }, description: 'Choose a raster image uploaded to this site.' },
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
      { type: 'boolean', name: 'published', label: 'Publish this post', description: 'Off = draft. Saving a published post commits to GitHub and appears publicly after the next successful hosting build.', ui: { validate(value, values = {}) { return publicationDateOrderError({ ...values, published: value }) } } },
      { type: 'boolean', name: 'archived', label: 'Archive this post', description: 'Keeps the content file but removes the post from public pages and sitemaps after the next build. Add an appropriate redirect for an old indexed address.', ui: { validate(value, values = {}) { return publicationDateOrderError({ ...values, archived: value }) } } },
      { type: 'string', name: 'title', label: 'Post title', isTitle: true, required: true },
      textarea('description', 'Short introduction'),
      { ...date('date', 'Original publication date', true), description: 'Real first-publication date for search metadata. It is kept internally, not shown as a separate public date.' },
      { ...date('updated', 'Last updated'), description: 'Use YYYY-MM-DD after a substantive change or meaningful editorial review. Visitors see only this Updated date. If empty, the original date is the truthful fallback.' },
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
        { type: 'string', name: 'url', label: 'Author page', ui: { validate: authorLinkValidation }, description: 'Optional site path, #section anchor or HTTPS address.' },
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
          { name: 'p', label: 'Paragraph', fields: [{ ...textarea('text', 'Paragraph text'), ui: { component: 'textarea', validate: paragraphValidation }, description: 'Add inline links as [link text](/page) or [link text](https://example.com). For HTML, choose the Safe HTML block.' }] },
          { name: 'html', label: 'Safe HTML', fields: [{ ...textarea('html', 'HTML content'), ui: { component: 'textarea', validate: htmlValidation }, description: 'Examples: &lt;p&gt;Text&lt;/p&gt;, &lt;ul&gt;&lt;li&gt;Item&lt;/li&gt;&lt;/ul&gt; and &lt;a href=&quot;/privacy&quot;&gt;Privacy&lt;/a&gt;. Also supports ol/li, br, strong/em, b/i, code and blockquote. The only attribute is a quoted href on a. Close tags in order. Scripts, styles and embeds are rejected.' }] },
          { name: 'h2', label: 'Section heading (H2)', fields: [{ type: 'string', name: 'text', label: 'Heading text', required: true }] },
          { name: 'h3', label: 'Subheading (H3)', fields: [{ type: 'string', name: 'text', label: 'Heading text', required: true }] },
          { name: 'ul', label: 'Bullet list', fields: [{ type: 'string', name: 'items', label: 'List items', list: true, required: true }] },
          { name: 'ol', label: 'Numbered list', fields: [{ type: 'string', name: 'items', label: 'List items', list: true, required: true }] },
          { name: 'link', label: 'Link', fields: [{ type: 'string', name: 'text', label: 'Link text', required: true }, { type: 'string', name: 'href', label: 'Destination', required: true, ui: { validate: linkValidation }, description: 'A site path such as /image-compressor, a #section anchor, or a complete HTTPS address.' }] },
          { name: 'image', label: 'Uploaded image', fields: postImageFields() },
          { name: 'table', label: 'Data table', fields: [
            { type: 'string', name: 'caption', label: 'Table caption' },
            { type: 'string', name: 'columns', label: 'Column headings', list: true, required: true },
            { type: 'object', name: 'rows', label: 'Rows', list: true, required: true, fields: [{ type: 'string', name: 'cells', label: 'Cells (one for each column)', list: true, required: true }] },
          ] },
          { name: 'callout', label: 'Highlighted note', fields: [{ type: 'string', name: 'title', label: 'Note title', required: true }, textarea('text', 'Note text')] },
          { name: 'figure', label: 'Illustration', fields: [
            { type: 'string', name: 'figure', label: 'Illustration', options: figureOptions, required: true },
            {
              type: 'string', name: 'caption', label: 'Caption',
              // Tina selects identically named scalar fields together across
              // body templates. Keep GraphQL nullability aligned with image
              // and table captions, while requiring illustration captions in
              // the editor and the published-content reader.
              ui: { validate(value) {
                if (!nonBlank(value)) return 'Add a caption for this illustration.'
              } },
            },
          ] },
        ],
      },
      {
        type: 'object', name: 'references', label: 'Further reading', list: true,
        fields: [{ type: 'string', name: 'title', label: 'Link title', required: true }, { type: 'string', name: 'url', label: 'HTTP(S) address', required: true, ui: { validate: referenceValidation } }],
      },
    ],
  },
  ...editorialCollections,
  managedPageCollection,
  siteSettingsCollection,
  redirectCollection,
].map(withEditorialPolicy)
