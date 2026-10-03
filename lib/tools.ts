import type { FaqEntry, ToolDefinition } from './types'

const MB = 1024 * 1024

const imageFaq: FaqEntry[] = [
  {
    q: 'Are my images uploaded anywhere?',
    a: 'No. Image compression and conversion run entirely in your browser using your device’s CPU. Your files are never sent to our servers.',
  },
  {
    q: 'How much smaller will my image get?',
    a: 'It depends on the source. Recommended mode typically saves 40–70% on ordinary photos with no visible difference. Images that are already heavily compressed may save much less — we show the real numbers either way.',
  },
  {
    q: 'Will I lose quality?',
    a: 'Every JPEG, PNG and WEBP re-encode is lossy. Recommended mode targets a quality that is not distinguishable in normal viewing; Maximum mode compresses harder and is more visible.',
  },
  {
    q: 'Does this resize my image?',
    a: 'Recommended mode caps the longest edge at 3200px, and Maximum mode at 1920px, to keep the output practical for web use. Images already smaller than that are left at their original dimensions.',
  },
]

const mediaFaq: FaqEntry[] = [
  {
    q: 'Why does the first file take much longer?',
    a: 'Video, audio and GIF tools load a WebAssembly build of FFmpeg — roughly 30 MB — the first time you use them on a page. It is served from this site, cached by your browser, and shared by every media tool afterwards.',
  },
  {
    q: 'Will this freeze my phone?',
    a: 'Processing runs off the main thread, so the page stays responsive, but it is genuinely CPU-intensive. Videos over a few hundred megabytes can exhaust the memory a mobile browser will give a single page, in which case you will get a clear error rather than a silent failure.',
  },
  {
    q: 'How accurate is the progress bar?',
    a: 'It is measured from the encoder itself as it writes output, not estimated from a timer.',
  },
]

const archiveFaq: FaqEntry[] = [
  {
    q: 'How do you keep an archive from overwriting my files?',
    a: 'Extracted filenames are checked against path traversal (../), absolute paths, drive letters, control characters and Windows reserved names. Anything that fails is refused rather than cleaned up and used.',
  },
  {
    q: 'What is an archive bomb?',
    a: 'A small archive that expands to an enormous amount of data. We reject archives with too many entries, oversized entries, too much total uncompressed data, or a compression ratio above 100×.',
  },
]

const pdfFaq: FaqEntry[] = [
  {
    q: 'Why did my PDF not get smaller?',
    a: 'Most PDFs are already compressed. We remove document metadata and rewrite the file structure, which typically saves a few percent. If a PDF is already optimized, the result can be the same size or marginally larger — we will not damage a document to make the number smaller.',
  },
  {
    q: 'Is the output still a valid PDF?',
    a: 'Yes. After writing we re-parse the result and confirm the page count is unchanged before offering it. If that check fails we return an error and leave your original untouched.',
  },
  {
    q: 'Can you compress password-protected PDFs?',
    a: 'No. Remove the password first, then optimize the file.',
  },
]

const privacyNote =
  'Processed on your device. Nothing is uploaded.'

