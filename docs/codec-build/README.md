# Pinned codec source investigation

This directory contains a source-acquisition collector and a controlled rebuild probe. It is not a cleared website release. A dedicated read-only CI job may execute the probe on its own branch; no production deployment or repository-write token is needed.

## What is now resolved

`source-pins.json` records 23 actual GitHub commit IDs: the exact ffmpeg.wasm release recipe, its 16 codec/library repositories, the Emscripten runtime/compiler-source revision embedded in the installed binary, SDL2 and zimg's GoogleTest submodule. The 44 listed notice/license file blob IDs were read from those pinned source trees.

The fixed release Dockerfile and Makefile are available through the connected GitHub API. The two mutable recipe branches now resolve to x264 commit `33cac6b77d5b9259c552156013a817ab23119612` (2022) and LAME commit `2badea1974ae36cb8312afe99cff1e6b3b5decee` (2020). Both predate the January 2025 release. This strengthens the candidate source association but does not prove the historical npm binary came from those inputs.

The official release has no attached build-provenance/source-bundle asset. Its normal repository archive omits the external repositories pulled by the Dockerfile.

The embedded Emscripten revision's SDL2 recipe pins SDL **2.24.2** and an archive SHA-512. That port is easy to miss if only the FFmpeg Dockerfile's explicit libraries are collected. The manifest includes it. zimg's pinned GoogleTest gitlink is recorded separately; it is not claimed to be linked into the media core.

## Reviewable acquisition operation

The collector uses only Git and Node built-ins. It does not execute downloaded project code or build/install/publish anything.

```sh
node docs/codec-build/collect-sources.mjs --validate-only
node docs/codec-build/collect-sources.mjs /tmp/filecompresser-codec-sources
```

The output directory must not already exist. Each repository is fetched by its full commit ID. Unexpected submodules or mismatched notice blobs fail the operation. Source archives retain tracked files even when upstream export-ignore rules would omit them. Submodules are separate archives; their recorded paths must be reconstructed before building. The output `collection.json` records every acquired archive's size and SHA-256 and explicitly remains `built: false`, `published: false`, and `legalClearance: false`.

The collector manifest and JavaScript syntax were validated locally. Probe results must be taken from the actual CI run and its evidence, not inferred from these preparation checks. Actual acquisition requires working GitHub network access; the local shell still cannot resolve external hosts. The connected GitHub API has verified the commit/file pins, but does not download full binary source archives to this filesystem.

## Minimum controlled CI investigation

Use a dedicated manual, **read-only** job on a standard free GitHub-hosted Linux runner for the public repository. Do not pass provider/CMS secrets, enable repository-write permissions, push, deploy, or upload build artifacts in the first probe. Pin official workflow actions to reviewed commit IDs.

1. Check out the reviewed application commit and run the collector above in the runner's temporary directory. Retain its local archives and notice files throughout the investigation.
2. Pull `emscripten/emsdk:3.1.40`, resolve its actual repository digest and record it. Do not invent a digest or describe the mutable tag as pinned. Check the image's `emcc --version` against the embedded Emscripten revision in the manifest. Record Docker/BuildKit versions and the eventual build-tool package versions.
3. Reconstruct the ffmpeg.wasm build working tree from commit `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`. Verify its Dockerfile/Makefile/build-script blob IDs against the manifest before patching.
4. Make a retained, reviewable Dockerfile patch: replace the base-image reference with the resolved digest; replace every dependency ref with its full commit from the manifest; for zimg, whose recipe uses `git clone -b`, keep the known tag and verify the cloned HEAD and GoogleTest gitlink exactly before compilation, or use an explicit fetch/check-out by commit. Record any Dockerfile frontend digest if using an external frontend.
5. Preserve all original source files and all changes. For stronger isolation, populate Docker stages from the collected source rather than fetching sources during compilation. Ensure Emscripten's SDL2 port uses its pinned archive checksum and retain the matching source. Do not permit unrecorded source downloads.
6. Build the **single-thread production** core using the reviewed Makefile's equivalent inputs: `FFMPEG_ST=yes`, `EXTRA_CFLAGS=-O3 -msimd128`, and ESM output. The stock entry point is `make prd`; use the patched recipe rather than unmodified mutable refs. Avoid overcommitting runner memory; if build parallelism must be reduced, preserve that build-script patch too.
7. Compute SHA-256 of the ESM JS and WASM and compare with `FFMPEG-BINARY-EVIDENCE.json`. Record whether both match. A mismatch is an investigation result, not an automatic failure of the GPL source model, but it means the old npm binary has not been reproduced.
8. If matching: review the collected source/patches/notices as the candidate exact-source distribution. If different: either diagnose the mismatch or deliberately adopt the newly built known-source core, with updated provenance and full GIF/audio/video/cancellation/browser testing. Do not call a changed binary identical.
9. Separately resolve native-code security/backport review. Rebuilding FFmpeg 5.1.4 does not by itself apply subsequent security fixes.
10. Before any public binary release, review the complete source/notice/access arrangement and verify its durable download location. Publishing a source offer without possessing the source package is not an acceptable shortcut.

