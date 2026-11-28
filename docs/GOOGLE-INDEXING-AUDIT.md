# Google indexing audit

28 November 2026 (Asia/Karachi). This record separates the signed-in engine report, individual URL inspections, pre-release public delivery, and pending Phase 3 publication. An HTTP 200 response, accepted sitemap or indexing request establishes none of the other stages. No new indexing submission is claimed here.

## Fresh account evidence and aggregate categories

The owner account was inspected on 28 November. The Pages report was **last updated 23 November 2026** and shows **24 indexed / 6 not indexed**, across three displayed exclusion reasons:

| Displayed reason | Pages | Report source | Current action |
|---|---:|---|---|
| Page with redirect | 3 | Website | Retain valid HTTP/www redirects; do not submit aliases as distinct pages. |
| Excluded by noindex tag | 1 | Website | Preserve an intentional utility exclusion unless a specific public page is wrongly excluded. |
| Discovered – currently not indexed | 2 | Google systems | Inspect each canonical URL individually; the older aggregate does not identify today's exact state. |

The report displays validation as Not Started. That is not an unsuccessful validation run. Other possible Google exclusion categories were not displayed in this capture; this is not a claim that they never occur. The actual examples in all three categories were reopened on 28 November. The redirect rows are http://www.filecompresser.com/, https://www.filecompresser.com/ and http://filecompresser.com/: intentional HTTPS/canonical-host variants. The noindex example is https://filecompresser.com/THIRD-PARTY-NOTICES.txt, an intentional license utility artifact. Keep those redirects and utility exclusion; they are not missing public landing pages.

The discovered-not-indexed category still lists Contact and JPG with last crawl N/A in its older aggregate. Their newer individual reports both say indexed: Contact was last crawled 27 November at 17:16:26 and JPG at 17:20:26. No Validate Fix action was clicked for intentional exclusions or these stale examples. Current individual status and the older category row are recorded together instead of treating a historical N/A as today's crawl failure.

**Contact has changed status:** the native 28 November inspection now says Page is indexed. Its last reported Googlebot smartphone crawl was 27 November 2026 at 17:16:26, with successful fetch and crawling/indexing allowed. The former discovered-not-indexed observation must not be presented as current. The 23 November aggregate can lag later URL-level changes.

Some inspected, indexed URLs show Temporary processing error in their Sitemaps discovery field while Page fetch is Successful. The two fields have different meanings. This observation is retained in the evidence JSON; it does not by itself establish malformed XML, a failed page fetch, or a current site-wide crawl block. Inspect the sitemap report and public XML delivery before making that diagnosis.

**Canonical status coverage is now complete:** all 27 canonical production URLs were individually inspected on 28 November and report indexed status, including the previously requested Contact, JPG and WebM pages. This is the engine's current URL-level report about the existing public site, not proof that the pending Phase 3 text has been recrawled. Each exact timestamp remains in the register below. All 27 reports also record successful fetch, crawling/indexing allowed, a matching declared canonical and the inspected URL selected as canonical. These are engine-reported crawl/index details, not a fresh fetch of pending Phase 3 content.

## Delivery and content scope

The dated pre-release read checked all 27 canonical public pages: HTTP 200, index/follow directives, self-canonical URLs and exact XML membership. The WAV alias remains canonicalized to the existing WAV tool. The unpublished article is absent/404 and excluded from sitemap, public links and schema. This public delivery observation predates the reviewed Phase 3 release. It cannot establish that the new article/tool copy is live or that Google has recrawled it.

The [CMS/Git/build/public audit](CMS-LIVE-CONTENT-AUDIT.md) separately records the saved-content mismatch and an intermediate local export passing all served views. Final production identity and content parity must pass before a corrected URL is submitted. The URL register below records only actual native engine captures; an uninspected URL stays UNINSPECTED even if it appears in XML.

## Individual canonical URL register

<!-- BEGIN:phase3-google-url-register -->
Current native index-status coverage: **27/27 URLs inspected**. Additional live-only captures: 0. States: Indexed 27. Uninspected rows remain explicit. Technical HTML checks are the dated pre-release observation; native engine status has its own timestamp.

