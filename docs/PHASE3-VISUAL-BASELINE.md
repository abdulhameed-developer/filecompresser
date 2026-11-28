# Phase 3 public visual baseline

Captured and visually reviewed on 28 November 2026 before the Phase 3 release. This is evidence for the existing public product, not a claim that candidate changes are live.

The public release stayed `4c0d1d6be06d264a944bb302167caa7e1beec7e3` throughout the capture window (2026-11-28T10:11:01.935Z–2026-11-28T10:21:18.856Z). The home HTML, release JSON and eight worker/codec source endpoints retained identical before/after hashes and expected MIME types. Home HTML SHA-256: `c45d94bb8ded2332d1321a3a5fda4c6a467a6c49c47c7d7d6e9bfeddd1224340`.

## Verified scope

All 28 served views and the unpublished article’s expected 404 were captured and actually inspected top to bottom at desktop **1440×1000** and mobile **390×844**: **58 views**. Each review used all ordered full-width screenshot strips, with the original full-page PNG preserved. This review covers default/empty pages. The strip contact-sheet padding is an audit aid, not part of the site.

The browser was anonymous system Chrome 156.0.8078.47 with its sandbox enabled. There were no custom user-agent, protocol or TLS settings, request interception, uploads, account actions or state-changing requests. Mobile coverage means a narrow layout viewport; it is not physical-device or touch evidence.

## Capture checks

- 56 successful document responses and two intentional draft 404 responses.
- 58 actual visual reviews; 174 PNG/wire-HTML/DOM-HTML artifact hashes independently rechecked.
- No page JavaScript errors, final broken images, horizontal overflow or state-changing requests were observed.
- The expected 404 resource errors are retained for both draft views.
- 27 background request aborts are retained across 13 views: 26 HEAD fetches and one image GET. Their cause and user impact were not established; final images were complete.
- Two earlier navigation attempts failed with `ERR_QUIC_PROTOCOL_ERROR` before response. The failures and screenshots remain. Ordinary fresh continuation later captured every view successfully, with no transport or security changes.
- Earlier script startup/partial-inventory failures also remain documented. They are not erased by the later successful capture.

## Visual findings

The existing layout is generally coherent: clear upload actions, consistent reading columns, aligned tool cards and links, restrained legal pages, purposeful About/Contact layouts, and a compact Sitemap. No obvious overlap or clipping was seen in these default views. Meaningful baseline findings were:

| Finding | Where observed | Candidate verification requirement |
|---|---|---|
| Generic image/media FAQs replace authored format questions | Individual image/media tools; ZIP Creator shows extraction-oriented questions | Verify each tool’s authored custom FAQ selection and visible/structured-data agreement |
| Article cards show publication dates while article headers separately show Updated dates | Blog, home featured guide, five articles and related cards | Verify one clear Updated display and matching card dates, while preserving truthful publication metadata |
| Long editorial sequences delay lower help/guides | Home, general compressor, image compressor | Assess mobile reading rhythm without discarding valid authored content |
| Tiny labels in scaled mobile diagrams | Format, privacy, size-reporting and browser-engine articles at 390px | Inspect candidate narrow-screen diagram composition; adjacent visible prose remains readable |
| Dimension wording suggests an optional resize path | Image/JPEG and some format descriptions | Verify explicit preserved-dimension copy |
| Technical alias notice precedes upload | `/wav-to-mp3` | Assess relevance and space cost; no functional defect inferred |

## Route-by-route review

Each entry below has separate desktop and mobile observations and exact artifact hashes in [the machine-readable evidence](evidence/2026-11-28/public-visual-baseline.json).

