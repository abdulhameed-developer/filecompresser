# FileCompresser — Phase 2 acceptance report

27 November 2026. **Verification in progress; not a deployment announcement.** Candidate I passes its complete 877-test/build gates, fresh full Chromium workflow, three-engine image checks, responsive sweep and accessibility scan. Performance measurement and hosted-release acceptance retain their individual statuses below. This report separates implemented improvements, measured output quality, current acceptance, superseded attempts and remaining limits. The exact run ledger is [PROJECT_OVERHAUL_PROGRESS.md](../PROJECT_OVERHAUL_PROGRESS.md).

## A. Image compression benchmarking

The prior interface forced Maximum for photos and PNG. The engine's fallback when options were omitted had been Balanced/Lossless; these are different baselines. The revised interface starts with Balanced JPEG/WebP and Lossless PNG, displays the format, dimensions and quality policy before processing, and retains optional Smart/Maximum/Target controls.

Fifteen generated or licensed inputs cover photos, portraits, landscapes, text, screenshots, fine detail, continuous alpha, gradients, optimized sources, EXIF orientation, sRGB ICC and 16-bit precision. Ninety baseline outputs, 42 rejected experimental outputs and 42 selected PNG outputs are retained. Independent native decoding, alpha/dimension/raw-sample comparisons, Gaussian SSIM/PSNR and visual review at native scale supplement the engine's guards.

| Actual same-file user workflow | Prior default | Revised default | Measured result / trade-off |
| --- | --- | --- | --- |
| Optimized 1440 × 900 screenshot | Maximum: 12,412 / 12,440 ms; 29,987 B | Lossless: 2,360 / 2,364 ms; 83,020 B | Faster initial task and exact decoded pixels, with a larger file than the former lossy result. These are different quality policies, not a same-quality encoder comparison. |
| 9 MP portrait ready state | Full JPEG probe: 969 / 969 ms | Header readiness: 210 / 168 ms | Encoding itself was not faster at the higher-quality default: 2,945 / 2,415 → 2,909 / 2,880 ms. Output increased from 342,144 → 874,470 B with more retained detail. |
| Explicit Maximum on optimized screenshot | 29,987 B; 16,947 ms engine mean | 31,045 B; 4,789 ms engine mean | Bounded search is substantially faster on these two recorded trials, with 3.53% larger output. |
| Explicit Target 80 KB gradient | Stronger lossless search retained | 72,797 B; 1600 × 900; exact RGBA | The actual 390 px workflow took 13,479 ms. This remains an advanced-mode speed limit, not a two-second promise. |

JPEG preflight now avoids a needless full decode. One successful encoder can be reused between exclusive jobs, with 30-second idle cleanup scheduled; a suspended or background browser can delay that timer. Cancellation/errors terminate the job worker, and page exit releases the idle worker. PNG lossless bytes are unchanged for all seven PNG inputs. A faster candidate that materially worsened lossless size was rejected rather than shipped.

The built-in browser obtained 17 initial competitor downloads from 11zon, TinyPNG, iLoveIMG, Squoosh and FreeConvert. Nine settings were repeated: all output sizes and decoded RGBA matched; eight file hashes were identical. CloudConvert's daily-credit limit blocked its output. Only generated images were sent to TinyPNG/FreeConvert under the owner's explicit consent. No visitor files were uploaded.

The [full competitive report](COMPRESSION-COMPETITIVE-BENCHMARK.md) contains identical-input/provider sizes, metrics, settings, licenses, visual findings and hashes, including cases where competitors produce useful smaller results. Provider encoder-only timings are unavailable; no equivalent speed ranking or universal winner is claimed. Lossy Maximum can still show visible banding despite high numerical metrics. [Compact image evidence](evidence/2026-11-27/image-benchmark.json).

## B. Tool quality report

The [product scorecard](FILECOMPRESSER-PRODUCT-SCORECARD.md) gives each of the 14 tools a separate status, output focus and limit. Frozen I passes **877 source tests across 56 files**, zero skipped, and its fresh Chromium run passes **79/79 functional checks**, with 57 independently rehashed downloads, 50 states, normal exit 0 and zero strict console/resource/exception/upload/lifecycle diagnostics.

Retained H separately passes **316/316** across Chromium desktop, Linux WebKit, Firefox 155 and 390×844 touch emulation, each with 57 verified downloads (228 total). I keeps the same processing/workspace/queue/CSS, original content/uploads, five workers and media-core bytes. Its exact nine-path runtime change concerns editorial image delivery and is independently checked in 45 fresh three-engine cases. H is not relabeled as four new I suites. Previews and local CMS are never treated as a hosted deployment.

