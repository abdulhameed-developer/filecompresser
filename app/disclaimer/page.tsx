import type { Metadata } from 'next'
import Link from 'next/link'
import { POLICY_REVIEWED, absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'

const DESCRIPTION =
  'What filecompresser does and does not guarantee: limits of browser-based processing, backup responsibility, and when to keep your originals.'

export const metadata: Metadata = {
  title: 'Disclaimer',
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/disclaimer') },
}

const structuredData = [
  webPageJsonLd({
    name: 'Disclaimer',
    description: DESCRIPTION,
    path: '/disclaimer',
    dateModified: POLICY_REVIEWED,
  }),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Disclaimer', path: '/disclaimer' },
  ]),
]

const SECTIONS = [
  {
    heading: 'Your files stay on your device',
    body: [
      'Processing happens in your browser. Your file is read into that browser tab, processed there, and handed back to you. It is not transmitted to us. This is a technical property of how the tools are built, not a policy promise — there is no upload endpoint to send it to.',
    ],
  },
  {
    heading: 'Keep your own backups',
    body: [
      'Because nothing is stored, nothing is recoverable either. If a result is wrong, or your browser crashes mid-process, the original file is the only copy. Keep a backup of anything you cannot afford to re-download before using these tools on it.',
    ],
  },
  {
    heading: 'Compression is not always compression',
    body: [
      'Some formats cannot be made smaller without losing data. A PDF that is already optimized, or an image already encoded at a low quality, may come out the same size or marginally larger. Where that happens, these tools report it rather than manufacturing a smaller number by truncating a file or changing an extension without converting.',
      'Audio re-encoded to MP3 and video re-encoded to H.264 are genuinely lossy. They are appropriate for web delivery and email, but they are not archival replacements for the original.',
    ],
  },
  {
    heading: 'No warranty of results',
    body: [
      'These tools are provided as-is. We do not guarantee any particular compression ratio, output quality, or availability. If a result matters — a document you must deliver, a video you must publish — check the output before you rely on it.',
    ],
  },
  {
    heading: 'Browser and device limits',
    body: [
      'A browser tab has less memory than a desktop application, and less again on a phone. Very large videos and PDFs can exhaust the memory a browser will give a single page, particularly on mobile. When that happens you get a clear error and your original is untouched. This is a device constraint, not a limit on file types.',
    ],
  },
  {
    heading: 'Not professional advice',
    body: [
      'Nothing on this site is legal, medical, or financial advice. This is a file utility.',
    ],
  },
]

export default function DisclaimerPage() {
  return (
    <div className="legal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Disclaimer</span>
      </nav>

      <h1>Disclaimer</h1>
      <p className="legalUpdated">Last updated: 1 October 2026</p>

      {SECTIONS.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </section>
      ))}

      <h2>Questions</h2>
      <p>
        Email <a href="mailto:hello@filecompresser.com">hello@filecompresser.com</a>.
      </p>
    </div>
  )
}