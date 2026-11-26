# FileCompresser product overhaul — engineering progress

Last updated: 2026-11-26 (Asia/Karachi). Local verification, authenticated release, real hosted Tina publishing and the final 74-case live tool regression have passed. Exact performance, vendor-editor and device/assistive-technology limitations remain visible; this is not a claim of perfection or complete accessibility certification.

## Rules for evidence

- **NOT TESTED** means there is no current-run evidence. Historical tests are explicitly labeled.
- **PASS** applies only to the stated check, input, browser, build and viewport.
- **FAIL** records a reproduced defect; **BLOCKED** names the missing access or external dependency.
- A build, Git push and successful production deployment are separate gates.
- Never record file contents, filenames from users, secrets or tokens in analytics or public evidence.

## Repository, architecture and recovery

| Item | Verified state |
| --- | --- |
| Working repository | `/home/admin/Documents/Codex/2026-11-04/filecompresser-continuation/latest` |
| Remote | `https://github.com/abdulhameed-developer/filecompresser.git` |
| Local branch at start | `main`, clean, `b58da3cb150f7a4d0a1aaa1ead99d529e39be831` |
| Remote main at start | `241534f4173d1293c05dd76244b38b8438e3c63a` (read with `git ls-remote`, 2026-11-26) |
| Recovery branch | `checkpoint/2026-11-26-product-overhaul-b58da3c` |
| App | Next.js App Router static export; HTML generated at build time |
| Processing | Browser workers/FFmpeg WASM, image codecs, pdf-lib and fflate; no server file-upload endpoint |
| CMS | Tina schema and repository content; publishing/deployment connection under current audit |
| Hosting | Cloudflare Pages `filecompresser`, automatic `main` deployments, build `npm run deploy:check`, output `out`, Node 22; verified read-only in dashboard |
| Current verified production | Code commit `0197d18`, deployment `5ecc7f32-5c39-462e-8b66-aa2485f49d9b`, success at 18:31 on 26 November 2026, following initial release `c89bfe6` / `a98b9fc3` and native content save `280bcc8` / `5d6df6b1`. Root/www/pages.dev configured |
| Production public variables | Canonical `https://filecompresser.com`, indexing enabled, Tina branch `main`; content-read token exists encrypted and was not revealed |

## Prior local commits preserved

| Commit | Change | Verification boundary |
| --- | --- | --- |
| `241534f` | WebM container validation | Verified on remote main and Cloudflare production at the start; preserved historical rollback checkpoint |
| `3b105af` | Contextual WebM controls | Local only at start |
| `8451d55` | Settings dialog | Local only at start |
| `b58da3c` | Engine WebM acceptance, conversion label, focus restoration | Prior run: lint/typecheck/build passed; 47 test files, 652 tests passed, 3 skipped. Actual WebM output was **not verified** |
| `f6d0059` | Persistent progress document and evidence boundaries | Local progress checkpoint, followed by scoped implementation/QA commits |
| `05adb24` | Timestamp-safe video, verified audio bitrate and retained-file suffixes | Local scoped engine commit; independent code review, real WASM/browser outputs and source gates pass |
| `d84aafb` | Tool/modal/navigation refinement, complete image-output resize removal, safe editorial content and selective route loading | Local implementation commit; final source suite/build pass. Exact browser/artifact boundaries recorded below |
| `7cd9e1e` | Reusable browser, per-tool, modal, Lighthouse and accessibility checks | Local QA tooling commit; actual outcomes and interrupted-run boundaries retained |
| `c89bfe6` | Local acceptance ledger and selected screenshots | Pushed; GitHub CI and connected Cloudflare deployment `a98b9fc3` both passed |
| `280bcc8` | Genuine native Tina homepage FAQ correction: missing WebM and converter link | Editor saved/reopened, exact Git diff reviewed, GitHub CI and Cloudflare `5d6df6b1` passed; public FAQ/link/JSON-LD and actual destination click passed |
| `e7e6b4b` | Navigation QA awaits the actual asynchronous article route | QA-only timing correction; original failed early-read/transport attempts retained; repeat 20/20 passed |
| `0197d18` | Literal CMS syntax examples and consistent shared editorial link states | Full local suite 50 files / 792 passed, lint/types/CMS-site/export checks passed; real local editor help and eight link-state screenshots reviewed before push. GitHub CI and connected Cloudflare `5ecc7f32` passed; actual hosted help now shows literal examples, Save disabled with no content changes |

## Priorities and issue inventory

