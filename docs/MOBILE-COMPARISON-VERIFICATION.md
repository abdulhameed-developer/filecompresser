# Mobile image comparison scrolling

28 November 2026, Asia/Karachi. **Implemented; genuine local before/after reproduction passed on candidate A. Final candidate and production matrices are separate release gates.**

## Cause and correction

The image panes are nested scroll containers. At Fit, their content often has no vertical overflow. The previous `overscroll-behavior: contain` still prevented a vertical gesture from passing from either pane to the comparison dialog. A swipe on the dialog text outside the panes worked, while the same gesture on an image or checkerboard did not.

The correction changes the pane rule to `overscroll-behavior: contain auto`: horizontal movement remains contained, while vertical movement can pass to the dialog at the pane's edge. The dialog itself contains overscroll so a gesture does not move the background page. There is no new touch listener, pointer capture or `preventDefault` workaround. Zooming and synchronized image panning use the existing component.

## Genuine before/after control

The same generated 1440 × 900 PNG was selected, processed and downloaded through both compiled interfaces. The resulting 83,020-byte PNG was loaded into the real comparison. Viewport: 390 × 844, Chrome 156.0.8078.47, emulated touch capability. The fixed harness has SHA-256 `73c126353307cf98a185eb57421055db73ee6d530ca94ce26468daf2bfcaa6c1` in both runs and remained unchanged during execution.

| Actual gesture start | Retained Phase 2 mirror, old pane rule | Candidate A, corrected pane rule |
| --- | --- | --- |
| Original image, actual IMG hit-test | Dialog 0 → 0 px: failed | 0 → 145 px: passed |
| Output image, actual IMG hit-test | 132 → 132 px: failed | 145 → 23 px: passed |
| Checkerboard within the pane | 132 → 132 px: failed | 23 → 208 px: passed |
| Header paragraph outside the panes, positive control | 0 → 73 px: passed | 0 → 86 px: passed |
| Zoomed pane boundary → remaining dialog content | Blocked: failed | Native edge gesture moved the dialog: passed |

The start locations were checked with actual browser hit-testing. Screenshots were taken before and after the native gestures; no CSS, event listeners or application state were injected to make them pass. Candidate A also passed actual keyboard horizontal/vertical panning, synchronization of both image views within one pixel, interior zoomed-pane scrolling without moving the dialog, background scroll stability and Escape focus/scroll return. Both owned browsers closed normally.

Original reports and screenshots: `.qa-results/phase3/comparison/verified-baseline-real-touch/` and `verified-A-real-touch/`. The retained mirror is the exact Phase 2 export, homepage SHA `ca79c4abf7c695f89dc38034bb9db441d61c098caaa1720aadb34d4a4ec6edb3`. Candidate A has its own build identity and is not relabeled as the final release.

## QA input failure investigated

Initial Chrome CDP `synthesizeScrollGesture` calls with `gestureSourceType: touch` produced no movement anywhere, including a separate generated plain 4,000px native scroller. The same positive-control page scrolled 160px with native wheel input and 194px/187px with real CDP `touchStart`/`touchMove`/`touchEnd` input in desktop/mobile emulation profiles. These are browser input events, not JavaScript DOM event dispatches.

The corrected harness uses that working trusted touch sequence. The original zero-movement attempts remain retained as failed QA attempts; they do not establish that the corrected application still blocks touch. An early Home/End assumption was also removed: those keys did not reliably reach the vertical boundary in a pane with horizontal overflow. The final test uses native wheel input to reach the measured boundary before testing a fresh gesture, while independently asserting real Arrow-key panning.

The independent input-control source and all eight observations remain under `.qa-results/phase3/comparison/touch-input-control.*`. No browser security setting or production infrastructure setting was changed.

## Coverage boundary

The final matrix must include 390 × 844, 320 × 568, 844 × 390 and 1280 × 900, with each engine's actual input mechanism stated. Chromium supports the trusted emulated touch sequence. Firefox/WebKit native wheel tests must be labelled wheel tests; they are not physical touchscreen swipes.

There is no comparison slider or draggable handle in this component, so slider-state testing is not applicable. Native pinch zoom, physical Android/iOS devices, VoiceOver/NVDA and all device-specific gesture behavior are not certified by this check. Final cross-engine, responsive, accessibility and production results belong to the master Phase 3 acceptance record.
