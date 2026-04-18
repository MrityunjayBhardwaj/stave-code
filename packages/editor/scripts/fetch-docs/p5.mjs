/**
 * Fetch + transform p5.js reference into our DocsIndex shape.
 *
 * Source:   https://p5js.org/reference/data.json (YUIDoc-generated)
 * Output:   packages/editor/src/monaco/docs/data/p5.json
 * Re-run:   node packages/editor/scripts/fetch-docs/p5.mjs
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(
  __dirname,
  '../../src/monaco/docs/data/p5.json',
)

const SOURCE = 'https://p5js.org/reference/data.json'
const REF_ROOT = 'https://p5js.org/reference/#/p5/'

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`fetch ${SOURCE}: ${res.status}`)
const raw = await res.json()

const classitems = raw.classitems ?? []

function stripHtml(s) {
  if (!s) return ''
  return s
    .replace(/<\/?code>/g, '`')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(s) {
  const t = stripHtml(s)
  const m = t.match(/^[^.!?]+[.!?]/)
  return m ? m[0] : t.slice(0, 200)
}

function renderSignature(name, overload) {
  const params = overload?.params ?? []
  if (params.length === 0) return `${name}()`
  const parts = params.map((p) => {
    const opt = p.optional ? '?' : ''
    const t =
      Array.isArray(p.type) ? p.type.join('|')
      : typeof p.type === 'string' ? p.type.replace(/\|/g, '|')
      : ''
    return t ? `${p.name}${opt}: ${t}` : `${p.name}${opt}`
  })
  return `${name}(${parts.join(', ')})`
}

function extractExample(name, ex) {
  if (!Array.isArray(ex) || ex.length === 0) return undefined
  // Call expression (`name(...)`) OR identifier usage (`HSB`, `PI`) — the
  // latter covers constants and non-function properties whose example is
  // an `ellipseMode(CENTER)` style reference rather than a call.
  const callRe = new RegExp(`(?:^|[^\\w.])${name}\\s*\\(`)
  const refRe = new RegExp(`(?:^|[^\\w.])${name}(?:$|[^\\w])`)
  for (const block of ex) {
    const codeMatch = /<code>([\s\S]*?)<\/code>/.exec(block)
    const code = (codeMatch?.[1] ?? block).trim()
    const lines = code
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    // Only skip the boilerplate `describe('…')` calls when the entry
    // we're building isn't the `describe` function itself — otherwise
    // we'd throw away `describe`'s own example.
    const isDescribe = name === 'describe'
    const pick = (re) =>
      lines.find(
        (l) =>
          re.test(l) &&
          !l.startsWith('//') &&
          // Skip `function setup()` / `function draw()` declarations —
          // they'd match the call regex for `setup` / `draw` but aren't
          // actually calls. Bare function-expression literals inside
          // a `const fn = function foo()` still get picked via the
          // remaining lines.
          !l.startsWith('function ') &&
          // `describe('…')` is boilerplate accessibility in every p5
          // example; skip it UNLESS the entry being built IS describe.
          (isDescribe || !l.startsWith('describe(')),
      )
    const direct = pick(callRe)
    if (direct) return direct.replace(/;$/, '')
    const ref = pick(refRe)
    if (ref) return ref.replace(/;$/, '')
  }
  return undefined
}

const docs = {}

for (const item of classitems) {
  if (item.itemtype !== 'method' && item.itemtype !== 'property') continue
  if (item.class !== 'p5') continue
  if (!item.name) continue
  if (item.name.startsWith('_')) continue
  if (item.private === true || item.access === 'private') continue

  const overload = (item.overloads && item.overloads[0]) || item
  const sig =
    item.itemtype === 'property'
      ? item.name
      : renderSignature(item.name, overload)

  docs[item.name] = {
    signature: sig,
    description: firstSentence(item.description),
    example: extractExample(item.name, item.example),
    kind: item.itemtype === 'property' ? 'variable' : 'function',
    category: item.module || item.submodule,
    sourceUrl: `${REF_ROOT}${item.name}`,
  }
}

// Also include constants (p5.CONSTANTS)
for (const c of Object.values(raw.consts ?? {})) {
  if (!c.name) continue
  docs[c.name] = {
    signature: c.name,
    description: firstSentence(c.description ?? `p5 constant ${c.name}`),
    kind: 'constant',
    sourceUrl: `${REF_ROOT}${c.name}`,
  }
}

const index = {
  runtime: 'p5js',
  docs,
  meta: {
    version: raw.project?.version,
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: SOURCE,
  },
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(index, null, 2) + '\n', 'utf8')

const names = Object.keys(docs)
console.log(`wrote ${OUT}`)
console.log(`  entries: ${names.length}`)
console.log(`  p5 version: ${raw.project?.version}`)
console.log(`  samples: ${['ellipse','rect','fill','background','noise','createCanvas'].filter(n => docs[n]).join(', ')}`)
