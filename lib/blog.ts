/**
 * The blog.
 *
 * One source of truth for the post list, the post pages and the sitemap, in the
 * same spirit as `lib/tools.ts`: when the header, the footer, the index and the
 * sitemap each built their own list, they drifted. A post now exists in exactly
 * one place.
 *
 * Design note: this must stay server-safe. No `'use client'`, no DOM.
 */

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; title: string; text: string }
  | { type: 'figure'; figure: FigureId; caption: string }

export type FigureId = 'pipeline' | 'sizebars' | 'qualitycurve' | 'dataflow' | 'formattree'

export interface BlogPost {
  slug: string
  title: string
  description: string
  /** ISO date, used for `datePublished` and the byline. */
  date: string
  readingTime: string
  figure: FigureId
  body: Block[]
  seoTitle?: string
  seoDescription?: string
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-browser-compression-works',
    title: 'How compression actually happens in your browser',
    description:
      'From the moment you drop a file to the moment you download the result, every step runs on your own device. Here is the real pipeline, without the marketing.',
    date: '2026-09-04',
    readingTime: '6 min',
    figure: 'pipeline',
    seoDescription:
      'A walkthrough of the real client-side compression pipeline: magic-byte validation, worker and WebAssembly engines, and why no step needs a server.',
    body: [
      {
        type: 'p',
        text: 'Most "compress this file" tools send your file somewhere, compress it, and send it back. This one does not, and the difference is architectural rather than a promise: there is no code path that could upload your file, because none was written.',
      },
      {
        type: 'h2',
        text: 'Step one: the file is checked before anything is processed',
      },
      {
        type: 'p',
        text: 'The first thing that happens is not compression. Before an encoder is even loaded, the file is inspected: its size is checked against the limit for that tool, and its first bytes are compared against known file signatures — the PNG magic number, the JPEG SOI marker, the ZIP local file header.',
      },
      {
        type: 'p',
        text: 'This matters more than it sounds. A file called photo.jpg could be anything. Renaming a program to .jpg is trivial, and a tool that trusts the extension will happily hand it to a decoder. Checking the actual bytes is what makes "this looks like a PDF, which this tool does not support" a real answer rather than a guess.',
      },
      {
        type: 'h2',
        text: 'Step two: an engine is loaded, and only the one you need',
      },
      {
        type: 'p',
        text: 'Image work runs in a Web Worker, so a large encode does not freeze the page. Video, audio and GIF work uses a WebAssembly build of FFmpeg — roughly 30 MB of code, downloaded once and cached, and never loaded on a page you are not using it on.',
      },
      {
        type: 'p',
        text: 'None of that engine code is fetched until you actually start a job. A page view costs you the site\'s own JavaScript and nothing else. The distinction matters for the same reason the compression does: the work happens on your machine, and the code that does it is only ever code.',
      },
      { type: 'figure', figure: 'pipeline', caption: 'The full path of a file, from selection to download.' },
      {
        type: 'h2',
        text: 'Step three: the output is a real file, or an honest failure',
      },
      {
        type: 'p',
        text: 'When the encoder finishes, you get a Blob — an actual file in memory, with a real byte count and a real MIME type. If the result came out larger than the input, the tool says so in words rather than presenting a bigger file as a success.',
      },
      {
        type: 'p',
        text: 'Some outputs are validated before you are offered them. A compressed PDF is parsed again and its page count compared against the original; if the round trip does not hold, you get an error instead of a broken download. ZIP entries are checked for path traversal before a single byte is written to disk.',
      },
      {
        type: 'callout',
        title: 'The whole point',
        text: 'No step in that pipeline needs a server. That is not a feature toggle — it is the reason the tools are built this way.',
      },
    ],
  },

  {
    slug: 'honest-file-size-reporting',
    title: 'Why a good compressor tells you when it did not compress',
    description:
      'Some files genuinely cannot be made smaller. Reporting that accurately is harder than reporting a fake percentage — and far more useful.',
    date: '2026-09-08',
    readingTime: '5 min',
    figure: 'sizebars',
    seoDescription:
      'Why honest file-size reporting matters: what happens when compression makes a file bigger, and why saying so is more useful than a flattering number.',
    body: [
      {
        type: 'p',
        text: 'Try compressing a file that is already optimally compressed. Nothing happens. The bytes are already arranged as well as the format allows, so any re-encode is a fresh encoding of the same picture — and a fresh encoding is very often slightly larger than the one you already had.',
      },
      {
        type: 'p',
        text: 'This is the moment where most tools start lying. They report a percentage, the percentage is negative or zero, and the user is left holding a bigger file and a number that does not mean what they think it means.',
      },
      { type: 'figure', figure: 'sizebars', caption: 'Three outcomes. Only the first is a saving, and it is the only one worth celebrating.' },
      {
        type: 'h2',
        text: 'Three outcomes, not one',
      },
      {
        type: 'p',
        text: 'Every result here is described in the same line, with both real sizes and a percentage, because a percentage alone hides the absolute numbers. What changes is the wording:',
      },
      {
        type: 'ul',
        items: [
          'Genuinely smaller — "12.40 MB → 4.80 MB · 61% smaller". A real saving, stated plainly.',
          'The same size — "1.30 KB → 1.30 KB · no size change". Not a failure, but not a win either, and worth saying.',
          'Larger — "828 B → 847 B · 2% larger than the original", plus a sentence explaining whether that is expected.',
        ],
      },
      {
        type: 'h2',
        text: 'The distinction that matters: compressor or converter',
      },
      {
        type: 'p',
        text: 'A file coming out larger is not always bad news. It depends entirely on what the tool was asked to do. An image compressor that returns a bigger file is telling you the original was already efficient. A converter that rasterises a vector into a bitmap is supposed to return a bigger file — you asked for a different format, and a different format has a different size.',
      },
      {
        type: 'p',
        text: 'Conflating those two cases is how you end up with a tool that claims your PDF-to-images conversion "failed to compress". It did not fail. It did what you asked, and the honest description depends on which job it was doing.',
      },
      {
        type: 'callout',
        title: 'The rule',
        text: 'Never present growth as a saving. If the output is larger, say it is larger, and say whether that was expected.',
      },
      {
        type: 'h2',
        text: 'What this is worth to you',
      },
      {
        type: 'p',
        text: 'A number you can trust is worth more than a number that flatters the tool. If every result reads 60% smaller regardless of input, then the one time you need the real answer — the file that is already optimal — you have no way to get it.',
      },
    ],
  },

  {
    slug: 'choosing-a-compression-mode',
    title: 'Recommended or Maximum: what the two modes actually change',
    description:
      'The two presets differ in more than aggressiveness. Here is exactly what each one does to your file, and when the difference is worth it.',
    date: '2026-09-12',
    readingTime: '6 min',
    figure: 'qualitycurve',
    seoDescription:
      'What the Recommended and Maximum compression modes actually do: quality settings, the 3200px and 1920px dimension caps, and when to use the target-size search.',
    body: [
      {
        type: 'p',
        text: 'Most compressors offer a quality slider and expect you to guess. These two modes are not a slider — they are two specific, documented configurations, and knowing which one you are getting is most of the value.',
      },
      { type: 'figure', figure: 'qualitycurve', caption: 'The trade-off the presets are choosing from. The knee is where quality starts costing you visibly.' },
      {
        type: 'h2',
        text: 'Recommended: balanced quality, capped at 3200px',
      },
      {
        type: 'p',
        text: 'Images are re-encoded at a quality around 0.82, and the longest edge is capped at 3200 pixels. That cap is the part people miss. A 6000px camera original is not re-encoded at 6000px and called compressed; it is downscaled first, which is where most of the saving on a large photo actually comes from.',
      },
      {
        type: 'p',
        text: 'Images already smaller than the cap are left at their original dimensions. Nothing is upscaled, because enlarging a photo to hit a target would cost you sharpness and buy you nothing.',
      },
      {
        type: 'h2',
        text: 'Maximum: 0.6 quality, capped at 1920px',
      },
      {
        type: 'p',
        text: 'Harder compression and a smaller dimension cap. On an ordinary photograph the difference between the two modes is usually a factor of three or four in file size, and the quality difference is visible if you look for it — which is why this mode is not the default.',
      },
      {
        type: 'p',
        text: 'Maximum mode is for files that have to fit somewhere: an upload limit, an email attachment ceiling, a form with a hard cap. It is the right mode when the constraint is real and the image is going to be viewed at thumbnail size anyway.',
      },
      {
        type: 'h2',
        text: 'The target-size search',
      },
      {
        type: 'p',
        text: 'Maximum mode also unlocks an optional "compress to exactly N KB" field. If you fill it in, the tool does not guess a quality — it runs a real binary search, encoding the image repeatedly at different quality settings and measuring each result against your byte target, keeping the highest quality that still fits.',
      },
      {
        type: 'p',
        text: 'If even the lowest quality overshoots your target, you get the smallest real encode it could produce and an explicit note saying the target was not met. It does not pad the file, truncate it, or quietly drop the constraint to make the number work.',
      },
      {
        type: 'callout',
        title: 'Which should you use?',
        text: 'Recommended unless you have a specific size constraint. If a 300 KB photo is genuinely too big, switch to Maximum and set the target — the search will get you closer than any fixed preset.',
      },
      {
        type: 'h2',
        text: 'What the modes do not do',
      },
      {
        type: 'p',
        text: 'Neither mode strips metadata for the purpose of shrinking the file, and neither fakes progress. If a stage cannot report a real percentage, you see the stage name instead of a number that is counting up on a timer.',
      },
    ],
  },

  {
    slug: 'what-privacy-claim-really-means',
    title: 'What "your file never leaves your device" does and does not cover',
    description:
      'A precise account of the privacy claim: what never happens, what is still fetched from the network, and how to verify it yourself.',
    date: '2026-09-16',
    readingTime: '7 min',
    figure: 'dataflow',
    seoDescription:
      'A precise breakdown of the browser-side privacy claim: which network requests never happen, which third-party requests still occur, and how to check.',
    body: [
      {
        type: 'p',
        text: '"Your files are never uploaded" is a strong claim, and strong claims deserve a precise reading. Here is exactly what it covers, what it does not, and how you can check the second one yourself.',
      },
      { type: 'figure', figure: 'dataflow', caption: 'Your file has one path. The code that touches it has several.' },
      {
        type: 'h2',
        text: 'What the claim covers',
      },
      {
        type: 'p',
        text: 'When you add a file, it is read into the memory of your browser tab and processed there. The result is produced there and handed back to you as a download. At no point does a request carrying your file leave the page — there is no upload endpoint on this site to send it to.',
      },
      {
        type: 'p',
        text: 'This is a statement about the architecture, not a policy. There is no setting you can enable that would start uploading, and no legal arrangement that permits it. The only way your file could be transmitted is if a user were browsing with third-party JavaScript injected into the page by something other than us.',
      },
      {
        type: 'h2',
        text: 'What still happens over the network',
      },
      {
        type: 'p',
        text: 'Two things, neither of which involves your file:',
      },
      {
        type: 'ul',
        items: [
          'Web fonts are loaded from Google Fonts. Your browser makes a request to Google that includes your IP address, exactly as it would for any third-party asset. No file content is involved. A content blocker stops the fonts and the site still works.',
          'Processing engines are downloaded from this site on first use — the FFmpeg WebAssembly build for media, the image encoder for photographs. Those are program files, served from this origin, and they are code rather than data.',
        ],
      },
      {
        type: 'h2',
        text: 'Where your file actually lives',
      },
      {
        type: 'p',
        text: 'In the tab, as memory buffers, and as temporary object URLs that make downloads possible. When you remove a file, finish a download, or close the tab, the browser reclaims that memory.',
      },
      {
        type: 'p',
        text: 'Nothing is written to localStorage, IndexedDB, the Cache API, or cookies. The only persistent state is the browser\'s own caching of the engine files, which holds program code and never your data. Clearing your browser data is not necessary for your files, because none of them were persisted anywhere.',
      },
      {
        type: 'callout',
        title: 'The consequence worth knowing',
        text: 'Because nothing is stored, nothing is recoverable. If a result is wrong or your browser crashes mid-process, the original file is the only copy. Keep a backup of anything you cannot re-download.',
      },
      {
        type: 'h2',
        text: 'How to check it yourself',
      },
      {
        type: 'p',
        text: 'Open your browser\'s developer tools, switch to the Network tab, and compress a file. Every request you see will be for the page, its own JavaScript and CSS, the fonts, and the engine files. Nothing in that list will be your file, because the request that would carry it does not exist in this codebase.',
      },
      {
        type: 'p',
        text: 'That is the difference between a privacy policy and a privacy architecture. A policy tells you what someone promises not to do. An architecture makes the thing impossible to do.',
      },
    ],
  },

  {
    slug: 'compressing-files-for-the-web',
    title: 'Compressing files for the web: what the numbers actually look like',
    description:
      'Measured results from real files, and a format decision guide you can apply to your own uploads and assets.',
    date: '2026-09-20',
    readingTime: '6 min',
    figure: 'formattree',
    seoDescription:
      'Real measured compression results across image, audio and PDF formats, plus a practical guide to choosing the right format for web delivery.',
    body: [
      {
        type: 'p',
        text: 'Compression advice is usually given as a rule of thumb about quality. This is measured instead: real files, real encoders, real output sizes, run through the same tools this site uses.',
      },
      { type: 'figure', figure: 'formattree', caption: 'Start from what the file is for, not from its extension.' },
      {
        type: 'h2',
        text: 'Images',
      },
      {
        type: 'p',
        text: 'A 1000×600 photograph of dense noise — close to a worst case, because noise is expensive to encode — came down from 405 KB to 308 KB in Recommended mode, about 24%. The same content as PNG went from 13.8 KB to 2.5 KB, because a synthetic gradient PNG compresses extremely well.',
      },
      {
        type: 'p',
        text: 'That spread is the honest picture: how much you save depends almost entirely on what is in the file. A real photograph has a reasonable range. A file that is already heavily compressed has almost nothing left to give.',
      },
      {
        type: 'h2',
        text: 'Audio',
      },
      {
        type: 'p',
        text: 'A 32 KB WAV — two seconds of 440 Hz tone, uncompressed PCM — became an 18 KB MP3 at 192 kbps, 41% smaller. That number is unusually favourable because tonal audio is easy to encode. Speech and music behave differently, and a 320 kbps source will not shrink at all, however hard you push it.',
      },
      {
        type: 'h2',
        text: 'PDFs',
      },
      {
        type: 'p',
        text: 'A three-page text PDF went from 1,358 to 1,245 bytes, about 8%. Small, but real: the saving comes from stripping document metadata and rewriting the file structure, not from degrading anything. A PDF that is already optimised may come out the same size or marginally larger, and the tool will tell you that rather than damaging the document to improve the number.',
      },
      {
        type: 'callout',
        title: 'For substantial PDF reductions',
        text: 'Rasterising pages at a lower DPI is the usual answer. This tool deliberately does not do it, because it visibly degrades text quality — and a document you cannot read is not smaller in any sense that matters.',
      },
      {
        type: 'h2',
        text: 'Choosing a format',
      },
      {
        type: 'ul',
        items: [
          'Photographs and illustrations on a page: WEBP, or JPG if you need very broad support. Both are dramatically smaller than PNG at photographic quality.',
          'Screenshots, diagrams, anything with flat colour and hard edges: PNG. Lossless, and the reason a flat graphic can look crisper than a lossy format at the same size.',
          'Anything with transparency: PNG or WEBP. JPG has no alpha channel and will flatten transparency to a solid colour.',
          'Video for the web: H.264 in an MP4 container. It is the combination browsers can actually play.',
          'Audio for the web: MP3. It is the one lossy format with universal support.',
        ],
      },
      {
        type: 'p',
        text: 'One caveat that applies to all of it: if a file is already in the right format and reasonably optimised, there is very little left to do. Running it through a compressor anyway will cost you a little quality and hand you back a slightly larger file. Knowing when not to compress is part of knowing how to compress.',
      },
    ],
  },
]

const bySlug = new Map(BLOG_POSTS.map((post) => [post.slug, post]))

export function getPost(slug: string): BlogPost | undefined {
  return bySlug.get(slug)
}

export function allPostSlugs(): string[] {
  return BLOG_POSTS.map((post) => post.slug)
}

/** Newest first — the order both the index and the "recent posts" list use. */
export function postsByDate(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date))
}