| ID | Priority | Reproduced issue / action | Current status |
| --- | --- | --- | --- |
| ENG-01 | Critical | Missing-duration/VFR recording inferred 1000 fps and duplicated frames | FIXED: timestamp preservation and compatible H.264 remux; final browser output retains all 168 frames, 1,552 ms measured cold result for this sample. Earlier 965 ms evidence retained; neither timing is a universal guarantee |
| ENG-02 | High | HEVC/VP9 MP4 could retain an incompatible original despite H.264 output intent | FIXED: verified H.264/AAC compatibility output retained even if larger; compatible same-format compression still preserves a smaller original |
| ENG-03 | High | Verified renamed GIF downloaded unchanged bytes with a misleading .bin suffix | FIXED and browser retested: trusted MIME repairs suffixes while preserving valid aliases/bytes; arbitrary archive entries unaffected |
| ENG-04 | High | Low-rate WAV requested at 320 kbps silently encoded at 160 kbps while claiming 320 | FIXED: compatible sample rate only when needed, actual bitrate verified, honest resampling note; 18 WASM combinations and actual browser cases pass |
| ENG-05 | High | Retired resizing was absent from the UI but still accepted by an exported image-engine/worker path; target advice still mentioned it | FIXED: output resize options/helper/branches, obsolete styles and advice removed. Legacy inputs are stripped/ignored and original dimensions preserved; 151 focused tests pass, including alpha/16-bit/EXIF safeguards. Thumbnail sizing and video resolution controls remain |
| UX-01 | High | Settings occupied permanent workspace space and controls had poor proportions | FIXED: native viewport-bounded modal, dim/blur, full-width fields, balanced preset grid, 44px close, clear Reset/Done footer, keyboard/focus/scroll recovery |
| UX-02 | High | Converter displayed compression presets/actions and image-quality summary | FIXED: dedicated MP4/H.264/AAC output near action, Convert wording, no empty WebM settings; MP3 conversion verbs reflect input format |
| UX-03 | Medium | Narrow single-file card left most of the workspace blank | FIXED: full-width compact single-file row; multi-file gallery/pagination preserved |
| UX-04 | Medium | 404 recovery links were only 36px tall | FIXED: 44px targets; 348-case responsive sweep passes |
| UX-05 | Medium | Next action stayed below the viewport after first selection | FIXED: first selection reveals the action bar once; later progress/settings changes do not repeatedly scroll |
| UX-06 | Medium | Success/error banner was an unpadded strip | FIXED: shared readable padding, border/radius, wrapping and status semantics |
| UX-07 | High | Comparison continued an existing smooth scroll while open | FIXED: shared root/body lock cancels the animation; strict load/zoom/wheel/focus regression passes. Firefox's separate 3px automation baseline difference was traced to an unsettled pre-click position; the test now explicitly settles the trigger before recording its unchanged strict baseline |
| UX-08 | High | Old failed-run summary persisted after clearing/replacing files | FIXED: accepted idle queue mutations clear obsolete summary; per-file errors, limits, busy status and saved outputs preserved; real recovery retest passes |
| UX-09 | High | Enter in numeric Settings implicitly processed behind the modal | FIXED: processing guards the native dialog open state; actual Enter/Done/primary workflow passes in Chromium, Firefox and WebKit |
| A11Y-01 | Medium | Upload's accessible name omitted some visible label text | FIXED: title/hint/formats included; final route/Lighthouse checks recorded separately |
| A11Y-02 | Medium | Shift+Tab could escape Settings to browser chrome | FIXED: explicit first/last wrapping with disabled controls excluded; focus/scroll return and viewport checks pass |
| CMS-01 | High | Editorial lists/links/HTML and source-reader behavior were incomplete/inconsistent | IMPLEMENTED + LOCAL EDITOR PASS: semantic lists, safe React-rendered HTML, inline links and shared validators. Real hosted FAQ/link save → GitHub → successful Cloudflare build → visible public answer/link/JSON-LD now PASS; broader hosted validation combinations remain scoped separately |
| CMS-02 | High | Tina tool collection omitted WebM | FIXED: all 14 tool records visible in actual local editor; regenerated schema lock and CMS build pass |
| CMS-03 | High | Dedicated URL fields could save data later rejected by hosting build | FIXED: shared URL rules for section/article/author/reference/managed fields; invalid URL disables Save in actual local editor |
| CMS-04 | High | Individually valid post dates could save an update earlier than publication, then fail the content build | FIXED: date-field and Publish/Archive callbacks match the published reader; 14 parity regressions added and final compiled editor rebuilt. Native/hosted date-toggle scenario is not separately claimed |
| CMS-05 | High | Valid `%20` URLs were rejected, and balanced parentheses in Markdown destinations were truncated | FIXED: one bounded scanner serves validation, rendering and FAQ metadata; encoded spaces work while controls/backslashes/unsafe schemes remain blocked. Four regressions were demonstrated failing before the fix; 9 files / 157 targeted tests, security/linearity review and final full CMS/site build pass |
| CMS-06 | Medium | HTML examples in editor help were interpreted as markup; backticks did not escape Tina's HTML description renderer | FIXED: literal entity-escaped examples and clear list/link instructions in four help strings; installed vendor renderer regressions failed 4/4 before correction and pass afterward. Actual isolated local development editor visually verified; schema/lookup/GraphQL shape unchanged |
| VIS-03 | Medium | A real hosted FAQ inline link exposed default browser visited-purple styling outside editorial containers | FIXED: both shared Markdown and safe-HTML link branches reuse the editorialLink class with brand default/visited/hover/active/focus states. Eight actual 390/1440 captures including real navigation/Back reviewed; stable bounds and clear keyboard outline |
| CONTENT-01 | High | Retired image-resize claims, joined prose, malformed privacy URL | FIXED: accurate capability text, semantic paragraphs/lists, valid links; original user content preserved with targeted corrections |
| CONTENT-02 | Medium | Long guide/legal content lacked quick access | FIXED: compact native contents indexes with real anchors; eight actual keyboard/clearance cases pass |
| VIS-01 | Medium | Diagram subtitles overflowed; mobile meaning too small; example arithmetic wrong | FIXED: fitting labels, readable text explanations and correct rounded percentages; all five articles individually reviewed |
| VIS-02 | Medium | Byline/alias links used browser blue; mobile related articles were cramped | FIXED: shared brand link states and one-column related-article layout on small screens |
| CONTENT-03 | Medium | Plain line-separated benefits lists and old modified dates remained | FIXED: real bullets on general/image guides, factual WebM remux explanation, three genuinely changed information-page dates corrected |
| PERF-01 | High | No measured current performance baseline | MEASURED: five routes × mobile/desktop before; all 14 tools plus home/article × mobile/desktop after. 32 valid final reports; performance 75–86 mobile / 98–99 desktop. Remaining real opportunities and failed-trace retry retained below |
| PERF-02 | Medium | Hashed JS/CSS lacked explicit immutable caching | RELEASED: one-year hashed-asset rule; logo one day. Exact current public response headers are measured separately in the live delivery evidence |
| PERF-03 | Medium | ZIP library loaded before a ZIP download was requested | FIXED and real ZIP retested: lazy import removes one initial script request; measured initial bytes reduced |
| PERF-04 | High | Speculative route downloads exceeded the unchanged 900,000-byte local subresource budget | FIXED + MEASURED: selective `prefetch={false}` on broad navigation/catalogue lists preserves Next Link navigation. Matched cold 1280px home subresource transfer 978,184 → 719,181 bytes (−26.48%); requests 50 → 15; flagged route prefetch 21 → 0. Main HTML navigation is excluded from this metric. `role-payload-diagnostic/`, final role report |
| QA-01 | High | Old scripts omitted WebM/current tool count/modal workflow | FIXED: inventory derives 14 tools, alias included, 74 real-output/recovery cases and populated/state audits maintained |
| UX-10 | High | Firefox missed physical primary-action clicks while native smooth scrolling moved the target before/between press and release | FIXED: root scrolling immediate, route/hash restoration explicitly instant, deliberate gallery motion retained. Causal trace/A-B isolated global smooth scrolling; final built-version six-case sequence passes, including PNG/WebP actual outputs and strict comparison. Native pointer behavior is preserved; the ineffective mouse workaround was removed |
| REL-01 | High | Verified local changes absent from production | RELEASED: user completed secure GitHub CLI sign-in; normal pushes succeeded. Initial connected build, genuine Tina-triggered follow-up and final help/link release passed. Final default-profile live Chromium matrix passes 74/74 after the owner's approved RUM correction |

## Every tool — current verification matrix

Source and screenshots for every tool have been reviewed. Genuine processing, independent output inspection and downloads have passing evidence in Chromium, Firefox and Linux WebKit for every tool. The full codec/workflow matrix uses the unchanged engine source from the layout-acceptance build; later Link-prefetch and editorial-parser changes receive their own navigation/upload/content checks. Chromium's interrupted run and Firefox's first navigation timeout remain explicitly recorded in the ledger rather than being relabeled as passing whole runs. AVIF/SVG and PDF merge/split/conversion are not advertised tool routes in this checkout.

