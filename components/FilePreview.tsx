'use client'

import { useEffect, useState } from 'react'
import Icon from './Icon'
import type { QueueItem } from '@/lib/types'
import { inspectImageHeader } from '@/workers/image-metadata.mjs'

// Decode one visible thumbnail at a time. Never create full-size preview URLs
// for an entire batch; original uploads and processing artifacts stay untouched.
let pendingThumbnail: Promise<void> = Promise.resolve()

export default function FilePreview({ item, dimensions }: { item: QueueItem; dimensions?: { width: number; height: number } }) {
  const [preview, setPreview] = useState<{ file: File; url: string }>()
  const width = dimensions?.width
  const height = dimensions?.height
  useEffect(() => {
    if (!['jpeg', 'png', 'webp'].includes(item.inputFormat ?? '') || item.file.size > 50 * 1024 * 1024 || typeof createImageBitmap !== 'function') return
    let disposed = false
    let url: string | undefined
    const file = item.file
    const render = async () => {
      if (disposed) return
      let bitmap: ImageBitmap | undefined
      try {
        const geometry = width && height ? { width, height } : await inspectImageHeader(file, () => disposed)
        if (disposed || geometry.width * geometry.height > 32_000_000) return
        const scale = Math.min(192 / geometry.width, 120 / geometry.height, 1)
        bitmap = await createImageBitmap(file, { resizeWidth: Math.max(1, Math.round(geometry.width * scale)), resizeHeight: Math.max(1, Math.round(geometry.height * scale)), resizeQuality: 'low', imageOrientation: 'from-image' })
        if (disposed) return
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (!context) return
        context.drawImage(bitmap, 0, 0)
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
        canvas.width = canvas.height = 0
        if (disposed || !blob) return
        url = URL.createObjectURL(blob)
        setPreview({ file, url })
      } catch { /* A preview is optional; validation and processing own errors. */ }
      finally { bitmap?.close() }
    }
    pendingThumbnail = pendingThumbnail.then(render, render)
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [item.file, item.inputFormat, width, height])
  const format = item.inputFormat === 'jpeg' ? 'JPG' : item.inputFormat?.toUpperCase() || 'FILE'
  const icon = ['mp3', 'wav', 'mp4', 'mov', 'webm', 'm4a', 'flac', 'ogg', 'gif'].includes(item.inputFormat ?? '') ? 'media' : item.inputFormat === 'zip' ? 'archive' : 'file'
  return <div className={`filePreview${preview?.file === item.file ? ' hasPreview' : ''}`} aria-hidden="true">
    {/* This small local bitmap is decorative. The adjacent filename labels the card. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {preview?.file === item.file ? <img src={preview.url} alt="" width="192" height="120" /> : <Icon name={icon} />}
    <span>{format}</span>
  </div>
}
