# Phase 2 — search and editorial decisions

Reviewed 27 November 2026. This document separates source findings, historical search observations and decisions that need fresh account data. It does not report a ranking gain or new search-volume measurement.

## Current source findings

The existing static export supplies one page-specific title, description, canonical and H1 for each canonical page. Tool structured data describes a free browser application; article metadata and schema use the supplied author or actual site publisher. Published posts alone enter discovery and the sitemap. Drafts and archives remain excluded. There are 14 canonical tools, five published articles and 27 canonical pages in the prior accepted export; the WAV alias is deliberately excluded from the sitemap. The next production build and crawl must verify that inventory again after Phase 2 changes.

The earlier roadmap's statement that production publishing was unverified was stale. It now names the verified `0197d18` release and real Tina publishing scenario, without applying that result to new changes.

The CMS already supports categories, tags, supplied authors, featured images, excerpts, SEO text, publication/revision dates, drafts, paragraphs, headings, lists, numbered lists, internal links, restricted HTML, tables and references. Its publish/date/URL/HTML validators must remain in place. Article tool suggestions currently derive from the selected illustration; they are not a separately editable related-tools field. Custom external canonicals are not offered. Neither missing option warrants changing working routes without a defined editorial need.

## Intent-to-page decisions

These query clusters are qualitative opportunities unless a row is explicitly linked to a measured search-property record. No search volumes are inferred from them.

| Existing destination | Main intent | Product evidence needed before expanding claims | Editorial decision |
| --- | --- | --- | --- |
| `/` | Private file tools and product discovery | Actual local processing and clear supported types | Keep a short product introduction and direct tool access; do not repeat every format keyword in the title. |
| `/compress` | Compress mixed files | Correct format dispatch and honest aggregate savings | Keep broad-file intent here, with format-specific links when a user needs detailed controls. |
| `/image-compressor` | Compress photos/graphics or choose an output | Same-file quality/size/speed benchmarks | Explain preset trade-offs with measured examples; do not promise a fixed percentage. |
| `/jpg-compressor` | Reduce JPG/JPEG file size | Photo, gradient, detail and already-optimized samples | Prefer this broad JPEG-size workflow for new internal links while retaining the existing camera-export page pending URL data. |
| `/jpeg-compressor` | Optimize camera JPEG exports | Orientation, color profiles and metadata | Preserve its actual camera/export guidance. Check Google-selected canonical and query/page overlap before consolidation. |
| `/png-compressor` | Compress PNG and preserve transparency | Exact lossless pixels and separately labeled color reduction | Publish lossless-versus-color-reduction guidance only with the actual output examples and an explicit quality distinction. |
| `/webp-compressor` | Reduce WebP file size | Lossy/lossless characteristics, alpha and decoded output | Explain that re-encoding an optimized image may not help; avoid a duplicate page for every query variant. |
| `/gif-compressor` | Reduce an animated GIF | Frames, delay, loop, alpha and palette behavior | Show one real animation example; no unsupported frame-rate or resize control. |
| `/video-compressor` | Reduce MP4/MOV size | H.264/AAC streams, dimensions, duration and A/V sync | State first-engine download separately from encoding; keep realistic browser limits. |
| `/webm-to-mp4` | Compatible MP4 from a recording | Real WebM conversion/remux, timestamps, frames and audio | Prioritize exact URL indexing inspection and a verified troubleshooting guide. |
| `/mp3-compressor` | Reduce MP3 bitrate/size | Actual bitrate, sample rate, channels and duration | Explain lossy re-encoding and distinguish it from loudness compression. |
| `/wav-compressor` | Convert WAV to MP3 | Actual chosen bitrate and valid audio | Preserve WAV-to-MP3 intent; keep `/wav-to-mp3` as the existing canonicalized alias. |
| `/pdf-compressor` | Reduce PDF size privately | Structural savings and independently inspected pages/text | Retain structural-only limitations. Image recompression and OCR are not implemented claims. |
| `/zip-compressor` | Create a ZIP locally | Byte-identical extraction, duplicate/folder handling | Explain packaging versus reducing already-compressed media. |
| `/archive-compressor` | Extract ZIP without uploading | ZIP integrity and unsafe-path/expansion rejection | State ZIP support; do not target RAR/7z extraction before implementing those formats. |

## Search evidence and the sitemap count difference

