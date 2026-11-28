// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { effectiveHomeFields, expectedBody, expectedInline, inspectPageHtml, robotsRules } from '@/scripts/content-parity-core.mjs'
import { auditContentParity, inspectSitemap, inspectSitemapResponse, readExportDocument, readRemoteDocument } from '@/scripts/content-parity.mjs'

const origin = 'https://filecompresser.com'
const page = {
  route: '/png-compressor', record: 'content/tools/png-compressor.json', kind: 'tool',
  heading: 'PNG Compressor', title: 'PNG tool | filecompresser', description: 'Actual PNG description.',
  editorial: {
    heading: 'PNG guide', introduction: 'Read the [format guide](/blog/formats).', faqMode: 'custom', links: [],
    sections: [{ heading: 'Keep the details', body: 'First paragraph.\n\n- Keep alpha\n- Check text\n\n1. Select a file\n2. Save a copy\n\nRead [more](/privacy).' }],
  },
  faq: [{ q: 'Where is the file processed?', a: 'On your device. Read [privacy](/privacy).' }],
  drafts: [{ slug: 'private-draft', title: 'Private draft' }],
}

function head(title = page.title, description = page.description, route = page.route) {
  return `<head><title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="index, follow"><link rel="canonical" href="${origin}${route}"></head>`
}
function html() {
  return `<!doctype html><html>${head()}<body><main><h1>PNG Compressor</h1><section class="editorialContent"><h2>PNG guide</h2><p>Read the <a href="/blog/formats">format guide</a>.</p><section><h3 id="editorial-section-0">Keep the details</h3><div class="editorialParagraph"><p>First paragraph.</p></div><div class="editorialParagraph"><ul><li>Keep alpha</li><li>Check text</li></ul></div><div class="editorialParagraph"><ol><li>Select a file</li><li>Save a copy</li></ol></div><div class="editorialParagraph"><p>Read <a href="/privacy">more</a>.</p></div></section></section><section class="faq"><details><summary>Where is the file processed?</summary><p>On your device. Read <a href="/privacy">privacy</a>.</p></details></section><script type="application/ld+json">${JSON.stringify({ '@type': 'FAQPage', mainEntity: [{ name: 'Where is the file processed?', acceptedAnswer: { text: 'On your device. Read privacy.' } }] })}</script></main></body></html>`
}
function change(markup: string, selector: string, modify: (element: Element) => void) {
  const document = new DOMParser().parseFromString(markup, 'text/html')
  const element = document.querySelector(selector)
  if (!element) throw new Error(`Missing test fixture selector ${selector}`)
  modify(element)
  return document.documentElement.outerHTML
}
function errors(markup: string, expected = page) { return inspectPageHtml(expected, markup).mismatches.map((value: { field: string }) => value.field) }

