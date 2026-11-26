import type { ProcessingOptions } from '@/lib/types'

export interface ConfigurationSnapshot {
  engine: string
  options: ProcessingOptions
}

/** Describe the stored request, never infer it from the live draft controls. */
export function configurationLabel(config: ConfigurationSnapshot, sourceFormat?: string): string {
  const options = config.options
  if (config.engine === 'zip-create') return 'ZIP archive'
  if (config.engine === 'zip-extract') return 'Extract ZIP'
  if (config.engine === 'pdf-compress') return 'PDF structural optimization'
  if (config.engine === 'audio-compress' || config.engine === 'wav-to-mp3') return `MP3 bitrate request: ${String(options.bitrate || '192k').replace(/k$/, ' kbps')}`
  if (config.engine === 'gif-compress') return options.level === 'maximum' ? 'Maximum · Up to 64 colors' : 'Recommended · Up to 128 colors'
  if (config.engine === 'video-compress') return `${options.level === 'maximum' ? 'Maximum' : 'Recommended'} · ${options.resolution && options.resolution !== 'original' ? `Max height ${String(options.resolution).replace(/p$/, '')} px` : 'Original dimensions'}`
  if (config.engine === 'webm-to-mp4') return 'MP4 · H.264 video · Original dimensions'

  const mode = String(options.imageMode || 'balanced')
  const format = String(options.outputFormat || sourceFormat || '')
  const modeLabel = ({ balanced: 'Balanced', 'high-quality': 'High quality', maximum: 'Maximum', target: 'Target' } as Record<string, string>)[mode] || mode
  const pngMode = String(options.pngMode || (mode === 'target' || mode === 'maximum' ? mode : 'lossless'))
  const presetQuality = mode === 'high-quality' ? .93 : mode === 'maximum' ? .60 : .82
  const customQuality = mode !== 'target' && typeof options.quality === 'number' && Math.round(options.quality * 100) !== Math.round(presetQuality * 100)
  const parts = [format === 'png' ? `${({ lossless: 'Lossless', smart: 'Smart', maximum: 'Maximum', target: 'Target' } as Record<string, string>)[pngMode] || pngMode} PNG` : customQuality ? 'Custom quality' : modeLabel]
  if ((format === 'png' ? pngMode === 'target' : mode === 'target') && Number(options.targetSize) > 0) parts.push(`${Number(options.targetSize).toLocaleString('en-US')} bytes max`)
  else if (format !== 'png') parts.push(`Quality ${Math.round((typeof options.quality === 'number' ? options.quality : mode === 'high-quality' ? .93 : mode === 'maximum' ? .60 : .82) * 100)}%`)
  if (options.outputFormat) parts.push(`${format === 'jpeg' ? 'JPG' : format.toUpperCase()} output`)
  else parts.push('Original format')
  parts.push('Original dimensions')
  return parts.join(' · ')
}

export default function WorkflowSummary({ config, sourceFormat, label = 'Applied setup' }: { config: ConfigurationSnapshot; sourceFormat?: string; label?: string }) {
  return <p className="workflowConfig"><strong>{label}</strong><span>{configurationLabel(config, sourceFormat)}</span></p>
}
