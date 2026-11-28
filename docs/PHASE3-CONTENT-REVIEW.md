# Phase 3 content review

Reviewed 28 November 2026, Asia/Karachi. Baseline: `b32caea43c83b35dfb17cbafeaa8a2f1fed587dd`, including the SEO team's Tina edits. This records the **local candidate**. Final build, hosted editor, rendered-page and production-parity results belong to the master acceptance report and CMS audit; they are not inferred from a JSON save.

The [field and hash inventory](evidence/2026-11-28/editorial-content-review.json) covers 28 content records: 27 intended published records and one unchanged draft. Redirect configuration is a separate 29th CMS record. Twenty-six published records changed; site identity/settings were reviewed and left unchanged. The draft remains unpublished.

## Corrections by page

| Page | Reviewed correction |
| --- | --- |
| Homepage | Shortened repeated introduction while retaining the detailed tool descriptions, lists, links, steps and FAQs. Featured guide cards show one truthful Updated date. |
| General compressor | Clarified mixed dispatch: ZIP inputs are extracted and WAV becomes MP3. Kept supported formats, batch use and privacy details. |
| Image compressor | Shorter task-focused introduction; precise 50 MB / 32 MP limits, queue limits, original dimensions and mode guidance. |
| JPG compressor | Removed instructions for the absent resize feature; made steps a real numbered list; clarified decimal target units, EXIF display dimensions and difficult targets. Removed two unused empty FAQ rows. |
| JPEG compressor | Corrected resize claims in introduction, steps, section and FAQ; retained useful JPEG/JPG and metadata explanations. Added precise image/queue limits. |
| PNG compressor | Corrected the claimed Maximum default to Lossless; removed resize claims; fixed step numbering; changed application examples into real bullets; removed a prohibited editorial word. |
| WebP compressor | Removed resize instructions; made still-image scope and animated-WebP exclusion explicit; retained transparency and quality guidance. Added precise limits. |
| GIF compressor | Retained correct palette, timing, looping and preflight details; reduced the long repeated introduction. |
| Video compressor | Corrected the incomplete SEO title, shortened the introduction and retained the supported MP4/MOV, H.264/AAC, height-cap and time-limit information. |
| WebM to MP4 | Added actual steps, fixed-output explanation, dimension and larger-output behavior, 200 MB input limit, queue and time limits, specific FAQs and the relevant video-tool link. |
| MP3 compressor | Shorter introduction; corrected the FAQ that called size/queue bounds the “only” limits. Bitrate and lossy-generation explanations remain. |
| WAV to MP3 | Shorter conversion-specific introduction; corrected “only limits”; retained the distinction between a listening copy and a lossless source. |
| PDF compressor | Shorter introduction; corrected “only limits”; retained structural-only optimization, no scan downsampling/OCR, signature/encryption restrictions and output review. |
| ZIP creator | Shorter packaging-specific introduction; corrected “only limits”; retained byte preservation, no encryption and honest archive-size reporting. |
| ZIP extractor | Shorter extraction-specific introduction; corrected “only limits”; added 500-entry / 200 MB-per-entry / 500 MB-total and 100:1 expansion bounds. Kept format and malware-scanning limitations. |
| About | Rewritten around actual workflows, local processing, engines, review controls, product principles, precise limits and support. No invented company, people, history, office or certification. |
| Contact | Added a target-size troubleshooting case and clarified that height caps belong to the video compressor, while WebM preserves dimensions. Existing monitored support destination remains. |
| Blog listing | Clarified the guide purpose and changed every card to one Updated date. Original publication metadata remains. |
| Privacy | Rewritten technical account of selected files, temporary memory, saved downloads, ordinary hosting requests, disabled RUM, support email and separate Tina/GitHub editor sessions. No invented retention period or secure-erasure claim. |
| Terms | Corrected the statement that “nothing is stored” to distinguish tab memory, downloads and absent server recovery. Added factual format/device/time limits. Existing usage, rights, warranty and acceptable-use clauses are retained. |
| Disclaimer | Corrected backup and memory-error absolutes; clarified local-processing scope, browser termination, PDF/ZIP limits and output review. Existing warranty/liability provisions are retained. |
| Sitemap, navigation, footer and settings | Existing route/identity/contact structure reviewed. No invented profiles or additional destinations. Rendered static copy is covered by the generated-HTML vocabulary gate. |

