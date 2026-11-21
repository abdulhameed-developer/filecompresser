import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const NOTICE_LIMITS = Object.freeze({ output: 25 * 1024 * 1024, file: 1024 * 1024, native: 8 * 1024 * 1024, lock: 8 * 1024 * 1024, packages: 4096, entries: 100000, notices: 4096, depth: 16 })
const NPM_NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i
const NOTICE_NAME = /^(?:licen[cs]es?|copying|notices?|copyright|third[-_. ]?party)(?:$|[._ -]|notice|licen[cs]e)/i
const BUNDLE_NOTICE_NAME = /\.(?:licen[cs]es?|notices?)(?:\.[a-z0-9]+)?$/i
const CMS_ROOTS = ['tinacms', '@tinacms/cli']
const FALLBACK_PACKAGES = Object.freeze({
  "@ffmpeg/ffmpeg": {
    "version": "0.12.15",
    "resolved": "https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz",
    "integrity": "sha512-1C8Obr4GsN3xw+/1Ww6PFM84wSQAGsdoTuTWPOj2OizsRDLT4CXTaVjPhkw6ARyDus1B9X/L2LiXHqYYsGnRFw=="
  },
  "@ffmpeg/util": {
    "version": "0.12.2",
    "resolved": "https://registry.npmjs.org/@ffmpeg/util/-/util-0.12.2.tgz",
    "integrity": "sha512-ouyoW+4JB7WxjeZ2y6KpRvB+dLp7Cp4ro8z0HIVpZVCM7AwFlHa0c4R8Y/a4M3wMqATpYKhC7lSFHQ0T11MEDw=="
  },
  "@ffmpeg/types": {
    "version": "0.12.4",
    "resolved": "https://registry.npmjs.org/@ffmpeg/types/-/types-0.12.4.tgz",
    "integrity": "sha512-k9vJQNBGTxE5AhYDtOYR5rO5fKsspbg51gbcwtbkw2lCdoIILzklulcjJfIDwrtn7XhDeF2M+THwJ2FGrLeV6A=="
  }
})
// These npm releases omit their original notice. Their package.json versions and
// original LICENSE were checked at this immutable upstream commit; never infer
// author/copyright text from an SPDX identifier or use it for another version.
const FFMPEG_LICENSE_SHA256 = '3e123e29517d76504ffce77b3f8e2ccffd4712493f27694b0aba3e376676459f'
const FFMPEG_LICENSE_SOURCE = 'https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/LICENSE'
const FFMPEG_LICENSE = "MIT License\n\nCopyright (c) 2019 Jerome Wu\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n"
// Reviewed supplemental text already present inside the published paired source
// archive. Keep the original outer native notices and archive bytes unchanged.
const MUSL_REVIEW = Object.freeze({
  archiveSha256: '6d3326d6e2456fdf7973ac7ab1d83620a41a99acc5b65b316d139ffbfc148818',
  jsSha256: 'cea5a18a8ef99258fa2299b8feb57ca641c0222e88de077fd0562b4eeef7bfed',
  wasmSha256: '584febef0d37a76379d5c2c53539250e78c250e2c5f2710493301ea55198d5ab',
  sourcePinsSha256: 'e25ff55c61088a636a5703a40eb3ea6a222cf2b5957477df0a75129f75809d75',
  copyrightSha256: 'f9bc4423732350eb0b3f7ed7e91d530298476f8fec0c6c427a1c04ade22655af',
  copyrightBytes: 6204,
  sourceUrl: 'https://github.com/emscripten-core/emscripten/blob/5c27e79dd0a9c4e27ef2326841698cdd4f6b5784/system/lib/libc/musl/COPYRIGHT',
})
const MUSL_COPYRIGHT = "musl as a whole is licensed under the following standard MIT license:\n\n----------------------------------------------------------------------\nCopyright © 2005-2020 Rich Felker, et al.\n\nPermission is hereby granted, free of charge, to any person obtaining\na copy of this software and associated documentation files (the\n\"Software\"), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish,\ndistribute, sublicense, and/or sell copies of the Software, and to\npermit persons to whom the Software is furnished to do so, subject to\nthe following conditions:\n\nThe above copyright notice and this permission notice shall be\nincluded in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.\nIN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY\nCLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,\nTORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE\nSOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n----------------------------------------------------------------------\n\nAuthors/contributors include:\n\nA. Wilcox\nAda Worcester\nAlex Dowad\nAlex Suykov\nAlexander Monakov\nAndre McCurdy\nAndrew Kelley\nAnthony G. Basile\nAric Belsito\nArvid Picciani\nBartosz Brachaczek\nBenjamin Peterson\nBobby Bingham\nBoris Brezillon\nBrent Cook\nChris Spiegel\nClément Vasseur\nDaniel Micay\nDaniel Sabogal\nDaurnimator\nDavid Carlier\nDavid Edelsohn\nDenys Vlasenko\nDmitry Ivanov\nDmitry V. Levin\nDrew DeVault\nEmil Renner Berthing\nFangrui Song\nFelix Fietkau\nFelix Janda\nGianluca Anzolin\nHauke Mehrtens\nHe X\nHiltjo Posthuma\nIsaac Dunham\nJaydeep Patil\nJens Gustedt\nJeremy Huntwork\nJo-Philipp Wich\nJoakim Sindholt\nJohn Spencer\nJulien Ramseier\nJustin Cormack\nKaarle Ritvanen\nKhem Raj\nKylie McClain\nLeah Neukirchen\nLuca Barbato\nLuka Perkov\nM Farkas-Dyck (Strake)\nMahesh Bodapati\nMarkus Wichmann\nMasanori Ogino\nMichael Clark\nMichael Forney\nMikhail Kremnyov\nNatanael Copa\nNicholas J. Kain\norc\nPascal Cuoq\nPatrick Oppenlander\nPetr Hosek\nPetr Skocik\nPierre Carrier\nReini Urban\nRich Felker\nRichard Pennington\nRyan Fairfax\nSamuel Holland\nSegev Finer\nShiz\nsin\nSolar Designer\nStefan Kristiansson\nStefan O'Rear\nSzabolcs Nagy\nTimo Teräs\nTrutz Behn\nValentin Ochs\nWill Dietz\nWilliam Haddon\nWilliam Pitcock\n\nPortions of this software are derived from third-party works licensed\nunder terms compatible with the above MIT license:\n\nThe TRE regular expression implementation (src/regex/reg* and\nsrc/regex/tre*) is Copyright © 2001-2008 Ville Laurikari and licensed\nunder a 2-clause BSD license (license text in the source files). The\nincluded version has been heavily modified by Rich Felker in 2012, in\nthe interests of size, simplicity, and namespace cleanliness.\n\nMuch of the math library code (src/math/* and src/complex/*) is\nCopyright © 1993,2004 Sun Microsystems or\nCopyright © 2003-2011 David Schultz or\nCopyright © 2003-2009 Steven G. Kargl or\nCopyright © 2003-2009 Bruce D. Evans or\nCopyright © 2008 Stephen L. Moshier or\nCopyright © 2017-2018 Arm Limited\nand labelled as such in comments in the individual source files. All\nhave been licensed under extremely permissive terms.\n\nThe ARM memcpy code (src/string/arm/memcpy.S) is Copyright © 2008\nThe Android Open Source Project and is licensed under a two-clause BSD\nlicense. It was taken from Bionic libc, used on Android.\n\nThe AArch64 memcpy and memset code (src/string/aarch64/*) are\nCopyright © 1999-2019, Arm Limited.\n\nThe implementation of DES for crypt (src/crypt/crypt_des.c) is\nCopyright © 1994 David Burren. It is licensed under a BSD license.\n\nThe implementation of blowfish crypt (src/crypt/crypt_blowfish.c) was\noriginally written by Solar Designer and placed into the public\ndomain. The code also comes with a fallback permissive license for use\nin jurisdictions that may not recognize the public domain.\n\nThe smoothsort implementation (src/stdlib/qsort.c) is Copyright © 2011\nValentin Ochs and is licensed under an MIT-style license.\n\nThe x86_64 port was written by Nicholas J. Kain and is licensed under\nthe standard MIT terms.\n\nThe mips and microblaze ports were originally written by Richard\nPennington for use in the ellcc project. The original code was adapted\nby Rich Felker for build system and code conventions during upstream\nintegration. It is licensed under the standard MIT terms.\n\nThe mips64 port was contributed by Imagination Technologies and is\nlicensed under the standard MIT terms.\n\nThe powerpc port was also originally written by Richard Pennington,\nand later supplemented and integrated by John Spencer. It is licensed\nunder the standard MIT terms.\n\nAll other files which have no copyright comments are original works\nproduced specifically for use as part of this library, written either\nby Rich Felker, the main author of the library, or by one or more\ncontibutors listed above. Details on authorship of individual files\ncan be found in the git version control history of the project. The\nomission of copyright and license comments in each file is in the\ninterest of source tree size.\n\nIn addition, permission is hereby granted for all public header files\n(include/* and arch/*/bits/*) and crt files intended to be linked into\napplications (crt/*, ldso/dlstart.c, and arch/*/crt_arch.h) to omit\nthe copyright notice and permission notice otherwise required by the\nlicense, and to use these files without any requirement of\nattribution. These files include substantial contributions from:\n\nBobby Bingham\nJohn Spencer\nNicholas J. Kain\nRich Felker\nRichard Pennington\nStefan Kristiansson\nSzabolcs Nagy\n\nall of whom have explicitly granted such permission.\n\nThis file previously contained text expressing a belief that most of\nthe files covered by the above exception were sufficiently trivial not\nto be subject to copyright, resulting in confusion over whether it\nnegated the permissions granted in the license. In the spirit of\npermissive licensing, and of not having licensing issues being an\nobstacle to adoption, that text has been removed.\n"
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw new Error(`Third-party notices: ${message}`) }
const isNotice = name => NOTICE_NAME.test(name) || BUNDLE_NOTICE_NAME.test(name)
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const sorted = values => [...values].sort(compare)

