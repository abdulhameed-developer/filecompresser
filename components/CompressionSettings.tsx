'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { CompressionLevel, SettingValue, ToolDefinition } from '@/lib/types'
import { MAX_IMAGE_TARGET_BYTES, parseTargetKilobytes, targetKilobytesDisplay } from '@/lib/image-settings'


interface CompressionSettingsProps {
  targetAllowed?: boolean
  imageSettings?: boolean
  imageFormat?: string
  hasPng?: boolean
  hasLossy?: boolean
  tool: ToolDefinition
  level: CompressionLevel
  onLevel: (level: CompressionLevel) => void
  settings: Record<string, SettingValue>
  onSetting: (id: string, value: SettingValue) => void
}

const NO_LEVEL_ENGINES = new Set(['zip-extract', 'zip-create', 'pdf-compress', 'webm-to-mp4'])
const IMAGE_MODES = [
  { value: 'balanced', label: 'Balanced', description: 'A balance of file size and detail.' },
  { value: 'high-quality', label: 'High quality', description: 'More detail, usually a larger file.' },
  { value: 'maximum', label: 'Maximum', description: 'Smaller files with a stronger quality trade-off.' },
  { value: 'target', label: 'Target size', description: 'Prioritize your byte limit, with lower quality when needed.' },
] as const
const PNG_MODES = [
  { value: 'smart', label: 'Smart', description: 'May reduce colors. Keeps a lossless result when color changes are too large.' },
  { value: 'lossless', label: 'Lossless', description: 'Preserve every image pixel and transparency value.' },
  { value: 'maximum', label: 'Maximum', description: 'Try smaller color palettes. Color changes may be visible.' },
  { value: 'target', label: 'Target size', description: 'Prioritize your byte limit. Strong color reduction may change appearance visibly.' },
] as const
const TARGET_PRESETS = [20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000]