All 14 reviewed tool records explicitly select **Use the questions below**. Previously, authored FAQ arrays omitted `faqMode`; the reader deliberately selected the built-in fallback. This was a display-setting mismatch, separate from build failures. The code still honors explicit default/custom/hidden choices. Tina's help now explains their effect.

Completely empty FAQ rows are ignored by the reader and permitted as cleared optional editor rows. A partly written question or answer still fails, with a precise pre-Save field error and a build-field error. This fixes the accidental-empty-row failure without publishing incomplete content or relaxing markup/link checks.

## Published guides

Each of the five published guides received a substantive correction or addition. Their original `date` values are unchanged. `updated` is 2026-11-28, and the same actual modification date supplies visible labels, Open Graph, BlogPosting and sitemap lastmod.

| Guide | Substantive change |
| --- | --- |
| Choosing image compression modes and target sizes | Corrected hard-limit failure behavior and PNG target trade-offs; added decimal/binary upload-limit explanation and a relevant working-tool link. |
| Choosing the right format for smaller web files | Added the separate WebM conversion use case and larger-output/dimension caveats; added concrete transparency/photo review paths and tool links. |
| Why compressed files sometimes get bigger | Distinguished a failed new target run from a retained earlier successful download; added a 100,001-byte boundary example and actual-download advice. |
| How browser-based file compression works | Corrected the suggestion of font downloads, bounded the output-check claims, and explained result lifetime, temporary URLs and saved copies with official File API sources. |
| What “your file never leaves your device” covers | Removed unsupported legal certainty and persistent-state absolutes; explained local downloads, ordinary requests, support/editor distinctions and a generated-file network check. |

The date display uses **Updated November 28, 2026**. When no update exists for a future article, its truthful first-publication date is the fallback; no new date is manufactured. Blog cards, featured guides, article headers and related cards show only Updated labels. Metadata retains the real publication date separately.

## Editorial publishing gate

`npm run check:editorial` scans the intended published JSON records and reports each prohibited occurrence by file, JSON field and word position. The shared Tina wrappers give immediate text-field feedback while preserving existing URL, HTML, date and group validators. Draft content is not emitted by the published readers.

The same policy runs before the production page build. After generation, it scans actual public HTML text, titles/descriptions, image alt text, accessible labels and human-facing JSON-LD fields. The public and export release checks repeat the gate. Program code, identifiers, filenames, link destinations, private admin bundles and unpublished drafts are not treated as editorial prose. Text labels inside links and supported HTML remain checked. Case, Unicode apostrophes, HTML entities and punctuation variants are covered.

Meaningful new controls reject a prohibited term in source, editor, alt text, visible output, metadata and JSON-LD; confirm that a path such as an image filename cannot cause a false editorial failure; and retain draft exclusion and invalid-markup/link tests.

The [complete schema matrix](evidence/2026-11-28/editorial-schema-policy.json) reviews all 98 actual Tina string fields: 73 human-facing fields each reject a prohibited term through their installed callback, including reading-time text, tags, table cells and list arrays. The other 25 are validated dates, addresses or bounded identifiers. URL/path values remain separate from their visible labels. Inline formatting/link adjacency, entities, apostrophe variants and invisible formatting controls have explicit negative controls.

