/** A deliberately small HTML grammar shared by Tina and the public reader.
 * Nodes are rendered by React, never injected as raw HTML.
 * @typedef {string | { tag: string, href?: string, children: EditorialNode[] }} EditorialNode
 * @typedef {string | { label: string, href: string, source: string }} EditorialInlinePart
 */
const inline = new Set(['a', 'strong', 'em', 'b', 'i', 'code', 'br'])
const allowed = new Set([...inline, 'p', 'ul', 'ol', 'li', 'blockquote'])

/** @param {string} value */
function entities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()] ?? entity
    const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd'
  })
}

/** @param {string} value */
function normalizedLink(value) {
  const href = entities(value)
  if (/[\\\u0000-\u0020\u007f]/.test(href)) throw new Error('Links cannot contain raw spaces, controls or backslashes. Encode URL spaces as %20.')
  let decoded
  try { decoded = decodeURIComponent(href) } catch { throw new Error('Invalid URL encoding.') }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded)) throw new Error('Links cannot contain controls or backslashes.')
  return { href, decoded }
}

/** @param {string} value */
export function safeEditorialHref(value) {
  const { href, decoded } = normalizedLink(value)
  if ((href.startsWith('/') && !decoded.startsWith('//')) || /^#[a-z0-9_-]+$/i.test(href)) return href
  try {
    const url = new URL(href)
    if (url.protocol === 'https:' && !url.username && !url.password) return href
  } catch { /* Explain the supported formats below. */ }
  throw new Error('Use a site path, section anchor or HTTPS address without credentials.')
}

/** References retain the existing HTTP(S)-only policy.
 * @param {string} value
 */
export function safeReferenceHref(value) {
  const { href } = normalizedLink(value)
  try {
    const url = new URL(href)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return href
  } catch { /* Explain the accepted reference formats below. */ }
  throw new Error('Reference links must be HTTP(S) URLs without credentials.')
}

/** The dedicated URL fields and build reader use the same address boundary.
 * @param {{required?: boolean, reference?: boolean}} [options]
 */
export function editorialUrlFieldValidator({ required = true, reference = false } = {}) {
  return value => {
    if ((value === undefined || value === null || value === '') && !required) return
    if (typeof value !== 'string' || !value.trim()) return 'Enter a link address.'
    try { (reference ? safeReferenceHref : safeEditorialHref)(value) }
    catch (error) { return error instanceof Error ? error.message : 'Invalid link address.' }
  }
}

/** @param {string} value */
export function hasEditorialHtml(value) { return /<\/?[a-z!]/i.test(value) }

/** @param {string} value @returns {EditorialNode[]} */
export function parseEditorialHtml(value) {
  if (value.length > 50_000) throw new Error('HTML sections must be under 50,000 characters.')
  if (/<\/?[a-z!][^>]*$/i.test(value)) throw new Error('Complete every HTML tag with a closing > character.')
  /** @type {EditorialNode[]} */
  const root = []
  const stack = [{ tag: '', children: root }]
  let count = 0
  for (const token of value.match(/<[^>]*>|[^<]+|</g) ?? []) {
    if (!token.startsWith('<') || token === '<') {
      if (['ul', 'ol'].includes(stack.at(-1).tag) && token.trim()) throw new Error('Put list text inside <li> tags.')
      stack.at(-1).children.push(entities(token))
      continue
    }
    const match = token.match(/^<(\/)?([a-z][a-z0-9]*)([^>]*)>$/i)
    if (!match || !allowed.has(match[2].toLowerCase())) throw new Error('Supported HTML: p, br, strong, em, b, i, code, a, ul, ol, li and blockquote.')
    const tag = match[2].toLowerCase()
    const attrs = match[3].trim()
    if (match[1]) {
      if (attrs || stack.length === 1 || stack.at(-1).tag !== tag) throw new Error('Close HTML tags in the order they were opened.')
      stack.pop()
      continue
    }
    if (++count > 1_000 || stack.length > 12) throw new Error('This HTML section has too many elements or nested tags.')
    const parent = stack.at(-1).tag
    if ((inline.has(parent) || parent === 'p') && !inline.has(tag)) throw new Error('Keep paragraphs and inline formatting separate from lists and blockquotes.')
    if (['ul', 'ol'].includes(parent) && tag !== 'li') throw new Error('Lists may contain only <li> elements.')
    if (tag === 'li' && !['ul', 'ol'].includes(parent)) throw new Error('Place <li> elements inside <ul> or <ol>.')
    if (tag === 'a' && stack.some(node => node.tag === 'a')) throw new Error('Links cannot be nested.')
    let href
    if (tag === 'a') {
      const attribute = attrs.match(/^href\s*=\s*(?:"([^"]*)"|'([^']*)')$/i)
      if (!attribute) throw new Error('Links need exactly one quoted href attribute. Other HTML attributes are not supported.')
      href = safeEditorialHref(attribute[1] ?? attribute[2])
    } else if (attrs && !(tag === 'br' && attrs === '/')) throw new Error('HTML attributes, styles, scripts and embeds are not supported.')
    /** @type {{tag: string, href?: string, children: EditorialNode[]}} */
    const node = { tag, ...(href ? { href } : {}), children: [] }
    stack.at(-1).children.push(node)
    if (tag !== 'br') stack.push(node)
  }
  if (stack.length !== 1) throw new Error('Close every HTML tag before saving.')
  const validateText = nodes => {
    for (const node of nodes) {
      if (typeof node === 'string') validateInlineLinks(node)
      else if (node.tag !== 'a' && node.tag !== 'code') validateText(node.children)
    }
  }
  validateText(root)
  return root
}

/** Basic inline links, not a full Markdown parser. Labels are plain text;
 * destinations support balanced parentheses (up to 16 levels / 4,096 chars).
 * A malformed or over-limit candidate stays literal. Failed URL scans advance
 * past the scanned input so repeated unclosed links cannot cause rescanning.
 * @param {string} value @returns {EditorialInlinePart[]}
 */
export function splitEditorialLinks(value) {
  /** @type {EditorialInlinePart[]} */
  const parts = []
  let textStart = 0
  let index = 0
  while (index < value.length) {
    if (value[index] !== '[') { index++; continue }
    let labelEnd = -1
    for (let cursor = index + 1; cursor < value.length && cursor <= index + 121; cursor++) {
      if (value[cursor] === '\n' || value[cursor] === '\r') break
      if (value[cursor] === ']') { labelEnd = cursor; break }
    }
    if (labelEnd <= index + 1 || value[labelEnd + 1] !== '(') { index++; continue }
    const urlStart = labelEnd + 2
    let cursor = urlStart
    let depth = 0
    let close = -1
    for (; cursor < value.length && cursor - urlStart <= 4096; cursor++) {
      const character = value[cursor]
      if (character === '\n' || character === '\r') break
      if (character === '(') { if (++depth > 16) break }
      else if (character === ')') {
        if (depth === 0) { close = cursor; break }
        depth--
      }
    }
    if (close === -1) { index = Math.max(index + 1, cursor); continue }
    if (index > textStart) parts.push(value.slice(textStart, index))
    parts.push({ label: value.slice(index + 1, labelEnd), href: value.slice(urlStart, close), source: value.slice(index, close + 1) })
    index = close + 1
    textStart = index
  }
  if (textStart < value.length || parts.length === 0) parts.push(value.slice(textStart))
  return parts
}

/** @param {string} value */
export function validateInlineLinks(value) {
  for (const part of splitEditorialLinks(value)) if (typeof part !== 'string') safeEditorialHref(part.href)
}

/**
 * One validation boundary for build-time content and editor field callbacks.
 * HTML blocks validate their HTML grammar; Markdown-looking text inside HTML
 * links/code stays literal, matching the renderer.
 * @param {unknown} value
 * @param {{allowHtml?: boolean, htmlOnly?: boolean, literalHtml?: boolean, required?: boolean}} [options]
 */
export function validateEditorialValue(value, options = {}) {
  const { allowHtml = false, htmlOnly = false, literalHtml = false, required = true } = options
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('Enter non-empty content.')
    return
  }
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter non-empty content.')
  if (htmlOnly || hasEditorialHtml(value) && allowHtml) {
    parseEditorialHtml(value)
    return
  }
  if (hasEditorialHtml(value) && !literalHtml) throw new Error('Use plain text or Markdown links here. Use a section body or Safe HTML article block for HTML.')
  validateInlineLinks(value)
}

/** @param {Parameters<typeof validateEditorialValue>[1]} [options] */
export function editorialFieldValidator(options = {}) {
  return value => {
    try { validateEditorialValue(value, options) }
    catch (error) { return error instanceof Error ? error.message : 'Invalid editorial content.' }
  }
}
