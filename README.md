# FileCompresser

Browser-based file compression and conversion with a Git-backed editorial CMS. GitHub stores source and content, Cloudflare Pages serves the static export, and TinaCloud authenticates editors. Current account, DNS and mailbox verification is recorded in [DNS and email](docs/DNS-AND-EMAIL.md); the [release review](docs/RELEASE-REVIEW.md) tracks launch prerequisites.

## Start here

Read [SEO and hosting setup](docs/SEO-AND-HOSTING.md) for the existing account setup, remaining launch steps, daily editing and password recovery. The TinaCloud project, Cloudflare Pages project, domain DNS/DNSSEC, support mailbox and Google/Bing ownership are verified. Cloudflare already uses `npm run deploy:check`; production `main` still awaits the reviewed source and preserved CMS dependency/schema locks. The website is not yet deployed; final browser, hosted CMS publishing and release checks remain pending. The existing CMS account is already Active Owner; no duplicate invitation is needed.

```sh
npm ci
npm run setup:cms
npm run dev:cms
```

Open http://localhost:3000/admin/index.html. The first CMS run generates `tina/tina-lock.json`. Publish that schema lock and the setup-generated package manifest/lock together before the first production build. A temporary CI installation alone does not persist those files in GitHub. Local editing has no login; hosted editing uses the existing TinaCloud account. Production deployments must use **npm run deploy:check** with the account variables configured; it includes the connected CMS build and release checks. Never publish a CMS built in local mode.

The CMS installer selects exact TinaCMS/CLI releases and updates the package manifest and lock together. The read-only [source validation workflow](docs/CI-INGEST.md) exercises installation, local schema/admin generation, static output and browser checks. A local-mode build does not verify hosted editor authentication, roles or account recovery; those require a separate check on the production origin.

## Content

- `content/posts/*.json`: five preserved posts, paragraphs/headings/lists/links/tables/images, author attribution, featured images, dates, drafts, archives and SEO fields. The file name becomes the post URL; keep published URLs stable.
- `content/tools/*.json`: content below all 13 tools, SEO titles/descriptions and optional replacement FAQs. The WAV alias uses its canonical page's content.
- `content/home/home.json`: homepage introduction, supporting content and SEO fields.
- `content/pages/*.json`: About, Contact, Privacy, Terms, Disclaimer and the blog index.
- `content/settings/site.json`: site identity, publisher, SEO defaults, sharing image and verified support email.
- `content/redirects/rules.json`: exact permanent redirects for reviewed URL migrations.
- `public/uploads/`: editor-managed raster images, at most 10 MiB each.
- `tina/collections.mjs`: editor forms. `tina/config.js`: hosted editor configuration.

Published content is read during the build and emitted as HTML. Drafts and archived posts are excluded from public pages, related articles, metadata and sitemaps. Committed source and its history remain visible in the public GitHub repository. Saving through TinaCloud commits to GitHub; Cloudflare rebuilds the website. A successful build is required before edits appear live. A malformed published document fails the new build instead of replacing the last good site. Editorial text is escaped, not executed as HTML.

## Development and checks

Use Node 22.12 or newer. `npm run dev` serves the public site without the editor. `npm run build` prepares worker files and exports static HTML to `out/`. `npm start` serves that export locally. `npm run typecheck`, `npm test`, `npm run check:public`, and `node scripts/package-site.mjs` validate the project. With read-only symlinked dependencies, use `npm test -- --configLoader runner`.

`npm run verify` additionally requires the external browser/media QA dependencies described in `scripts/verify.sh`. It audits only its own static preview server. A unit test pass does not prove every browser can encode every file.

## Free hosting architecture

GitHub stores the source and content. Cloudflare Pages hosts the static website, HTTPS and the domain. TinaCloud authenticates editors and saves content to GitHub. Visitors need no accounts. There is no application server or database to buy or maintain. Service free tiers have usage and collaborator limits; see the setup guide.

The build prepares same-origin FFmpeg/image workers. The pinned source-paired WebAssembly engine (20,752,732 bytes, approximately 20.75 MB) is split into two content-addressed static chunks below Cloudflare's per-file limit, then verified and reassembled on the visitor's device. No visitor files are sent to a server. Configure the custom response headers in `public/_headers`; GitHub Pages does not honor them, so use the Cloudflare Pages instructions.

## Processing and release scope

Images use browser encoders; GIF/video/audio use FFmpeg; PDF optimization rewrites structure and metadata rather than shrinking scans; ZIP creation/extraction has size, CRC and path limits. Existing file and queue limits remain in place.

The verified support mailbox is **info@filecompresser.com**, with outgoing name **FileCompresser Support**. The address is editable in global site settings; keep it pointed at a monitored mailbox and do not ask visitors to email private files.

The matching new codec/source/notices/recipe package is published at the fixed GitHub release and pinned in `scripts/codec-release.json`. The build preserves native and JavaScript notices in `THIRD-PARTY-NOTICES.txt`. The [release review](docs/RELEASE-REVIEW.md), [codec distribution record](docs/CODEC-DISTRIBUTION.md) and [CMS validation security record](docs/CMS-VALIDATION-SECURITY.md) distinguish verified component/source checks from pending application, browser and hosted-editor acceptance. Preserve the original notices, source access and exact dependency identities.

Project-authored code and content: all rights reserved unless otherwise stated. Third-party material retains its original notices and terms.