All 14 routes are included: `/compress`, `/image-compressor`, `/jpg-compressor`, `/jpeg-compressor`, `/png-compressor`, `/webp-compressor`, `/gif-compressor`, `/video-compressor`, `/webm-to-mp4`, `/mp3-compressor`, `/wav-compressor`, `/pdf-compressor`, `/zip-compressor`, `/archive-compressor`. The WAV alias is separately included. Downloaded image, media, PDF and ZIP outputs are independently decoded, probed or extracted rather than accepted from a success label.

ZIP extraction replaces per-entry timer waits with a cooperative 8 ms CPU budget. For the same 500-entry input in Chromium 156, the median changed from 2,334.7 → 130 ms over three trials, retaining every entry's bytes, CRC and path. Forty-six direct shipped-WASM cases pass (45 outputs + one expected rejection), covering codecs, timestamps, low-rate bitrates, animation timing and explicit video caps.

Final E GIF UI tests in both modes produce 5,204 B from 12,103 B, with 12 correctly timed frames, exact displayed pixels/alpha, loop value 3 and 160 × 120 dimensions. Independent Pillow review reports hidden RGB changes only at alpha 0; FFmpeg-normalized RGBA is exact. [GIF proof](evidence/2026-11-27/gif-transparency-verification.json).

Generated PDFs include deliberate structural redundancy, forms/attachments and already-efficient/scan-surrogate cases. PDF image recompression is not implemented; those files may legitimately remain unchanged. [Compact non-image evidence](evidence/2026-11-27/nonimage-engine-results.json).

## C. UX, responsive and accessibility

Every canonical page, alias, all five published articles and the missing-page recovery view received its own full-height desktop/mobile review. The [visual report](visual-review-2026-11-27.md) maps all 29 views to captures, findings and retained artifact scopes. Fresh I passes **348/348 route/width checks**, using 320, 375, 390, 430, 760, 768, 900, 901, 1024, 1280, 1440 and 1920 px. All 87 fresh full-page comparisons were inspected: 80 are exact matches, five differ only in responsive hero pixels, home 768 differs only in guide thumbnails, and pipeline 390 has a reviewed 0.18px intrinsic-ratio rounding/antialias change with unchanged total page height. Changed regions and the complete affected pipeline page were directly opened.

Retained H passes **84 populated/settings cases**: 56 normal, 14 short portrait and 14 landscape. Five shared audit groups pass, including navigation 20, design-system 18 and premium-state 36 checks. The controlled frontend flow passes 11 cases with real decoded outputs, delayed file-detail loading, pending image checks and disabled drag/drop behavior. The genuine WebM viewport proof shows fixed MP4 output, the conversion action and a valid converted result; larger conversion output is reported honestly. Settings stay in a bounded native modal with dimming/blur, clear Done/Reset, Escape, focus return and scroll recovery.

Specific corrections include truthful image defaults/policy, irrelevant mixed-queue image information, a squeezed loading row, inaccurate converter/extractor introductions, premature Ready status, half-width desktop audio fields, disabled drag feedback, ZIP retry eligibility and a real WebKit thumbnail lifetime error. Actual short-screen review also caught the Target input behind a sticky footer. H now reserves the header/footer around one scrolling body and reveals the full focused control. **32/32 compiled immediate-transition checks** pass across Chromium, Firefox, WebKit and touch without injected CSS/DOM/listeners; full outlines, five pointer hit points and typed values are checked.

I's fresh expanded axe scan passes **29/29 views with zero automated violations**, including WCAG 2.1 A, which the historical filter omitted. Four SVG contrast incompletes remain separate: all 51 target nodes, entire SVGs, palette and backing rules match the reviewed source, and recalculated contrast is at least 4.5786:1. A 100/100 Lighthouse accessibility category previously missed the upload label-in-name defect; the actual visible-label correction and expanded axe rule remain in place. An overly strict compact busy-name test was corrected to compare the actual accessibility-tree name with every referenced label while requiring the visible label to be included; original red and successful rerun remain retained.

Retained H non-tool capture passes 28/28 exact-HTML/image/layout checks. Thirteen raw Chrome cancellation events are retained: each has its own fulfilled 200 HEAD observation and unambiguous same-origin CDP/RSC-tree proof. Independently found false-positive edges in the private classifier were closed; constructed, real failed-HEAD/aborted-GET and pre-network rejection controls stay failures. No broad abort filter, application prefetch change or weakening of the original functional guard was used. Two expected document 404 console messages belong only to deliberate recovery-page visits.