| Canonical URL | HTTP / robots / canonical / XML | Engine status | Last crawl / discovered | Checked UTC | Next action |
|---|---|---|---|---|---|
| [/](https://filecompresser.com/) | 200; index; self; XML | Indexed | 28 Nov 2026, 12:06:44 | 2026-11-28T08:33:38.263Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/about](https://filecompresser.com/about) | 200; index; self; XML | Indexed | 24 Nov 2026, 18:59:47 | 2026-11-28T08:34:56.330Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/blog](https://filecompresser.com/blog) | 200; index; self; XML | Indexed | 22 Nov 2026, 02:37:11 | 2026-11-28T08:37:21.585Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/privacy](https://filecompresser.com/privacy) | 200; index; self; XML | Indexed | 22 Nov 2026, 00:15:15 | 2026-11-28T08:38:09.291Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/terms](https://filecompresser.com/terms) | 200; index; self; XML | Indexed | 22 Nov 2026, 00:09:51 | 2026-11-28T08:40:06.195Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/disclaimer](https://filecompresser.com/disclaimer) | 200; index; self; XML | Indexed | 22 Nov 2026, 00:31:06 | 2026-11-28T08:45:50.238Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/contact](https://filecompresser.com/contact) | 200; index; self; XML | Indexed | 27 Nov 2026, 17:16:26 | 2026-11-28T08:46:52.521Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/sitemap](https://filecompresser.com/sitemap) | 200; index; self; XML | Indexed | 24 Nov 2026, 11:29:51 | 2026-11-28T08:49:49.293Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/blog/compressing-files-for-the-web](https://filecompresser.com/blog/compressing-files-for-the-web) | 200; index; self; XML | Indexed | 22 Nov 2026, 01:13:36 | 2026-11-28T08:50:48.284Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/blog/what-privacy-claim-really-means](https://filecompresser.com/blog/what-privacy-claim-really-means) | 200; index; self; XML | Indexed | 27 Nov 2026, 00:09:49 | 2026-11-28T08:51:38.196Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/blog/choosing-a-compression-mode](https://filecompresser.com/blog/choosing-a-compression-mode) | 200; index; self; XML | Indexed | 22 Nov 2026, 01:02:58 | 2026-11-28T08:53:26.480Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/blog/honest-file-size-reporting](https://filecompresser.com/blog/honest-file-size-reporting) | 200; index; self; XML | Indexed | 22 Nov 2026, 01:48:53 | 2026-11-28T08:55:43.440Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/blog/how-browser-compression-works](https://filecompresser.com/blog/how-browser-compression-works) | 200; index; self; XML | Indexed | 22 Nov 2026, 01:08:18 | 2026-11-28T08:59:12.249Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/compress](https://filecompresser.com/compress) | 200; index; self; XML | Indexed | 28 Nov 2026, 12:08:45 | 2026-11-28T09:00:47.624Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/image-compressor](https://filecompresser.com/image-compressor) | 200; index; self; XML | Indexed | 28 Nov 2026, 12:08:45 | 2026-11-28T09:01:19.589Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/jpg-compressor](https://filecompresser.com/jpg-compressor) | 200; index; self; XML | Indexed | 27 Nov 2026, 17:20:26 | 2026-11-28T09:03:48.295Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/jpeg-compressor](https://filecompresser.com/jpeg-compressor) | 200; index; self; XML | Indexed | 22 Nov 2026, 04:22:23 | 2026-11-28T09:06:43.577Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/png-compressor](https://filecompresser.com/png-compressor) | 200; index; self; XML | Indexed | 22 Nov 2026, 04:45:44 | 2026-11-28T09:11:44.303Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/webp-compressor](https://filecompresser.com/webp-compressor) | 200; index; self; XML | Indexed | 24 Nov 2026, 16:29:50 | 2026-11-28T09:12:44.764Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/gif-compressor](https://filecompresser.com/gif-compressor) | 200; index; self; XML | Indexed | 22 Nov 2026, 01:45:53 | 2026-11-28T09:14:54.439Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/video-compressor](https://filecompresser.com/video-compressor) | 200; index; self; XML | Indexed | 24 Nov 2026, 07:44:47 | 2026-11-28T09:16:56.656Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/webm-to-mp4](https://filecompresser.com/webm-to-mp4) | 200; index; self; XML | Indexed | 27 Nov 2026, 17:14:26 | 2026-11-28T09:21:40.396Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/mp3-compressor](https://filecompresser.com/mp3-compressor) | 200; index; self; XML | Indexed | 22 Nov 2026, 06:52:21 | 2026-11-28T09:25:12.219Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/wav-compressor](https://filecompresser.com/wav-compressor) | 200; index; self; XML | Indexed | 22 Nov 2026, 01:51:32 | 2026-11-28T09:34:06.313Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/pdf-compressor](https://filecompresser.com/pdf-compressor) | 200; index; self; XML | Indexed | 21 Nov 2026, 22:16:10 | 2026-11-28T09:34:29.922Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/zip-compressor](https://filecompresser.com/zip-compressor) | 200; index; self; XML | Indexed | 22 Nov 2026, 00:36:25 | 2026-11-28T09:34:45.276Z | Keep canonical; verify new text after release. No request just to raise a count. |
| [/archive-compressor](https://filecompresser.com/archive-compressor) | 200; index; self; XML | Indexed | 22 Nov 2026, 00:57:44 | 2026-11-28T09:34:59.592Z | Keep canonical; verify new text after release. No request just to raise a count. |
<!-- END:phase3-google-url-register -->

## Correction and submission decisions

The earlier Phase 2 audit recorded accepted requests for the WebM converter, Contact and JPG page on 27 November. Those receipts are historical requests, not proof that a later indexed state resulted from them. No new request is represented as completed in this Phase 3 document.

After the final release is public and independently checked, prioritize genuinely changed tool pages and useful article revisions that need a crawl. Keep the existing canonical destinations and natural internal links. Reinspect a URL before requesting it. Do not repeat requests for unchanged content or submit all legal/utility/alias pages to inflate an indexed total. Google's [recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl) explains that requests have quotas, repeated requests do not speed crawling, and inclusion is not guaranteed.

The next observation should record the exact URL, final content/release identity, request receipt if used, engine-reported crawl date, and later index result separately. A request pending at handover remains pending; no ranking or traffic gain is inferred from it.

## Coverage and limitations

| Area | Evidence status |
|---|---|
| Pages aggregate and three displayed categories | Fresh 28 November capture; report data updated 23 November. |
| Individual URL status | Exact checked timestamps in the register and evidence JSON; uncovered rows remain UNINSPECTED. |
| Page fetch, canonical, crawl/index allowance and discovery fields | Extracted per inspected URL, including actual missing/error values. |
| Current Phase 3 HTML, sitemap and publication identity | Await final release; pre-release technical checks are dated separately. |
| Performance | Fresh 4 clicks / 130 impressions / 3.1% CTR / position 39.8, three-month Web (text) view; 39 query and 24 page rows with actual CTR/position. No joined query/page/country/device attribution. [Sanitized detail](PHASE3-KEYWORD-STRATEGY.md). |
| Manual actions and security | Fresh 28 November native panels both say No issues detected. This is a Google report, not a complete security certification. |
| Core Web Vitals | Freshly observed; report updated 27 November. Both mobile and desktop lack sufficient usage data in the last 90 days. Synthetic Lighthouse remains separate. |
| Sitemaps | Fresh panel observation: Success, submitted 21 November, last read 26 November, 26 discovered pages / 0 videos. Public XML has 27 canonicals; discovery and individual indexing are distinct. |
| HTTPS | Fresh panel, updated 27 November: 22 HTTPS / 0 non-HTTPS, no issues detected in the last 90 days. Its reported URL set is not forced to equal the index set. |
| Breadcrumbs | Fresh panel, updated 27 November: 24 valid / 0 invalid, no reported issues in the displayed period. |
| Removals / uncaptured panels | No fresh claim is made from unrelated inspection or health results. |

The [machine-readable evidence](evidence/2026-11-28/search-indexing-audit.json) retains one row per canonical URL, exact status fields, private-capture hashes and source dates. The [sanitized health record](evidence/2026-11-28/search-console-health.json) pins fresh sitemap, HTTPS, breadcrumbs, field-data, manual-action and security captures. Raw owner-account snapshots remain private. Engine crawl/index decisions and sufficient future audience data are external limitations; they are not waived by a passing build.