The **26 November historical** Google three-month Web report showed 2 clicks, 60 impressions, 3.3% CTR and average position 27.8. Its indexing report was processing and field Core Web Vitals had no data. Bing's three-month property report showed 0 clicks/0 impressions. Both displayed 26 sitemap-discovered URLs while the accepted export listed 27 canonical URLs. These are retained baselines, not freshly measured figures for this phase.

The one-URL difference does not identify an absent page. Discovery, successful sitemap retrieval and actual indexing are different states. Check the latest sitemap fetch date and individual URL inspection for the home page, `/compress`, `/webm-to-mp4`, JPG/JPEG and the remaining canonical URLs before assigning a cause. Record user-declared versus engine-selected canonical, last crawl, fetch/index status and any reason shown. Do not submit repeated indexing requests to disguise missing evidence.

For performance comparisons, retain the same report window/search type and page/query filters. Export the two tables separately; do not infer which query landed on a page by joining independent totals. One additional day and a tiny sample cannot establish a ranking trend or CTR-test winner. Bing research impressions for a selected multi-month period are not monthly search volume or our traffic.

### Fresh read-only account observations — 27 November

The verified Google three-month Web report still shows **2 clicks, 60 impressions, 3.3% CTR and average position 27.8**. Its chart activity spans 20–24 November; the screen says last updated three hours ago. This is a refreshed account reading with unchanged totals, not growth. The native report-export download timed out after 20 seconds and produced no file. The visible tables were captured separately; no successful CSV export is claimed.

All 11 visible query rows were reviewed. The branded query `filecompresser` has 1 click, 2 impressions and average position 2.0. The ten non-brand queries have average positions 36.0–95.0; **none is in the requested 5–30 query-position band**. The query `compress files` has 0 clicks / 5 impressions / position 73.2. Do not merge those rows with independent page totals to infer query-to-page attribution.

The refreshed device table records desktop **1 click / 42 impressions** and mobile **1 / 18**, unchanged from the prior observation. This sample does not support a claim that either device audience converts better or needs a separate search landing page (`gsc-devices.txt`).

The first 10 of 22 country rows were also captured: Philippines 1/6, Pakistan 1/3, United States 0/22, Canada 0/5, India 0/3, United Kingdom 0/3, Bangladesh 0/2, Brazil 0/2, Hong Kong 0/1 and Vietnam 0/1 (clicks/impressions). This is the displayed subset, not an exported complete country dataset. The counts do not justify country-specific pages or localization claims (`gsc-countries.txt`).

Both fresh Google **Manual actions** and **Security issues** panels say no issues detected. The Core Web Vitals panel, last updated 25 November, reports insufficient usage data over the last 90 days for **both mobile and desktop**. There is no field INP/CWV pass to claim; browser/lab audits and application security review remain separate evidence.

| Selected page | Clicks / impressions | Average position | Decision boundary |
| --- | ---: | ---: | --- |
| `/` | 2 / 12 | 23.8 | Preserve accurate broad-tool intent; too little data for a title-test conclusion. |
| `/compress` | 0 / 19 | 57.1 | Product task completion first; no evidence of a page ranking in the 5–30 band. |
| `/blog/honest-file-size-reporting` | 0 / 19 | 7.8 | Review useful answer/snippet clarity, but 19 impressions cannot establish a CTR-test winner. |
| `/blog/compressing-files-for-the-web` | 0 / 6 | 10.8 | Keep practical format guidance and natural tool links. |
| `/blog/choosing-a-compression-mode` | 0 / 5 | 10.2 | Update any instructions affected by the measured engine changes. |
| `/image-compressor` | 0 / 3 | 11.7 | Prioritize real image results; three impressions do not support a ranking forecast. |

Page indexing has finished its earlier processing state: the overview now reports **24 indexed / 6 not indexed**. The recorded exclusions are three redirects, one noindex resource and two discovered-but-not-indexed pages:

