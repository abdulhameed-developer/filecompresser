/* eslint no-console: "off" */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
const status = { status: 'started', sourcePinsSha256: sha256(manifestBytes), sourceCollected: false, runtimeSourcePinsVerified: false, built: false, originalNpmBinaryCorrespondenceVerified: false, legalClearance: false, deployed: false }
writeJson('probe-status.json', status)
let builder
try {
  const sources = path.join(output, 'sources')
  command(process.execPath, [path.join(recipeDirectory, 'collect-sources.mjs'), sources], { stdio: 'inherit', timeout: 35 * 60 * 1000 })
  const collection = JSON.parse(readFileSync(path.join(sources, 'collection.json'), 'utf8'))
  if (collection.sourcePinsSha256 !== sha256(manifestBytes) || collection.sourceArchives.length !== manifest.sources.length) throw Error('Source collection does not match this reviewed manifest.')
  for (const archive of collection.sourceArchives) {
    const bytes = readFileSync(path.join(sources, 'archives', archive.archive))
    if (bytes.length !== archive.bytes || sha256(bytes) !== archive.sha256) throw Error(`Source archive identity changed: ${archive.name}`)
  }
  status.sourceCollected = true
  writeJson('source-collection.json', collection)

  // Python's data filter refuses archive traversal and unsafe outside links.
  const extract = (name, destination) => {
    const archive = collection.sourceArchives.find(item => item.name === name)
    if (!archive) throw Error(`Missing source archive: ${name}`)
    mkdirSync(destination, { recursive: true })
    command('python3', ['-c', 'import sys,tarfile\nwith tarfile.open(sys.argv[1],"r:gz") as archive:\n archive.extractall(sys.argv[2],filter="data")', path.join(sources, 'archives', archive.archive), destination])
  }
  const work = path.join(output, 'work')
  extract('ffmpegwasm', work)
  const context = path.join(work, 'ffmpegwasm')
  for (const file of manifest.upstreamRecipe.files) {
    if (gitBlob(readFileSync(path.join(context, file.path))) !== file.gitBlob) throw Error(`Upstream recipe changed: ${file.path}`)
  }
  const libraries = manifest.buildLibrarySources.map(name => manifest.sources.find(item => item.name === name))
  if (libraries.length !== 16 || libraries.some(item => !item)) throw Error('Incomplete explicit build-library source set.')
  const vendor = path.join(context, 'vendor')
  for (const source of libraries) extract(source.name, vendor)
  const toolchainSources = path.join(context, 'vendor-toolchain')
  extract('emscripten', toolchainSources)
  extract('llvm-resource-headers', toolchainSources)
  extract('googletest', path.join(output, 'submodule'))
  const googleTarget = path.join(vendor, 'zimg/test/extra/googletest')
  mkdirSync(googleTarget, { recursive: true })
  if (lstatSync(googleTarget).isSymbolicLink()) throw Error('Unsafe zimg submodule destination.')
  cpSync(path.join(output, 'submodule/googletest'), googleTarget, { recursive: true })

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

  const sdlResponse = await fetch(manifest.sdlPort.archiveURL, { redirect: 'follow', signal: AbortSignal.timeout(120000) })
  if (!sdlResponse.ok) throw Error('The recorded SDL2 port archive could not be downloaded.')
  const sdlBytes = Buffer.from(await sdlResponse.arrayBuffer())
  if (sdlBytes.length > 50 * 1024 * 1024 || createHash('sha512').update(sdlBytes).digest('hex') !== manifest.sdlPort.sha512) throw Error('SDL2 port archive failed its upstream checksum.')
  writeFileSync(path.join(sources, 'SDL2-upstream-port.zip'), sdlBytes)

  const originalDockerfile = readFileSync(path.join(context, 'Dockerfile'), 'utf8')
  let dockerfile = originalDockerfile.replace(/^# syntax=.*$/m, `# syntax=${images.frontend}`)
  const sdkBase = 'FROM emscripten/emsdk:3.1.40 AS emsdk-base'
  if (!dockerfile.includes(sdkBase)) throw Error('The reviewed SDK base stage changed.')
  dockerfile = dockerfile.replace(sdkBase, `FROM ${images.emsdk} AS emsdk-base\nRUN test ! -e /emsdk/filecompresser-source-cache && test -d /emsdk/upstream/emscripten/node_modules && mv /emsdk/upstream/emscripten/node_modules /emsdk/filecompresser-sdk-node-modules && rm -rf /emsdk/upstream/emscripten\nCOPY vendor-toolchain/emscripten/ /emsdk/upstream/emscripten/\nRUN mv /emsdk/filecompresser-sdk-node-modules /emsdk/upstream/emscripten/node_modules\nENV EM_CACHE=/emsdk/filecompresser-source-cache EM_FROZEN_CACHE=0`)
  let copied = 0
  dockerfile = dockerfile.replace(/^ADD https:\/\/github\.com\/([^#]+)\.git#\$[A-Z0-9_]+ \/src\s*$/gm, (_line, repository) => {
    const source = libraries.find(item => item.repository === repository)
    if (!source) throw Error(`Unrecorded Docker source: ${repository}`)
    copied++
    return `COPY vendor/${source.name}/ /src/`
  })
  const zimgClone = 'RUN git clone --recursive -b $ZIMG_BRANCH https://github.com/sekrit-twc/zimg.git /src'
  if (!dockerfile.includes(zimgClone)) throw Error('The reviewed zimg source step changed.')
  dockerfile = dockerfile.replace(zimgClone, 'COPY vendor/zimg/ /src/')
  if (copied !== libraries.length - 1 || /^ADD https:|git clone/m.test(dockerfile)) throw Error('Not every external library was replaced with a verified local source tree.')
  const aptEnd = '      apt-get install -y pkg-config autoconf automake libtool ragel\n'
  if (!dockerfile.includes(aptEnd)) throw Error('The reviewed build-package installation step changed.')
  dockerfile = dockerfile.replace(aptEnd, `${aptEnd}RUN dpkg-query -W > /filecompresser-build-packages.txt\n`)
  dockerfile += '\nCOPY --from=emsdk-base /filecompresser-build-packages.txt /build-metadata/build-packages.txt\n'
  writeFileSync(path.join(context, 'Dockerfile'), dockerfile)
  writeFileSync(path.join(context, '.dockerignore'), '.git\n**/.git\npackages/**/dist\n')
  const originalScripts = []
  for (const name of readdirSync(path.join(context, 'build')).filter(name => name.endsWith('.sh'))) {
    const filename = path.join(context, 'build', name)
    const original = readFileSync(filename, 'utf8')
    const bounded = original.replace(/\bmake(\s+install)?\s+-j(?=\s|$)/gm, (_text, install = '') => `make${install} -j2`)
    if (bounded !== original) originalScripts.push({ path: `build/${name}`, original, changed: bounded })
    writeFileSync(filename, bounded)
  }
  if (!originalScripts.length) throw Error('Expected build parallelism controls were not found.')
  writeJson('recipe-changes.json', {
    originalDockerfileGitBlob: gitBlob(Buffer.from(originalDockerfile)), controlledDockerfileSha256: sha256(Buffer.from(dockerfile)),
    changes: ['Pinned SDK/frontend/BuildKit image digests.', 'Replaced image Emscripten runtime with the acquired pinned source and used a fresh system-library cache.', 'Verified the actual SDK SIMD header against exact LLVM source and official release DEPS; retained all actual SDK resource headers and selected preferred LLVM header/generator sources.', 'Replaced remote library Git fetches with verified local source trees, including the pinned zimg submodule.', 'Recorded installed build-package versions.', 'Bound bare make -j commands to two jobs.'],
    scripts: originalScripts.map(item => ({ path: item.path, beforeSha256: sha256(Buffer.from(item.original)), afterSha256: sha256(Buffer.from(item.changed)) })),
  })
  status.runtimeSourcePinsVerified = true
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
    outputs[kind] = { filename, bytes: bytes.length, sha256: sha256(bytes), matchesInstalledNpmCore: sha256(bytes) === expected[kind] }
  }
  status.built = true
  status.originalNpmBinaryCorrespondenceVerified = outputs.js.matchesInstalledNpmCore && outputs.wasm.matchesInstalledNpmCore
  status.outputs = outputs
  status.status = 'built-and-compared'
  writeJson('probe-status.json', status)
  console.log(JSON.stringify(status, null, 2))

  // A binary is retained only inside the same bundle as complete acquired
  // source, exact notices, original/patched recipes and build instructions.
  const retained = path.join(output, 'retained')
  mkdirSync(retained)
  cpSync(path.join(sources, 'archives'), path.join(retained, 'source-archives'), { recursive: true })
  cpSync(path.join(sources, 'notices'), path.join(retained, 'notices'), { recursive: true })
  for (const name of ['source-pins.json', 'collection.json', 'SDL2-upstream-port.zip', 'sdk-clang-resource-headers.tar.gz', 'official-toolchain-release-DEPS', 'official-sdk-release-mapping.json']) cpSync(path.join(sources, name), path.join(retained, name))
  cpSync(diagnostics, path.join(retained, 'evidence'), { recursive: true })
  const recipe = path.join(retained, 'recipe')
  mkdirSync(recipe)
  for (const name of ['collect-sources.mjs', 'rebuild-probe.mjs', 'README.md', 'source-pins.json']) cpSync(path.join(recipeDirectory, name), path.join(recipe, name))
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
  writeFileSync(path.join(retained, 'READ-FIRST.txt'), 'Controlled source/rebuild investigation, not a website release or legal certification. The newly built ESM core is accompanied by all acquired source archives, notice files and exact recipes. Reconstruct the recorded submodule path before building. Original npm binary identity comparison is in evidence/probe-status.json. No old installed npm binary is included. No hosted-app or production-authentication claim is made.\n')
  const bundle = path.join(output, 'codec-source-and-new-core.tar.gz')
  command('tar', ['-czf', bundle, '-C', retained, '.'], { timeout: 15 * 60 * 1000 })
  const bundleBytes = readFileSync(bundle)
  if (bundleBytes.length > 195 * 1024 * 1024) throw Error('The complete source-plus-new-core bundle exceeds the 195 MiB retention budget; it must not be uploaded.')
  status.artifact = { filename: path.basename(bundle), bytes: bundleBytes.length, sha256: sha256(bundleBytes), retentionDays: 1, completeSourceAccompaniesNewBinary: true }
  status.status = 'probe-complete-not-released'
  writeJson('probe-status.json', status)
  console.log(`Complete source-plus-new-core bundle ready: ${bundleBytes.length} bytes. No old installed binary was packaged. Legal clearance remains false.`)
} catch (error) {
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
