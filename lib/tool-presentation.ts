import type { ToolDefinition } from './types'
import type { IconName } from '@/components/Icon'
export const TOOL_SUMMARIES: Record<string, string> = {
  compress: 'One queue for supported file types.', 'image-compressor': 'JPG, PNG and WebP in one place.',
  'jpg-compressor': 'Smaller photographic JPG files.', 'jpeg-compressor': 'Quality controls for JPEG photos.',
  'png-compressor': 'Re-encode transparent PNG artwork.', 'webp-compressor': 'Optimize images for the web.',
  'gif-compressor': 'Reduce animated GIF palettes.', 'video-compressor': 'MP4 and MOV to H.264 MP4.', 'webm-to-mp4': 'Convert WebM video to compatible MP4.',
  'mp3-compressor': 'Choose a lower MP3 bitrate.', 'wav-compressor': 'Turn WAV recordings into MP3.',
  'pdf-compressor': 'Rewrite structure and metadata.', 'zip-compressor': 'Bundle files into a single ZIP.',
  'archive-compressor': 'Open ZIPs and save their contents.',
}
export function toolIcon(tool: ToolDefinition): IconName {
  if (tool.slug === 'compress') return 'file'
  if (tool.category === 'image') return 'image'
  if (['video', 'audio', 'gif'].includes(tool.category)) return 'media'
  return tool.category === 'archive' ? 'archive' : 'file'
}
