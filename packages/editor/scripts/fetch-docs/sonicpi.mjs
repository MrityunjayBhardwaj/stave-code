/**
 * Fetch + transform Sonic Pi reference into our DocsIndex shape.
 *
 * Sources:
 *   Language fns: app/server/ruby/lib/sonicpi/lang/*.rb
 *                 (scraped from `doc name: :foo, summary: "…", doc: "…"` blocks)
 *   Synth keys:   etc/doc/cheatsheets/synths.md
 *   FX keys:      etc/doc/cheatsheets/fx.md
 *
 * Output:  packages/editor/src/monaco/docs/data/sonicpi.json
 * Re-run:  node packages/editor/scripts/fetch-docs/sonicpi.mjs
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(
  __dirname,
  '../../src/monaco/docs/data/sonicpi.json',
)

const REPO = 'https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/stable'
const REF_FN = 'https://sonic-pi.net/tutorial.html'

const RUBY_SOURCES = [
  'app/server/ruby/lib/sonicpi/lang/core.rb',
  'app/server/ruby/lib/sonicpi/lang/sound.rb',
  'app/server/ruby/lib/sonicpi/lang/maths.rb',
  'app/server/ruby/lib/sonicpi/lang/western_theory.rb',
  'app/server/ruby/lib/sonicpi/lang/midi.rb',
  'app/server/ruby/lib/sonicpi/lang/minecraftpi.rb',
]

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  return res.text()
}

function unescapeRuby(s) {
  return s
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(s, max = 220) {
  const t = unescapeRuby(s ?? '')
  const m = t.match(/^[^.!?]+[.!?]/)
  return m ? m[0] : t.slice(0, max)
}

function stripHtml(s) {
  return s
    .replace(/<\/?code>/g, '`')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Walk the `examples: [ "…", "…", "…" ]` block of a `doc name:` chunk and
 * return the first line across all example strings that looks like a
 * clean, single-line usage of `fnName`. v1 only inspected the first
 * string; this picks up entries whose first example is a multi-line
 * setup with the fn call on line 3+.
 */
function pickExampleLine(chunk, fnName) {
  const examplesStart = chunk.indexOf('examples:')
  if (examplesStart < 0) return undefined
  // Crude string-literal scanner — walk from after `examples: [` picking
  // out `"..."` strings until we hit the closing `]` at the same bracket
  // depth.
  const after = chunk.slice(examplesStart)
  const openIdx = after.indexOf('[')
  if (openIdx < 0) return undefined
  let i = openIdx + 1
  const strings = []
  let depth = 1
  while (i < after.length && depth > 0) {
    const ch = after[i]
    if (ch === '"') {
      // Capture string body with backslash-escape awareness
      let j = i + 1
      let buf = ''
      while (j < after.length) {
        const cj = after[j]
        if (cj === '\\' && j + 1 < after.length) {
          buf += cj + after[j + 1]
          j += 2
          continue
        }
        if (cj === '"') break
        buf += cj
        j++
      }
      strings.push(buf)
      i = j + 1
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') depth--
    i++
    // Bound runaway scans
    if (strings.length > 10) break
  }
  const nameRe = new RegExp(`(?:^|[\\s;=({,])${fnName}(?:\\b|\\s|[(!])`)
  for (const s of strings) {
    // Local unescape that preserves `\n` as a real newline so split
    // downstream works. `unescapeRuby` collapses `\n` → space which is
    // fine for single-line prose (summary/doc) but wrong here.
    const raw = s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
    for (const rawLine of raw.split(/[\n;]/)) {
      // Strip trailing `# comment` so long explanatory comments don't
      // blow past the length filter, and so the example itself ends at
      // a natural point.
      const codeOnly = rawLine.replace(/\s+#.*$/, '').trim()
      if (!codeOnly || codeOnly.startsWith('#')) continue
      if (codeOnly.length > 120) continue
      if (!nameRe.test(codeOnly)) continue
      return codeOnly
    }
  }
  return undefined
}

function parseRubyDocs(source, filePath) {
  const chunks = source.split(/\n\s*doc\s+name:\s+/)
  const out = []
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i].slice(0, 6000)
    const nameM = /^:(\w+)/.exec(chunk)
    const summaryM = /summary:\s+"((?:[^"\\]|\\.)*)"/.exec(chunk)
    const docM = /\bdoc:\s+"((?:[^"\\]|\\.)*)"/.exec(chunk)
    const argsM = /args:\s+\[([\s\S]*?)\](?=,\s*(?:alt|opts|accepts|examples|introduced|returns|intro_fn|hide))/.exec(chunk)
    if (!nameM) continue
    const name = nameM[1]
    const summary = summaryM ? unescapeRuby(summaryM[1]) : ''
    const doc = docM ? firstSentence(docM[1]) : summary
    // Parse args like [[:note, :number], [:val, :default_1]]
    const args = []
    if (argsM) {
      const argRe = /\[\s*:(\w+)(?:\s*,\s*:?(\w+))?\s*\]/g
      let m
      while ((m = argRe.exec(argsM[1])) !== null) {
        args.push({ name: m[1], type: m[2] ?? '' })
      }
    }
    // Extract every string inside `examples: [...]` and try each until we
    // find one with a clean, short call-site line. Ruby examples are
    // verbose multi-line heredocs — iterating every string rather than
    // just the first string covers ~30% more entries than the v1 regex.
    const example = pickExampleLine(chunk, name)
    out.push({ name, summary, doc, args, example, file: filePath })
  }
  return out
}