| Route | Desktop | Mobile | Default-state observations |
|---|---|---|
| `/` | Reviewed | Reviewed | BASELINE_FEATURED_DATES_ABSENT, BASELINE_LONG_EDITORIAL_BODY |
| `/compress` | Reviewed | Reviewed | BASELINE_LONG_EDITORIAL_BODY |
| `/image-compressor` | Reviewed | Reviewed | BASELINE_DIMENSION_WORDING, BASELINE_GENERIC_IMAGE_FAQS, BASELINE_LONG_EDITORIAL_BODY |
| `/jpg-compressor` | Reviewed | Reviewed | BASELINE_GENERIC_IMAGE_FAQS |
| `/jpeg-compressor` | Reviewed | Reviewed | BASELINE_DIMENSION_WORDING, BASELINE_GENERIC_IMAGE_FAQS |
| `/png-compressor` | Reviewed | Reviewed | BASELINE_GENERIC_IMAGE_FAQS |
| `/webp-compressor` | Reviewed | Reviewed | BASELINE_GENERIC_IMAGE_FAQS |
| `/gif-compressor` | Reviewed | Reviewed | BASELINE_GENERIC_MEDIA_FAQS |
| `/video-compressor` | Reviewed | Reviewed | BASELINE_GENERIC_MEDIA_FAQS |
| `/webm-to-mp4` | Reviewed | Reviewed | BASELINE_GENERIC_MEDIA_FAQS |
| `/mp3-compressor` | Reviewed | Reviewed | BASELINE_GENERIC_MEDIA_FAQS |
| `/wav-compressor` | Reviewed | Reviewed | BASELINE_GENERIC_MEDIA_FAQS |
| `/pdf-compressor` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/zip-compressor` | Reviewed | Reviewed | BASELINE_CREATOR_FAQ_CONTEXT |
| `/archive-compressor` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/wav-to-mp3` | Reviewed | Reviewed | BASELINE_ALIAS_TECHNICAL_NOTE, BASELINE_GENERIC_MEDIA_FAQS |
| `/about` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/contact` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/privacy` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/terms` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/disclaimer` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/blog` | Reviewed | Reviewed | BASELINE_CARD_UPDATED_DATES_ABSENT |
| `/blog/compressing-files-for-the-web` | Reviewed | Reviewed | BASELINE_ARTICLE_DATE_SPLIT, BASELINE_CARD_UPDATED_DATES_ABSENT, BASELINE_MOBILE_DIAGRAM_LABELS |
| `/blog/what-privacy-claim-really-means` | Reviewed | Reviewed | BASELINE_ARTICLE_DATE_SPLIT, BASELINE_CARD_UPDATED_DATES_ABSENT, BASELINE_MOBILE_DIAGRAM_LABELS |
| `/blog/choosing-a-compression-mode` | Reviewed | Reviewed | BASELINE_ARTICLE_DATE_SPLIT, BASELINE_CARD_UPDATED_DATES_ABSENT |
| `/blog/honest-file-size-reporting` | Reviewed | Reviewed | BASELINE_ARTICLE_DATE_SPLIT, BASELINE_CARD_UPDATED_DATES_ABSENT, BASELINE_MOBILE_DIAGRAM_LABELS |
| `/blog/how-browser-compression-works` | Reviewed | Reviewed | BASELINE_ARTICLE_DATE_SPLIT, BASELINE_CARD_UPDATED_DATES_ABSENT, BASELINE_MOBILE_DIAGRAM_LABELS |
| `/sitemap` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |
| `/blog/png-lossless-smart-maximum-measured` | Reviewed | Reviewed | No obvious default-view clipping, overlap or disproportionate layout found. |

## Retained evidence and limits

Private source: `.qa-results/phase3/visual-before-live/complete-capture-report.json`, `baseline-review-report.json`, `visual-review-notes.json` and the dated capture directories. The raw capture file retains `visualReviewed: false` because it was generated before manual inspection; the separate per-view review record is the evidence of later visual inspection.

This baseline does not exercise uploaded-file states, settings dialogs, active processing, cancellation, recovery, output validity, downloads, keyboard focus or expanded navigation. It does not establish Lighthouse, accessibility or security certification. Those checks belong to their separate candidate/live evidence. Candidate captures may use a different viewport height; do not present the images as pixel-exact comparisons.
