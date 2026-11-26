import { editorialFieldValidator, editorialUrlFieldValidator } from '../lib/editorial-markup.mjs'

const inlineValidation = editorialFieldValidator()
const sectionValidation = editorialFieldValidator({ allowHtml: true })
const linkValidation = editorialUrlFieldValidator()
const toolOptions = [
  ['compress', 'Compress Any File'], ['image-compressor', 'Image Compressor'],
  ['jpg-compressor', 'JPG Compressor'], ['jpeg-compressor', 'JPEG Compressor'],
  ['png-compressor', 'PNG Compressor'], ['webp-compressor', 'WebP Compressor'],
  ['gif-compressor', 'GIF Compressor'], ['video-compressor', 'Video Compressor'],
  ['webm-to-mp4', 'WebM to MP4 Converter'],
  ['mp3-compressor', 'MP3 Compressor'], ['wav-compressor', 'WAV to MP3'],
  ['pdf-compressor', 'PDF Compressor'], ['zip-compressor', 'ZIP Creator'],
  ['archive-compressor', 'ZIP Extractor'],
].map(([value, label]) => ({ value, label }))
const text = (name, label, multiline = false, required = true) => ({ type: 'string', name, label, required, ...(multiline ? { ui: { component: 'textarea' } } : {}) })
const formattedText = (name, label, validate = inlineValidation) => ({ ...text(name, label, true), ui: { component: 'textarea', validate } })
const faqFields = () => [
  { type: 'string', name: 'faqMode', label: 'FAQ display', options: [{ value: 'default', label: 'Use existing FAQs' }, { value: 'custom', label: 'Use the questions below' }, { value: 'hidden', label: 'Hide FAQs' }], description: 'Visible questions and their structured data always match.' },
  { type: 'object', name: 'faq', label: 'Questions and answers', list: true, fields: [text('q', 'Question'), formattedText('a', 'Answer')], ui: { itemProps: item => ({ label: item.q || 'Question' }) } },
]
const editorialFields = () => [
  { ...text('heading', 'Content heading'), isTitle: true },
  formattedText('introduction', 'Introduction'),
  { type: 'object', name: 'sections', label: 'Content sections', list: true, ui: { itemProps: item => ({ label: item.heading || 'Section' }) }, fields: [text('heading', 'Section heading'), { ...formattedText('body', 'Content — paragraphs, lists, links or safe HTML', sectionValidation), description: 'Use blank lines for paragraphs, `- item` for bullets, `1. item` for numbers, and `[Privacy Policy](/privacy)` for links. HTML supports `<p>`, `<br>`, `<strong>`, `<em>`, `<b>`, `<i>`, `<code>`, `<ul>`, `<ol>`, `<li>`, `<blockquote>` and `<a>` with a quoted `href`. Close every tag. Scripts, embeds, styles and other attributes are not supported.' }] },
  { type: 'object', name: 'links', label: 'Helpful links', list: true, fields: [text('label', 'Link text'), { ...text('href', 'Link address'), ui: { validate: linkValidation }, description: 'Use an existing /page path, #section anchor or a full HTTPS address.' }] },
  ...faqFields(),
  { ...text('seoTitle', 'SEO title', false, false), description: 'Leave blank to use the existing page title. Keep it specific and readable.' },
  { ...text('seoDescription', 'SEO description', true, false), description: 'Leave blank to use the existing description. Summarize the page accurately.' },
]
export const editorialCollections = [
  {
    name: 'toolPage', label: 'Tool pages', path: 'content/tools', format: 'json',
    match: { include: `{${toolOptions.map(tool => tool.value).join(',')}}` },
    ui: { allowedActions: { create: false, delete: false, createNestedFolder: false } },
    fields: [
      ...editorialFields(),
      { type: 'string', name: 'relatedTools', label: 'Related tools', list: true, options: toolOptions, description: 'Leave empty to use existing related tools. These links appear below the content.' },
    ],
  },
  {
    name: 'homepage', label: 'Homepage', path: 'content/home', format: 'json', match: { include: 'home' },
    ui: { global: true, allowedActions: { create: false, delete: false, createNestedFolder: false } },
    fields: [
      {
        type: 'object', name: 'hero', label: 'Main introduction',
        description: 'Complete all three fields, or clear them all to use the existing introduction.',
        ui: { validate(value) {
          if (!value || Object.values(value).every(item => item === undefined || item === null || String(item).trim() === '')) return
          if (!['lead', 'emphasis', 'description'].every(key => typeof value[key] === 'string' && value[key].trim())) return 'Complete the headline, emphasized text and introduction, or clear all three.'
        } },
        fields: [text('lead', 'Headline', false, false), text('emphasis', 'Emphasized headline', false, false), { ...text('description', 'Short introduction', true, false), description: 'Keep this brief so the file tool remains easy to reach.' }],
      },
      { type: 'object', name: 'steps', label: 'How it works', list: true, fields: [text('title', 'Step title'), text('description', 'Step description', true)] },
      ...editorialFields(),
    ],
  },
]