Original screenshot pairs show [audio settings before](evidence/2026-11-27/screenshots/wav-settings-before-B.png) and [H after](evidence/2026-11-27/screenshots/wav-settings-H.png), plus the 320×568 Target defect [before on failed F](evidence/2026-11-27/screenshots/png-target-320-before-F.png) and [after on H](evidence/2026-11-27/screenshots/png-target-320-H.png). Also included: [H mobile ready](evidence/2026-11-27/screenshots/png-ready-390-H.png), [actual mobile result](evidence/2026-11-27/screenshots/png-completed-390-H.png), [H PNG settings](evidence/2026-11-27/screenshots/png-settings-H.png), [archive replacement guidance](evidence/2026-11-27/screenshots/archive-replace-guidance-H.png), and [the actual F image comparison](evidence/2026-11-27/screenshots/image-comparison-final-F.png). The before views are local historical artifacts, not production-baseline claims. [The manifest](evidence/2026-11-27/screenshots/manifest.json) preserves exact original bytes and identities.

## D. Performance

The final targeted change preserves authored cover source/alt/caption/metadata and reuses responsive stock art only after exact server-side byte identity. Five required 768×512 variants are independently decoded and guarded. Pipeline mobile 1× uses the existing 23,616-byte 640px source; higher-density mobile uses 48,054 bytes at 768px versus 65,252 bytes at 1200px; desktop retains full artwork. Unknown or replaced uploads keep their original fallback. All 45 actual browser cases check native source selection, decode and absence of duplicate full downloads. [Editorial delivery evidence](evidence/2026-11-27/editorial-image-delivery.json). These are website illustrations; file-tool resizing remains absent.

Historical production remains home mobile 75 / desktop 100, WebM mobile 98/desktop blocked. Earlier shared-host diagnostic local scores 68/73 are retained separately; they are not substituted for the quiet controlled series.

Three interleaved quiet mobile-home pairs use identical Lighthouse 13.6.0 / Chrome 156 settings and the same uncompressed static-server implementation. Baseline scores **98/98/98** and H **96/97/97**, with A/BP/SEO 100 throughout. Median modeled FCP/LCP changes **1,822 → 1,964 ms**; observed unthrottled paint **284 → 299 ms**. TBT medians 86 → 93 ms have overlapping ranges (83–92 versus 73–141 ms), and CLS is 0 throughout. This is a small measured paint regression, not a Lighthouse improvement claim. The identical hero text/geometry rules out a different LCP element; larger HTML is a possible critical-path contributor, without proved causality.

H's static referenced-payload estimates show home raw JS 702,082 → 667,324 B and combined per-resource HTML/JS/CSS gzip estimate 260,001 → 250,990 B (−9,011B). These include legacy `nomodule` references and are not actual browser transfers. The quiet browser report separately records total transfer about 30 KB lower, JS about 35.7 KB lower and HTML 6.3 KB larger. Public production delivers Brotli. The additional I lab reports have been collected, but their interpretation remains under review because the cohort is noisy. Live transport and release measurements retain separate, unfinished acceptance scopes. No final I performance improvement, replacement production score or field Core Web Vitals pass is claimed here.

Current I static payload, compared with the same starting export:

| Homepage payload measure | Starting export | Current I |
| --- | ---: | ---: |
| Referenced JavaScript, raw | 702,082 B | 667,374 B |
| HTML, raw | 103,528 B | 109,914 B |
| HTML + referenced JS/CSS, per-resource gzip estimate | 260,001 B | 251,037 B (−8,964 B) |

These are source-reference estimates, including legacy `nomodule` scripts, rather than modern-browser wire bytes or engine startup. The [consolidated measurement ledger](evidence/2026-11-27/lighthouse-measurements.json) retains every measured, excluded and blocked attempt across separate local and before-production series. Identity-incomplete, interstitial and partial-delivery attempts remain explicitly excluded from clean comparisons. Shared-host variance prevents a reliable causal article LCP/score improvement claim; final production measurement remains pending.

## E. SEO and editorial system

The fresh Google three-month Web report shows 2 clicks / 60 impressions / 3.3% CTR / 27.8 average position. All 11 query rows were inspected: the brand is at position 2, and no non-brand query in this small dataset is within 5–30. Independent page totals must not be joined to queries to invent attribution.

