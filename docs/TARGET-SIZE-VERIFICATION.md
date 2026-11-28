# Target-size verification — Phase 3

28 November 2026, Asia/Karachi. **Final candidate I: 124/124 actual browser cases passed; production/live matrix pending.** This is candidate evidence, not a claim of completed live verification or universal achievable limits.

## Contract and scope

Target Size is a strict maximum of actual output bytes. `1 KB = 1,000 bytes`; `1 MB = 1,000,000 bytes`. Equality is accepted. No padding, display rounding, automatic format change or image resizing is used to satisfy a limit. A target already met by the original returns its exact bytes after source decoding/validation.

Target Size is available for still JPG/JPEG, PNG and WebP on `/jpg-compressor`, `/jpeg-compressor`, `/png-compressor`, `/webp-compressor`, `/image-compressor` and an all-image `/compress` selection. The other eight tools do not advertise a target-size control; they retain their actual codec/bitrate/structural/ZIP settings. Mixed generic queues remove irrelevant image-only options.

## Reproduced causes

Three new tests failed against the previous engine before changes. The original log is `.qa-results/phase3/recovery/target-red-tests.log`.

1. JPEG/WebP searched only from 25% to 95% quality. A feasible 700-byte policy fixture requiring less than 25% returned an overshoot.
2. If both the 95% and 25% endpoints missed, the engine did not sample an intermediate fitting region. The new nonmonotonic test reproduced this miss.
3. Unreachable targets resolved with `target-unmet` and an above-limit downloadable file. Existing warnings were truthful, but the queue still counted the job completed. The new contract requires a failed attempt with no newly saved output.

PNG Target also inherited Maximum's 34 dB / 64 maximum-channel-error thresholds, stopped at the first rejected palette, and never tested fewer than 16 colors. Those were implicit quality limits in a mode whose primary promise is size. They are retained for ordinary Smart/Maximum, not for the explicitly disclosed Target policy.

## Corrections

- Convert custom decimal/exponent KB values with exact string arithmetic: `0.029 KB` and `2.9e-2 KB` both mean 29 bytes. Reject fractional-byte entries such as `100.0005 KB`; retain their entered text as invalid across modal reopen and block processing. No upward rounding is permitted.
- Preserve the field's editing buffer instead of canonicalizing every keystroke. Real sequential typing on diagnostic build F reproduced `50.05` becoming `505`, and `100.0005` becoming an apparently valid `100005` KB. The corrected field retains decimal zeros/caret edits while editing, synchronizes external presets/reset, and keeps invalid drafts across reopen. Source regressions and actual final candidate I typing checks pass.
- Give invalid target fields a visible error border/hint and a single wrapper focus ring. Associate the input with both the changing exact-byte/error status and general help. Actual final candidate I passes computed-style, association and screenshot checks in Chrome and matched Firefox.
- Parse only whole-byte limits from 1 to 200,000,000. Invalid or excessive values are rejected, not silently rounded/capped into another request. The actual dispatch parser is tested directly.
- JPEG/WebP samples a bounded coarse quality curve from 100% through 0%, stopping at the first measured fit, then refines the higher-quality bracket in integer steps. A failed low endpoint is never treated as proof that all intermediate settings fail. At most 16 encodes are permitted; the actual successful samples generally need fewer. Select the highest-quality fitting candidate actually tested, not an unverified global optimum.
- PNG first tests verified lossless optimization. If the initial quicker pass on a large image misses the target, it makes one stronger lossless attempt before reducing colors or refusing. It then tests real 256/128/64/32/16/8/4/2-color candidates as needed, with up to three intermediate refinements around a fit. Candidate bytes and decoded color error are measured independently. Target can cause strong visible color loss; the settings and result explain that. Exact alpha, original dimensions and protected 16-bit sample precision are still required. Smart/Maximum appearance thresholds remain unchanged.
- The pipeline refuses a missed target with `target-unreachable`. The client and queue independently recheck actual Blob sizes against the original requested byte limit before creating a downloadable artifact. No `target-met` label can override an overshoot.
- Failed retries preserve the uploaded original and any previous successful result. A previous download is labeled separately; it is not a new target success.
- Provably impossible limits below fixed format framing are rejected before allocating a raster. The 1-byte tests exercise this path for all three formats. Other refusals mean no fitting output under the tested encoder/format/alpha/precision constraints, not proof that every possible encoder would fail.
- Resource cleanup, cancellation, worker ownership, alpha/dimension checks and ordinary mode behavior remain in place.