function safeRelative(value) {
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value) || /[\\\u0000-\u001f\u007f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) fail('unsafe package or notice path')
  return value
}
async function safeInfo(root, relative, optional = false) {
  const parts = safeRelative(relative).split('/')
  let current = root
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i])
    let info
    try { info = await lstat(current) }
    catch (error) { if (optional && error.code === 'ENOENT') return undefined; throw error }
    if (info.isSymbolicLink()) fail(`symbolic links are not allowed: ${relative}`)
    if (i < parts.length - 1 && !info.isDirectory()) fail(`non-directory in notice path: ${relative}`)
    if (i === parts.length - 1) return info
  }
}
async function boundedRead(root, relative, maximum) {
  const info = await safeInfo(root, relative)
  if (!info.isFile() || info.size > maximum) fail(`unsupported or oversized notice input: ${relative}`)
  const bytes = await readFile(path.join(root, relative))
  if (bytes.length !== info.size || bytes.length > maximum) fail(`notice input changed while reading: ${relative}`)
  new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (bytes.includes(0)) fail(`binary data in notice input: ${relative}`)
  return bytes
}
function packageName(key) {
  return key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)
}
function resolveLocked(packages, from, name) {
  if (!NPM_NAME.test(name)) fail('invalid locked dependency name')
  let directory = from
  for (;;) {
    const candidate = `${directory ? `${directory}/` : ''}node_modules/${name}`
    if (Object.hasOwn(packages, candidate)) return candidate
    if (!directory) return undefined
    const parent = path.posix.dirname(directory)
    directory = parent === '.' ? '' : parent
  }
}

