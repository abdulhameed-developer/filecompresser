import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCmsInputs } from './check-cms-inputs.mjs'
import { findProhibitedEditorialTerms, inspectEditorialVocabulary } from '../lib/editorial-vocabulary.mjs'

function reject(failures, scope) {
  if (failures.length) throw new Error(`${scope} editorial vocabulary failed:\n${failures.map(item => `${item.file}:${item.field} — “${item.term}” (word ${item.wordIndex + 1})`).join('\n')}`)
}

/** Published prose only: unpublished posts and redirect/path identifiers are excluded. */
export function checkEditorialSource(projectRoot = process.cwd()) {
  checkCmsInputs(projectRoot)
  const failures = []
  let records = 0
  for (const collection of ['home', 'tools', 'pages', 'posts', 'settings']) {
    const directory = path.join(projectRoot, 'content', collection)
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue
      const relative = `content/${collection}/${file.name}`
      const document = JSON.parse(readFileSync(path.join(directory, file.name), 'utf8'))
      if (collection === 'posts' && (document.published !== true || document.archived === true)) continue
      records++
      failures.push(...inspectEditorialVocabulary(document).map(item => ({ file: relative, ...item })))
    }
  }
  reject(failures, 'Published source')
  return { records, violations: failures.length }
}

/** Check actual compiled page copy, accessible labels, metadata and JSON-LD.
 * Scripts, CSS, filenames and the private admin bundle are never prose.
 */
export async function checkEditorialExport(directory = 'out') {
  const { JSDOM } = await import('jsdom')
  const failures = []
  let pages = 0
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (['_next', 'admin'].includes(entry.name)) continue
      const filename = path.join(current, entry.name)
      if (entry.isDirectory()) { walk(filename); continue }
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue
      pages++
      const dom = new JSDOM(readFileSync(filename, 'utf8'))
      const document = dom.window.document
      const file = path.relative(directory, filename)
      const inspect = (value, field) => failures.push(...findProhibitedEditorialTerms(value).map(item => ({ file, field, ...item })))
      for (const [index, script] of [...document.querySelectorAll('script[type="application/ld+json"]')].entries()) {
        const data = JSON.parse(script.textContent ?? '')
        failures.push(...inspectEditorialVocabulary(data, `jsonLd[${index}]`).map(item => ({ file, ...item })))
      }
      inspect(document.title, 'title')
      for (const [index, meta] of [...document.querySelectorAll('meta[name="description"],meta[name="keywords"],meta[property^="og:"],meta[name^="twitter:"]')].entries()) {
        const name = meta.getAttribute('name') ?? meta.getAttribute('property') ?? ''
        if (/(:url|:image|:type|:card)$/.test(name)) continue
        inspect(meta.getAttribute('content'), `meta[${index}].${name}`)
      }
      for (const element of document.querySelectorAll('[alt],[title],[aria-label],[placeholder]')) {
        for (const attribute of ['alt', 'title', 'aria-label', 'placeholder']) {
          if (element.hasAttribute(attribute)) inspect(element.getAttribute(attribute), `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${attribute}`)
        }
      }
      document.querySelectorAll('script,style,template,noscript').forEach(element => element.remove())
      inspect(document.body.textContent, 'body.textContent')
      dom.window.close()
    }
  }
  walk(directory)
  if (!pages) throw new Error('Editorial export check found no generated HTML pages.')
  reject(failures, 'Generated public HTML')
  return { pages, violations: failures.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const source = checkEditorialSource()
    console.log(`Published editorial source: ${source.records} records, zero prohibited terms.`)
    const output = process.argv.find(value => value.startsWith('--export='))?.slice('--export='.length)
    if (output) {
      const result = await checkEditorialExport(output)
      console.log(`Generated public editorial text: ${result.pages} HTML files, zero prohibited terms.`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
