import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import './product-system.css'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import ScrollRestoration from './scroll-restoration'
import {
  DEFAULT_DESCRIPTION,
  SITE_TAGLINE,
  SITE_URL,
  SITE_INDEXABLE,
  SITE_WORDMARK,
  SITE_NAME,
  SITE_TITLE_SUFFIX,
  DEFAULT_SOCIAL_IMAGE,
  DEFAULT_SOCIAL_IMAGE_ALT,
  DEFAULT_SOCIAL_DIMENSIONS,
  ORGANIZATION_NAME,
  SEARCH_VERIFICATION,
  absoluteUrl,
} from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_WORDMARK} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_TITLE_SUFFIX}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_WORDMARK,
  authors: [{ name: ORGANIZATION_NAME }],
  creator: SITE_WORDMARK,
  publisher: ORGANIZATION_NAME,
  verification: SEARCH_VERIFICATION,
  formatDetection: { telephone: false, address: false, email: false },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_WORDMARK} — ${SITE_TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: absoluteUrl(DEFAULT_SOCIAL_IMAGE), ...DEFAULT_SOCIAL_DIMENSIONS, alt: DEFAULT_SOCIAL_IMAGE_ALT }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_WORDMARK} — ${SITE_TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: absoluteUrl(DEFAULT_SOCIAL_IMAGE), alt: DEFAULT_SOCIAL_IMAGE_ALT }],
  },
  robots: {
    index: SITE_INDEXABLE,
    follow: true,
    googleBot: { index: SITE_INDEXABLE, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#163b31',
  width: 'device-width',
  initialScale: 1,
  // Zoom is left enabled deliberately; disabling it breaks WCAG 1.4.4.
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skipLink" href="#main">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        {/* `useSearchParams` suspends during static generation, so the
            navigation handler sits behind a boundary. It renders nothing. */}
        <Suspense fallback={null}>
          <ScrollRestoration />
        </Suspense>
      </body>
    </html>
  )
}
