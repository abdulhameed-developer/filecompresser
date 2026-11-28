import { describe, it, expect } from 'vitest'
import { parseImageTargetBytes, parseTargetKilobytes, targetKilobytesDisplay } from '@/lib/image-settings'
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
  const optionalSize = parseImageTargetBytes

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

  it('rejects an absurd or fractional target instead of silently changing its byte limit', () => {
    expect(optionalSize(1e12)).toBeUndefined()
    expect(optionalSize(3.9)).toBeUndefined()
    expect(optionalSize(200_000_000)).toBe(200_000_000)
    expect(optionalSize(200_000_001)).toBeUndefined()
  })
})

describe('exact decimal KB settings', () => {
  it.each([['0.029', 29], ['.029', 29], ['2.9e-2', 29], ['1e-3', 1], ['100.000', 100000], ['200000', 200000000]])('parses %sKB into exactly%iwhole bytes', (input, expected) => {
    expect(parseTargetKilobytes(input)).toBe(expected)
    expect(parseImageTargetBytes(parseTargetKilobytes(input))).toBe(expected)
  })
  it.each(['100.0005', '0.0299', '1.00000000000000001', '200000.001', '-1', '1e99999', 'not-a-number', '0'])('keeps invalid %sKB visible and rejects it as a byte limit', input => {
    const value = parseTargetKilobytes(input)
    expect(value).toBe(`${input} KB`)
    expect(targetKilobytesDisplay(value)).toBe(input)
    expect(parseImageTargetBytes(value)).toBeUndefined()
  })
  it('preserves a cleared target as an empty draft', () => {
    expect(parseTargetKilobytes('')).toBe('')
    expect(targetKilobytesDisplay('')).toBe('')
  })
})
