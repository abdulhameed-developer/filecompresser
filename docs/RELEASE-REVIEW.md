# Local release review — 2026-11-04

## Local authority
Historical review of the Downloads baseline. Update 21 November 2026: the owner confirms filecompresser.com has been purchased. The prepared working copy uses static export and TinaCMS content; hosting, editor account activation and DNS are still pending. NEXT_PUBLIC_SITE_URL is a future deployment configuration; its default is localhost:3000, and indexing is disabled unless a non-local origin and NEXT_PUBLIC_ENABLE_INDEXING=true are both explicitly configured. No support mailbox is advertised as operational; the help page provides troubleshooting without inventing a contact channel.

## Development dependency advisory
The full npm audit reports 14 moderate entries propagated from minimatch GHSA-g3hv-75wg-m249. The advisory describes attacker-controlled glob patterns with optimizationLevel >= 2; file-processing inputs are not passed to the lint dependency graph. Lint configuration is trusted repository code. Do not lint untrusted checkout configuration or patterns without isolation. The reported patched version is minimatch 11.0.1, outside the compatibility ranges of the installed lint chain. No cross-major override or npm audit fix --force was applied. Production audit is separate and must remain zero. Recheck compatible upstream releases before public distribution.

Reference: https://github.com/advisories/GHSA-g3hv-75wg-m249

## Codec and WebAssembly licensing
@ffmpeg/ffmpeg and @ffmpeg/util declare MIT. The distributed @ffmpeg/core 0.12.10 package declares GPL-2.0-or-later. The MIT JavaScript wrapper does not change the core's license. The core is downloaded to users, so it must be treated as distributed software. Its upstream builds include third-party codecs; refer to the exact upstream source/build configuration, not only the wrapper license.

Before public distribution, assemble the corresponding source, build scripts, third-party notices and applicable license texts for the exact shipped core; provide the access/offer required by the applicable license. Verify codec patent obligations for intended jurisdictions separately. This review does not certify compliance, and a link to the latest upstream source alone does not establish exact binary/source correspondence. Do not remove working media tools to conceal this prerequisite.

Sources:
- https://github.com/ffmpegwasm/ffmpeg.wasm
- https://ffmpegwasm.netlify.app/docs/overview/
- Installed node_modules/@ffmpeg/core/package.json

The runtime inventory is in DEPENDENCY-LICENSES.md. Preserve upstream license files in any redistributed package. The current app uses system fonts and no longer requests Google Fonts.

## Verification limits
Automated keyboard and contrast checks are not assistive-technology certification. Synthetic media/PDF fixtures cannot prove arbitrary document or codec compatibility. Browser memory limits are device-specific; input caps are safeguards rather than guaranteed bounds on decoded memory. Digitally signed PDFs are refused to avoid silently invalidating signatures; encrypted PDFs remain unsupported.


## Editorial assets and publication settings
Five original generated illustrations are included as optimized responsive WebP with JPEG fallback/social variants. They are editorial metaphors, not output benchmarks. No competitor assets or stock photographs were copied. The exact prompt set is in the task handover outputs.

`docs/FFMPEG-PROVENANCE.json` records package tarball integrity and SHA-256 identities of the actual core JS/WASM. Reproduce it with `node scripts/codec-provenance.mjs`. It does not supply or certify matching corresponding source. No usable gitHead was supplied by the registry metadata for the installed core; exact source correspondence remains unresolved and must not be inferred from a current upstream checkout.

Intended future origin: https://filecompresser.com. Set it with NEXT_PUBLIC_SITE_URL only when preparing the approved release; NEXT_PUBLIC_ENABLE_INDEXING=true is a separate explicit switch. The owner confirms domain registration; no deployment has been performed in this session. Local review builds remain non-indexable without showing development-environment labels to visitors.
