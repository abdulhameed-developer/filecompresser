# FileCompresser product scorecard — Phase 2

Date: 27 November 2026 (Asia/Karachi). **Published and verified within the recorded scope.** This scorecard separates algorithm measurements, real workflows, public delivery and search outcomes. Historical release `0197d18` / Cloudflare `5ecc7f32` is the before-release baseline/fallback; current production is `5fdf646` / Cloudflare `3f5114e1`.

Frozen local **I** reference, build `0y43p4TdfUlmfFqlz8TuJ`, passes 877 source tests in 56 files, Chromium 79/79 with 57 verified downloads, 45 three-engine image cases, axe 29/29 and 348 responsive measurements. [Local preview](http://127.0.0.1:3220). These are local results; the four H browser suites remain separately identified. Published source `5fdf646` / Cloudflare `3f5114e1` passes the final live 79/57 workflow, genuine Tina publishing, four ordinary delivery checks and fresh 29-view public accessibility acceptance. Final-source local preview: [127.0.0.1:3221](http://127.0.0.1:3221). I/3220 and the four H suites remain separately identified.

## Measurement rules

- Byte savings use actual downloaded bytes, matching input/output formats and original display dimensions. A larger saving is not a quality score.
- Engine timing excludes page navigation and download. Cold context, HTTP-cache reuse, initialized worker reuse and full UI time are different measurements.
- Competitor outputs are genuine native-browser downloads. Unless a repeated timing series is explicitly recorded, do not infer a speed ranking from a single UI observation.
- Quality uses independently decoded, hash-bound files, Gaussian SSIM/PSNR, exact dimensions/alpha and visual inspection. Metrics do not guarantee that a change is invisible.
- No files or filenames are collected from visitors. Analytics/RUM stays off; all new product measurements use local generated/licensed fixtures.

## Primary issues and targets

| Area | Measured starting point | Target / acceptance | Current state |
| --- | --- | --- | --- |
| Actual UI starting modes | The prior workspace started JPG/WebP and PNG in Maximum, including mixed queues; direct engine defaults differ | Moderate photo defaults; no automatic PNG color reduction; policy visible before processing | Corrected to Balanced / Lossless with visible policy; source regressions and fresh I Chromium real-output checks pass. H four-browser acceptance is retained separately |
| Smart PNG CPU cost | Generated 1440×900 screenshot: approximately 11.5–12.9 s in the isolated existing worker harness | Material latency reduction with the same dimensions, exact alpha and retained fidelity checks | Selected bounded search retains fidelity checks; 42 final outputs, native quality metrics and visual review recorded in the competitive report |
| Lossless PNG | Same screenshot: approximately 3.2–3.6 s, 83,020-byte output | Preserve exact pixels; show real savings and do not silently quantize | Lossless output bytes unchanged across all seven PNG fixtures. Actual optimized-screenshot UI click-to-result about 12.4 s old Maximum → 2.4 s new Lossless, with larger exact-pixel output; lower-effort experiment rejected |
| JPEG, explicit Balanced engine policy | Generated text JPEG: about 72% reduction at about 1.4 s; portrait fixture about 81% reduction at about 0.7 s | Compare quality-versus-size curves against genuine outputs; avoid universal percentage claims | Existing MozJPEG already effective on these inputs; this is not the old UI Maximum default. Independent native-scale quality and metric review complete for all 15 inputs; repeat provider outputs recorded separately |
| ZIP extraction scheduling | Controlled Chromium 500-small-entry engine median 2,334.7 ms across three trials | Retain every path, CRC and byte while keeping cooperative cancellation | Candidate median 130 ms; all 500 outputs independently byte checked, three trials. Fresh I Chromium 79-case UI/download acceptance passes; H four-browser results remain retained. Benchmark engine timing is separate |
| CMS text controls | Historical vendor text/textarea label association defect | Supported plugin extension; real label focus, invalid state, Save/reopen and mobile checks | Six isolated checks and genuine new-hosted native label/Save/reopen → GitHub → Cloudflare → visible/schema checks pass; only the reviewed FAQ answer changed |
| Home initial client graph | Full tool registry imported through shared client navigation/directory/home modules | Keep editorial/SEO registry data on the server without delaying upload or changing navigation | Current I home JS references 702,082 → 667,374 raw B; HTML/JS/CSS per-resource gzip estimate 260,001 → 251,037 B (−8,964 B). Includes legacy nomodule references, not actual browser wire bytes. I Chromium functional acceptance passes; H four-browser results remain retained |
| Responsive article artwork | The custom pipeline cover bypassed responsive stock delivery and requested the full 65,252-byte upload on mobile | Serve appropriate source widths while preserving authored content and CMS replacement fallback | I uses guarded 640/768/1200 sources; 45 actual three-engine cases pass. Current authored source/alt/metadata are preserved; nonempty captions and changed/unknown uploads also pass source/SSR tests |
| Mobile homepage Lighthouse | Historical production P75 / A100 / BP100 / SEO100 | Improve actual main-thread work; repeat comparable measurements | Local and old-production lab series are recorded separately; the ledger retains all measured and excluded/blocked attempts with their individual statuses. Shared-host final representative performance is 94–100; all ten complete A/BP/SEO scores are 100. One separate official homepage UI analysis scored all four categories 100 mobile/desktop. No universal or causal score-gain claim |

Raw benchmark evidence is under `.qa-results/phase2/`. The competitive report records sample identities, actual outputs and their measured trade-offs. [The consolidated Lighthouse ledger](evidence/2026-11-27/lighthouse-measurements.json) preserves measured and excluded attempts; payload estimates do not establish a performance score.

## Fourteen-tool verification register

All 14 canonical tools and the WAV alias received fresh individual Chromium real-output acceptance on I. Four H browser/input suites remain retained for the unchanged processing/workspace source. Their identities are preserved in `PROJECT_OVERHAUL_PROGRESS.md`; H is not relabeled as four new I suites.

| Route | Phase 2 engineering / output focus | Fresh full UI + download test | Remaining boundary |
| --- | --- | --- | --- |
| `/compress` | Mixed dispatch, queue and new image engine | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Sampled mixed formats, not every possible file |
| `/image-compressor` | JPEG/PNG/WebP, timing, dimensions, alpha, quality | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | No image resizing; no AVIF/SVG tool |
| `/jpg-compressor` | Real photo/text quality curves, original retention | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Lossy re-encoding can alter detail |
| `/jpeg-compressor` | EXIF orientation, profiles, large images | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Wide-gamut/HDR coverage must be explicitly stated |
| `/png-compressor` | Exact lossless samples; optional guarded color reduction | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Lossless and lossy results are separate comparisons |
| `/webp-compressor` | Native WebP codec, alpha, actual output bytes | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Browser codec/version can affect bytes |
| `/gif-compressor` | Frames, timing, loops, alpha, palettes | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Long/maximum-size animations not automatically certified |
| `/video-compressor` | MP4/MOV H.264/AAC streams, duration and timestamps | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | CPU-intensive browser encoding; no universal seconds promise |
| `/webm-to-mp4` | Genuine WebM conversion, compatible remux, frame/audio integrity | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Conversion may produce a larger valid MP4 |
| `/mp3-compressor` | Actual bitrate/sample rate/channels/duration | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | No claim of human listening to every output |
| `/wav-compressor` | Real WAV→MP3 conversion and low-rate cases | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | MP3 is lossy; alias separately checked |
| `/pdf-compressor` | Structural rewrite, text/pages/forms/resources | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | No scanned-image recompression, OCR, merge or split |
| `/zip-compressor` | Arbitrary input bytes, names and independent extraction | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | Flat-basename ZIP creation; no directory-picker workflow. Already compressed files may not shrink |
| `/archive-compressor` | Faster cooperative checks, CRC, unsafe paths and limits | PASS on I: Chromium desktop. Retained H: four browser/input modes. Real outputs/downloads verified | ZIP only; no invented archive support |

## Actual non-image engine samples

These figures come from direct shipped WASM/engine orchestration in Node/V8, **not browser page or network timings**. Initial media-engine load was 90 ms from the local runtime; this excludes the public engine download. All 46 media cases pass: 45 real outputs plus the expected refusal of an odd-sized video without requested scaling. Native FFprobe/full decoding verified the recorded stream/frame/timestamp properties. [Compact reproducible results](evidence/2026-11-27/nonimage-engine-results.json) retain the exact scope and source hashes.

| Generated input / operation | Actual input → output bytes | Recorded engine duration | Output / limitation |
| --- | ---: | ---: | --- |
| WebM VP8/Opus → MP4 | 57,351 → 117,724 | 399 ms | H.264/AAC; valid larger conversion, not a compression saving. |
| Compatible H.264/AAC remux | 98,312 → 99,076 | 25 ms | Compatible streams retained; real MP4 container. |
| MP4 compression | 98,951 → 49,302 | 418 ms | Verified H.264/AAC; short sample only. |
| MOV → MP4 | 99,002 → 49,302 | 369 ms | Valid compatible output; no long-video/thermal claim. |
| GIF recommended / maximum | 34,872 → 24,106 / 21,956 | 44 / 43 ms | Frames/delays/loop checked. Final E UI transparency tests pass both modes: 12,103 → 5,204 B, 12 frames, exact displayed pixels/alpha, timing/loop/dimensions. Pillow hidden-RGB distinction is retained in compact GIF evidence. |
| WAV → 96 kbps MP3 | 352,878 → 24,809 | 105 ms | Actual stream properties checked, not inferred from a selected label. |
| MP3 compression | 49,571 → 24,809 | 45 ms | Valid lossy audio; no claim of listening to every export. |
| 24-page PDF with deliberate metadata bloat | 273,765 → 21,373 | 93.4 ms median of three | Pages/text/geometry checked. This artificial redundancy is not typical PDF savings. |
| Form/attachment PDF with deliberate metadata bloat | 119,257 → 2,010 | 17.4 ms median of three | Form value, attachment bytes and page/text checks pass. |
| Already optimized PDF / synthetic image-dominated scan | 857 → 857 / 37,560 → 37,560 | 3.0 / 2.7 ms medians | Originals retained; scanned-image recompression is not implemented. |
| ZIP creation, 500 small files | 101,890 → 70,192 | 82.8 ms median of three | Independently extracted paths and byte hashes match. |

These small fixtures establish correctness and sampled timing, not a promise of universal subsecond processing. Full UI downloads also passed on candidate B in Chromium desktop and touch emulation; their browser/network scope remains separate.

## Search and release gates

Google's fresh three-month Web report still shows 2 clicks, 60 impressions, 3.3% CTR and position 27.8. Its newly available Page indexing report lists 24 indexed URLs and six excluded: three canonical redirects, the intentionally noindexed notices file, and two discovered but not indexed pages (`/contact`, `/jpg-compressor`). Exact WebM inspection reports unknown to Google; Bing reports discovered on 26 November but not crawled. Bing's live WebM test says it can be indexed and finds no SEO/GEO issues. These are discovery/crawl observations, not evidence of rankings or successful indexing.

| Gate | Phase 2 state |
| --- | --- |
| Full source tests | Current I source: 56 files / 877 passed, zero skipped |
| Lint / typecheck / CMS + production export | Full local CMS build passed for B; the unchanged admin is retained in I. I production-public build, admin guard, CMS JSON preflight (29 files), route/export, exact worker hashes and source gates pass. Genuine new-hosted CMS/cloud publishing acceptance passes |
| Real output and competitor checks | Fresh I Chromium passes 79/79 with 57 independently rehashed downloads. H retains 316/316 across four browser/input suites, 228 downloads. Competitor initial/repeat outputs and rejected attempts remain separately recorded |
| Responsive / accessibility / Lighthouse | Fresh I responsive 348/348 and expanded axe 29/29 pass; four SVG incompletes remain manually reviewed across 51 unchanged nodes (minimum 4.5786:1). I image delivery passes 45/45 across three engines. H shared/modal/workspace results remain H evidence. Current public 29-view accessibility passes with independently proven HEAD diagnostics; original failed observer preserved. Ten final shared-host Lighthouse scores and the separate official homepage result are recorded |
| Git commit / push / Cloudflare deployment | Implementation `417fcfb` and Tina `5fdf646` published normally; both CI runs and cloud builds succeed. Final Cloudflare `3f5114e1-8094-4a07-9022-4a566e8feb0e` |
| Rollback | Starting checkpoint `checkpoint/2026-11-27-phase2-start-02b078d`, verified full Git bundle and source archive; older recovery points preserved |

Physical phones/tablets, Safari/iOS, all assistive technologies, field INP, exhaustive maximum-size files and long-term ranking changes remain outside any currently established Phase 2 pass.


After live verification, one Google indexing request each for WebM, Contact and JPG was accepted. This does not establish indexing or ranking gains. The only live cache correction was an exact-URL purge of the proven stale `/logo.png`; no broad purge or cache/DNS/TLS/analytics setting changed. [Final acceptance report](PHASE2-ACCEPTANCE-REPORT.md).

<!-- PLATFORM_BROWSER_ACCEPTANCE_START -->

## Retained candidate H browser acceptance

Immutable local build `vfZQ5yf4p_TqDNwIrY5px` uses the production public origin/indexing configuration and retains the separately tested local CMS admin. It is **not a directly deployable admin artifact**. [Retained H acceptance JSON](evidence/2026-11-27/browser-functional-acceptance-H.json) records the exact homepage/worker/harness identities and every tool. The original 110 assertion calls, including the strict resource/privacy guard, remain unchanged.

| Browser / input mode | 79-case suite result | Actual browser version | Browser diagnostics |
| --- | --- | --- | --- |
| Chromium desktop | 79/79 PASS | 156.0.8078.47 | 0 console, 0 failed resources, 0 exceptions, 0 upload requests |
| Linux WebKit desktop | 79/79 PASS | 26.5 | 0 console, 0 failed resources, 0 exceptions, 0 upload requests |
| Firefox desktop | 79/79 PASS | 155.0 | 0 console, 0 failed resources, 0 exceptions, 0 upload requests |
| Chromium touch emulation | 79/79 PASS | 156.0.8078.47 | 0 console, 0 failed resources, 0 exceptions, 0 upload requests |

Every completed whole run independently processes and downloads outputs for all 14 canonical tools and the WAV alias. The suite covers real image presets/format/quality/targets, animation frames/timing/loops, audio codecs/rates/channels, video codec conversion and cancellation/retry, readable PDF, byte-exact ZIP/extraction, invalid/oversized input and replacement recovery. Desktop and 390×844 touch-mode candidate H captures include default/populated/completed states for all 14 tools; settings and short-viewport visual audits are tracked separately. The five new cases verify permanent ZIP error recovery, preserved zero-byte entries, real zero-byte extraction and real Worker failure/retry; every original74-case body remains unchanged. These functional runs do not establish comparative processing speed.

The first WebKit strict audit exposed a real thumbnail lifecycle fault: a prior same-file image URL could be revoked while geometry refinement still displayed it. The fix keeps the small preview valid until its replacement is ready. On candidate E, the reproduced recovery audit changed from 14/15 to 15/15 with zero failed resources, and that candidate’s subsequent whole WebKit audit passed 74/74 **without excluding blob failures**. The original red audit and an unrelated SIGTERM-interrupted 58-case attempt remain retained. Linux WebKit and touch emulation do not certify physical Safari/iOS/Android devices.

Additional E GIF checks exercised actual re-encoding in both modes: 12,103 → 5,204 bytes in each mode, preserving 12 displayed frames, all alpha bytes, mixed delays, loop 3 and 160 × 120 pixels. Independent Pillow and FFmpeg checks agree on displayed pixels/transparency; hidden RGB under zero alpha can differ by decoder, so universal raw RGBA identity is not claimed. Separate pre-release ordinary Chromium/Firefox delivery probes returned four exact PNG/WebM pages with HTTP 200 over HTTP/3; these observe the old live release, not deployment of this candidate.

<!-- PLATFORM_I_FOLLOWTHROUGH_START -->

### Candidate I editorial image follow-through

Candidate I, build `0y43p4TdfUlmfFqlz8TuJ`, changes only the reviewed server-rendered blog-image selection and five responsive image assets. Independent comparison verifies all 159 frozen runtime inputs, the exact nine-path editorial delta, unchanged processing/workspace/CSS/worker bytes and 28 exported public assets. Authored source, alt text, captions and metadata are preserved, including the fallback for unknown or replaced CMS images.

Fresh I Chromium acceptance passed **79/79** with **57** independently rehashed downloads, 50 state captures, normal closure and zero console/resource/exception/upload errors. Separate actual Chromium, Linux WebKit and Firefox image-delivery checks passed **45/45**; Firefox's native high-density ratio is explicitly recorded rather than described as exact emulation. [Candidate I evidence](evidence/2026-11-27/browser-functional-acceptance-I.json) contains the scope and retained failed QA attempts. The four whole suites above remain **H316/316**, with unchanged processing source; four new whole I suites are not claimed.

<!-- PLATFORM_I_FOLLOWTHROUGH_END -->

<!-- PLATFORM_LIVE_ACCEPTANCE_START -->

### Published acceptance after the hosted Tina roundtrip

[The live site](https://filecompresser.com/) at source `5fdf646` / Cloudflare deployment `3f5114e1-8094-4a07-9022-4a566e8feb0e` passed a fresh **79/79** Chromium workflow suite with **57 saved, independently rehashed downloads**, 50 state captures and zero strict browser/upload errors. All 14 tools and the WAV alias produced validated outputs; both before/after identity checks match the actual final deployment. Four separate ordinary Chrome/Firefox PNG/WebM delivery observations and two real expanded-FAQ viewport captures also passed and closed normally. [Public release evidence](evidence/2026-11-27/browser-functional-acceptance-LIVE.json) records exact raw public/immutable hashes and the 57 output proofs.

The first preflight correctly stopped before browser launch on a stale cached logo. Only the exact logo URL was purged; final bytes now match the reviewed source without a hash waiver. The only accepted HTML edge transformation removes two evidenced footer-email comments (33 bytes), with every other byte identical; 20 negative/positive guards and 17 offline preparation guards are retained. H/I history above remains separately scoped. This functional pass does not claim universal performance, every physical device or an absence of all possible defects.

A separate actual live WebM addon passed two unmodified 1280×900 viewport captures and one extra MP4 download. It shows the fixed MP4 target, **Convert to MP4**, **Format converted** and the download action within the viewport. Native validation confirms H.264/AAC, source dimensions and duration, full decoding and audible output. These two states and one download are additional evidence; the suite counts above remain unchanged.

The separate correlated live accessibility retry passed **29 views with zero automated violations** and completed an independent review of all five raw HEAD cancellation proofs. Every accepted HEAD had its own successful native response, unique browser request and matching successful route-tree response; GETs and rejected HEADs remained failures. The original seven-event strict failure is preserved separately. Four SVG checks retain their bounded manual disposition across 51 identical live text nodes. [Correlated accessibility evidence](evidence/2026-11-27/public-accessibility-correlated.json) includes the exact proof and limitations.

<!-- PLATFORM_LIVE_ACCEPTANCE_END -->

<!-- PLATFORM_BROWSER_ACCEPTANCE_END -->
