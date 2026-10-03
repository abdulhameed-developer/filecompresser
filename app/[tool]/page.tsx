import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ToolWorkspace from '@/components/ToolWorkspace'
import {
  allToolSlugs,
  canonicalSlug,
  getTool,
  relatedTools,
  toolUsesFfmpeg,
} from '@/lib/tools'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd, jsonLdScript, toolJsonLd } from '@/lib/seo'
import type { ToolDefinition } from '@/lib/types'

export function generateStaticParams() {
  // Aliases resolve to their primary tool at runtime, so only real tools are
  // prerendered; `dynamicParams` covers the alias URLs.
  return allToolSlugs().map((tool) => ({ tool }))
}

export const dynamicParams = true

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>
}): Promise<Metadata> {
  const { tool: slug } = await params
  const tool = getTool(slug)

  // A 404 must not be indexable and must not advertise itself as a tool page.
  if (!tool) {
    return {
      title: 'Tool not found',
      robots: { index: false, follow: true },
    }
  }

  const title = tool.seoTitle ?? `${tool.title} — Free, Private & Browser-Based`
  const description =
    tool.seoDescription ??
    `${tool.description} Runs entirely on your device — no upload, no account, no sign-up.`

  // Alias slugs canonicalise to the primary tool so we do not index duplicates.
  const canonical = absoluteUrl(`/${canonicalSlug(slug)}`)

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName: 'filecompresser',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: { index: true, follow: true },
  }
}

/** Human-readable file-size cap, matching what the workspace badge shows. */
function formatLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`
}

const FORMAT_LABELS: Record<string, string> = {
  jpg: 'JPG',
  jpeg: 'JPEG',
  jfif: 'JFIF',
  png: 'PNG',
  webp: 'WEBP',
  gif: 'GIF',
  svg: 'SVG',
  pdf: 'PDF',
  zip: 'ZIP',
  mp4: 'MP4',
  mov: 'MOV',
  m4v: 'M4V',
  mp3: 'MP3',
  wav: 'WAV',
  m4a: 'M4A',
  flac: 'FLAC',
  ogg: 'OGG',
  heic: 'HEIC',
  heif: 'HEIF',
}

function supportedFormats(tool: ToolDefinition): string[] {
  if (!tool.extensions.length) return []
  // jpg/jpeg/jfif are the same container; showing all three is noise.
  const seen = new Set<string>()
  const out: string[] = []
  for (const ext of tool.extensions) {
    const key = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'heif' ? 'heic' : ext
    if (seen.has(key)) continue
    seen.add(key)
    out.push(FORMAT_LABELS[ext] ?? ext.toUpperCase())
  }
  return out
}

function howItWorks(tool: ToolDefinition): string[] {
  const shared = [
    'Your file is checked before anything is processed — its size, and its actual file signature rather than just its name or extension.',
    tool.privacyClientSide
      ? 'The work happens on your own device using your CPU. Nothing is sent to a filecompresser server, and nothing is stored after you close the tab.'
      : 'The processing engine is downloaded on first use, and the work happens on your own device.',
    'You get the real original and output sizes. If a file cannot be made smaller without losing data, we say so rather than pretending.',
  ]

  switch (tool.engine) {
    case 'video-compress':
      shared.push(
        'Video is re-encoded to H.264 video and AAC audio in an MP4 container, which is what browsers can actually play. MOV files are transcoded rather than remuxed, because browsers cannot play the codecs MOV usually carries.'
      )
      break
    case 'audio-compress':
      shared.push(
        'Audio is re-encoded with a real MP3 encoder at the bitrate you choose. WAV output is uncompressed PCM and always larger, which is why the audio tools describe themselves as re-encoding rather than compressing.'
      )
      break
    case 'pdf-compress':
      shared.push(
        'The result is parsed again and its page count checked before you are offered it. If it fails that check, you get an error instead of a broken file.'
      )
      break
    case 'zip-extract':
      shared.push(
        'Entry paths are validated against traversal and absolute-path tricks, and archives that expand far beyond their compressed size are refused.'
      )
      break
    default:
      break
  }

  return shared
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params
  const tool = getTool(slug)
  if (!tool) notFound()

  const canonical = canonicalSlug(slug)
  const isAlias = canonical !== slug

  const structuredData = [
    toolJsonLd(tool),
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: tool.title, path: `/${tool.slug}` },
    ]),
    ...(tool.faq?.length ? [faqJsonLd(tool.faq)] : []),
  ]

  const steps = howItWorks(tool)
  const formats = supportedFormats(tool)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <div className="toolPage">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{tool.title}</span>
        </nav>

        <div className="sectionLabel">
          {tool.privacyClientSide ? 'PRIVATE BROWSER TOOL' : 'BROWSER TOOL'}
        </div>
        <h1>{tool.title}</h1>
        <p className="toolIntro">{tool.description}</p>

        {/*
          AEO/GEO: the three facts people ask for first, stated as plain visible
          text rather than inferred. This is also the block answer engines lift.
        */}
        <dl className="toolFacts">
          <div>
            <dt>Accepted files</dt>
            <dd>{formats.length ? formats.join(', ') : 'Any file type'}</dd>
          </div>
          <div>
            <dt>Maximum file size</dt>
            <dd>{formatLimit(tool.maxFileSize)} per file</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>Free, with no account</dd>
          </div>
          <div>
            <dt>Where processing happens</dt>
            <dd>In your browser — your file is not uploaded</dd>
          </div>
        </dl>

        {isAlias && (
          <p className="aliasNotice">
            This URL is an alias for <Link href={`/${canonical}`}>{tool.title}</Link>. Both
            addresses run the same tool.
          </p>
        )}

        <ToolWorkspace tool={tool} />

        {tool.note && (
          <section className="toolNoteBlock" aria-labelledby="note-heading">
            <h2 id="note-heading">Good to know</h2>
            <p>{tool.note}</p>
          </section>
        )}

        <section className="processExplainer" aria-labelledby="how-heading">
          <h2 id="how-heading">How this works</h2>
          <ol>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        {toolUsesFfmpeg(tool) && (
          <section className="limits" aria-labelledby="limits-heading">
            <h2 id="limits-heading">What to expect</h2>
            <p>
              Video, audio and GIF tools run a WebAssembly build of FFmpeg inside this page. The
              first job on a session downloads about 30 MB of engine code from this site and then
              caches it; every later job on the page starts immediately.
            </p>
            <p>
              Encoding is genuinely CPU-intensive. A long or high-resolution video can exhaust the
              memory a browser gives a single page — particularly on phones and tablets — in which
              case you will get a clear error rather than a silent failure. Nothing is uploaded as
              a workaround.
            </p>
          </section>
        )}

        {tool.faq && tool.faq.length > 0 && (
          <section className="faq" aria-labelledby="faq-heading">
            <h2 id="faq-heading">Frequently asked questions</h2>
            {tool.faq.map((entry) => (
              <details key={entry.q}>
                <summary>{entry.q}</summary>
                <p>{entry.a}</p>
              </details>
            ))}
          </section>
        )}

        <nav className="relatedTools" aria-labelledby="related-heading">
          <h2 id="related-heading">Related tools</h2>
          <ul>
            {relatedTools(tool).map((other) => (
              <li key={other.slug}>
                <Link href={`/${other.slug}`}>
                  {other.title}
                  <small>{other.description}</small>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
