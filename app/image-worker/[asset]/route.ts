import { NextResponse } from 'next/server'

/**
 * Serve the image-compression Web Worker from our own origin.
 *
 * `browser-image-compression` defaults to loading its worker from
 * cdn.jsdelivr.net. Our Content-Security-Policy only allows same-origin
 * scripts, so that request was blocked and the library silently fell back to
 * running the encode on the main thread — which is exactly the jank the worker
 * exists to avoid, and it produced a console error on every image.
 *
 * Pointing `libURL` at this route keeps the worker on our origin: the image
 * data stays inside the browser, the CSP needs no CDN exemption, and the worker
 * script is cached like any other static asset.
 *
 * The file is read from `node_modules` at request time and never bundled, so it
 * stays out of the JavaScript for every page that does not compress images.
 */

const LIB_DIR = 'node_modules/browser-image-compression/dist'

const ASSET = 'browser-image-compression.js'

export function generateStaticParams() {
  return [{ asset: ASSET }]
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> }
) {
  const { asset } = await params

  // Only the one known filename is readable — never join user input onto a
  // filesystem path.
  if (asset !== ASSET) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const absolute = path.join(process.cwd(), LIB_DIR, ASSET)
    const source = await fs.readFile(absolute, 'utf8')

    return new NextResponse(source, {
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        // The version is pinned by package.json, so a new version means a new
        // deployment and a new URL.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Image engine asset unavailable', { status: 404 })
  }
}