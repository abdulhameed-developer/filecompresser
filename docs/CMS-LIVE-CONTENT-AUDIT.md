# CMS → Git → build → public content audit

28 November 2026 (Asia/Karachi). **The local candidate A passes 28/28 served views and 3,654 field checks. A Phase 3 live release is not yet established by this report.** The pre-change public site fails the current content/display requirements against the last saved Tina Git content, `b32caea`. Hosted Tina indexing, actual Save, CI and Cloudflare production identity require separate native-account evidence; reading Git files alone does not establish those stages.

## Inventory and source preservation

The checkout was fast-forwarded to the SEO team's current Git content before editing, with no overwrite. The Phase 3 starting checkpoint and bundle preserve `b32caea`. The content inventory is **29 JSON records**: one homepage, fourteen tools, six managed pages, six article records, one shared settings record and one redirect record. Five articles are published; one remains a draft. The redirect record currently has zero rules. Thus 27 records supply published content or shared configuration; the draft and empty redirect configuration are tracked separately.

There are **27 canonical public pages**, **28 served views including `/wav-to-mp3`**, and one separately checked draft URL. The HTML sitemap is included even though it is generated from the route/article registry rather than a separate CMS record. Shared support email, publisher, application name, social site name and all fourteen footer tool links are checked on each applicable public view. Canonical-only XML sitemap entries and truthful `lastmod` values are checked independently.

The source reader records exact JSON bytes and SHA-256, committed HEAD hashes and whether every content file matches HEAD. A working copy that passes rendering is explicitly labeled uncommitted when it differs from Git. Before/after source snapshots prevent a mid-run content change from being reported as a stable result. The final reader also pins app/component/library code and CSS; this is a stability guard, not proof of CSS visibility or screenshots.

## Why saved content can be missing

Two independent problems are visible in the source/public comparison:

1. **Newer saved tool content is absent on the public site.** The eleven edited canonical tool records have stale headings, body sections and/or metadata publicly. The WAV alias repeats the WAV source mismatch. For example, saved PNG `seoTitle` is `PNG Compressor Online Free – Reduce PNG File Size`, while public HTML reports `PNG Compressor — Keep Transparent Images | filecompresser`. The saved JPEG introduction mentions optional resizing; the public introduction is a different older paragraph. Phase 3 corrects unsupported claims while preserving useful SEO additions. The native deployment audit must establish which newer build failed and why; a field mismatch alone does not identify a Cloudflare build error.
2. **Saved custom FAQs were not selected for display.** Thirteen tool records retained **76 nonempty custom FAQ rows** while the saved `faqMode` field was omitted, making its effective mode `default`. All fourteen starting tool records omitted that field; WebM had no custom rows. The reader was correctly selecting built-in FAQs under that fallback. This is a display-mode issue, not proof that Tina failed to save the rows. The candidate explicitly selects `custom` for all fourteen reviewed tool pages and verifies both visible FAQ order and corresponding FAQ schema. Hidden mode still means hidden; the checker must not insist on publishing retained custom rows when that mode is intentionally chosen.

The pre-change baseline has **815 field mismatches across 19 of 28 views**, not 815 independent defects. Several are the new Phase 3 single-update-date requirement, and one extra old update paragraph shifts many article block comparisons. Nine views pass all tested requirements. These failures remain recorded; the local candidate's pass does not erase them. The public baseline uses exact saved source `b32caea`; it does not compare pending local editorial rewrites against production and call that a stale Save.

## What the checker verifies

The [CLI](../scripts/content-parity.mjs) reads raw CMS JSON, plus pure registry/art data, and compares it with exported HTML or ordinary public GET responses. It does **not** import the production content parser or React renderer to manufacture its expected page. The [DOM checker](../scripts/content-parity-core.mjs) uses a separate Markdown-link reader and browser HTML parser for expected content semantics.

For each applicable field it records the source record, field path, expected value, actual value and pass/fail result:

