# Image compression: controlled engineering and competitor benchmark

Measured 27 November 2026. This is a product investigation, not a marketing claim that one service always wins. Previous production code `0197d18` and documentation checkpoint `02b078d` remain the historical baseline. The owner's exact problem image was not supplied; the dataset reproduces the same class of slow PNG optimization and modest savings without assuming its exact cause.

## Dataset, privacy and method

Fifteen inputs cover high-resolution and portrait photography, a landscape, detailed graphics, text, screenshots, a smooth gradient, continuous transparency, an already compressed photograph/screenshot, WebP, EXIF orientation, an embedded sRGB ICC profile and 16-bit PNG samples. They use generated artwork or appropriately attributed public-domain/CC-BY-SA photographs. Fixture-generation resampling establishes the input only; processing must preserve each input's displayed dimensions.

- Portrait: [Official White House Photo by Pete Souza, public domain](https://commons.wikimedia.org/wiki/File:President_Barack_Obama.jpg). The benchmark derivatives are identified in the manifest; no endorsement is implied.
- Landscape: [Fronalpstock by Hannes Röst](https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The downloaded 3840-pixel derivative was resized/re-encoded to create the explicitly identified fixtures; derivatives retain attribution and this license.
- Generated artwork is dedicated to CC0 for reproducible testing. No visitor files or personal uploads were sent to a competitor, persisted in browser storage or used for telemetry.

The private dataset, original source bytes, manifest, SHA-256 values and downloads are under `.qa-results/phase2/image-lab/`. `scripts/make-image-benchmark.py` refuses to overwrite a measured dataset. `scripts/image-benchmark.mjs` invokes the real shipped worker, saves actual output bytes and records stages. Its optional client-entry mode additionally exercises the real `compressImage` worker lease and cancellation policy. Input and output serialization are excluded from encoding timing; page loading is measured separately. Every input uses a fresh browser context, followed by a repeat in that context. Warm HTTP cache does not mean a warm WASM instance in the old per-job-worker implementation.

The machine is an Intel Core i5-2400 at 3.10 GHz, four logical CPUs, 7,603,036,160 bytes RAM, Linux x64, Chrome `156.0.8078.47`. These are local unthrottled lab measurements, not promises for phones, production networks or all images. The early baseline overlapped brief editor initialization and a short unrelated lint process; these timing samples retain that limitation. Output byte sizes and hashes are unaffected. Later paired runs are recorded separately, without silently replacing earlier attempts.

Progress timestamps separate coarse checking, decoding, encoding, palette trials, refinement and verification intervals. They do **not** independently isolate WASM transfer, compilation, initialization and native encoding inside the first codec call. No fabricated per-stage values are supplied for those uninstrumented substeps. Provider encoder-only CPU time is unavailable; their network/UI duration cannot establish an equivalent encoding-speed ranking. Field memory/thermal behavior and physical-device timings are also unmeasured.

Quality is independently decoded with Pillow and measured by the versioned `scripts/image-quality-audit.py`: Gaussian single-scale SSIM, sigma 1.5, population covariance, explicit range 255, RGB and BT.709 luma, on both black and white composites; PSNR; exact alpha; dimensions; raw oriented samples; profile-aware conversion to sRGB; and input/output hashes. [The scikit-image method](https://scikit-image.org/docs/stable/api/skimage.metrics.html) is retained with package versions. This is not MS-SSIM, Butteraugli, an invisible-change guarantee or a substitute for the native-crop visual sheets. One shared metric implementation avoids presenting different SSIM definitions as interchangeable results.

The initial corpus includes an embedded sRGB profile and unprofiled images, not a complete Adobe RGB/Display P3/CMYK camera/profile matrix. Additional malformed-profile, high-precision and orientation checks have their own stated results; they do not establish every possible color-management workflow.

## What the baseline actually does

The image engine already uses MozJPEG, rather than ordinary browser JPEG, so replacing its name with another library would not solve the complaint. JPEG presets are encoder parameters 93/82/60 for High Quality/Balanced/Maximum; these percentages are not percentages of quality retained. WebP uses the browser encoder. **The engine's omitted-option fallback was Balanced/Lossless, but the actual prior UI explicitly forced Maximum for JPEG/WebP and PNG, including mixed queues.** The old `workflowDefaults` and its regression test confirm that distinction. Consequently, the engine-fallback table below is not a claim about the old UI's default output. The complete matrix includes the old UI's Maximum modes separately.

This mismatched UI policy made a first-time user enter the slower PNG palette search or lower JPEG/WebP quality immediately. The Phase 2 workflow correction selects Balanced JPEG/WebP and Lossless PNG, including mixed queues, with color reduction remaining explicit. Actual rendered controls and outputs have their own browser-verification gate. PNG lossless uses Oxipng; optional color reduction uses UPNG with exact source alpha restoration and numerical color-error guards.

The old worker is created and terminated for each probe/job. Each new encoder worker initializes its own lazy codec. PNG color modes can also pay for a full lossless search, up to five palette quantizations/encodes/decodes, and final refinement. This is measurable CPU work. Lossless PNG savings cannot fairly be compared with another provider's color-reduced PNG as if quality policies were identical.

Existing pinned codec payloads are small and lazy: MozJPEG WASM 251,524 bytes, single-thread Oxipng WASM 164,172 bytes, UPNG/Pako browser JS 269,521 bytes before HTTP compression. They are not loaded on the empty tool page. No new runtime codec dependency is introduced in this phase. The pinned package notices and native codec licenses remain packaged. Relevant primary references: [jSquash JPEG](https://github.com/jamsinclair/jSquash/tree/main/packages/jpeg), [MozJPEG](https://github.com/mozilla/mozjpeg), [jSquash Oxipng](https://github.com/jamsinclair/jSquash/tree/main/packages/oxipng), [Oxipng](https://github.com/shssoichiro/oxipng), [UPNG](https://github.com/photopea/UPNG.js).

### Baseline: engine fallback policy, actual outputs

The initial real-worker matrix contains **90 outputs: 15 inputs × 3 applicable modes × 2 runs, zero worker/resource failures**. The table shows the engine's omitted-option policy, **not the prior UI's explicitly forced Maximum**. All modes, output hashes, source dimensions, encoder names and progress timestamps remain in `baseline/results.json`. Times are first context request / HTTP-warm repeat, in milliseconds. Both runs produced identical output hashes for each corresponding mode.

| Input | Display dimensions | Input bytes | Engine-fallback output bytes | Reduction | First / repeat ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Generated screenshot PNG | 1440×900 | 3,890,236 | 83,020 | 97.87% | 3570 / 3203 |
| Text JPEG | 1440×900 | 348,507 | 98,204 | 71.82% | 1320 / 1446 |
| Already optimized screenshot PNG | 1440×900 | 111,968 | 83,020 | 25.85% | 3836 / 2741 |
| Continuous-alpha PNG | 768×512 | 74,504 | 29,945 | 59.81% | 2652 / 1766 |
| Gradient PNG | 1600×900 | 239,911 | 82,808 | 65.48% | 6249 / 5098 |
| Fine-detail JPEG illustration | 2048×1365 | 5,577,957 | 1,328,389 | 76.19% | 3693 / 3018 |
| Portrait JPEG | 1280×1599 | 1,097,638 | 210,656 | 80.81% | 693 / 648 |
| Large portrait JPEG | 2687×3356 | 2,542,820 | 874,470 | 65.61% | 2617 / 2550 |
| Landscape JPEG | 2560×1150 | 2,203,552 | 537,914 | 75.59% | 1202 / 1165 |
| Already compressed landscape JPEG | 2560×1150 | 409,170 | 409,170 | 0.00% | 1264 / 1202 |
| Photographic PNG | 1280×575 | 1,367,176 | 1,367,176 | 0.00% | 1616 / 1605 |
| Landscape WebP | 1280×575 | 362,206 | 132,326 | 63.47% | 360 / 300 |
| EXIF orientation 6 JPEG | 1200×900 | 338,842 | 118,305 | 65.09% | 521 / 447 |
| Embedded sRGB-profile PNG | 960×600 | 134,325 | 134,325 | 0.00% | 1125 / 1128 |
| 16-bit grayscale PNG | 512×256 | 8,080 | 1,964 | 75.69% | 367 / 339 |

The generated PNG screenshots deliberately include both a large uncompressed encoding and an already optimized encoding of the same pixels. Their very different reduction percentages show why a large percentage is not a quality score. The already compressed photo and photographic PNG are honestly retained where no smaller accepted engine-fallback result exists.

### Reproduced bottleneck and rejected optimization

The optimized screenshot's old Smart mode took 9364 / 7579 ms for 31,045 bytes; Maximum took 14668 / 19226 ms for 29,987 bytes. The photographic PNG's old Maximum took 10001 / 9596 ms for 278,080 bytes. Its first measured run spent about 3467 ms before the first palette trial, four trials of roughly a second each, and 2424 ms in final refinement. These measurements substantiate the complaint class; they do not blame the browser or network without evidence.

A separate **42-output experimental candidate** used level-1 lossless effort, one Smart palette and deferred lossless work. It was **rejected**. Although faster, it made gradient lossless output 138,799 instead of 82,808 bytes (+67.62%), and 16-bit output 3,026 instead of 1,964 (+54.07%). It could also return a lossy transparent PNG larger than its available lossless result. That failure remains in `candidate-png/`; it is not relabeled as a final improvement.

The selected design retains the established level-2 lossless baseline and compares every color-reduction result against it. Smart tests one higher-color 256-color trial with its unchanged 40 dB/error/alpha guards. Maximum begins at 64 colors, tries 32/16 when accepted, or 128/256 if 64 fails; the unchanged 34 dB/error/alpha guards still decide acceptance. Target retains its greatest-color-first bounded search and its previous stronger level-4 lossless attempt at ≤4MP, level 2 above that. Tested byte sizes are compared directly. This is a bounded heuristic, not a promise of an exhaustive optimum. Only Maximum lowers its small-image effort from 4 to 2, with the measured byte/time trade-off reported rather than hidden.

A final review caught why lowering Target effort would be wrong: the measured gradient needs 82,808 bytes at level 2 but 72,797 at level 4. An 80,000-byte limit should retain that existing lossless success. The Target-only restoration and regression are separate from the 42 selected Lossless/Smart/Maximum measurements, whose behavior it does not change. The final frozen export's worker hash must match the restored source; an earlier build copied before this narrow correction is not the accepted artifact.

After success, the worker lease clears its message handlers and input closures and may retain at most one initialized encoder. It schedules cleanup after 30 idle seconds and releases the idle worker on page exit. Browser suspension/background timer scheduling can delay that callback; this is not a hard wall-clock memory-release guarantee. Probe workers do not displace the warm encoder. Concurrent jobs keep exclusive ownership; excess successful workers are disposed. Cancellation/errors immediately terminate the affected worker. Job IDs reject stale replies, and malformed responses are never cached. This retains no user file in persistent storage.

## Identical-file competitor downloads

The built-in browser was used for the actual named tool pages. Files are the exact benchmark inputs, matched by SHA-256, format and display dimensions. Native downloaded results and quality sheets are retained under `.qa-results/phase2/competitors/`. Providers' UI/default settings differ; the following actual measurements expose those differences rather than treating all quality knobs as equivalent.

| Provider / tool setting | Input | Output bytes | Reduction | White-composite RGB PSNR / Gaussian SSIM | Exact alpha |
| --- | --- | ---: | ---: | --- | --- |
| 11zon, default 60 | Screenshot PNG | 89,145 | 97.71% | 68.70 dB / 1.00000 rounded | Yes |
| 11zon, default 60 | Landscape JPEG | 244,174 | 88.92% | 30.32 dB / 0.83555 | N/A (opaque JPEG) |
| 11zon, default 60 | Portrait JPEG | 98,541 | 91.02% | 35.62 dB / 0.92079 | N/A (opaque JPEG) |
| 11zon, default 60 | Transparent PNG | 9,793 | 86.86% | 49.70 dB / 0.99266 | **No** |
| iLoveIMG, default | Landscape JPEG | 629,879 | 71.42% | 34.44 dB / 0.91849 | N/A (opaque JPEG) |
| iLoveIMG, default | Portrait JPEG | 156,672 | 85.73% | 38.23 dB / 0.94397 | N/A (opaque JPEG) |
| iLoveIMG, default | Screenshot PNG | 28,156 | 99.28% | 45.62 dB / 0.99970 | Yes |
| iLoveIMG, default | Transparent PNG | 17,304 | 76.77% | 41.12 dB / 0.94981 | **No** |
| TinyPNG, default | Gradient PNG | 232,533 | 3.08% | 30.12 dB / 0.59681 | Yes |
| TinyPNG, default | Screenshot PNG | 35,260 | 99.09% | 54.78 dB / 0.99996 | Yes |
| TinyPNG, default | Text JPEG | 82,258 | 76.40% | 34.06 dB / 0.98290 | N/A (opaque JPEG) |
| TinyPNG, default | Transparent PNG | 11,786 | 84.18% | 51.30 dB / 0.99467 | **No** |
| Squoosh, MozJPEG 75 | Landscape JPEG | 373,881 | 83.03% | 32.60 dB / 0.88586 | N/A (opaque JPEG) |
| FreeConvert, default | Gradient PNG | 275,563 | **−14.86%** | 28.96 dB / 0.57627 | Yes |
| FreeConvert, default | Screenshot PNG | 45,340 | 98.83% | 65.50 dB / 0.999997 | Yes |
| FreeConvert, default | Text JPEG | 304,291 | 12.69% | 61.48 dB / 0.999865 | N/A (opaque JPEG) |
| FreeConvert, default | Transparent PNG | 21,970 | 70.51% | 65.74 dB / 0.999921 | **No** |

The table records the first successful actual-download batches. A second native-browser run then repeated the exact generated screenshot and transparent PNG on 11zon, iLoveIMG, TinyPNG and FreeConvert, plus the same licensed landscape in local Squoosh at MozJPEG 75. All nine repeated outputs had the same dimensions, file size and independently decoded RGBA as their corresponding first output. Eight were byte-identical. 11zon's transparent output remained 9,793 bytes and pixel-identical, but its PLTE/tRNS/IDAT chunks changed, so file-level determinism is not claimed for that case. The repeat ledger and all hashes are in `competitorRepeatedOutputs` in the evidence JSON; actual downloads and native result screenshots are under `.qa-results/phase2/competitors/repeats/`.

| Repeated provider setting | Same input(s) | Output bytes per run | Byte-identical / decoded RGBA-identical |
|---|---|---:|---|
| 11zon, 60 | Screenshot / transparent | 89,145 / 9,793 | Screenshot yes, transparent no / both yes |
| iLoveIMG default | Screenshot / transparent | 28,156 / 17,304 | Both yes / both yes |
| TinyPNG default, no conversion | Screenshot / transparent | 35,260 / 11,786 | Both yes / both yes |
| FreeConvert default | Screenshot / transparent | 45,340 / 21,970 | Both yes / both yes |
| Squoosh MozJPEG 75 | Landscape JPEG | 373,881 | Yes / yes |

This is two actual outputs for nine configurations, not repeated provider performance statistics or evidence about every format. No encoder-only timing is available: native observation delays, upload/network conditions, server work and browser-control overhead were not separately measured. Server caching/deduplication is opaque, so repeated downloads do not prove two fresh server encodes. 11zon also opened an advertisement on the first download action; it was dismissed through its visible Close control. A rounded SSIM of 1 does not imply byte/pixel identity. Native crops exposed visible transparency/gradient banding despite high aggregate metrics; alpha changes are explicitly recorded. Transparent-PNG results that alter opacity do not meet FileCompresser's exact-alpha constraint. Conversely, a competitor's smaller output at useful quality is a real finding, not dismissed because our implementation passes tests. Full black/white metrics and hashes take precedence over rounded table values.

CloudConvert's actual native-browser compression attempt was **BLOCKED** by the available daily 10-credit allowance. Its JPG Options displayed quality75, but no successful output was obtained and no byte/quality/speed result is invented for it. Cloud-provider upload/network time and opaque server encoding time are not interchangeable with the isolated local-worker timings above. No repeated, equivalent provider encoding-time ranking has been established.

### Visual evidence: size and fidelity

Original technical comparison sheets are also included in the repository: [FileCompresser Lossless](evidence/2026-11-27/quality/filecompresser-transparent-lossless.png), [FileCompresser Maximum](evidence/2026-11-27/quality/filecompresser-transparent-maximum.png), and [11zon default 60](evidence/2026-11-27/quality/11zon-transparent-default60.png). The same generated CC0 input is 768×512 and 74,504 bytes. Lossless produces 29,945 bytes with exact RGBA; Maximum produces 11,216 bytes with exact alpha but visible bands and greener text; 11zon produces 9,793 bytes with bands and changed alpha. This is a size/fidelity trade-off, not equivalent quality or speed. Each sheet includes native-scale center crops and 8× amplified differences on white/black. Historical sheet labels are retained; [the manifest](evidence/2026-11-27/quality/manifest.json) records exact current output-hash reuse and original provenance.

### Observed competitor controls and privacy distinctions

These are the actual desktop pages used for the downloads, observed on 27 November. Displayed limits were not boundary-tested; deletion intervals below are provider claims, not verified deletions. The small successful batches do not establish a maximum batch size, and no competitor mobile acceptance pass is claimed.

| Service | Actual control/download observation | Privacy or limit wording observed |
| --- | --- | --- |
| [TinyPNG](https://tinypng.com/) | Four optimized results and Download all; automatic conversion was disabled for the repeated matching-format tests | Up to 20 images, 5 MB each; FAQ claims uploads are retained for at most 48 hours |
| [11zon](https://www.11zon.com/) | Slider plus numeric compression level 60; four results, individual downloads and Download ZIP; an advertisement needed dismissing | Page claims server files are removed within 2 hours; its “Unlimited” wording is marketing, not a measured limit |
| [FreeConvert](https://www.freeconvert.com/image-compressor) | Individual/Download All and device/cloud/QR destinations; gradient result explicitly reported increased size | Result page claims deletion after 8 hours; cloud destinations were not exercised |
| [iLoveIMG](https://www.iloveimg.com/compress-image) | Download compressed IMAGES, cloud/share/QR and Delete it now controls; actual API-host download observed | Retention and deletion were not tested; the retained network trace starts after processing |
| [CloudConvert](https://cloudconvert.com/compress-jpg) | JPG Options, Add more files and a real failed attempt | Available daily 10-credit allowance blocked output; no paid credit or limit bypass |
| [Squoosh](https://squoosh.app/) | Actual landscape download at MozJPEG 75, with no resizing or palette edit | This single output does not establish broader limits, mobile behavior or retention |

Retained source observations are `competitors/tinypng-result-dom.txt`, `11zon-result-dom.txt`, `freeconvert-result-text.txt`, `iloveimg-result-dom.txt`, `iloveimg-network.json`, `cloudconvert-credit-blocked.txt` and `repeats/results.json` under the ignored Phase 2 evidence directory. FreeConvert's truncated network capture contains no events and supports no network inference. FileCompresser's separate strict workflow tests observe no file-upload requests; benchmark inputs and download hashes remain local.

## Selected-code results and trade-offs

The selected PNG matrix produced **42/42 real outputs**, independently checked against the exact input/output hashes: 36 cases reuse quality evidence only for byte-identical pairs; six cases covering three new pairs were independently decoded with the same calibrated Gaussian method. Dimensions and alpha match for all 42; actual 16-bit raw samples remain exact. Two repetitions of each mode produce the same output hash.

Times below are arithmetic means of the two recorded local runs, milliseconds. The earlier mixed-load timing limitation still applies. In particular, Lossless source policy is unchanged and its faster later timings must **not** be attributed to a new lossless algorithm. The unchanged photographic-PNG default also has normal timing variance in the opposite direction.

| Input / mode | Before bytes | Selected bytes | Before / selected ms | Selected white RGB SSIM | Selected alpha |
| --- | ---: | ---: | ---: | ---: | --- |
| Screenshot / Lossless | 83,020 | 83,020 | 3386 / 2070 | 1.000000 | Exact |
| Screenshot / Smart | 31,045 | 44,357 | 12195 / 3374 | 0.999998 | Exact |
| Screenshot / Maximum | 29,987 | 31,045 | 19855 / 5010 | 0.999843 | Exact |
| Optimized screenshot / Lossless | 83,020 | 83,020 | 3288 / 1793 | 1.000000 | Exact |
| Optimized screenshot / Smart | 31,045 | 44,357 | 8471 / 3392 | 0.999998 | Exact |
| Optimized screenshot / Maximum | 29,987 | 31,045 | 16947 / 4789 | 0.999843 | Exact |
| Transparent / Lossless | 29,945 | 29,945 | 2209 / 1124 | 1.000000 | Exact |
| Transparent / Smart | 11,257 | 29,945 | 6918 / 1946 | 1.000000 | Exact |
| Transparent / Maximum | 11,137 | 11,216 | 16072 / 2589 | 0.999425 | Exact |
| Gradient / Lossless | 82,808 | 82,808 | 5674 / 4028 | 1.000000 | Exact |
| Gradient / Smart | 82,808 | 82,808 | 6849 / 5595 | 1.000000 | Exact |
| Gradient / Maximum | 72,797 | 82,808 | 16326 / 8287 | 1.000000 | Exact |
| Photographic PNG / Lossless | 1,367,176 | 1,367,176 | 1610 / 1774 | 1.000000 | Exact |
| Photographic PNG / Smart | 1,367,176 | 1,367,176 | 2739 / 2784 | 1.000000 | Exact |
| Photographic PNG / Maximum | 278,080 | 277,727 | 9799 / 4276 | 0.945079 | Exact |
| sRGB profile / Lossless | 134,325 | 134,325 | 1127 / 1138 | 1.000000 | Exact |
| sRGB profile / Smart | 13,235 | 47,361 | 3366 / 1842 | 0.999979 | Exact |
| sRGB profile / Maximum | 12,948 | 13,235 | 7008 / 2884 | 0.999061 | Exact |
| 16-bit / Lossless | 1,964 | 1,964 | 353 / 367 | 1.000000 | Exact |
| 16-bit / Smart | 1,964 | 1,964 | 325 / 383 | 1.000000 | Exact |
| 16-bit / Maximum | 1,652 | 1,964 | 639 / 312 | 1.000000 | Exact |

Smart deliberately tests fewer/higher colors rather than reproducing the old deeper palette search. It can produce larger files with better fidelity or retain lossless pixels when its one accepted color candidate is not smaller. Maximum retains a real byte/time trade-off: optimized screenshot output is 3.53% larger, gradient 13.75% larger, and the 16-bit sample 312 bytes larger than the former level-4 result; the photographic PNG is 353 bytes smaller. These are accepted, visible trade-offs, not a claim that every chosen output shrank further.

### What the quality comparisons show

| Same input | FileCompresser measured point | Relevant competitor point / interpretation |
| --- | --- | --- |
| Screenshot PNG | Lossless 83,020B / exact pixels; Smart 44,357B / SSIM0.999998; Maximum 31,045B / 0.999843 | 11zon89,145B is larger than our lossless file and not pixel-identical. TinyPNG35,260B and iLoveIMG28,156B are smaller than Smart, with lower measured SSIM. Maximum gives a different quality/size point; there is no universal winner. |
| Transparent PNG | Lossless29,945B / exact pixels; Maximum11,216B / SSIM0.999425, exact alpha | TinyPNG11,786B, iLoveIMG17,304B and FreeConvert21,970B alter alpha; 11zon9,793B is smaller but also alters alpha. Our exact-alpha constraint is preserved. It does not guarantee invisible RGB changes. |
| Gradient PNG | Lossless82,808B / exact pixels | TinyPNG232,533B and FreeConvert275,563B have substantial measured and visible gradient changes on this particular input. This is an actual favorable case, not a general statement about those providers. |
| Landscape JPEG | Balanced537,914B / SSIM0.914278; Maximum256,900B / 0.845436 | iLoveIMG629,879B / 0.918490 is larger with slightly higher SSIM. 11zon244,174B / 0.835552 is smaller with lower SSIM. Squoosh373,881B / 0.885856 uses a different quality setting. |
| Portrait JPEG | Balanced210,656B / SSIM0.949656; Maximum105,636B / 0.929332 | iLoveIMG156,672B / 0.943974 is smaller with slightly lower SSIM. 11zon98,541B / 0.920794 is smaller with lower SSIM. These points do not prove equal perceived quality. |

Native-crop visual review found that our explicit Maximum transparent result also has visible color banding and greener text, despite very high SSIM. Restoring a lossless initial PNG workflow matters for actual quality. Selected Smart screenshot text is much closer to its source; JPEG Balanced still softens fine landscape detail. These observations are why numerical guards are described as heuristics and the original/output comparison remains available.

### Source preflight and warm-engine measurements

The real `availableOutputFormats` API was measured independently of compression and page load, three calls in fresh per-input contexts. A valid JPEG container establishes no alpha and bounded EXIF display dimensions, so the new preflight avoids a full bitmap/canvas/alpha scan. It does **not** claim its entropy-coded scan data is decodable; actual compression still decodes and verifies it. PNG/WebP still receive real worker alpha inspection, including the high-precision PNG safeguard.

| JPEG preflight | Before ms, three calls | After ms, three calls | Worker result |
| --- | --- | --- | --- |
| 1280×1599 portrait | 173 / 180 / 147 | 3 / 3 / 3 | No JPEG probe worker allocated |
| 2687×3356 portrait | 290 / 335 / 259 | 3 / 3 / 3 | No JPEG probe worker allocated |
| EXIF orientation 6 | 117 / 102 / 98 | 3 / 2 / 4 | Correct1200×900 display geometry, no probe worker |

Actual `compressImage` client runs also preserve byte-identical Balanced JPEG/WebP results. The second portrait call measured679→571ms; WebP257→205ms; EXIF JPEG470→388ms. These six-before/six-after small-sample measurements demonstrate the real lease policy and retain timing variance; they are not universal speed statistics. The old implementation created/terminated a worker on every call; the new implementation reused one worker.

The actual-browser worker audit passes all six checks: repeated real JPEG output, JPEG/transparent-PNG probe isolation, termination during an active PNG palette search, a fresh successful retry, malformed ICC chunk preservation, and real 30-second idle termination. Independent Pillow decode confirms that malformed-profile PNG retained the source's exact RGBA/alpha and768×512 dimensions; no valid color-profile interpretation is claimed for deliberately invalid ICC data. No failed resources, unhandled page errors or file-upload methods were observed.

Compact, Git-retained evidence: [image benchmark JSON](evidence/2026-11-27/image-benchmark.json). Full source/codec hashes, raw trials, stage timestamps, downloaded outputs and native crops remain under `.qa-results/phase2/image-lab/`; provider downloads remain separately under `.qa-results/phase2/competitors/`. Actual final rendered-UI timing and Target boundary checks are recorded separately from these codec/API measurements, and release identity remains in `PROJECT_OVERHAUL_PROGRESS.md`.

## Actual frozen-application workflow

Measured local artifact A `6w3a2S9vDu4Npur6j0SiS`, homepage SHA `5ee34ad36515657ac42034c0d495f2d54ff416dcf8497448c6c5bf56c25499e7`, has the exact restored worker SHA `8e9ce49d7e90115d20ecc30cc130a06746d9b03b5b164e4e56f1e81f1d7987c6`. The old and revised UI selected modes were opened and inspected before processing. Genuine downloads and screenshots were captured; Pillow independently decoded the outputs and verified dimensions. Later frontend-only rebuilds have separate artifact/verification identities in `PROJECT_OVERHAUL_PROGRESS.md`; these timings are not relabeled as measurements of a later build.

The following are **different initial product policies**, not a same-quality codec comparison. Selection-to-ready includes automated local file selection, validation, lazy interface loading and preflight. Navigation is recorded separately in the raw report. Both repetitions use fresh contexts at1280×900.

| Input | Old / final initial policy | Old ready ms | Final ready ms | Old click→result ms | Final click→result ms | Old / final output bytes |
| --- | --- | --- | --- | --- | --- | --- |
| 9MP portrait JPEG | Maximum / Balanced | 969 / 969 | 210 / 168 | 2945 / 2415 | 2909 / 2880 | 342,144 / 874,470 |
| Optimized screenshot PNG | Maximum / Lossless | 279 / 322 | 328 / 283 | 12412 / 12440 | 2360 / 2364 | 29,987 / 83,020 |

The JPEG encoding itself does not become faster at its higher-quality initial setting; the eliminated full-resolution preflight makes it ready sooner. The PNG initial operation becomes substantially faster and pixel-perfect, with a larger output than the former color-reduced file. Optional Smart/Maximum remain available, with their separate measured trade-offs. A smaller percentage after choosing a quality-preserving policy is not hidden or presented as a compression failure.

The real390px Target80KB workflow produced **72,797 bytes**,1600×900, with **exact original decoded RGBA** and a visible Target met result. It took **13,479ms** because that explicit tight-size operation retains the stronger lossless search. This is a real remaining advanced-mode speed limitation, not a two-second claim. It also proves why the attempted Target effort reduction was restored.

The first UI attempt found its immutable baseline server stopped: four old-view navigations returned CONNECTION_REFUSED before any file operation. Those failures remain in `ui-timing/report.json`; the five final-artifact cases passed there. After restarting the unchanged baseline, its four cases passed in `ui-timing-before-retry/report.json`. This is nine unique verified workflows across5+4 cases, **not a fabricated uninterrupted9/9 run**. The failure is a local QA setup interruption, not evidence of a product encoder failure. All screenshots and original reports are retained.

## Bounded visual output review

Every one of the15 input identifiers received an actual overview/native-center-crop review on black and white, using the applicable default-quality or lossless result. Risk-sensitive explicit color-reduction outputs were also viewed. The selected7PNG×3mode mapping is in `selected-visual-map.json` and the compact evidence JSON: a reused screenshot applies only where the exact input/output hash pair is independently verified. A historical `baseline` or rejected-experiment label on a reused sheet does not turn that entire historical experiment into an accepted implementation.

| Input | Actual output view inspected | Finding |
| --- | --- | --- |
| screenshot | Selected Smart, selected Lossless and selected Maximum pixels | Lossless difference is zero. Smart native text is close to source; Maximum has more antialias/color differences in the amplified panel. |
| text-high-quality | Balanced JPEG | Text remains legible; edge ringing/chroma changes are visible at native resolution and much clearer in the amplified panel. It is not pixel-perfect screenshot optimization. |
| screenshot-optimized | Selected Lossless and Smart | Lossless retains exact text/colors. Smart's high-color candidate remains close in the native text crop. The smaller source encoding does not change the underlying picture. |
| transparent | Selected Lossless/Smart fallback and selected Maximum | Exact lossless result retains the smooth appearance and text color. Maximum preserves alpha but has visible color bands and greener text; it is an explicit trade-off, not an invisible change. |
| gradient | Selected lossless pixels used by all three modes | Smooth source appearance retained with zero decoded difference. Actual Target80KB result also has exact RGBA. |
| fine-details | Balanced JPEG | Line geometry remains, but fine colored strokes lose saturation/detail. High Quality or a lossless format is appropriate when that detail matters; a high savings number does not imply equivalent quality. |
| portrait-hq | Balanced JPEG | Overall portrait remains close; suit/tie texture is smoother and small badge detail is softened. |
| portrait-large | Balanced JPEG | Native suit/tie crop retains more texture than the smaller portrait crop; mild smoothing remains. No crop/dimension change. |
| landscape-hq | Balanced JPEG | Cliff/forest detail softens. Overall color/scene remains coherent; this is still lossy encoding. |
| landscape-optimized | Balanced original-retained result | Source/output views and amplified difference match the exact-byte-retention result. No extra quality loss is introduced to force savings. |
| landscape-photo | Original-retained default and selected Maximum | Lossless retains exact detail. Maximum's reduced-color sky and rock/vegetation texture show changes, including visible banding in sky regions. |
| landscape-hq-webp | Balanced WebP | Scene/color remain close in overview; native rock/forest details are mildly softened. |
| orientation-6 | Balanced JPEG | Source's intentional EXIF rotation and1200×900 display axes agree with output. Sideways portrait orientation is part of the controlled source, not a newly introduced rotation. |
| profiled-srgb | Selected original-retained Lossless, Smart and Maximum | Default is unchanged. Smart native text/colors are close; stronger color-reduction differences are apparent in Maximum's amplified panel. This tests sRGB, not every profile. |
| precision-16 | Exact lossless result plus explicit fixed-window16-bit visualization | Pillow's ordinary8-bit preview clips much of this sample, so that white preview is not used to certify gradient appearance. A separately labeled linear0..65535→0..255 visualization uses the same mapping on source/output and matches. Raw uint16 arrays independently match exactly; all65,536 possible source values are represented. |

The review covers these overviews/crops and numerical/raw-sample checks, not every pixel under a calibrated monitor, every camera profile, all display color spaces or physical-phone rendering. It found real lossy artifacts and reports them instead of calling all accepted outputs visually identical.

The existing static brand logo was also losslessly optimized separately from the 15-file tool benchmark: `public/logo.png` decreased from 23,298 to 22,361 bytes, saving 937 bytes (4.02%). Independent full RGBA and alpha comparisons confirm the same 223×68 pixels; its absent profile/gamma metadata remains absent. Only the PNG encoding changed, with no artwork, dimensions or markup change. This modest saving does not claim Lighthouse’s approximately 21 KB resizing-based estimate. Original bytes, candidate comparisons and hashes are retained under `.qa-results/phase2/logo-lossless/`; the accepted asset SHA-256 is `20c05cf089e1341eb498002013670d4d7d0e587549c32bbad116c04d464ebbab`.

## Transparent GIF follow-up on final local artifact E

Both real UI modes, Recommended and Maximum, encoded the generated 160×120 animation from 12,103 to 5,204 bytes (57.00% smaller), rather than returning the original. The fixture has 12 moving-shape frames, disposal 2, mixed 80–200 ms delays and loop value 3; its deliberately unoptimized full palettes provide room to test genuine encoding. Native FFprobe/raw GIF checks confirm every delay, frame count, dimensions and loop value. Native FFmpeg-decoded RGBA/alpha matches across all frames. Independent Pillow confirms exact alpha, visible pixels and black/white composited frames, while exposing changed hidden RGB under alpha0 (black→green). The RGBA equality is decoder-specific; raw hidden RGB/palette identity is not promised. Both modes have the same output on this four-color fixture; this is no general savings, high-color quality or speed claim.

The test records final E build `t6z3cxJkJn2Ovnf43hpvK`, homepage SHA `823f6e5db8d2e92468078ef3754c8d60d48afe2b2d6c3da7862187b52df6d71f`, two valid downloaded GIFs, zero page errors/failed resources and a closed browser. Native frame sheets and actual Settings/result screenshots were visually inspected. [Compact GIF evidence](evidence/2026-11-27/gif-transparency-verification.json) retains the source/output hashes and per-frame findings without private runner paths. Maximum-size animations, other disposal modes and every palette are outside this small targeted test.
