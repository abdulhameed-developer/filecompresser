import { describe, expect, it } from 'vitest'
import { collections } from '../tina/collections.mjs'
import { editorialFieldPublicationError } from '../tina/editorial-policy.mjs'
import { findProhibitedEditorialTerms, inspectEditorialVocabulary } from '../lib/editorial-vocabulary.mjs'
import { parsePublishedPost } from '@/lib/content'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

interface Field {
  name: string; type?: string; list?: boolean; required?: boolean
  options?: (string | { value: string; label: string })[]
  fields?: Field[]; templates?: Field[]
  ui?: { validate?: (value: unknown, values?: unknown) => string | undefined; field?: { validate?: (value: unknown, values?: unknown) => string | undefined } }
}
const fields: { path: string; field: Field }[] = []
function walk(schema: Field, at: string) {
  for (const field of schema.fields ?? []) {
    const location = `${at}.${field.name}`
    if (field.type === 'string') fields.push({ path: location, field })
    if (field.fields) walk(field, location)
    for (const template of field.templates ?? []) walk(template, `${location}<${template.name}>`)
  }
}
for (const collection of collections as unknown as Field[]) walk(collection, collection.name)

// Independent review of every non-prose string field in the actual schema.
// All other strings, including future free-text/list fields, must receive the
// policy callback. Public date labels are produced from validated ISO dates.
const dates = new Set(['post.date', 'post.updated', 'managedPage.updated'])
const addresses = new Set([
  'post.author.url', 'post.body<link>.href', 'post.references.url',
  'toolPage.links.href', 'homepage.links.href', 'managedPage.sections.links.href',
  'managedPage.introCta.href', 'managedPage.support.link.href', 'managedPage.footer.link.href',
  'siteSettings.supportEmail', 'siteSettings.socialImage', 'siteSettings.sameAs',
  'redirects.rules.from', 'redirects.rules.to',
])
const identifiers = new Set([
  'post.figure', 'post.author.kind', 'post.body<figure>.figure',
  'toolPage.faqMode', 'toolPage.relatedTools', 'homepage.faqMode',
  'managedPage.sections.placement', 'managedPage.sections.icon',
])
const prose = fields.filter(row => !dates.has(row.path) && !addresses.has(row.path) && !identifiers.has(row.path))

describe('complete schema-to-public editorial policy review', () => {
  it('classifies every actual non-prose field and retains the known free-text families', () => {
    const paths = new Set(fields.map(row => row.path))
    for (const location of [...dates, ...addresses, ...identifiers]) expect(paths.has(location), location).toBe(true)
    expect(prose.map(row => row.path)).toEqual(expect.arrayContaining([
      'post.readingTime', 'post.tags', 'post.featuredImage.alt', 'post.featuredImage.caption',
      'post.body<image>.alt', 'post.body<table>.caption', 'post.body<table>.columns',
      'post.body<table>.rows.cells', 'post.body<ul>.items', 'post.body<ol>.items',
      'homepage.steps.title', 'homepage.hero.lead', 'toolPage.faq.q', 'toolPage.faq.a',
      'managedPage.sections.body', 'managedPage.sections.items', 'managedPage.footer.link.label',
      'siteSettings.socialImageAlt',
    ]))
  })

  it.each(prose.map(row => [row.path, row.field] as const))('rejects prohibited prose in the actual Tina callback: %s', (_location, field) => {
    const invalid = field.name === 'html' ? '<p>A robust guide.</p>' : 'A robust guide.'
    const valid = field.name === 'html' ? '<p>A useful guide.</p>' : 'A useful guide.'
    expect(field.options).toBeUndefined()
    const callback = field.list ? field.ui?.field?.validate : field.ui?.validate
    expect(callback).toBeTypeOf('function')
    expect(callback?.(invalid)).toMatch(/robust/)
    expect(callback?.(valid)).toBeUndefined()
    if (field.list) {
      expect(field.ui?.validate?.(undefined)).toBeUndefined()
      expect(field.ui?.validate?.([])).toBeUndefined()
      expect(field.ui?.validate?.([invalid])).toBeUndefined()
      expect(editorialFieldPublicationError(field, ['A useful line.', invalid])).toMatch(/robust/)
      expect(editorialFieldPublicationError(field, ['A useful line.', valid])).toBeUndefined()
    }
  })

  it.each(prose.filter(row => row.field.required).map(row => [row.path, row.field] as const))('retains required validation when a policy callback replaces a native plugin: %s', (_location, field) => {
    const callback = field.list ? field.ui?.field?.validate : field.ui?.validate
    for (const missing of [undefined, null, '', '   ']) expect(typeof callback?.(missing)).toBe('string')
    if (field.list) expect(typeof editorialFieldPublicationError(field, [])).toBe('string')
  })

  it('proves the installed Tina chooses a custom validator instead of combining it with the plugin default', () => {
    const source = readFileSync(createRequire(import.meta.url).resolve('tinacms'), 'utf8')
    const start = source.indexOf('function getProp(name2, field, plugin) {')
    const end = source.indexOf('const isEqual =', start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const getProp = runInNewContext(`${source.slice(start, end)}; getProp`) as (name: string, field: { validate: () => undefined }, plugin: { validate: () => string }) => () => unknown
    const field = { validate: () => undefined }, plugin = { validate: () => 'Native required' }
    expect(getProp('validate', field, plugin)).toBe(field.validate)
    expect(getProp('validate', field, plugin)()).toBeUndefined()
  })

  it.each(fields.filter(row => identifiers.has(row.path)).map(row => [row.path, row.field] as const))('keeps bounded identifier options separate from their readable labels: %s', (_location, field) => {
    expect(field.options?.length).toBeGreaterThan(0)
    for (const option of field.options ?? []) expect(findProhibitedEditorialTerms(typeof option === 'string' ? option : option.label)).toEqual([])
  })

  it('checks reading-time prose at source and in the published reader, rather than treating it as a path', () => {
    expect(inspectEditorialVocabulary({ readingTime: 'A robust estimate' })).toEqual([{ field: 'readingTime', term: 'robust', wordIndex: 1 }])
    const post = { published: true, title: 'A useful guide', description: 'Review an output.', date: '2026-09-04', figure: 'pipeline', readingTime: 'A robust estimate', body: [{ _template: 'p', text: 'Keep a source.' }] }
    expect(() => parsePublishedPost(post, 'useful-guide')).toThrow('readingTime')
  })

  it('does not block a syntactically valid redirect because an address contains a prohibited word', () => {
    const redirectFields = fields.filter(row => row.path.startsWith('redirects.'))
    expect(redirectFields).toHaveLength(2)
    for (const { field } of redirectFields) expect(field.ui?.validate?.('/blog/landscape')).toBeUndefined()
    expect(inspectEditorialVocabulary({ rules: [{ from: '/blog/landscape', to: '/blog/valuable' }] })).toEqual([])
    expect(inspectEditorialVocabulary({ label: 'Landscape guide', href: '/blog/landscape' })).toEqual([{ field: 'label', term: 'landscape', wordIndex: 0 }])
  })
})