| Route | Purpose / output | Source reviewed | Real processing + output | Download | Mobile / desktop | Accessibility / errors |
| --- | --- | --- | --- | --- | --- | --- |
| `/compress` | Automatic engine for supported mixed files | Reviewed | PASS C/F/W; mixed image/audio/PDF | PASS, independent ZIP decode | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/image-compressor` | JPG/PNG/WebP compression/conversion | Reviewed | PASS C/F/W | PASS, decoded | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/jpg-compressor` | JPG compression/conversion | Reviewed | PASS C/F/W; Firefox cold retry recorded | PASS, decoded | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/jpeg-compressor` | JPEG compression/conversion | Reviewed | PASS C/F/W | PASS, decoded | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/png-compressor` | PNG optimization/conversion, alpha protection | Reviewed | PASS C/F/W presets/target | PASS, exact lossless pixels/alpha/geometry | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/webp-compressor` | WebP compression/conversion | Reviewed | PASS C/F/W; 10/100% endpoints also checked | PASS, decoded | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/gif-compressor` | Animated GIF optimization | Reviewed | PASS C/F/W; both modes in WASM | PASS, animation checked | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/video-compressor` | MP4/MOV → H.264 MP4/AAC | Reviewed | PASS C/F/W, five codec paths | PASS, streams/geometry/duration | PASS default + long-name populated/short | PASS tested inputs, cancel/retry + tool axe |
| `/webm-to-mp4` | WebM → H.264 MP4/AAC | Reviewed | PASS C/F/W; real recording separately probed | PASS, frames/audio checked | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/mp3-compressor` | Supported audio → MP3 | Reviewed | PASS C/F/W; low-rate actual bitrate verified | PASS, audible decode | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/wav-compressor` | WAV → MP3 | Reviewed | PASS C/F/W; alias also works | PASS, audible decode | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/pdf-compressor` | Lossless structural PDF optimization | Reviewed | PASS C/F/W | PASS, text/pages verified | PASS default + long-name populated/short | PASS tested inputs + tool axe |
| `/zip-compressor` | ZIP creation | Reviewed | PASS C/F/W, byte-safe arbitrary entries | PASS, independent extraction | PASS default + long-name populated/short | PASS arbitrary-file behavior + tool axe |
| `/archive-compressor` | Safe ZIP extraction | Reviewed | PASS C/F/W, unsafe ZIP rejection/recovery | PASS, extracted bytes verified | PASS default + long-name populated/short | PASS tested unsafe inputs + tool axe |

C/F/W means Chromium, Firefox and Linux WebKit. These are the stated genuine fixtures and sampled options, not every possible codec, file size or option combination. Size rejection uses a 51 MiB logical zero-filled file (now sparse to avoid consuming temporary-storage quota), not a valid giant photograph. File-chooser/touch/keyboard checks and broader responsive/layout evidence are recorded separately below.

## Complete route and visual inventory

All **29 views** received independent top-to-bottom visual review at **390px and 1440px**: the 14 tool routes above, 13 other canonical pages below, the WAV alias and the missing-route 404. The responsive measurement sweep covers 12 widths (348 cases), including every requested width and breakpoint neighbors. Default screenshots are supplemented by actual populated/modal/processing/error/result evidence; screenshots alone do not prove processing.

| Additional route | Purpose-specific refinement / review |
| --- | --- |
| `/` | Preserved existing homepage composition; corrected editorial paragraph/list/link flow, valid privacy link and compact guide contents |
| `/about` | Accurate count-neutral capabilities; concise identity/principles layout preserved; real update date |
| `/contact` | Accurate support instructions without retired resize advice; clear troubleshooting links; real update date |
| `/sitemap` | Efficient grouped canonical links reviewed independently; no unnecessary card redesign |
| `/privacy` | Readable legal composition with native in-page contents and working heading anchors |
| `/terms` | Same legal navigation rules, purpose-specific text measure and spacing |
| `/disclaimer` | Corrected capability wording, in-page contents and truthful update date |
| `/blog` | Featured story plus five article cards; actual-scroll image loading, mobile grid and image proportions reviewed |
| `/blog/how-browser-compression-works` | Fitting pipeline labels, readable diagram explanation, accurate engine size, inline links and mobile related articles |
| `/blog/honest-file-size-reporting` | Correct example percentages, readable diagram explanation, accurate dimension/retention guidance |
| `/blog/choosing-a-compression-mode` | Accurate quality/target choices and retired resize correction, cohesive reading layout |
| `/blog/what-privacy-claim-really-means` | Readable data-flow explanation, consistent byline/related links; original authored content preserved |
| `/blog/compressing-files-for-the-web` | Accurate format/bitrate/PDF guidance and diagram explanation; useful internal links |
| `/wav-to-mp3` alias | Same real WAV conversion, canonical notice uses shared brand link states; canonical destination remains `/wav-compressor` |
| Missing-route 404 | Clear recovery actions, actual 404/noindex behavior and 44px tool targets |

Exact screenshot filenames and individual conclusions are in [non-tool visual review](docs/visual-review-2026-11-26.md) and [tool visual review](docs/tool-visual-review-2026-11-26.md). Full-page images are under `.qa-results/2026-11-26-final/responsive/` and the decoded-image follow-up set `responsive-loaded/`. Inspection crops add white padding only outside the saved page and must not be mistaken for site whitespace.

Matched visual comparisons are retained with the repository in [selected visual evidence](docs/evidence/2026-11-26/README.md): eight exact PNG workspace/Settings captures, same generated source, settings and 390/1440 × 900 viewports. The single-file row changes from 170 × 248 to 914 × 157 px on desktop, and to 318 × 147 px on mobile. Full-width fields replace the cramped side label/control split; Reset/Done and the close target are consistently sized. The starting build already had a modal, so the comparison documents refinement rather than attributing the initial modal feature to this pass. Fixture and export hashes accompany the images.

`/robots.txt`, `/sitemap.xml`, social image and public resources have separate export/crawl checks. `/admin/` has a separate compiled-asset bootstrap and isolated real editor test; connected hosted editing/publishing is not inferred from public-page tests.

Shared-state coverage includes navigation current/hover/focus/open/mobile, native disclosures, directory filters/search/reset, settings open/close/Escape/backdrop/disabled controls, file validation/queue/progress/cancel/retry, long names/batches, previous/current results, comparison zoom/pan, and individual/ZIP downloads. Final audit totals and any incomplete combinations remain explicit in the ledger.

## Lighthouse and performance

The final quiet run has **32 valid reports: all 14 canonical tools, home and one article, each mobile and desktop**. All 32 score **100 accessibility / 100 best practices / 100 SEO**. Performance remains below the requested 100: **75–86 mobile and 98–99 desktop**. These are Lighthouse 13 local navigation measurements, not live production or field Core Web Vitals.

