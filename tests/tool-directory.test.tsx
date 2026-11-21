// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect } from 'vitest'
import ToolDirectory from '@/components/ToolDirectory'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('tool discovery', () => {
  it('filters specialist tools and explains empty results', async () => {
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => root.render(<ToolDirectory />))
      const search = host.querySelector('input')!
      const change = async (value: string) => act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, value)
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await change('pdf')
      expect(host.querySelectorAll('a').length).toBeGreaterThan(0)
      expect([...host.querySelectorAll('a')].every(link => /pdf/i.test(link.textContent!))).toBe(true)
      await change('unavailable-format-xyz')
      expect(host.querySelectorAll('a')).toHaveLength(0)
      expect(host.textContent).toContain('No tools match')
      await change('')
      expect(host.querySelectorAll('a')).toHaveLength(13)
    } finally { await act(async () => root.unmount()); host.remove() }
  })
})
