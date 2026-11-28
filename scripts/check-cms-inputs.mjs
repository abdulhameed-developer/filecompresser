import { closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectCmsValidationInput } from './cms-security/resource-limits.mjs'
import { CMS_CONTENT_LIMITS } from '../lib/cms-content-limits.mjs'

// These project limits apply to authored JSON before Tina's indexer reads it.
// They are deliberately separate from executable tina/config.js and callbacks.
export { CMS_CONTENT_LIMITS }

function readBoundedJson(filename, size) {
  if (size > CMS_CONTENT_LIMITS.maxFileBytes) throw Error('JSON exceeds the 2 MiB file limit')
  const descriptor = openSync(filename, 'r')
  try {
    // One extra byte also detects a file growing after the initial stat. Never
    // allocate according to an unchecked file size or read an unbounded stream.
    const buffer = Buffer.alloc(Math.min(size + 1, CMS_CONTENT_LIMITS.maxFileBytes + 1))
    let used = 0
    while (used < buffer.length) {
      const count = readSync(descriptor, buffer, used, buffer.length - used, null)
      if (!count) break
      used += count
    }
    if (used !== size || fstatSync(descriptor).size !== size) throw Error('JSON changed during preflight; retry a stable source checkout')
    let value
    try { value = JSON.parse(buffer.subarray(0, used).toString('utf8')) } catch {
      // Recent Node versions can include source text in a SyntaxError. Build
      // diagnostics identify the file, never echo draft contents or values.
      throw Error('Invalid JSON syntax')
    }
    return { value, bytes: used }
  } finally {
    closeSync(descriptor)
  }
}

export function checkCmsInputs(projectRoot = process.cwd()) {
  const directory = path.join(projectRoot, 'content')
  let files = 0
  let totalBytes = 0
  const walk = (current, depth) => {
    if (depth > CMS_CONTENT_LIMITS.maxDirectoryDepth) throw Error('CMS content directory is too deeply nested')
    if (!lstatSync(current).isDirectory()) throw Error('CMS content root must be a directory')
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name)
      const relative = path.relative(projectRoot, filename)
      const info = lstatSync(filename)
      if (info.isSymbolicLink()) throw Error(`CMS preflight refused a symbolic link: ${relative}`)
      if (info.isDirectory()) { walk(filename, depth + 1); continue }
      if (!entry.name.endsWith('.json')) continue
      if (!info.isFile()) throw Error(`CMS preflight requires regular JSON files: ${relative}`)
      if (++files > CMS_CONTENT_LIMITS.maxFiles) throw Error('CMS content exceeds the 10,000-file limit')
      try {
        const document = readBoundedJson(filename, info.size)
        totalBytes += document.bytes
        if (totalBytes > CMS_CONTENT_LIMITS.maxTotalBytes) throw Error('CMS content exceeds the 64 MiB total byte limit')
        const rejected = inspectCmsValidationInput(document.value)
        if (rejected) throw Error(`JSON exceeds the ${rejected.reason} resource limit (${rejected.limit})`)
      } catch (error) {
        throw Error(`CMS preflight failed for ${relative}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  const rootInfo = lstatSync(directory)
  if (rootInfo.isSymbolicLink()) throw Error('CMS content root must not be a symbolic link')
  walk(directory, 0)
  return { files, totalBytes, limits: CMS_CONTENT_LIMITS }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkCmsInputs()
    console.log(`CMS JSON preflight passed: ${result.files} files, ${result.totalBytes} bytes; file and graph limits verified.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