| Route | Before performance mobile / desktop | Final performance mobile / desktop | Final A / BP / SEO, both profiles |
| --- | --- | --- | --- |
| `/` | 52 / 98 | 78 / 98 | 100 / 100 / 100 |
| `/compress` | NOT MEASURED | 80 / 98 | 100 / 100 / 100 |
| `/image-compressor` | NOT MEASURED | 79 / 98 | 100 / 100 / 100 |
| `/jpg-compressor` | 62 / 92 | 80 / 98 | 100 / 100 / 100 |
| `/jpeg-compressor` | NOT MEASURED | 79 / 98 | 100 / 100 / 100 |
| `/png-compressor` | NOT MEASURED | 81 / 99 | 100 / 100 / 100 |
| `/webp-compressor` | NOT MEASURED | 79 / 98 | 100 / 100 / 100 |
| `/gif-compressor` | NOT MEASURED | 86 / 98 | 100 / 100 / 100 |
| `/video-compressor` | NOT MEASURED | 79 / 98 | 100 / 100 / 100 |
| `/webm-to-mp4` | 53 / 98 | 79 / 98 | 100 / 100 / 100 |
| `/mp3-compressor` | NOT MEASURED | 79 / 98 | 100 / 100 / 100 |
| `/wav-compressor` | NOT MEASURED | 75 / 98 | 100 / 100 / 100 |
| `/pdf-compressor` | 58 / 98 | 79 / 98 | 100 / 100 / 100 |
| `/zip-compressor` | NOT MEASURED | 78 / 98 | 100 / 100 / 100 |
| `/archive-compressor` | NOT MEASURED | 80 / 98 | 100 / 100 / 100 |
| `/blog/how-browser-compression-works` | 78 / 98 | 79 / 98 | 100 / 100 / 100 |

Baseline coverage is only the five named routes × two profiles; the other eleven routes have **no measured before score**. All ten baseline reports had accessibility/best-practices 100 and SEO 69. That preview intentionally used noindex; final indexing-enabled production configuration accounts for the SEO configuration difference and is not a code-caused ranking improvement. No current live-production Lighthouse score is claimed.

| Final lab metric, range across 16 routes | Mobile | Desktop |
| --- | --- | --- |
| FCP | 1.654–1.812 s | 0.406–0.448 s |
| LCP | 4.146–5.622 s | 0.949–1.140 s |
| Total Blocking Time | 63–382 ms | 0–15 ms |
| Cumulative Layout Shift | 0 on all routes | 0 on all routes |
| Speed Index | 1.654–1.812 s | 0.406–0.533 s |

Exact route/profile metrics and all audit findings are in [the consolidated result](.qa-results/2026-11-26-final/lighthouse-final-summary.json), with [the score table](.qa-results/2026-11-26-final/lighthouse-scores.md) and [measured before/after values](.qa-results/2026-11-26-final/lighthouse-before-after.json). A compact [32-report metric export](docs/evidence/2026-11-26/lighthouse-metrics.json) is also retained in Git. Raw JSON/HTML and frozen artifact metadata are retained locally in `.qa-results/2026-11-26-final/lighthouse-release-all-tools/`; baseline reports are in `.qa-results/2026-11-26-baseline/lighthouse/`. The final homepage SHA remained `dbf7c96d906d83c7574074a7d7bec1d2ba3bcf684845669234b0578232d4d0e5`.

The initial JPG desktop measurement failed with **NO_NAVSTART** and has no valid score; the original failure remains in the main summary. Only that measurement was repeated, with the same settings and no source change, in `.qa-results/2026-11-26-final/lighthouse-trace-retry/`; its valid performance score is 98. Thus 32 valid route/profile outcomes come from 33 attempts, not from relabeling a failed audit.

Remaining performance work is real and must stay visible: Lighthouse estimates roughly **77–87 KiB of unused-at-initial-load CSS** and **195–251 KiB of unused initial JavaScript**, plus blocking stylesheet, image-delivery, caching and document-compression opportunities. Shared interactive-state styles and framework code cannot be deleted merely because the initial empty view does not use them; any further splitting or consolidation needs regression testing. The local server is uncompressed, so production Cloudflare Brotli/cache delivery requires a separate measurement. PNG/WAV mobile reports also carry a slow-host-CPU calibration warning. These are a mix of code/delivery opportunities and lab limits, not a claim that all remaining work is external. INP requires field data; no field or universal-speed claim is made. Home baseline FCP 2.13 s / LCP 5.71 s / TBT 1260 ms / CLS 0 is retained as an observed shared-host baseline, not a controlled causal benchmark.

Measured initial script footprint: homepage 13 → 12 referenced scripts, 715,432 → 702,082 raw bytes; the three representative tool pages 708,303 → 694,917 raw bytes each. Consistent gzip estimates drop by about 6.5 KB per initial tool/home load; actual Cloudflare Brotli transfer differs. Moving ZIP generation behind its download action preserves functionality while removing that initial request. This method counts unique script references in HTML, including the legacy nomodule reference, rather than claiming those are actual modern-browser transfers. `.qa-results/2026-11-26-final/bundle-comparison.json` records all five routes and the final build.

The separate matched cold 1280px network profile measured **subresource transfer 978,184 → 719,181 bytes**, **50 → 15 subresource requests** and **21 → 0 flagged speculative route prefetch requests**. The same 900,000-byte budget was retained and now passes. These are `performance` resource entries and exclude the main HTML document. No FFmpeg/WASM/image-worker loaded before file selection. Later route values in a reused profile are warm-cache measurements, not additional cold-page comparisons. The before capture is `role-payload-diagnostic/role/payloads.json`; final role evidence records the matching post-fix profile.

## SEO, CMS and growth

