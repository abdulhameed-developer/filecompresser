import type { Metadata } from 'next'
import Link from 'next/link'
import { POLICY_REVIEWED, absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'

const DESCRIPTION = 'Terms for using filecompresser browser-based file tools.'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/terms') },
}

const structuredData = [
  webPageJsonLd({
    name: 'Terms of Service',
    description: DESCRIPTION,
    path: '/terms',
    dateModified: POLICY_REVIEWED,
  }),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Terms of Service', path: '/terms' },
  ]),
]

const SECTIONS = [
  {
    heading: 'What this site provides',
    body: [
      'filecompresser offers browser-based tools that compress and convert files on your own device. Use them only with files you own or have permission to process.',
      'The service is provided as-is. We do not promise uninterrupted availability, and we do not guarantee any particular compression ratio or output quality — the honest limits are described in the Disclaimer.',
    ],
  },
  {
    heading: 'Your files and your backups',
    body: [
      'Because processing happens on your device, nothing is stored and nothing is recoverable. You are responsible for keeping backups of original files. Keep a copy of anything you cannot re-download before you process it here.',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      'Do not use these tools for unlawful content, or to circumvent security controls or access restrictions.',
      'Do not attempt to extract or abuse the processing engines, or to use this site to process content you have no right to process.',
    ],
  },
  {
    heading: 'Intellectual property',
    body: [
      'Your files remain yours. We claim no rights over the content you process. The open-source engines these tools run under (FFmpeg, PDF.js, libheif, fflate, pdf-lib and browser-image-compression) remain under their own licences.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'These terms may be updated as the site changes. The date at the top of this page reflects the most recent revision.',
    ],
  },
  {
    heading: 'About this document',
    body: [
      'These terms were written for this specific service rather than copied from a template, but they have not been reviewed by a qualified lawyer. They are written in plain English and describe what actually happens when you use the site. If you need terms you can rely on for a commercial arrangement, have a lawyer review these before you rely on them.',
    ],
  },
]

export default function TermsPage() {
  return (
    <div className="legal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Terms of Service</span>
      </nav>

      <h1>Terms of Service</h1>
      <p className="legalUpdated">Last updated: 1 October 2026</p>

      {SECTIONS.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </section>
      ))}

      <h2>Contact</h2>
      <p>
        Email <a href="mailto:hello@filecompresser.com">hello@filecompresser.com</a>.
      </p>
    </div>
  )
}