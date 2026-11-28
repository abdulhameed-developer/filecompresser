import { splitEditorialLinks } from './editorial-markup.mjs'

/** Owner-supplied editorial policy. Paths, identifiers and dates are not prose. */
export const PROHIBITED_EDITORIAL_TERMS = Object.freeze([
  'delve', 'crucial', 'pivotal', 'furthermore', 'moreover', 'additionally',
  'comprehensive', 'seamless', 'robust', 'leverage', 'enhance', 'utilize',
  'underscore', 'foster', 'landscape', 'intricate', 'testament', 'multifaceted',
  'valuable', 'transformative', 'game-changer', 'navigate', 'ever-evolving',
  "in today's world", 'plays a vital role', "it's worth noting",
])

export const NON_EDITORIAL_KEYS = new Set([
  '_template', '@context', '@type', '@id', 'href', 'url', 'src', 'slug',
  'date', 'updated', 'datePublished', 'dateModified', 'publishedTime', 'modifiedTime',
  'figure', 'icon', 'placement', 'faqMode', 'relatedTools', 'kind',
  'socialImage', 'sameAs', 'supportEmail', 'source', 'destination', 'status',
  'inLanguage', 'image', 'contentUrl', 'thumbnailUrl', 'mainEntityOfPage', 'from', 'to',
])

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ndash: '-', mdash: '-' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|ndash|mdash);/gi, (entity, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()] ?? entity
    const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd'
  })
}

/** Scan reader-facing labels, never an inline link's destination or HTML attributes. */
export function editorialPlainText(value) {
  // Only the renderer's supported tag names are syntax. An unsupported
  // HTML-looking word can be escaped visible text and must not evade policy.
  const text = decodeEntities(String(value)
    .replace(/<\/?(?:p|ul|ol|li|br|blockquote)(?:\s[^>]*)?\s*\/?>/gi, ' ')
    .replace(/<\/?(?:strong|em|b|i|code|a)(?:\s[^>]*)?\s*\/?>/gi, ''))
  // Formatting and inline links do not insert reader-visible word spaces.
  return splitEditorialLinks(text).map(part => typeof part === 'string' ? part : part.label).join('')
}

function tokens(value) {
  return editorialPlainText(value).normalize('NFKC').toLowerCase()
    .replace(/[\u00ad\p{Cf}]/gu, '')
    .replace(/[\u2018\u2019\u02bc'`]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []
}
const prohibited = PROHIBITED_EDITORIAL_TERMS.map(term => ({ term, words: tokens(term) }))

export function findProhibitedEditorialTerms(value) {
  if (typeof value !== 'string' || !value) return []
  const words = tokens(value)
  return prohibited.flatMap(({ term, words: phrase }) => {
    const occurrences = []
    for (let index = 0; index <= words.length - phrase.length; index++) {
      if (phrase.every((word, offset) => words[index + offset] === word)) occurrences.push({ term, wordIndex: index })
    }
    return occurrences
  })
}

export function editorialVocabularyError(value) {
  const values = Array.isArray(value) ? value : [value]
  for (const entry of values) {
    const [match] = findProhibitedEditorialTerms(entry)
    if (match) return `Rewrite the editorial term “${match.term}” in direct, natural language.`
  }
}

/** Returns precise JSON fields. Draft posts stay editable and unshipped. */
export function inspectEditorialVocabulary(value, location = '') {
  const failures = []
  const visit = (entry, at, key) => {
    if (NON_EDITORIAL_KEYS.has(key) && typeof entry === 'string') return
    if (typeof entry === 'string') {
      for (const match of findProhibitedEditorialTerms(entry)) failures.push({ field: at, ...match })
    } else if (Array.isArray(entry)) entry.forEach((child, index) => visit(child, `${at}[${index}]`, key))
    else if (entry && typeof entry === 'object') {
      for (const [name, child] of Object.entries(entry)) visit(child, at ? `${at}.${name}` : name, name)
    }
  }
  visit(value, location, '')
  return failures
}

export function assertEditorialVocabulary(value, location = '') {
  const [failure] = inspectEditorialVocabulary(value, location)
  if (failure) throw new Error(`Editorial vocabulary in ${failure.field}: rewrite “${failure.term}” in direct, natural language.`)
}