| Area | Status |
| --- | --- |
| Canonicals, robots, sitemap, metadata, structured data, links | PASS in the local production-configured export: 28 served routes (27 canonical pages plus WAV alias), 27 unique titles/descriptions and canonical-only sitemap URLs, one H1 per page, correct production origin, robots/sitemap consistency, parsed JSON-LD and internal-link status checks. Automated source tests cover draft/archive exclusion and visible FAQ/link rendering. This does not establish production recrawl or external-link availability |
| Lists, numbered lists, links and safe HTML | IMPLEMENTED + LOCAL EDITOR PASS. Semantic lists, inline Markdown links and restricted HTML rendered as React nodes; shared editor/reader validation blocks unsupported/unclosed HTML and unsafe URLs before Save. Dedicated section/article/author/reference/managed link fields use the same URL boundary. Earlier five-file / 96-test checkpoint passed; final targeted URL/markup regressions are included in the 788-test full suite. Native editor saved/reopened valid Bullet list, Numbered list, Safe HTML and Link blocks. Formatting, accepted grammar and URL limits: `docs/CMS-CONTENT-FORMATTING.md` |
| Tina tool collection and compiled editor | PASS locally: all 14 tool records, including WebM, are present in local GraphQL and the actual editor. Schema lock/CMS build passed. Final compiled admin loaded its JS/CSS with HTTP 200 and correct MIME, without the generic asset fallback (`admin-bootstrap-release/result.json`). The separate isolated development screenshot fallback remains documented; it is not presented as an editor screenshot PASS |
| Tina publish → repository → Pages build | PASS for a genuine hosted correction: on a clean main-branch Homepage editor, corrected the missing WebM format and added its actual converter link. Save showed Document updated, reopening retained the exact answer, Git `280bcc8` changed only that answer plus normal trailing-newline serialization, and matching Cloudflare `5d6df6b1` passed. Public answer/anchor/FAQ JSON-LD and actual converter click passed. Evidence: `.qa-results/2026-11-26-live-a98b9fc3/hosted-cms-save.json`. This does not claim every hosted date/invalid-input/template combination was exercised; local-mode admin is never deployed directly |
| Factual content and revision dates | FIXED + VERIFIED. Retired image-resize instructions, inaccurate tool count, engine-size wording, diagram arithmetic/labels and malformed privacy link corrected while preserving authored content and original publication dates. Four revised articles and only the three substantively corrected information pages use 26 November revision dates. Final export/sitemap checks and six fresh About/Contact/Disclaimer browser cases at 390/1440 passed; complete refreshed pages were visually reviewed (`metadata-refreshed/`, `docs/visual-review-2026-11-26.md`) |
| Google Search Console | READ-ONLY AUDIT COMPLETE. Verified domain property; 3-month Web report: 2 clicks, 60 impressions, CTR 3.3%, average position 27.8; plotted data Nov 20–24. Desktop 1 click/42 impressions, mobile 1/18. Page indexing still processing, CWV no data, HTTPS 23/0 non-HTTPS, breadcrumbs 22 valid/0 invalid; Manual actions and Security issues both “No issues detected”. Sitemap Success, last read Nov 26, 26 discovered pages versus 27 canonical URLs in the local export. This unexplained difference does not identify a missing URL; WebM already existed before this run and its individual crawl/index state is unverified |
| Bing Webmaster Tools | READ-ONLY AUDIT COMPLETE. Verified property access. Three-month Aug 26–Nov 25: 0 clicks/0 impressions; no keyword rows. Site Explorer, Recommendations and Backlinks showed No Data, which does not establish zero indexed URLs/backlinks. Sitemap Success, last crawl Nov 24, 26 discovered URLs, 0 sitemap errors/warnings. The difference from 27 local canonical URLs does not identify a missing URL; URL-level indexing, including WebM, was not verified |
| Keyword/competitor map and editorial roadmap | COMPLETE: `docs/SEO-GROWTH-ROADMAP.md` records seven primary competitor references, prioritized intent-to-route mapping, a four-week evidence-led editorial plan and measured GSC/Bing observations. Bing Keyword Research displayed 13.7K impressions for `webm to mp4` and 1.2M for `compress pdf` in its selected three-month research view; these are not monthly search volumes, Google demand or our site traffic. Other query candidates remain qualitative; no ranking, growth or competitor-speed guarantees |
| Privacy-preserving analytics | Initial Pages Metrics showed no available request/error/CPU/duration data and its Web Analytics control disabled; this did **not** establish account-level RUM was disabled. Live testing found injected Cloudflare beacon scripts blocked by CSP. Account Web Analytics was separately set to Enable excluding EU. The owner explicitly chose Disable automatic analytics; only this site's RUM setting was changed, then persisted after reload. Five fresh canonical responses contain no beacon and retain the restrictive CSP; passive browser load has no resource/console errors. Initial propagation checks with a remaining beacon are preserved separately. No analytics history was deleted or new tracking endpoint enabled; no funnel/conversion-rate claims |

Evidence paths without a prefix in this section are under `.qa-results/2026-11-26-final/`. Local editor validation checks markup and address syntax/safety; it does not fetch a destination or prove that every authored section anchor exists. Search-property observations are a small current sample, not field Core Web Vitals, full indexing coverage or a traffic forecast. Search-account settings and indexing requests were not changed. Release follow-up deliberately saved the one reviewed homepage FAQ and disabled site-specific RUM with the owner's explicit choice; those actions have their own evidence in `.qa-results/2026-11-26-live-a98b9fc3/`.

## Verification ledger

