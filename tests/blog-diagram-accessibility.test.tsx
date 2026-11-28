// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BlogFigure from '@/components/BlogFigure'
import BlogContent from '@/components/BlogContent'
import type { FigureId } from '@/lib/blog'

describe('readable editorial diagrams retain accessible content', () => {
  it.each(['pipeline', 'sizebars', 'dataflow', 'formattree'] as FigureId[])('%s keeps its named image, keyboard scroll region, prose summary and authored caption', figure => {
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(BlogContent, { blocks: [{ type: 'figure', figure, caption: 'An authored caption remains visible.' }] }))
    const viewport = view.querySelector('.diagramViewport')!
    expect(viewport.getAttribute('role')).toBe('region')
    expect(viewport.getAttribute('tabindex')).toBe('0')
    expect(viewport.getAttribute('aria-label')).toMatch(/diagram/)
    const svg = viewport.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')!.length).toBeGreaterThan(50)
    expect(svg.querySelectorAll('text').length).toBeGreaterThan(5)
    const summary = view.querySelector('.diagramSummary')!
    expect(summary.textContent).toBe(svg.getAttribute('aria-label'))
    expect(viewport.contains(summary)).toBe(false)
    const caption = view.querySelector('figcaption')!
    expect(caption.textContent).toBe('An authored caption remains visible.')
    expect(viewport.contains(caption)).toBe(false)
    expect(view.querySelector('.diagramScrollHint')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('retains the native qualitative mode guide without adding a scroll region', () => {
    const view = document.createElement('div')
    view.innerHTML = renderToStaticMarkup(createElement(BlogFigure, { figure: 'qualitycurve' }))
    expect(view.querySelector('.diagramViewport')).toBeNull()
    expect(view.querySelector('[role="group"]')?.getAttribute('aria-label')).toMatch(/four image compression modes/)
    expect([...view.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Balanced', 'High quality', 'Maximum', 'Target size'])
  })
})
