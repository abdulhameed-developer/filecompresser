import Link from 'next/link'
import FeaturedGuides from '@/components/FeaturedGuides'
import ProcessingStory from '@/components/ProcessingStory'
import Icon from '@/components/Icon'
import { postsByDate } from '@/lib/blog'
import HomeCompress from '@/components/HomeCompress'
import {
  faqJsonLd,
  DEFAULT_SITE_TITLE,
  DEFAULT_DESCRIPTION,
  pageMetadata,
  jsonLdScript,
  organizationJsonLd,
  websiteJsonLd,
} from '@/lib/seo'
import ToolDirectory from '@/components/ToolDirectory'
import type { Metadata } from 'next'
import EditorialContent from '@/components/EditorialContent'
import { getHomeContent, resolveEditorialFaq } from '@/lib/content'

export function generateMetadata(): Metadata {
  const content = getHomeContent()
  return pageMetadata({ title: content.seoTitle ?? DEFAULT_SITE_TITLE, description: content.seoDescription ?? DEFAULT_DESCRIPTION, path: '/', absoluteTitle: true })
}

const FAQ = [
  {
    q: 'Are my files uploaded to a server?',
    a: 'No. Every tool on this site reads your file into the browser tab and processes it on your own device. Nothing is sent to filecompresser servers, and nothing is kept after you close the tab.',
  },
  {
    q: 'Which file types can I process?',
    a: 'Image compression (JPG, PNG, WEBP), GIF optimization, MP3 re-encoding, WAV to MP3, video re-encoding to MP4, PDF optimization, and ZIP creation and extraction. Processing runs on your device, and each tool explains whether it compresses, converts, packages or extracts files.',
  },
  {
    q: 'Why might my file not get smaller?',
    a: 'Compression depends on the input and the selected settings. Most PDFs and already-compressed images have little left to give. We report the real sizes either way — no tool here truncates bytes, renames a file, or returns the original while calling it compressed.',
  },
  {
    q: 'Is anything limited or paid?',
    a: 'No account, no sign-up, no watermark. Queues are limited to 500 files and 300 MB to protect browser memory. The practical limits are your device’s memory, which is why each tool states its maximum file size up front.',
  },
  {
    q: 'Why does the first video take so long?',
    a: 'Video, audio and GIF tools load a WebAssembly build of FFmpeg from this site on first use — about 21 MB, cached by your browser afterwards. Later jobs can reuse the loaded engine while the tab remains open.',
  },
]

export default function HomePage() {
  const homeContent = getHomeContent()
  const faq = resolveEditorialFaq(homeContent, FAQ)
  const hero = homeContent.hero ?? { lead: 'Smaller files.', emphasis: 'On your device.', description: 'Compress images, video, audio, GIFs, PDFs and ZIP archives with real encoders, running entirely on your device. No uploads, no accounts, no watermarks.' }
  const structuredData = [websiteJsonLd(), organizationJsonLd(), ...(faq.length ? [faqJsonLd(faq)] : [])]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      {/* The root layout owns the single <main id="main"> landmark. */}
      <div className="homePage">
        <section className="hero">
          <div className="eyebrow">
            <span className="spark" aria-hidden="true">
              <Icon name="spark" />
            </span>{' '}
            Real compression. In your browser.
          </div>

          <h1>
            {hero.lead} <em>{hero.emphasis}</em>
          </h1>

          <p>
            {hero.description}
          </p>

          <div className="heroTrust">
            <span><Icon name="check" />No sign-up</span>
            <span><Icon name="shield" />Files stay on your device</span>
            <span><Icon name="check" />Clear size comparisons</span>
          </div>
          <nav className="heroToolLinks" aria-label="Popular tools">
            <Link href="/image-compressor"><Icon name="image" />Images</Link>
            <Link href="/video-compressor"><Icon name="media" />Video</Link>
            <Link href="/pdf-compressor"><Icon name="file" />PDF</Link>
            <Link href="/zip-compressor"><Icon name="archive" />ZIP</Link>
          </nav>
        </section>

        <HomeCompress />

        <section
          className="formatsSection"
          id="tools"
          aria-labelledby="tools-heading"
        >
          <div className="sectionHeading"><div><span className="sectionLabel">YOUR FILE TOOLKIT</span><h2 id="tools-heading">The right tool. One click away.</h2></div><a className="tertiaryAction" href="#how">How it works<Icon name="arrow" /></a></div>

          <ToolDirectory />
        </section>

        <ProcessingStory steps={homeContent.steps} />
        <EditorialContent content={homeContent} />
        <FeaturedGuides posts={postsByDate().slice(0, 3).map(({ slug, title, figure, readingTime, featuredImage }) => ({ slug, title, figure, readingTime, featuredImage }))} />

        {faq.length > 0 && <section className="homeFaq" aria-labelledby="faq-heading">
          <div className="sectionLabel">FAQ</div>
          <h2 id="faq-heading">Common questions</h2>
          <div className="faqList">
            {faq.map((entry) => (
              <details key={entry.q}>
                <summary><span>{entry.q}</span><Icon name="chevron" /></summary>
                <p>{entry.a}</p>
              </details>
            ))}
          </div>
        </section>}
      </div>
    </>
  )
}
