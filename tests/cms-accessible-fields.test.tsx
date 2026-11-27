// @vitest-environment jsdom
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { accessibleTextPlugin } from '../tina/accessible-fields.mjs'

// Exercise the installed controls/labels, without loading unrelated browser-only
// editor dependencies that have a Node ESM/CJS incompatibility. Native editor
// QA separately checks registration inside the actual Tina application.
const source = readFileSync(createRequire(import.meta.url).resolve('tinacms'), 'utf8')
function vendorSection(start: string, end: string) {
  const first = source.indexOf(start)
  const last = source.indexOf(end, first)
  if (first < 0 || last < first) throw Error('Review the installed Tina field implementation before updating this test.')
  return source.slice(first, last)
}
interface FieldProps {
  input: { name: string; value: string; onChange: (event: unknown) => void; onBlur: () => void; onFocus: () => void; 'aria-label'?: string }
  field: { name: string; label: string; required?: boolean; disabled?: boolean; description?: string; placeholder?: string }
  meta: { error?: string }
  tinaForm: { id: string }
}
interface FieldPlugin {
  name: string
  Component: React.ComponentType<FieldProps>
  validate: (value: string, values: unknown, meta: unknown, field: FieldProps['field']) => string | undefined
  parse: (value: string) => string | undefined
}
const { TextFieldPlugin, TextareaFieldPlugin } = runInNewContext([
  vendorSection('function wrapFieldsWithMeta(', 'const EditorContext ='),
  vendorSection('const textFieldClasses =', 'const Dismissible ='),
  vendorSection('const TextareaField =', 'const createClient ='),
  vendorSection('const TextField =', 'const ToggleField ='),
  '; ({ TextFieldPlugin, TextareaFieldPlugin })',
].join('\n'), {
  React, React__default: React,
  useEvent: () => ({ dispatch: () => undefined }),
  parse$2: (value: string) => value === '' ? undefined : value,
}) as { TextFieldPlugin: FieldPlugin; TextareaFieldPlugin: FieldPlugin }

const props = (name = 'sections.0.body'): FieldProps => ({
  input: { name, value: 'Example text', onChange: vi.fn(), onBlur: vi.fn(), onFocus: vi.fn() },
  field: { name: 'body', label: 'Section content', description: 'Use - item for bullets.', required: true },
  meta: {}, tinaForm: { id: 'homepage' },
})
function render(plugin: FieldPlugin, values = props()) {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(React.createElement(plugin.Component, values))
  return host
}

describe('supported Tina text field accessibility extension', () => {
  it.each([TextFieldPlugin, TextareaFieldPlugin])('reproduces and repairs the actual installed $name label/control mismatch', plugin => {
    const before = render(plugin)
    const beforeControl = before.querySelector('input, textarea')!
    expect(beforeControl.id).toBe('')
    expect(before.querySelector('label')!.htmlFor).toBe('sections.0.body')

    const after = render(accessibleTextPlugin(plugin))
    const control = after.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!
    const label = after.querySelector('label')!
    expect(control.id).toBe(label.htmlFor)
    expect(control.labels).toHaveLength(1)
    expect(control.getAttribute('aria-label')).toBe('Section content')
    expect(control.getAttribute('aria-required')).toBe('true')
    expect(control.getAttribute('aria-invalid')).toBe('false')
    expect(after.textContent).toContain('Use - item for bullets.')
    expect(control.value).toBe('Example text')
  })

  it.each([TextFieldPlugin, TextareaFieldPlugin])('preserves $name parser and validation, including required errors', plugin => {
    const extension = accessibleTextPlugin(plugin)
    expect(extension.name).toBe(plugin.name)
    expect(extension.parse).toBe(plugin.parse)
    expect(extension.validate).toBe(plugin.validate)
    expect(extension.validate('', {}, {}, props().field)).toBe('Required')
    expect(extension.parse('')).toBeUndefined()
    const values = props()
    values.meta.error = 'Required'
    const host = render(extension, values)
    expect(host.querySelector('input, textarea')!.getAttribute('aria-invalid')).toBe('true')
    expect(host.textContent).toContain('Required')
  })

  it('retains input callbacks, explicit accessible names, other plugin fields and immutable input objects', () => {
    const Component = vi.fn((_props: { input: Record<string, unknown> }) => null)
    const plugin = { name: 'text', Component, parse: vi.fn(), validate: vi.fn(), defaultValue: 'unchanged' }
    const values = props('hero.lead')
    values.input['aria-label'] = 'Custom accessible name'
    Object.freeze(values.input)
    Object.freeze(values.field)
    const extended = accessibleTextPlugin(plugin)
    renderToStaticMarkup(React.createElement(extended.Component, values))
    const input = Component.mock.calls[0][0].input
    expect(input.onChange).toBe(values.input.onChange)
    expect(input.onBlur).toBe(values.input.onBlur)
    expect(input.onFocus).toBe(values.input.onFocus)
    expect(input['aria-label']).toBe('Custom accessible name')
    expect(input.id).toBe('hero.lead')
    expect(extended.defaultValue).toBe('unchanged')
    expect(values.input).not.toHaveProperty('id')
  })
})
