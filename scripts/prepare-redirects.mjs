import { access, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const slug = '[a-z0-9]+(?:-[a-z0-9]+)*'
const routePattern = new RegExp(`^/(?:blog/)?${slug}$`)
const reserved = new Set(['admin', 'uploads', 'ffmpeg-core', 'image-worker', 'api', 'opengraph-image', '404', 'wav-to-mp3'])
const fail = message => { throw new Error(`Invalid URL redirects: ${message}`) }
const safePath = (value, allowHome = false) => typeof value === 'string' && value.length <= 240 &&
  ((allowHome && value === '/') || routePattern.test(value)) && !reserved.has(value.split('/')[1])

/** The preview accepts only the exact safe 301 format emitted by this module. */
export function parseRedirectFile(source) {
  const redirects = new Map()
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 3 || fields[2] !== '301' || !safePath(fields[0]) || !safePath(fields[1], true) ||
      fields[0] === fields[1] || redirects.has(fields[0])) fail('the generated _redirects file contains an invalid exact 301 rule.')
    redirects.set(fields[0], fields[1])
  }
  return redirects
}

/** Exact redirects only. A final published destination prevents chains/loops. */
export function validateRedirectRules(value, publicRoutes) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.rules)) fail('expected an object containing a rules list.')
  if (value.rules.length > 2000) fail('Cloudflare Pages accepts at most 2,000 exact redirects.')
  const sources = new Map()
  for (const [index, rule] of value.rules.entries()) {
    if (!rule || typeof rule !== 'object' || !safePath(rule.from) || !safePath(rule.to, true))
      fail(`rule ${index + 1} must use safe exact site paths, with no domain, query, fragment, wildcard, trailing slash or reserved system path.`)
    if (sources.has(rule.from)) fail(`duplicate old address ${rule.from}.`)
    if (rule.from === rule.to) fail(`a redirect cannot point to itself (${rule.from}).`)
    sources.set(rule.from, rule.to)
  }
  for (const [from, to] of sources) {
    const visited = new Set([from])
    let next = to
    while (sources.has(next)) {
      if (visited.has(next)) fail(`redirect loop beginning at ${from}.`)
      visited.add(next)
      next = sources.get(next)
    }
    if (sources.has(to)) fail(`${from} must point directly to a published page, without a redirect chain.`)
    if (publicRoutes.has(from)) fail(`${from} still has a public page. Rename or archive the old article first.`)
    if (!publicRoutes.has(to)) fail(`${to} is not an existing public page. Destinations cannot be missing, draft or archived articles.`)
  }
  return [...sources].map(([from, to]) => ({ from, to }))
}

async function entries(directory) {
  try { return await readdir(directory, { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
}

/** Read route identities without executing or transpiling any application code. */
export async function readPublicRoutes(root = process.cwd()) {
  const routes = new Set(['/'])
  for (const entry of await entries(path.join(root, 'app'))) {
    if (!entry.isDirectory() || !new RegExp(`^${slug}$`).test(entry.name)) continue
    try { await access(path.join(root, 'app', entry.name, 'page.tsx')); routes.add(`/${entry.name}`) }
    catch { /* Asset handlers and dynamic route directories are not pages. */ }
  }
  for (const entry of await entries(path.join(root, 'content/tools'))) {
    if (entry.isFile() && new RegExp(`^${slug}\\.json$`).test(entry.name)) routes.add(`/${entry.name.slice(0, -5)}`)
  }
  for (const entry of await entries(path.join(root, 'content/posts'))) {
    if (!entry.isFile() || !new RegExp(`^${slug}\\.json$`).test(entry.name)) continue
    const item = JSON.parse(await readFile(path.join(root, 'content/posts', entry.name), 'utf8'))
    if (item.published === true && item.archived !== true) routes.add(`/blog/${entry.name.slice(0, -5)}`)
  }
  return routes
}

export async function prepareRedirects(root = process.cwd()) {
  const filename = path.join(root, 'content/redirects/rules.json')
  if ((await lstat(filename)).isSymbolicLink()) fail('the redirect settings file cannot be a symbolic link.')
  const value = JSON.parse(await readFile(filename, 'utf8'))
  const rules = validateRedirectRules(value, await readPublicRoutes(root))
  await mkdir(path.join(root, 'public'), { recursive: true })
  await writeFile(path.join(root, 'public/_redirects'), [
    '# Generated from content/redirects/rules.json. Edit redirects through the CMS.',
    ...rules.map(({ from, to }) => `${from} ${to} 301`), '',
  ].join('\n'))
  return rules
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Prepared ${(await prepareRedirects()).length} validated permanent redirects.`)
}
