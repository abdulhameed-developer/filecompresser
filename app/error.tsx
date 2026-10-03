'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Route-level error boundary.
 *
 * Next renders this in place of a crashed segment, still inside the root
 * layout — so the header, footer and navigation stay available, which is the
 * difference between "this page broke" and "the site is down".
 *
 * Only the digest (a build-time identifier) is shown. The raw error and its
 * stack are never rendered: they can contain internal paths and library
 * internals, which is exactly what a public error page must not leak.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surfaces in the browser console for the visitor and in platform logs for
    // us; the message itself is not put on the page.
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="notFoundPage">
      <p className="notFoundCode">Something went wrong</p>
      <h1>This page could not finish.</h1>
      <p className="notFoundLead">
        An unexpected error interrupted the page. Nothing you uploaded has been sent anywhere —
        these tools run entirely in your browser — so trying again is safe.
      </p>

      {error.digest && (
        <p className="errorDigest">
          Reference code: <code>{error.digest}</code>
        </p>
      )}

      <div className="notFoundActions">
        <button type="button" className="navbtn" onClick={reset}>
          Try again
        </button>
        <Link className="navbtn secondary" href="/">
          Back home
        </Link>
      </div>
    </div>
  )
}
