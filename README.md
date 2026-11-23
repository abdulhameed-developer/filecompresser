# FileCompresser

Browser-based file compression and conversion with a Git-backed editorial CMS. GitHub stores source and content, Cloudflare Pages serves the static export, and TinaCloud authenticates editors. Account, DNS and mailbox evidence is recorded in [DNS and email](docs/DNS-AND-EMAIL.md); the [release review](docs/RELEASE-REVIEW.md) records deployment and validation results.

## Start here

Website: **https://filecompresser.com** · Content editor: **https://filecompresser.com/admin/**.

- **Add a blog:** open **Blog posts → Add File**, complete the article and SEO fields, enable **Publish this post**, then save.
- **Edit below a tool:** open **Tool pages**, select the tool and update its supporting sections, FAQs or SEO fields.
- **Publish:** each save commits to GitHub `main`; the change becomes public after its successful Cloudflare build.

Sign in with the existing authorized TinaCloud account. Its email sign-in flow offers **Reset password**; GitHub sign-in uses GitHub account recovery. Your requested account already has Owner access. Read the [editing and hosting guide](docs/SEO-AND-HOSTING.md) for images, drafts, recovery, domains, free-plan limits and maintenance. Verified production checks and their limits are recorded in the release review.

For local development:

```sh
npm ci
npm run dev:cms
```

Open http://localhost:3000/admin/index.html. The exact CMS dependencies and `tina/tina-lock.json` are already committed and were reproduced byte for byte in the final cold CI run. Keep the package manifest, dependency lock and schema lock together when maintaining the editor; `setup:cms` is available for deliberate dependency setup, not a step to repeat for daily content editing. Local editing has no login; hosted editing uses the existing TinaCloud account. Production deployments must use **npm run deploy:check** with the account variables configured; it includes the connected CMS build and release checks. Never publish a CMS built in local mode.

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

The matching codec/source/notices/recipe package is published at the fixed GitHub release and pinned in `scripts/codec-release.json`. The build preserves native and JavaScript notices in `THIRD-PARTY-NOTICES.txt`. The [release review](docs/RELEASE-REVIEW.md), [codec distribution record](docs/CODEC-DISTRIBUTION.md) and [CMS validation security record](docs/CMS-VALIDATION-SECURITY.md) record the tested cases and their limits, including all 32 genuine CI output checks. Preserve the original notices, source access and exact dependency identities.

Project-authored code and content: all rights reserved unless otherwise stated. Third-party material retains its original notices and terms.
