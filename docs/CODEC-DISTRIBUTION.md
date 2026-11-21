# Codec distribution review — 21 November 2026

**Status: unresolved release prerequisite.** This review verifies the identity and embedded build information of the installed FFmpeg engine. It does not establish a complete corresponding-source distribution, certify legal compliance, or clear the project for public launch.

## Verified shipped-code evidence

| Item | Verified value |
| --- | --- |
| Single-thread core package | `@ffmpeg/core` 0.12.10 |
| Package-declared license | `GPL-2.0-or-later` |
| ESM JavaScript shim | 111,804 bytes; SHA-256 `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |
| WebAssembly binary | 32,232,419 bytes; SHA-256 `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |
| Embedded FFmpeg version | 5.1.4 |
| Embedded compiler | Emscripten 3.1.40, commit `5c27e79dd0a9c4e27ef2326841698cdd4f6b5784` |
| Embedded configuration | Includes `--enable-gpl`, libx264, libx265, libvpx, libmp3lame, libtheora, libvorbis, libopus, zlib, libwebp, FreeType, FriBidi, libass and zimg |

`FFMPEG-BINARY-EVIDENCE.json` records the complete configure string extracted directly from the installed binary. `FFMPEG-PROVENANCE.json` separately records the npm tarball integrity. These are identity evidence, not a source archive.

The installed core package contains `dist/` and `package.json`; it does not include a full license-text bundle, FFmpeg/external-library source, or complete build-source archive. The MIT declaration for the JavaScript wrapper does not replace the core's licensing. The [upstream FAQ](https://ffmpegwasm.netlify.app/docs/faq/) expressly distinguishes the wrapper from the FFmpeg/external-library core.

The static host build splits the original WASM into two files and reassembles its exact bytes. That changes delivery, not the code identity or the unresolved distribution prerequisite. Integrity checking is not a substitute for supplying source or notices.

## Upstream release association found

The official [v12.15 release](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15) labels the main package v12.15 and the core/core-mt packages v12.10. Its release commit is [71aa99d37c02a7b4c435275ca9ef50e612f6efa1](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1). This is a useful fixed candidate for provenance research.

Do not substitute the similarly named **v0.12.10** tag: the release history associates that older wrapper release with core **0.12.6**.

The currently published [main Dockerfile](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/Dockerfile) specifies FFmpeg n5.1.4 and Emscripten 3.1.40, but also references mutable branches such as x264 `4-cores` and LAME `master`. It is not evidence of the exact historical dependency snapshots used for this npm binary. Fixed-release Dockerfile/source retrieval was unavailable through the current fetch tools, and no original resolved dependency-commit manifest or reproducible byte match was obtained.

## What is still missing

- A complete source tree corresponding to the shipped core, including upstream modifications and all incorporated external libraries.
- The resolved source revision for each dependency used by the original build, rather than its present-day branch head.
- The complete build scripts/configuration and required notices/license texts for that exact distribution.
- A verified, durable source-download/access arrangement applicable to this release.
- Review of how the selected distribution arrangement applies to this application's shipped components. This document does not determine the legal scope of a combined work.

[FFmpeg's official legal page](https://ffmpeg.org/legal.html) distinguishes GPL-enabled builds from its LGPL baseline and emphasizes exact correspondence between source and distributed binaries. Its LGPL checklist should not be relabeled as a complete checklist for this GPL-enabled build.

## Concrete paths to resolve the prerequisite

**Preserve the current upstream binary:** obtain the upstream release's exact source/build/dependency archive and provenance from a verifiable source; record immutable revisions and archive hashes; compare embedded configuration and available build evidence to the recorded binary; collect the applicable notices and license texts; publish and test the selected source-access arrangement. The npm tarball alone is not that archive.

**Produce an independently traceable build:** acquire all source into a controlled build workspace; pin source revisions and the toolchain/container digest; retain the complete source, patches, build scripts, configuration and license texts; build a compatible core and record output hashes; replace the shipped binary with that known-source build; rerun genuine GIF/audio/video encoding tests, cancellation and browser compatibility checks; publish and verify the matching source package. A newly built core does not need to be falsely claimed identical to the existing npm binary.

A successful ordinary Next.js build, a link to upstream `main`, an untested written-offer paragraph, or disabling the working tools does not resolve the identified evidence gap. No offer to provide source has been created here because the complete source package is not yet available.

## Dependency security audit status

A fresh `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=8000` was attempted. The registry advisory endpoint failed with **EAI_AGAIN**. It returned no current advisory results, so neither a clean production audit nor an up-to-date vulnerability count is established.

The native codec code also needs its own review: npm audit does not fully audit C/C++ libraries embedded inside a WASM package. The [official FFmpeg security page](https://ffmpeg.org/security.html) lists later 5.1-line security fixes in 5.1.5, 5.1.6 and 5.1.7; the installed binary reports 5.1.4. No matching-source/backport manifest or exploitability test was available, so this review does not claim those fixes are present or that any particular issue is exploitable through this app. Assess the actual enabled decoders/filters and relevant fixes when resolving the pinned build; do not treat the browser sandbox as proof the engine is current.

The earlier minimatch advisory/count in `RELEASE-REVIEW.md` is historical. Re-run both production and full-development audits when registry access works, retain the JSON results, assess reachable affected behavior, update compatible dependencies and lockfiles together, and rerun relevant checks. Do not interpret an unavailable audit as zero vulnerabilities.

## Evidence references

- [Official package source/metadata](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/packages/core/package.json)
- [Official wrapper/core license distinction](https://ffmpegwasm.netlify.app/docs/faq/)
- [Official core build instructions](https://ffmpegwasm.netlify.app/docs/contribution/core/)
- [Official core0.12.10 release association](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15)
- [Official source recipe, current main](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/Dockerfile)
- [FFmpeg license and distribution guidance](https://ffmpeg.org/legal.html)
- [FFmpeg upstream security fixes by release](https://ffmpeg.org/security.html)
- Local installed package metadata, exact binary bytes and the evidence JSON files in this directory.