The browser contract audit changes only the target expectations that previously permitted an above-limit download. Its complete previous source and explicit diff are retained in `.qa-results/phase3/target-size/`. The unreachable JPG case now expects failure with no result; it no longer adds a downloaded file to the regression total.

## Verification currently executed

| Gate | Result | Evidence |
| --- | --- | --- |
| Three original defect regressions | Reproduced RED before edits | `recovery/target-red-tests.log` |
| Targeted source/queue/UI/worker/PNG tests | Latest focused run: 201/201 PASS, including raw decimal-edit preservation; earlier full gate caught one stale help-text assertion, then its 46-test file rerun passed | `target-size/target-raw-draft-tests.log`; `target-size/queue-whole-byte-help-final.log` |
| Actual sequential decimal typing | RED on F; GREEN on a separate fresh public diagnostic at port 3333 (not the final release candidate). Five actual typed values, reopen, arrow and caret checks passed; no encoding or console errors | `target-size/sequential-typing-before/report.json`; `target-size/sequential-typing-public-diagnostic-after/report.json`; key-by-key values and screenshots retained |
| Actual candidate H input presentation/accessibility | PASS after exact homepage/five-worker identity checks: one wrapper focus outline, no inner outline; invalid border/outline/hint all danger RGB(163, 51, 34); both described-by references resolve. The same real typing/reopen/step/caret cases pass with no encoding or console errors. Direct screenshot inspected | `target-size/sequential-typing-candidate-h/identity.json`; `report.json`; `typed-100_0005.png` |
| Candidate H general functional regression | 79/79 PASS; 56 real downloads, each independently rehashed and validated through 43 unique byte sequences (33 FFmpeg full decodes, one PDF parse/text extraction, six ZIP CRC/member reads, three exact extracted-content comparisons; 13 identical-SHA duplicates). PNG 2,535 ≤ 5,000 B, WebP 4,928 ≤ 5,000 B; 1,000 B JPG refusal creates no new download. No browser/resource/lifecycle/capture errors | `functionality/candidate-h/chromium-desktop/functionality.json`; `independent-download-inventory-review.json`; `independent-download-decode-review.json` |
| Targeted ESLint | PASS | Executed against changed target source, tests and audit scripts |
| Independent decoder controls | PASS on unchanged 16-bit PNG and ICC-tagged sRGB PNG | Real Pillow 13.0.0 decoding; exact samples/alpha/source-byte hash checked |
| Final candidate I target matrix | **124/124 PASS; 102 real independently decoded downloads; 22 refusals; zero above-limit successes or diagnostics** | [Every case, exact bytes, quality, timing and identity](evidence/2026-11-28/target-size-candidate-i.json); private `target-size/candidate-i/` reports/downloads/screenshots |
| Final candidate I native input/style checks | Chrome 156 and Firefox 159 (matched Playwright 1.65.1 / Firefox 1572) each pass five real sequential-typing values, reopen, arrow and caret checks; one wrapper ring, visible error color, both description references resolve. No encoding or console errors. WebKit typing was not run | `target-size/candidate-i/typing-chromium/report.json`; `typing-firefox/report.json` |
| Actual production matrix | PENDING | Requires a successful verified deployment of the tested candidate |

Paths in this table are under `.qa-results/phase3/` unless stated otherwise. The initial validator attempt with the system Python failed because NumPy was absent; the existing private Phase 2 quality environment is selected explicitly for browser runs. No runtime dependency was added to the website.

## Final candidate I result and quality boundaries

