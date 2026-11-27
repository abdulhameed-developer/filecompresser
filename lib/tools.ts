import type { FaqEntry, ToolDefinition } from './types'

const MB = 1024 * 1024

const imageFaq: FaqEntry[] = [
  {
    q: 'Are my images uploaded anywhere?',
    a: 'No. Image compression and conversion run entirely in your browser using your device’s CPU. Your files are never sent to our servers.',
  },
  {
    q: 'How much smaller will my image get?',
    a: 'Savings depend on the source and selected settings. In ordinary same-format compression, a candidate that is not smaller is discarded and your original is returned unchanged with 0% reduction. Format conversions are reported separately. Compare the actual bytes and image quality before keeping a result.',
  },
  {
    q: 'Will I lose quality?',
    a: 'JPEG and WEBP encoding is lossy. Balanced, High quality and Maximum use different quality settings, but no setting guarantees invisible changes. PNG Lossless preserves decoded pixels; Smart, Maximum and Target size can reduce colors and change pixels while preserving transparency. Inspect text, edges and fine detail before replacing an original.',
  },
  {
    q: 'Does this resize my image?',
    a: 'No. Original display dimensions are preserved, and image resizing is not offered. EXIF orientation may be normalized, so an upright image can have different stored width and height from its camera file without changing its displayed orientation.',
  },
]