- Page H1, editorial heading, introduction and exact ordered sections.
- Paragraphs, bullet lists, numbered steps, item order, link labels/destinations and supported safe-HTML formatting. Latest words hidden in a serialized Next script do not count as public prose.
- Effective FAQ display mode, visible question/answer order and matching FAQ JSON-LD. The source inventory separately identifies retained rows disabled by `default` or `hidden` mode.
- Tool output description/schema and related tool links; managed card/detail/text placement, body/items/links, support and footer fields.
- All five article bodies, headings, lists, images, alternatives, captions, tables, references and tags; actual illustrated figure identity.
- One visible `Updated Month D, YYYY` date in article headers, blog cards, homepage features and related cards; original `datePublished`, actual `dateModified`, Open Graph dates and sitemap `lastmod` stay separate.
- Titles/descriptions, primary canonical, robots directives, social title/description/image/alt/URL, valid JSON-LD and applicable shared settings.
- All canonical sitemap entries with no duplicate or draft URL; draft links/schema absent across public pages and the draft route absent/404. Empty redirect configuration is inventoried; the final checker also compares exported rules or tests configured live redirects without following them silently.

Whitespace is normalized for visible prose; Markdown link syntax is compared as rendered text plus an exact link destination. Formatting/list structure is checked separately. The installed Next export emits the root canonical and Open Graph URL as `https://filecompresser.com` without a trailing slash; that exact spelling is modeled. No broad HTML stripping or content normalization allows missing paragraphs or links to pass.

## Page-by-page baseline and candidate A

| Served view | Last saved source → pre-change live | Current source → candidate A export |
|---|---|---|
| `/` | Fails new featured-card date requirements; custom FAQ/content matches | PASS |
| `/compress` | PASS | PASS |
| `/image-compressor` | PASS | PASS |
| `/jpg-compressor` | Stale editorial fields | PASS |
| `/jpeg-compressor` | Stale editorial fields | PASS |
| `/png-compressor` | Stale metadata/editorial fields | PASS |
| `/webp-compressor` | Stale metadata/editorial fields | PASS |
| `/gif-compressor` | Stale metadata/editorial fields | PASS |
| `/video-compressor` | Stale metadata/editorial fields | PASS |
| `/webm-to-mp4` | PASS | PASS |
| `/mp3-compressor` | Stale metadata/editorial fields | PASS |
| `/wav-compressor` | Stale metadata/editorial fields | PASS |
| `/pdf-compressor` | Stale metadata/editorial fields | PASS |
| `/zip-compressor` | Stale metadata/editorial fields | PASS |
| `/archive-compressor` | Stale metadata/editorial fields | PASS |
| `/wav-to-mp3` | Same stale WAV record on canonicalized alias | PASS |
| `/about` | PASS | PASS |
| `/contact` | PASS | PASS |
| `/privacy` | PASS | PASS |
| `/terms` | PASS | PASS |
| `/disclaimer` | PASS | PASS |
| `/blog` | Fails required update-date presentation | PASS |
| `/blog/compressing-files-for-the-web` | Old date/duplicate-update presentation | PASS |
| `/blog/what-privacy-claim-really-means` | Old date/duplicate-update presentation | PASS |
| `/blog/choosing-a-compression-mode` | Old date/duplicate-update presentation | PASS |
| `/blog/honest-file-size-reporting` | Old date/duplicate-update presentation | PASS |
| `/blog/how-browser-compression-works` | Old date/duplicate-update presentation | PASS |
| `/sitemap` | PASS | PASS |

All rows above were actually parsed from HTML, not inferred from one representative route. Candidate A is an intermediate frozen export, not a claim that every later change has been released. Its content differs intentionally from committed HEAD at the time of this audit. Final candidate and production evidence must be added after the release gates.

## Meaningful negative controls

The [test file](../tests/content-parity.test.ts) currently passes **37 tests**, with targeted lint/typecheck also passing. Manually authored HTML fixtures establish that the independent checker detects stale visible text even when the latest text exists in script data; missing/extra paragraphs; missing lists; wrong list type/order; wrong link destinations; missing FAQ answers; stale schema; hidden-FAQ violations; old/duplicate metadata; wrong canonical; missing/noindex robots; accidental draft links/schema; delivery failure; wrong image alt/source/caption; false publication/modification dates; duplicate visible creation dates; stale/duplicate/draft sitemap entries; non-200 sitemap delivery; wrong or missing XML MIME; and malformed XML. Positive controls cover root URL serialization, separate legal introductions/footers and nested-parenthesis links and XML MIME charset parameters. The standalone HTTP checker requires status 200 and application/xml or text/xml; a valid XML body on an error response does not pass.

