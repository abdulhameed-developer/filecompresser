import { JSDOM } from 'jsdom'

export const normalizeText = value => String(value ?? '').replace(/\s+/gu, ' ').trim()
const ignored = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'])
const blockTags = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'SECTION', 'FIGCAPTION', 'BLOCKQUOTE', 'BR'])

export function effectiveHomeFields(home, fallbackHero, fallbackSteps) {
  const blank = value => value === undefined || value === null || typeof value === 'string' && !value.trim() || typeof value === 'object' && Object.values(value).every(blank)
  return { hero: blank(home.hero) ? fallbackHero : home.hero, steps: home.steps ?? fallbackSteps }
}

/** Read real DOM text, never Next's serialized script payload. */
export function domText(node) {
  if (!node) return ''
  if (node.nodeType === 3) return node.nodeValue ?? ''
  if (ignored.has(node.nodeName)) return ''
  const inner = [...node.childNodes].map(domText).join('')
  return blockTags.has(node.nodeName) ? ` ${inner} ` : inner
}

/** Independent Markdown-link reader, not the production parser/renderer. */
export function inlineFragment(document, value) {
  const result = document.createDocumentFragment()
  let start = 0
  const pattern = /\[([^\]\n]+)\]\(/g
  let match
  while ((match = pattern.exec(value))) {
    let depth = 1
    let cursor = pattern.lastIndex
    for (; cursor < value.length && depth; cursor++) {
      if (value[cursor] === '(') depth++
      else if (value[cursor] === ')') depth--
    }
    if (depth) continue
    result.append(document.createTextNode(value.slice(start, match.index)))
    const anchor = document.createElement('a')
    anchor.setAttribute('href', value.slice(pattern.lastIndex, cursor - 1))
    anchor.textContent = match[1]
    result.append(anchor)
    start = cursor
    pattern.lastIndex = cursor
  }
  result.append(document.createTextNode(value.slice(start)))
  return result
}

export function expectedInline(value) {
  const dom = new JSDOM('<div></div>')
  const root = dom.window.document.querySelector('div')
  root.append(inlineFragment(dom.window.document, value))
  const result = { text: normalizeText(domText(root)), links: linksIn(root) }
  dom.window.close()
  return result
}

/** Model supported body semantics with a separate browser HTML parser. */
export function expectedBody(value, { html = false, literal = false } = {}) {
  const dom = new JSDOM('<div></div>')
  const document = dom.window.document
  const root = document.querySelector('div')
  if (html) {
    root.innerHTML = value
    const walker = document.createTreeWalker(root, dom.window.NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    for (const node of nodes) if (!node.parentElement.closest('a,code')) node.replaceWith(inlineFragment(document, node.nodeValue ?? ''))
  } else if (literal) {
    const paragraph = document.createElement('p')
    paragraph.append(inlineFragment(document, value))
    root.append(paragraph)
  } else {
    let paragraph
    let list
    let lastType
    const flush = () => { paragraph = undefined; list = undefined; lastType = undefined }
    for (const line of value.split('\n')) {
      if (!line.trim()) { flush(); continue }
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
      const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
      if (bullet || numbered) {
        paragraph = undefined
        const type = bullet ? 'ul' : 'ol'
        if (!list || lastType !== type) { list = document.createElement(type); root.append(list) }
        const item = document.createElement('li')
        item.append(inlineFragment(document, (bullet ?? numbered)[1]))
        list.append(item)
        lastType = type
      } else {
        list = undefined
        lastType = undefined
        if (!paragraph) { paragraph = document.createElement('p'); root.append(paragraph) }
        if (paragraph.childNodes.length) paragraph.append(document.createElement('br'))
        paragraph.append(inlineFragment(document, line))
      }
    }
  }
  const result = signature(root)
  dom.window.close()
  return result
}

export function linksIn(root) {
  return [...root.querySelectorAll('a[href]')].map(anchor => ({ text: normalizeText(domText(anchor)), href: anchor.getAttribute('href') }))
}

export function signature(root) {
  const lists = [...root.querySelectorAll('ul,ol')].map(list => ({ type: list.localName, items: [...list.children].filter(item => item.localName === 'li').map(item => normalizeText(domText(item))) }))
  return {
    text: normalizeText(domText(root)),
    paragraphs: [...root.querySelectorAll('p')].map(paragraph => normalizeText(domText(paragraph))),
    lists,
    links: linksIn(root),
    formatting: [...root.querySelectorAll('strong,em,b,i,code,blockquote')].map(element => ({ tag: element.localName, text: normalizeText(domText(element)) })),
  }
}

function allJsonLd(document) {
  const nodes = []
  const visit = value => {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (value && typeof value === 'object') { if (value['@type']) nodes.push(value); for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child) }
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) visit(JSON.parse(script.textContent))
  return nodes
}