const mediaFaq: FaqEntry[] = [
  {
    q: 'Why does the first file take much longer?',
    a: 'Video, audio and GIF tools load the WebAssembly media engine on first use. It is served from this site and can be cached by your browser. Loading and processing time depend on your connection, file and device.',
  },
  {
    q: 'Will this freeze my phone?',
    a: 'Processing runs off the main thread, so the page stays responsive, but it is genuinely CPU-intensive. Videos over a few hundred megabytes can exhaust the memory a mobile browser will give a single page, in which case you will get a clear error rather than a silent failure.',
  },
  {
    q: 'How accurate is the progress bar?',
    a: 'Percentages use encoder events where available. Stages without a measurable percentage show their current task instead of a timer-based estimate. A completed encode is checked before its result is offered.',
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
    a: 'Many PDFs are already compressed. The optimizer tries a structural rewrite with selected metadata removed. If the candidate is not smaller, your original is returned unchanged with 0% reduction, including its existing metadata. This tool does not downsample scanned pages or promise a percentage saving.',
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

const privacyNote = 'Processed on your device. Nothing is uploaded.'

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
    extensions: [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
      'pdf',
      'mp4',
      'mov',
      'mp3',
      'wav',
      'zip',
    ],
    mimeTypes: [],
    maxFileSize: 200 * MB,
    privacyClientSide: true,
    seoTitle: 'Compress Any File Online — Free Browser Tool',
    seoDescription:
      'Compress images, GIF, PDF, video, audio and ZIP files directly in your browser. Real compression engines, real progress, no uploads.',
    note: privacyNote,
    related: [
      'video-compressor',
      'image-compressor',
      'pdf-compressor',
      'mp3-compressor',
      'zip-compressor',
      'archive-compressor',
    ],
  },
  {
    slug: 'image-compressor',
    title: 'Image Compressor',
    description:
      'Compress JPG, PNG and WEBP images while keeping original dimensions by default.',
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
    related: [
      'jpg-compressor',
      'png-compressor',
      'webp-compressor',
      'jpeg-compressor',
      'gif-compressor',
      'compress',
    ],
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
    seoDescription:
      'Compress JPG and JPEG images locally in your browser. No upload, no account, free.',
    faq: imageFaq,
    note: privacyNote,
    related: [
      'jpeg-compressor',
      'png-compressor',
      'webp-compressor',
      'image-compressor',
      'compress',
      'gif-compressor',
    ],
  },
  {
    slug: 'jpeg-compressor',
    title: 'JPEG Compressor',
    description:
      'Re-encode JPEG images with quality controls and preserved dimensions, then compare the result.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/jpeg,.jpg,.jpeg,.jfif',
    extensions: ['jpg', 'jpeg', 'jfif'],
    mimeTypes: ['image/jpeg'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription:
      'Optimize JPEG photos in your browser with a real encoder. Nothing is uploaded.',
    faq: imageFaq,
    note: privacyNote,
    related: [
      'jpg-compressor',
      'webp-compressor',
      'png-compressor',
      'image-compressor',
      'compress',
      'gif-compressor',
    ],
  },
  {
    slug: 'png-compressor',
    title: 'PNG Compressor',
    description:
      'Optimize PNG files losslessly by default to preserve decoded pixels, dimensions and transparency. Color-reduction modes are optional; efficient originals may be retained unchanged.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/png,.png',
    extensions: ['png'],
    mimeTypes: ['image/png'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription:
      'Compress PNG images in your browser while preserving transparency. Free and private.',
    faq: imageFaq,
    note: privacyNote,
    related: [
      'webp-compressor',
      'jpg-compressor',
      'image-compressor',
      'gif-compressor',
      'jpeg-compressor',
      'compress',
    ],
  },
  {
    slug: 'webp-compressor',
    title: 'WEBP Compressor',
    description:
      'Compress WEBP images further, or check whether they are already efficient.',
    category: 'image',
    engine: 'image-compress',
    accept: 'image/webp,.webp',
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription:
      'Compress WEBP images in your browser with real progress and size reporting.',
    faq: imageFaq,
    note: privacyNote,
    related: [
      'jpg-compressor',
      'png-compressor',
      'image-compressor',
      'jpeg-compressor',
      'gif-compressor',
      'compress',
    ],
  },
  {
    slug: 'gif-compressor',
    title: 'GIF Compressor',
    description:
      'Try a smaller color palette for animated GIFs while preserving dimensions, frame timing and looping.',
    category: 'gif',
    engine: 'gif-compress',
    accept: 'image/gif,.gif',
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    maxFileSize: 50 * MB,
    privacyClientSide: true,
    seoDescription:
      'Optimize animated GIF palettes in your browser. Compare actual savings while preserving frame timing, dimensions and looping.',
    faq: mediaFaq,
    note: 'Recommended uses up to 128 colors; Maximum uses up to 64. Frame delays and loop count are preserved. If a smaller candidate cannot preserve the checked animation properties, the original is retained.',
    related: [
      'image-compressor',
      'webp-compressor',
      'png-compressor',
      'jpg-compressor',
      'compress',
      'video-compressor',
    ],
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
        label: 'Max resolution (height)',
        type: 'select',
        defaultValue: 'original',
        help: 'Keep original preserves display dimensions. A height cap explicitly allows resizing without upscaling, including portrait video. Odd dimensions may require a cap for H.264 output.',
        options: [
          { value: 'original', label: 'Keep original dimensions' },
          { value: '1080', label: 'Max height 1080 px' },
          { value: '720', label: 'Max height 720 px' },
          { value: '480', label: 'Max height 480 px' },
        ],
      },
    ],
    faq: mediaFaq,
    note: 'Encoded output is MP4 (H.264, with AAC when audio is present). Keep original does not silently resize odd dimensions; choose a resolution cap explicitly if the encoder requires even dimensions. Unsupported source codecs produce an error.',
    related: [
      'mp3-compressor',
      'wav-compressor',
      'compress',
      'gif-compressor',
      'image-compressor',
      'pdf-compressor',
    ],
  },
  {
    slug: 'webm-to-mp4',
    title: 'WebM to MP4 Converter',
    description: 'Convert WebM video to broadly compatible H.264 MP4 in your browser.',
    category: 'video',
    engine: 'webm-to-mp4',
    accept: 'video/webm,.webm',
    extensions: ['webm'],
    mimeTypes: ['video/webm'],
    maxFileSize: 200 * MB,
    privacyClientSide: true,
    seoTitle: 'WebM to MP4 Converter — Free Browser Tool',
    seoDescription: 'Convert WebM videos to compatible MP4 files locally in your browser. No upload required.',
    faq: mediaFaq,
    note: 'The result uses H.264 video and AAC audio for broad compatibility.',
    related: ['video-compressor', 'compress', 'wav-compressor'],
  },
  {
    slug: 'mp3-compressor',
    title: 'MP3 Compressor',
    description:
      'Try a lower MP3 bitrate, then compare actual size and audio quality.',
    category: 'audio',
    engine: 'audio-compress',
    accept: 'audio/mpeg,audio/mp3,.mp3',
    extensions: ['mp3'],
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
    maxFileSize: 100 * MB,
    privacyClientSide: true,
    seoDescription:
      'Reduce MP3 file size by lowering the bitrate, entirely inside your browser.',
    settings: [
      {
        id: 'bitrate',
        label: 'MP3 bitrate',
        type: 'select',
        defaultValue: '192k',
        help: 'Lower bitrates can reduce size but lose more detail. If an MP3 encode is not smaller, the original is retained. Increasing bitrate cannot restore detail lost earlier.',
        options: [
          { value: '320k', label: '320 kbps' },
          { value: '256k', label: '256 kbps' },
          { value: '192k', label: '192 kbps' },
          { value: '128k', label: '128 kbps' },
          { value: '96k', label: '96 kbps' },
        ],
      },
    ],
    faq: mediaFaq,
    note: 'Re-encoding an MP3 always costs some generation loss. Choosing a bitrate at or above the source usually provides little size benefit.',
    related: [
      'wav-compressor',
      'video-compressor',
      'compress',
      'gif-compressor',
      'image-compressor',
      'pdf-compressor',
    ],
  },
  {
    slug: 'wav-compressor',
    title: 'WAV to MP3 Converter',
    description:
      'Convert WAV audio to compressed MP3. WAV commonly contains uncompressed PCM, so a smaller download comes from changing format, not from "compressing" WAV.',
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
        help: 'MP3 encoding is lossy. Lower bitrates trade detail for size; a tiny WAV can still produce a larger MP3. Keep the WAV for editing or archiving.',
        options: [
          { value: '320k', label: '320 kbps' },
          { value: '256k', label: '256 kbps' },
          { value: '192k', label: '192 kbps' },
          { value: '128k', label: '128 kbps' },
          { value: '96k', label: '96 kbps' },
        ],
      },
    ],
    faq: [
      ...mediaFaq,
      {
        q: 'Is the WAV file itself being compressed?',
        a: 'This tool converts the audio in the WAV container to MP3. MP3 is lossy; the result is not a lossless rewrite of the original WAV.',
      },
    ],
    note: 'This is a format conversion, not a lossless compression of WAV.',
    related: [
      'mp3-compressor',
      'video-compressor',
      'gif-compressor',
      'image-compressor',
      'pdf-compressor',
      'compress',
    ],
  },
  {
    slug: 'pdf-compressor',
    title: 'PDF Compressor',
    description:
      'Try a PDF structure rewrite with selected metadata removed. Retain the original unchanged when no smaller result is found.',
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
    related: [
      'archive-compressor',
      'zip-compressor',
      'compress',
      'image-compressor',
      'video-compressor',
      'mp3-compressor',
    ],
  },
  {
    slug: 'zip-compressor',
    title: 'ZIP Creator',
    description:
      'Bundle any files into a single ZIP archive, entirely on your device.',
    category: 'archive',
    engine: 'zip-create',
    accept: '*/*',
    extensions: [],
    mimeTypes: [],
    maxFileSize: 200 * MB,
    privacyClientSide: true,
    seoDescription:
      'Create a ZIP archive from multiple files in your browser. Nothing is uploaded.',
    faq: archiveFaq,
    note: privacyNote,
    related: [
      'archive-compressor',
      'compress',
      'pdf-compressor',
      'image-compressor',
      'video-compressor',
      'mp3-compressor',
    ],
  },
  {
    slug: 'archive-compressor',
    title: 'ZIP Extractor',
    description:
      'Extract a ZIP archive. Unsafe paths and archive bombs are rejected before anything is written to disk.',
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
    related: [
      'zip-compressor',
      'compress',
      'pdf-compressor',
      'image-compressor',
      'video-compressor',
      'mp3-compressor',
    ],
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
export function relatedTools(
  tool: ToolDefinition,
  limit = 6,
): ToolDefinition[] {
  const ranked: { tool: ToolDefinition; score: number }[] = []

  for (const candidate of TOOLS) {
    if (candidate.slug === tool.slug) continue

    // Declared relations are an explicit editorial decision, so they are
    // resolved first and returned in their given order. Format- and
    // category-similarity only fill the remaining slots; mixing the two into a
    // single score was what pushed declared entries below incidental
    // same-format tools.
    if (tool.related?.includes(candidate.slug)) {
      ranked.push({
        tool: candidate,
        score: 1000 - tool.related.indexOf(candidate.slug),
      })
      continue
    }

    let score = 0
    if (candidate.related?.includes(tool.slug)) score += 50
    if (sharesInputFormat(tool, candidate)) score += 20
    if (candidate.category === tool.category) score += 10

    if (score > 0) ranked.push({ tool: candidate, score })
  }

  ranked.sort(
    (a, b) => b.score - a.score || a.tool.slug.localeCompare(b.tool.slug),
  )

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
