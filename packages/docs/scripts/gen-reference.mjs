/**
 * Auto-generate per-runtime reference MDX from the vendored DocsIndex
 * JSON files shared with the editor. Runs as `predev` / `prebuild` so
 * the site always reflects the latest `fetch-docs/<runtime>.mjs` output.
 *
 * Input  : packages/editor/src/monaco/docs/data/{p5,hydra,sonicpi,strudel}.json
 * Output : packages/docs/src/content/docs/reference/{runtime}.mdx
 *          plus packages/docs/public/docs-search.json (index for in-editor search)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(
  __dirname,
  '../../editor/src/monaco/docs/data',
)
const OUT_DIR = path.resolve(__dirname, '../src/content/docs/reference')
const SEARCH_OUT = path.resolve(__dirname, '../public/docs-search.json')

const RUNTIMES = [
  { key: 'strudel', label: 'Strudel', short: 'strudel' },
  { key: 'sonicpi', label: 'Sonic Pi', short: 'sonicpi' },
  { key: 'p5', label: 'p5.js', short: 'p5' },
  { key: 'hydra', label: 'Hydra', short: 'hydra' },
]

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeMdx(s) {
  return String(s ?? '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}

function escapeCode(s) {
  return String(s ?? '').replace(/`/g, '\\`')
}

async function readIndex(runtimeKey) {
  const p = path.join(DATA_DIR, `${runtimeKey}.json`)
  try {
    const raw = await fs.readFile(p, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    // A runtime's vendored DocsIndex may be absent on a given branch (e.g.
    // `strudel.json` is a docs-site-only refactor not yet on this base). Skip it
    // — generate reference pages for the runtimes that DO have data rather than
    // failing the whole site build for one missing index.
    if (e?.code === 'ENOENT') {
      console.warn(`  (skip) no DocsIndex for '${runtimeKey}' at ${p}`)
      return null
    }
    throw e
  }
}

function kindBadge(kind) {
  if (!kind) return ''
  const label = kind.charAt(0).toUpperCase() + kind.slice(1)
  return ` <Badge text="${label}" variant="note" size="small" />`
}

function renderEntry(name, doc, fallbackUrl) {
  const href = doc.sourceUrl ?? fallbackUrl
  const sig = `\`${escapeCode(doc.signature ?? name)}\``
  const kind = kindBadge(doc.kind)
  const desc = doc.description ? `\n\n${escapeMdx(doc.description)}` : ''
  const ex = doc.example
    ? `\n\n\`\`\`\n${doc.example}\n\`\`\``
    : ''
  const ret = doc.returns
    ? `\n\n**Returns:** ${escapeMdx(doc.returns)}`
    : ''
  const category = doc.category
    ? `\n\n<small>Category: \`${doc.category}\`</small>`
    : ''
  const ref = href
    ? `\n\n<a href="${href}" target="_blank" rel="noopener">Upstream reference →</a>`
    : ''
  return `### ${name}${kind}\n\n${sig}${desc}${ex}${ret}${category}${ref}\n`
}

async function writeRuntimePage(rt, index) {
  const docs = index.docs ?? {}
  const names = Object.keys(docs).sort()
  const fallback = index.meta?.docsBaseUrl
  const version = index.meta?.version
    ? `v${index.meta.version}`
    : 'current'
  const fetchedAt = index.meta?.fetchedAt
  const source = index.meta?.source ?? 'upstream'

  const header = `---
title: ${rt.label} reference
description: Every ${rt.label} symbol Stave recognises — signature, description, example, and a link to upstream.
---

import { Badge, Aside } from '@astrojs/starlight/components';

<Aside type="tip">
${names.length} entries · generated from ${source === 'hand-curated' ? 'the hand-curated Stave index' : `upstream \`${source}\``}${fetchedAt ? ` (fetched ${fetchedAt})` : ''}. Re-sync with \`node packages/editor/scripts/fetch-docs/${rt.key}.mjs\`.
</Aside>

Version: ${version}.
`

  const body = names
    .map((n) => renderEntry(n, docs[n], fallback))
    .join('\n')

  const out = path.join(OUT_DIR, `${rt.key}.mdx`)
  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, header + '\n' + body, 'utf8')
  return names.length
}

async function writeSearchIndex(indexes) {
  // Trimmed shape — name + runtime + sig + first sentence + URL fragment.
  // Consumed by the in-editor Cmd+K D search (phase 2).
  const rows = []
  for (const [rtKey, index] of Object.entries(indexes)) {
    if (!index) continue // runtime skipped (no DocsIndex on this branch)
    const fallback = index.meta?.docsBaseUrl
    for (const [name, doc] of Object.entries(index.docs ?? {})) {
      const firstSentence = (doc.description ?? '')
        .split(/(?<=[.!?])\s/)[0]
        .slice(0, 200)
      rows.push({
        runtime: rtKey,
        name,
        signature: doc.signature,
        description: firstSentence,
        kind: doc.kind,
        category: doc.category,
        url: `/reference/${rtKey}/#${slugify(name)}`,
        upstream: doc.sourceUrl ?? fallback ?? null,
      })
    }
  }
  await fs.mkdir(path.dirname(SEARCH_OUT), { recursive: true })
  await fs.writeFile(SEARCH_OUT, JSON.stringify(rows), 'utf8')
  return rows.length
}

async function main() {
  const loaded = {}
  for (const rt of RUNTIMES) {
    loaded[rt.key] = await readIndex(rt.key)
  }
  // Only generate pages for runtimes whose DocsIndex was found.
  const available = RUNTIMES.filter((rt) => loaded[rt.key])
  let total = 0
  for (const rt of available) {
    const n = await writeRuntimePage(rt, loaded[rt.key])
    console.log(`  ${rt.label}: ${n} entries → src/content/docs/reference/${rt.key}.mdx`)
    total += n
  }
  const searchRows = await writeSearchIndex(loaded)
  console.log(
    `docs gen: ${total} reference entries across ${available.length}/${RUNTIMES.length} runtimes · ${searchRows} search rows`,
  )
}

main().catch((err) => {
  console.error('docs gen failed:', err)
  process.exit(1)
})