function lockedIdentity(packages, key, entry) {
  const alias = packageName(key)
  if (entry.name === undefined || entry.name === alias) return alias
  // npm aliases retain the real package name in the lock entry and installed
  // metadata. Require an explicit declaration that resolves to this exact node.
  const target = entry.name
  if (typeof target !== 'string' || !NPM_NAME.test(target) || ['.', '..'].includes(target)) fail(`invalid locked alias target: ${key}`)
  const declared = Object.entries(packages).some(([owner, metadata]) =>
    ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'].some(group => {
      const spec = metadata[group]?.[alias]
      if (typeof spec !== 'string' || !spec.startsWith('npm:')) return false
      const separator = spec.lastIndexOf('@')
      return separator > 4 && spec.slice(4, separator) === target
        && spec.slice(separator + 1).trim().length > 0
        && resolveLocked(packages, owner, alias) === key
    }))
  if (!declared) fail(`locked alias has no matching npm declaration: ${key}`)
  return target
}

/** Conservative notice inventory, not a claim that every listed package ships. */
export async function collectThirdPartyNotices(root = process.cwd()) {
  const lock = JSON.parse((await boundedRead(root, 'package-lock.json', NOTICE_LIMITS.lock)).toString('utf8'))
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages || typeof lock.packages !== 'object' || !lock.packages['']) fail('a package-lock v2/v3 package graph is required')
  if (Object.keys(lock.packages).length > NOTICE_LIMITS.packages) fail('the lockfile exceeds its package bound')
  const packages = lock.packages
  const rootPackage = packages['']
  const roots = new Set(Object.keys(rootPackage.dependencies ?? {}).filter(name => name !== '@ffmpeg/core'))
  for (const name of CMS_ROOTS) if (rootPackage.dependencies?.[name] || rootPackage.devDependencies?.[name]) roots.add(name)
  if (!roots.size) fail('no locked runtime dependencies were found')
  const required = new Set([...roots].filter(name => name !== '@tinacms/cli'))
  const queue = sorted(roots).map(name => {
    const key = resolveLocked(packages, '', name)
    if (!key) fail(`a required dependency is absent from the lockfile: ${name}`)
    return key
  })
  const visited = new Set()
  const sections = []
  const missing = []
  const absent = []
  let total = 0
  let entries = 0
  let notices = 0
  let installed = 0
  const append = (heading, bytes) => {
    const header = Buffer.from(`\n===== ${heading} =====\n`)
    total += header.length + bytes.length + 1
    notices++
    if (total > NOTICE_LIMITS.output || notices > NOTICE_LIMITS.notices) fail('the generated notice inventory exceeds its asset bound')
    sections.push(header, bytes, Buffer.from('\n'))
  }
  async function list(relative) {
    const values = await readdir(path.join(root, relative), { withFileTypes: true })
    entries += values.length
    if (entries > NOTICE_LIMITS.entries) fail('notice discovery exceeds its directory-entry bound')
    return values.sort((a, b) => compare(a.name, b.name))
  }
  async function scan(relative, recurse, allFiles = false, depth = 0) {
    if (depth > NOTICE_LIMITS.depth) fail('notice discovery exceeds its depth bound')
    const info = await safeInfo(root, relative, true)
    if (!info) return []
    if (!info.isDirectory()) fail(`expected a notice directory: ${relative}`)
    const found = []
    for (const entry of await list(relative)) {
      const filename = safeRelative(`${relative}/${entry.name}`)
      const selected = allFiles || isNotice(entry.name)
      if (entry.isSymbolicLink()) {
        if (selected || recurse) fail(`symbolic links are not allowed: ${filename}`)
        continue
      }
      if (entry.isFile() && selected) found.push(filename)
      else if (entry.isDirectory() && (recurse || selected)) found.push(...await scan(filename, recurse, allFiles || selected, depth + 1))
    }
    return found
  }
  while (queue.length) {
    const key = queue.shift()
    if (visited.has(key)) continue
    visited.add(key)
    if (visited.size > NOTICE_LIMITS.packages || !key.startsWith('node_modules/')) fail('unsupported locked package graph')
    safeRelative(key)
    const entry = packages[key]
    if (!entry || entry.link) fail(`linked or missing locked package: ${key}`)
    const name = packageName(key)
    const info = await safeInfo(root, key, true)
    if (!info) {
      if (required.has(name) && key === `node_modules/${name}`) fail(`required installed package is missing: ${name}`)
      absent.push(key)
      continue
    }
    if (!info.isDirectory()) fail(`installed package is not a directory: ${key}`)
    const metadata = JSON.parse((await boundedRead(root, `${key}/package.json`, 512 * 1024)).toString('utf8'))
    const identity = lockedIdentity(packages, key, entry)
    if (metadata.name !== identity || metadata.version !== entry.version) fail(`installed identity differs from package-lock: ${key}`)
    const label = `${identity}@${entry.version}${identity === name ? '' : ` (npm alias ${name})`}`
    installed++
    const files = await scan(key, false)
    if (name === 'next') files.push(...await scan(`${key}/dist/compiled`, true))
    if (CMS_ROOTS.includes(name)) {
      for (const directory of ['dist', 'build']) files.push(...await scan(`${key}/${directory}`, true))
    }
    for (const filename of sorted(new Set(files))) {
      const bytes = await boundedRead(root, filename, NOTICE_LIMITS.file)
      if (!bytes.length) fail(`empty notice file: ${filename}`)
      append(`${label} — ${filename}`, bytes)
    }
    if (!files.length && Object.hasOwn(FALLBACK_PACKAGES, name)) {
      const approved = FALLBACK_PACKAGES[name]
      if (entry.version !== approved.version || entry.resolved !== approved.resolved || entry.integrity !== approved.integrity || metadata.license !== 'MIT') fail(`the reviewed upstream license fallback does not cover ${name}@${entry.version}`)
      const bytes = Buffer.from(FFMPEG_LICENSE)
      if (digest(bytes) !== FFMPEG_LICENSE_SHA256) fail('the reviewed original upstream license copy changed')
      append(`${name}@${entry.version} — original upstream LICENSE omitted from this npm package\nSource: ${FFMPEG_LICENSE_SOURCE}\nSHA-256: ${digest(bytes)}`, bytes)
    } else if (!files.length) {
      if (required.has(name) && key === `node_modules/${name}`) fail(`required shipped root has no packaged license text: ${name}@${entry.version}`)
      missing.push(`${key}@${entry.version}`)
    }
    for (const dependency of sorted(new Set([...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {}), ...Object.keys(entry.peerDependencies ?? {})]))) {
      if (dependency === '@ffmpeg/core') continue
      const resolved = resolveLocked(packages, key, dependency)
      if (resolved) queue.push(resolved)
    }
  }
  for (const filename of await scan('public/admin', true)) append(`Generated admin bundle notice — ${filename}`, await boundedRead(root, filename, NOTICE_LIMITS.file))
  const native = await boundedRead(root, 'public/ffmpeg-core/NOTICE.txt', NOTICE_LIMITS.native)
  if (!native.length) fail('the prepared native codec notice is empty')
  append('Native codec/source notice — public/ffmpeg-core/NOTICE.txt (preserved verbatim)', native)
  const engineManifest = 'public/ffmpeg-core/wasm-manifest.json'
  if (await safeInfo(root, engineManifest, true)) {
    const prepared = JSON.parse((await boundedRead(root, engineManifest, NOTICE_LIMITS.file)).toString('utf8')).provenance
    if (prepared?.mode === 'paired-release' && (prepared.archiveSha256 === MUSL_REVIEW.archiveSha256 || prepared.buildMetadata?.sourcePinsSha256 === MUSL_REVIEW.sourcePinsSha256)) {
      if (prepared.archiveSha256 !== MUSL_REVIEW.archiveSha256 || prepared.core?.js?.sha256 !== MUSL_REVIEW.jsSha256 || prepared.core?.wasm?.sha256 !== MUSL_REVIEW.wasmSha256 || prepared.buildMetadata?.sourcePinsSha256 !== MUSL_REVIEW.sourcePinsSha256) fail('the supplemental musl attribution does not match the prepared codec/source identity')
      const copyright = Buffer.from(MUSL_COPYRIGHT)
      if (copyright.length !== MUSL_REVIEW.copyrightBytes || digest(copyright) !== MUSL_REVIEW.copyrightSha256) fail('the reviewed original musl COPYRIGHT copy changed')
      append(`Supplemental native attribution — original Emscripten musl COPYRIGHT\nOriginal source: ${MUSL_REVIEW.sourceUrl}\nPaired archive SHA-256: ${MUSL_REVIEW.archiveSha256}\nCollected source-pins SHA-256: ${MUSL_REVIEW.sourcePinsSha256}\nOriginal COPYRIGHT SHA-256: ${MUSL_REVIEW.copyrightSha256}`, copyright)
    }
  }
  const introduction = Buffer.from([
    'FileCompresser third-party notice inventory',
    '',
    'Original notice and license texts are preserved below; their authors and terms remain their own.',
    'This conservative inventory covers installed packages reachable from locked runtime dependencies, declared Tina editor/build roots, packaged Next compiled notices, and generated admin notice files.',
    'It can include build/server/platform support that is absent from the final browser bundles. It is not a determination that every listed package is shipped, nor a legal-compliance certification.',
    'The native codec notice is copied verbatim, including its actual corresponding-source URL and hashes when a reviewed release is configured.',
    `Installed package records examined: ${installed}.`,
    `Declared editor/build roots present: ${sorted([...roots].filter(name => CMS_ROOTS.includes(name))).join(', ') || 'none (local CMS setup may be pending)'}.`,
    `Absent ancillary/platform package records skipped: ${absent.length}.`,
    missing.length ? `Installed ancillary records without packaged notice files (not represented as licensed by this inventory):\n${sorted(missing).join('\n')}` : 'All examined installed records supplied packaged notices or the explicitly version-pinned upstream fallback.',
    '',
  ].join('\n'))
  const output = Buffer.concat([introduction, ...sections])
  if (output.length > NOTICE_LIMITS.output) fail('the generated notice inventory exceeds its asset bound')
  await safeInfo(root, 'public')
  const target = 'public/THIRD-PARTY-NOTICES.txt'
  const existing = await safeInfo(root, target, true)
  if (existing && !existing.isFile()) fail('the generated public notice target must be a regular file')
  await writeFile(path.join(root, target), output)
  return { bytes: output.length, sha256: digest(output), installedPackages: installed, notices, absentPackages: absent.length, missingNotices: missing.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await collectThirdPartyNotices()
  console.log(`Prepared third-party notice inventory: ${result.notices} notice sections, ${result.bytes} bytes; ${result.missingNotices} ancillary records without packaged notice files.`)
}