The immutable preview was `http://127.0.0.1:3323`, build `M34muGWfVTCv-xRgtWWqN`, homepage SHA-256 `2ca99e2bea55fc605bf25e3bc16d70067f2624640d1d3fa945aaf5b73323992a`. All five worker files matched current source before and after all three runs, and the final homepage/worker identity was checked again. Exact source and response hashes are retained in the linked evidence. No app, worker or export bytes changed during this matrix.

The full 16-input × seven-target run passed **112/112** in 16 minutes 31 seconds. `/compress` and `/image-compressor` each passed six additional cases, covering 20,000 bytes, an already-fitting original and an impossible one-byte request. Across all **124 cases**, 71 downloads were re-encoded and 31 retained exact original bytes. Every downloaded file was rehashed after the run and independently decoded with Pillow; expected format, oriented dimensions, full alpha and protected 16-bit sample values passed. Every displayed result byte count matched its actual download.

The 22 refusals comprise 20 one-byte requests, which are below required container framing, and two large 16-bit PNG requests: 167,760 bytes and 50,000 bytes. The smallest measured lossless candidate for that PNG was 177,556 bytes. The tool preserved its 16-bit samples, refused both limits and produced no new result/download. These two refusals establish **no fit under the tested encoder settings and preservation constraints**, not mathematical infeasibility with every possible encoder.

Re-encoded processing took a median **7.589 seconds**, p95 **22.004 seconds**, and a maximum **32.162 seconds**. Already-fitting originals took a median 308 ms. The two constrained 16-bit refusals took about 32.1 seconds each. These are actual primary-click-to-terminal-state measurements on the shared local host, including initialization/decode/encoding/verification/UI, with fresh navigation and request interception. They exclude selection/configuration/download and do not establish cached-session, competitor or universal performance. No instant-processing claim is made.

Direct inspection of five final downloaded outputs confirmed meaningful losses at harsh limits:

| Actual inspected result | Bytes / maximum | PSNR | Visual finding |
| --- | ---: | ---: | --- |
| Fine-detail JPEG | 31,094 / 50,000 | 14.27 dB | Severe loss of one-pixel lines/texture, visible block structure; unsuitable when that detail matters |
| Photographic PNG | 28,440 / 50,000 | 22.65 dB | Strong palette posterization; substantially changed photographic appearance |
| 9 MP portrait JPEG | 44,519 / 50,000 | 25.42 dB | Recognizable content with strong block edges and lost facial/fabric detail |
| Text JPEG | 49,748 / 50,000 | 30.34 dB | Text remains readable, with visible halos/softening |
| Optimized screenshot PNG on general tool | 9,042 / 20,000 | 29.73 dB | Text remains readable; fewer colors and lost background distinctions |

Passing the maximum-byte, file-validity and preservation checks is not a high-fidelity certificate. Target Size deliberately permits these visible losses; choose a larger limit or explicitly select a more suitable format when fidelity matters. Original files remain unchanged. The downloadable artifacts and relevant UI screenshots are retained under the corresponding private run directories.

The first matrix attempt exposed a **runner navigation defect**: exact-byte status lived inside a collapsed native Details disclosure, so `innerText` was empty. Four encoded cases reached completion but their download checks did not run. The attempt was stopped; the following 108 closed-browser cases were **not independently exercised**, not 108 app failures. The complete failed attempt remains in `target-size/candidate-i/full-112/`. The corrected runner opens the actual native Details control and waits for visible status before reading it; no byte/dimension/alpha/refusal assertion was relaxed. Original/new runner SHA-256 values (`4e9aad49…` / `55c29463…`), the five-line diff and separate ESLint pass are preserved in `details-runner-fix-proof.json` and `details-runner-fix.diff`. The application/export remained candidate I; the successful whole run uses a fresh destination. Its first actual completed download was independently checked before relying on the continuing run. The correction is QA-only and was made after the candidate app build.

## Real-input matrix scope

`scripts/target-size-audit.mjs` runs the actual compiled UI, modal configuration, primary action, queue terminal state and real browser download. `scripts/target-size-validate.py` independently opens each downloaded file with Pillow, verifies format, dimensions, full alpha, protected 16-bit samples, exact byte size and SHA-256, and records decoded color error. Metrics do not guarantee invisible loss.

