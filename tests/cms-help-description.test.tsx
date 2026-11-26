// @vitest-environment jsdom
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { collections } from '../tina/collections.mjs'

// Load the installed component itself without loading unrelated browser-only
// editor packages (including a color-string ESM/CJS incompatibility in Node).
const require = createRequire(import.meta.url)
const vendorSource = readFileSync(require.resolve('tinacms'), 'utf8')
const rendererStart = vendorSource.indexOf('const FieldDescription = (')
const rendererEnd = vendorSource.indexOf('\nconst FieldError =', rendererStart)
if (rendererStart < 0 || rendererEnd < rendererStart) throw new Error('Review the installed Tina FieldDescription renderer before updating this test.')
const FieldDescription = runInNewContext(`${vendorSource.slice(rendererStart, rendererEnd)}; FieldDescription`, { React, React__default: React }) as React.ComponentType<{ children?: string }>

interface HelpField { name?: string; description?: string; fields?: HelpField[]; templates?: HelpField[] }
const schemas = collections as unknown as HelpField[]
const article = schemas.find(collection => collection.name === 'post')!
const htmlHelp = article.fields!.find(field => field.name === 'body')!.templates!.find(field => field.name === 'html')!.fields![0].description!
const sectionHelp = (name: string) => schemas.find(collection => collection.name === name)!.fields!.find(field => field.name === 'sections')!.fields!.find(field => field.name === 'body')!.description!

function renderHelp(description: string) {
  const view = document.createElement('div')
  // Exercise the installed Tina renderer, which interprets descriptions as HTML.
  view.innerHTML = renderToStaticMarkup(React.createElement(FieldDescription, null, description))
  return view.firstElementChild!
}

describe('CMS syntax help stays readable in the actual Tina description renderer', () => {
  it.each([
    ['article Safe HTML', htmlHelp],
    ['homepage section', sectionHelp('homepage')],
    ['tool section', sectionHelp('toolPage')],
  ])('shows copyable HTML examples as text without creating help-page controls or layout: %s', (_name, description) => {
    const view = renderHelp(description)
    expect(view.textContent).toContain('<p>Text</p>')
    expect(view.textContent).toContain('<ul><li>Item</li></ul>')
    expect(view.textContent).toContain('<a href="/privacy">Privacy</a>')
    expect(view.querySelectorAll('p, br, ul, ol, li, a, input, textarea, script, style, iframe')).toHaveLength(0)
  })

  it('keeps every configured field description text-only without unexplained Markdown backticks', () => {
    const visit = (fields: HelpField[]) => {
      for (const field of fields) {
        if (field.description) {
          const view = renderHelp(field.description)
          expect(view.children.length, field.name).toBe(0)
          expect(view.textContent, field.name).not.toContain('`')
        }
        if (field.fields) visit(field.fields)
        if (field.templates) visit(field.templates)
      }
    }
    visit(schemas)
  })
})
