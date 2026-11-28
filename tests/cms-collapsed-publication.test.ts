import { describe, expect, it } from 'vitest'
import { collections } from '../tina/collections.mjs'
import { editorialFieldPublicationError, withEditorialPolicy } from '../tina/editorial-policy.mjs'
import { parseEditorialContent, parsePublishedPost } from '@/lib/content'
import { parseManagedPage } from '@/lib/managed-pages'

interface Field { name: string; fields?: Field[]; templates?: Field[]; ui?: { validate?: (value: unknown, values?: Record<string, unknown>) => string | undefined } }
const field = (collection: string, name: string) => (collections as unknown as { name: string; fields: Field[] }[]).find(item => item.name === collection)!.fields.find(item => item.name === name)!
const validate = (collection: string, name: string, value: unknown, values: Record<string, unknown> = {}) => editorialFieldPublicationError(field(collection, name), value, values)
const submit = (name: string, values: Record<string, unknown>, args: Record<string, unknown> = {}) => (collections as unknown as { name: string; ui: { beforeSubmit: (args: Record<string, unknown>) => Promise<unknown> } }[]).find(item => item.name === name)!.ui.beforeSubmit({ values, ...args })
const tool = { heading: 'Tool guide', introduction: 'Choose a file.' }
const post = { published: true, archived: false, title: 'A useful guide', description: 'Check a copy.', date: '2026-09-04', updated: '2026-11-28', readingTime: '4 min', figure: 'pipeline', body: [{ _template: 'p', text: 'Keep a source.' }] }
const managed = { title: 'About', seoTitle: 'About', seoDescription: 'A useful page.', sections: [] }

describe('collapsed lists cannot bypass publication validation', () => {
  it.each([
    [{}, 'sections[0].heading'],
    [{ heading: '', body: 'Written body.' }, 'sections[0].heading'],
    [{ heading: 'Written heading', body: '' }, 'sections[0].body'],
    [{ heading: 'Written heading', body: '<p>Unclosed' }, 'Close'],
    [{ heading: 'Written heading', body: '[Read](javascript:alert(1))' }, 'site path'],
  ])('validates an unopened section row before backend submission without mounting any child: %j', (row, message) => {
    expect(validate('toolPage', 'sections', [row])).toContain(message)
    expect(() => parseEditorialContent({ ...tool, sections: [row] }, 'tool')).toThrow()
  })

  it('reports the exact later-row index rather than just validating the opened or first item', () => {
    const rows = [{ heading: 'First', body: 'Valid.' }, { heading: 'Second', body: 'Valid.' }, { heading: '', body: 'Third body.' }]
    expect(validate('toolPage', 'sections', rows)).toContain('sections[2].heading')
    expect(validate('homepage', 'sections', rows)).toContain('sections[2].heading')
    expect(validate('toolPage', 'sections', [])).toBeUndefined()
    expect(validate('toolPage', 'sections', rows.slice(0, 2))).toBeUndefined()
  })

  it.each([{}, { label: 'Read', href: '' }, { label: '', href: '/privacy' }, { label: 'Read', href: 'javascript:alert(1)' }])('blocks an unopened incomplete or unsafe helpful-link row: %j', row => {
    expect(typeof validate('toolPage', 'links', [row])).toBe('string')
    expect(typeof validate('homepage', 'links', [row])).toBe('string')
    expect(() => parseEditorialContent({ ...tool, links: [row] }, 'tool')).toThrow()
  })

  it('checks every homepage step while keeping an empty optional list clearable', () => {
    const steps = [{ title: 'Select', description: 'Choose a file.' }, { title: 'Process', description: 'Review settings.' }, { title: 'Save', description: '' }]
    expect(validate('homepage', 'steps', steps)).toContain('steps[2].description')
    expect(() => parseEditorialContent({ ...tool, steps }, 'home')).toThrow()
    expect(validate('homepage', 'steps', [])).toBeUndefined()
  })

  it('checks nested managed-page lists and links without mounting individual rows', () => {
    for (const row of [
      { heading: '' },
      { heading: 'Information', body: ['Valid.', ''] },
      { heading: 'Information', items: ['Valid.', ''] },
      { heading: 'Information', links: [{ label: '', href: '/privacy' }] },
      { heading: 'Information', links: [{ label: 'Read', href: 'javascript:alert(1)' }] },
    ]) {
      expect(typeof validate('managedPage', 'sections', [row])).toBe('string')
      expect(() => parseManagedPage({ ...managed, sections: [row] }, 'about')).toThrow()
    }
    expect(validate('managedPage', 'sections', [{ heading: 'Information', body: [], items: [], links: [] }])).toBeUndefined()
  })

  it('keeps cleared optional groups and blank FAQ rows valid, and partial groups invalid', () => {
    for (const [collection, name, value] of [
      ['homepage', 'hero', {}], ['post', 'featuredImage', { src: '', alt: '', caption: '' }],
      ['post', 'author', { name: '', kind: '', url: '' }], ['managedPage', 'introCta', { label: '', href: '' }],
      ['managedPage', 'support', {}], ['managedPage', 'footer', {}],
    ] as const) expect(validate(collection, name, value)).toBeUndefined()
    expect(validate('toolPage', 'faq', [{}, { q: '', a: '' }, { q: 'Where?', a: 'Here.' }])).toBeUndefined()
    expect(typeof validate('toolPage', 'faq', [{ q: 'Where?', a: '' }])).toBe('string')
    expect(typeof validate('homepage', 'hero', { lead: 'Smaller.' })).toBe('string')
    expect(typeof validate('post', 'featuredImage', { src: '/uploads/art.png', alt: '' })).toBe('string')
  })
})