function renderSignature(name, args) {
  if (!args || args.length === 0) return name
  const parts = args.map((a) => (a.type ? `${a.name}: ${a.type}` : a.name))
  return `${name}(${parts.join(', ')})`
}

const docs = {}

// --- Language functions from Ruby source ---
for (const rel of RUBY_SOURCES) {
  const url = `${REPO}/${rel}`
  const text = await fetchText(url)
  if (!text) {
    console.warn(`  skip (404): ${rel}`)
    continue
  }
  const parsed = parseRubyDocs(text, rel)
  console.log(`  ${rel}: ${parsed.length} entries`)
  for (const e of parsed) {
    docs[e.name] = {
      signature: renderSignature(e.name, e.args),
      description: e.doc || e.summary,
      example: e.example,
      kind: 'function',
      category: rel.replace(/^.*\//, '').replace(/\.rb$/, ''),
      sourceUrl: REF_FN,
    }
  }
}

// --- Synths from cheatsheet ---
const synthsMd = await fetchText(`${REPO}/etc/doc/cheatsheets/synths.md`)
if (synthsMd) {
  // Sections look like:
  //   ## Dull Bell
  //   ### Key:
  //     :dull_bell
  //   ### Doc:
  //     A simple dull discordant bell sound.
  const sections = synthsMd.split(/^## /m).slice(1)
  let count = 0
  for (const sec of sections) {
    const keyM = /### Key:\s*\n\s*:(\w+)/.exec(sec)
    const docM = /### Doc:\s*\n([\s\S]*?)(?=\n### |\n## |$)/.exec(sec)
    if (!keyM) continue
    const name = keyM[1]
    const desc = docM ? stripHtml(docM[1].trim()).slice(0, 280) : ''
    docs[name] = {
      signature: `:${name}`,
      description: desc || `Sonic Pi synth :${name}.`,
      example: `synth :${name}, note: :c4`,
      kind: 'synth',
      category: 'synth',
      sourceUrl: 'https://sonic-pi.net/tutorial.html#section-6.1',
    }
    count++
  }
  console.log(`  synths.md: ${count} entries`)
}

// --- FX from cheatsheet (same shape) ---
const fxMd = await fetchText(`${REPO}/etc/doc/cheatsheets/fx.md`)
if (fxMd) {
  const sections = fxMd.split(/^## /m).slice(1)
  let count = 0
  for (const sec of sections) {
    const keyM = /### Key:\s*\n\s*:(\w+)/.exec(sec)
    const docM = /### Doc:\s*\n([\s\S]*?)(?=\n### |\n## |$)/.exec(sec)
    if (!keyM) continue
    const name = keyM[1]
    const desc = docM ? stripHtml(docM[1].trim()).slice(0, 280) : ''
    // Don't overwrite a language fn sharing the name.
    if (docs[name]) continue
    docs[name] = {
      signature: `:${name}`,
      description: desc || `Sonic Pi FX :${name}.`,
      example: `with_fx :${name} do\n  play :c4\nend`,
      kind: 'fx',
      category: 'fx',
      sourceUrl: 'https://sonic-pi.net/tutorial.html#section-7',
    }
    count++
  }
  console.log(`  fx.md: ${count} entries`)
}

const index = {
  runtime: 'sonicpi',
  docs,
  meta: {
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: REPO,
  },
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(index, null, 2) + '\n', 'utf8')

const names = Object.keys(docs)
console.log(`\nwrote ${OUT}`)
console.log(`  total entries: ${names.length}`)
console.log(
  `  samples: ${['play', 'sleep', 'live_loop', 'sample', 'synth', 'with_fx', 'use_bpm', 'rrand', 'choose', 'dull_bell', 'reverb', 'echo'].filter((n) => docs[n]).join(', ')}`,
)
