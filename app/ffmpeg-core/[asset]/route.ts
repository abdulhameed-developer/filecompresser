import { NextResponse } from 'next/server'

/**
 * Serve the FFmpeg WASM core from our own origin.
 *
 * Two reasons this exists rather than pointing at a public CDN:
 *  1. Media processing genuinely stays on infrastructure we control — the core
 *     is a build dependency, not something fetched from a third party at the
 *     moment a user starts a transcode.
 *  2. The ~32 MB core can be cached aggressively, so only the first media job
 *     in a session pays for it.
 *
 * The files are read from `node_modules` at request time and never bundled, so
 * they stay out of the JavaScript bundle for every page that does not use them.
 */

const CORE_DIR = 'node_modules/@ffmpeg/core/dist/esm'
const FFMPEG_DIR = 'node_modules/@ffmpeg/ffmpeg/dist/esm'

/**
 * The wasm core itself.
 */
const CONTENT_TYPES: Record<string, string> = {
  'ffmpeg-core.js': 'text/javascript; charset=utf-8',
  'ffmpeg-core.wasm': 'application/wasm',
}

/**
 * `@ffmpeg/ffmpeg`'s class worker, plus the sibling modules it imports.
 *
 * These have to be served together. The worker is an ES module that does
 * `import ... from "./const.js"`, so its siblings must be reachable at the same
 * path depth — which is why they are addressed under this one route rather than
 * from `public/`.
 *
 * Why the worker is served here at all: the library creates it with
 * `new Worker(new URL(classWorkerURL, import.meta.url))`. When the specifier is
 * a runtime value, Turbopack cannot resolve it statically and throws
 * "Cannot find module as expression is too dynamic" — the media engine then
 * fails to start on every video, audio and GIF tool. Passing an absolute URL
 * we control sidesteps the dynamic resolution entirely, and keeps the worker on
 * our own origin like the core.
 */
const WORKER_ASSETS = ['worker.js', 'const.js', 'errors.js', 'utils.js', 'types.js'] as const

const ASSETS = Object.keys(CONTENT_TYPES)

export function generateStaticParams() {
  return [...ASSETS, ...WORKER_ASSETS].map((asset) => ({ asset }))
}

/**
 * Resolve a request path to a file on disk, or `null` if it is not one of the
 * known assets. User input is only ever used as a lookup key against this
 * allow-list, never joined onto a path.
 */
function resolve(asset: string): { dir: string; name: string; type: string } | null {
  if ((CONTENT_TYPES as Record<string, string>)[asset]) {
    return { dir: CORE_DIR, name: asset, type: CONTENT_TYPES[asset] }
  }
  if ((WORKER_ASSETS as readonly string[]).includes(asset)) {
    return { dir: FFMPEG_DIR, name: asset, type: 'text/javascript; charset=utf-8' }
  }
  return null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> }
) {
  const { asset } = await params

  const file = resolve(asset)
  if (!file) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const absolute = path.join(process.cwd(), file.dir, file.name)
    const bytes = await fs.readFile(absolute)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.type,
        // Immutable: the versions are pinned by package.json, so a new version
        // means a new deployment and a new URL.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Media engine asset unavailable', { status: 404 })
  }
}