The initial candidate A audit failed five checker-scope assertions: a root trailing-slash expectation and a legal introduction selector that also selected its footer paragraph. Those original reports were preserved. The precise root spelling and legal introductory position were corrected; additional positive/negative controls retain strict paragraph checks. The fresh A report passes all 28 views with zero field mismatches. No source content, output file, build artifact or assertion about a missing paragraph was removed to make it pass.

The export parity gate is integrated into `scripts/check-export.mjs`. CI explicitly expects its intended `noindex, follow` metadata; the production build expects `index, follow`. Direct public checks default to `index, follow` independently of the CI environment. The API and CLI reject noindex or nofollow overrides for a non-loopback remote host. Extra tests cover wrong/contradictory directives, missing export routes and the valid cleared optional homepage hero/step fallbacks. No live production indexing assertion is relaxed.

## Hosted editor field inventory

A separate private expected-value manifest inventories **all 29 CMS records**, not only their titles. The saved b32caea snapshot contains 1,150 raw leaf values; the reviewed working source contains 1,238. Both inventories also identify 220 absent optional schema fields. Exact JSON paths, Unicode/newlines, list order/counts, template choices, field labels, document/editor URLs and source hashes are retained. No populated raw source field is unmapped to the current schema.

This is preparation for native hosted Tina verification, not a hosted pass. Every actual hosted value remains NOT_INSPECTED in that manifest until a mounted control is read. Schema-derived control names are labeled unobserved. Collapsed nested lists must be opened to verify their children; one document title, timestamp or successful local parser does not establish all saved fields. Absent optional source values are recorded separately instead of inventing a value from an editor default. The final committed snapshot should be regenerated after the reviewed commit, then compared with the hosted index and actual controls.

Native TinaCloud project configuration also confirms the intended repository, separate content repository off, and a listed main index (displayed as indexed 3 hours ago). The unindexed-branch warning concerns the old work/codec-source-rebuild-20261121 branch. No setting or index was changed. Index presence is separate from exact saved field/commit parity.

The [official hosted read-API investigation](TINA-CONTENT-API-AUDIT.md) is separately marked BLOCKED_TOKEN_UNAVAILABLE. A typed all-29-record query validates offline, but no cloud response is claimed. A native visible-field matcher is prepared with 19 passing synthetic controls; unmounted/unobserved hosted values remain unverified. No browser session credential or hidden editor state was extracted.

## Reproduce the read-only checks

```sh
# Local rendering against the current reviewed source. This does not build.
node scripts/content-parity.mjs --export=out --output=.qa-results/phase3/content-parity/local.json

# A deliberately non-indexable local/CI export (public checks cannot use this override).
node scripts/content-parity.mjs --export=out --expect-noindex --output=.qa-results/phase3/content-parity/ci.json

# Pin the saved Git data for a historical public mismatch investigation.
node scripts/content-parity.mjs --source-ref=b32caea --base=https://filecompresser.com --output=.qa-results/phase3/content-parity/before.json

# After the reviewed source is committed and deployed, require Git parity.
node scripts/content-parity.mjs --source-ref=HEAD --require-committed-content --base=https://filecompresser.com --output=.qa-results/phase3/content-parity/live.json
```

No retry, cache-busting parameter, custom user agent, security bypass, output rewrite, Tina Save or deployment is performed. Fetch/HTTP failures remain failures. A redirected document is not silently treated as the intended 200 page. The configured draft route must be absent or return 404.

The [public evidence ledger](evidence/2026-11-28/cms-content-parity.json) retains all page-specific mismatch fields and exact expected/actual values, hashes, source record inventory, dated checks and intermediate status. Full raw before/A reports remain under `.qa-results/phase3/content-parity/`; their hashes are pinned in the public record. The rendered-content checks do not certify screenshot quality, CSS visibility, hydrated interaction states, hosting reliability, physical devices or the editor's current indexed document. Those require the separately recorded browser/release checks. Automatic analytics stays disabled.

