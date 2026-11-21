/* eslint no-console: "off" */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const recipeDirectory = path.dirname(fileURLToPath(import.meta.url))
const manifestBytes = readFileSync(path.join(recipeDirectory, 'source-pins.json'))
const manifest = JSON.parse(manifestBytes)
const expected = {
  js: '67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3',
  wasm: '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7',
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const command = (binary, args, options = {}) => execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, ...options })
if (!process.argv[2] || process.argv.length !== 3) throw Error('Provide one new temporary output directory.')
const output = path.resolve(process.argv[2])
if (existsSync(output)) throw Error('Refusing to overwrite an existing probe directory.')
mkdirSync(output, { recursive: true, mode: 0o700 })
const diagnostics = path.join(output, 'diagnostics')
mkdirSync(diagnostics)
const writeJson = (name, value) => writeFileSync(path.join(diagnostics, name), JSON.stringify(value, null, 2) + '\n')
if (manifest.patchedFfmpeg?.version !== '5.1.10' || manifest.patchedFfmpeg.commit !== 'b5d146d17cb45f3b00796dcf984897f1a0459945' || manifest.patchedFfmpeg.sourceLabel !== '5.1.10+19.b5d146d17cb4' || manifest.patchedFfmpeg.intentionalDifferenceFromOriginalNpmCore !== true) throw Error('The patched known-source FFmpeg prerequisite is absent.')
const status = { status: 'started', sourcePinsSha256: sha256(manifestBytes), ffmpegVersion: manifest.patchedFfmpeg.version, ffmpegSourceLabel: manifest.patchedFfmpeg.sourceLabel, ffmpegSourceCommit: manifest.patchedFfmpeg.commit, intentionalDifferenceFromOriginalNpmCore: true, sourceCollected: false, runtimeSourcePinsVerified: false, minimalHeadlessProfileVerified: false, built: false, originalNpmBinaryCorrespondenceVerified: false, allNativeDependenciesCleared: false, legalClearance: false, deployed: false }
writeJson('probe-status.json', status)
let builder
try {
  const ancestryBytes = readFileSync(path.join(recipeDirectory, 'ffmpeg-security-ancestry.json'))
  if (sha256(ancestryBytes) !== manifest.patchedFfmpeg.securityAncestryEvidence.sha256) throw Error('Patched-source security ancestry evidence changed.')
  const ancestry = JSON.parse(ancestryBytes)
  if (ancestry.selectedCommit !== manifest.patchedFfmpeg.baseTagCommit || ancestry.selectedSnapshotCommit !== manifest.patchedFfmpeg.commit || ancestry.baseTagAncestorOfSnapshot?.headCommit !== manifest.patchedFfmpeg.commit || ancestry.baseTagAncestorOfSnapshot?.mergeBase !== manifest.patchedFfmpeg.baseTagCommit || ancestry.baseTagAncestorOfSnapshot?.aheadBy !== 19 || ancestry.baseTagAncestorOfSnapshot?.behindBy !== 0 || ancestry.checks.length !== 22 || new Set(ancestry.checks.flatMap(item => item.cves)).size !== 22 || ancestry.checks.some(item => item.status !== 'ahead' || item.behindBy !== 0 || item.mergeBase !== item.fixCommit || item.ancestorConfirmed !== true)) throw Error('The selected FFmpeg source ancestry evidence is incomplete.')
  writeJson('ffmpeg-security-ancestry.json', ancestry)
  const nativeReviewBytes = readFileSync(path.join(recipeDirectory, 'native-dependency-review.json'))
  if (sha256(nativeReviewBytes) !== manifest.headlessProfile.securityReviewSha256) throw Error('Reviewed minimal native dependency evidence changed.')
  writeJson('native-dependency-review.json', JSON.parse(nativeReviewBytes))
  const sources = path.join(output, 'sources')
  command(process.execPath, [path.join(recipeDirectory, 'collect-sources.mjs'), sources], { stdio: 'inherit', timeout: 35 * 60 * 1000 })
  const collection = JSON.parse(readFileSync(path.join(sources, 'collection.json'), 'utf8'))
  if (collection.sourcePinsSha256 !== sha256(manifestBytes) || collection.sourceArchives.length !== manifest.sources.length) throw Error('Source collection does not match this reviewed manifest.')
  for (const archive of collection.sourceArchives) {
    const bytes = readFileSync(path.join(sources, 'archives', archive.archive))
    if (bytes.length !== archive.bytes || sha256(bytes) !== archive.sha256) throw Error(`Source archive identity changed: ${archive.name}`)
  }
  status.sourceCollected = true
  if (collection.officialSourceRefs?.find(item => item.name === 'x264')?.matchesSelected !== true) throw Error('The official x264 source-ref prerequisite did not pass.')
  writeJson('source-collection.json', collection)

  // Python's data filter refuses archive traversal and unsafe outside links.
  const extract = (name, destination) => {
    const archive = collection.sourceArchives.find(item => item.name === name)
    if (!archive) throw Error(`Missing source archive: ${name}`)
    mkdirSync(destination, { recursive: true })
    command('python3', ['-c', 'import sys,tarfile\nwith tarfile.open(sys.argv[1],"r:gz") as archive:\n archive.extractall(sys.argv[2],filter="data")', path.join(sources, 'archives', archive.archive), destination])
    if (archive.archiveRoot && archive.archiveRoot !== name) {
      if (existsSync(path.join(destination, name))) throw Error('Archive normalization would overwrite a source directory.')
      renameSync(path.join(destination, archive.archiveRoot), path.join(destination, name))
    }
  }
  const work = path.join(output, 'work')
  extract('ffmpegwasm', work)
  const context = path.join(work, 'ffmpegwasm')
  for (const file of manifest.upstreamRecipe.files) {
    if (gitBlob(readFileSync(path.join(context, file.path))) !== file.gitBlob) throw Error(`Upstream recipe changed: ${file.path}`)
  }
  const libraries = manifest.buildLibrarySources.map(name => manifest.sources.find(item => item.name === name))
  if (JSON.stringify(manifest.buildLibrarySources) !== JSON.stringify(['ffmpeg', 'x264', 'lame', 'zlib']) || libraries.some(item => !item)) throw Error('The reviewed minimal build-library source set is incomplete.')
  const vendor = path.join(context, 'vendor')
  for (const source of libraries) extract(source.name, vendor)
  const toolchainSources = path.join(context, 'vendor-toolchain')
  extract('emscripten', toolchainSources)
  extract('llvm-resource-headers', toolchainSources)
  const lameSource = readFileSync(path.join(vendor, 'lame/libmp3lame/lame.c'), 'utf8')
  const lameConfigure = readFileSync(path.join(vendor, 'lame/configure'), 'utf8')
  const lameChecks = { originalArchiveSha256: manifest.sources.find(item => item.name === 'lame').sha256, encoderSourceSha256: sha256(Buffer.from(lameSource)), flushBufferGuardPresent: lameSource.includes('calc_mp3buffer_size_remaining'), decoderDisableOptionPresent: lameConfigure.includes('--disable-decoder') }
  writeJson('lame-source-checks.json', lameChecks)
  if (!lameChecks.flushBufferGuardPresent || !lameChecks.decoderDisableOptionPresent) throw Error('The official current LAME source lacks the reviewed encoder-buffer or decoder-disable prerequisite.')

  const resolveImage = tag => {
    command('docker', ['pull', '--platform', 'linux/amd64', tag], { stdio: 'inherit' })
    const digests = JSON.parse(command('docker', ['image', 'inspect', tag, '--format', '{{json .RepoDigests}}']))
    const repository = tag.slice(0, tag.lastIndexOf(':'))
    const digest = digests.find(value => value.startsWith(`${repository}@sha256:`))
    if (!digest || !/^[a-z0-9/_.-]+@sha256:[a-f0-9]{64}$/.test(digest)) throw Error(`No immutable image digest for ${tag}`)
    return digest
  }
  const images = {
    emsdk: resolveImage('emscripten/emsdk:3.1.40'),
    frontend: resolveImage('docker/dockerfile:1'),
    buildkit: resolveImage('moby/buildkit:buildx-stable-1'),
  }
  const compiler = command('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', images.emsdk, 'emcc', '--version'])
  if (!compiler.includes('3.1.40') || !compiler.includes(manifest.toolchain.compilerSourceCommit)) throw Error('Compiler version/revision differs from the reviewed source manifest.')
  const sdkNodeTools = JSON.parse(command('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', images.emsdk, 'python3', '-c', 'import hashlib,json,pathlib\nroot=pathlib.Path("/emsdk/upstream/emscripten/node_modules")\nassert root.is_dir()\ndigest=hashlib.sha256(); count=0; size=0; packages=[]\nfor p in sorted(root.rglob("*")):\n if p.is_symlink():\n  digest.update(str(p.relative_to(root)).encode()+b"\\0link\\0"+str(p.readlink()).encode()+b"\\0")\n elif p.is_file():\n  b=p.read_bytes(); count+=1; size+=len(b); digest.update(str(p.relative_to(root)).encode()+b"\\0"+hashlib.sha256(b).digest())\n  if p.name=="package.json":\n   try:\n    j=json.loads(b); packages.append({"path":str(p.relative_to(root)),"name":j.get("name"),"version":j.get("version"),"license":j.get("license")})\n   except Exception: pass\nprint(json.dumps({"files":count,"bytes":size,"treeSha256":digest.hexdigest(),"packages":packages}))']))
  writeJson('sdk-node-tooling.json', sdkNodeTools)
  const clang = command('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', images.emsdk, 'clang', '--version'])
  if (!clang.includes(manifest.toolchain.llvmSourceCommit)) throw Error('SDK Clang revision differs from the recorded LLVM source.')
  const resourceDirectory = command('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', images.emsdk, 'clang', '-print-resource-dir']).trim()
  if (!/^\/emsdk\/upstream\/lib\/clang\/[0-9.]+$/.test(resourceDirectory)) throw Error('Unexpected SDK Clang resource directory.')
  const headerArchive = command('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', images.emsdk, 'python3', '-c', 'import sys,tarfile\nwith tarfile.open(fileobj=sys.stdout.buffer,mode="w|gz") as archive:\n archive.add(sys.argv[1]+"/include",arcname="include")', resourceDirectory], { encoding: null, maxBuffer: 64 * 1024 * 1024 })
  if (!headerArchive.length || headerArchive.length > 32 * 1024 * 1024) throw Error('Unexpected SDK resource-header archive size.')
  const headerArchivePath = path.join(sources, 'sdk-clang-resource-headers.tar.gz')
  writeFileSync(headerArchivePath, headerArchive)
  const actualHeaders = path.join(output, 'sdk-clang-resource-headers')
  command('python3', ['-c', 'import sys,tarfile\nwith tarfile.open(sys.argv[1],"r:gz") as archive:\n archive.extractall(sys.argv[2],filter="data")', headerArchivePath, actualHeaders])
  const simdHeader = readFileSync(path.join(actualHeaders, 'include/wasm_simd128.h'))
  const llvmSimdHeader = readFileSync(path.join(toolchainSources, 'llvm-resource-headers/clang/lib/Headers/wasm_simd128.h'))
  if (!simdHeader.equals(llvmSimdHeader) || gitBlob(simdHeader) !== manifest.toolchain.simdHeaderGitBlob) throw Error('Actual SDK SIMD inline source does not match the pinned LLVM source.')
  const mappingResponse = await fetch(manifest.toolchain.sdkMappingURL, { signal: AbortSignal.timeout(120000) })
  if (!mappingResponse.ok) throw Error('The official SDK release mapping could not be acquired.')
  const mappingBytes = Buffer.from(await mappingResponse.arrayBuffer())
  if (gitBlob(mappingBytes) !== manifest.toolchain.sdkMappingGitBlob || JSON.parse(mappingBytes).releases['3.1.40'] !== manifest.toolchain.releaseCommit) throw Error('Official SDK release mapping failed its exact provenance check.')
  writeFileSync(path.join(sources, 'official-sdk-release-mapping.json'), mappingBytes)
  const releaseResponse = await fetch(manifest.toolchain.releaseDepsURL, { signal: AbortSignal.timeout(120000) })
  if (!releaseResponse.ok) throw Error('The official toolchain release DEPS could not be acquired.')
  const releaseDeps = Buffer.from((await releaseResponse.text()).trim(), 'base64')
  if (gitBlob(releaseDeps) !== manifest.toolchain.releaseDepsGitBlob || !releaseDeps.includes(Buffer.from(manifest.toolchain.llvmSourceCommit)) || !releaseDeps.includes(Buffer.from(manifest.toolchain.compilerSourceCommit))) throw Error('Official toolchain release DEPS failed its exact LLVM/Emscripten provenance check.')
  writeFileSync(path.join(sources, 'official-toolchain-release-DEPS'), releaseDeps)
  writeJson('runtime-source-inputs.json', { emscripten: { sourceCommit: manifest.toolchain.compilerSourceCommit, imageRuntimeReplaced: true, prebuiltCacheReused: false, cachePath: '/emsdk/filecompresser-source-cache' }, clang, resourceDirectory, sdkResourceHeaderArchive: { bytes: headerArchive.length, sha256: sha256(headerArchive) }, wasmSimdHeaderGitBlob: gitBlob(simdHeader), llvmSourceCommit: manifest.toolchain.llvmSourceCommit, officialReleaseDepsGitBlob: gitBlob(releaseDeps) })
  const environment = {
    images, compiler, clang, docker: command('docker', ['version']), buildx: command('docker', ['buildx', 'version']),
    platform: 'linux/amd64', flags: { FFMPEG_ST: 'yes', EXTRA_CFLAGS: '-O3 -msimd128' },
    workerParallelism: 2, makeJobs: 2, run: process.env.GITHUB_RUN_ID || null, sourceCommit: process.env.GITHUB_SHA || null,
  }
  writeJson('build-environment.json', environment)

  const originalDockerfile = readFileSync(path.join(context, 'Dockerfile'), 'utf8')
  const keepStages = new Set(['emsdk-base', 'x264-builder', 'lame-builder', 'zlib-builder', 'ffmpeg-base', 'ffmpeg-builder', 'ffmpeg-wasm-builder', 'exportor'])
  const parts = originalDockerfile.split(/(?=^FROM )/m)
  const selectedStages = parts.slice(1).filter(part => keepStages.has(part.match(/^FROM \S+ AS (\S+)/m)?.[1]))
  if (selectedStages.length !== keepStages.size) throw Error('The reviewed headless Docker stage set changed.')
  let dockerfile = (parts[0] + selectedStages.join('')).replace(/^# (?:Build|Base ffmpeg|Export ffmpeg-core).*$/gm, '').replace(/^# syntax=.*$/m, `# syntax=${images.frontend}`)
  if (!/^ENV FFMPEG_VERSION=n5\.1\.4$/m.test(dockerfile)) throw Error('The original FFmpeg version environment value changed.')
  dockerfile = dockerfile.replace(/^ENV FFMPEG_VERSION=n5\.1\.4$/m, `ENV FFMPEG_VERSION=${manifest.patchedFfmpeg.commit}`)
  dockerfile = dockerfile.replace(/^ENV ZLIB_BRANCH=v1\.2\.11$/m, 'ENV ZLIB_BRANCH=v1.4').replace(/^ENV LAME_BRANCH=master$/m, 'ENV LAME_BRANCH=4.0')
  dockerfile = dockerfile.replace(/^ENV X264_BRANCH=4-cores$/m, `ENV X264_BRANCH=${manifest.sources.find(item => item.name === 'x264').commit}`)
  const sdkBase = 'FROM emscripten/emsdk:3.1.40 AS emsdk-base'
  if (!dockerfile.includes(sdkBase)) throw Error('The reviewed SDK base stage changed.')
  dockerfile = dockerfile.replace(sdkBase, `FROM ${images.emsdk} AS emsdk-base\nRUN test ! -e /emsdk/filecompresser-source-cache && test -d /emsdk/upstream/emscripten/node_modules && mv /emsdk/upstream/emscripten/node_modules /emsdk/filecompresser-sdk-node-modules && rm -rf /emsdk/upstream/emscripten\nCOPY vendor-toolchain/emscripten/ /emsdk/upstream/emscripten/\nRUN mv /emsdk/filecompresser-sdk-node-modules /emsdk/upstream/emscripten/node_modules\nENV EM_CACHE=/emsdk/filecompresser-source-cache EM_FROZEN_CACHE=0`)
  let copied = 0
  dockerfile = dockerfile.replace(/^ADD https:\/\/github\.com\/([^#]+)\.git#\$[A-Z0-9_]+ \/src\s*$/gm, (_line, repository) => {
    const source = libraries.find(item => (item.originalRecipeRepository || item.repository) === repository)
    if (!source) throw Error(`Unrecorded Docker source: ${repository}`)
    copied++
    return `COPY vendor/${source.name}/ /src/`
  })
  if (copied !== libraries.length || /^ADD https:|git clone/m.test(dockerfile)) throw Error('Not every headless library was replaced with a verified local source tree.')
  const sdlBuild = 'RUN embuilder build sdl2 sdl2-mt\n'
  if (!dockerfile.includes(sdlBuild)) throw Error('The original SDL port build step changed.')
  dockerfile = dockerfile.replace(sdlBuild, '')
  dockerfile = dockerfile.replace(/^COPY --from=([^ ]+)-builder \$INSTALL_DIR \$INSTALL_DIR\n/gm, (line, name) => ['x264', 'lame', 'zlib'].includes(name) ? line : '')
  const lameCopy = 'COPY --from=lame-builder $INSTALL_DIR $INSTALL_DIR\n'
  if (!dockerfile.includes(lameCopy)) throw Error('The headless dependency copy stage changed.')
  dockerfile = dockerfile.replace(lameCopy, `${lameCopy}COPY --from=zlib-builder $INSTALL_DIR $INSTALL_DIR\nRUN test -s /opt/lib/libx264.a && test -s /opt/lib/libmp3lame.a && test -s /opt/lib/libz.a && sha256sum /opt/lib/libx264.a /opt/lib/libmp3lame.a /opt/lib/libz.a > /filecompresser-static-library-checksums.txt\n`)
  dockerfile = dockerfile.replace(/FROM ffmpeg-base AS ffmpeg-builder\n[\s\S]*?(?=^FROM ffmpeg-builder AS ffmpeg-wasm-builder)/m, 'FROM ffmpeg-base AS ffmpeg-builder\nCOPY build/ffmpeg.sh /src/build.sh\nRUN bash -x /src/build.sh \\\n      --enable-gpl \\\n      --enable-libx264 \\\n      --enable-libmp3lame \\\n      --enable-zlib \\\n      --disable-avdevice \\\n      --disable-sdl2 \\\n      --disable-network\n\n')
  dockerfile = dockerfile.replace(/^ENV FFMPEG_LIBS \\\n(?:[ \t]+[^\n]*\n)+/m, 'ENV FFMPEG_LIBS="/opt/lib/libx264.a /opt/lib/libmp3lame.a /opt/lib/libz.a"\n')
  dockerfile = dockerfile.replace(/^RUN mkdir -p \/src\/dist\/umd[\s\S]*?(?=^RUN mkdir -p \/src\/dist\/esm)/m, '')
  if (!dockerfile.includes('--disable-avdevice') || !dockerfile.includes('--disable-sdl2') || !dockerfile.includes('--disable-network') || !dockerfile.includes('ENV FFMPEG_LIBS="/opt/lib/libx264.a /opt/lib/libmp3lame.a /opt/lib/libz.a"') || /COPY --from=(?:x265|libvpx|opus|theora|vorbis|libwebp|libass|zimg)-builder|embuilder build sdl/.test(dockerfile)) throw Error('The reviewed minimal headless dependency profile was not fully applied.')
  const aptEnd = '      apt-get install -y pkg-config autoconf automake libtool ragel\n'
  if (!dockerfile.includes(aptEnd)) throw Error('The reviewed build-package installation step changed.')
  dockerfile = dockerfile.replace(aptEnd, `${aptEnd}RUN dpkg-query -W > /filecompresser-build-packages.txt\n`)
  dockerfile += '\nCOPY --from=emsdk-base /filecompresser-build-packages.txt /build-metadata/build-packages.txt\n'
  dockerfile += 'COPY --from=ffmpeg-wasm-builder /src/config.h /build-metadata/ffmpeg-config.h\nCOPY --from=ffmpeg-wasm-builder /src/ffbuild/config.mak /build-metadata/ffmpeg-config.mak\nCOPY --from=ffmpeg-wasm-builder /src/libavutil/ffversion.h /build-metadata/ffmpeg-version.h\n'
  dockerfile += 'COPY --from=ffmpeg-base /filecompresser-static-library-checksums.txt /build-metadata/static-library-checksums.txt\n'
  writeFileSync(path.join(context, 'Dockerfile'), dockerfile)
  writeFileSync(path.join(context, '.dockerignore'), '.git\n**/.git\npackages/**/dist\n')
  const originalScripts = []
  for (const name of ['x264.sh', 'lame.sh', 'zlib.sh', 'ffmpeg.sh', 'ffmpeg-wasm.sh']) {
    const filename = path.join(context, 'build', name)
    const original = readFileSync(filename, 'utf8')
    let bounded = original.replace(/(\bmake\b[^\n]*?[ \t])-j(?=\s|$)/gm, '$1-j2')
    if (name === 'zlib.sh') {
      const oldOptions = '  -DBUILD_SHARED_LIBS=OFF\n  -DSKIP_INSTALL_FILES=ON\n'
      if (!bounded.includes(oldOptions)) throw Error('The reviewed zlib CMake options changed.')
      bounded = bounded.replace(oldOptions, '  -DZLIB_BUILD_SHARED=OFF\n  -DZLIB_BUILD_STATIC=ON\n  -DZLIB_BUILD_TESTING=OFF\n  -DZLIB_INSTALL=ON\n')
    }
    if (name === 'lame.sh') {
      if (!bounded.includes('  --disable-frontend')) throw Error('The reviewed LAME encoding-only build flags changed.')
      bounded = bounded.replace('  --disable-frontend', '  --disable-decoder                                  # FFmpeg supplies native decoding; no mpg123 dependency\n  --disable-frontend')
    }
    if (name === 'ffmpeg-wasm.sh') {
      for (const flag of ['-Llibavdevice', '-lavdevice', '-sUSE_SDL=2']) if (!bounded.includes(flag)) throw Error('The original avdevice/SDL link recipe changed.')
      bounded = bounded.replace(/^.*(?:-Llibavdevice|-lavdevice|-sUSE_SDL=2).*\n/gm, '')
      bounded = bounded.replace('emcc "${CONF_FLAGS[@]}" $@', 'emcc "${CONF_FLAGS[@]}" "$@" -Wl,-Map=/src/dist/esm/ffmpeg-core.link.map')
    }
    if (bounded !== original) originalScripts.push({ path: `build/${name}`, original, changed: bounded })
    writeFileSync(filename, bounded)
  }
  if (!originalScripts.length) throw Error('Expected build parallelism controls were not found.')
  writeJson('recipe-changes.json', {
    originalDockerfileGitBlob: gitBlob(Buffer.from(originalDockerfile)), controlledDockerfileSha256: sha256(Buffer.from(dockerfile)),
    changes: ['Intentionally updated FFmpeg from 5.1.4 to pinned 5.1.10+19.b5d146d17cb4 source; old npm binary identity is not a release target.', 'Kept native FFmpeg decoders/filters and external x264/LAME/current zlib only; disabled devices, SDL and network. Built ESM only.', 'Used checksum-pinned official current LAME source with decoder disabled; updated zlib static CMake options.', 'Pinned SDK/frontend/BuildKit image digests.', 'Replaced image Emscripten runtime with acquired source and a fresh system-library cache.', 'Verified actual SDK SIMD header against exact LLVM source and official release DEPS; retained actual resource headers and preferred source.', 'Replaced all external source downloads with verified local source trees.', 'Recorded build package versions and retained the final WASM linker map.', 'Bound bare make -j to two jobs.'],
    scripts: originalScripts.map(item => ({ path: item.path, beforeSha256: sha256(Buffer.from(item.original)), afterSha256: sha256(Buffer.from(item.changed)) })),
  })
  status.runtimeSourcePinsVerified = true
  status.minimalHeadlessProfileVerified = true
  writeJson('probe-status.json', status)

  const config = path.join(output, 'buildkit.toml')
  writeFileSync(config, '[worker.oci]\n  max-parallelism = 2\n')
  builder = `filecompresser-codec-${process.env.GITHUB_RUN_ID || Date.now()}`
  command('docker', ['buildx', 'create', '--name', builder, '--driver', 'docker-container', '--driver-opt', `image=${images.buildkit}`, '--buildkitd-config', config, '--use'], { stdio: 'inherit' })
  command('docker', ['buildx', 'inspect', '--bootstrap', builder], { stdio: 'inherit' })
  const rebuilt = path.join(output, 'rebuilt')
  command('docker', ['buildx', 'build', '--builder', builder, '--platform', 'linux/amd64', '--progress=plain', '--provenance=false', '--sbom=false', '--build-arg', 'FFMPEG_ST=yes', '--build-arg', 'EXTRA_CFLAGS=-O3 -msimd128', '--output', `type=local,dest=${rebuilt}`, context], { stdio: 'inherit', timeout: 150 * 60 * 1000 })
  const outputs = {}
  for (const [kind, filename] of [['js', 'ffmpeg-core.js'], ['wasm', 'ffmpeg-core.wasm']]) {
    const file = path.join(rebuilt, 'dist/esm', filename)
    const bytes = readFileSync(file)
    if (!lstatSync(file).isFile() || !bytes.length || bytes.length > 128 * 1024 * 1024) throw Error('Unexpected rebuilt core output.')
    if (kind === 'wasm' && (!bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])) || !WebAssembly.validate(bytes))) throw Error('The rebuilt WASM is not a valid module.')
    if (kind === 'wasm' && !bytes.includes(Buffer.from('5.1.10\0'))) throw Error('The new WASM does not contain the expected patched FFmpeg version.')
    outputs[kind] = { filename, bytes: bytes.length, sha256: sha256(bytes), matchesInstalledNpmCore: sha256(bytes) === expected[kind] }
  }
  status.built = true
  status.originalNpmBinaryCorrespondenceVerified = outputs.js.matchesInstalledNpmCore && outputs.wasm.matchesInstalledNpmCore
  if (status.originalNpmBinaryCorrespondenceVerified) throw Error('The intentionally patched build unexpectedly matches both old unpatched npm outputs.')
  status.embeddedPatchedFfmpegVersionPresent = true
  status.outputs = outputs
  const builtConfig = readFileSync(path.join(rebuilt, 'build-metadata/ffmpeg-config.h'), 'utf8')
  const builtVersion = readFileSync(path.join(rebuilt, 'build-metadata/ffmpeg-version.h'), 'utf8').match(/^#define FFMPEG_VERSION "([^"]+)"/m)?.[1]
  const feature = name => builtConfig.match(new RegExp(`^#define CONFIG_${name} ([01])$`, 'm'))?.[1]
  if (builtVersion !== '5.1.10' || ['GPL', 'LIBX264', 'LIBMP3LAME', 'ZLIB'].some(name => feature(name) !== '1') || ['AVDEVICE', 'SDL2', 'NETWORK'].some(name => feature(name) !== '0')) throw Error('Compiled configure/header metadata does not match the reviewed minimal profile.')
  writeFileSync(path.join(rebuilt, 'build-metadata/codec-build.json'), JSON.stringify({ buildLabel: `FileCompresser minimal FFmpeg ${manifest.patchedFfmpeg.sourceLabel} (GPL-enabled, single-thread)`, evidenceMethod: 'Parsed actual compiled FFmpeg configure/version headers; runtime browser QA is separate.', ffmpegVersion: builtVersion, ffmpegSourceLabel: manifest.patchedFfmpeg.sourceLabel, postTagCommitCount: 19, ffmpegSourceCommit: manifest.patchedFfmpeg.commit, gplEnabled: true, externalLibraries: manifest.headlessProfile.externalLibraries, disabledComponents: manifest.headlessProfile.disabledComponents, nativeDecodersAndFiltersPreserved: true, sourcePinsSha256: sha256(manifestBytes), outputs, legalClearance: false, allNativeDependenciesCleared: false }, null, 2) + '\n')
  status.status = 'built-and-compared'
  writeJson('probe-status.json', status)
  console.log(JSON.stringify(status, null, 2))

  // A binary is retained only inside the same bundle as complete acquired
  // source, exact notices, original/patched recipes and build instructions.
  const retained = path.join(output, 'retained')
  mkdirSync(retained)
  cpSync(path.join(sources, 'archives'), path.join(retained, 'source-archives'), { recursive: true })
  cpSync(path.join(sources, 'notices'), path.join(retained, 'notices'), { recursive: true })
  for (const name of ['source-pins.json', 'collection.json', 'sdk-clang-resource-headers.tar.gz', 'official-toolchain-release-DEPS', 'official-sdk-release-mapping.json']) cpSync(path.join(sources, name), path.join(retained, name))
  cpSync(diagnostics, path.join(retained, 'evidence'), { recursive: true })
  const recipe = path.join(retained, 'recipe')
  mkdirSync(recipe)
  for (const name of ['collect-sources.mjs', 'rebuild-probe.mjs', 'artifact-budget.mjs', 'README.md', 'source-pins.json', 'ffmpeg-security-ancestry.json', 'native-dependency-review.json']) cpSync(path.join(recipeDirectory, name), path.join(recipe, name))
  writeFileSync(path.join(recipe, 'Dockerfile.original'), originalDockerfile)
  cpSync(path.join(context, 'Dockerfile'), path.join(recipe, 'Dockerfile.controlled'))
  cpSync(path.join(context, '.dockerignore'), path.join(recipe, '.dockerignore'))
  cpSync(config, path.join(recipe, 'buildkit.toml'))
  for (const item of originalScripts) {
    const target = path.join(recipe, 'patched', item.path)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, item.changed)
  }
  const core = path.join(retained, 'newly-built-core/esm')
  mkdirSync(core, { recursive: true })
  for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) cpSync(path.join(rebuilt, 'dist/esm', file), path.join(core, file))
  cpSync(path.join(rebuilt, 'build-metadata'), path.join(retained, 'build-metadata'), { recursive: true })
  const linkMap = readFileSync(path.join(rebuilt, 'dist/esm/ffmpeg-core.link.map'))
  if (!linkMap.length || linkMap.length > 8 * 1024 * 1024) throw Error('Unexpected final WASM linker map size.')
  if (['/opt/lib/libx264.a', '/opt/lib/libmp3lame.a', '/opt/lib/libz.a'].some(filename => !linkMap.includes(Buffer.from(filename)))) throw Error('The linker map does not show all three exact reviewed external archives.')
  writeFileSync(path.join(retained, 'build-metadata/ffmpeg-core.link.map'), linkMap)
  writeFileSync(path.join(retained, 'READ-FIRST.txt'), 'Controlled source/rebuild investigation, not a website release or legal certification. FFmpeg is intentionally patched to maintained5.1.10+19.b5d146d17cb4; the old npm 5.1.4 binary is not a release target. The newly built ESM core is accompanied by all acquired source archives, notice files and exact recipes. Reconstruct the recorded submodule path before building. Old npm identity comparison is diagnostic only. No old installed npm binary is included. No all-native-dependencies-cleared, hosted-app or production-authentication claim is made.\n')
  const bundle = path.join(output, 'codec-source-and-new-core.tar.gz')
  const validateRetained = directory => {
    for (const name of readdirSync(directory)) {
      const filename = path.join(directory, name)
      const info = lstatSync(filename)
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw Error('Outer bundle contains a non-regular member.')
      if (info.isDirectory()) validateRetained(filename)
    }
  }
  validateRetained(retained)
  command('tar', ['--format=ustar', '-czf', bundle, '-C', retained, '.'], { timeout: 15 * 60 * 1000 })
  const bundleBytes = readFileSync(bundle)
  if (bundleBytes.length > 195 * 1024 * 1024) throw Error('The complete source-plus-new-core bundle exceeds the 195 MiB retention budget; it must not be uploaded.')
  const uncompressedTarBytes = gunzipSync(bundleBytes, { maxOutputLength: 256 * 1024 * 1024 }).length
  const memberCount = command('tar', ['-tzf', bundle]).trim().split('\n').length
  if (memberCount > 512) throw Error('The outer package exceeds the reviewed member-count bound.')
  status.artifact = { filename: path.basename(bundle), format: 'ustar+gzip', bytes: bundleBytes.length, uncompressedTarBytes, memberCount, sha256: sha256(bundleBytes), retentionDays: 1, completeSourceAccompaniesNewBinary: true }
  status.status = 'probe-complete-not-released'
  writeJson('probe-status.json', status)
  console.log('FILECOMPRESSER_CODEC_PAIR_EVIDENCE_BEGIN')
  console.log(JSON.stringify(status, null, 2))
  console.log('FILECOMPRESSER_CODEC_PAIR_EVIDENCE_END')
  console.log(`Complete source-plus-new-core bundle ready: ${bundleBytes.length} bytes. No old installed binary was packaged. Legal clearance remains false.`)
} catch (error) {
  const officialRefs = path.join(output, 'sources/official-source-refs.json')
  if (existsSync(officialRefs)) writeJson('official-source-refs.json', JSON.parse(readFileSync(officialRefs, 'utf8')))
  status.status = 'failed'
  status.error = error instanceof Error ? error.message : String(error)
  writeJson('probe-status.json', status)
  console.error(status.error)
  process.exitCode = 1
} finally {
  if (builder) {
    try { command('docker', ['buildx', 'rm', builder], { stdio: 'inherit', timeout: 60000 }) }
    catch { console.error('The ephemeral codec builder could not be removed; the hosted runner will be discarded.') }
  }
}
