import { describe, expect, it } from 'vitest'
import { createForm, type Mutator } from 'final-form'
import { createRequire } from 'node:module'
import { resolveField, TinaSchema } from '@tinacms/schema-tools'
import { collections } from '../tina/collections.mjs'
import { editorialFieldPublicationError } from '../tina/editorial-policy.mjs'

type Validate = (value: unknown, values?: unknown) => string | undefined
interface Field { name: string; type?: string; list?: boolean; required?: boolean; options?: unknown[]; fields?: Field[]; templates?: Field[]; ui?: { validate?: Validate; field?: { component?: string; validate?: Validate; list?: boolean; required?: boolean } } }
const arrayMutators = createRequire(import.meta.url)('final-form-arrays').default as Record<string, Mutator<Record<string, unknown>>>
const lists: { path: string; field: Field }[] = []
const walk = (node: Field, at: string) => {
  for (const field of node.fields ?? []) {
    const path = `${at}.${field.name}`
    if (field.type === 'string' && field.list && !field.options) lists.push({ path, field })
    if (field.fields) walk(field, path)
    for (const template of field.templates ?? []) walk(template, `${path}<${template.name}>`)
  }
}
for (const collection of collections as unknown as Field[]) walk(collection, collection.name)
const nativeSchema = new TinaSchema({ collections } as unknown as ConstructorParameters<typeof TinaSchema>[0])

describe('native scalar list errors cannot collide with parent errors', () => {
  it('retains the actual installed final-form reproduction of a scalar parent error plus indexed item error', () => {
    const form = createForm<Record<string, unknown>>({ initialValues: { items: [] }, onSubmit: () => {} })
    form.registerField('items', () => {}, { value: true, error: true }, { getValidator: () => value => Array.isArray(value) && value.length ? 'Parent list error' : undefined })
    form.change('items', [''])
    expect(() => form.registerField('items.0', () => {}, { value: true, error: true }, { getValidator: () => value => !value ? 'Item needs text' : undefined })).toThrow('Cannot set a numeric property on an object')
  })

  it('retains the installed last-item removal failure when the native parent Required fallback is active', () => {
    const form = createForm<Record<string, unknown>>({ initialValues: { items: ['A useful line.'] }, onSubmit: () => {}, mutators: arrayMutators })
    form.registerField('items', () => {}, { value: true, error: true }, { getValidator: () => value => !value ? 'Required' : undefined })
    form.registerField('items.0', () => {}, { value: true, error: true }, { getValidator: () => value => !value ? 'Item needs text' : undefined })
    expect(() => form.mutators.remove('items', 0)).toThrow('Cannot set a numeric property on an object')
  })

  it('covers every actual free string-list family rather than one list widget', () => {
    expect(lists.map(row => row.path).sort()).toEqual([
      'post.tags', 'post.body<ul>.items', 'post.body<ol>.items', 'post.body<table>.columns',
      'post.body<table>.rows.cells', 'managedPage.sections.body', 'managedPage.sections.items', 'siteSettings.sameAs',
    ].sort())
  })

  it.each(lists.map(row => [row.path, row.field] as const))('native resolution, empty-item error, correction and invalid text all work for %s', (_path, field) => {
    const resolved = resolveField(field as Parameters<typeof resolveField>[0], nativeSchema) as unknown as { component: string; validate?: Validate; field: { component: string; list: boolean; required: boolean; validate: Validate } }
    expect(resolved.component).toBe('list')
    expect(resolved.validate?.(undefined)).toBeUndefined()
    expect(resolved.validate?.([])).toBeUndefined()
    expect(resolved.field.list).toBe(false)
    expect(resolved.field.required).toBe(true)
    expect(resolved.field.component).toBe(field.ui?.field?.component)
    const form = createForm<Record<string, unknown>>({ initialValues: { items: [] }, onSubmit: () => {}, mutators: arrayMutators })
    form.registerField('items', () => {}, { value: true, error: true }, { getValidator: () => resolved.validate })
    form.change('items', [''])
    let unregister: (() => void) | undefined
    expect(() => { unregister = form.registerField('items.0', () => {}, { value: true, error: true }, { getValidator: () => resolved.field.validate }) }).not.toThrow()
    expect(form.getState().errors?.items?.[0]).toBeTypeOf('string')
    const valid = field.name === 'sameAs' ? 'https://example.com/profile' : 'A useful line.'
    form.change('items.0', valid)
    expect(form.getState().hasValidationErrors).toBe(false)
    const invalid = field.name === 'sameAs' ? 'javascript:alert(1)' : 'A robust line.'
    form.change('items.0', invalid)
    expect(form.getState().errors?.items?.[0]).toBeTypeOf('string')
    expect(typeof editorialFieldPublicationError(field, [valid, invalid])).toBe('string')
    form.change('items.0', valid)
    expect(form.getState().hasValidationErrors).toBe(false)
    expect(editorialFieldPublicationError(field, [valid])).toBeUndefined()
    expect(typeof editorialFieldPublicationError(field, [])).toBe(field.required ? 'string' : 'undefined')
    expect(() => form.mutators.remove('items', 0)).not.toThrow()
    unregister!()
    expect(form.getState().hasValidationErrors).toBe(false)
    expect(form.getState().values.items).toBeUndefined()
    expect(typeof editorialFieldPublicationError(field, undefined)).toBe(field.required ? 'string' : 'undefined')
  })
})