| Exact inspected URL / group | Observed Google state | Action |
| --- | --- | --- |
| `http://www.filecompresser.com/`, `https://www.filecompresser.com/`, `http://filecompresser.com/` | Page with redirect | Intended canonical-host/HTTPS routes. Preserve the redirects. |
| `/THIRD-PARTY-NOTICES.txt` | Excluded by noindex | Intended resource exclusion. Preserve it; this is not a public landing-page defect. |
| `/contact`, `/jpg-compressor` | Discovered, currently not indexed; last crawl N/A, first detected 24 November | Confirm accessible canonical HTML and useful internal links; do not invent a crawl failure or repeatedly request indexing. |
| `/webm-to-mp4` | URL unknown to Google; no recorded crawl, referring sitemap or selected canonical | Confirm current sitemap/links and successful delivery. The inspection does not establish why discovery has not occurred. |

The Google sitemap view still shows 26 discovered URLs, last read 26 November. An individual URL's lack of a referring-sitemap record is not a complete exported list of discovered URLs; it does not by itself prove which URL explains the aggregate 26-versus-27 difference.

The full displayed set of **24 indexed URL examples** was subsequently captured with the table expanded to 100 rows and compared with the browser-viewed 27 canonical sitemap URLs. The exact absent canonical URLs are `/contact`, `/jpg-compressor` and `/webm-to-mp4`; there are no indexed examples outside that sitemap. The first two agree with their discovered-not-indexed reports; the third agrees with the separate unknown-URL inspection. This closes the indexed-set comparison without inventing the sitemap's undisclosed 26-URL discovery set. The indexing UI labels its update 23 November, while its example crawl rows span 21–24 November; the displayed evidence was observed on 27 November and is not a fresh individual inspection of every canonical URL (`gsc-indexed-all24.txt`, `gsc-canonical-reconciliation.json`).

Bing's refreshed property view for **27 August–26 November** remains **0 clicks / 0 impressions**. Its exact `/webm-to-mp4` URL inspection says **Discovered but not crawled**, discovered 26 November 2026. The separate live URL test says the URL can be indexed and reports no SEO/GEO issues; it still makes appearance conditional on indexing and quality checks. This is a specific crawl-delay observation, not proof the URL is indexed or a reason to replace its working canonical/robots directives. The public XML sitemap was also opened in the browser and contains all 27 canonical addresses, including WebM (`public-sitemap-browser.json`). No indexing requests, validation actions, DNS changes or search-property configuration changes were made. Fresh field Core Web Vitals are not established by these search reports.

Fresh Bing Backlinks and Recommendations views both say **“No data available.”** That does not establish a complete backlink count or certify zero site issues. The existing Site Scan history was also read: “Bing fixes verification - 23Nov2026” is completed with 28 pages, zero errors and zero warnings; the older “Az” scan on 22 November lists 29 pages, one error and 28 warnings. These are historical scans inspected on 27 November, not new scans of the Phase 2 candidate (`bing-backlinks.txt`, `bing-recommendations.txt`, `bing-scan-history.txt`).

Bing Keyword Research was separately queried for **`image compressor`**, with **All** filters/devices and the **3M** view spanning **27 August–24 November 2026**. It displayed **118.3K impressions**. The selected rounded research values below are not monthly search volume, Google demand, or FileCompresser traffic:

| Related phrase | Displayed research impressions, selected 3M view | Existing intent destination |
| --- | ---: | --- |
| `compress image` | 81.7K | `/image-compressor` |
| `reduce image size` | 63.9K | `/image-compressor`; explain file bytes versus dimensions because resizing is not offered. |
| `photo compressor` | 36.2K | `/image-compressor`, with photographic JPG guidance. |
| `compress photo` | 10.7K | Same capable image workflow; no duplicate landing page needed. |
| `compress image size` | 7.9K | Image workflow and verified target-byte guidance. |
| `image compress` | 6.9K | Same image workflow. |
| `image compressor free` | 4.4K | Same image workflow and truthful no-account/free positioning. |
| `image compressor online` | 3.9K | Same image workflow; explain that processing stays local. |
| `picture compressor` | 2.3K | Same image workflow. |

A separate **`compress png`** query displayed **23.8K research impressions** with the same All/3M filters and **27 August–24 November** period (`bing-png-keywords-loaded.txt`). Its related-phrase list also includes resizing and unrelated document tasks; those rows do not justify claiming that our PNG tool resizes images or compresses PDFs.

This research reinforces the image-engine priority exposed by the owner's complaint. It does not establish that a specific preset, new page or title will rank. The fully loaded image view is retained as `bing-image-keywords-loaded.txt`; the earlier WebM/PDF research remains separately dated in the historical roadmap.

