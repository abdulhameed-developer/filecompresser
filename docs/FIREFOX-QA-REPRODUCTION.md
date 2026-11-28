# Reproducing the reviewed Firefox workflow audit

This is a **Linux x86-64 private QA recipe**, not a shipping dependency change or a claim about current stable Firefox, physical devices, or production. The pinned Mozilla Nightly 163.0a1 build and Playwright prerelease are explicitly identified in [the machine-readable recipe](evidence/2026-11-28/firefox-nightly-qa-recipe.json).

The canonical audit remains unchanged. The [reviewed patch](evidence/2026-11-28/firefox-nightly-native-input.patch) creates a separate audit copy with two changes: the normal public `moz-firefox-nightly` launch channel, and native keyboard input at eight custom-maximum numeric fill call sites. Every original application assertion, fixture, expected value, timeout and output requirement remains; exact numeric draft equality is additionally asserted. This recipe does not inject JavaScript values/events, modify browser preferences, or change the app.

## Prepare a new private copy

From the repository root:

```sh
python3 docs/evidence/2026-11-28/prepare-firefox-nightly-qa.py
```

The helper verifies the exact source and patch hashes, creates a unique directory under ignored `.qa-results`, applies the patch without fuzz, verifies the adapted hash, and checks that the canonical source remained unchanged. It does **not** launch a browser, install packages or touch production. Its output includes the private harness path and a durable `preparation.json`. If the canonical source changes, it refuses; review a new patch rather than bypassing that check. A separately preserved canonical file may be supplied through `--source`, but must have the same reviewed hash.

## Use the pinned private toolchain

The release investigation used official npm `playwright-core@1.66.0-alpha-2026-11-28` with the official Mozilla archive dated `2026-11-28-08-32-09-mozilla-central`, English Linux x86-64, build ID `20261128083209`. Verify the package's npm SRI and the archive's published Mozilla SHA-256/SHA-512 before unpacking. Validate archive paths and link destinations and extract only into a task-private directory. The recipe records both URLs and hashes. Do not replace the installed browser, change OS security settings, or edit a browser binary/profile.

`PW_TOOLS` must resolve `playwright-core`, `ffmpeg-static@5.3.0` and `ffprobe-static@3.1.0`. The investigation used a private directory with only symlinks to those verified modules; it did not replace the existing stable QA toolchain. The recipe also pins the native decoder binary hashes. Repository dependencies supply `fflate` and `pdf-lib`; run the copied audit from within this repository's directory tree so their normal resolution is preserved.

With a separately built, immutable local export already served, set these ordinary environment variables and run the generated private harness:

```sh
TEST_BROWSER=firefox \
TEST_BROWSER_PATH=/absolute/task-private/firefox/firefox \
PW_TOOLS=/absolute/task-private/qa-tools \
QA_OUTPUT=/absolute/repository/.qa-results/new-candidate/firefox \
QA_VIEWPORT_WIDTH=1280 QA_VIEWPORT_HEIGHT=900 QA_TOUCH=0 \
QA_CAPTURE_STATES=1 QA_RESOURCE_TRACE=1 \
node /absolute/repository/.qa-results/phase3/qa-recipes/GENERATED/scripts/functionality-audit.mjs http://127.0.0.1:PORT
```

Use a fresh output directory. Clear any inherited `QA_CASE_RANGE` or `QA_CASE_FILTER`; a restricted run is not a 79-case pass. Independently pin the served home, tool HTML, current JavaScript/CSS, image-worker files and FFmpeg manifests/core to the immutable export before **and after** the run. Preserve the real process exit, complete case inventory, console/resource errors, browser closure, saved files and decoder results. Missing or unexecuted cases must never count as passes. Generated fixtures only are used; the audit does not require account data or uploads to third-party services.

## Why this differs from the older Firefox run

The [causal investigation](FIREFOX-COMPARE-CRASH-RESEARCH.md) preserves the failed attempts and native evidence:

- Stable Playwright's Firefox 159 and official stock Firefox 161 reproduced an upstream cross-world reflected-ARIA native crash. The pinned official Nightly contains the Mozilla 163 fix. No app CSS workaround was adopted.
- The paired patched Firefox 160 fixed ARIA but failed to emit the expected download protocol event for a genuinely saved retained WebP. File/Blob application changes were rejected after negative controls; the official Nightly BiDi path passed the same real-file download controls.
- In this pinned BiDi backend, `.fill()` on a React 19 controlled numeric field changes the DOM value through a synthetic main-world setter without updating React state. Independent generated React and actual app controls reproduced this. Real click, Ctrl+A, Backspace and sequential native key input preserve the exact draft, including exponent and invalid fractional-byte cases. Original assertions therefore use native user input in the private copy; no application behavior was weakened. The [pinned Playwright implementation](https://github.com/microsoft/playwright/blob/a804c193562095b0da20e5d4679fa87e4c8e5563/packages/playwright-core/src/server/bidi/bidiInput.ts) and its [text insertion helper](https://github.com/microsoft/playwright/blob/a804c193562095b0da20e5d4679fa87e4c8e5563/packages/injected/src/bidiInsertText.ts) support this diagnosis. No exact upstream fix for that separate input limitation is claimed.

The fresh local **L** export passed 79/79 cases with this private copy, 56 actual downloads, 50 state captures and 24 served identities before/after. Its earlier 73/79 numeric-fill run remains failed evidence. Future candidates require their own full run and identity pins; this recipe does not carry L's result forward. The separate comparison audit additionally retains its reviewed normal Firefox wheel-transaction pause; all original scrolling and focus assertions remain.

The same exact private copy was subsequently run freshly against final local **M**, after the size-unit corrections: **79/79**, 56 real downloads, 50 state captures, 24 stable served identities and normal native browser closure. Four separate M comparison profiles also passed; see the [sanitized resolution record](evidence/2026-11-28/firefox-aria-regression-resolution.json). The original L and failed attempts remain preserved. This result still does not certify a future candidate or production.
