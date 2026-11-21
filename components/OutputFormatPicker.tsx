'use client'

interface OutputFormatPickerProps {
  file: File
  value: string
  onChange: (value: string) => void
}
export default function OutputFormatPicker({
  value,
  onChange,
}: OutputFormatPickerProps) {
  return (
    <div className="settingField outputFormatField">
      <label htmlFor="outputFormat">Download as</label>
      <select
        id="outputFormat"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Keep each original format</option>
        <option value="jpeg">JPG</option>
        <option value="png">PNG</option>
        <option value="webp">WEBP</option>
      </select>
      <p className="settingHelp">
        Applies to each image. JPG cannot preserve transparency; transparent
        images will need PNG or WEBP. Target sizes apply to JPG and WEBP output.
      </p>
    </div>
  )
}
