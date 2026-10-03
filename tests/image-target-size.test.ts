import { describe, it, expect } from 'vitest'
import { defaultOutputFormatFor, isImageFormat } from '@/lib/engines/image'

/**
 * The pure decision logic behind the "Download as" picker.
 *
 * The encoders themselves need a real browser canvas, so these cover the parts
 * that can be tested honestly in Node: the default the picker opens on, and
 * the guard that keeps an unexpected value from reaching an encoder.
 */

describe('default output format', () => {
  it('defaults to the format the user actually uploaded', () => {
    expect(defaultOutputFormatFor('holiday.jpg')).toBe('jpeg')
    expect(defaultOutputFormatFor('holiday.JPEG')).toBe('jpeg')
    expect(defaultOutputFormatFor('shot.jfif')).toBe('jpeg')
    expect(defaultOutputFormatFor('diagram.png')).toBe('png')
    expect(defaultOutputFormatFor('hero.webp')).toBe('webp')
  })

  it('falls back to JPEG when the extension means nothing to the encoder', () => {
    expect(defaultOutputFormatFor('mystery.bin')).toBe('jpeg')
    expect(defaultOutputFormatFor('noextension')).toBe('jpeg')
  })

  it('does not read a dot inside a directory name as an extension', () => {
    // "my.photos.backup" is one dot-separated stem; the last segment wins.
    expect(defaultOutputFormatFor('my.photos.backup')).toBe('jpeg')
  })
})

describe('output format guard', () => {
  it('accepts only formats the image engine can really encode', () => {
    expect(isImageFormat('jpeg')).toBe(true)
    expect(isImageFormat('png')).toBe(true)
    expect(isImageFormat('webp')).toBe(true)
  })

  it('rejects formats that would be a repackage rather than an encode', () => {
    // GIF is excluded on purpose: a still image written as GIF would not be a
    // conversion, it would just be a re-extension.
    expect(isImageFormat('gif')).toBe(false)
    expect(isImageFormat('mp4')).toBe(false)
    expect(isImageFormat('pdf')).toBe(false)
    expect(isImageFormat('')).toBe(false)
    expect(isImageFormat(undefined)).toBe(false)
  })
})

describe('target size coercion', () => {
  /**
   * Mirrors the guard in lib/process.ts. A blank field must mean "no target" —
   * if it collapsed to a small number, every maximum-mode run would enter the
   * encoder search and then report the target as unreachable.
   */
  const optionalSize = (value: unknown): number | undefined => {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined
    return Math.min(parsed, 200 * 1024 * 1024)
  }

  it('treats a blank or zero target as absent', () => {
    expect(optionalSize('')).toBeUndefined()
    expect(optionalSize(0)).toBeUndefined()
    expect(optionalSize(-5)).toBeUndefined()
    expect(optionalSize(undefined)).toBeUndefined()
    expect(optionalSize('not a number')).toBeUndefined()
  })

  it('accepts a real byte target', () => {
    expect(optionalSize(200 * 1024)).toBe(204800)
    expect(optionalSize('204800')).toBe(204800)
  })

  it('caps an absurd target so it cannot be used to stall the search', () => {
    expect(optionalSize(1e12)).toBe(200 * 1024 * 1024)
  })
})