import { describe, expect, it } from 'vitest'
import { getTool } from '../lib/tools'
import type { QueueItem, SettingValue } from '../lib/types'
import { normalizedWorkflowOptions, scopeWorkflowOptions, workflowConfig, workflowDefaults } from '../lib/workflow-config'

const tool = getTool('jpg-compressor')!
const source = { inputFormat: 'jpeg' }
function config(settings: Record<string, SettingValue>) {
  return workflowConfig(tool, source, 'recommended', settings, { level: 'recommended', ...settings })
}

describe('effective workflow configuration', () => {
  it('normalizes default quality and same-format output', () => {
    expect(config({ imageMode: 'balanced' }).fingerprint).toBe(config({
      imageMode: 'balanced', quality: 0.82, outputFormat: 'jpeg', targetSize: 50000,
      pngMode: 'target',
    }).fingerprint)
  })

  it('distinguishes active changes and canonicalizes equivalent numeric form inputs', () => {
    const original = config({ imageMode: 'target', targetSize: 50000 })
    const numeric = config({ imageMode: 'target', targetSize: '50000' })
    expect(original.fingerprint).toBe(numeric.fingerprint)
    expect(original.fingerprint).not.toBe(config({ imageMode: 'target', targetSize: 40000 }).fingerprint)
  })

  it('treats independent PNG and JPEG/WebP modes as active only for their actual output', () => {
    expect(normalizedWorkflowOptions('image-compress', 'png', { imageMode: 'target', targetSize: 50000, quality: 0.1, pngMode: 'lossless' }))
      .toEqual({ pngMode: 'lossless' })
    expect(normalizedWorkflowOptions('image-compress', 'png', { imageMode: 'balanced', pngMode: 'target', targetSize: 50000 }))
      .toEqual({ pngMode: 'target', targetSize: 50000 })
    expect(normalizedWorkflowOptions('image-compress', 'png', { imageMode: 'maximum', pngMode: 'target', outputFormat: 'webp', targetSize: 50000 }))
      .toEqual({ imageMode: 'maximum', quality: 0.6, outputFormat: 'webp' })
  })

  it('ignores controls that cannot alter the selected engine', () => {
    expect(normalizedWorkflowOptions('pdf-compress', 'pdf', { imageMode: 'target', targetSize: 50000, level: 'maximum' })).toEqual({})
    expect(normalizedWorkflowOptions('zip-create', undefined, { imageMode: 'maximum', quality: 0.6 })).toEqual({})
    expect(normalizedWorkflowOptions('audio-compress', 'mp3', { level: 'maximum', bitrate: '192k' })).toEqual({ bitrate: '192k' })
    expect(normalizedWorkflowOptions('audio-compress', 'mp3', { level: 'recommended', bitrate: '192k' })).toEqual({ bitrate: '192k' })
    expect(normalizedWorkflowOptions('video-compress', 'mp4', { level: 'maximum', resolution: '720' })).toEqual({ level: 'maximum', resolution: '720' })
  })

  it('freezes a copied snapshot while retaining the raw values needed to restore controls', () => {
    const raw = { imageMode: 'maximum', targetSize: '' }
    const snapshot = config(raw)
    raw.imageMode = 'target'
    expect(snapshot.settings.imageMode).toBe('maximum')
    expect(snapshot.settings.targetSize).toBe('')
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.settings)).toBe(true)
    expect(Object.isFrozen(snapshot.options)).toBe(true)
  })

  it('starts with balanced photos and lossless PNG, including hidden mixed-file settings', () => {
    expect(workflowDefaults(tool)).toMatchObject({ imageMode: 'balanced', pngMode: 'lossless' })
    const mixed = [{ inputFormat: 'png' }, { inputFormat: 'pdf' }] as QueueItem[]
    expect(scopeWorkflowOptions(getTool('compress')!, mixed, 'maximum', {
      imageMode: 'target', pngMode: 'target', targetSize: 50000, quality: 0.4,
    })).toEqual({ level: 'recommended', imageMode: 'balanced', pngMode: 'lossless' })
  })

  it('does not silently quantize PNG in a mixed batch or inherit a hidden conversion', () => {
    const mixed = [{ inputFormat: 'png' }, { inputFormat: 'pdf' }] as QueueItem[]
    const options = scopeWorkflowOptions(getTool('compress')!, mixed, 'maximum', {
      imageMode: 'maximum', pngMode: 'maximum', outputFormat: 'webp', quality: 0.1,
    })
    expect(normalizedWorkflowOptions('image-compress', 'png', options)).toEqual({ pngMode: 'lossless' })
    expect(normalizedWorkflowOptions('image-compress', 'jpeg', options)).toEqual({ imageMode: 'balanced', quality: 0.82 })
  })
})
