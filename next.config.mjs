/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const enforceHttps = process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://') === true

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; 'unsafe-inline' is required for
  // the App Router to hydrate. 'wasm-unsafe-eval' is required for WebAssembly,
  // which FFmpeg and pdf-lib use. No remote script origins: the FFmpeg core is
  // served from our own origin.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} 'wasm-unsafe-eval' blob:`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  // blob: is required because @ffmpeg/ffmpeg creates its worker and fetches
  // the engine from in-memory blob URLs.
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(enforceHttps ? ['upgrade-insecure-requests'] : []),
].join('; ')

export const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // None of these tools use a camera, microphone or geolocation.
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // Defence in depth alongside the CSP's frame-ancestors.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
]

if (!isDev && enforceHttps) {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  })
}

const nextConfig = {
  // Every route is generated at build time; no paid Node.js hosting is needed.
  output: 'export',
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // The locked TypeScript 5 compiler supports the in-process API. Avoid a
  // second CLI process while retaining Next's full build-time type checking.
  experimental: { useTypeScriptCli: false },
}

export default nextConfig
