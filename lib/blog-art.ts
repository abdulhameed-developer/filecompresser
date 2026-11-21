import type { FigureId } from './blog'
export const BLOG_ART: Record<FigureId, { alt: string; category: string; tools: string[] }> = {
  pipeline: { alt: 'Paper files passing through a small processing machine inside a sculpted browser window.', category: 'Behind the tools', tools: ['compress', 'image-compressor'] },
  sizebars: { alt: 'A brass scale comparing a paper stack with a compact folded file.', category: 'File size explained', tools: ['image-compressor', 'pdf-compressor'] },
  qualitycurve: { alt: 'Three botanical image tiles with different levels of detail beside a quality dial.', category: 'Practical guide', tools: ['jpg-compressor', 'webp-compressor'] },
  dataflow: { alt: 'A file protected by a glass screen inside a laptop-shaped courtyard.', category: 'Privacy', tools: ['compress', 'archive-compressor'] },
  formattree: { alt: 'Photographic, transparent and compact file sculptures beside a browser doorway.', category: 'Format guide', tools: ['image-compressor', 'video-compressor', 'wav-compressor'] },
}
export const articleImage = (id: FigureId, social = false) => `/blog/${id}.${social ? 'jpg' : 'webp'}`
