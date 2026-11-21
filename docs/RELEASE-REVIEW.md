# Release review — 21 November 2026

## Verified setup and current launch state

The 4 November Downloads review is historical. The prepared application now uses static export, a Git-backed Tina editor and a newly built source-paired media engine. The TinaCloud project and Cloudflare Pages project exist and are connected to the repository. The requested CMS account is already Active Owner. Domain DNS and DNSSEC are active; the support mailbox **info@filecompresser.com** passed real incoming/outgoing checks. Google and Bing ownership are verified. [DNS and email](DNS-AND-EMAIL.md) records those observations.

**The FileCompresser website is not yet deployed.** The Pages command is already confirmed as `npm run deploy:check`; production `main` still contains the older source and awaits the reviewed source with preserved CMS dependency/schema locks. Intermediate CI has passed the actual installed Zod runtime/schema proof and Tina admin generation. The complete final release pipeline, custom-domain application/TLS checks, new-core browser media/security acceptance, hosted login and an authenticated save-to-GitHub-to-live-page test still require their final evidence. Component publication, local tests, domain ownership and mailbox delivery do not establish those results.

## Source and build gates

The first CMS installation generates dependency changes and `tina/tina-lock.json`. Preserve the actual successful setup's `package.json`, `package-lock.json` and schema lock together in the reviewed source, then validate that final source before updating production `main`. An ephemeral CI install does not persist these files automatically.

Cloudflare production uses **`npm run deploy:check`**, including fresh dependency audits, CMS input/security verification, lint/types/tests, the connected CMS build and static export/package checks. Keep original audit reports and release evidence. Do not substitute a local-mode CMS or a reduced build command to bypass a failed check.

The earlier baseline's count of 14 moderate minimatch findings is historical, not a current audit result. Current audits must come from the actual installed release graph. The [CMS validation security record](CMS-VALIDATION-SECURITY.md) describes the pinned Tina/Zod resource-limit backport and its narrowly identified audit disposition. Registry findings remain visible; unrelated high/critical findings and any production vulnerability block release. Current installed-package, generated-admin and browser evidence must be reviewed separately rather than inferred from fixture tests.

## Codec, source access and notices

The new minimal engine was built from maintained FFmpeg source `5.1.10+19.b5d146d17cb4`, with reviewed x264, LAME and zlib inputs. Its JavaScript is 86,526 bytes and its WebAssembly is **20,752,732 bytes**. The complete matching source/notices/recipe/core package is published at the fixed [codec-2026-11-21.1 release](https://github.com/abdulhameed-developer/filecompresser/releases/tag/codec-2026-11-21.1), with exact archive and core hashes pinned in `scripts/codec-release.json`. [The codec distribution record](CODEC-DISTRIBUTION.md) records the actual build and source evidence; it does not claim that every native dependency is cleared or that every browser input works.

The production build must fetch and verify the pinned public archive and retain its original native notices. The generated `/THIRD-PARTY-NOTICES.txt` also preserves installed JavaScript/package notices and the exact reviewed supplemental musl attribution. The old installed npm core is development history, not the public release target. Its package identity alone does not establish source correspondence for the new engine.

The new source-paired engine still requires the real browser media matrix, output inspection, cancellation/recovery and application security checks. Passing archive/core integrity checks is separate evidence from working browser conversions.

## Hosted acceptance and indexing

After the reviewed source and release checks pass:

1. Update production `main` with the reviewed source and preserved CMS dependency/schema locks, retain the already configured `npm run deploy:check` command and wait for a successful deployment.
2. Attach `filecompresser.com` and the intended `www` redirect through the existing Pages project. Replace the parked web target while preserving mailbox and search-verification DNS records. Verify HTTPS and redirect behavior on the real hostnames.
3. Sign in through the existing Active Owner account at `/admin/index.html`, test logout and verify one authorized content save through its GitHub commit, successful rebuild and resulting public page. Check image/media authoring too. Password recovery uses TinaCloud or the account's original sign-in provider; no independent site password is stored.
4. Complete the new-core browser acceptance and security checks on the release being published. Preserve actual results and limitations.
5. When launching, set `NEXT_PUBLIC_SITE_URL=https://filecompresser.com` and `NEXT_PUBLIC_ENABLE_INDEXING=true`, rebuild, then inspect canonical URLs, metadata, `robots.txt` and `sitemap.xml`. Use the already verified Google/Bing properties for sitemap submission and representative URL inspection. Indexing and rankings are not guaranteed.

These steps remain pending until their actual evidence is recorded.

## Editorial assets and verification limits

The five original generated illustrations remain included as responsive WebP with JPEG fallback/social variants. They are editorial metaphors, not compression benchmarks. Uploaded editorial images and authored JSON have separate validation limits.

Automated keyboard/contrast checks do not certify assistive-technology support. Synthetic media/PDF fixtures cannot establish arbitrary codec or document compatibility. Browser memory limits vary by device; input caps do not guarantee a bound on decoded memory. Digitally signed and encrypted PDFs remain unsupported. The app uses system fonts and does not request Google Fonts.
