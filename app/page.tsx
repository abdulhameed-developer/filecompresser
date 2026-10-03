import Link from 'next/link'
import HomeCompress from '@/components/HomeCompress'
import { faqJsonLd, jsonLdScript, organizationJsonLd, websiteJsonLd } from '@/lib/seo'
import { TOOLS } from '@/lib/tools'
import { TOOL_GROUPS, toolsInGroup } from '@/lib/nav'

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Drop in your file',
    body: 'Drag it in or browse from your device. Add several at once and they process as a batch.',
  },
  {
    step: '02',
    title: 'Choose a setting',
    body: 'Recommended balances quality and size. Maximum pushes harder, and we always show what it actually cost you.',
  },
  {
    step: '03',
    title: 'Download the result',
    body: 'Save files one at a time, or grab everything as a ZIP. Nothing was uploaded to get here.',
  },
]

const FAQ = [
  {
    q: 'Are my files uploaded to a server?',
    a: 'No. Every tool on this site reads your file into the browser tab and processes it on your own device. Nothing is sent to filecompresser servers, and nothing is kept after you close the tab.',
  },
  {
    q: 'What actually works here?',
    a: 'Image compression (JPG, PNG, WEBP), GIF optimization, MP3 re-encoding, WAV to MP3, video re-encoding to MP4, PDF optimization, and ZIP creation and extraction. Every tool runs a real encoder on your device and produces a real, downloadable file.',
  },
  {
    q: 'Why might my file not get smaller?',
    a: 'Because it genuinely cannot, without losing data. Most PDFs and already-compressed images have little left to give. We report the real sizes either way — no tool here truncates bytes, renames a file, or returns the original while calling it compressed.',
  },
  {
    q: 'Is anything limited or paid?',
    a: 'No account, no sign-up, no watermark, no file-count cap. The practical limits are your device’s memory, which is why each tool states its maximum file size up front.',
  },
  {
    q: 'Why does the first video take so long?',
    a: 'Video, audio and GIF tools load a WebAssembly build of FFmpeg from this site on first use — about 30 MB, cached by your browser afterwards. Every later job on the page starts immediately.',
  },
]

export default function HomePage() {
  const structuredData = [websiteJsonLd(), organizationJsonLd(), faqJsonLd(FAQ)]

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
              ✦
            </span>{' '}
            Real compression. In your browser.
          </div>

          <h1>
            Make your files
            <br />
            <em>smaller.</em> Stay private.
          </h1>

          <p>
            Compress images, video, audio, GIFs, PDFs and ZIP archives with real encoders, running
            entirely on your device. No uploads, no accounts, no watermarks.
          </p>

          <div className="heroTrust">
            <span>✓ No sign-up</span>
            <span>✓ Files never uploaded</span>
            <span>✓ Honest size reporting</span>
          </div>
        </section>

        <HomeCompress />

        <section className="formatsSection" id="tools" aria-labelledby="tools-heading">
          <div className="sectionLabel">EVERY TOOL IS LIVE</div>
          <h2 id="tools-heading">
            {TOOLS.length} tools that
            <br />
            <em>actually process your file.</em>
          </h2>

          <div className="categoryGrid">
            {TOOL_GROUPS.map((group) => (
              <div className="category" key={group.key}>
                <div className="catHead">
                  <div className="catIcon" aria-hidden="true">
                    {group.icon}
                  </div>
                  <h3>{group.title}</h3>
                  <p className="catBlurb">{group.blurb}</p>
                </div>
                {toolsInGroup(group).map((tool) => (
                  <Link href={`/${tool.slug}`} key={tool.slug}>
                    <span>{tool.title}</span>
                    <small>{tool.description}</small>
                    <b aria-hidden="true">↗</b>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="honesty" aria-labelledby="honesty-heading">
          <div className="sectionLabel">WHAT WE WILL NOT DO</div>
          <h2 id="honesty-heading">
            No fake progress.
            <br />
            <em>No fake compression.</em>
          </h2>
          <div className="honestyGrid">
            <div>
              <h3>Progress is measured</h3>
              <p>
                Bars come from the encoder reporting bytes written, not a timer that always reaches
                100%. If a stage cannot report a percentage, we show the stage instead of inventing
                a number.
              </p>
            </div>
            <div>
              <h3>Output is validated</h3>
              <p>
                A PDF is re-parsed and its page count checked before you are offered it. A ZIP entry
                is vetted for path traversal before it is extracted. If a result would be broken, you
                get an error rather than a broken download.
              </p>
            </div>
            <div>
              <h3>Sizes are the real ones</h3>
              <p>
                When a file cannot be made smaller without losing data, the tool says so. Nothing
                here truncates bytes, swaps extensions without converting, or hands back the
                original pretending it was compressed.
              </p>
            </div>
          </div>

          {/*
            The header no longer carries homepage anchors, so the sections
            below need a way in from the page itself. This is a same-page
            anchor, so it is a plain `<a>`: using `Link` would push a history
            entry and is what previously produced stale scroll positions.
          */}
          <p className="sectionJump">
            <a href="#how">How it works →</a>
            <a href="#privacy">Why your file never leaves this tab</a>
          </p>
        </section>

        <section className="how" id="how" aria-labelledby="how-heading">
          <div className="sectionLabel">HOW IT WORKS</div>
          <h2 id="how-heading">Simple by design.</h2>
          <div className="steps">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step}>
                <b>{step.step}</b>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="privacySection" id="privacy" aria-labelledby="privacy-heading">
          <div>
            <div className="sectionLabel">PRIVACY</div>
            <h2 id="privacy-heading">
              Your file goes
              <br />
              <em>nowhere.</em>
            </h2>
          </div>
          <div className="privacyBody">
            <p>
              Every tool here is client-side. Your file is read into the browser tab, processed on
              your own CPU, and handed back to you. It is never transmitted to filecompresser or to
              any third party.
            </p>
            <p>
              Heavy engines — the FFmpeg WebAssembly build and the image encoder — are code, not
              your data. They are fetched from this site on first use and never receive your file.
            </p>
            <Link className="textLink" href="/privacy">
              Read the full privacy policy →
            </Link>
          </div>
        </section>

        <section className="homeFaq" aria-labelledby="faq-heading">
          <div className="sectionLabel">FAQ</div>
          <h2 id="faq-heading">Common questions</h2>
          <div className="faqList">
            {FAQ.map((entry) => (
              <details key={entry.q}>
                <summary>{entry.q}</summary>
                <p>{entry.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}