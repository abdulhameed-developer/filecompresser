# Controlled headless codec build

This directory prepares and executes a new known-source media core. It does not deploy the website, certify legal compliance, or claim every native dependency is clear of vulnerabilities. The old npm core is diagnostic input only and is never packaged.

## Selected functionality and source

The candidate uses maintained FFmpeg 5.1 snapshot `5.1.10+19.b5d146d17cb4` (`b5d146d17cb45f3b00796dcf984897f1a0459945`) with its native decoders and filters, plus external x264, current LAME and current zlib. The application outputs H.264/AAC MP4, MP3, PCM WAV and native GIF using scale/fps/palette filters. Native FFmpeg decoders continue to handle accepted input formats; Ogg/Opus, MOV/MP4 and other actual input/output behavior must pass browser acceptance tests before adoption.

Unneeded external x265, libvpx, Ogg/Theora/Vorbis/Opus libraries, WebP, font/subtitle libraries and zimg are not compiled or linked. Device, SDL and network support are disabled. This changes the engine's internal dependency profile; it does not remove exposed website tools or claim unsupported WebM UI routing.

`source-pins.json` is authoritative for exact Git commits, original-recipe aliases, whole-archive checksums, notice paths and submodules. LAME's official full release archive is authenticated by its published SHA-256; no Git commit is invented for that SVN-based release. Its original archive bytes and actual notice files are retained. Source archives from Git retain tracked files despite export-ignore rules. Unexpected or mismatched gitlinks fail acquisition.

## Acquisition and build

```sh
node docs/codec-build/collect-sources.mjs --validate-only
node docs/codec-build/collect-sources.mjs /tmp/filecompresser-codec-sources
node docs/codec-build/rebuild-probe.mjs /tmp/filecompresser-codec-probe
```

Each output directory must be new. Acquisition needs Node, Git, Python 3.12 or newer and network access to the recorded official sources. It only collects and safely inspects source data. The build probe additionally needs Docker/Buildx. It checks source/notice identities before executing upstream build code, reconstructs the selected sources, resolves the actual SDK/frontend/BuildKit image digests and records them, then compiles a single-thread ESM core with `FFMPEG_ST=yes` and `EXTRA_CFLAGS=-O3 -msimd128`. Bare make parallelism is limited to two jobs and BuildKit to two concurrent stages.

The fixed original recipe is ffmpeg.wasm commit `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`. The controlled Dockerfile keeps only SDK, x264, LAME, zlib and FFmpeg stages, disables avdevice/SDL/network and links the exact three installed static archives by full path. zlib 1.4 uses its reviewed static-only CMake options. LAME's optional mpg123 decoder is disabled because FFmpeg handles input decoding; its reviewed encoder flush guard must be present. The final linker map and static archive checksums are retained.

## Runtime and toolchain source evidence

The SDK's original Emscripten tree and prebuilt system-library cache are removed. The acquired exact Emscripten revision replaces that tree and a fresh `EM_CACHE` is used. Only SDK Node compiler tools are preserved; their package versions and sorted content hash are recorded. These are compiler tools, not claimed as linked application runtime.

The actual SDK Clang resource include tree is exported and hashed. Its `wasm_simd128.h` must match the pinned LLVM source byte-for-byte. Selected LLVM header sources, preferred generated-header definitions and emitter code plus exact license texts accompany the actual headers. This subset is not claimed to rebuild the complete LLVM compiler. The fixed official SDK mapping and Chromium release DEPS must pass their recorded Git blob identities and revision mapping checks.

The image digests and resulting build-package versions are recorded. Ubuntu APT repositories are not snapshotted, so future rebuilds may obtain different native build-tool packages. Identical output across future package updates is not promised.

## Security review boundaries

`ffmpeg-security-ancestry.json` records official compare results showing all 22 distinct CVEs listed after 5.1.4 in the official 5.1.5–5.1.7 security sections have their checked fixes in base 5.1.10 ancestry, with a verified transitive 19-commit ancestry relation to the selected immutable maintained-branch snapshot. Its hash is verified before building. The official download page identifies 5.1.10 as the latest published stable 5.1 release at this review; the selected snapshot also includes 19 subsequent maintained 5.1-branch fixes. This is not a promise that every newer major/development-branch fix is backported. The snapshot is fixed for this build; no branch ref is fetched as mutable build input.