The [collapsed-row controls](evidence/2026-11-28/cms-collapsed-parent-validation.json) close a publishing failure: a closed list item could avoid required child validation. An early parent-field solution caused a new native Tina failure: it marked a blank Section invalid immediately, then Tina refused to open that row. The real Add → Open failure and screenshots are retained. Whole-record validation now uses Tina's official [beforeSubmit hook](https://tina.io/docs/extending-tina/before-submit), before a backend write. Original object/FAQ/optional-group checks run there, while mounted text fields retain their original checks and required validation. A rejected Save opens the exact affected row for repair. No authored values, public renderer or build parser were altered by this guard.

Seventeen actual whole-record hook controls pass, including historical `sections[13].heading`, `sections[7].heading` and `faq[1].q` failures. All **29 current CMS records**, including the stored draft, pass the same hook without changing their values. Twelve focused files pass **419 checks**, zero skipped. Forty required-field controls prove that native requirements remain active when a custom text validator replaces Tina's default; the original 34 failed controls are retained.

The [compiled isolated editor](evidence/2026-11-28/cms-editor-native-workflows.json) passes **26 native workflow checks**, including **13 actual GraphQL mutations** independently checked in copied files. Every free string-list family is exercised: tags, bullet/numbered items, table columns/cells, managed paragraphs/bullets and profile URLs. Creation, invalid input, repair, deletion/re-addition and Save work. Section/FAQ failure recovery, unpublished and archived body edits, both publication transitions, exact HTML/lists/links, a 390px input, and image/settings refusals also pass. Copied records were restored, repository content hashes stayed unchanged, admin bytes stayed pinned and the browser closed normally.

This testing caught two further native list failures before deployment: a parent scalar validation error collided with indexed inputs, and Tina's fallback Required error collided while the last item was being removed. Both actual rendered failures and installed final-form/array-mutator reproductions are retained. Whole-list requirements remain in beforeSubmit; native list parents return no scalar error, while supported `ui.field` scalar validators retain item requirements, vocabulary/URL checks and textarea controls. Independent review and installed vendor resolution cover all eight families.

Image-path and site-identity rules now live in one pure module used by both readers and editor fields. Invalid external/SVG/traversal image paths, unsafe profile links, unsupported sharing images and overlong/plain-text settings fail before Save and rendering. Parameterized controls also cover optional whitespace, bounded choices, booleans and malformed lists/groups, while cleared optional groups/FAQ rows retain their original meaning. Cross-file existence and redirect graph targets remain strict build checks; client-side Save does not prove those facts.

The native widget proof precedes the final own-record resource hook. The [final compiled normal-Save control](evidence/2026-11-28/cms-record-resource-verification.json) passed one independently verified mutation with unchanged body/dates and restored copied data. Actual hook tests cover oversized records, container limits and exact formatted UTF-8 boundaries. Extreme native paste refusal remains unverified: an unbroken-word fill timed out before Save, and a spaced-text retry did not produce an observable error state within its bounded deadline. Neither attempt wrote a record. No UI/form-state injection was used. Hosted release feedback remains separate.

## Local verification and remaining gates

- Eight targeted files: **164 tests passed**, zero skipped, on the frozen editorial source. Initial stale content assertions failed and were updated to require the new target-help card and actual reviewed privacy sections/date; the failed run is retained.
- Editorial source: **27 published records, zero prohibited terms**.
- Targeted ESLint: passed.
- Date tests verify actual server-rendered cards and all five article headers, original `datePublished`, real `dateModified`, Open Graph and sitemap lastmod.
- The early typecheck found two test-only typing issues in this scope; both were corrected without new dependencies. The remaining target-agent test typing issue was separately corrected by that owner. The root release gates record the final complete typecheck.
- The final generated export, all changed-page visual reviews, hosted Tina feedback and live content parity must be checked on the actual candidate/release. No live pass is claimed here.

Full local logs and the original content archive remain under `.qa-results/phase3/editorial/`.

## Research and factual limits

