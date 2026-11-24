'use client'

import { useEffect, useId, useState } from 'react'
import { createCancelSignal } from '@/lib/types'
import type { ImageSourceProbe } from '@/lib/engines/image'

interface OutputFormatPickerProps {
  file: File
  /** Stable list lets transparency be checked across the entire batch. */
  files?: File[]
  value: string
  onChange: (value: string) => void
  onCheckingChange?: (checking: boolean) => void
  onProbesChange?: (probes: ImageSourceProbe[]) => void
}
export default function OutputFormatPicker({
  file,
  files,
  value,
  onChange,
  onCheckingChange,
  onProbesChange,
}: OutputFormatPickerProps) {
  const id = useId()
  const [available, setAvailable] = useState<string[]>([])
  const [checking, setChecking] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => { onCheckingChange?.(checking) }, [checking, onCheckingChange])

  useEffect(() => {
    let current = true
    const signal = createCancelSignal()
    setChecking(true)
    void (async () => {
      try {
        const { availableOutputFormats } = await import('@/lib/engines/image')
        let formats = ['jpeg', 'png', 'webp']
        const probes: ImageSourceProbe[] = []
        for (const input of files?.length ? files : [file]) {
          if (signal.cancelled) return
          const allowed = await availableOutputFormats(input, signal, probe => probes.push(probe))
          formats = formats.filter(format => allowed.includes(format as 'jpeg' | 'png' | 'webp'))
          // Keep scanning once per source so geometry is available for every selection.
        }
        if (current) { setAvailable(formats); onProbesChange?.(probes) }
      } catch {
        if (current) setAvailable(['png', 'webp'])
      } finally {
        if (current) setChecking(false)
      }
    })()
    return () => { current = false; signal.cancel('selection changed') }
  }, [file, files, onProbesChange])

  useEffect(() => {
    if (!checking && value && !available.includes(value)) {
      setMessage('JPG was cleared because a selected image has transparency or its opacity could not be safely verified. Original formats are kept; choose WEBP to preserve transparency.')
      onChange('')
    }
  }, [available, checking, value, onChange])

  return (
    <div className="settingField outputFormatField">
      <label htmlFor={id}>Save as</label>
      <select
        id={id}
        value={value}
        disabled={checking}
        aria-describedby={`${id}-hint`}
        onChange={(event) => { setMessage(''); onChange(event.target.value) }}
      >
        <option value="">Keep each original format</option>
        {available.includes('jpeg') && <option value="jpeg">JPG</option>}
        {available.includes('png') && <option value="png">PNG</option>}
        {available.includes('webp') && <option value="webp">WEBP</option>}
      </select>
      <p className="settingHelp" id={`${id}-hint`}>
        {checking ? 'Checking transparency…' : value ? `Convert selected images to ${value === 'jpeg' ? 'JPG' : value.toUpperCase()}. Conversion can increase file size.` : 'Keep the source format. Transparency is protected.'}
      </p>
      {message && <p className="formatNotice" role="status">{message}</p>}
    </div>
  )
}