export const TOOLS: ToolDefinition[] = [
  // ─────────────────────────── Compression ───────────────────────────
  {
    slug: 'compress',
    title: 'Compress Any File',
    description:
      'Drop a file and the right engine is chosen for it automatically — image, GIF, PDF, video, audio or ZIP.',
    category: 'image',
    engine: 'image-compress',
    accept:
      'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime,audio/mpeg,audio/wav,.jpg,.jpeg,.png,.webp,.gif,.pdf,.mp4,.mov,.mp3,.wav,.zip',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'mp4', 'mov', 'mp3', 'wav', 'zip'],
    mimeTypes: [],
    maxFileSize: 200 * MB,
    privacyClientSide: true,
    seoTitle: 'Compress Any File Online — Free Browser Tool',
    seoDescription:
      'Compress images, GIF, PDF, video, audio and ZIP files directly in your browser. Real compression engines, real progress, no uploads.',
    note: privacyNote,
    related: ['video-compressor', 'image-compressor', 'pdf-compressor', 'mp3-compressor', 'zip-compressor', 'archive-compressor'],
  },
  {
    slug: 'image-compressor',
    title: 'Image Compressor',
    description: 'Shrink JPG, PNG and WEBP images while keeping them usable at full resolution.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription:
      'Compress JPG, PNG and WEBP images in your browser. Batch processing, real size savings, nothing uploaded.',
    faq: imageFaq,
    note: privacyNote,
    related: ['jpg-compressor', 'png-compressor', 'webp-compressor', 'jpeg-compressor', 'gif-compressor', 'compress'],
  },
  {
    slug: 'jpg-compressor',
    title: 'JPG Compressor',
    description: 'Reduce the file size of JPG and JPEG photographs.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/jpeg,.jpg,.jpeg,.jfif',
    extensions: ['jpg', 'jpeg', 'jfif'],
    mimeTypes: ['image/jpeg'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription: 'Compress JPG and JPEG images locally in your browser. No upload, no account, free.',
    faq: imageFaq,
    note: privacyNote,
    related: ['jpeg-compressor', 'png-compressor', 'webp-compressor', 'image-compressor', 'compress', 'gif-compressor'],
  },
  {
    slug: 'jpeg-compressor',
    title: 'JPEG Compressor',
    description: 'Optimize JPEG images to the same visual quality at a smaller size.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/jpeg,.jpg,.jpeg,.jfif',
    extensions: ['jpg', 'jpeg', 'jfif'],
    mimeTypes: ['image/jpeg'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription: 'Optimize JPEG photos in your browser with a real encoder. Nothing is uploaded.',
    faq: imageFaq,
    note: privacyNote,
    related: ['jpg-compressor', 'webp-compressor', 'png-compressor', 'image-compressor', 'compress', 'gif-compressor'],
  },
  {
    slug: 'png-compressor',
    title: 'PNG Compressor',
    description: 'Shrink PNG files. Transparency is preserved; colour depth is reduced where possible.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/png,.png',
    extensions: ['png'],
    mimeTypes: ['image/png'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription: 'Compress PNG images in your browser while preserving transparency. Free and private.',
    faq: imageFaq,
    note: privacyNote,
    related: ['webp-compressor', 'jpg-compressor', 'image-compressor', 'gif-compressor', 'jpeg-compressor', 'compress'],
  },
  {
    slug: 'webp-compressor',
    title: 'WEBP Compressor',
    description: 'Compress WEBP images further, or check whether they are already efficient.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/webp,.webp',
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription: 'Compress WEBP images in your browser with real progress and size reporting.',
    faq: imageFaq,
    note: privacyNote,
    related: ['jpg-compressor', 'png-compressor', 'image-compressor', 'jpeg-compressor', 'gif-compressor', 'compress'],
  },
  {
    slug: 'gif-compressor',
    title: 'GIF Compressor',
    description:
      'Optimize animated GIFs by re-quantizing every frame to an optimal palette. The output is a genuinely re-encoded animation.',
    category: 'gif',
    engine: 'gif-compress',
    accept: 'image/gif,.gif',
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription:
      'Compress animated GIFs in your browser. Frames are re-quantized to a smaller palette, producing real size savings.',
    faq: mediaFaq,
    note: 'Maximum mode also reduces the frame rate to 15 fps, which saves more but can look choppy.',
    related: ['image-compressor', 'webp-compressor', 'png-compressor', 'jpg-compressor', 'compress', 'video-compressor'],
  },
  {
    slug: 'video-compressor',
    title: 'Video Compressor',
    description:
      'Re-encode MP4 and MOV video to a web-friendly H.264/AAC MP4 using FFmpeg running in your browser.',
    category: 'video',
    engine: 'video-compress',
    accept: 'video/mp4,video/quicktime,.mp4,.mov,.m4v',
    extensions: ['mp4', 'mov', 'm4v'],
    mimeTypes: ['video/mp4', 'video/quicktime'],
    maxFileSize: 200 * MB,
    privacyClientSide: true,
    seoDescription:
      'Compress MP4 and MOV video in your browser with FFmpeg WASM. The video is never uploaded to a server.',
    settings: [
      {
        id: 'resolution',
        label: 'Max resolution',
        type: 'select',
        defaultValue: 'original',
        help: 'Never upscales. Lower caps shrink tall videos further.',
        options: [
          { value: 'original', label: 'Keep original' },
          { value: '1080', label: 'Max 1080p' },
          { value: '720', label: 'Max 720p' },
          { value: '480', label: 'Max 480p' },
        ],
      },
    ],
    faq: mediaFaq,
    note: 'Output is always MP4 (H.264 + AAC). MOV files are transcoded rather than remuxed, because browsers cannot play the codecs MOV usually carries.',
    related: ['mp3-compressor', 'wav-compressor', 'compress', 'gif-compressor', 'image-compressor', 'pdf-compressor'],
  },
  {
    slug: 'mp3-compressor',
    title: 'MP3 Compressor',
    description: 'Re-encode MP3 audio at a lower bitrate for a genuinely smaller file.',
    category: 'audio',
    engine: 'audio-compress',
    accept: 'audio/mpeg,audio/mp3,.mp3',
    extensions: ['mp3'],
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
    maxFileSize: 100 * MB,
    privacyClientSide: true,
    seoDescription: 'Reduce MP3 file size by lowering the bitrate, entirely inside your browser.',
    settings: [
      {
        id: 'bitrate',
        label: 'Target bitrate',
        type: 'select',
        defaultValue: '160k',
        help: 'Higher bitrates sound closer to the original. 320 kbps only helps if the source is also 320 kbps.',
        options: [
          { value: '320k', label: '320 kbps — near-transparent' },
          { value: '256k', label: '256 kbps' },
          { value: '192k', label: '192 kbps — recommended' },
          { value: '128k', label: '128 kbps' },
          { value: '96k', label: '96 kbps — smallest' },
        ],
      },
    ],
    faq: mediaFaq,
    note: 'Re-encoding an MP3 always costs some generation loss. Choosing a bitrate at or above the source will not make the file smaller.',
    related: ['wav-compressor', 'video-compressor', 'compress', 'gif-compressor', 'image-compressor', 'pdf-compressor'],
  },
  {
    slug: 'wav-compressor',
    title: 'WAV to MP3 Converter',
    description:
      'Convert WAV audio to compressed MP3. WAV is uncompressed PCM, so the smaller download comes from changing format, not from "compressing" WAV.',
    category: 'audio',
    engine: 'audio-compress',
    accept: 'audio/wav,audio/wave,audio/x-wav,.wav',
    extensions: ['wav'],
    mimeTypes: ['audio/wav', 'audio/wave', 'audio/x-wav'],
    maxFileSize: 100 * MB,
    privacyClientSide: true,
    // "wav-compressor" is a widely-searched term for this job; keeping it as an
    // alias of the honest WAV→MP3 conversion beats shipping a tool whose name
    // promises lossless compression of an uncompressed format.
    aliases: ['wav-to-mp3'],
    seoTitle: 'WAV to MP3 Converter — Reduce WAV File Size',
    seoDescription:
      'Convert WAV audio to smaller MP3 files in your browser. A real FFmpeg encode, not a renamed file, and nothing is uploaded.',
    settings: [
      {
        id: 'bitrate',
        label: 'MP3 bitrate',
        type: 'select',
        defaultValue: '192k',
        options: [
          { value: '320k', label: '320 kbps' },
          { value: '256k', label: '256 kbps' },
          { value: '192k', label: '192 kbps — recommended' },
          { value: '128k', label: '128 kbps' },
          { value: '96k', label: '96 kbps — smallest' },
        ],
      },
    ],
    faq: [
      ...mediaFaq,
      {
        q: 'Is the WAV file itself being compressed?',
        a: 'No. WAV is an uncompressed format, so it has no size to squeeze out. This tool converts it to MP3, which is a lossy format — that is where the reduction comes from, and the wording reflects that.',
      },
    ],
    note: 'This is a format conversion, not a lossless compression of WAV.',
    related: ['mp3-compressor', 'video-compressor', 'gif-compressor', 'image-compressor', 'pdf-compressor', 'compress'],
  },
  {
    slug: 'pdf-compressor',
    title: 'PDF Compressor',
    description:
      'Strip document metadata and rewrite the file structure. Already-optimized PDFs may not shrink — that is the honest outcome.',
    category: 'pdf',
    engine: 'pdf-compress',
    accept: 'application/pdf,.pdf',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription:
      'Optimize PDF files in your browser by removing metadata and rewriting structure. The result is validated before you download it.',
    faq: pdfFaq,
    note: 'For substantial reductions, rasterizing scanned pages at lower DPI is the usual answer — this tool deliberately does not do that, because it would visibly degrade text quality.',
    related: ['archive-compressor', 'zip-compressor', 'compress', 'image-compressor', 'video-compressor', 'mp3-compressor'],
  },
  {
    slug: 'zip-compressor',
    title: 'ZIP Creator',
    description: 'Bundle any files into a single ZIP archive, entirely on your device.',
    category: 'archive',
    engine: 'zip-create',
    accept: '*/*',
    extensions: [],
    mimeTypes: [],
    maxFileSize: 200 * MB,
    privacyClientSide: true,
    seoDescription: 'Create a ZIP archive from multiple files in your browser. Nothing is uploaded.',
    faq: archiveFaq,
    note: privacyNote,
    related: ['archive-compressor', 'compress', 'pdf-compressor', 'image-compressor', 'video-compressor', 'mp3-compressor'],
  },
  {
    slug: 'archive-compressor',
    title: 'ZIP Extractor',
    description:
      'Inspect and extract a ZIP archive. Unsafe paths and archive bombs are rejected before anything is written to disk.',
    category: 'archive',
    engine: 'zip-extract',
    accept: 'application/zip,application/x-zip-compressed,.zip',
    extensions: ['zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    maxFileSize: 150 * MB,
    privacyClientSide: true,
    seoDescription:
      'Extract ZIP files in your browser with path-traversal and archive-bomb protection. Files never leave your device.',
    faq: archiveFaq,
    note: privacyNote,
    related: ['zip-compressor', 'compress', 'pdf-compressor', 'image-compressor', 'video-compressor', 'mp3-compressor'],
  },
]

const bySlug = new Map<string, ToolDefinition>()
for (const tool of TOOLS) {
  bySlug.set(tool.slug, tool)
  for (const alias of tool.aliases ?? []) bySlug.set(alias, tool)
}

export function getTool(slug: string): ToolDefinition | undefined {
  return bySlug.get(slug)
}

/**
 * Tools that form a natural pairing with `tool`, ranked rather than listed.
 *
 * Each tool declares its own relations, which are resolved first and in order;
 * format- and category-similarity only fill the remaining slots. The ranking is
 * deterministic, so the section is both relevant and stable between builds.
 */
export function relatedTools(tool: ToolDefinition, limit = 6): ToolDefinition[] {
  const ranked: { tool: ToolDefinition; score: number }[] = []

  for (const candidate of TOOLS) {
    if (candidate.slug === tool.slug) continue

    // Declared relations are an explicit editorial decision, so they are
    // resolved first and returned in their given order. Format- and
    // category-similarity only fill the remaining slots; mixing the two into a
    // single score was what pushed declared entries below incidental
    // same-format tools.
    if (tool.related?.includes(candidate.slug)) {
      ranked.push({ tool: candidate, score: 1000 - tool.related.indexOf(candidate.slug) })
      continue
    }

    let score = 0
    if (candidate.related?.includes(tool.slug)) score += 50
    if (sharesInputFormat(tool, candidate)) score += 20
    if (candidate.category === tool.category) score += 10

    if (score > 0) ranked.push({ tool: candidate, score })
  }

  ranked.sort((a, b) => b.score - a.score || a.tool.slug.localeCompare(b.tool.slug))

  // Fall back to same-category tools if a tool ever declares no relations at all.
  if (ranked.length < limit) {
    const taken = new Set(ranked.map((entry) => entry.tool.slug))
    for (const candidate of TOOLS) {
      if (ranked.length >= limit) break
      if (taken.has(candidate.slug) || candidate.slug === tool.slug) continue
      if (candidate.category !== tool.category) continue
      ranked.push({ tool: candidate, score: 0 })
      taken.add(candidate.slug)
    }
  }

  return ranked.slice(0, limit).map((entry) => entry.tool)
}

function sharesInputFormat(a: ToolDefinition, b: ToolDefinition): boolean {
  if (a.extensions.length === 0 || b.extensions.length === 0) return false
  return a.extensions.some((ext) => b.extensions.includes(ext))
}

/** The slug a URL should canonicalise to, resolving aliases to their primary tool. */
export function canonicalSlug(slug: string): string | undefined {
  return bySlug.get(slug)?.slug
}

export function allToolSlugs(): string[] {
  return TOOLS.map((tool) => tool.slug)
}

export function toolsByCategory(): Record<string, ToolDefinition[]> {
  const grouped: Record<string, ToolDefinition[]> = {}
  for (const tool of TOOLS) {
    if (!grouped[tool.category]) grouped[tool.category] = []
    grouped[tool.category].push(tool)
  }
  return grouped
}

/** Tools that need the FFmpeg WASM core — used for prefetch hints and messaging. */
export function toolUsesFfmpeg(tool: ToolDefinition): boolean {
  return (
    tool.engine === 'video-compress' ||
    tool.engine === 'audio-compress' ||
    tool.engine === 'gif-compress'
  )
}