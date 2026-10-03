/**
 * One-off: report every `related` entry that points at a slug which is not a
 * registered tool, or at the tool itself.
 */

import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/tools.ts', import.meta.url), 'utf8')

// The registry's slugs.
const slugs = new Set([...src.matchAll(/^\s*slug: '([^']+)'/gm)].map((m) => m[1]))

// Each tool's slug paired with its related list, by scanning the object blocks.
const blocks = [...src.matchAll(/slug: '([^']+)'([\s\S]*?)\n  \},/g)]
let problems = 0

for (const [, slug, body] of blocks) {
  const rel = /related: \[([^\]]*)\]/.exec(body)
  if (!rel) continue
  const entries = [...rel[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  for (const entry of entries) {
    if (entry === slug) {
      console.log(`SELF      ${slug} -> ${entry}`)
      problems++
    } else if (!slugs.has(entry)) {
      console.log(`MISSING   ${slug} -> ${entry}`)
      problems++
    }
  }
  const dupes = entries.filter((e, i) => entries.indexOf(e) !== i)
  for (const d of new Set(dupes)) {
    console.log(`DUPLICATE ${slug} -> ${d}`)
    problems++
  }
}

console.log(`\n${slugs.size} tools, ${problems} problem(s)`)
process.exit(problems ? 1 : 0)