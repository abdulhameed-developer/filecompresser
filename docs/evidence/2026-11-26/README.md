# Selected visual evidence — 26 November 2026

These are exact, unmodified browser screenshots of the application. The matched workspace set uses a generated 640 × 480 PNG. The two CMS-help images show only the editor controls and already-public homepage text; they contain no account details. No hosting/account-dashboard screenshots or private uploaded documents are included. Complete local audit collections remain under `.qa-results/`, outside the public export.

The matched set uses the same file, settings, viewport and workspace framing. **Before** is the immutable starting export at port 3199. **After** is the layout/codec acceptance build `llRrkxdP2B3laJbFZGwvo` at port 3000. Later changes affect route prefetching and editorial URL parsing, with controls, styles and codecs unchanged. Fixture, viewport and export fingerprints are in [capture-manifest.json](capture-manifest.json).

| State | Before | After |
| --- | --- | --- |
| Desktop workspace, 1440 × 900 | [Before](png-before-ready-1440.png) | [After](png-after-ready-1440.png) |
| Mobile workspace, 390 × 900 | [Before](png-before-ready-390.png) | [After](png-after-ready-390.png) |
| Desktop settings, 1440 × 900 | [Before](png-before-settings-1440.png) | [After](png-after-settings-1440.png) |
| Mobile settings, 390 × 900 | [Before](png-before-settings-390.png) | [After](png-after-settings-390.png) |

The single-file card now uses the available width: 170 × 248 → 914 × 157 px on desktop and 170 × 248 → 318 × 147 px on mobile. Filename, dimensions, status and Details remain readable. Settings use full-width labeled fields, balanced preset controls and a consistent Reset/Done footer. Both versions already had a modal; these comparisons demonstrate its refinement rather than claiming the initial modal conversion happened in this pass.

Root visually inspected all eight matched images. The full route-by-route findings and limitations are in [the progress document](../../../PROJECT_OVERHAUL_PROGRESS.md), [tool review](../../tool-visual-review-2026-11-26.md) and [non-tool review](../../visual-review-2026-11-26.md). Screenshots do not prove file integrity or accessibility; those have separate functional and keyboard/axe reports.

Additional captures include [the final homepage](home-final-1440.png), [About](about-final-1440.png) and [the browser-processing article on mobile](article-final-390.png), loaded with their real page images on final build `T0IO7fozU0grEtYQtuYdr`.

[Desktop](webm-converting-1440.png) and [mobile](webm-converting-390.png) WebM processing captures show the actual **Converting WebM to MP4** message on a generated sample. The worker was allowed to run normally and produced a valid MP4 with all 120 frames. They document the unchanged processing presentation from the earlier acceptance build. The original user's recording and its output screenshots remain local rather than being included in public repository evidence.

The original thirteen selected captures were visually reviewed. [Local Lighthouse metrics](lighthouse-metrics.json) preserves all 32 valid local route/profile results, the invalid trace/retry boundary and the remaining performance limitations. Full raw reports remain local and are not shipped as public assets.

The final hosted editor's malformed HTML help is shown [before](cms-help-before.png) and [after](cms-help-after.png), at the same 1280 × 907 viewport and public Image Compression section. Literal examples now display coherently. The captures contain no account identity or unpublished content. Shared inline-link states are shown in [desktop default](faq-link-1440-default.png) and [mobile keyboard focus](faq-link-390-focus.png); the full eight-state local set also verifies hover and visited appearance after actual navigation and Back. All four follow-up images were visually inspected; source and byte fingerprints are in the manifest.

[Live verification](live-verification.json) records the clean 74/74 real-output run, 29-route accessibility check, actual Brotli/cache delivery and three valid standard live Lighthouse measurements. It preserves the blocked WebM desktop measurement and other failed attempts rather than inventing a score. Production code is `0197d18`, Cloudflare `5ecc7f32`; code, hosted save and local comparison evidence remain distinct.