describe('collapsed post templates and publication-state changes', () => {
  const badBlocks = [
    { _template: 'h2', text: '' }, { _template: 'h3' }, { _template: 'p', text: '' },
    { _template: 'p', text: '[Read](javascript:alert(1))' },
    { _template: 'html', html: '<p>Unclosed' },
    { _template: 'image', src: '', alt: 'Artwork' }, { _template: 'image', src: '/uploads/art.png', alt: '' },
    { _template: 'link', text: 'Read', href: '' }, { _template: 'link', text: '', href: '/privacy' },
    { _template: 'ul', items: ['Valid.', ''] }, { _template: 'ol', items: [''] },
    { _template: 'callout', title: '', text: 'Keep a source.' },
    { _template: 'figure', figure: 'pipeline', caption: '' },
    { _template: 'figure', figure: 'unknown', caption: 'A diagram.' },
    { _template: 'table', columns: ['A', 'B'], rows: [{ cells: ['Only one'] }] },
    { _template: 'table', columns: ['A'], rows: [] },
    { _template: 'table', columns: Array.from({ length: 13 }, (_, index) => `Column ${index + 1}`), rows: [{ cells: Array.from({ length: 13 }, () => 'Cell') }] },
    { _template: 'not-supported', text: 'A block.' },
  ]
  it.each(badBlocks)('rejects an invalid unopened template when published: %j', block => {
    const body = [...post.body, block]
    expect(typeof validate('post', 'body', body, { ...post, body })).toBe('string')
    expect(() => parsePublishedPost({ ...post, body }, 'guide')).toThrow()
  })

  it.each(badBlocks)('Publish and Unarchive cannot save a dormant invalid block: %j', async block => {
    const body = [...post.body, block]
    await expect(submit('post', { ...post, published: true, body })).rejects.toThrow()
    await expect(submit('post', { ...post, archived: false, body })).rejects.toThrow()
  })

  it('permits unfinished required body text in a stored draft and always permits removing publication', () => {
    const body = [{ _template: 'h2', text: '' }]
    expect(validate('post', 'body', body, { ...post, published: false, body })).toBeUndefined()
    expect(validate('post', 'body', body, { ...post, archived: true, body })).toBeUndefined()
    expect(validate('post', 'published', false, { ...post, body })).toBeUndefined()
    expect(validate('post', 'archived', true, { ...post, body })).toBeUndefined()
    expect(parsePublishedPost({ ...post, published: false, body }, 'draft')).toBeUndefined()
  })

  it('accepts complete lists, links, HTML, image fields and matching table rows without altering values', () => {
    const body = [
      { _template: 'h2', text: 'Choose a format' }, { _template: 'p', text: 'Read [privacy](/privacy).' },
      { _template: 'html', html: '<ol><li>Keep a source</li><li>Check a copy</li></ol>' },
      { _template: 'ul', items: ['Select a file.', 'Compare it.'] },
      { _template: 'image', src: '/uploads/art.png', alt: 'A file comparison.' },
      { _template: 'figure', figure: 'pipeline', caption: 'The processing stages.' },
      { _template: 'table', columns: ['Format', 'Use'], rows: [{ cells: ['PNG', 'Transparent artwork'] }] },
    ]
    const snapshot = JSON.stringify(body)
    expect(validate('post', 'body', body, { ...post, body })).toBeUndefined()
    expect(validate('post', 'published', true, { ...post, published: false, body })).toBeUndefined()
    expect(validate('post', 'archived', false, { ...post, archived: true, body })).toBeUndefined()
    expect(JSON.stringify(body)).toBe(snapshot)
  })
})