| Check / exact scope | Result | Evidence |
| --- | --- | --- |
| Final complete source suite, lint and typecheck | PASS: 50 files, **792/792 passed, zero skipped** | Final help/link follow-up: `.qa-results/2026-11-26-help-release/source-gates.log`. Includes four new actual-vendor help regressions plus prior 788 tests. Original 49-file/788-test acceptance remains preserved in `source-gates/final-editorial-tests.log`; obsolete skipped resize tests were replaced with actual no-controls/original-dimension checks |
| Serial Tina local editor + production site export | PASS, local mode and separate connected releases | Latest local help follow-up: 1 guarded Zod root, 36 guarded parsers, 91 JS files; all 50 files / 792 tests pass. Real isolated development-editor help inspected without saves. Connected Cloudflare builds compile their own cloud editor; no local-mode admin was deployed. `.qa-results/2026-11-26-help-release/source-gates.log`, `editor-visual-result.json` |
| Final public build after workflow/content/loading and narrow help/link fixes | PASS | Latest local `oT6ZidQfrLDwlDyzxxWns` and matching-source connected Cloudflare `5ecc7f32` both pass lint/types, complete suite, production export/public/CMS-input/source checks. Earlier original acceptance remains in `source-gates/final-editorial-cms-site-build.log`; final follow-up in `.qa-results/2026-11-26-help-release/` |
| Targeted checks after last three factual-content date corrections | PASS: 4 files / 78 tests | About, Contact and Disclaimer updated dates now match their actual correction date, 26 November. Original publication dates and untouched pages preserved |
| Final export/public/CMS inputs | PASS | 28 served routes, 27 unique titles/descriptions and canonical sitemap URLs; codecs, MIME, redirects, raster assets and bounded JSON checks passed |
| Source secret heuristic + manual changed-code review | PASS within scope | 303 repository-owned paths scanned after the final help test, four selected follow-up captures and compact live-verification export were added. No new secrets or file-upload endpoints found. A heuristic scan is not a complete secret/security certification |
| Dependency security gate | PASS with explicit dispositions | Production audit 0 advisories. Raw all-dependency report: 8 high / 10 moderate / 2 low. Eight high map to the verified Zod backport; other high/critical findings remain blocking. Exact reports/proof in `dependencies/` |
| Actual shipped-WASM settings matrix | PASS: 29 cases | 28 verified outputs plus expected odd-original-dimension rejection; both video levels × four resolutions, audio bitrates, GIF reduction/retention. `.qa-results/media-core-audit.json` |
| Low-sample-rate audio actual-WASM matrix | PASS: 18/18 | 8/16/22.05 kHz × 96/128/160/192/256/320 kbps; actual bitrate, sample rate, channels, duration and independent decode. `.qa-results/audio-low-rate-core-audit.json` |
| Problematic real WebM recording, actual browser download | PASS on final artifact | Cold Chromium click-to-result **1,552 ms** for the 139,348-byte recording. MP4/H.264 output 140,766 bytes; 168 decoded frames, 768×568, 5.238 s, timestamps within 1 ms; no source audio. `webm-recording-release/webm-browser-audit.json`. Earlier 965 ms run retained separately; host/network/cache affect timing. Not a universal speed claim |
| Intermediate complete real-output Chromium run before final Enter guard | PASS: 73/73 | All 14 tools + alias; per-tool rejection/replacement, decoded output, low-rate MP3, cancellation/retry and stale-banner recovery. `chromium-v5/functionality.json` |
| Latest 74-case Chromium / Firefox / Linux WebKit | Chromium **74 unique cases PASS across 50 + 24 runs**; Firefox **73/74 plus 1/1 cold retry PASS**; Linux WebKit **74/74 full run PASS** | Chromium `chromium-release-final-v2/functionality-progress.json` contains a 50-pass prefix before exit 143; `chromium-final-51-74-v2/functionality.json` supplies cases 51–74. It is not a clean uninterrupted 74-case run. Firefox `firefox-release-final/functionality-firefox.json` records one initial navigation timeout before input; the same 30-second cold-navigation case passes in `firefox-cold-navigation/`. WebKit `webkit-release-final/` is a complete run. Decoded outputs, no-upload checks and resource/error checks retain their exact outcomes |
| Populated workspace layouts and modal states | PASS: 56/56 plus 28/28 short-screen cases | 14 tools × 320/390/768/1440 with long filenames; applicable modal bounds, Escape/backdrop/Done, strict Tab wrap, focus/scroll return and modal axe checks. `workspace-prefetch-final/`; phone 320×568 and landscape 768×430 in `workspace-short-phone/` and `workspace-short-landscape/`. Earlier 12 focused cases remain in `workspace-targeted-v4/` |
| Comparison loading, fit/100/200/400%, wheel and focus return | PASS | Exact background Y remains stable at 390/1280; earlier in-flight scroll defect fixed. Full functional suite retains this regression |
| Responsive default routes | PASS: 348/348 | 29 routes × 12 widths, including all requested widths and breakpoint neighbors. 404 targets corrected to 44px. `responsive/`; decoded-image captures supplement the measurement sweep |
| Individual visual review | PASS within stated scope | Every route independently reviewed top-to-bottom at 390/1440. Exact files/findings in `docs/visual-review-2026-11-26.md` and `docs/tool-visual-review-2026-11-26.md` |
| Actual guide/legal contents keyboard interaction | PASS: 8/8 on final artifact | Home, Privacy, Terms, Disclaimer × 390/1440: Enter expansion/collapse, Tab/Enter anchor and sticky-header clearance. Final repeat after immediate-scroll fix: `contents-interactions-final/`; original evidence also retained |
| Original compiled admin bootstrap | PASS, assets only, original local acceptance artifact | Compiled JS/CSS 200 with correct MIME, no generic loader fallback. `admin-bootstrap-release/result.json`, matching original admin SHA `063646c9…c228b`. Latest local admin SHA is `dab419b2…ba5d4`; actual latest hosted editor separately reopened its correct help with no asset fallback. API/auth/publishing have separate native evidence |
| Native isolated Tina save/reopen workflow | PASS, local only | Bullet/numbered lists, safe HTML, link validation, disabled invalid Save, valid save/reload, 14 tool records including WebM. Independent persisted JSON and unchanged-source proof: `cms-editor/README.md` |
| Final all-route axe | PASS automated violations: **0 across 29 views** | Exact final parser artifact repeated in `axe-release-final.json`. Four incomplete color-contrast rules cover 51 SVG text nodes; source/paint-order and per-node computed contrast reviewed separately, minimum 4.5786:1. This manual disposition is not an automated complete/WCAG certification: `axe-incomplete-review/`, `docs/accessibility-review-2026-11-26.md` |
| Shared navigation, design and interaction checks | PASS within scope | Navigation 20/20 and unchanged payload budget in `release-nav-role/`; design 18/18 in `prefetch-nav-design/`; premium states 36/36 plus mechanical/manual accessibility in `prefetch-shared-ui/`. Includes actual current/hover/focus/open/mobile states and live file announcements |
| Actual visible file chooser, touch and keyboard | PASS: 5/5 on final artifact | Chromium touch/keyboard, Firefox keyboard, Linux WebKit touch/keyboard at 390px; long filenames and real result outputs. `activation-release-final/report.json`. These emulate touch, not physical-device hardware |
| Final Lighthouse mobile/desktop | PASS measured; performance target not fully met | 32 valid reports across all 14 tools, home and one article; 100 accessibility / best practices / SEO, performance 75–86 mobile and 98–99 desktop. Original invalid JPG desktop trace retained and isolated retry recorded; exact scores and measured baseline boundaries are above |
| Git push / connected CMS production build / live acceptance | PASS within the exact recorded scopes | `c89bfe6` / Cloudflare `a98b9fc3` / GitHub CI `45825993658` PASS; native Tina save `280bcc8` / Cloudflare `5d6df6b1` / CI `45826858745` PASS; final code `0197d18` / Cloudflare `5ecc7f32` / CI `45829382930` PASS. Final live Chromium 74/74, route/asset delivery, native FAQ/editor and 29-route axe checks pass. Lighthouse limits remain explicit |

Evidence paths in the table without a full prefix are under `.qa-results/2026-11-26-final/`. These local reports/screenshots are retained in the workspace and excluded from the shipped public site.

## Live release acceptance — 26 November 2026

Production code `0197d18` is served by Cloudflare deployment `5ecc7f32-5c39-462e-8b66-aa2485f49d9b`. Its full connected build completed successfully at 18:31 (Asia/Karachi), including **50 files / 792 tests**, lint/types, Tina indexing/build, guarded admin, public/export checks and exact paired codecs. All three release build logs and GitHub check identities are retained separately from local build evidence.