All 24 displayed indexed examples were reconciled against the 27 canonical sitemap URLs. The absent canonicals are Contact and JPG (discovered, not indexed) and WebM (unknown to Google). Bing says WebM is discovered but not crawled; its separate live test says it can be indexed. The aggregate sitemap count of 26 versus the actual 27 remains a discovery-report observation, not broken XML or proof of the exact discovered set. No indexing requests or canonical migrations were made.

Google's manual/security panels show no detected issues; both field Core Web Vitals panels lack sufficient 90-day usage data. Bing property traffic remains 0/0; its research impressions are explicitly selected multi-month research values, not our traffic or monthly volume. Fresh backlinks/recommendations panels have no available data. The historical 23 November scan reports 28 pages and 0 errors/warnings; it does not certify the new code.

Supported Tina field wrappers fix native text/textarea labels while retaining the original validators and parsers. Six real isolated editor scenarios and native label inspection passed; the current live editor opens authenticated with no unsaved changes. Hosted new-bundle verification remains pending release. Lists, numbered lists, links and restricted HTML remain supported. One factual PNG benchmark article is saved as an **unpublished draft**, with conceptual artwork explicitly distinguished from actual measurements. It is excluded from the public blog, routes and sitemap. [Search/editorial review and calendar](SEO-PHASE2-REVIEW.md).

## F. Engineering, release and recovery

Work began from the clean, synchronized source base `02b078d`. Recovery branch `checkpoint/2026-11-27-phase2-start-02b078d`, a verified full Git bundle and a source archive are retained. Historical production `0197d18` / Cloudflare `5ecc7f32` remains the fallback. No history reset, user work deletion, DNS/SSL/cache-rule change or tracking re-enable occurred.

Frozen local I: build `0y43p4TdfUlmfFqlz8TuJ`, homepage SHA `e893578da90e565766c33104ebd7092f79ffea6cc710efd5d4ccf2fbfbe98c7c`, [preview](http://127.0.0.1:3220). All 159 recorded runtime/content/config input hashes match. Its 877 source tests, lint/typecheck, CMS JSON preflight (29 files), dependency disposition, production-public build/admin guard and asset/export/crawl/codec/source/package gates pass. Explicit production metadata checks verify 27 canonical URLs / 28 served routes and draft exclusion. The local-mode admin is never uploaded; the existing GitHub/Cloudflare workflow builds cloud-mode admin.

Retained failures include a rejected PNG strategy, a Target source/export mismatch caught and rebuilt, and asynchronous test/capture setup mistakes corrected without weakening processing assertions. B/C preview metadata was incorrectly described as production-equivalent and corrected before Lighthouse/release. Real WebKit thumbnail errors were fixed, and external SIGTERM 143 interruptions were not counted as full passes.

Long tests now use owned detached runners and durable completion files. Shared-host memory/swap observations constrain concurrent tests; no user processes were terminated by this work.

The dependency audit reports 0 production advisories. Raw tooling/editor reports remain at 8 high / 10 moderate / 2 low, with the existing exact-hash/runtime-verified Zod backport disposition. This is not an advisory-free or vulnerability-free certification. Existing React 18 deprecation and ignored parent lockfile notices remain documented; no gate was disabled to hide them.

**Phase 2 Git commit, push, CI, cloud build, hosted CMS and live acceptance are still pending.** The progress ledger will record their real identities after success, not infer them from local files.

## G. Remaining limitations

Pending acceptance items above remain pending, not passed. No number-one ranking, universal 70% saving, invisible lossy output or microsecond processing claim is established. Physical iOS/Android/Safari, all assistive technologies, the full wide-gamut/HDR/CMYK matrix, every maximum-size/long-running file and field INP remain uncertified.

Tight Target mode can take 13.5 s on the recorded sample; browser media time depends on actual duration, codec and device. PDF optimization is structural. ZIP creation uses flat basenames with no folder-picker workflow; archive extraction supports ZIP. Explicit pre-existing video caps remain opt-in, with original dimensions as the default; image output resizing is absent.

CloudConvert output remains blocked by its daily credit allowance. Provider encoder-only comparative speed is unmeasured. Competitor mobile, batch-limit and privacy behavior was not a systematic cross-provider acceptance matrix. Separate initialization/decode/encode/download stage timings are not established for all 14 tools; sampled engine, browser and network scopes remain distinct. Google’s 24-example reconciliation is not a fresh individual URL inspection of every canonical.

Earlier ordinary Chrome/Firefox HTTP/3 probes on the old live release did not reproduce the native IAB QUIC observation. Fresh live transport investigation is still in progress; those earlier probes do not establish current site-wide reliability or explain the native-client failure. The report does not claim 100 performance across the site or complete device, accessibility or security certification.
