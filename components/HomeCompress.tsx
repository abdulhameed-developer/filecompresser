import { getTool } from '@/lib/tools'
import { workspaceTool } from '@/lib/workspace-tool'
import ToolWorkspace from './ToolWorkspace'

/** Homepage compress panel — smart multi-format compressor */
export default function HomeCompress() {
  const tool = getTool('compress')!
  return (
    <section id="compress" aria-label="Compress any supported file">
      <ToolWorkspace
        tool={workspaceTool(tool)}
        formatsLabel="JPG · PNG · WEBP · GIF · PDF · MP4 · MOV · MP3 · WAV · ZIP"
      />
    </section>
  )
}
