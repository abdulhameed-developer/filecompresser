# Production implementation plan — 21 November 2026

## Verified starting state

- Original Git history and the prepared copy start at a5a25be82dfe71b1f3cbe6327d3d20a68451e736. Downloads contains important subsequent local improvements; the prepared copy preserves those and the prior CMS/static-host changes.
- The remote GitHub repository is public and its browser history shows two commits. Current source recovery artifacts are retained; work continues on `work/filecompresser-production-20261121`.
- The public site source has13 canonical tools, a WAV alias and five articles. The prior static build and188 tests were verified; this larger change requires fresh validation.
- Initial Tina forms covered article blocks, homepage text and tool content, but the actual Tina packages/schema lock/admin build are absent. Package registry DNS fails with EAI_AGAIN in the execution environment.
- The first Hostinger inspection reported pending registration. A later inspection after owner action confirms filecompresser.com Active, expiring21November2027; see DNS-AND-EMAIL.md.
- Hostinger's Emails screen offers paid plans and shows no active mailbox. No purchase/trial was started. Cloudflare and TinaCloud sign-ins are now verified; the FileCompresser TinaCloud project has been created.
- The existing FFmpeg exact corresponding-source/notices prerequisite remains unresolved. Fresh registry security audit also cannot complete. See CODEC-DISTRIBUTION.md.

## Architecture and changes

Preserve browser processing and the static Cloudflare architecture. Keep GitHub as the source/content history, TinaCloud as editor authentication and Git authoring, and Cloudflare Pages as the static host. No paid hosting is required for this architecture within provider allowances. Keep canonical origins, indexing and verification in deployment configuration because ordinary CMS editors must not receive technical security controls.

Finish rich article fields, safe media and link/table blocks, reversible archival, managed informational pages, complete page-specific social metadata, homepage FAQs/headline/steps, related tool links and explicit URL redirects. Keep the tools above long-form content. Validate publication before export, maintain a last-good-deployment workflow and preserve existing content/visual layouts.

## Execution and release gates

1. Complete source integration and fresh tests/typecheck/lint/static export/route/media-integrity checks.
2. Install the pinned Tina tooling in a permitted build environment, generate and commit package lock/schema lock, and test the real local editor. Do not label the setup placeholder as an admin panel.
3. Once owner registration/authentication is complete, inventory DNS, establish a real sustainable mailbox if a free/included service is available, and verify send/receive plus authentication. Do not publish an untested contact address.
4. Resolve exact codec source/notices/security evidence before declaring public-release readiness.
5. Review source and secrets, push the completed integration branch, validate CI, connect authenticated Tina/Cloudflare, then verify the complete content-save-to-public-build chain and roles. Avoid merging an unverified partial project into production.
6. Verify domain/TLS/canonicals/redirects/search ownership and indexing only against the actual deployment. Do not fabricate rankings, scores or account outcomes.

User-only blockers are domain owner details/registration, provider sign-ins/agreements, credential entry and security-sensitive integration grants. Continue independent implementation while those are pending.
