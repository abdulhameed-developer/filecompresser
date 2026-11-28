# A List Apart — editorial outline, not sent

Prepared 28 November 2026 (Asia/Karachi). The [official contribution page](https://alistapart.com/about/contribute/) accepts a pitch plus outline, rough draft or partial draft, and rejects sales pitches. Full articles are 600–2,500 words. This is a publication-specific outline prepared for review, not a completed article or a backlink placement. No message has been sent. Human author identity, actual experience and any AI policy/rights agreement must be settled before submission.

**Proposed title:** A completed progress bar is not a completed file task

**Audience:** Designers and frontend engineers responsible for browser tools, forms and exports.

**Thesis:** A file task ends when the user has a valid, usable download. A successful encoder return, a green status and an animated progress bar are separate intermediate states. Product design needs an explicit output contract and a recovery path for each.

**Reader outcome:** A small checklist for designing truthful results and retry behavior, applicable to an image editor, PDF export or local archive tool. The argument stands without a product link.

**Proposed outline:**

1. **Define the result before drawing the progress bar.** Contrast an ordinary “smaller if possible” operation with a hard maximum-byte requirement. Explain why rounding should never determine the success state. Use exact bytes and an independently opened download as evidence.
2. **Keep settings close and the working view short.** Show why a bounded settings dialog, visible format and obvious primary action can reduce searching. Cover focus return, Escape, small screens and the distinction between a scrollable comparison image and an interactive control.
3. **Design failed attempts as retained work.** Preserve the source, explain which constraint failed, and distinguish a retryable interruption from a permanently invalid archive. Avoid a retry button that can never help.
4. **Verify the user's final step.** Compare the actual downloaded bytes, dimensions and file integrity with the chosen settings. Treat lab performance, accessibility checks and valid outputs as separate evidence.

**Evidence available:** Public Phase 2 acceptance records with real downloaded outputs, specific modal/focus corrections and honest limitations. Phase 3 target and touch results must be verified before being added. No visitor data, conversion statistics, physical-device coverage or invented customer story will be used.

**Commercial disclosure:** The proposed author would be associated with FileCompresser. Any reference would be disclosed and left to the editor; no link insertion or paid placement is requested. The owner must supply and approve the real author biography. This outline was prepared with AI assistance and must not be represented as independently human-authored text if the publication's policy disallows that.

**Next action:** After policy and author review, an authorized human may send this outline through the official submission route. Editor response, contract, article commission and publication remain unknown.
