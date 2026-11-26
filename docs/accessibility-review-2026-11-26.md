# Accessibility verification — 26 November 2026

The public-page axe scan covered 29 views, using WCAG 2/2.1/2.2 A/AA rules: all canonical pages, the WAV alias and the 404. It reported **zero violations** and **four incomplete color-contrast checks** on SVG article diagrams. An incomplete result requires review; it is not an automated pass.

The four rules cover 51 SVG text nodes across the browser-processing, privacy, file-size and web-format articles. Axe could not resolve their backgrounds because SVG rectangles paint backgrounds without setting CSS `backgroundColor` on the text.

Root reviewed the captured computed text fills, all node coordinates and SVG paint order in `components/BlogFigure.tsx`, then inspected four untouched overview screenshots. The actual backings are the SVG surface `#f4f7f5`, white node surfaces, pale green `#eef6d8`, pale red `#fbeae7`, and dark green `#163b31`. Relative luminance uses the standard sRGB linearization formula.

| Actual text / backing | Contrast |
| --- | ---: |
| Ink `#163b31` / SVG surface | 11.43:1 |
| Ink / white | 12.32:1 |
| Ink / pale green | 11.04:1 |
| Ink / pale red output bar | 10.58:1 |
| Muted `#5f716a` / SVG surface | 4.80:1 |
| Muted / white | 5.18:1 |
| Muted / pale green | 4.64:1 |
| Success `#4d7a12` / pale green | **4.58:1** |
| White / dark green | 12.32:1 |
| Lime `#c9ed4b` / dark green | 9.21:1 |

All 51 reviewed labels meet the 4.5:1 requirement. No muted label is painted on the pale-red bar: the original bars are transparent, and output labels use ink. Automated incomplete results are retained unchanged, with a separate manual disposition for every node rather than an altered axe result.

Evidence is retained locally in `.qa-results/2026-11-26-final/axe-incomplete-review/report.json`, its untouched screenshots, and `manual-disposition.json` (51 nodes, minimum 4.5786:1). The 56 populated tool/viewport cases include native Settings focus loops, exact scroll/focus restoration and applicable modal axe checks; short-screen and keyboard/touch file-chooser checks have separate reports in the main progress document.

The diagrams also expose meaningful image descriptions and readable HTML explanations. This review does not certify every assistive technology or physical device. NVDA/VoiceOver, forced colors, physical Safari/iOS/Android, every zoom setting and all prolonged/large-file workflows were not independently certified. Automated results and these manual contrast calculations are not a blanket WCAG conformance claim.