Product behavior is checked against the implementation and retained functional evidence, rather than inferred from a third-party format description. Official format/File API references were read on 28 November: [MDN format guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types), [WebP technical description](https://developers.google.com/speed/webp/docs/compression), [File API use](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications), and [object URL release](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static). These support format/API explanations, not universal output quality or processing times.

Provider roles and uncertainty are stated separately using [Cloudflare's policy](https://www.cloudflare.com/privacypolicy/), [Tina's notice](https://tina.io/privacy-notice), [GitHub's statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Zoho's policy](https://www.zoho.com/privacy.html) and [Zoho's deletion guidance](https://www.zoho.com/mail/help/data-deletion-policy.html). A provider policy does not establish this account's exact retention settings. No retention duration is invented. The [legal review boundary](PHASE3-LEGAL-REVIEW.md) remains explicit.

## Mobile article diagrams

The independent rendered baseline found four SVG diagrams with labels around 5.3px on a 390px screen. The diagrams now keep a readable intrinsic canvas inside a named, keyboard-focusable horizontal viewport. Only the diagram scrolls; its prose summary and authored caption stay in the article. A short sideways-scroll hint appears only when the diagram overflows. The format guide uses its actual 420-unit content canvas, capped at 490 CSS pixels and centered on desktop, so its final pan does not expose unused blank space. Authored text, paint, accessible descriptions and all diagram child nodes remain unchanged.

This follows the [WCAG reflow guidance for two-dimensional diagrams](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [keyboard-accessible overflow guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow), and [named-region guidance](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/region_role). It adds no browser JavaScript or library.

The [component preflight](evidence/2026-11-28/blog-diagram-readability.json) covers all four diagrams at 320, 390, 640, 768 and 1440px, native horizontal and vertical touch gestures, keyboard panning/focus, overflow-only hints, and 2×/4× visual zoom emulation. Rendered label size is at least 12px. Mobile start/end views were personally inspected. Five new accessibility-structure tests pass; the targeted three-file run passes 43 tests, with lint and type checking passing. This isolated real-source fixture is a preflight; final compiled-application and production evidence remain separate.

## Rendered follow-up findings before the final public candidate

Candidate I received independent top-to-bottom visual review of all 29 default desktop views and all 29 mobile views, including the WAV alias and generic 404. The mobile review used 69 ordered strips at the captured native width. The stored unpublished PNG article URL was separately requested, returned 404 and was captured/reviewed at both widths without exposing its article title.

That review found and corrected shared presentation gaps: About's final managed text section used default tight paragraph styling and a browser-blue link; authored tool/home lists had tighter leading than adjacent paragraphs; six enumerations across five tools were plain line-break paragraphs; and three readable 840px diagrams still cropped in a 680px desktop prose measure despite an 860px article shell. Shared rules now give managed product-page text a readable measure, body lists consistent leading/item gaps, and the three wide diagrams an 840px figure measure while prose stays narrow. The compact format diagram stays capped at 490px; mobile diagrams remain locally scrollable. Every word/order in those six enumerations is preserved as supported Markdown bullets.

Residual dimension-by-default qualifiers were removed from the image introduction, JPG guide and size-reporting article. The ZIP introduction now describes validation before downloads rather than implying automatic disk writes. The WAV alias's routing banner and unused presentation rules were removed; its route and canonical metadata are unchanged.

The bounded follow-up passed 111 existing focused checks, targeted lint, all 29 CMS source records and the 27-record vocabulary gate. Candidate-I sub-audits recorded 348 responsive measurements, 87 full-page captures, zero violations in 29 axe scans, and all five shared interaction groups passing. Its outer foreground command was observed with exit 143 on final polling despite a fully written stable-identity completion report; this is retained as an envelope limitation, not described as a clean outer exit. The separate actual-article probe exited normally and passed 20 layouts, four native touch paths and eight visual-zoom emulations. Four SVG contrast incompletes still require explicit manual disposition. These are historical I findings and preflights. The subsequent J build passed local gates but used the local/noindex environment; it is retained as a nonpublic artifact. The final public candidate still needs explicit production origin/indexing settings, its complete build gates and fresh rendered verification before any release claim.