The retained baseline manifest covers 15 generated/licensed images: screenshot, text JPEG, optimized screenshot, continuous alpha, gradient, fine detail, portrait, 9 MP portrait, photo, optimized photo, photographic PNG/WebP, EXIF orientation, ICC profile and 16-bit precision. Original licenses, source attribution and input hashes remain in `.qa-results/phase2/image-lab/manifest.json`; fixtures are never copied into the public site.

The actual candidate corpus adds a generated 4000 × 1200, 16-bit grayscale PNG (4.8 MP; 671,040 B; SHA-256 `42e5abe66009abd57f69e6606df8faea1acd32fdcfe989980c97ae6e075e598f`) in a separate private manifest. The first 15 inputs remain byte-exact copies. Each of the 16 inputs ran 75%, 50%, 25%, 50 KB, 1 MB, a limit above the original, and 1 byte (112 cases). Generic image and all-image queue routes received 12 additional cases. The report records each input, exact target, actual downloaded bytes or refusal, processing time, quality metrics, file integrity and source/worker identity before and after. A report cannot pass merely because an error appeared: the expected target refusal, absence of a new result/download and retained source were checked. Above-target successes equal zero.

Run against a newly built candidate with a fresh destination; the script refuses to overwrite an existing report. Production runs must be separately labeled and must not be substituted by local engine tests.

The matrix covers original-format Target Size. It does not certify every explicit cross-format target setting, physical low-memory phone, maximum-size upload, prolonged thermal/memory condition or possible image/encoder. Ordinary tool/format conversions have separate regression evidence. Existing general file summaries retain their prior display-unit convention; the exact decimal-byte target/result lines are authoritative for this contract.

## Actual preliminary worker reproduction

Two real browser-worker checks, separate from the still-pending final UI matrix, reproduced and corrected missed 20,000-byte limits. The before worker is the retained Phase 2 export; the preliminary after worker has the new target search but only its initial one-step PNG refinement. The final candidate permits up to three refinements and must receive its own UI run. Source/copy hashes are retained in `real-worker-before-after-identities.json`. A later source-only regression also proved the large-PNG effort gap: a 12 MP, 16-bit policy fixture missed 800 B at effort 2 (900 B), but fit at effort 4 (700 B). Its red and final green logs are retained separately; this adapter test is not a real 12 MP encoded-output claim.

| Real input | Previous output / status | Preliminary after output / status | Independent result | Before / after duration |
| --- | --- | --- | --- | --- |
| Generated optimized screenshot, 111,968 B | 29,987 B; target-unmet | 9,042 B; target-met | Valid 1440 × 900 PNG, exact alpha, 4 colors, PSNR 29.73 dB | 12,059 / 19,316 ms |
| Licensed portrait, 1,097,638 B | 56,721 B; target-unmet | 19,634 B; target-met | Valid 1280 × 1599 JPEG, 6% encoder setting, PSNR 26.43 dB | 1,436 / 6,219 ms |

These are actual measured worker times, not UI or competitor timings. Meeting the tighter size contract took more work and lower fidelity; no speed gain is claimed. The screenshot text remains readable on direct inspection, with reduced colors. The portrait visibly shows block edges and detail loss. The user explicitly selected size as the primary constraint; Compare and larger-target alternatives remain available. Numerical quality scores do not make these losses invisible.

Both outputs were independently reopened with Pillow and directly viewed. The screenshot result motivated the final bounded second/third palette refinements to recover a more faithful fitting result where available. The uploaded original files remain unchanged. Output dimensions and alpha are preserved; output colors and detail can change to meet a limit.

## Final candidate I — 112 individual cases

