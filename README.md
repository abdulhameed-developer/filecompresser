# FileCompresser

Browser-based file compression and conversion with a Git-backed editorial CMS. GitHub stores source and content, Cloudflare Pages serves the static export, and TinaCloud authenticates editors. Current account, DNS and mailbox verification is recorded in [DNS and email](docs/DNS-AND-EMAIL.md); the [release review](docs/RELEASE-REVIEW.md) tracks launch prerequisites.

## Start here

Read [SEO and hosting setup](docs/SEO-AND-HOSTING.md) for the complete first-time setup, editor accounts/password recovery, GitHub publishing and custom domain instructions.

```sh
npm ci
npm run setup:cms
npm run dev:cms
```

Open http://localhost:3000/admin/index.html. The first CMS run generates `tina/tina-lock.json`. Commit that file and the dependency changes made by setup before connecting TinaCloud. Local editing has no login; hosted editing requires TinaCloud authentication. Production builds must use **npm run build:cms** with the account variables configured. Never publish a CMS built in local mode.

The CMS installer selects exact TinaCMS/CLI releases and updates the package manifest and lock together. The read-only [source validation workflow](docs/CI-INGEST.md) exercises installation, local schema/admin generation, static output and browser checks. A local-mode build does not verify hosted editor authentication, roles or account recovery; those require a separate check on the production origin.

## Content

- `content/posts/*.json`: five migrated posts, structured content blocks, drafts, dates, reading time and SEO fields. File name becomes the post URL; keep published URLs stable.
- `content/tools/*.json`: content below all 13 tools, SEO titles/descriptions and optional replacement FAQs. The WAV alias uses its canonical page's content.
- `content/home/home.json`: homepage content and SEO fields.
- `tina/collections.mjs`: editor forms. `tina/config.js`: hosted editor configuration.

Published content is read during the build and emitted as HTML. Drafts never enter public pages, related articles, metadata or sitemaps. Saving through TinaCloud commits to GitHub; Cloudflare rebuilds the website. A successful build is required before edits appear live. A malformed published document fails the new build instead of replacing the last good site. Editorial text is escaped, not executed as HTML.

## Development and checks

Use Node 22.12 or newer. `npm run dev` serves the public site without the editor. `npm run build` prepares worker files and exports static HTML to `out/`. `npm start` serves that export locally. `npm run typecheck`, `npm test`, `npm run check:public`, and `node scripts/package-site.mjs` validate the project. With read-only symlinked dependencies, use `npm test -- --configLoader runner`.

`npm run verify` additionally requires the external browser/media QA dependencies described in `scripts/verify.sh`. It audits only its own static preview server. A unit test pass does not prove every browser can encode every file.

## Free hosting architecture

GitHub stores the source and content. Cloudflare Pages hosts the static website, HTTPS and the domain. TinaCloud authenticates editors and saves content to GitHub. Visitors need no accounts. There is no application server or database to buy or maintain. Service free tiers have usage and collaborator limits; see the setup guide.

The build prepares same-origin FFmpeg/image workers. FFmpeg's 32.2 MB WebAssembly engine is split into two content-addressed static chunks below Cloudflare's per-file limit, then verified and reassembled on the visitor's device. No visitor files are sent to a server. Configure the custom response headers in `public/_headers`; GitHub Pages does not honor them, so use the Cloudflare Pages instructions.

## Processing and release scope

Images use browser encoders; GIF/video/audio use FFmpeg; PDF optimization rewrites structure and metadata rather than shrinking scans; ZIP creation/extraction has size, CRC and path limits. Existing file and queue limits remain in place.

The verified support mailbox is **info@filecompresser.com**, with outgoing name **FileCompresser Support**. The address is editable in global site settings; keep it pointed at a monitored mailbox and do not ask visitors to email private files.

The [release review](docs/RELEASE-REVIEW.md) and [codec distribution record](docs/CODEC-DISTRIBUTION.md) track the FFmpeg corresponding-source/notices prerequisite. Static packaging alone does not resolve it. Preserve the runtime license inventory and exact dependency versions.

Private project. All rights reserved unless otherwise stated.
