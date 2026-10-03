import type { Metadata } from 'next'
import Link from 'next/link'
import { POLICY_REVIEWED, absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'

const DESCRIPTION =
  'How filecompresser handles your files: browser-side processing, no uploads, what the third-party engines do and do not receive, and what we do not collect.'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/privacy') },
}

const structuredData = [
  webPageJsonLd({
    name: 'Privacy Policy',
    description: DESCRIPTION,
    path: '/privacy',
    dateModified: POLICY_REVIEWED,
  }),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Privacy Policy', path: '/privacy' },
  ]),
]

const SECTIONS = [
  {
    heading: 'Where your files are processed',
    body: [
      'Every tool on this site runs in your browser. When you add a file, it is read into the memory of that browser tab and processed by code executing on your own device. The result is produced there too, and handed straight back to you as a download.',
      'filecompresser does not operate an upload endpoint for these tools. Your files are not transmitted to us, and we have no copy of them. We also do not claim to delete your files after a period of time, because they never arrive anywhere for us to delete.',
    ],
  },
  {
    heading: 'What we can and cannot see',
    body: [
      'Like any website, our hosting provider records standard web server logs — IP address, timestamp, requested URL, user agent — so the site can be delivered and protected from abuse. Those logs describe the request for a web page, not the contents of your file, because your file never travels with the request.',
      'We do not collect file contents, filenames used in the tools, or the results of processing. We do not build a profile of what you compress.',
    ],
  },
  {
    heading: 'Third-party code, not your data',
    body: [
      'Some tools download an open-source processing engine the first time you use them: a WebAssembly build of FFmpeg for video, audio and GIF work, and a Web Worker build of the image encoder. These are program files, served by this site, and they execute inside your browser tab.',
      'They are code. They are not given your file, and they have no channel to send it anywhere. Their only input is the file you selected, inside your own browser.',
      'Web fonts are loaded from Google Fonts, which means your browser makes a request to Google that includes your IP address in the ordinary way any third-party asset does. No file content is involved. If you would rather avoid that, a content blocker will stop the fonts and the site still works.',
    ],
  },
  {
    heading: 'Browser storage',
    body: [
      'While a tool is running, your file and its output exist as memory buffers in the browser tab, and as temporary Object URLs that make downloads possible. When a file is removed from a tool, when a download completes, or when you close the tab, the browser reclaims that memory.',
      'We do not write your files to localStorage, IndexedDB, the Cache API or cookies. Clearing your browser data is not necessary for your files, because none of them were persisted anywhere.',
    ],
  },
  {
    heading: 'Analytics and cookies',
    body: [
      'This site sets no analytics cookies, no advertising cookies, and no tracking cookies. There is no third-party analytics script running on these pages.',
      'The only persistent state is service-worker-style caching of the FFmpeg engine files, which the browser may keep to avoid re-downloading a 30 MB file. That cache holds program code, not your data.',
    ],
  },
  {
    heading: 'Contact forms',
    body: [
      'There is no contact form, and no mechanism on this site for sending us a file. The contact page is a plain email address. Please do not email us confidential documents unless a security report genuinely requires it.',
    ],
  },
  {
    heading: 'Children',
    body: ['This site is a general-purpose utility and is not directed at children under 13.'],
  },
  {
    heading: 'Changes to this policy',
    body: [
      'If this policy changes — for example if a tool ever needed server-side processing — the tool page would say so explicitly, and this page would be updated. A tool that stops running client-side would stop claiming that your files never leave your device.',
    ],
  },
  {
    heading: 'About this document',
    body: [
      'This policy describes the software on this site as it is actually built, rather than being copied from a template. It has not been reviewed by a qualified lawyer or a privacy professional. If you need advice about how a service like this complies with the law where you live, speak to a lawyer — the technical facts below are accurate, but the legal conclusions drawn from them depend on your situation.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="legal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Privacy Policy</span>
      </nav>

      <h1>Privacy Policy</h1>
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