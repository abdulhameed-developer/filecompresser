'use client'

import { getTool } from '@/lib/tools'
import ToolWorkspace from './ToolWorkspace'

/** Homepage compress panel — smart multi-format compressor */
export default function HomeCompress() {
  const tool = getTool('compress')!
  return (
    <section id="compress" aria-labelledby="compress-heading">
      <ToolWorkspace
        tool={tool}
        formatsLabel="JPG · PNG · WEBP · GIF · PDF · MP4 · MOV · MP3 · WAV · ZIP"
      />
    </section>
  )
}
