// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect } from 'vitest'
import ToolDirectory from '@/components/ToolDirectory'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
describe('category filtering', () => {
  it('combines category and text filters and can recover from an empty result', async () => {
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => root.render(<ToolDirectory />))
      const category = [...host.querySelectorAll('button')].find(button => button.textContent === 'PDF & Archives')!
      await act(async () => category.click())
      expect(host.querySelectorAll('.toolTile')).toHaveLength(3)
      expect(category.getAttribute('aria-pressed')).toBe('true')
      const input = host.querySelector('input')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'jpg')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(host.querySelectorAll('.toolTile')).toHaveLength(0)
      const reset = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Reset filters'))!
      await act(async () => reset.click())
      expect(host.querySelectorAll('.toolTile')).toHaveLength(13)
      expect(input.value).toBe('')
    } finally { await act(async () => root.unmount()); host.remove() }
  })
})