Native account evidence is retained under `.qa-results/phase2/search/`, including the full 11-query capture, selected page rows, indexing examples and exact WebM inspection. Those local text captures record the observed interface; they are not fabricated exports or public traffic analytics.

## Evidence-led editorial queue

This is a sequence of review slots, not a promise to publish on fixed dates. Keep any new draft unpublished until its evidence and instructions are reviewed.

| Slot | Useful article or existing-guide update | Required original evidence | Relevant tools |
| --- | --- | --- | --- |
| 1 | Why one image shrinks and another does not | At least a photo, text/graphic and already-optimized source; bytes, dimensions, repeated timings and side-by-side output | Image, JPG, PNG, WebP |
| 2 | Lossless PNG and color reduction: what changes? | Transparent edges, gradients, decoded-alpha/pixel checks, separately labeled settings and size/quality results | PNG, image |
| 3 | Why the first video or audio job takes longer | Separate engine fetch/init and warm processing; actual codec/duration/timestamp checks | Video, WebM, MP3, WAV |
| 4 | A PDF that barely shrinks: structural optimization limits | A structurally redundant and an already-efficient PDF, pages/text verification, truthful limits | PDF |
| 5 | ZIP packaging, extraction and safety limits | Byte-exact files, duplicate names/folders and a refused unsafe archive | ZIP creator, ZIP extractor |

Reuse existing articles when the answer fits. A new article needs a distinct user problem and original evidence, not an additional spelling of a keyword. The earlier calendar's target-byte article remains deferred until current target-mode results are independently verified.

For any benchmark article, use this reusable Tina block sequence: short problem/introduction; H2 identifying the sample/method; a table of exact input/output/settings/timings; uploaded side-by-side image with descriptive alternative text and caption; a paragraph explaining the quality/size trade-off; numbered reproduction steps; a limitations callout; a relevant tool link; and primary references. The author, revision date and reported environment must be factual. Do not publish a draft containing placeholder measurements.

One concrete review draft is prepared in `content/posts/png-lossless-smart-maximum-measured.json`: a three-input comparison of Lossless, Smart and Maximum using the independently checked PNG outputs. It explains exact opacity versus RGB changes, visible banding, identical screenshot pixels with different starting encodings, and local/device limitations. Its first content block explicitly identifies the reused cover as a conceptual illustration, not a benchmark chart; no unsupported hero-caption field or duplicate asset is introduced. The actual supported publication field is `published: false`, so it remains excluded from public collections, generated routes and the sitemap; there are still five published posts. An in-memory published copy passed the content validator, the measured table matches the selected evidence, and the actual organization publisher is used without inventing an author. This draft is ready for editorial review, not a publicly released article or a measured search-growth result.

## Supported CMS accessibility correction

Phase 2 adds supported text/textarea field-plugin wrappers through `cmsCallback`. The wrappers keep the installed Tina component, parser and validator, while supplying the input ID referenced by its existing label, a concise accessible name and required/invalid semantics. No dependency patch, post-render DOM mutation, content rewrite or schema migration is involved. Native editor verification and final build status are recorded in the main progress document; the source change alone is not a claim of complete admin accessibility.

## Primary references and their effect on these decisions

- Google's [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) supports canonical URLs and truthful modification dates. A sitemap is not an indexing guarantee.
- Google's [canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) supports consistent redirect/canonical/sitemap signals. A JPG/JPEG consolidation needs actual URL evidence and a reviewed migration.
- Google's [title-link guidance](https://developers.google.com/search/docs/appearance/title-link) supports concise, distinct descriptive titles rather than repeated keywords; exact character counts are not a ranking rule.
- Google's [snippet guidance](https://developers.google.com/search/docs/appearance/snippet) explains that search snippets can come from page content and vary by query. Editing a description does not guarantee the displayed snippet.
- Google's [people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) favors original useful information and realistic claims. This is why verified benchmark examples take priority over bulk articles.
- Tina's [custom components](https://tina.io/docs/extending-tina/custom-field-components) and [CMS extension hook](https://tina.io/docs/extending-tina/overview) document supported field customization while retaining editor integration.

Automatic analytics/RUM remains disabled by the owner's explicit choice. Product measurements stay in the local benchmark/QA evidence; no file names, contents or tool events are sent to a new analytics service. No DNS or search-property settings are changed by this plan.