| Input / decoded dimensions | Exact maximum B | Actual output B | Quality check / PSNR | Processing ms | Status |
| --- | ---: | ---: | --- | ---: | --- |
| screenshot (PNG, 1440×900) | 75percent: 2,917,677 | 80,966 | Pixels exact | 6,505 | Within maximum |
| screenshot (PNG, 1440×900) | 50percent: 1,945,118 | 80,966 | Pixels exact | 7,589 | Within maximum |
| screenshot (PNG, 1440×900) | 25percent: 972,559 | 80,966 | Pixels exact | 6,452 | Within maximum |
| screenshot (PNG, 1440×900) | 50KB: 50,000 | 42,930 | 66.25 dB | 10,401 | Within maximum |
| screenshot (PNG, 1440×900) | 1MB: 1,000,000 | 80,966 | Pixels exact | 6,387 | Within maximum |
| screenshot (PNG, 1440×900) | above-original: 3,891,236 | 3,890,236 | Original bytes | 280 | Within maximum |
| screenshot (PNG, 1440×900) | 1B: 1 | No new output | — | 311 | No tested fit |
| text-high-quality (JPEG, 1440×900) | 75percent: 261,380 | 251,722 | 47.95 dB | 3,912 | Within maximum |
| text-high-quality (JPEG, 1440×900) | 50percent: 174,253 | 170,603 | 41.32 dB | 3,478 | Within maximum |
| text-high-quality (JPEG, 1440×900) | 25percent: 87,126 | 86,775 | 35.06 dB | 2,914 | Within maximum |
| text-high-quality (JPEG, 1440×900) | 50KB: 50,000 | 49,748 | 30.34 dB | 2,951 | Within maximum |
| text-high-quality (JPEG, 1440×900) | 1MB: 1,000,000 | 348,507 | Original bytes | 343 | Within maximum |
| text-high-quality (JPEG, 1440×900) | above-original: 349,507 | 348,507 | Original bytes | 283 | Within maximum |
| text-high-quality (JPEG, 1440×900) | 1B: 1 | No new output | — | 206 | No tested fit |
| screenshot-optimized (PNG, 1440×900) | 75percent: 83,976 | 80,966 | Pixels exact | 6,460 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | 50percent: 55,984 | 42,930 | 66.25 dB | 10,464 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | 25percent: 27,992 | 25,808 | 43.47 dB | 15,494 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | 50KB: 50,000 | 42,930 | 66.25 dB | 10,462 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | 1MB: 1,000,000 | 111,968 | Original bytes | 308 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | above-original: 112,968 | 111,968 | Original bytes | 291 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | 1B: 1 | No new output | — | 293 | No tested fit |
| transparent (PNG, 768×512) | 75percent: 55,878 | 28,027 | Pixels exact | 4,411 | Within maximum |
| transparent (PNG, 768×512) | 50percent: 37,252 | 28,027 | Pixels exact | 4,360 | Within maximum |
| transparent (PNG, 768×512) | 25percent: 18,626 | 11,610 | 62.75 dB | 8,485 | Within maximum |
| transparent (PNG, 768×512) | 50KB: 50,000 | 28,027 | Pixels exact | 4,415 | Within maximum |
| transparent (PNG, 768×512) | 1MB: 1,000,000 | 74,504 | Original bytes | 268 | Within maximum |
| transparent (PNG, 768×512) | above-original: 75,504 | 74,504 | Original bytes | 169 | Within maximum |
| transparent (PNG, 768×512) | 1B: 1 | No new output | — | 393 | No tested fit |
| gradient (PNG, 1600×900) | 75percent: 179,933 | 72,797 | Pixels exact | 13,501 | Within maximum |
| gradient (PNG, 1600×900) | 50percent: 119,955 | 72,797 | Pixels exact | 13,521 | Within maximum |
| gradient (PNG, 1600×900) | 25percent: 59,977 | 30,498 | 31.84 dB | 22,496 | Within maximum |
| gradient (PNG, 1600×900) | 50KB: 50,000 | 30,498 | 31.84 dB | 22,004 | Within maximum |
| gradient (PNG, 1600×900) | 1MB: 1,000,000 | 239,911 | Original bytes | 276 | Within maximum |
| gradient (PNG, 1600×900) | above-original: 240,911 | 239,911 | Original bytes | 272 | Within maximum |
| gradient (PNG, 1600×900) | 1B: 1 | No new output | — | 232 | No tested fit |
| fine-details (JPEG, 2048×1365) | 75percent: 4,183,467 | 3,799,670 | 34.96 dB | 32,162 | Within maximum |
| fine-details (JPEG, 2048×1365) | 50percent: 2,788,978 | 2,724,767 | 29.24 dB | 28,081 | Within maximum |
| fine-details (JPEG, 2048×1365) | 25percent: 1,394,489 | 1,368,805 | 22.96 dB | 19,998 | Within maximum |
| fine-details (JPEG, 2048×1365) | 50KB: 50,000 | 31,094 | 14.27 dB | 17,580 | Within maximum |
| fine-details (JPEG, 2048×1365) | 1MB: 1,000,000 | 984,715 | 22.03 dB | 19,007 | Within maximum |
| fine-details (JPEG, 2048×1365) | above-original: 5,578,957 | 5,577,957 | Original bytes | 476 | Within maximum |
| fine-details (JPEG, 2048×1365) | 1B: 1 | No new output | — | 410 | No tested fit |
| portrait-hq (JPEG, 1280×1599) | 75percent: 823,228 | 776,971 | 45.39 dB | 7,950 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | 50percent: 548,819 | 519,933 | 42.96 dB | 6,446 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | 25percent: 274,409 | 266,095 | 40.10 dB | 5,498 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | 50KB: 50,000 | 48,385 | 32.53 dB | 5,482 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | 1MB: 1,000,000 | 879,147 | 46.88 dB | 7,424 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | above-original: 1,098,638 | 1,097,638 | Original bytes | 336 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | 1B: 1 | No new output | — | 284 | No tested fit |
| portrait-large (JPEG, 2687×3356) | 75percent: 1,907,115 | 1,845,216 | 57.79 dB | 20,035 | Within maximum |
| portrait-large (JPEG, 2687×3356) | 50percent: 1,271,410 | 1,163,028 | 47.04 dB | 18,027 | Within maximum |
| portrait-large (JPEG, 2687×3356) | 25percent: 635,705 | 634,863 | 40.89 dB | 15,044 | Within maximum |
| portrait-large (JPEG, 2687×3356) | 50KB: 50,000 | 44,519 | 25.42 dB | 18,025 | Within maximum |
| portrait-large (JPEG, 2687×3356) | 1MB: 1,000,000 | 990,846 | 44.57 dB | 17,586 | Within maximum |
| portrait-large (JPEG, 2687×3356) | above-original: 2,543,820 | 2,542,820 | Original bytes | 949 | Within maximum |
| portrait-large (JPEG, 2687×3356) | 1B: 1 | No new output | — | 298 | No tested fit |
| landscape-hq (JPEG, 2560×1150) | 75percent: 1,652,664 | 1,609,456 | 42.17 dB | 15,015 | Within maximum |
| landscape-hq (JPEG, 2560×1150) | 50percent: 1,101,776 | 1,077,197 | 38.12 dB | 14,056 | Within maximum |
| landscape-hq (JPEG, 2560×1150) | 25percent: 550,888 | 537,914 | 34.13 dB | 9,961 | Within maximum |
| landscape-hq (JPEG, 2560×1150) | 50KB: 50,000 | 45,570 | 26.57 dB | 8,948 | Within maximum |
| landscape-hq (JPEG, 2560×1150) | 1MB: 1,000,000 | 953,261 | 36.98 dB | 11,456 | Within maximum |
| landscape-hq (JPEG, 2560×1150) | above-original: 2,204,552 | 2,203,552 | Original bytes | 371 | Within maximum |
| landscape-hq (JPEG, 2560×1150) | 1B: 1 | No new output | — | 363 | No tested fit |
| landscape-optimized (JPEG, 2560×1150) | 75percent: 306,877 | 301,225 | 34.76 dB | 7,918 | Within maximum |
| landscape-optimized (JPEG, 2560×1150) | 50percent: 204,585 | 201,532 | 31.39 dB | 7,498 | Within maximum |
| landscape-optimized (JPEG, 2560×1150) | 25percent: 102,292 | 99,857 | 28.77 dB | 7,965 | Within maximum |
| landscape-optimized (JPEG, 2560×1150) | 50KB: 50,000 | 45,990 | 26.82 dB | 7,907 | Within maximum |
| landscape-optimized (JPEG, 2560×1150) | 1MB: 1,000,000 | 409,170 | Original bytes | 414 | Within maximum |
| landscape-optimized (JPEG, 2560×1150) | above-original: 410,170 | 409,170 | Original bytes | 923 | Within maximum |
| landscape-optimized (JPEG, 2560×1150) | 1B: 1 | No new output | — | 237 | No tested fit |
| landscape-photo (PNG, 1280×575) | 75percent: 1,025,382 | 430,619 | 40.44 dB | 6,989 | Within maximum |
| landscape-photo (PNG, 1280×575) | 50percent: 683,588 | 430,619 | 40.44 dB | 6,898 | Within maximum |
| landscape-photo (PNG, 1280×575) | 25percent: 341,794 | 334,474 | 37.98 dB | 11,445 | Within maximum |
| landscape-photo (PNG, 1280×575) | 50KB: 50,000 | 28,440 | 22.65 dB | 11,484 | Within maximum |
| landscape-photo (PNG, 1280×575) | 1MB: 1,000,000 | 430,619 | 40.44 dB | 7,457 | Within maximum |
| landscape-photo (PNG, 1280×575) | above-original: 1,368,176 | 1,367,176 | Original bytes | 279 | Within maximum |
| landscape-photo (PNG, 1280×575) | 1B: 1 | No new output | — | 311 | No tested fit |
| landscape-hq-webp (WEBP, 1280×575) | 75percent: 271,654 | 249,004 | 41.47 dB | 1,368 | Within maximum |
| landscape-hq-webp (WEBP, 1280×575) | 50percent: 181,103 | 179,500 | 38.75 dB | 1,394 | Within maximum |
| landscape-hq-webp (WEBP, 1280×575) | 25percent: 90,551 | 90,238 | 33.80 dB | 1,389 | Within maximum |
| landscape-hq-webp (WEBP, 1280×575) | 50KB: 50,000 | 49,404 | 31.05 dB | 1,341 | Within maximum |
| landscape-hq-webp (WEBP, 1280×575) | 1MB: 1,000,000 | 362,206 | Original bytes | 278 | Within maximum |
| landscape-hq-webp (WEBP, 1280×575) | above-original: 363,206 | 362,206 | Original bytes | 276 | Within maximum |
| landscape-hq-webp (WEBP, 1280×575) | 1B: 1 | No new output | — | 228 | No tested fit |
| orientation-6 (JPEG, 1200×900) | 75percent: 254,131 | 252,383 | 43.78 dB | 4,008 | Within maximum |
| orientation-6 (JPEG, 1200×900) | 50percent: 169,421 | 158,475 | 41.65 dB | 3,429 | Within maximum |
| orientation-6 (JPEG, 1200×900) | 25percent: 84,710 | 81,707 | 37.92 dB | 2,919 | Within maximum |
| orientation-6 (JPEG, 1200×900) | 50KB: 50,000 | 49,643 | 35.13 dB | 2,944 | Within maximum |
| orientation-6 (JPEG, 1200×900) | 1MB: 1,000,000 | 338,842 | Original bytes | 475 | Within maximum |
| orientation-6 (JPEG, 1200×900) | above-original: 339,842 | 338,842 | Original bytes | 419 | Within maximum |
| orientation-6 (JPEG, 1200×900) | 1B: 1 | No new output | — | 182 | No tested fit |
| profiled-srgb (PNG, 960×600) | 75percent: 100,743 | 46,500 | 60.90 dB | 6,485 | Within maximum |
| profiled-srgb (PNG, 960×600) | 50percent: 67,162 | 46,500 | 60.90 dB | 5,988 | Within maximum |
| profiled-srgb (PNG, 960×600) | 25percent: 33,581 | 31,430 | 49.39 dB | 8,453 | Within maximum |
| profiled-srgb (PNG, 960×600) | 50KB: 50,000 | 46,500 | 60.90 dB | 6,408 | Within maximum |
| profiled-srgb (PNG, 960×600) | 1MB: 1,000,000 | 134,325 | Original bytes | 350 | Within maximum |
| profiled-srgb (PNG, 960×600) | above-original: 135,325 | 134,325 | Original bytes | 309 | Within maximum |
| profiled-srgb (PNG, 960×600) | 1B: 1 | No new output | — | 303 | No tested fit |
| precision-16 (PNG, 512×256) | 75percent: 6,060 | 1,652 | 16-bit samples exact | 941 | Within maximum |
| precision-16 (PNG, 512×256) | 50percent: 4,040 | 1,652 | 16-bit samples exact | 886 | Within maximum |
| precision-16 (PNG, 512×256) | 25percent: 2,020 | 1,652 | 16-bit samples exact | 968 | Within maximum |
| precision-16 (PNG, 512×256) | 50KB: 50,000 | 8,080 | Original bytes | 246 | Within maximum |
| precision-16 (PNG, 512×256) | 1MB: 1,000,000 | 8,080 | Original bytes | 294 | Within maximum |
| precision-16 (PNG, 512×256) | above-original: 9,080 | 8,080 | Original bytes | 325 | Within maximum |
| precision-16 (PNG, 512×256) | 1B: 1 | No new output | — | 284 | No tested fit |
| precision-16-large (PNG, 4000×1200) | 75percent: 503,280 | 177,556 | 16-bit samples exact | 7,961 | Within maximum |
| precision-16-large (PNG, 4000×1200) | 50percent: 335,520 | 177,556 | 16-bit samples exact | 7,941 | Within maximum |
| precision-16-large (PNG, 4000×1200) | 25percent: 167,760 | No new output | — | 32,119 | No tested fit |
| precision-16-large (PNG, 4000×1200) | 50KB: 50,000 | No new output | — | 32,156 | No tested fit |
| precision-16-large (PNG, 4000×1200) | 1MB: 1,000,000 | 671,040 | Original bytes | 330 | Within maximum |
| precision-16-large (PNG, 4000×1200) | above-original: 672,040 | 671,040 | Original bytes | 428 | Within maximum |
| precision-16-large (PNG, 4000×1200) | 1B: 1 | No new output | — | 239 | No tested fit |