/** Read indexing/follow rules without treating max-image-preview:none as none.
 * Header user-agent scopes continue until another explicit user-agent prefix.
 * https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
 */
export function robotsRules(value, { header = false, userAgent = '' } = {}) {
  const rules = new Set()
  const parameterRules = new Set(['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after'])
  let scope = ''
  for (let token of String(value ?? '').toLowerCase().split(',')) {
    token = token.trim()
    const prefix = token.match(/^([a-z0-9_*.-]+)\s*:\s*(.*)$/)
    if (prefix && !parameterRules.has(prefix[1])) {
      if (!header) continue
      scope = prefix[1]
      token = prefix[2]
    }
    if (scope && scope !== '*' && scope !== userAgent) continue
    // Parameter values (including dates and the word none) are not directives.
    if (/^[a-z_-]+\s*:/.test(token)) continue
    for (const directive of token.split(/\s+/)) if (['all', 'none', 'index', 'noindex', 'follow', 'nofollow'].includes(directive)) rules.add(directive)
  }
  return rules
}

const restricted = (rules, negative) => rules.has(negative) || rules.has('none')

export function inspectPageHtml(page, html, { origin = 'https://filecompresser.com', status = 200, indexable = true, follow = true, xRobotsTag = '' } = {}) {
  const dom = new JSDOM(html, { url: `${origin}${page.route}` })
  const document = dom.window.document
  const checks = []
  const check = (field, expected, actual, kind = 'content') => {
    const passed = JSON.stringify(expected) === JSON.stringify(actual)
    checks.push({ record: page.record, field, kind, expected, actual, passed })
  }
  const one = (field, selector) => {
    const elements = [...document.querySelectorAll(selector)]
    check(`${field}.elementCount`, 1, elements.length, 'structure')
    return elements[0]
  }
  const text = (field, selector, expected) => {
    const element = one(field, selector)
    check(field, normalizeText(expected), element ? normalizeText(domText(element)) : null)
  }
  const body = (field, element, expected) => {
    if (!element) { check(field, expected, null); return }
    const actual = signature(element)
    for (const key of ['text', 'paragraphs', 'lists', 'links', 'formatting']) check(`${field}.${key}`, expected[key], actual[key])
  }
  const link = (field, selector, expected) => {
    const scope = one(field, selector)
    check(field, expected, scope ? linksIn(scope) : null, 'links')
  }
  check('http.status', 200, status, 'delivery')
  text('seoTitle', 'title', page.title)
  check('seoDescription.elementCount', 1, document.querySelectorAll('meta[name="description"]').length, 'metadata')
  check('seoDescription', page.description, document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null, 'metadata')
  check('canonical.elementCount', 1, document.querySelectorAll('link[rel="canonical"]').length, 'metadata')
  check('canonical', `${origin}${(page.canonical ?? page.route) === '/' ? '' : page.canonical ?? page.route}`, document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null, 'metadata')
  const mainRobotsMeta = [...document.querySelectorAll('meta[name]')].filter(meta => meta.getAttribute('name')?.toLowerCase() === 'robots')
  const robots = mainRobotsMeta.map(meta => meta.getAttribute('content') ?? '').join(',')
  const mainRules = robotsRules(robots)
  check('robots.elementCount', 1, mainRobotsMeta.length, 'metadata')
  const directive = (yes, no) => {
    const positive = mainRules.has(yes) || mainRules.has('all')
    const negative = restricted(mainRules, no)
    return positive && negative ? 'CONFLICT' : positive ? true : negative ? false : null
  }
  check('robots.indexable', indexable, directive('index', 'noindex'), 'metadata')
  check('robots.follow', follow, directive('follow', 'nofollow'), 'metadata')
  // More restrictive HTTP/crawler-specific rules cannot be overridden by the
  // ordinary meta tag. CI can still intentionally expect noindex, follow.
  for (const agent of ['', 'googlebot', 'bingbot']) {
    const headerRules = robotsRules(xRobotsTag, { header: true, userAgent: agent })
    const scopedMeta = agent ? [...document.querySelectorAll('meta[name]')].filter(meta => meta.getAttribute('name')?.toLowerCase() === agent).map(meta => meta.getAttribute('content') ?? '') : []
    const applicable = [mainRules, headerRules, ...scopedMeta.map(value => robotsRules(value))]
    check(`robots.effective.${agent || 'general'}.indexable`, indexable, !applicable.some(rules => restricted(rules, 'noindex')), 'metadata')
    check(`robots.effective.${agent || 'general'}.follow`, follow, !applicable.some(rules => restricted(rules, 'nofollow')), 'metadata')
  }
  if (page.social) for (const [attribute, expected] of Object.entries(page.social)) check(`metadata.${attribute}`, expected, document.querySelector(`meta[${attribute.startsWith('og:') ? 'property' : 'name'}="${attribute}"]`)?.getAttribute('content') ?? null, 'metadata')
  text('title', 'main h1', page.heading)
  let jsonLd = []
  try { jsonLd = allJsonLd(document) } catch (error) { check('jsonLd.valid', true, error.message, 'schema') }
  check('jsonLd.present', true, jsonLd.length > 0, 'schema')
  const typed = type => jsonLd.filter(value => [value['@type']].flat().includes(type))
  if (page.editorial) {
    const editorial = page.editorial
    text('heading', '.editorialContent > h2', editorial.heading)
    const intro = one('introduction', '.editorialContent > p')
    check('introduction', expectedInline(editorial.introduction), intro ? { text: normalizeText(domText(intro)), links: linksIn(intro) } : null)
    check('sections.count', editorial.sections.length, document.querySelectorAll('.editorialContent > section').length, 'structure')
    editorial.sections.forEach((section, index) => {
      text(`sections[${index}].heading`, `#editorial-section-${index}`, section.heading)
      const actualSection = document.querySelector(`#editorial-section-${index}`)?.closest('section')
      if (actualSection) {
        const wrapper = document.createElement('div')
        for (const item of actualSection.querySelectorAll(':scope > .editorialParagraph')) wrapper.append(item.cloneNode(true))
        body(`sections[${index}].body`, wrapper, expectedBody(section.body, { html: /<\/?[a-z!]/i.test(section.body) }))
      } else body(`sections[${index}].body`, null, expectedBody(section.body, { html: /<\/?[a-z!]/i.test(section.body) }))
    })
    if (editorial.links?.length) link('links', '.editorialContent nav[aria-label="Further guidance"]', editorial.links.map(entry => ({ text: entry.label, href: entry.href })))
    else check('links.count', 0, document.querySelectorAll('.editorialContent nav[aria-label="Further guidance"] a').length, 'links')
    const details = [...document.querySelectorAll('.faq details,.homeFaq details')]
    check('faq.count', page.faq.length, details.length)
    page.faq.forEach((entry, index) => {
      check(`faq[${index}].q`, normalizeText(entry.q), details[index] ? normalizeText(domText(details[index].querySelector('summary'))) : null)
      const answer = details[index]?.querySelector('p')
      check(`faq[${index}].a`, expectedInline(entry.a), answer ? { text: normalizeText(domText(answer)), links: linksIn(answer) } : null)
    })
    const faqSchemas = typed('FAQPage')
    check('faq.schemaCount', page.faq.length ? 1 : 0, faqSchemas.length, 'schema')
    if (page.faq.length) check('faq.schema', page.faq.map(entry => ({ q: normalizeText(entry.q), a: expectedInline(entry.a).text })), faqSchemas[0]?.mainEntity?.map(entry => ({ q: normalizeText(entry.name), a: normalizeText(entry.acceptedAnswer?.text) })) ?? null, 'schema')
  }
  if (page.hero) {
    text('hero.description', '.hero > p', page.hero.description)
    const steps = [...document.querySelectorAll('.processingStory .storyCopy ol > li')]
    check('steps.count', page.steps.length, steps.length)
    page.steps.forEach((step, index) => {
      check(`steps[${index}].title`, normalizeText(step.title), steps[index] ? normalizeText(domText(steps[index].querySelector('strong'))) : null)
      check(`steps[${index}].description`, normalizeText(step.description), steps[index] ? normalizeText(domText(steps[index].querySelector('small'))) : null)
    })
  }
  if (page.tool) {
    text('registry.description', '.toolIntro', page.tool.description)
    check('tool.schema', { name: page.tool.title, description: page.tool.description, url: `${origin}/${page.tool.slug}` }, typed('WebApplication')[0] ? { name: typed('WebApplication')[0].name, description: typed('WebApplication')[0].description, url: typed('WebApplication')[0].url } : null, 'schema')
    if (page.relatedTools) link('relatedTools', '.relatedTools', page.relatedTools.map(tool => ({ text: tool.title, href: `/${tool.slug}` })))
  }
  if (page.managed) {
    const value = page.managed
    const root = document.querySelector('main > div')
    if (value.introduction) text('introduction', page.kind === 'legal' ? '.legal > h1 + p:not(.legalUpdated),.legal > .legalUpdated + p' : '.productIntro > p,.blogPage > .toolIntro', value.introduction)
    if (value.label) text('label', page.kind === 'blog' ? '.blogPage > .sectionLabel' : '.productIntro > .sectionLabel', value.label)
    if (value.introCta?.label) link('introCta', '.productIntro', [{ text: value.introCta.label, href: value.introCta.href }])
    const ordered = ['about', 'contact'].includes(page.kind) ? ['card', 'detail', 'text'].flatMap(placement => value.sections.filter(section => (section.placement ?? 'text') === placement)) : value.sections
    const actualSections = root ? [...root.querySelectorAll('section')].filter(section => section.querySelector(':scope > h2,:scope > div > h2') && !section.classList.contains('processingStory') && !section.closest('.processingStory') && !section.querySelector('#support-contact-heading')) : []
    check('sections.count', ordered.length, actualSections.length, 'structure')
    ordered.forEach((section, index) => {
      const actual = actualSections[index]
      check(`sections[${value.sections.indexOf(section)}].heading`, normalizeText(section.heading), actual ? normalizeText(domText(actual.querySelector('h2'))) : null)
      if (section.label) check(`sections[${value.sections.indexOf(section)}].label`, normalizeText(section.label), actual ? normalizeText(domText(actual.querySelector('.sectionLabel'))) : null)
      const paragraphs = actual ? [...actual.querySelectorAll('p')].filter(paragraph => {
        if (!section.links?.length) return true
        const expectedLinks = section.links.map(entry => ({ text: entry.label, href: entry.href }))
        if (JSON.stringify(linksIn(paragraph)) !== JSON.stringify(expectedLinks)) return true
        const copy = paragraph.cloneNode(true)
        copy.querySelectorAll('a').forEach(anchor => anchor.remove())
        return !/^[\s·.]*$/.test(domText(copy))
      }) : []
      check(`sections[${value.sections.indexOf(section)}].body`, (section.body ?? []).map(expectedInline), paragraphs.map(paragraph => ({ text: normalizeText(domText(paragraph)), links: linksIn(paragraph) })))
      check(`sections[${value.sections.indexOf(section)}].items`, (section.items ?? []).map(expectedInline), actual ? [...actual.querySelectorAll('ul > li')].map(item => ({ text: normalizeText(domText(item)), links: linksIn(item) })) : null)
      const bodyLinks = (section.body ?? []).flatMap(item => expectedInline(item).links)
      const itemLinks = (section.items ?? []).flatMap(item => expectedInline(item).links)
      check(`sections[${value.sections.indexOf(section)}].links`, [...bodyLinks, ...itemLinks, ...(section.links ?? []).map(entry => ({ text: entry.label, href: entry.href }))], actual ? linksIn(actual) : null, 'links')
    })
    if (value.support?.link?.label) {
      text('support.text', '.supportStrip > p', `${value.support.text} ${value.support.emphasis}`)
      link('support.link', '.supportStrip', [{ text: value.support.link.label, href: value.support.link.href }])
    }
    if (value.footer?.heading) {
      const heading = root && [...root.querySelectorAll(':scope > h2')].find(element => normalizeText(domText(element)) === normalizeText(value.footer.heading))
      check('footer.heading', normalizeText(value.footer.heading), heading ? normalizeText(domText(heading)) : null)
      const paragraph = heading?.nextElementSibling
      check('footer.introduction', normalizeText(`${value.footer.introduction} ${value.footer.link.label}.`), paragraph ? normalizeText(domText(paragraph)) : null)
      check('footer.link', [{ text: value.footer.link.label, href: value.footer.link.href }], paragraph ? linksIn(paragraph) : null, 'links')
    }
    if (value.updated && page.kind !== 'blog') check('updated.schema', value.updated, typed('WebPage')[0]?.dateModified ?? null, 'schema')
    if (page.kind === 'legal' && value.updated) text('updated.visible', '.legalUpdated', `Last updated: ${new Date(`${value.updated}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`)
  }
  if (page.post) {
    const post = page.post
    text('description', '.postPage > .toolIntro', post.description)
    const time = one('updated', '.postPage > .sectionLabel > time')
    check('updated.datetime', post.updated ?? post.date, time?.getAttribute('datetime') ?? null)
    check('updated.visible', `Updated ${new Date(`${post.updated ?? post.date}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, time ? normalizeText(domText(time)) : null)
    const schema = typed('BlogPosting')[0]
    for (const [field, expected] of Object.entries({ headline: post.title, description: post.description, datePublished: post.date, dateModified: post.updated ?? post.date, mainEntityOfPage: `${origin}${page.route}`, image: `${origin}${page.image.src}` })) check(`schema.${field}`, expected, schema?.[field] ?? null, 'schema')
    check('metadata.publishedTime', post.date, document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ?? null, 'metadata')
    check('metadata.modifiedTime', post.updated ?? post.date, document.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') ?? null, 'metadata')
    const hero = one('featuredImage', '.articleHero img')
    check('featuredImage.src', page.image.src, hero?.getAttribute('src') ?? null, 'images')
    check('featuredImage.alt', page.image.alt, hero?.getAttribute('alt') ?? null, 'images')
    if (page.image.caption) text('featuredImage.caption', '.articleHero figcaption', page.image.caption)
    const article = document.querySelector('.postPage')
    const elements = article ? [...article.children].filter(element => element.matches('h2[id^="section-"],h3[id^="section-"],p:not(.toolIntro):not(.postFooter),ul:not(.postTags),ol,aside.postCallout,figure.postFigure,div.postTableWrap,div:not([class])')) : []
    check('body.blockCount', post.body.length, elements.length, 'structure')
    post.body.forEach((block, index) => {
      const type = block._template ?? block.type
      const actual = elements[index]
      check(`body[${index}].type`, type, actual ? actual.matches('aside') ? 'callout' : actual.matches('figure.postUploadedImage') ? 'image' : actual.matches('figure') ? 'figure' : actual.matches('.postTableWrap') ? 'table' : actual.matches('.postLink') ? 'link' : actual.matches('div') ? 'html' : actual.localName : null)
      if (['p', 'h2', 'h3'].includes(type)) {
        check(`body[${index}].text`, expectedInline(block.text), actual ? { text: normalizeText(domText(actual)), links: linksIn(actual) } : null)
      } else if (['ul', 'ol'].includes(type)) check(`body[${index}].items`, block.items.map(expectedInline), actual ? [...actual.children].map(item => ({ text: normalizeText(domText(item)), links: linksIn(item) })) : null)
      else if (type === 'html') body(`body[${index}].html`, actual, expectedBody(block.html, { html: true }))
      else if (type === 'link') check(`body[${index}].link`, [{ text: block.text, href: block.href }], actual ? linksIn(actual) : null)
      else if (type === 'callout') {
        check(`body[${index}].title`, normalizeText(block.title), actual ? normalizeText(domText(actual.querySelector('strong'))) : null)
        const paragraph = actual?.querySelector('p')
        check(`body[${index}].text`, expectedInline(block.text), paragraph ? { text: normalizeText(domText(paragraph)), links: linksIn(paragraph) } : null)
      } else if (type === 'image') {
        check(`body[${index}].src`, block.src.split('/').map(encodeURIComponent).join('/'), actual?.querySelector('img')?.getAttribute('src') ?? null, 'images')
        check(`body[${index}].alt`, block.alt, actual?.querySelector('img')?.getAttribute('alt') ?? null, 'images')
        if (block.caption) check(`body[${index}].caption`, normalizeText(block.caption), actual ? normalizeText(domText(actual.querySelector('figcaption'))) : null)
      } else if (type === 'figure') {
        check(`body[${index}].figure`, `fig-${block.figure}`, actual?.querySelector('[id^="fig-"]')?.id ?? null, 'images')
        check(`body[${index}].caption`, normalizeText(block.caption), actual ? normalizeText(domText(actual.querySelector('figcaption'))) : null)
      } else if (type === 'table') {
        check(`body[${index}].columns`, block.columns.map(normalizeText), actual ? [...actual.querySelectorAll('thead th')].map(element => normalizeText(domText(element))) : null)
        check(`body[${index}].rows`, block.rows.map(row => row.cells.map(expectedInline)), actual ? [...actual.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => ({ text: normalizeText(domText(cell)), links: linksIn(cell) }))) : null)
        if (block.caption) check(`body[${index}].caption`, normalizeText(block.caption), actual ? normalizeText(domText(actual.querySelector('caption'))) : null)
      }
    })
    if (post.references?.length) link('references', '.articleReferences', post.references.map(reference => ({ text: reference.title, href: reference.url })))
    if (post.tags?.length) check('tags', post.tags, [...document.querySelectorAll('.postTags li')].map(element => normalizeText(domText(element))))
    const visibleDates = [...document.querySelectorAll('.postPage > .sectionLabel time')]
    check('publicationDate.notDuplicated', 1, visibleDates.length, 'dates')
    if (page.relatedPosts) {
      const cards = [...document.querySelectorAll('.postRelated > ul > li > a')]
      check('relatedPosts.order', page.relatedPosts.map(post => `/blog/${post.slug}`), cards.map(card => card.getAttribute('href')), 'discovery')
      page.relatedPosts.forEach((post, index) => {
        const date = post.updated ?? post.date
        const time = cards[index]?.querySelector('time')
        check(`relatedPosts.${post.slug}.updated.datetime`, date, time?.getAttribute('datetime') ?? null, 'dates')
        check(`relatedPosts.${post.slug}.updated.visible`, `Updated ${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, time ? normalizeText(domText(time)) : null, 'dates')
        const copy = cards[index]?.cloneNode(true)
        copy?.querySelector('small')?.remove()
        check(`relatedPosts.${post.slug}.title`, normalizeText(post.title), copy ? normalizeText(domText(copy)) : null)
      })
    }
  }
  if (page.cards) {
    check('cards.order', page.cards.map(card => `/blog/${card.slug}`), [...document.querySelectorAll(page.kind === 'blog' ? '.postCardLink' : '.editorialCard')].map(anchor => anchor.getAttribute('href')), 'discovery')
    if (page.kind === 'blog') check('cards.schema', page.cards.map(card => ({ headline: card.title, url: `${origin}/blog/${card.slug}`, datePublished: card.date, dateModified: card.updated ?? card.date })), (typed('Blog')[0]?.blogPost ?? []).map(card => ({ headline: card.headline, url: card.url, datePublished: card.datePublished, dateModified: card.dateModified })), 'schema')
    for (const card of page.cards) {
    const candidates = [...document.querySelectorAll(page.kind === 'blog' ? '.postCardLink' : '.editorialCard')].filter(anchor => anchor.getAttribute('href') === `/blog/${card.slug}`)
    check(`cards.${card.slug}.count`, 1, candidates.length, 'discovery')
    const cardElement = candidates[0]
    check(`cards.${card.slug}.title`, normalizeText(card.title), cardElement ? normalizeText(domText(cardElement.querySelector('h2,h3'))) : null)
    const date = card.updated ?? card.date
    check(`cards.${card.slug}.updated.datetime`, date, cardElement?.querySelector('time')?.getAttribute('datetime') ?? null, 'dates')
    check(`cards.${card.slug}.updated.visible`, `Updated ${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, cardElement ? normalizeText(domText(cardElement.querySelector('time'))) : null, 'dates')
    if (page.kind === 'blog') check(`cards.${card.slug}.description`, normalizeText(card.description), cardElement ? normalizeText(domText(cardElement.querySelector('p'))) : null)
    if (card.image) {
      check(`cards.${card.slug}.image.src`, card.image.src, cardElement?.querySelector('img')?.getAttribute('src') ?? null, 'images')
      check(`cards.${card.slug}.image.alt`, card.image.alt, cardElement?.querySelector('img')?.getAttribute('alt') ?? null, 'images')
    }
    }
  }
  if (page.sitemapLinks) for (const entry of page.sitemapLinks) {
    const matches = [...document.querySelectorAll('.siteMapGrid a[href]')].filter(anchor => anchor.getAttribute('href') === entry.href)
    check(`sitemap.links.${entry.href}`, [{ text: normalizeText(entry.label), href: entry.href }], matches.map(anchor => ({ text: normalizeText(domText(anchor)), href: anchor.getAttribute('href') })), 'discovery')
  }
  if (page.settings?.supportEmail) {
    const encoded = document.querySelector('footer a[data-cfemail]')
    const footerLinks = [...document.querySelectorAll('footer a')]
    // Cloudflare may encode a mailbox; report that separately rather than
    // treating an obfuscated string as the literal address.
    const emailLink = footerLinks.find(anchor => anchor.getAttribute('href') === `mailto:${page.settings.supportEmail}`)
    check('settings.supportEmail', true, Boolean(emailLink) || Boolean(encoded && page.allowCloudflareEmailTransform), 'shared')
  }
  if (page.settings) {
    check('settings.wordmark', page.settings.wordmark, document.querySelector('meta[name="application-name"]')?.getAttribute('content') ?? null, 'shared')
    check('settings.organizationName', page.settings.organizationName, document.querySelector('meta[name="publisher"]')?.getAttribute('content') ?? null, 'shared')
    check('settings.siteName', page.settings.siteName, document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? null, 'shared')
    const toolLinks = [...document.querySelectorAll('.siteFooter .footerCol a[href]')].map(anchor => ({ text: normalizeText(domText(anchor)), href: anchor.getAttribute('href') }))
    if (page.footerTools) for (const tool of page.footerTools) check(`footer.tool.${tool.slug}`, [{ text: tool.title, href: `/${tool.slug}` }], toolLinks.filter(link => link.href === `/${tool.slug}`), 'shared')
    if (page.kind === 'home') {
      const organization = typed('Organization')[0]
      check('settings.organization.schemaName', page.settings.organizationName, organization?.name ?? null, 'schema')
      check('settings.organization.sameAs', page.settings.sameAs ?? [], organization?.sameAs ?? [], 'schema')
      if (page.settings.supportEmail) check('settings.organization.supportEmail', page.settings.supportEmail, organization?.contactPoint?.email ?? null, 'schema')
      check('settings.defaultDescription', page.settings.defaultDescription, typed('WebSite')[0]?.description ?? null, 'schema')
    }
  }
  for (const draft of page.drafts ?? []) {
    check(`draft.${draft.slug}.linkAbsent`, 0, [...document.querySelectorAll('a[href]')].filter(anchor => anchor.getAttribute('href')?.split(/[?#]/)[0] === `/blog/${draft.slug}`).length, 'draft')
    check(`draft.${draft.slug}.schemaAbsent`, false, jsonLd.some(node => [node.url, node.mainEntityOfPage].includes(`${origin}/blog/${draft.slug}`)), 'draft')
  }
  const result = { route: page.route, record: page.record, passed: checks.every(check => check.passed), checkCount: checks.length, mismatches: checks.filter(check => !check.passed), checks, delivery: { xRobotsTag } }
  dom.window.close()
  return result
}
