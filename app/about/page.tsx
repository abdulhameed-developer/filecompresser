import type { Metadata } from 'next'
import Link from 'next/link'
import { TOOL_GROUPS, toolsInGroup } from '@/lib/nav'
import { POLICY_REVIEWED, absoluteUrl, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from '@/lib/seo'

const DESCRIPTION =
  'What filecompresser is, how browser-based processing works, what the tools genuinely do, and where their honest limits are.'

export const metadata: Metadata = {
  title: 'About',
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/about') },
}

const structuredData = [
  webPageJsonLd({
    name: 'About filecompresser',
    description: DESCRIPTION,
    path: '/about',
    dateModified: POLICY_REVIEWED,
  }),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
  ]),
]

const FACTS = [
  {
    title: 'Files never leave your device',
    body: 'Every tool reads your file into the browser tab, processes it there, and hands the result back. There is no upload endpoint on this site, so there is nothing for a file to be sent to. The claim is a property of the architecture, not a promise.',
  },
  {
    title: 'The encoders are real',
    body: 'Images go through a real codec in a Web Worker. Video, audio and GIF work uses a WebAssembly build of FFmpeg, downloaded from this site on first use and never given your file. PDFs are re-parsed after writing and their page count checked before you are offered the result.',
  },
  {
    title: 'Sizes are reported honestly',
    body: 'When a file cannot be made smaller, the tools say so. If an output comes out larger, that is stated in words and explained — whether it means the original was already efficient or the format genuinely changed. Nothing is truncated, padded or renamed to improve a number.',
  },
  {
    title: 'No account, no watermark, no cap',
    body: 'There is no sign-up, nothing to install, and no file-count limit. The practical constraint is your device\'s memory, which is why every tool states its maximum file size up front rather than failing halfway through a large file.',
  },
]

export default function AboutPage() {
  const total = TOOL_GROUPS.reduce((sum, group) => sum + toolsInGroup(group).length, 0)

  return (
    <div className="legal aboutPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">About</span>
      </nav>

      <h1>About filecompresser</h1>
      <p className="legalUpdated">
        {total} tools that compress and repackage files — images, GIF, video, audio, PDF and ZIP —
        entirely inside your browser.
      </p>

      <section>
        <h2>What this site is</h2>
        <p>
          A set of file utilities with one shared design constraint: the processing happens on your
          device. That single decision shapes everything else. It is why the tools are fast after
          the first load, why there is no queue and no wait, why there is nothing to sign up for,
          and why the privacy claim is structural rather than aspirational.
        </p>
        <p>
          It also has a cost, and it is worth being straight about it. A browser tab has less memory
          than a desktop application and less again on a phone. Very large videos and PDFs can
          exhaust what a browser will give a single page. When that happens you get a clear error
          and your original is untouched — which is a worse experience than a server that quietly
          handles it, and a better one than a server holding your file.
        </p>
      </section>

      <section>
        <h2>Four things worth knowing</h2>
        <div className="aboutFacts">
          {FACTS.map((fact) => (
            <div key={fact.title}>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>How a file is handled</h2>
        <p>
          When you add a file it is checked before anything is processed: its size against that
          tool&apos;s limit, and its first bytes against known file signatures. Renaming a program
          to &quot;.jpg&quot; is trivial, and a tool that trusts the extension will hand it straight
          to a decoder. Checking the actual bytes is what makes a rejection a real answer.
        </p>
        <p>
          Only then does an engine load. Image work runs in a Web Worker so a large encode does not
          freeze the page. Media work loads a WebAssembly build of FFmpeg, about 30 MB, once and
          then cached. Pages you are not using those tools on never download them.
        </p>
      </section>

      <section>
        <h2>What we will not do</h2>
        <p>
          No fake progress bars. Percentages come from the encoder reporting bytes written, and
          where a stage cannot report a real percentage you see the stage name instead of a number
          counting up on a timer. No fake compression: a tool that cannot make a file smaller says
          so rather than renaming a file, truncating it, or handing back the original and calling
          it compressed.
        </p>
        <p>
          We also do not present a &quot;convert&quot; that is really a rename. Every tool here runs a
          real encoder and produces a real file you can open.
        </p>
      </section>

      <section>
        <h2>The tools</h2>
        <div className="aboutToolGroups">
          {TOOL_GROUPS.map((group) => (
            <div key={group.key}>
              <h3>{group.title}</h3>
              <p className="aboutBlurb">{group.blurb}</p>
              <ul>
                {toolsInGroup(group).map((tool) => (
                  <li key={tool.slug}>
                    <Link href={`/${tool.slug}`}>{tool.title}</Link>
                    <span>{tool.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Reading further</h2>
        <p>
          The <Link href="/blog">blog</Link> goes into the mechanics: how the client-side pipeline
          works, why honest size reporting is harder than a flattering percentage, and what the
          measured results actually look like.
        </p>
        <p>
          For the specifics, the <Link href="/privacy">privacy policy</Link> covers what is and is
          not sent anywhere, the <Link href="/disclaimer">disclaimer</Link> covers where the tools
          stop working, and the <Link href="/terms">terms</Link> cover the rules for using them.
        </p>
      </section>
    </div>
  )
}
