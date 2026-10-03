'use client'

import { useCallback, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'

interface FileDropzoneProps {
  accept?: string
  multiple?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  formats?: string
  onFiles: (files: FileList | File[]) => void
}

export default function FileDropzone({
  accept,
  multiple = true,
  disabled,
  label = 'Drag & drop your files here',
  hint = 'or browse files from your device',
  formats,
  onFiles,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  // Counting enter/leave pairs prevents the highlight from flickering when the
  // pointer crosses child elements inside the dropzone.
  const dragDepth = useRef(0)
  const hintId = useId()

  const open = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      open()
    }
  }

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current += 1
    setDrag(true)
  }

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDrag(false)
    }
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    // Required on some browsers, or the drop event never fires.
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDrag(false)
    if (disabled) return
    if (event.dataTransfer.files?.length) onFiles(event.dataTransfer.files)
  }

  return (
    <div
      className={`dropzone${drag ? ' drag' : ''}${disabled ? ' disabled' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      // The accessible name is static: it must not change while the pointer
      // moves over the zone, or a screen reader re-announces the control on
      // every drag event.
      aria-label={disabled ? 'File upload is unavailable while processing' : label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      onClick={open}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="srOnlyInput"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        /*
          Labelled, and kept out of the tab order.

          The visible control is the dropzone div, which carries the accessible
          name and handles keyboard activation. This input is only ever opened
          programmatically by that control, so it must not be a second tab stop
          — but it still needs a name of its own: it stays in the accessibility
          tree (`aria-hidden` would hide it from a screen reader that browses
          form controls, leaving an unnamed control behind).
        */
        tabIndex={-1}
        aria-label={disabled ? 'File upload is unavailable while processing' : label}
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files)
          // Reset so choosing the same file twice still fires a change event.
          event.target.value = ''
        }}
      />
      <div className="uploadIcon" aria-hidden="true">
        ↑
      </div>
      {/* A heading, not a `<p>`: it is the label for the control, and headings
          are what let screen-reader users jump straight to the upload area.
          It is level 2 so it sits directly under the page H1 — the previous H3
          skipped a level and broke the document outline. The visible text
          follows the drag state; the accessible name does not. */}
      <h2 aria-hidden={drag || undefined}>{drag ? 'Drop them here' : label}</h2>
      <p id={hintId}>
        {hint.includes('browse') ? (
          <>
            or <b>browse files</b> from your device
          </>
        ) : (
          hint
        )}
      </p>
      {formats && <div className="formats">{formats}</div>}
    </div>
  )
}