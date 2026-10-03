import { ImageResponse } from 'next/og'
import { SITE_WORDMARK } from '@/lib/seo'

/**
 * Social preview image, generated at build time.
 *
 * Previously this pointed at a checked-in `public/og-image.png` that was never
 * committed, so every shared link rendered with no image at all. Generating it
 * here means the asset can never drift from the branding again.
 */
export const alt = 'filecompresser — compress and convert files privately in your browser'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 90,
          background: '#163b31',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: 30,
            color: '#c9ed4b',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          <span>Private, browser-based tools</span>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 92,
            fontWeight: 800,
            letterSpacing: -4,
            marginTop: 30,
            lineHeight: 1.05,
          }}
        >
          Make your files smaller.
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 38,
            color: '#b3c4bb',
            marginTop: 34,
            lineHeight: 1.4,
            maxWidth: 900,
          }}
        >
          Compress images, video, audio, GIFs, PDFs and ZIPs on your own device.
        </div>

        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 52,
            fontSize: 26,
            color: '#c9ed4b',
          }}
        >
          <span>Never uploaded</span>
          <span>No sign-up</span>
          <span>Real progress</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 26,
            fontWeight: 700,
            color: '#ffffff',
            opacity: 0.75,
          }}
        >
          {SITE_WORDMARK}.com
        </div>
      </div>
    ),
    size
  )
}