export default function CompressionSettings({ tool, level, onLevel, settings, onSetting, targetAllowed = true, imageSettings = tool.engine === 'image-compress', imageFormat, hasPng = imageFormat === 'png', hasLossy = imageFormat !== 'png' }: CompressionSettingsProps) {
  const prefix = useId()
  const mode = String(settings.imageMode || 'balanced')
  const pngMode = String(settings.pngMode || (mode === 'target' || mode === 'maximum' ? mode : 'lossless'))
  const quality = typeof settings.quality === 'number' ? Math.round(settings.quality * 100) : mode === 'high-quality' ? 93 : mode === 'maximum' ? 60 : 82
  const presetQuality = mode === 'high-quality' ? 93 : mode === 'maximum' ? 60 : 82
  const customQuality = mode !== 'target' && typeof settings.quality === 'number' && quality !== presetQuality
  const targeting = (hasLossy && mode === 'target') || (hasPng && pngMode === 'target')

  return <div className={`settings${imageSettings ? ' imageSettings' : ''}`}>
    {imageSettings ? <>
      {hasLossy && <fieldset className="settingBlock imageModeBlock">
        <legend>{hasPng ? 'JPG / WEBP mode' : 'Compression mode'}{customQuality && <span className="customQualityLabel">Custom quality</span>}</legend>
        <div className="imageModeGrid" role="group" aria-label="Image compression mode">
          {IMAGE_MODES.map(option => <button key={option.value} type="button" className={`imageModeOption${mode === option.value && !customQuality ? ' active' : ''}`} aria-pressed={mode === option.value && !customQuality} disabled={option.value === 'target' && !targetAllowed} onClick={() => { onSetting('imageMode', option.value); onSetting('quality', '') }}><span>{option.label}</span></button>)}
        </div>
        <p className="settingHelp modeDescription">{customQuality ? 'Using your quality setting. Choose a mode to restore its preset.' : IMAGE_MODES.find(option => option.value === mode)?.description}</p>
      </fieldset>}
      {hasPng && <fieldset className="settingBlock imageModeBlock pngModeBlock">
        <legend>PNG mode</legend>
        <div className="imageModeGrid" role="group" aria-label="PNG compression mode">
          {PNG_MODES.map(option => <button key={option.value} type="button" className={`imageModeOption${pngMode === option.value ? ' active' : ''}`} aria-pressed={pngMode === option.value} disabled={option.value === 'target' && !targetAllowed} onClick={() => onSetting('pngMode', option.value)}><span>{option.label}</span></button>)}
        </div>
        <p className="settingHelp modeDescription">{PNG_MODES.find(option => option.value === pngMode)?.description} Transparency is preserved.</p>
      </fieldset>}

      {targeting && <TargetSizeField prefix={prefix} value={settings.targetSize} enabled={targetAllowed} pngOnly={!hasLossy} onChange={next => onSetting('targetSize', next)} />}

      {hasLossy && mode !== 'target' && <div className="settingField qualityControl">
        <label htmlFor={`${prefix}-quality`}>Quality <output htmlFor={`${prefix}-quality`}>{quality}%</output></label>
        <input id={`${prefix}-quality`} type="range" min={10} max={100} step={1} value={quality} onChange={event => onSetting('quality', Number(event.target.value) / 100)} aria-describedby={`${prefix}-quality-hint`} />
        <p className="settingHelp" id={`${prefix}-quality-hint`}>Higher keeps more detail, usually in a larger file. Encoder setting, not a measured quality score.</p>
      </div>}
    </> : tool.engine !== 'image-compress' && !NO_LEVEL_ENGINES.has(tool.engine) && tool.category !== 'audio' && <fieldset className="settingBlock">
      <legend>Compression level</legend>
      <div className="pills" role="group" aria-label="Compression level">{(['recommended', 'maximum'] as const).map(value => <button key={value} type="button" className={level === value ? 'active' : ''} aria-pressed={level === value} onClick={() => onLevel(value)}>{value === 'recommended' ? 'Recommended' : 'Maximum'}</button>)}</div>
    </fieldset>}

    {(tool.settings ?? []).map(setting => {
      const id = `${prefix}-${setting.id}`
      const value = settings[setting.id] ?? setting.defaultValue
      return <div className="settingField" key={setting.id}>
        {setting.type === 'number' ? <NumberField id={id} label={setting.label} suffix={setting.suffix} placeholder={setting.placeholder} min={setting.min} max={setting.max} value={value} onChange={next => onSetting(setting.id, next)} /> : <>
          <label htmlFor={id}>{setting.label}</label>
          {setting.type === 'select' ? <select id={id} value={String(value)} onChange={event => onSetting(setting.id, event.target.value)}>{(setting.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <div className="rangeField"><input id={id} type="range" min={setting.min} max={setting.max} step={setting.step} value={Number(value)} onChange={event => onSetting(setting.id, Number(event.target.value))} /><output htmlFor={id} className="rangeValue">{String(value)}</output></div>}
        </>}
        {setting.help && <p className="settingHelp">{setting.help}</p>}
      </div>
    })}
  </div>
}

function TargetSizeField({ prefix, value, enabled, pngOnly, onChange }: { prefix: string; value: SettingValue | undefined; enabled: boolean; pngOnly: boolean; onChange: (value: SettingValue) => void }) {
  const bytes = typeof value === 'number' && Number.isFinite(value) ? value : 0
  // Keep the editing buffer separate from canonical bytes. Replacing50.0
  // with50 on each key press would move the caret and turn50.05 into505.
  const [raw, setRaw] = useState(() => targetKilobytesDisplay(value))
  const lastOwnValue = useRef(value)
  useEffect(() => {
    if (!Object.is(value, lastOwnValue.current)) setRaw(targetKilobytesDisplay(value))
    lastOwnValue.current = value
  }, [value])
  const change = (next: SettingValue, draft = targetKilobytesDisplay(next)) => {
    lastOwnValue.current = next
    setRaw(draft)
    onChange(next)
  }
  const invalid = value !== undefined && value !== '' && (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_IMAGE_TARGET_BYTES)
  return <fieldset className="targetSizeBlock" disabled={!enabled}>
    <legend>Maximum output size</legend>
    <div className="targetPresets" role="group" aria-label="Target size presets">{TARGET_PRESETS.map(preset => <button key={preset} type="button" aria-pressed={bytes === preset} className={bytes === preset ? 'active' : ''} onClick={() => change(preset)}>{preset === 1_000_000 ? '1 MB' : `${preset / 1000} KB`}</button>)}</div>
    <div className="targetCustomRow"><div className="settingField"><label htmlFor={`${prefix}-target`}>Custom maximum (KB)</label><div className={`numberField${invalid ? ' invalid' : ''}`}><input id={`${prefix}-target`} type="number" inputMode="decimal" min={0.001} max={MAX_IMAGE_TARGET_BYTES / 1000} step={0.001} value={raw} placeholder="e.g. 50" aria-invalid={invalid || undefined} aria-describedby={`${prefix}-target-status ${prefix}-target-hint`} onChange={event => change(parseTargetKilobytes(event.target.value), event.target.value)} /><span className="numberSuffix" aria-hidden="true">KB</span></div></div><p className={`exactTarget${invalid ? ' invalid' : ''}`} id={`${prefix}-target-status`} aria-live="polite">{invalid ? 'Use 0.001 KB steps (whole bytes), up to 200,000 KB.' : bytes > 0 ? <><strong>{bytes.toLocaleString('en-US')} bytes</strong> maximum</> : 'Choose a preset or enter a maximum.'}</p></div>
    <p className="settingHelp" id={`${prefix}-target-hint`}>1 KB = 1,000 bytes. Custom values must equal whole bytes. {pngOnly ? 'PNG may reduce colors to fit.' : 'JPG / WEBP adjust quality; PNG may reduce colors.'} Only files within the exact byte limit become results. If no tested setting fits, an error explains the limit; your original stays unchanged.</p>
    {!enabled && <p className="targetWarning" role="status">Target size is unavailable for this selection.</p>}
  </fieldset>
}

function NumberField({ id, label, suffix, placeholder, min, max, value, onChange }: { id: string; label: string; suffix?: string; placeholder?: string; min?: number; max?: number; value: SettingValue; onChange: (value: SettingValue) => void }) {
  return <div className="settingField"><label htmlFor={id}>{label}</label><div className="numberField"><input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} value={String(value ?? '')} placeholder={placeholder} onChange={event => onChange(event.target.value === '' ? '' : Number(event.target.value))} />{suffix && <span className="numberSuffix" aria-hidden="true">{suffix}</span>}</div></div>
}