## Independent candidate H checkpoint review

Candidate H completed all 13 local gates with 1,252 tests in 65 files passing. An independent read-only review on 28 November rechecked all 29 content-record hashes, 88 runtime input hashes, the identical 303-file before/after source maps, all 28 exported pages, the 27 canonical sitemap entries and the unpublished article exclusion. The saved full parity report contains 3,654 passing page checks and 16 passing sitemap checks with no mismatches.

A separate Python HTML/XML parser performed **900 checks**: all-page metadata, canonical/index/follow directives, H1, JSON-LD presence and shared support contact; raw-source FAQ order/text/link destinations and FAQ schema across Home and all served tool views; original publication and updated dates on all five articles; sitemap dates and draft exclusion. Its narrower extraction scope is explicit rather than presented as an independent reimplementation of all 3,654 prose/markup checks. [Checkpoint evidence](evidence/2026-11-28/candidate-h-independent-review.json).

The local preview at `http://127.0.0.1:3323/` returned HTTP 200 with home SHA-256 `b53f2d52bf61f05e2746674b22117fe7e2b4b2b82f347dbf3a09eb76971dc087`, matching the saved H export at the time checked. H used uncommitted working-tree changes based on `b32caea43c83b35dfb17cbafeaa8a2f1fed587dd` on `main`. It is a local checkpoint, not proof of a new committed or deployed release. Candidate I is planned for article diagram legibility changes; its final gates and hosted/live field checks remain separate.

## Independent final candidate I checkpoint review

Final local candidate I passed all 13 gates with **1,257 tests in 66 files** and identical 304-file before/after source maps. An independent review at 11:13 UTC on 28 November confirmed all 29 raw source-record hashes and 88 runtime input hashes against the immutable I report. All 28 exported route reports contain **3,654 passing page checks**, with 16 passing sitemap checks, 27 canonical entries and the unpublished article excluded.

The separate Python HTML/XML/raw-source review again passed **900 targeted checks** across every exported page, all Home/tool FAQ values and links, five article publication/updated dates, sitemap dates and draft exclusion. [Final local checkpoint evidence](evidence/2026-11-28/candidate-i-independent-review.json). Its independent extraction scope remains narrower than the complete parity checker and is documented in the evidence.

Build ID: `M34muGWfVTCv-xRgtWWqN`. The local preview returned HTTP 200 with home SHA-256 `2ca99e2bea55fc605bf25e3bc16d70067f2624640d1d3fa945aaf5b73323992a`, matching I. At review, the branch was `main`, with uncommitted candidate changes based on `b32caea43c83b35dfb17cbafeaa8a2f1fed587dd`. This approves the local source/export cohort within the recorded scope; a committed release, hosted Tina fields/Save and custom-domain live parity still require their own evidence. Final visual, workflow and performance evidence is recorded separately.

## Release-checker blocking-rule correction after I

A read-only release review exposed a checker blind spot: changing only the saved I homepage’s Googlebot meta to `noindex, nofollow` still passed the earlier inspector. The actual I pages were correctly configured; the failure was in acceptance coverage. The preserved before control and the corrected after control distinguish that gap from a site regression.

The checker now combines ordinary meta with global and applicable Googlebot/Bingbot HTTP rules and crawler meta, recognizes `none`, retains restrictive mixed directives, and catches mixed-case duplicate ordinary robots tags. Unrelated crawler scopes and `max-image-preview: none` do not create false failures. Remote responses retain their HTTP rule evidence and manual redirect behavior. This follows the documented [Google robots directive semantics](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) and [Bing noindex guidance](https://www.bing.com/webmasters/help?topicid=37c07477).

Only `scripts/content-parity-core.mjs`, `scripts/content-parity.mjs` and their parity test file changed. **59 focused tests** (55 parity and four publication), scoped lint and type checking passed. The stricter checker passed the immutable I export with **3,822 page checks and 16 sitemap checks**, zero mismatches, all 28 HTML hashes unchanged and the original I report preserved. [Release-checker review and source hashes](evidence/2026-11-28/release-checker-review.json). These post-I checker checks are separate from I’s original 13-gate build; they do not imply a new application build or live deployment.
