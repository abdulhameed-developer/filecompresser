import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
import { effectiveHomeFields, inspectPageHtml } from './content-parity-core.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const jsonCollections = ['home', 'tools', 'pages', 'posts', 'settings', 'redirects']
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** No runtime renderer/parser imports: expectations come from raw CMS JSON.
 * @param {{projectRoot?: string, origin?: string, sourceRef?: string}} [options]
 */
export async function buildContentManifest({ projectRoot = process.cwd(), origin = 'https://filecompresser.com', sourceRef } = {}) {
  if (new URL(origin).origin !== origin || !['https:', 'http:'].includes(new URL(origin).protocol)) throw new Error('Use a plain HTTP(S) canonical origin.')
  const read = relative => sourceRef ? execFileSync('git', ['show', `${sourceRef}:${relative}`], { cwd: projectRoot, maxBuffer: 5_000_000 }) : readFileSync(path.join(projectRoot, relative))
  const tracked = relative => {
    try { return execFileSync('git', ['show', `HEAD:${relative}`], { cwd: projectRoot, maxBuffer: 5_000_000 }) } catch { return undefined }
  }
  const data = {}
  const records = []
  for (const collection of jsonCollections) {
    const directory = path.join(projectRoot, 'content', collection)
    const files = sourceRef ? execFileSync('git', ['ls-tree', '--name-only', sourceRef, `content/${collection}/`], { cwd: projectRoot, encoding: 'utf8' }).trim().split('\n') : readdirSync(directory).map(name => `content/${collection}/${name}`)
    for (const relative of files.filter(file => file.endsWith('.json'))) {
      if (!/^content\/[a-z]+\/[a-z0-9-]+\.json$/.test(relative)) throw new Error(`Unexpected content path: ${relative}`)
      if (!sourceRef && !lstatSync(path.join(projectRoot, relative)).isFile()) throw new Error(`Content must be a regular file: ${relative}`)
      const bytes = read(relative)
      const value = JSON.parse(bytes.toString('utf8'))
      const slug = path.basename(relative, '.json')
      data[`${collection}/${slug}`] = value
      const committed = tracked(relative)
      records.push({ file: relative, collection, slug, sha256: sha256(bytes), bytes: bytes.length, committedHeadSha256: committed ? sha256(committed) : null, matchesCommittedHead: Boolean(committed && bytes.equals(committed)), publication: collection === 'posts' && (value.published !== true || value.archived === true) ? 'DRAFT_OR_ARCHIVED' : 'PUBLISHED_OR_CONFIGURATION' })
    }
  }
  const moduleData = async relative => {
    const bytes = read(relative)
    const code = ts.transpileModule(bytes.toString('utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  }
  const { TOOLS: tools, relatedTools } = await moduleData('lib/tools.ts')
  const { BLOG_ART: art } = await moduleData('lib/blog-art.ts')
  const homeSource = read('app/page.tsx').toString('utf8')
  const source = ts.createSourceFile('home.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let homeFaq
  let defaultHero
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'FAQ') homeFaq = node.initializer.getText(source)
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'hero' && ts.isBinaryExpression(node.initializer) && ts.isObjectLiteralExpression(node.initializer.right)) defaultHero = node.initializer.right.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!homeFaq) throw new Error('Homepage fallback FAQ constant not found; update parity source mapping explicitly.')
  const fallback = await import(`data:text/javascript;base64,${Buffer.from(`export default ${homeFaq}`).toString('base64')}`)
  if (!defaultHero) throw new Error('Homepage fallback hero constant not found; update parity source mapping explicitly.')
  const heroFallback = await import(`data:text/javascript;base64,${Buffer.from(`export default ${defaultHero}`).toString('base64')}`)
  const storySource = ts.createSourceFile('story.tsx', read('components/ProcessingStory.tsx').toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let defaultSteps
  const visitSteps = node => { if (ts.isVariableDeclaration(node) && node.name.getText(storySource) === 'DEFAULT_STEPS') defaultSteps = node.initializer.getText(storySource); ts.forEachChild(node, visitSteps) }
  visitSteps(storySource)
  if (!defaultSteps) throw new Error('Processing-story fallback steps not found; update parity source mapping explicitly.')
  const stepsFallback = await import(`data:text/javascript;base64,${Buffer.from(`export default ${defaultSteps}`).toString('base64')}`)
  const settings = data['settings/site']
  if (!settings) throw new Error('Missing site settings.')
  const drafts = records.filter(record => record.collection === 'posts' && record.publication === 'DRAFT_OR_ARCHIVED').map(record => ({ slug: record.slug, title: data[`posts/${record.slug}`].title }))
  const posts = records.filter(record => record.collection === 'posts' && record.publication !== 'DRAFT_OR_ARCHIVED').map(record => ({ ...data[`posts/${record.slug}`], slug: record.slug })).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
  for (const post of posts) {
    if (!slugPattern.test(post.slug)) throw new Error('Invalid article slug.')
    post.image = post.featuredImage?.src ? post.featuredImage : { src: `/blog/${post.figure}.jpg`, alt: art[post.figure].alt }
  }
  const faqFor = (value, defaultFaq) => (value.faqMode ?? 'default') === 'hidden' ? [] : value.faqMode === 'custom' ? (value.faq ?? []).filter(entry => entry.q || entry.a) : defaultFaq ?? []
  const title = (value, absolute = false) => absolute ? value : `${value} | ${settings.titleSuffix}`
  const home = data['home/home']
  const homeFields = effectiveHomeFields(home, heroFallback.default, stepsFallback.default)
  const pages = [{ route: '/', record: 'content/home/home.json', kind: 'home', heading: `${homeFields.hero.lead} ${homeFields.hero.emphasis}`, title: title(home.seoTitle ?? `${settings.wordmark} — ${settings.tagline}`, true), description: home.seoDescription ?? settings.defaultDescription, editorial: home, ...homeFields, faq: faqFor(home, fallback.default), cards: posts.slice(0, 3) }]
  for (const tool of tools) {
    const editorial = data[`tools/${tool.slug}`]
    if (!editorial) throw new Error(`Missing tool content: ${tool.slug}`)
    const related = editorial.relatedTools?.length ? editorial.relatedTools.map(slug => tools.find(tool => tool.slug === slug)).filter(value => value && value.slug !== tool.slug) : relatedTools(tool)
    pages.push({ route: `/${tool.slug}`, record: `content/tools/${tool.slug}.json`, kind: 'tool', heading: tool.title, title: title(editorial.seoTitle ?? tool.seoTitle ?? `${tool.title} — Free, Private & Browser-Based`), description: editorial.seoDescription ?? tool.seoDescription ?? `${tool.description} Runs entirely on your device — no upload, no account, no sign-up.`, editorial, tool, faq: faqFor(editorial, tool.faq), relatedTools: related })
  }
  const wav = pages.find(page => page.route === '/wav-compressor')
  pages.push({ ...wav, route: '/wav-to-mp3', canonical: '/wav-compressor', kind: 'alias' })
  for (const slug of ['about', 'contact', 'privacy', 'terms', 'disclaimer', 'blog']) {
    const value = data[`pages/${slug}`]
    pages.push({ route: `/${slug}`, record: `content/pages/${slug}.json`, kind: ['privacy', 'terms', 'disclaimer'].includes(slug) ? 'legal' : slug, heading: value.title.replace(/\n/g, ' '), title: title(value.seoTitle), description: value.seoDescription, managed: value, ...(slug === 'blog' ? { cards: posts } : {}) })
  }
  for (const post of posts) pages.push({ route: `/blog/${post.slug}`, record: `content/posts/${post.slug}.json`, kind: 'post', heading: post.title, title: title(post.seoTitle ?? post.title), description: post.seoDescription ?? post.description, post, image: post.image, relatedPosts: posts.filter(other => other.slug !== post.slug).slice(0, 3) })
  pages.push({ route: '/sitemap', record: 'app/sitemap/page.tsx', kind: 'sitemap', heading: 'Every tool. Every guide.', title: title('Sitemap'), description: 'Every tool on filecompresser, grouped by type.', sitemapLinks: [...tools.map(tool => ({ href: `/${tool.slug}`, label: tool.title })), ...posts.map(post => ({ href: `/blog/${post.slug}`, label: post.title }))] })
  for (const page of pages) {
    Object.assign(page, { settings, drafts, footerTools: tools.map(tool => ({ slug: tool.slug, title: tool.title })) })
    if (page.kind !== 'sitemap') {
      const baseTitle = page.title.endsWith(` | ${settings.titleSuffix}`) ? page.title.slice(0, -` | ${settings.titleSuffix}`.length) : page.title
      const image = page.post ? page.image : page.kind === 'blog' ? { src: '/blog/formattree.jpg', alt: art.formattree.alt } : { src: settings.socialImage, alt: settings.socialImageAlt }
      page.social = { 'og:title': baseTitle, 'og:description': page.description, 'og:url': `${origin}${(page.canonical ?? page.route) === '/' ? '' : page.canonical ?? page.route}`, 'og:image': `${origin}${image.src}`, 'og:image:alt': image.alt, 'twitter:title': baseTitle, 'twitter:description': page.description }
    }
  }
  const canonicalRoutes = pages.filter(page => !page.canonical).map(page => page.route)
  const inactiveFaqRows = records.filter(record => ['home', 'tools'].includes(record.collection)).flatMap(record => {
    const value = data[`${record.collection}/${record.slug}`]
    const rows = (value.faq ?? []).filter(entry => entry.q || entry.a)
    return value.faqMode !== 'custom' && rows.length ? [{ record: record.file, field: 'faq', controllingField: 'faqMode', mode: value.faqMode ?? 'default', retainedRows: rows.length, disposition: 'Not selected for public rendering by the saved display mode; not a missing Save.' }] : []
  })
  const runtimeFiles = []
  const collect = relative => {
    for (const entry of readdirSync(path.join(projectRoot, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`
      if (entry.isDirectory()) collect(file)
      else if (entry.isFile() && /\.(?:ts|tsx|mjs|css)$/.test(entry.name)) runtimeFiles.push(file)
    }
  }
  if (sourceRef) runtimeFiles.push(...execFileSync('git', ['ls-tree', '-r', '--name-only', sourceRef, 'app/', 'components/', 'lib/'], { cwd: projectRoot, encoding: 'utf8' }).trim().split('\n').filter(file => /\.(?:ts|tsx|mjs|css)$/.test(file)))
  else for (const directory of ['app', 'components', 'lib']) collect(directory)
  const pinnedInputs = [...new Set(runtimeFiles)].sort().map(file => ({ file, sha256: sha256(read(file)) }))
  return { schemaVersion: 1, createdAt: new Date().toISOString(), sourceRef: sourceRef ?? 'WORKING_TREE', committedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(), sourceRecords: records, sourceInputs: pinnedInputs, allContentMatchesCommittedHead: records.every(record => record.matchesCommittedHead), origin, pages, canonicalRoutes, drafts, inactiveFaqRows, redirects: data['redirects/rules']?.rules ?? [], sitemapLastmod: Object.fromEntries([...posts.map(post => [`/blog/${post.slug}`, post.updated ?? post.date]), ...['about', 'contact', 'privacy', 'terms', 'disclaimer'].map(slug => [`/${slug}`, data[`pages/${slug}`].updated]), ['/blog', [data['pages/blog'].updated, ...posts.map(post => post.updated ?? post.date)].filter(Boolean).sort().at(-1)]]) }
}

export function inspectSitemap(manifest, xml) {
  const dom = new JSDOM(xml, { contentType: 'application/xml' })
  const entries = [...dom.window.document.querySelectorAll('url')].map(element => ({ loc: element.querySelector('loc')?.textContent, lastmod: element.querySelector('lastmod')?.textContent ?? null }))
  const checks = []
  const check = (field, expected, actual) => checks.push({ field, expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual) })
  check('canonicalEntries', manifest.canonicalRoutes.map(route => `${manifest.origin}${route}`).sort(), entries.map(entry => entry.loc).sort())
  check('duplicateEntries', entries.length, new Set(entries.map(entry => entry.loc)).size)
  for (const [route, expected] of Object.entries(manifest.sitemapLastmod)) check(`${route}.lastmod`, expected ?? null, entries.find(entry => entry.loc === `${manifest.origin}${route}`)?.lastmod ?? null)
  for (const draft of manifest.drafts) check(`draft.${draft.slug}.absent`, false, entries.some(entry => entry.loc === `${manifest.origin}/blog/${draft.slug}`))
  dom.window.close()
  return { passed: checks.every(check => check.passed), checks, mismatches: checks.filter(check => !check.passed) }
}

/** A valid XML body must never hide a failed HTTP status or HTML response.
 * @param {object} manifest
 * @param {{status: number, contentType: string | null, html: string}} response
 */
export function inspectSitemapResponse(manifest, response) {
  const mediaType = (response.contentType ?? '').split(';')[0].trim().toLowerCase()
  const headers = [
    { field: 'http.status', expected: 200, actual: response.status, passed: response.status === 200 },
    { field: 'http.contentType', expected: ['application/xml', 'text/xml'], actual: response.contentType, passed: ['application/xml', 'text/xml'].includes(mediaType) },
  ]
  try {
    const parsed = inspectSitemap(manifest, response.html)
    const checks = [...headers, ...parsed.checks]
    return { passed: checks.every(check => check.passed), checks, mismatches: checks.filter(check => !check.passed) }
  } catch (error) {
    const checks = [...headers, { field: 'xml.valid', expected: true, actual: error.message, passed: false }]
    return { passed: false, checks, mismatches: checks.filter(check => !check.passed) }
  }
}

function exportFile(directory, route) {
  const candidates = route === '/' ? [path.join(directory, 'index.html')] : [path.join(directory, `${route.slice(1)}.html`), path.join(directory, route.slice(1), 'index.html')]
  return candidates.find(existsSync)
}

export function readExportDocument(directory, route) {
  if (route !== '/' && !/^\/(?:blog\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route)) throw new Error('Export parity only reads known safe page paths.')
  const file = exportFile(directory, route)
  return { status: file ? 200 : 404, html: file ? readFileSync(file, 'utf8') : '', file }
}

/** Read the configured origin only; redirects stay visible as failed delivery. */
export async function readRemoteDocument(baseUrl, route) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${route}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  return { status: response.status, html: await response.text(), contentType: response.headers.get('content-type'), xRobotsTag: response.headers.get('x-robots-tag') ?? '' }
}

/**
 * @param {{projectRoot?: string, exportDirectory?: string, baseUrl?: string, origin?: string, sourceRef?: string, requireCommitted?: boolean, expectedIndexable?: boolean, expectedFollow?: boolean}} [options]
 */
export async function auditContentParity({ projectRoot = process.cwd(), exportDirectory, baseUrl, origin = 'https://filecompresser.com', sourceRef, requireCommitted = false, expectedIndexable = true, expectedFollow = true } = {}) {
  if (!exportDirectory && !baseUrl) throw new Error('Supply --export or --base; neither a build nor a deployment is created by this checker.')
  if (typeof expectedIndexable !== 'boolean' || typeof expectedFollow !== 'boolean') throw new Error('Indexability and follow expectations must be explicit booleans.')
  if (baseUrl && (!expectedIndexable || !expectedFollow) && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname)) throw new Error('Remote production parity always requires index, follow; no noindex/nofollow override is permitted.')
  if (sourceRef && (!/^[a-zA-Z0-9_./-]{1,200}$/.test(sourceRef) || sourceRef.startsWith('-') || sourceRef.includes('..'))) throw new Error('Use a commit hash or plain branch name for --source-ref.')
  const manifest = await buildContentManifest({ projectRoot, origin, sourceRef })
  if (requireCommitted && !manifest.allContentMatchesCommittedHead) throw new Error('Content differs from committed HEAD; preserve/review those edits before claiming Git parity.')
  const readRemote = route => readRemoteDocument(baseUrl, route)
  const reports = []
  for (const [label, enabled] of [['export', exportDirectory], ['live', baseUrl]]) if (enabled) {
    const result = { environment: label, base: enabled, pages: [], drafts: [], redirects: [], sitemap: null }
    for (const page of manifest.pages) {
      try {
        const response = label === 'export' ? readExportDocument(exportDirectory, page.route) : await readRemote(page.route)
        const report = inspectPageHtml(page, response.html, { origin, status: response.status, indexable: expectedIndexable, follow: expectedFollow, xRobotsTag: 'xRobotsTag' in response ? response.xRobotsTag : '' })
        result.pages.push({ ...report, htmlSha256: sha256(response.html), ...('file' in response && response.file ? { file: response.file } : {}) })
      } catch (error) { result.pages.push({ route: page.route, record: page.record, passed: false, error: error.message }) }
    }
    for (const draft of manifest.drafts) {
      const route = `/blog/${draft.slug}`
      try {
        const published = label === 'export' ? Boolean(exportFile(exportDirectory, route)) : (await readRemote(route)).status !== 404
        result.drafts.push({ route, expected: 'ABSENT_OR_404', actual: published ? 'PUBLISHED_OR_NON404' : 'ABSENT_OR_404', passed: !published })
      } catch (error) { result.drafts.push({ route, passed: false, error: error.message }) }
    }
    if (label === 'export') {
      try {
        const actual = readFileSync(path.join(exportDirectory, '_redirects'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
        const expected = manifest.redirects.map(rule => `${rule.from} ${rule.to} 301`)
        result.redirects.push({ field: 'redirects.rules', expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual) })
      } catch (error) { result.redirects.push({ field: 'redirects.rules', passed: false, error: error.message }) }
    } else for (const rule of manifest.redirects) {
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}${rule.from}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
        const actual = { status: response.status, destination: response.headers.get('location') ? new URL(response.headers.get('location'), baseUrl).href : null }
        const expected = { status: 301, destination: `${origin}${rule.to}` }
        result.redirects.push({ field: rule.from, expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual) })
        await response.body?.cancel()
      } catch (error) { result.redirects.push({ field: rule.from, passed: false, error: error.message }) }
    }
    try {
      const response = label === 'export' ? { status: 200, contentType: 'application/xml', html: readFileSync(path.join(exportDirectory, 'sitemap.xml'), 'utf8') } : await readRemote('/sitemap.xml')
      result.sitemap = inspectSitemapResponse(manifest, response)
    } catch (error) { result.sitemap = { passed: false, error: error.message } }
    result.passed = result.pages.every(page => page.passed) && result.drafts.every(draft => draft.passed) && result.redirects.every(rule => rule.passed) && result.sitemap.passed
    reports.push(result)
  }
  const after = await buildContentManifest({ projectRoot, origin, sourceRef })
  const sourceStable = JSON.stringify(manifest.sourceRecords.map(record => [record.file, record.sha256])) === JSON.stringify(after.sourceRecords.map(record => [record.file, record.sha256])) && JSON.stringify(manifest.sourceInputs) === JSON.stringify(after.sourceInputs)
  return { schemaVersion: 1, recordedAt: new Date().toISOString(), passed: sourceStable && reports.every(report => report.passed), sourceStable, expectedRobots: { indexable: expectedIndexable, follow: expectedFollow }, manifest, reports, limitations: ['The hosted Tina editor/index is a separate native-account verification; Git JSON is not proof of its current indexed state.', 'This checker reads static HTML DOM and schemas, not screenshot quality, CSS visibility or runtime file processing.', 'Source-ref pins data/registry; the checks enforce Phase 3 display requirements and do not emulate a historical component implementation.', 'Multiple field mismatches from an inserted or reordered block can be cascading evidence, not separate independent product defects.', 'No build/deployment/indexing request or production content mutation is performed.', 'Missing public access and transport errors remain failures; no content/date assertions are waived.'] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
  const output = arg('output') ?? '.qa-results/phase3/content-parity/report.json'
  try {
    const report = await auditContentParity({ exportDirectory: arg('export'), baseUrl: arg('base'), origin: arg('origin') ?? 'https://filecompresser.com', sourceRef: arg('source-ref'), requireCommitted: process.argv.includes('--require-committed-content'), expectedIndexable: !process.argv.includes('--expect-noindex'), expectedFollow: !process.argv.includes('--expect-nofollow') })
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ passed: report.passed, sourceStable: report.sourceStable, records: report.manifest.sourceRecords.length, committedContent: report.manifest.allContentMatchesCommittedHead, environments: report.reports.map(result => ({ environment: result.environment, pages: result.pages.length, passing: result.pages.filter(page => page.passed).length, mismatches: result.pages.reduce((sum, page) => sum + (page.mismatches?.length ?? 0), 0), drafts: result.drafts, sitemap: result.sitemap.passed })), output }))
    if (!report.passed) process.exitCode = 1
  } catch (error) {
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify({ passed: false, error: error.message, recordedAt: new Date().toISOString() }, null, 2) + '\n')
    console.error(error.message)
    process.exitCode = 1
  }
}
