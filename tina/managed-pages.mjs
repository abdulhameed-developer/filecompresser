const string = (name, label, required = true) => ({ type: 'string', name, label, required })
const textarea = (name, label, required = true) => ({ ...string(name, label, required), ui: { component: 'textarea' } })
const link = (name, label, required = false) => ({
  type: 'object', name, label, required,
  fields: [string('label', 'Link text'), { ...string('href', 'Address'), description: 'Use a path on this site, such as /blog, or a full HTTPS address.' }],
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
        { ...string('body', 'Paragraphs', false), list: true, ui: { component: 'list', field: { component: 'textarea' } } },
        { ...string('items', 'Bullet list items', false), list: true, ui: { component: 'list', field: { component: 'textarea' } } },
        { ...link('links', 'Section links'), list: true },
      ],
    },
    link('introCta', 'Introductory action'),
    {
      type: 'object', name: 'support', label: 'Guide strip',
      fields: [string('text', 'First line'), string('emphasis', 'Emphasized line'), link('link', 'Guide link', true)],
    },
    {
      type: 'object', name: 'footer', label: 'Document footer',
      fields: [string('heading', 'Footer heading'), string('introduction', 'Introductory word'), link('link', 'Footer link', true)],
    },
  ],
}
