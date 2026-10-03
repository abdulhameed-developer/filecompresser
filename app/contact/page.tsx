import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, CONTACT_HREF } from '@/lib/nav'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'

const DESCRIPTION =
  'Contact filecompresser for support, feedback, or security reports. One email address, no forms, and no way for this site to receive your files.'

export const metadata: Metadata = {
  title: 'Contact',
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl(CONTACT_HREF) },
}

const structuredData = [
  webPageJsonLd({
    name: 'Contact filecompresser',
    description: DESCRIPTION,
    path: CONTACT_HREF,
  }),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Contact', path: CONTACT_HREF },
  ]),
]

export default function ContactPage() {
  return (
    <div className="legal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Contact</span>
      </nav>

      <h1>Contact</h1>
      <p className="legalUpdated">
        Support, feedback, and security reports:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>

      <section>
        <h2>What we can help with</h2>
        <p>
          A tool that failed on a particular file, a result that looked wrong, a conversion that
          produced something you did not expect, or a security concern about how a tool handles a
          file.
        </p>
        <p>
          If you are reporting a security problem, please describe what you did, what you expected,
          and what happened instead. A redacted description is fine — we do not need your file.
        </p>
      </section>

      <section>
        <h2>Before you write</h2>
        <p>
          The most useful detail in a report is the file’s type, its approximate size, and the
          browser you were using. If a tool showed an error message, quoting it exactly saves a
          round trip.
        </p>
      </section>

      <section>
        <h2>No forms, and no file uploads</h2>
        <p>
          This site deliberately has no contact form. There is no mechanism here that can accept a
          file, so please do not email confidential documents unless a security report genuinely
          requires it. Everything you process happens in your browser, and an email attachment would
          not be processing — it would be sending us a copy.
        </p>
      </section>

      <section>
        <h2>Where to look first</h2>
        <p>
          The <Link href="/sitemap">sitemap page</Link> lists every tool with its formats and
          limits, and the <Link href="/disclaimer">disclaimer</Link> explains the limits of
          browser-based processing — including the cases where a file genuinely cannot be made
          smaller.
        </p>
      </section>
    </div>
  )
}