# FileCompresser.com

Private, browser-based file compression.

Website: [https://filecompresser.com](https://filecompresser.com)

## Overview

FileCompresser processes files **in your browser**. No supported tool uploads your
files to a server — there is no upload endpoint in this codebase, so there is
nothing for a file to be sent to. Heavy engines (the FFmpeg WebAssembly build
and the image encoder) are lazy-loaded only on the pages that need them and are
served from this site's own origin.

## Tools

### Compression

| Tool | Route | What it actually does |
| --- | --- | --- |
| Compress Any File | `/compress` | Detects the format and routes to the right engine |
| Image Compressor | `/image-compressor` | Real codec encode, JPG/PNG/WEBP |
| JPG Compressor | `/jpg-compressor` | Re-encodes JPEG (also serves `/wav-to-mp3`-style aliases) |
| JPEG Compressor | `/jpeg-compressor` | Same engine, distinct landing page |
| PNG Compressor | `/png-compressor` | Preserves transparency |
| WEBP Compressor | `/webp-compressor` | Re-compresses WEBP |
| GIF Compressor | `/gif-compressor` | Re-quantizes every frame via FFmpeg |
| Video Compressor | `/video-compressor` | H.264 + AAC in MP4, with a resolution cap |
| MP3 Compressor | `/mp3-compressor` | Re-encodes at a chosen bitrate |
| WAV to MP3 | `/wav-compressor` | A format conversion, not lossless compression |
| PDF Compressor | `/pdf-compressor` | Strips metadata, rewrites structure, validates the output |
| ZIP Creator | `/zip-compressor` | Builds an archive from any files |
| ZIP Extractor | `/archive-compressor` | Extracts with traversal and bomb protection |

### Also on the site

- `/about` — what the site is, how a file is handled, and where the limits are
- `/blog` — five posts on the mechanics, with diagrams
- `/privacy`, `/terms`, `/disclaimer`, `/contact`, `/sitemap`

### Deliberately not offered

The converter tools (image format conversion, HEIC, SVG, PDF→JPG, images→PDF,
audio extraction) were removed. They worked, but the product is compression;
keeping them made the site read as a generic file utility. The engine code that
only they used was removed with them, along with the `heic2any` and `pdfjs-dist`
dependencies.

## Architecture

```
app/                 Next.js App Router pages; one header and footer, in layout
  blog/              Blog index and posts
  [tool]/            Tool page, generated from the registry
  ffmpeg-core/       Serves the WASM core and its worker module
  image-worker/      Serves the image encoder's Web Worker
components/          Dropzone, queue, workspace, chrome
lib/
  engines/           image, gif, video, audio, pdf, zip
  ffmpeg/loader.ts   Lazy, memoised FFmpeg WASM loader
  validation.ts      Magic-byte validation + archive path safety
  process.ts         Engine dispatcher
  useFileQueue.ts    Batch queue: validate -> process -> download
  tools.ts           Tool registry — the single source of truth
  nav.ts             Navigation: groups, header/footer link lists
  blog.ts            Blog posts, same one-source-of-truth pattern
scripts/             QA tooling (see below)
tests/               Unit tests (vitest)
```

### Processing states

`validating` → `queued` → `processing` → `completed` | `failed` | `cancelled`

Concurrency: 2 for image work, 1 for FFmpeg, PDF and ZIP.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run verify     # lint, typecheck, tests, audit, build
```

The browser-driven audits are what catch the defects unit tests cannot see —
scroll positions, off-centre sections, overflowing menus, contrast failures.
They need Chrome and `playwright-core`, installed **outside** the project
because they are QA tooling and not something the site ships:

```bash
mkdir -p ~/pwtools && cd ~/pwtools && npm install playwright-core omggif
bash scripts/verify.sh
```

`verify.sh` builds, starts a server, and **refuses to audit a stale one** — it
compares the content-hashed stylesheet on disk against the one being served.

| Script | Checks |
| --- | --- |
| `route-crawl.mjs` | Status, metadata, canonicals, sitemap, internal links |
| `navigation-audit.mjs` | Header/footer/menu navigation and scroll restoration |
| `responsive-audit.mjs` | 10 widths × 12 routes: overflow, touch targets, dropdown |
| `role-audit.mjs` | Security headers, path traversal, contrast, payload weight |
| `a11y-manual-audit.mjs` | Keyboard operation, 400% reflow, motion, target size |
| `functionality-audit.mjs` | Real files through the real engines, end to end |
| `make-logo.py` | Rebuilds `public/logo*.png` from the source wordmark |
| `make-gif.mjs` | Builds the animated GIF fixture |

### QA fixtures

The functionality audit needs real files served from `public/`. They are QA
assets and are **never site content**:

```bash
PW_TOOLS=~/pwtools node scripts/make-gif.mjs
COPY_TO_PUBLIC=1 node scripts/make-fixtures.mjs
```

`verify.sh` removes them again afterwards and fails if any remain, so a passing
run always leaves `public/` deployable. `.gitignore` also excludes them.

## CI/CD

- `.github/workflows/ci.yml` — runs `verify.sh` on every push and pull request,
  so no regression can merge.
- `.github/workflows/deploy.yml` — runs only after CI passes, builds once, and
  refuses to deploy if QA fixtures are present. Set a `DEPLOY_COMMAND` repository
  variable to point it at a host; without one it validates and stops rather than
  pretending to have deployed.

## Environment variables

- `NEXT_PUBLIC_SITE_URL` — canonical origin (defaults to `https://filecompresser.com`)
- `PORT` — port for `verify.sh` (defaults to 3000)
- `PW_TOOLS` — directory containing `playwright-core`

## Known limitations

- **Legal pages have not been reviewed by a lawyer.** They describe the software
  accurately and say so on the page. Review them before relying on them.
- **Accessibility is not WCAG-certified.** The mechanical checks pass, but
  automated tooling covers roughly a third of WCAG. Screen-reader testing with a
  real user is still outstanding; `a11y-manual-audit.mjs` prints the checklist.
- **Dev-dependency advisories.** `eslint-config-next` is pinned to v15 while
  Next is v16, because v16 dropped the `FlatCompat` API this config uses.
  Production dependencies audit clean.
- Large videos may exhaust browser memory. The tools say so rather than failing
  silently.
- The first media job downloads the FFmpeg core (~30 MB) from this site.
  Engine code only — never your file.

## License

Private project — all rights reserved unless otherwise stated.