## Feasibility and remaining data

The technical source pins are now available; the main outstanding operation is acquisition plus a real controlled rebuild and comparison. The upstream build guide estimates about an hour depending on machine specifications. Reserve up to three hours for an initial standard-runner build plus further time for genuine browser/output QA; this is a planning allowance, not a measured duration. Use a standard runner on the public repository and verify account policy rather than selecting a paid larger runner.

Still needed: actual acquired archive hashes, toolchain image/frontend digest, build environment/logs, output hashes and comparison, complete notice/source package review, native security assessment, and a tested durable source-access arrangement. No legal-clearance flag should be changed merely because this plan or collector exists.

## Official references

- [Exact core release recipe](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/Dockerfile)
- [Exact production build entry point](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/Makefile)
- [Emscripten SDL2 source/checksum recipe](https://github.com/emscripten-core/emscripten/blob/5c27e79dd0a9c4e27ef2326841698cdd4f6b5784/tools/ports/sdl2.py)
- [Upstream build guidance](https://ffmpegwasm.netlify.app/docs/contribution/core/)
- [FFmpeg security fixes](https://ffmpeg.org/security.html)

## Executable rebuild probe

```sh
node docs/codec-build/rebuild-probe.mjs /tmp/filecompresser-codec-probe
```

Use a new directory. This requires Docker/Buildx, Git, Python 3.12 or newer (safe tar data filter) and Node 22. It acquires the pinned sources, checks all archive/notice identities, reconstructs source trees, resolves and records the three official container digests, checks the compiler revision and SDL2 port checksum, then creates a local-source Dockerfile and bounds make to two jobs. The original and controlled recipes plus changed scripts are retained. The SDK's normal build-package installation and the recorded checksum-protected SDL port acquisition require network access.

Only a successful complete build can produce the retained bundle. It contains the newly built ESM core together with all 23 acquired source archives, notices, original/controlled recipes, build inputs and environment evidence. The old installed npm binary is never copied. The complete bundle must fit 195 MiB, leaving space for diagnostics below the 200 MiB total artifact budget; otherwise the probe fails before any binary upload. Retention is one day. A hash match is reported as an identity result; legal clearance and website deployment remain false.

To reconstruct from a completed bundle, extract the `ffmpegwasm` source archive as the build context, extract each explicit codec/library archive under its `vendor/<name>/` directory, place the separate GoogleTest source at `vendor/zimg/test/extra/googletest`, replace the Dockerfile with `recipe/Dockerfile.controlled`, and replace each script included under `recipe/patched/build/`. Use the recorded platform, image digests, BuildKit configuration and build flags from `evidence/build-environment.json`; `recipe/rebuild-probe.mjs` records the exact Buildx command. All provided source archives and notice files must remain available together when retaining the new core. The scripts in `recipe/` include their manifest so that acquisition/build investigation can also be repeated in a new environment.

## Unlinked upstream fixtures

The manifest also records an intentionally excluded `ffmpeg.wasm/testdata` gitlink at `c81125391a0ada7599edc6bff2da51c1a3ed38d0`. Its pinned tree contains Arial.ttf and media fixtures without an accompanying license file. The controlled core Dockerfile neither reads nor copies that test-data directory, so it is not an input to this new core and is not redistributed. The collector still verifies that gitlink's exact identity; this is not a wildcard exception for unknown submodules. The Emscripten test-code submodules are separately pinned/acquired and their notice files retained.