- **Real public processing: 74/74 PASS** in one uninterrupted final default Chromium run, 200,245 ms for the whole multi-case test suite. Every canonical tool family and the WAV alias produced an independently checked download. Presets, format/quality/target options, animation, audio bitrate, five video codec paths, WebM conversion, PDF text/pages, byte-exact ZIP/extraction, validation, recovery and cancellation pass. This is a suite duration, not a promise for individual files. `full-74-final/` and `full-74-final-readonly.json` record zero failed resources, unhandled page errors, upload requests or blocked read-only-guard requests; browser closed normally.
- **Actual problematic WebM recording: PASS**, cold live click-to-result 3,361 ms, valid 140,766-byte H.264 MP4 from the 139,348-byte input, all 168 frames/timestamps and 5.238-second duration preserved. Independent decode and mobile layout pass. The earlier 1,552 ms local result is a separate environment, not a public speed guarantee.
- **Public routes/metadata: PASS**, 28 served routes, 27 unique titles/descriptions, 27 canonical sitemap entries and 28 internal-link targets; alias, removed-route 404s, robots and JSON-LD checked.
- **Public navigation: 20/20 PASS** after correcting a premature test read to await the actual asynchronous article route and visible figure. The original 19/20 attempt and transport retry remain retained; no app assertion was relaxed.
- **Public accessibility: 29/29 views with zero automated axe violations**. Four incomplete SVG contrast rules covering 51 text nodes retain the separate manual review; they are not reclassified as automatic passes.
- **Public delivery: 16/16 responses PASS** for homepage/WebM HTML and 14 current JS/CSS assets, all Brotli encoded. The 14 fingerprinted assets return Cloudflare HIT and one-year immutable caching; HTML is DYNAMIC with max-age 0 / must-revalidate. The earlier 19-resource core/logo/manifest/MIME/integrity probe also passed.
- **Hosted Tina publishing and final help: PASS** for the genuine FAQ/link correction and actual saved/reopened editor. Final help examples now render literally in the hosted Content sections field, with no unsaved changes; local installed-renderer regressions and native visual evidence separately prove the correction.
- **Automatic RUM: disabled by the owner's explicit choice**. Account-level Enable excluding EU had injected a CSP-blocked script despite the Pages panel's disabled control. Only the named site's RUM setting changed; it persisted after reload. Five fresh canonical responses and a passive fresh browser confirm no injected beacon, with the restrictive CSP unchanged and no analytics-history deletion.

Live evidence is under `.qa-results/2026-11-26-live-a98b9fc3/`; the directory name preserves the initial release identity and each follow-up records its own commit/deployment. Final help/source proof is under `.qa-results/2026-11-26-help-release/`. The earlier first live full run is honestly **72/74 FAIL** overall: an initial JPG transport failure before input and the clean-resource guard's accumulated QUIC/CSP errors. Cases 2–73 passed, then the full fresh final run passed 74/74 after RUM correction. Separate cold QUIC/reset attempts and protocol diagnostics remain retained; their cause is not claimed proved or silently dismissed.

### Actual live Lighthouse results

These are independent production measurements after RUM was disabled, not the earlier uncompressed localhost matrix. Three valid standard-profile measurements were obtained from six standard attempts; failed attempts are retained, not scored as zero or replaced with a preferred score. The home-mobile initial NO_NAVSTART was repeated once unchanged and the valid **75** remains reported.

| Public route/profile | P / A / BP / SEO | FCP / LCP | TBT / CLS |
| --- | --- | --- | --- |
| Home mobile | **75 / 100 / 100 / 100** | 2218 / 2670 ms | 821 ms / 0 |
| Home desktop | **100 / 100 / 100 / 100** | 379 / 673 ms | 0.5 ms / 0 |
| WebM mobile | **98 / 100 / 100 / 100** | 1070 / 2106 ms | 136 ms / 0 |
| WebM desktop | **BLOCKED — no valid score** | Not measured successfully | Not measured successfully |

WebM desktop encountered Chrome interstitial failures twice. One separately labeled no-QUIC diagnostic also failed: its saved network log records initial-document connection resets/abort, with no certificate-error event recorded. No certificate/security bypass or Cloudflare protocol-setting change was used, and a unique cause is not established. This audit failure does not negate the real converter's successful downloads in the clean 74/74 run.

Home mobile still has real main-thread work (about 4993 ms in that run; unused-JS estimate about 77 KiB) and TBT 821 ms. A slow-host CPU calibration warning is present but does not prove it caused the whole deficit. Shared route/state CSS and framework/workspace splitting remain engineering work requiring renewed QA. No overall 100/100 or field-INP claim is made. Exact metrics, all failed attempts and boundaries: `.qa-results/2026-11-26-live-a98b9fc3/acceptance-manifest.json`; compact Git-retained copy: [live verification](docs/evidence/2026-11-26/live-verification.json).

## Failures investigated and retained

- Initial Chromium output diagnostic: 49/52 passed. A real retained-GIF suffix defect was fixed; two stale harness expectations were corrected. Later complete output runs passed.
- The first export checker invocation used localhost/noindex expectations against an intentional production-configured artifact. Repeating with the matching public environment passed; this was not a production canonical defect.
- Earlier concurrent CMS bundling was stopped under severe host resource contention. Subsequent serial CMS/site builds passed.
- A 74-case Chromium attempt lost its browser at the M4A case after earlier successes. Later cases were cascading disconnections, not independently executed tests. The failed run is retained in `chromium-release/`. OOM is **not established**: accessible cgroup counters were zero and kernel/system-journal access was unavailable. Later serial attempts also ended with outer exit 143, once before a PNG screenshot and once after a 50-pass prefix before WebM navigation; no encoder cause was established. The PNG case passed independently with identical decoded pixels. Cases 51–74 subsequently passed as an explicit continuation. The ledger reports this split evidence rather than claiming a clean final Chromium whole run. The wrapper now streams logs and bounded diagnostics so an interrupted run remains diagnosable; processing timeout assertions were not relaxed.
- A separate fresh screenshot attempt against the isolated Tina development server showed its asset fallback. The native built-in browser editing scenario had worked and persisted valid test data. The isolated dev HTML used absolute localhost asset URLs while the document used 127.0.0.1; an origin/transport cause remains unconfirmed. Compiled static admin assets independently passed a fresh-profile bootstrap. Failed dev captures are explicitly labeled and are not presented as editor proof.
- Firefox's first complete run passed 73/74 cases; comparison measured a 3px difference from an unsettled pre-click automation baseline. The strict assertion was preserved while the test now explicitly settles and records its starting position. Repetition then exposed missed primary clicks: passive traces showed the target moving during native smooth scrolling and no processing submit. An initial mouse-focus workaround was insufficient and was discarded. CSS-auto diagnostics passed 3/3 with exact press/release/submit positions; the final unmodified exported app passed the six-case predecessor sequence. These failures and traces remain in `firefox-serial-final/`, `firefox-pointer-fixed-sequence/`, `firefox-scroll-origin/`, `firefox-scroll-auto-diagnostic/` and `firefox-final-sequence/`.
- The final Firefox whole run had a separate initial `page.goto` network-idle timeout before any JPG input; all other 73 cases passed. The same fresh-profile JPG case passed with the same 30-second navigation limit. The original failure remains visible.
- A fixture-writing attempt hit temporary-storage quota (`EDQUOT`), preventing a browser launch. Twenty-eight task-created all-zero oversized fixtures were sparsified with logical sizes and SHA-256 bytes preserved, reclaiming 1,464,418,304 bytes. No user files, outputs or reports were deleted. Exact user quota was unavailable; this does not prove low-memory-phone behavior. `fixture-storage-reclamation.json` records the operation.
- One Lighthouse JPG desktop run returned `NO_NAVSTART`, which has no valid score. Its original report remains; an isolated valid retry scored 98 performance. All 32 valid final route/profile pairs are retained without counting the invalid trace as a zero or hiding it.

