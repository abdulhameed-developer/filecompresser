# Codec source and distribution review — 21 November 2026

**Controlled build and paired public source release completed.** A new source-paired minimal engine was compiled successfully in [run 44891737690](https://github.com/abdulhameed-developer/filecompresser/actions/runs/44891737690) at workflow commit `8834c97516c24b930c9d5d1c7cba8141661612b1`. Actual browser acceptance, the unauthenticated application-CI download check, site-visible aggregate notices and website deployment remain separate prerequisites. This review does not certify legal compliance or every native dependency's security.

## Actual new build

| Item | Verified result |
| --- | --- |
| FFmpeg source | Maintained 5.1 snapshot `5.1.10+19.b5d146d17cb4`; full commit `b5d146d17cb45f3b00796dcf984897f1a0459945` |
| External libraries | Official current stable x264 `b35605ace3ddf7c1a5d67a2eb553f034aef41d55`, LAME 4.0 and zlib 1.4 |
| Runtime profile | Single-thread ESM, GPL enabled; native FFmpeg decoders/filters retained; device/SDL/network disabled |
| New ESM JavaScript | 86,526 bytes; SHA-256 `cea5a18a8ef99258fa2299b8feb57ca641c0222e88de077fd0562b4eeef7bfed` |
| New WebAssembly | 20,752,732 bytes; SHA-256 `584febef0d37a76379d5c2c53539250e78c250e2c5f2710493301ea55198d5ab` |
| Complete source-plus-core bundle | 63,253,833 bytes; SHA-256 `6d3326d6e2456fdf7973ac7ab1d83620a41a99acc5b65b316d139ffbfc148818` |
| Outer package | USTAR+gzip; complete gunzipped tar 81,541,120 bytes; 92 files/directories; no outer links |

`codec-build/REBUILD-RESULT.json` records actual run/artifact metadata and checked output fields. `source-pins.json` exactly matches the compiled input-manifest SHA-256 `e25ff55c61088a636a5703a40eb3ea6a222cf2b5957477df0a75129f75809d75`.

The engine uses external x264/LAME/current zlib for the application's H.264/AAC MP4, MP3, PCM WAV and native GIF tools. Unneeded external x265, libvpx, Ogg/Theora/Vorbis/Opus libraries, WebP, fonts/subtitles and zimg are not compiled or linked. Accepted input decoders remain native FFmpeg components. This dependency reduction does not by itself establish working format/browser behavior; the exposed Ogg/Opus, MOV/MP4, GIF/audio/video and cancellation flows require real acceptance tests.

## Verified source/runtime controls

The source collector verified exact Git revisions, notice-file blobs, source archive hashes and declared submodules. Official VideoLAN `git ls-remote` established x264's actual stable head. Its first stale-mirror candidate failed before compilation; the corrected current official pin passed. No original four-core fork patch is needed with x264 threading disabled.

The original official LAME 4.0 release archive was acquired as 1,496,810 bytes and matched published SHA-256 `3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb`. Its new original COPYING/LICENSE files, encoder-flush guard and decoder-disable option were checked. Optional mpg123 decoding is disabled; FFmpeg supplies native input decoding. zlib 1.4 uses its reviewed static-only CMake settings. The linker map verifies the exact three installed static archives; their checksums are retained.

The SDK's Emscripten runtime tree and prebuilt system-library cache were replaced with the acquired pinned source and a fresh cache. The actual Clang resource include tree is retained; its SIMD header matched the pinned LLVM source. The official SDK mapping and Chromium release DEPS passed exact identity/revision checks. Source, original notices, original/controlled Dockerfiles, all patched build scripts, SDK/frontend/BuildKit digests, actual build-package inventory, actual compiled FFmpeg configuration/version headers and linker map accompany the new core.

The package retains the selected LLVM header/preferred-definition/emitter source rather than claiming to contain a complete LLVM compiler rebuild. APT build-tool versions are inventoried, but Ubuntu package repositories are not snapshotted; future bit-identical rebuilds across package updates are not promised. The provided source package and recorded controlled recipe permit reconstruction independently of a mutable future x264 branch head.

## Public source/access evidence

The one-day Actions artifact is `codec-source-and-new-core-44891737690` (artifact 14703065764), ZIP 63,314,725 bytes, SHA-256 `81f16165029b0b274c74533602878947d35a177bce669d0a518d688e6a625cec`, expiring 22 November 2026 at 10:06:19 UTC. It includes the complete paired tar and JSON diagnostics. Existing codec diagnostics plus this artifact remain well below the checked cumulative 200 MiB budget. Nothing was deleted or deployed by the probe.

The [paired source release](https://github.com/abdulhameed-developer/filecompresser/releases/tag/codec-2026-11-21.1) was published at 2026-11-21 10:34:57 UTC as release 453612581, draft=false/prerelease=true. Its tag points exactly to codec workflow commit `8834c97516c24b930c9d5d1c7cba8141661612b1`. All three uploaded assets are in uploaded state; their server-reported digests and sizes match independently reviewed local bytes. The complete [source/notice/recipe/core package](https://github.com/abdulhameed-developer/filecompresser/releases/download/codec-2026-11-21.1/codec-source-and-new-core.tar.gz) is asset 775216647, with the 63,253,833-byte size and 6d3326... SHA-256 recorded above. The release also includes release-evidence.json and SHA256SUMS. GitHub autogenerated tag source archives alone are not the full corresponding-source package. No temporary writer workflow was activated; publication used the actual release UI.

The application CI must still fetch that public URL without credentials and verify the pinned whole-package/core bytes, then pass real browser acceptance. The site must expose original notices and this matching source URL. The musl libc original COPYRIGHT text is already preserved in the paired Emscripten source archive; the site aggregate should also reproduce that referenced runtime attribution. No paired archive rebuild/mutation is needed. No original npm binary is included in this package, and publication of this component prerelease is not website deployment or a browser-QA claim.

## Security evidence and limits

The [official download page](https://ffmpeg.org/download.html#release_5.1) identifies 5.1.10 as the latest published stable 5.1 release at this review. The selected fixed maintained-branch snapshot adds 19 post-tag fixes, including bounds/buffer and MOV/H.264 correctness changes, without a major-version migration. `ffmpeg-security-ancestry.json` records all 22 checked fix commits for distinct CVEs listed after 5.1.4 in official 5.1.5–5.1.7 sections, plus the verified transitive relation from the 5.1.10 tag to the selected snapshot.

The targeted native review motivated the retained-library updates and removal of unneeded affected external code. It does not establish app exploitability of each upstream finding or a clean result for every possible native issue. The source snapshot is fixed for this build; no claim is made that every newer development/major-branch fix has been backported. Production/development npm advisory evidence is maintained by the application's release review and CI; npm advisory scans do not fully cover C/C++ code compiled inside a WASM package.

## Historical original npm identity

`FFMPEG-BINARY-EVIDENCE.json` records the old installed `@ffmpeg/core` 0.12.10 engine: FFmpeg 5.1.4, Emscripten 3.1.40, original JS 111,804 bytes/SHA-256 `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3`, original WASM 32,232,419 bytes/SHA-256 `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`. Both new outputs intentionally differ. Original npm binary source correspondence was not falsely asserted or used as the new release target.

The fixed ffmpeg.wasm v12.15 recipe at `71aa99d37c02a7b4c435275ca9ef50e612f6efa1` associates wrapper 0.12.15 with core 0.12.10. Its root MIT license, Git blob `3032c67441859d69c3b02d150c5abdfbdef2a919`, copyright 2019 Jerome Wu, also covers the version-matched util 0.12.2/types 0.12.4 source. Those JavaScript package notices are distinct from the GPL-enabled native core notices. The similarly named older v0.12.10 wrapper release belongs to core 0.12.6.

## Primary references

- [Fixed original recipe](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/Dockerfile)
- [Selected maintained 5.1 snapshot](https://github.com/FFmpeg/FFmpeg/commit/b5d146d17cb45f3b00796dcf984897f1a0459945)
- [Exact post-tag comparison](https://github.com/FFmpeg/FFmpeg/compare/19feb712f5c1821d8a3fa1ad63c5bd2e3b9672eb...b5d146d17cb45f3b00796dcf984897f1a0459945)
- [FFmpeg security fixes](https://ffmpeg.org/security.html)
- [Official LAME source](https://lame.sourceforge.io/download.php)
- [Official LAME archive/checksum](https://sourceforge.net/projects/lame/files/lame/4.0/lame-4.0.tar.gz/download)
- [Official zlib 1.4 release](https://github.com/madler/zlib/releases/tag/v1.4)
- [Wrapper MIT text at the exact release](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/LICENSE)
- [FFmpeg distribution guidance](https://ffmpeg.org/legal.html)