## General and image context cases

### /compress

| Input / decoded dimensions | Exact maximum B | Actual output B | Quality check / PSNR | Processing ms | Status |
| --- | ---: | ---: | --- | ---: | --- |
| screenshot-optimized (PNG, 1440×900) | 20KB: 20,000 | 9,042 | 29.73 dB | 14,031 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | above-original: 112,968 | 111,968 | Original bytes | 305 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | 1B: 1 | No new output | — | 336 | No tested fit |
| portrait-hq (JPEG, 1280×1599) | 20KB: 20,000 | 19,634 | 26.43 dB | 5,499 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | above-original: 1,098,638 | 1,097,638 | Original bytes | 253 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | 1B: 1 | No new output | — | 227 | No tested fit |

### /image-compressor

| Input / decoded dimensions | Exact maximum B | Actual output B | Quality check / PSNR | Processing ms | Status |
| --- | ---: | ---: | --- | ---: | --- |
| screenshot-optimized (PNG, 1440×900) | 20KB: 20,000 | 9,042 | 29.73 dB | 14,491 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | above-original: 112,968 | 111,968 | Original bytes | 302 | Within maximum |
| screenshot-optimized (PNG, 1440×900) | 1B: 1 | No new output | — | 204 | No tested fit |
| portrait-hq (JPEG, 1280×1599) | 20KB: 20,000 | 19,634 | 26.43 dB | 5,404 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | above-original: 1,098,638 | 1,097,638 | Original bytes | 341 | Within maximum |
| portrait-hq (JPEG, 1280×1599) | 1B: 1 | No new output | — | 185 | No tested fit |