`native-dependency-review.json` records retained-library source review and the removed dependency boundary. Actual native decoder/filter availability, encoding behavior, cancellation and browser compatibility require runtime QA. Source ancestry, configuration and a valid WASM module do not replace it. No app exploitability, clean-all-native or legal-certification claim is made.

## Paired output contract

A successful probe can retain exactly one `codec-source-and-new-core.tar.gz` plus small JSON diagnostics for one day. The tar uses USTAR with ordinary files/directories only, at most 512 outer members, at most 195 MiB compressed and at most 256 MiB for the complete gunzipped tar including end padding. Failed probes retain no core and only bounded JSON diagnostics.

Relevant members:

- `newly-built-core/esm/ffmpeg-core.js` and `ffmpeg-core.wasm`
- `source-archives/`: original acquired Git/official source archives
- `notices/`: actual notice/license file bytes
- `source-pins.json` and `collection.json`: source identities, archive sizes/hashes and submodule paths
- `recipe/`: this collector/probe, storage gate, reviews, original/controlled Dockerfiles, exact patched build scripts and BuildKit configuration
- `sdk-clang-resource-headers.tar.gz`, `official-toolchain-release-DEPS`, `official-sdk-release-mapping.json`
- `evidence/`: source/runtime/compiler/build evidence
- `build-metadata/`: actual package inventory, static archive checksums, final linker map, compiled FFmpeg configuration/version headers and `codec-build.json`

The external `diagnostics/probe-status.json` records new JS/WASM hashes and sizes, intentional old-npm difference, complete bundle SHA-256, compressed size, complete expanded tar size and member count. The embedded status predates the final bundle hash to avoid circular self-hashing. No original npm binary is copied. The expected patched FFmpeg version must be present in the new WASM and compiled headers.

`artifact-budget.mjs` totals all unexpired codec-probe artifacts across repository runs before any upload, using an ephemeral Actions metadata read token only in that separate step. Existing bytes plus new inputs must fit the reserved cumulative 200 MiB cap. It never deletes old artifacts. No provider/CMS secrets reach compilation, and no job has repository-write permissions.

## Reconstructing and consuming the bundle

For source reconstruction, extract the ffmpegwasm archive as the build context; extract the four explicit build-library archives under `vendor/<name>/`; normalize a release archive's recorded `archiveRoot` to its source name. Extract Emscripten and the selected LLVM archive under `vendor-toolchain/<name>/`. Separate source submodules are available at their recorded paths. Replace the Dockerfile and scripts with `recipe/Dockerfile.controlled`, `.dockerignore` and `recipe/patched/build/*`. Use the recorded platform, image digests, BuildKit configuration and build flags. The probe records the exact Buildx command.

QA CI may download the named one-day Actions artifact, verify the complete bundle SHA-256, safely inspect/extract the whole paired bundle and explicitly pass the ESM directory to asset preparation. Production must obtain the exact matching complete source bundle at a durable verified project release URL, retain accessible original notices and publish the correct source link and hashes. An expiring Actions artifact is not a durable public source arrangement. No public release or website deployment is performed by this probe.

The original ffmpeg.wasm testdata gitlink is explicitly excluded as unlinked wrapper fixtures, not compiled input: its exact identity is checked, and unlicensed font/media fixtures are not redistributed. This is not a wildcard exception for unknown submodules.

## Primary references

- [Fixed original build recipe](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/Dockerfile)
- [FFmpeg current branch releases](https://ffmpeg.org/download.html#release_5.1)
- [FFmpeg published security fixes](https://ffmpeg.org/security.html)
- [Official LAME release source](https://lame.sourceforge.io/download.php)
- [Official LAME archive checksum](https://sourceforge.net/projects/lame/files/lame/4.0/lame-4.0.tar.gz/download)
- [Official zlib release](https://github.com/madler/zlib/releases/tag/v1.4)