describe('native Tina navigation and submission boundaries', () => {
  it('does not register form-invalid object/list callbacks that would prevent opening a new or malformed row', () => {
    const inspect = (node: Field) => {
      if (node.fields || node.templates) expect(node.ui?.validate).toBeUndefined()
      for (const child of node.fields ?? []) inspect(child)
      for (const template of node.templates ?? []) for (const child of template.fields ?? []) inspect(child)
    }
    for (const collection of collections as unknown as Field[]) for (const child of collection.fields ?? []) inspect(child)
  })

  it('rejects Save before any values are transformed and opens the exact closed row for repair', async () => {
    const values = { ...tool, sections: [{ heading: 'Valid', body: 'A useful line.' }, { heading: '', body: 'Keep the body.' }] }
    const before = JSON.stringify(values), actions: unknown[] = []
    await expect(submit('toolPage', values, { cms: { dispatch: (action: unknown) => actions.push(action) }, form: { id: 'tool-form' } })).rejects.toThrow('sections[1].heading')
    expect(actions).toEqual([{ type: 'forms:set-active-field-name', value: { formId: 'tool-form', fieldName: 'sections.1' } }])
    expect(JSON.stringify(values)).toBe(before)
    values.sections[1].heading = 'Repaired'
    await expect(submit('toolPage', values)).resolves.toBe(values)
  })

  it('opens a partial FAQ and nested table row while retaining their existing validation', async () => {
    const actions: { value: { fieldName: string } }[] = [], args = { cms: { dispatch: (action: { value: { fieldName: string } }) => actions.push(action) }, form: { id: 'test' } }
    await expect(submit('toolPage', { ...tool, faq: [{ q: 'Complete?', a: 'Yes.' }, { q: 'Incomplete?', a: '' }] }, args)).rejects.toThrow('Question 2')
    expect(actions.at(-1)?.value.fieldName).toBe('faq.1')
    await expect(submit('post', { ...post, body: [{ _template: 'table', columns: ['Format'], rows: [{ cells: [''] }] }] }, args)).rejects.toThrow('body[0].rows[0].cells[0]')
    expect(actions.at(-1)?.value.fieldName).toBe('body.0.rows.0')
  })

  it('permits draft and archive saves with unfinished body text, but blocks both publication transitions before backend writes', async () => {
    const unfinished = { ...post, body: [{ _template: 'h2', text: '' }] }
    for (const values of [{ ...unfinished, published: false }, { ...unfinished, archived: true }]) await expect(submit('post', values)).resolves.toBe(values)
    for (const values of [{ ...unfinished, published: true }, { ...unfinished, archived: false }]) await expect(submit('post', values)).rejects.toThrow('body[0].text')
  })

  it('preserves an existing beforeSubmit hook and validates its proposed values', async () => {
    const schema = withEditorialPolicy({ name: 'example', path: 'content/example', fields: [{ type: 'string', name: 'title', required: true }], ui: { beforeSubmit: async ({ values }: { values: Record<string, unknown> }) => ({ ...values, title: 'A robust result' }) } })
    await expect(schema.ui.beforeSubmit({ values: { title: 'A useful title' } })).rejects.toThrow('robust')
  })
})
