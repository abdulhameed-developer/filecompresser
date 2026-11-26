'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type UIEvent } from 'react'
import Image from 'next/image'
import Icon from './Icon'
import { formatBytes } from '@/lib/format'
import { lockDialogScroll } from '@/lib/dialog-scroll'

interface ImageComparisonProps {
  original: File
  output: Blob
  outputName: string
  resultLabel?: string
  inputWidth: number
  inputHeight: number
  outputWidth: number
  outputHeight: number
  onClose: () => void
}

/** Local object URLs live only while this comparison is open. */
export default function ImageComparison({ original, output, outputName, resultLabel = 'Result', inputWidth, inputHeight, outputWidth, outputHeight, onClose }: ImageComparisonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const originalPane = useRef<HTMLDivElement>(null)
  const outputPane = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const zoomId = useId()
  const [urls, setUrls] = useState<{ original: string; output: string } | null>(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState('fit')
  const [fitScale, setFitScale] = useState(1)
  const width = Math.max(inputWidth, outputWidth)
  const height = Math.max(inputHeight, outputHeight)
  const scale = zoom === 'fit' ? fitScale : Number(zoom)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const unlockScroll = lockDialogScroll()
    const dialog = dialogRef.current
    let originalUrl: string | undefined
    let outputUrl: string | undefined
    try {
      originalUrl = URL.createObjectURL(original)
      outputUrl = URL.createObjectURL(output)
      setUrls({ original: originalUrl, output: outputUrl })
      if (dialog && !dialog.open) dialog.showModal()
    } catch {
      setError('This browser could not open the image comparison. You can still download both files and inspect them locally.')
      if (dialog && !dialog.open) dialog.setAttribute('open', '')
    }
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl)
      if (outputUrl) URL.revokeObjectURL(outputUrl)
      if (dialog?.open && typeof dialog.close === 'function') dialog.close()
      previousFocus?.focus({ preventScroll: true })
      unlockScroll()
    }
  }, [original, output])

  useEffect(() => {
    const pane = originalPane.current
    if (!pane) return
    const fit = () => setFitScale(Math.min(1, Math.max(0.01, (pane.clientWidth - 32) / width), Math.max(0.01, (pane.clientHeight - 32) / height)))
    fit()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit)
      return () => window.removeEventListener('resize', fit)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [width, height, urls])

  const synchronize = (event: UIEvent<HTMLDivElement>, other: HTMLDivElement | null) => {
    if (!other) return
    const source = event.currentTarget
    if (Math.abs(other.scrollTop - source.scrollTop) > 1) other.scrollTop = source.scrollTop
    if (Math.abs(other.scrollLeft - source.scrollLeft) > 1) other.scrollLeft = source.scrollLeft
  }

  const containKeyboardFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const dialog = event.currentTarget
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),[tabindex="0"]')]
      .filter(control => control.getClientRects().length > 0)
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first || !last) return
    const focused = dialog.ownerDocument.activeElement
    if (event.shiftKey && (focused === first || focused === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (focused === last || focused === dialog)) {
      event.preventDefault()
      first.focus()
    }
  }

  return <dialog className="imageComparison" ref={dialogRef} aria-labelledby={titleId} onKeyDown={containKeyboardFocus} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="comparisonShell">
      <header className="comparisonHeader"><div><span className="comparisonEyebrow">BEFORE & AFTER</span><h2 id={titleId}>Inspect the actual image</h2><p>Both images use the same scale. Zoom in to check text, edges and fine detail.</p></div><button type="button" className="iconBtn" aria-label="Close image comparison" onClick={onClose}><Icon name="close" /></button></header>
      <div className="comparisonToolbar"><label htmlFor={zoomId}>View at</label><select id={zoomId} value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Fit both images</option><option value="1">100% · actual pixels</option><option value="2">200%</option><option value="4">400%</option></select><span>Pan either image to move both views.</span></div>
      {error ? <p className="fileError" role="alert">{error}</p> : <div className="comparisonColumns">
        <section aria-label="Original image"><div className="comparisonFacts"><div><strong>Original</strong><small title={original.name}>{original.name}</small></div><p>{inputWidth.toLocaleString('en-US')} × {inputHeight.toLocaleString('en-US')} px<span>{formatBytes(original.size)} · {original.size.toLocaleString('en-US')} bytes</span></p></div><div className="comparisonPane" ref={originalPane} role="region" tabIndex={0} aria-label="Original image preview. Scroll to inspect." onScroll={event => synchronize(event, outputPane.current)}><div className="comparisonCanvas" style={{ width: width * scale, height: height * scale }}>{urls && <Image unoptimized src={urls.original} alt={`Original: ${original.name}`} width={inputWidth} height={inputHeight} style={{ width: inputWidth * scale, height: inputHeight * scale }} draggable={false} />}</div></div></section>
        <section aria-label={`${resultLabel} image`}><div className="comparisonFacts"><div><strong>{resultLabel}</strong><small title={outputName}>{outputName}</small></div><p>{outputWidth.toLocaleString('en-US')} × {outputHeight.toLocaleString('en-US')} px<span>{formatBytes(output.size)} · {output.size.toLocaleString('en-US')} bytes</span></p></div><div className="comparisonPane" ref={outputPane} role="region" tabIndex={0} aria-label={`${resultLabel} image preview. Scroll to inspect.`} onScroll={event => synchronize(event, originalPane.current)}><div className="comparisonCanvas" style={{ width: width * scale, height: height * scale }}>{urls && <Image unoptimized src={urls.output} alt={`${resultLabel}: ${outputName}`} width={outputWidth} height={outputHeight} style={{ width: outputWidth * scale, height: outputHeight * scale }} draggable={false} />}</div></div></section>
      </div>}
      <footer className="comparisonFooter"><p>Checkerboard areas show transparency. A smaller file can still contain visible quality changes.</p><button className="downloadBtn secondary" type="button" onClick={onClose}>Back to results</button></footer>
    </div>
  </dialog>
}