describe('independent CMS-to-output field parity', () => {
  it('models valid cleared optional hero fields and omitted story steps using authored fallbacks', () => {
    const hero = { lead: 'Smaller files.', emphasis: 'On your device.', description: 'Fallback description.' }
    const steps = [{ title: 'Select', description: 'Choose a source.' }]
    expect(effectiveHomeFields({ hero: { lead: ' ', emphasis: '', description: null } }, hero, steps)).toEqual({ hero, steps })
  })
  it('retains intentional custom hero and an explicit empty steps array', () => {
    const hero = { lead: 'Custom', emphasis: 'heading', description: 'Actual copy' }
    expect(effectiveHomeFields({ hero, steps: [] }, {}, [{ title: 'Unused' }])).toEqual({ hero, steps: [] })
  })
  it('accepts the complete manually authored paragraph/list/link/FAQ fixture', () => {
    const result = inspectPageHtml(page, html())
    expect(result.passed).toBe(true)
    expect(result.checkCount).toBeGreaterThan(20)
  })

  it('does not accept latest text hidden in Next script data instead of public prose', () => {
    const stale = html().replace('<p>First paragraph.</p>', '<p>Old paragraph.</p>').replace('</body>', '<script>self.__next_f=["First paragraph."]</script></body>')
    expect(errors(stale)).toContain('sections[0].body.text')
  })

  it('finds a missing paragraph with the exact record and field', () => {
    const stale = change(html(), '.editorialParagraph p', element => element.remove())
    const mismatch = inspectPageHtml(page, stale).mismatches.find((value: { field: string }) => value.field === 'sections[0].body.paragraphs')
    expect(mismatch).toMatchObject({ record: page.record, passed: false, expected: ['First paragraph.', 'Read more.'], actual: ['Read more.'] })
  })

  it('finds an extra paragraph rather than just checking expected substrings', () => {
    expect(errors(change(html(), '.editorialParagraph', element => element.insertAdjacentHTML('beforeend', '<p>Unintended old paragraph.</p>')))).toContain('sections[0].body.paragraphs')
  })

  it('finds a missing bullet list even when its words appear elsewhere', () => {
    const stale = change(html(), '.editorialParagraph ul', element => { element.outerHTML = '<p>Keep alpha Check text</p>' })
    expect(errors(stale)).toContain('sections[0].body.lists')
  })

  it('distinguishes numbered steps from bullets', () => {
    const stale = change(html(), '.editorialParagraph ol', element => { element.outerHTML = element.outerHTML.replace(/ol/g, 'ul') })
    expect(errors(stale)).toContain('sections[0].body.lists')
  })

  it('checks list-item ordering', () => {
    expect(errors(change(html(), '.editorialParagraph ul', element => element.prepend(element.lastElementChild!)))).toContain('sections[0].body.lists')
  })

  it('checks destinations, rather than accepting matching anchor words', () => {
    expect(errors(change(html(), '.editorialParagraph a', element => element.setAttribute('href', '/outdated')))).toContain('sections[0].body.links')
  })

  it('checks introductions as separate source fields', () => {
    expect(errors(change(html(), '.editorialContent > p', element => { element.textContent = 'Old introduction' }))).toContain('introduction')
  })

  it('finds a missing FAQ answer and separately stale FAQ schema', () => {
    expect(errors(change(html(), '.faq details p', element => element.remove()))).toContain('faq[0].a')
    expect(errors(change(html(), 'script[type="application/ld+json"]', element => { element.textContent = JSON.stringify({ '@type': 'FAQPage', mainEntity: [] }) }))).toContain('faq.schema')
  })

  it('honors hidden FAQ mode even when retained custom rows exist in CMS', () => {
    const hidden = { ...page, editorial: { ...page.editorial, faqMode: 'hidden' }, faq: [] }
    const mismatch = inspectPageHtml(hidden, html()).mismatches
    expect(mismatch.some((value: { field: string }) => value.field === 'faq.count')).toBe(true)
    expect(mismatch.some((value: { field: string }) => value.field === 'faq.schemaCount')).toBe(true)
  })

  it('finds old metadata, wrong canonical, duplicate metadata and noindex', () => {
    expect(errors(change(html(), 'meta[name="description"]', element => element.setAttribute('content', 'Old description')))).toContain('seoDescription')
    expect(errors(change(html(), 'link[rel="canonical"]', element => element.setAttribute('href', origin + '/wrong')))).toContain('canonical')
    expect(errors(change(html(), 'head', element => element.insertAdjacentHTML('beforeend', '<meta name="description" content="Duplicate">')))).toContain('seoDescription.elementCount')
    expect(errors(change(html(), 'meta[name="robots"]', element => element.setAttribute('content', 'noindex, follow')))).toContain('robots.indexable')
  })

  it('does not infer indexability from a missing robots directive', () => {
    expect(errors(change(html(), 'meta[name="robots"]', element => element.remove()))).toContain('robots.elementCount')
    expect(errors(change(html(), 'meta[name="robots"]', element => element.remove()))).toContain('robots.indexable')
  })

  it('accepts one ordinary robots meta regardless of its name casing', () => {
    expect(inspectPageHtml(page, change(html(), 'meta[name="robots"]', element => element.setAttribute('name', 'RoBoTs'))).passed).toBe(true)
  })

  it('rejects a mixed-case duplicate robots meta and retains its restrictive directive', () => {
    const duplicate = change(html(), 'head', element => element.insertAdjacentHTML('beforeend', '<meta name="Robots" content="noindex">'))
    const mismatch = inspectPageHtml(page, duplicate).mismatches
    expect(mismatch).toContainEqual(expect.objectContaining({ field: 'robots.elementCount', expected: 1, actual: 2 }))
    expect(mismatch).toContainEqual(expect.objectContaining({ field: 'robots.indexable', actual: 'CONFLICT' }))
    expect(mismatch).toContainEqual(expect.objectContaining({ field: 'robots.effective.googlebot.indexable', actual: false }))
  })

  it('accepts explicit noindex/follow only when that local export policy is expected', () => {
    const noindex = change(html(), 'meta[name="robots"]', element => element.setAttribute('content', 'noindex, follow'))
    expect(inspectPageHtml(page, noindex, { indexable: false, follow: true }).passed).toBe(true)
    expect(inspectPageHtml(page, noindex).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.indexable', expected: true, actual: false }))
    expect(inspectPageHtml(page, html(), { indexable: false }).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.indexable', expected: false, actual: true }))
  })

  it('separately checks an explicit nofollow policy and refuses contradictory directives', () => {
    const nofollow = change(html(), 'meta[name="robots"]', element => element.setAttribute('content', 'noindex, nofollow'))
    expect(inspectPageHtml(page, nofollow, { indexable: false, follow: false }).passed).toBe(true)
    expect(inspectPageHtml(page, nofollow, { indexable: false, follow: true }).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.follow', actual: false }))
    expect(inspectPageHtml(page, html(), { follow: false }).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.follow', actual: true }))
    const conflict = change(html(), 'meta[name="robots"]', element => element.setAttribute('content', 'index, noindex, follow, nofollow'))
    expect(inspectPageHtml(page, conflict).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.indexable', actual: 'CONFLICT' }))
    expect(inspectPageHtml(page, conflict).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.follow', actual: 'CONFLICT' }))
  })

  it('forbids remote production noindex and nofollow overrides before reading any network data', async () => {
    await expect(auditContentParity({ baseUrl: origin, expectedIndexable: false })).rejects.toThrow('Remote production parity always requires index, follow')
    await expect(auditContentParity({ baseUrl: origin, expectedFollow: false })).rejects.toThrow('Remote production parity always requires index, follow')
  })

  it.each(['noindex', 'none', 'index, noindex', 'max-snippet: 50, noindex'])('rejects a restrictive global X-Robots-Tag %s despite indexable HTML', value => {
    const result = inspectPageHtml(page, html(), { xRobotsTag: value })
    expect(result.passed).toBe(false)
    expect(result.mismatches).toContainEqual(expect.objectContaining({ field: 'robots.effective.general.indexable', expected: true, actual: false }))
    expect(result.delivery.xRobotsTag).toBe(value)
  })

  it.each(['googlebot', 'bingbot', 'GoogleBot'])('rejects applicable crawler-specific header restrictions for %s', agent => {
    const value = `otherbot: noindex, nofollow, ${agent}: index, noindex, follow`
    expect(inspectPageHtml(page, html(), { xRobotsTag: value }).mismatches).toContainEqual(expect.objectContaining({ field: `robots.effective.${agent.toLowerCase()}.indexable`, expected: true, actual: false }))
  })

  it('rejects nofollow independently and expands the none shorthand', () => {
    expect(inspectPageHtml(page, html(), { xRobotsTag: 'googlebot: nofollow' }).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.effective.googlebot.follow', expected: true, actual: false }))
    const none = inspectPageHtml(page, html(), { xRobotsTag: 'bingbot: none' }).mismatches
    expect(none).toContainEqual(expect.objectContaining({ field: 'robots.effective.bingbot.indexable', actual: false }))
    expect(none).toContainEqual(expect.objectContaining({ field: 'robots.effective.bingbot.follow', actual: false }))
  })

  it.each(['googlebot', 'bingbot', 'GoogleBot'])('rejects applicable %s meta even when another directive says index', agent => {
    const blocked = change(html(), 'head', element => element.insertAdjacentHTML('beforeend', `<meta name="${agent}" content="index, follow"><meta name="${agent}" content="noindex">`))
    expect(errors(blocked)).toContain(`robots.effective.${agent.toLowerCase()}.indexable`)
  })

  it('recognizes restrictive crawler meta in the body and none in the ordinary meta', () => {
    const blocked = change(html(), 'main', element => element.insertAdjacentHTML('beforeend', '<meta name="googlebot" content="none">'))
    expect(errors(blocked)).toContain('robots.effective.googlebot.follow')
    const none = change(html(), 'meta[name="robots"]', element => element.setAttribute('content', 'none'))
    expect(inspectPageHtml(page, none, { indexable: false, follow: false }).passed).toBe(true)
    expect(errors(none)).toContain('robots.indexable')
  })

  it('does not confuse other crawler scopes or parameter values with general blocking', () => {
    for (const value of ['otherbot: noindex, nofollow', 'max-image-preview: none, noimageindex', 'otherbot: none, googlebot: index, follow, bingbot: index, follow']) {
      expect(inspectPageHtml(page, html(), { xRobotsTag: value }).passed).toBe(true)
    }
    expect(robotsRules('noindex, otherbot: index', { header: true, userAgent: 'googlebot' })).toEqual(new Set(['noindex']))
    expect(inspectPageHtml(page, html(), { xRobotsTag: 'noindex, otherbot: index' }).passed).toBe(false)
    const unrelated = change(html(), 'head', element => element.insertAdjacentHTML('beforeend', '<meta name="otherbot" content="none">'))
    expect(inspectPageHtml(page, unrelated).passed).toBe(true)
  })

  it('retains intentional CI noindex/follow while respecting the sum of restrictions', () => {
    const noindex = change(html(), 'meta[name="robots"]', element => element.setAttribute('content', 'noindex, follow'))
    const markup = change(noindex, 'head', element => element.insertAdjacentHTML('beforeend', '<meta name="googlebot" content="index, follow"><meta name="bingbot" content="noindex, follow">'))
    expect(inspectPageHtml(page, markup, { indexable: false, follow: true, xRobotsTag: 'noindex, follow' }).passed).toBe(true)
    expect(inspectPageHtml(page, markup, { indexable: false, follow: true, xRobotsTag: 'googlebot: none' }).passed).toBe(false)
  })

  it('carries actual remote HTTP directives into the same page inspection path', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html(), { headers: { 'Content-Type': 'text/html', 'X-Robots-Tag': 'googlebot: noindex' } }))
    try {
      const response = await readRemoteDocument(origin, page.route)
      expect(request).toHaveBeenCalledWith(origin + page.route, expect.objectContaining({ redirect: 'manual' }))
      expect(inspectPageHtml(page, response.html, { status: response.status, xRobotsTag: response.xRobotsTag }).mismatches).toContainEqual(expect.objectContaining({ field: 'robots.effective.googlebot.indexable', actual: false }))
    } finally { request.mockRestore() }
  })

  it('does not follow an external redirect or accept its otherwise correct HTML', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html(), { status: 301, headers: { Location: 'https://elsewhere.example/' } }))
    try {
      const response = await readRemoteDocument(origin, page.route)
      expect(request).toHaveBeenCalledTimes(1)
      expect(request.mock.calls[0][1]?.redirect).toBe('manual')
      expect(inspectPageHtml(page, response.html, { status: response.status }).mismatches).toContainEqual(expect.objectContaining({ field: 'http.status', actual: 301 }))
    } finally { request.mockRestore() }
  })

  it('does not accept a partial export or substitute another page for a missing route', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'content-parity-export-'))
    try {
      writeFileSync(path.join(directory, 'index.html'), html())
      const missing = readExportDocument(directory, page.route)
      expect(missing.status).toBe(404)
      expect(inspectPageHtml(page, missing.html, { status: missing.status }).passed).toBe(false)
      mkdirSync(path.join(directory, 'png-compressor'))
      writeFileSync(path.join(directory, 'png-compressor/index.html'), html())
      expect(inspectPageHtml(page, readExportDocument(directory, page.route).html).passed).toBe(true)
      expect(() => readExportDocument(directory, '/../private')).toThrow('safe page paths')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('rejects draft discovery links and draft schema independently', () => {
    expect(errors(change(html(), 'main', element => element.insertAdjacentHTML('beforeend', '<a href="/blog/private-draft">Private draft</a>')))).toContain('draft.private-draft.linkAbsent')
    expect(errors(change(html(), 'main', element => element.insertAdjacentHTML('beforeend', `<script type="application/ld+json">{"@type":"BlogPosting","url":"${origin}/blog/private-draft"}</script>`)))).toContain('draft.private-draft.schemaAbsent')
  })

  it('records a non-200 document as a delivery failure', () => {
    expect(inspectPageHtml(page, html(), { status: 503 }).mismatches).toContainEqual(expect.objectContaining({ field: 'http.status', expected: 200, actual: 503 }))
  })

  it('uses the root canonical spelling emitted by the installed Next export', () => {
    const home = { ...page, route: '/' }
    const rootHtml = html().replace(origin + page.route, origin)
    expect(inspectPageHtml(home, rootHtml).passed).toBe(true)
  })

  it('independently parses nested-parenthesis link destinations and literal symbols', () => {
    expect(expectedInline('Read [source](https://example.com/a(b(c))) & keep <3.')).toEqual({ text: 'Read source & keep <3.', links: [{ text: 'source', href: 'https://example.com/a(b(c))' }] })
  })

  it('keeps safe HTML structure and literal Markdown within code/anchors distinct', () => {
    const value = expectedBody('<p><strong>Check</strong> [privacy](/privacy) <code>[literal](/code)</code></p><ol><li>First</li></ol>', { html: true })
    expect(value.links).toEqual([{ text: 'privacy', href: '/privacy' }])
    expect(value.formatting).toEqual([{ tag: 'strong', text: 'Check' }, { tag: 'code', text: '[literal](/code)' }])
    expect(value.lists).toEqual([{ type: 'ol', items: ['First'] }])
  })
})

describe('managed legal content with a separate footer', () => {
  const managed = { title: 'Privacy Policy', introduction: 'How files are handled.', updated: '2026-11-28', sections: [{ heading: 'Local processing', body: ['First policy paragraph.', 'Read [details](/about).'], items: ['One item', 'Two items'], links: [{ label: 'Contact', href: '/contact' }] }], footer: { heading: 'Questions', introduction: 'Read our', link: { label: 'contact page', href: '/contact' } } }
  const policy = { route: '/privacy', record: 'content/pages/privacy.json', kind: 'legal', heading: managed.title, title: 'Privacy Policy | filecompresser', description: 'Policy description.', managed }
  function markup() { return `<html>${head(policy.title, policy.description, policy.route)}<body><main><div class="legal"><h1>Privacy Policy</h1><p class="legalUpdated">Last updated: 28 November 2026</p><p>How files are handled.</p><section><h2>Local processing</h2><p>First policy paragraph.</p><p>Read <a href="/about">details</a>.</p><ul><li>One item</li><li>Two items</li></ul><p><span><a href="/contact">Contact</a></span></p></section><h2>Questions</h2><p>Read our <a href="/contact">contact page</a>.</p></div><script type="application/ld+json">{"@type":"WebPage","dateModified":"2026-11-28"}</script></main></body></html>` }
  it('keeps introduction/body/footer independent without counting footer as another introduction', () => { expect(inspectPageHtml(policy, markup()).passed).toBe(true) })
  it('does not hide an extra or missing body paragraph behind its link-footer exclusion', () => {
    expect(inspectPageHtml(policy, change(markup(), '.legal section', element => element.insertAdjacentHTML('beforeend', '<p>Stale policy text.</p>'))).mismatches).toContainEqual(expect.objectContaining({ field: 'sections[0].body' }))
    expect(inspectPageHtml(policy, change(markup(), '.legal section > p', element => element.remove())).mismatches).toContainEqual(expect.objectContaining({ field: 'sections[0].body' }))
  })
})

describe('sitemap content publication and dates', () => {
  const manifest = { origin, canonicalRoutes: ['/', '/blog/checked'], sitemapLastmod: { '/blog/checked': '2026-11-28' }, drafts: [{ slug: 'private-draft' }] }
  const xml = `<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/blog/checked</loc><lastmod>2026-11-28</lastmod></url></urlset>`
  it('matches every canonical and genuine modified date', () => { expect(inspectSitemap(manifest, xml).passed).toBe(true) })
  it('finds stale lastmod', () => { expect(inspectSitemap(manifest, xml.replace('2026-11-28', '2026-09-04')).mismatches).toContainEqual(expect.objectContaining({ field: '/blog/checked.lastmod' })) })
  it('finds missing canonicals, duplicates and accidental draft publication', () => {
    expect(inspectSitemap(manifest, xml.replace(`<loc>${origin}/blog/checked</loc>`, `<loc>${origin}/</loc>`)).passed).toBe(false)
    expect(inspectSitemap(manifest, xml.replace('</urlset>', `<url><loc>${origin}/blog/private-draft</loc></url></urlset>`)).mismatches).toContainEqual(expect.objectContaining({ field: 'draft.private-draft.absent' }))
  })
  it('requires HTTP200 even when a failed response body contains the correct XML', () => {
    const result = inspectSitemapResponse(manifest, { status: 503, contentType: 'application/xml', html: xml })
    expect(result.passed).toBe(false)
    expect(result.mismatches).toContainEqual(expect.objectContaining({ field: 'http.status', expected: 200, actual: 503 }))
  })
  it('requires actual XML MIME instead of accepting an HTML or missing content type', () => {
    for (const contentType of ['text/html; charset=utf-8', null]) {
      expect(inspectSitemapResponse(manifest, { status: 200, contentType, html: xml }).mismatches).toContainEqual(expect.objectContaining({ field: 'http.contentType' }))
    }
  })
  it('accepts XML content types with charset parameters without weakening body checks', () => {
    for (const contentType of ['application/xml; charset=utf-8', 'text/xml']) expect(inspectSitemapResponse(manifest, { status: 200, contentType, html: xml }).passed).toBe(true)
  })
  it('records malformed XML as a failed field while preserving delivery checks', () => {
    const result = inspectSitemapResponse(manifest, { status: 200, contentType: 'application/xml', html: '<urlset><url></urlset>' })
    expect(result.passed).toBe(false)
    expect(result.mismatches).toContainEqual(expect.objectContaining({ field: 'xml.valid' }))
    expect(result.checks).toContainEqual(expect.objectContaining({ field: 'http.status', passed: true }))
  })
})

describe('article image and publication-date parity', () => {
  const post = { title: 'Checked guide', description: 'A useful guide.', date: '2026-09-04', updated: '2026-11-28', body: [{ type: 'p', text: 'Actual article text.' }, { type: 'image', src: '/uploads/chart.png', alt: 'Measured chart', caption: 'Actual output bytes.' }] }
  const article = { route: '/blog/checked', record: 'content/posts/checked.json', kind: 'post', title: 'Checked guide | filecompresser', heading: post.title, description: post.description, post, image: { src: '/uploads/cover.png', alt: 'Cover description' } }
  function markup() {
    return `<html>${head(article.title, article.description, article.route).replace('</head>', '<meta property="article:published_time" content="2026-09-04"><meta property="article:modified_time" content="2026-11-28"></head>')}<body><main><article class="postPage"><div class="sectionLabel"><time datetime="2026-11-28">Updated November 28, 2026</time></div><h1>Checked guide</h1><p class="toolIntro">A useful guide.</p><figure class="articleHero"><img src="/uploads/cover.png" alt="Cover description"></figure><p>Actual article text.</p><figure class="postFigure postUploadedImage"><img src="/uploads/chart.png" alt="Measured chart"><figcaption>Actual output bytes.</figcaption></figure><script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.date, dateModified: post.updated, mainEntityOfPage: origin + article.route, image: origin + article.image.src })}</script></article></main></body></html>`
  }
  it('accepts one visible update while retaining the earlier publication metadata', () => { expect(inspectPageHtml(article, markup()).passed).toBe(true) })
  it('finds a false new publication date and a stale modification date separately', () => {
    const stale = change(markup(), 'script', element => { const value = JSON.parse(element.textContent!); value.datePublished = '2026-11-28'; value.dateModified = '2026-09-04'; element.textContent = JSON.stringify(value) })
    const fields = inspectPageHtml(article, stale).mismatches.map((value: { field: string }) => value.field)
    expect(fields).toContain('schema.datePublished')
    expect(fields).toContain('schema.dateModified')
  })
  it('finds wrong alt text, missing image and incorrect caption', () => {
    expect(inspectPageHtml(article, change(markup(), '.articleHero img', element => element.setAttribute('alt', 'Old cover'))).mismatches).toContainEqual(expect.objectContaining({ field: 'featuredImage.alt' }))
    expect(inspectPageHtml(article, change(markup(), '.postUploadedImage img', element => element.remove())).mismatches).toContainEqual(expect.objectContaining({ field: 'body[1].src' }))
    expect(inspectPageHtml(article, change(markup(), 'figcaption', element => { element.textContent = 'Old measurements.' })).mismatches).toContainEqual(expect.objectContaining({ field: 'body[1].caption' }))
  })
  it('finds an old visible Published label and a duplicate visible creation date', () => {
    expect(inspectPageHtml(article, markup().replace('Updated November', 'Published November')).mismatches).toContainEqual(expect.objectContaining({ field: 'updated.visible' }))
    expect(inspectPageHtml(article, change(markup(), '.sectionLabel', element => element.insertAdjacentHTML('beforeend', '<time datetime="2026-09-04">Published September 4, 2026</time>'))).mismatches).toContainEqual(expect.objectContaining({ field: 'publicationDate.notDuplicated' }))
  })
})
