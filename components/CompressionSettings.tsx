'use client'

import { useId } from 'react'
import type { CompressionLevel, SettingValue, ToolDefinition } from '@/lib/types'

interface CompressionSettingsProps {
  tool: ToolDefinition
  level: CompressionLevel
  onLevel: (level: CompressionLevel) => void
  settings: Record<string, SettingValue>
  onSetting: (id: string, value: SettingValue) => void
}

/** Engines where "compression level" has no meaningful meaning. */
const NO_LEVEL_ENGINES = new Set([
  'zip-extract',
  'zip-create',
  // PDF optimization is a fixed pipeline, not a quality/size tradeoff, so
  // offering a "Maximum" that does nothing different would be a fake control.
  'pdf-compress',
])

/**
 * Engines that can genuinely hit a user-specified target size.
 *
 * A target is only offered where we control a lossy quality dial and the result
 * is still a real encoding. PNG is excluded because it is lossless: its size is
 * driven by dimensions, not by a quality parameter, so "compress to 200 KB"
 * could only be satisfied by degrading the image without telling you.
 */
const TARGET_SIZE_ENGINES = new Set(['image-compress'])

const LEVEL_LABELS: Record<string, string> = {
  recommended: 'Recommended',
  maximum: 'Maximum',
}

const LEVEL_HELP: Record<CompressionLevel, string> = {
  recommended: 'Balanced quality and file size. Best for normal use.',
  maximum:
    'Smallest possible file. Visible quality loss, and images are capped at 1920px. You can set an exact target size below.',
}

const KB = 1024

export default function CompressionSettings({
  tool,
  level,
  onLevel,
  settings,
  onSetting,
}: CompressionSettingsProps) {
  const showLevel = !NO_LEVEL_ENGINES.has(tool.engine)
  const showLevelControl = showLevel

  // The target-size field belongs to Maximum mode only: in Recommended mode the
  // preset is already chosen, and a second conflicting dial would be confusing.
  const showTargetSize = TARGET_SIZE_ENGINES.has(tool.engine) && level === 'maximum'

  return (
    <div className="settings">
      {showLevelControl && (
        <fieldset className="settingBlock">
          <legend>{tool.slug === 'wav-compressor' ? 'Encoding quality' : 'Compression level'}</legend>
          <div className="pills" role="group" aria-label="Compression level">
            {(['recommended', 'maximum'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={level === value ? 'active' : ''}
                aria-pressed={level === value}
                onClick={() => onLevel(value)}
              >
                {LEVEL_LABELS[value]}
              </button>
            ))}
          </div>
          <p className="settingHelp">{LEVEL_HELP[level]}</p>
        </fieldset>
      )}

      {(tool.settings ?? []).map((setting) => {
        const id = `setting-${tool.slug}-${setting.id}`
        const value = settings[setting.id] ?? setting.defaultValue

        return (
          <div className="settingField" key={setting.id}>
            <label htmlFor={id}>{setting.label}</label>

            {setting.type === 'select' ? (
              <select
                id={id}
                value={String(value)}
                onChange={(event) => onSetting(setting.id, event.target.value)}
              >
                {(setting.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : setting.type === 'number' ? (
              <NumberField
                id={id}
                suffix={setting.suffix}
                placeholder={setting.placeholder}
                min={setting.min}
                max={setting.max}
                value={value}
                onChange={(next) => onSetting(setting.id, next)}
              />
            ) : (
              <div className="rangeField">
                <input
                  id={id}
                  type="range"
                  min={setting.min}
                  max={setting.max}
                  step={setting.step}
                  value={Number(value)}
                  onChange={(event) => onSetting(setting.id, Number(event.target.value))}
                />
                <output htmlFor={id} className="rangeValue">
                  {formatRangeValue(setting.id, Number(value), setting)}
                </output>
              </div>
            )}

            {setting.help && <p className="settingHelp">{setting.help}</p>}
          </div>
        )
      })}

      {showTargetSize && (
        <TargetSizeField
          toolSlug={tool.slug}
          value={settings.targetSize}
          onChange={(next) => onSetting('targetSize', next)}
        />
      )}
    </div>
  )
}

/**
 * "Compress to exactly N KB".
 *
 * The field is deliberately optional: left blank, Maximum mode uses its own
 * preset. Entering a size runs a real encoder search for a quality that fits.
 */
function TargetSizeField({
  toolSlug,
  value,
  onChange,
}: {
  toolSlug: string
  value: SettingValue | undefined
  onChange: (value: SettingValue) => void
}) {
  const id = `setting-${toolSlug}-targetSize`
  const hintId = useId()
  const raw = value === undefined || value === '' ? '' : String(value)

  return (
    <div className="settingField targetSizeField">
      <label htmlFor={id}>Compress to exactly</label>
      <div className="numberField">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={raw}
          placeholder="e.g. 200"
          aria-describedby={hintId}
          // Keep the field as text while empty so the number input does not
          // coerce a blank value into 0, which reads as "target zero bytes".
          onChange={(event) => {
            const next = event.target.value
            if (next === '') {
              onChange('')
              return
            }
            const parsed = Number(next)
            if (!Number.isFinite(parsed) || parsed <= 0) return
            onChange(Math.round(parsed * KB))
          }}
        />
        <span className="numberSuffix" aria-hidden="true">
          KB
        </span>
      </div>
      <p className="settingHelp" id={hintId}>
        Optional. We search for the best quality that fits this exact size. If the image
        cannot get that small without being visibly destroyed, you get the smallest honest
        version and we tell you.
      </p>
    </div>
  )
}

/**
 * A number input with a unit suffix, announced properly to assistive tech.
 *
 * The suffix is `aria-hidden` because the label already says the unit; repeating
 * it in the accessible name makes screen readers announce "KB" twice.
 */
function NumberField({
  id,
  suffix,
  placeholder,
  min,
  max,
  value,
  onChange,
}: {
  id: string
  suffix?: string
  placeholder?: string
  min?: number
  max?: number
  value: SettingValue
  onChange: (value: SettingValue) => void
}) {
  return (
    <div className="numberField">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={String(value ?? '')}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === '' ? '' : Number(next))
        }}
      />
      {suffix && (
        <span className="numberSuffix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </div>
  )
}

function formatRangeValue(id: string, value: number, setting: { max?: number }): string {
  void id
  // Treat the upper bound of 100 sliders as a percentage.
  if (setting.max === 100) return `${value}`
  return `${value}`
}