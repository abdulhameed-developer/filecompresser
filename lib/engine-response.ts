import { createHash } from 'node:crypto'

/** Public engine code can be cached, but stable URLs must detect new deployments. */
export function engineResponse(
  request: Request,
  bytes: Uint8Array,
  contentType: string,
): Response {
  const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    ETag: etag,
  }
  const matches = request.headers
    .get('if-none-match')
    ?.split(',')
    .some((value) => {
      const candidate = value.trim()
      return (
        candidate === etag || candidate === `W/${etag}` || candidate === '*'
      )
    })
  return new Response(matches ? null : bytes, {
    status: matches ? 304 : 200,
    headers,
  })
}
