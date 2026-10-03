'use client'

import { useEffect, useState } from 'react'
import type { ImageFormat } from '@/lib/engines/image'
import {
  availableOutputFormats,
  defaultOutputFormatFor,
  IMAGE_OUTPUT_FORMATS,
} from '@/lib/engines/image'

interface OutputFormatPickerProps {
  file: File
  /** The parent's current value; `''` means "not chosen yet". */
  value: string
  onChange: (value: string) => void
}

/**
 * "Download as" picker for the compression tools.
 *
 * The default is the format the user actually uploaded, which is what they
 * almost always want — so the common case needs no interaction at all. The
 * options are the formats this browser can genuinely encode, computed from the
 * real image rather than assumed: JPEG is withheld when the source has
 * transparency, because encoding it would produce black backgrounds.
 */
export default function OutputFormatPicker({ file, value, onChange }: OutputFormatPickerProps) {
  const [options, setOptions] = useState<ImageFormat[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    setReady(false)

    void availableOutputFormats(file).then((formats) => {
      if (!active) return
      setOptions(formats)
      setReady(true)

      // Adopt the uploaded format as the default, unless the user has already
      // chosen something that is still valid.
      const preferred = defaultOutputFormatFor(file.name)
      const next = formats.includes(preferred) ? preferred : (formats[0] ?? preferred)

      // Keep a choice the user already made, if it is still offered.
      onChange(currentValueIsValid(value, formats) && value ? value : next)
    })

    return () => {
      active = false
    }
    // `value` is intentionally excluded: re-running on every keystroke would
    // fight the user's selection. The parent owns the value thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  if (!ready || options.length === 0) return null

  return (
    <div className="settingField outputFormatField">
      <label htmlFor="outputFormat">Download as</label>
      <select
        id="outputFormat"
        value={value || options[0]}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((format) => (
          <option key={format} value={format}>
            {IMAGE_OUTPUT_FORMATS[format].label}
          </option>
        ))}
      </select>
      <p className="settingHelp">
        Defaults to {IMAGE_OUTPUT_FORMATS[defaultOutputFormatFor(file.name)].label}, the format
        you uploaded. Choosing another format really converts the image.
      </p>
    </div>
  )
}

function currentValueIsValid(value: string, options: ImageFormat[]): boolean {
  return Boolean(value) && options.includes(value as ImageFormat)
}