## Artifact, recovery and release status

- Local preview: **http://127.0.0.1:3000**. The separate immutable baseline is at port 3199.
- Latest local public export build ID: `oT6ZidQfrLDwlDyzxxWns` (help/link follow-up, including the saved FAQ).
- Latest local homepage HTML SHA-256: `9c1934306727b0c50c6f4affe953bb9f92966fe17d55658181a4386c888a5931`.
- Latest compiled local admin index SHA-256: `dab419b2988b01e4daea94f7c548543a92c7ca111f2979cf8afc0ce4b6cba5d4`.
- The earlier full local acceptance artifact `T0IO7fozU0grEtYQtuYdr`, homepage SHA `dbf7c96d…d4d0e5` and admin SHA `063646c9…c228b` are preserved intact as `.qa-results/2026-11-26-final/artifacts/T0IO7fozU0grEtYQtuYdr-out.tar.gz`; archive SHA `2439ece511f18ff376abce347b775ee830cc2f9a865354fefc1c2ff28a7e48e4`. The 32-report local Lighthouse matrix belongs to that measured artifact, not an invented rerun of the later two-rule link-style follow-up.
- Recovery branch and all earlier commits remain intact. Additional current-source patch/archive: `recovery/tracked.patch` and `recovery/current-source-files.tar.gz`.
- Final committed-source recovery destination: `.qa-results/2026-11-26-final/recovery/verified-07CI5f/` (Git bundle, tracked-source archive and fingerprint manifest). These files are produced and verified after the final documentation commit; the manifest records that exact commit without requiring a self-referential hash in this document.
- The newer released-source/ledger recovery is `.qa-results/2026-11-26-help-release/recovery-7qUWl8/`, containing a separately verified complete Git bundle, tracked-source archive and manifest. The earlier `c89bfe6` bundle and exported acceptance artifact are preserved, not overwritten.
- Verified implementation commits `05adb24`, `d84aafb`, QA helpers `7cd9e1e` and acceptance ledger `c89bfe6` were pushed normally after remote/fresh-auth checks. The genuine Tina save `280bcc8` was reviewed and fast-forwarded locally. The narrow help/link follow-up `0197d18`, with QA wait correction `e7e6b4b`, is also pushed. No force-push or discard occurred.
- Git authentication is now PASS: the owner completed GitHub CLI browser sign-in to their keyring. A dry run, normal pushes and authenticated read-only release checks succeeded. No token was requested in chat or read/displayed by this work.
- Previous production/rollback checkpoint remains `241534f` / `0b034c23`; initial verified release is `c89bfe6` / `a98b9fc3`, and the real hosted content correction is `280bcc8` / `5d6df6b1`. Final help/link release `0197d18` / `5ecc7f32-5c39-462e-8b66-aa2485f49d9b` and GitHub CI `45829382930` passed. The only hosting-setting change is the owner's approved site-specific RUM disable; no DNS, security or protocol setting was changed.
- Connected `npm run deploy:check` passed for three reviewed releases with the existing encrypted production Tina token/environment: the first two include 788 source tests, and final `0197d18` includes 50 files / 792 tests. All include CMS indexing/build, static-admin guard, public/export checks and paired codec integrity. Exact public routes and native hosted save are independently verified. The local-mode admin output was never uploaded as production.
- The final ledger/evidence commit changes only `PROJECT_OVERHAUL_PROGRESS.md` and `docs/`. It uses the documented [CI Skip flag](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/) to avoid rebuilding unchanged application code. The production code identity remains `0197d18` / `5ecc7f32`; no application checks were waived for that released source.

## Remaining limits and honest acceptance boundary

- Hosted Tina authentication/read/save/reopen and a real FAQ/link publish → GitHub → successful Cloudflare build → public answer/link/JSON-LD are now verified. Every hosted invalid-markup/date-toggle/template combination was not separately exercised; their source callbacks and actual local editor scenarios remain the stated evidence.
- The installed Tina editor has a vendor accessibility limitation: default text/textarea labels point to input names, while those controls have no matching id/ARIA label. Its supported field schema has no id/ARIA passthrough; a supported custom field wrapper or upstream fix needs separate design/testing. No brittle DOM patch was added. Public-site form labels and accessibility results are separate from this admin limitation.
- Linux Chromium/Firefox/WebKit and viewport emulation do not certify physical Android/iPhone/iPad devices, Safari/iOS, Edge, VoiceOver/NVDA, forced colors or every assistive technology.
- Small genuine fixtures, selected settings, cancellation/retry, corrupted/unsafe samples and limit checks do not establish every codec/setting/file-size combination. Physical maximum-size files on low-memory phones and prolonged real-device memory/thermal behavior are not fully exercised.
- Outputs are independently decoded/probed; no claim that a human listened to every audio sample or watched every long video.
- PDF is a structural optimizer. Scanned-image recompression, merge/split/conversion tools, AVIF and SVG tools are not implemented or advertised in this checkout.
- Raw toolchain/editor dependency advisories remain as recorded; this is not an advisory-free or vulnerability-free certification. React 18 deprecation in Next 16 and the harmless ignored lockfile outside this checkout remain build notices; no security gate was disabled to hide them.
- By the owner's explicit choice, automatic RUM is now disabled and no custom tool-event collector is configured. No upload/start/success/abandonment funnel or conversion-rate claims can be made. Any future tracking release needs a separate product/privacy decision and truthful notice.
- Search samples are small; indexing reports/CWV data are unavailable where recorded. No guaranteed ranking or traffic growth.
- Lighthouse is a local lab result on a shared 7.1 GiB workstation with an uncompressed static server. Production Cloudflare Brotli/caching and field INP require separate verification. Scores below the target must remain visible.

## Resume point

Release and live acceptance are finished within their stated scopes. No Git-authentication or Tina-publishing blocker remains. Further engineering work is the measured mobile-home main-thread cost and supported/upstream Tina admin-label repair, each needing dedicated regression QA. A desktop WebM Lighthouse score remains externally blocked by repeated browser document-transport failures; actual live conversion passed. Physical-device/assistive-technology and exhaustive-file limits remain as recorded. Preserve the exact release, failed attempts, source bundles and both lab/live measurement sets for any continuation.
