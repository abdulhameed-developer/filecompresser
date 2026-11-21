# Search and editorial strategy

Reviewed on 21 November 2026. This document records live primary-source research and its application to the actual FileCompresser code. Keyword phrases below are qualitative intent candidates, not measured demand, rankings or keyword-volume estimates. Initial research had no Search Console data or third-party keyword dataset. Google and Bing ownership have since been verified; their new-property dashboards do not yet establish production indexing or search performance. See DNS-AND-EMAIL.md for account-setup evidence.

## Evidence and decisions

The following findings describe the providers' own documentation. They are not independent compression benchmarks or security comparisons.

| Primary source reviewed | Finding | Application to FileCompresser |
| --- | --- | --- |
| [Squoosh official repository](https://github.com/GoogleChromeLabs/squoosh#privacy) | The project distinguishes local image processing from separately collected analytics information. | Explain file processing, hosting logs and administrator-service data separately. Do not infer “no telemetry” merely from browser processing. |
| [TinyPNG's current tool and explanations](https://tinypng.com/) | The provider describes lossy optimization, PNG color quantization, metadata removal, multiple output formats and uploaded-image retention. | Name the actual operation. FileCompresser's browser PNG re-encoding must not be described as TinyPNG's quantization algorithm. Do not borrow its format coverage, percentages or quality claims. |
| [HandBrake quality guide](https://handbrake.fr/docs/en/latest/workflow/adjust-quality.html) | Quality settings affect output size; users can inspect short encodes, and quality values are not interchangeable between encoders. | Explain the tradeoff and ask users to review playback. Do not promise an exact output size or transfer another encoder's numerical quality recommendations to this interface. |
| [iLovePDF PDF compression interface](https://www.ilovepdf.com/compress_pdf) and [privacy policy](https://www.ilovepdf.com/help/privacy) | The service presents compression levels and describes server-side processing with a stated file-retention period, subject to its exceptions. | Keep steps clear, but do not claim equivalent PDF compression modes. FileCompresser rewrites structure and metadata, not scanned images. Describe its own local processing without alleging that another service is unsafe. |

Google's [current generative-AI search guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) favors useful original content, discoverable pages and a clear technical structure. It rejects special AI text files, artificial content chunking and inauthentic mentions as visibility requirements. It also warns against creating many query-variation pages to manipulate responses. These findings support concise, task-specific explanations and working tools rather than extra “AEO/GEO” files or doorway pages. There is no promise of indexing or AI citation.

Google's [title-link guidance](https://developers.google.com/search/docs/appearance/title-link) supports descriptive, concise and distinct titles with restrained branding. It does not impose a universal character limit. The supplied descriptions are editorial search-summary suggestions; search engines can choose different snippets.

Google [discontinued FAQ rich results in May 2026](https://developers.google.com/search/updates). FileCompresser retains useful visible questions and truthful semantic [FAQPage](https://schema.org/FAQPage) descriptions where used, without claiming a Google FAQ enhancement.

## Page-specific intent and answer map

All 13 existing canonical tools are preserved. Each page now has a question heading, direct answer, practical instructions, limitations and two contextual links below the working interface. No large explanatory block was moved above the tool. The bodies contain approximately 122–151 words each, chosen for usefulness rather than a search-engine word-count target.

| Canonical page | Intent and candidate query focus | Truthful direct answer | Internal links and editorial opportunity |
| --- | --- | --- | --- |
| `/compress` | Process a mixed batch; “compress files online,” “private file tools.” | Supported file signatures select the workflow locally; ZIP inputs are extracted. | Browser-pipeline and privacy guides explain dispatch and data handling. Keep format-specific settings on the specialist pages. |
| `/image-compressor` | Prepare mixed website or attachment images; “image compressor,” “compress JPG PNG WebP.” | Re-encode supported images, retain or change format, and compare quality, dimensions and bytes. | Format-selection and quality-mode guides. Add original examples only after producing and checking actual outputs. |
| `/jpg-compressor` | Fit a photographic upload or attachment; “reduce JPG size,” “JPG target size.” | Re-encode JPG/JPEG; Maximum can try a threshold for JPG/WebP, but exact bytes and success are not guaranteed. | Quality-mode and larger-file guides. Explain unmet targets instead of inventing “exact 100 KB” promises or new threshold pages. |
| `/jpeg-compressor` | Prepare a camera/editor export; “optimize JPEG photo,” “JPEG quality and dimensions.” | JPEG and JPG are the same format and use the same engine; work from a useful source rather than repeated lossy copies. | Format-selection and quality-mode guides. This page overlaps with JPG intent; monitor actual queries rather than claiming a different algorithm. |
| `/png-compressor` | Handle transparent artwork and screenshots; “PNG compressor,” “reduce transparent PNG size.” | PNG output keeps transparency, but re-encoding and resizing do not guarantee smaller files or unchanged detail. | Format-selection and larger-file guides. An original transparency/edge example would answer a real decision question. |
| `/webp-compressor` | Review an existing web image; “WebP compressor,” “optimize website WebP.” | A new WebP encode may help; keep it only if its size, dimensions and appearance suit the page. | Format-selection and larger-file guides. Explain when the existing image is already efficient. |
| `/gif-compressor` | Reduce a looping animation; “animated GIF compressor,” “reduce GIF size.” | Re-encode with palette reduction; Maximum also caps frame rate at 15 fps. | Browser-pipeline and size-reporting guides. Review motion, gradients and recognized loop counts using a real short animation. |
| `/video-compressor` | Share a supported clip; “MP4 compressor,” “compress MOV video.” | Re-encode to H.264/AAC MP4 with a resolution cap; source codec support and browser resources still matter. | Browser-pipeline and larger-file guides. Explain resolution choices and failures; avoid exact-size or desktop-encoder parity claims. |
| `/mp3-compressor` | Reduce an existing recording's bytes; “MP3 compressor,” “lower MP3 bitrate.” | Lower bitrate can reduce size, with lossy generation loss; this is not audio loudness compression. | Size-reporting and browser-pipeline guides. A tested speech/music comparison could clarify the difference without a universal bitrate recommendation. |
| `/wav-compressor` | Make a compact sharing copy; “WAV to MP3,” “reduce WAV file size.” | Convert WAV to lossy MP3; no smaller lossless WAV or exact PCM preservation is offered. | Browser-pipeline and size-reporting guides. `/wav-to-mp3` remains an alias with the same canonical destination, not a new duplicate article. |
| `/pdf-compressor` | Try local structural optimization; “PDF optimizer,” “reduce PDF metadata and structure.” | Remove selected metadata and rewrite structure; scanned pages and embedded photos are not recompressed. | Size-reporting and privacy guides. Clearly explain unsuitable scan-heavy cases; do not advertise OCR, password removal or a percentage saving. |
| `/zip-compressor` | Package a delivery; “create ZIP online,” “combine files into ZIP.” | Bundle the original file bytes; already compressed media may gain little additional reduction. | Size-reporting and privacy guides, plus the existing related ZIP Extractor. Review contents and names before deleting sources. |
| `/archive-compressor` | Open a supported archive; “ZIP extractor,” “unzip in browser.” | Extract supported ZIPs locally while refusing unsupported or unsafe structures. This is not RAR/7z support or a guarantee that contained files are harmless. | Browser-pipeline and privacy guides, plus the existing related ZIP Creator. Explain why a refused archive is not repaired by renaming it. |

JPG and JPEG deserve special attention: their extensions describe the same format and their core search intent overlaps. The current source preserves both existing pages and gives them different practical guidance. After real search data exists, compare their queries, impressions and landing-page behavior. If users gain no distinct value, consider one primary page and a permanent redirect with updated links and sitemap entries. No consolidation or new redirect is claimed in this content task.

## Existing guide cluster

The existing five articles provide enough supporting structure for the current tool set. Each now receives contextual links from relevant tools, in addition to the existing navigation and related-content links.

| Existing guide | Role |
| --- | --- |
| `how-browser-compression-works` | First-party explanation of signature validation, workers, engines and downloadable outputs. |
| `honest-file-size-reporting` | Explain efficient inputs, larger outputs and the difference between a successful encode and a saving. |
| `choosing-a-compression-mode` | Help image users compare detail, dimensions and output size. |
| `what-privacy-claim-really-means` | Describe the actual boundary between local file contents and ordinary website/service data. |
| `compressing-files-for-the-web` | Connect image-format choices with photographic content, graphics and transparency. |

Future articles should begin with observed user questions or reproducible product evidence. Useful candidates include a real MP3 speech/music comparison, a PNG transparency example, a short-clip resolution comparison and a PDF structural-rewrite demonstration. Publish only after the relevant files have been processed, outputs inspected and methodology recorded. Use the real author or the site organization; do not fabricate expert biographies, tests or review dates.

## Editorial and validation rules

- Keep the compression interface first. Supporting content belongs below it and should answer a decision, explain an operation or resolve a failure.
- State what the actual engine does. WAV-to-MP3 is conversion, ZIP creation is packaging, ZIP extraction is opening, and PDF optimization is a structural rewrite.
- Avoid unsupported formats, exact savings, guaranteed visual equivalence, generic “securest/best” claims and keyword lists.
- Use descriptive crawlable links to relevant existing pages. Do not repeat every tool name in every paragraph.
- Keep visible FAQs and any matching schema synchronized. Do not insert hidden answers for search engines.
- Keep aliases, canonicals, archival state and redirects consistent. A changed slug needs an intentional migration rather than a second indexed copy.
- Treat local content validation, successful builds and route checks as source verification. Production rendering, encoding, Search Console ownership and search visibility need their own actual evidence.

The changes in this task are source changes, not a claim that the domain is live or indexed. Existing media-distribution and account/DNS prerequisites still apply.

## Measurement after a verified launch

Verify the actual primary origin in Search Console, submit its XML sitemap and inspect representative tool and article URLs. Record the date, deployed commit and actual crawl/indexing outcomes. Review available search reports for landing-page/query alignment, including the generative-AI reporting described in Google's current documentation when the account exposes it. Record only observed data.

Use real-browser mobile, keyboard and output-quality checks alongside performance measurements. Field Core Web Vitals and lab tests measure different things; neither should be invented before data exists. Keyword and content priorities can then be adjusted from observed questions, failures and search traffic rather than assumed demand.
