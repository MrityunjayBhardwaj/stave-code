#!/usr/bin/env node
/**
 * mini-corpus-manifest.mjs — the corpus's provenance record AND its recipe.
 *
 * WHY THIS EXISTS.
 *
 * `mini-corpus.json` is read by every parity-corpus gate. Its inputs are the
 * `edit-samples-*.json` files in `.bakery-runs/`, which is GITIGNORED, and
 * `_harvest-mini-corpus.spec.ts` selects them with a bare directory glob. So
 * the corpus was reproducible only by accident: lose this checkout and it
 * could never be re-derived, and one live sampler run would silently widen it
 * at the next harvest, inside a diff that looks like an ordinary refresh.
 *
 * WHY NOT JUST COMMIT THE INPUTS. They are verbatim community source — a few
 * hundred distinct tunes — and the overwhelming majority declare no licence
 * at all (`totals.withLicence` against `totals.distinctTunes` is the current
 * count; do not restate it here). `.gitignore` refuses that vendoring by name
 * ("Never vendored — it is unreviewed third-party source"), and the only
 * live-community tune this repo vendors (`bakery-runs/repro__LsnlgQ6osk.strudel`)
 * declares CC0. That policy is deliberate and is kept here.
 *
 * ⚠ THAT SENTENCE WAS ONCE COUNTED AGAINST THE WRONG SET (#1292). It read "the ONE
 * live-community tune this repo HAS vendored", offered as evidence that the fence was
 * deliberate rather than incidental — a one-in-hundreds coincidence if it were not. Six
 * were vendored, and five of them declared no licence; they were removed in #1292, which
 * is the only reason the sentence is true today. The conclusion it supported did not
 * depend on it: publishing the inputs would buy re-derivability this repo already has,
 * and upstream grants nothing (`util.mjs`, checked). A claim about a closed set is
 * countable and therefore gets counted — check WHICH set before leaning on it.
 *
 * WHAT THIS WRITES INSTEAD. `mini-corpus-inputs.json` — facts about the
 * inputs rather than the inputs themselves:
 *
 *   - per input file: sha256, byte length, row count, and the ORDERED list of
 *     tune hashes it holds, plus the stamp/column/offset the sampler recorded.
 *   - per tune: its `code_v1` hash, title and declared licence where the tune
 *     states them, and a permalink, so every use can credit its author.
 *
 * AND SINCE #1305 THE OTHER SIDE CAN ACTUALLY JOIN TO IT. "so every use can
 * credit its author" was a promise this file could not keep on its own: each
 * `mini-corpus.json` row recorded only how MANY tunes a string came from, so
 * the credits below were reachable for the input SET and for no individual
 * fragment. Rows now carry `tuneHashes`, and `mini-corpus-inputs.test.ts`
 * gates that every one of them resolves to a credit here. Crediting an author
 * or honouring a takedown is a lookup rather than a regeneration.
 *
 * WHY THE HASHES MAKE IT A RECIPE, NOT ONLY A RECEIPT. The rows are still
 * live and public in `code_v1`, and hash lookup is exact where the sampler's
 * offset paging is not. OBSERVED 2026-08-17, and stated as a dated reading
 * rather than a standing fact: all 360 tunes then in the archive re-fetched
 * BYTE-IDENTICAL to it. So `restore` rebuilds `.bakery-runs/` from this
 * manifest alone, and the sha256 column proves the rebuild is exact — the
 * corpus survives losing the checkout without the code being republished.
 *
 * Upstream retired the WRITER for these share links ("RIP due to SPAM"), but
 * the loader still reads `?<hash>` from the same table — `util.mjs:31-42`,
 * with the URL shape given at `:32`. That is why the permalinks resolve.
 *
 * Usage:
 *   node packages/app/scripts/mini-corpus-manifest.mjs generate
 *   node packages/app/scripts/mini-corpus-manifest.mjs restore [--out DIR]
 *
 * GENERATE IS DELIBERATE, NEVER AUTOMATIC. It rewrites the answer key that
 * `mini-corpus-inputs.test.ts` checks against, so running it as part of a gate
 * would make that gate certify whatever it just wrote. Run it by hand, only
 * when the input set is meant to change, and read the diff.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpusDir = path.resolve(here, '..', 'tests', 'parity-corpus')
const runsDir = path.join(corpusDir, '.bakery-runs')
const manifestPath = path.join(corpusDir, 'mini-corpus-inputs.json')

// Pinned upstream — the same SHA the corpus, parity-bakery.mjs and
// edit-coverage-bakery.mjs all use. The anon key is NOT stored here; it is
// resolved from upstream at run time exactly as the samplers do it.
const UPSTREAM_SHA = 'f73b395648645aabe699f91ba0989f35a6fd8a3c'
const UTIL_URL = `https://codeberg.org/uzu/strudel/raw/commit/${UPSTREAM_SHA}/website/src/repl/util.mjs`
const SUPABASE_BASE = 'https://pidxdsxphlhzjnzmifth.supabase.co'
const PERMALINK = (hash) => `https://strudel.cc/?${hash}`

/** The input-file rule, in ONE place. The harvest applies the same test. */
export const isInputFile = (f) => f.startsWith('edit-samples-') && f.endsWith('.json')

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/**
 * Title and licence are read from the tune's own comment header, and ONLY
 * from there — this records what an author chose to state, and invents
 * nothing where they stated nothing. Roughly half carry a quoted title and a
 * bare handful declare a licence — `totals.withTitle` and `totals.withLicence`
 * hold the counts, so they are not restated here. `null` means "the tune says
 * nothing", which is the honest and load-bearing answer: it is why these files
 * are not vendored.
 */
function creditFor(code) {
  const head = code.split('\n').slice(0, 6).join('\n')
  const title =
    head.match(/^\/\/\s*"([^"]+)"/m)?.[1] ?? head.match(/^\/\/\s*@title\s+(.+)$/m)?.[1]?.trim() ?? null
  const licence =
    head.match(/\b(CC0|CC[- ]BY[-A-Za-z0-9. ]*|GPL[-A-Za-z0-9.]*|MIT|public domain)\b/i)?.[1]?.trim() ?? null
  return { title, licence }
}

async function resolveUpstream() {
  const res = await fetch(UTIL_URL)
  if (!res.ok) throw new Error(`util.mjs fetch failed (${res.status}): ${UTIL_URL}`)
  const src = await res.text()
  const column = src.match(/\.from\('code_v1'\)\s*\.select\('([^']+)'\)/)?.[1]
  const anonKey = src.match(/createClient\(\s*'https:\/\/[^']+',\s*'([A-Za-z0-9._-]+)'/)?.[1]
  if (!column) throw new Error('Could not resolve code_v1 body column from upstream util.mjs')
  if (!anonKey) throw new Error('Could not resolve Supabase anon key from upstream util.mjs')
  return { column, anonKey }
}

/** Fetch tunes BY HASH — exact, unlike the sampler's offset paging. */
async function fetchByHash(hashes, { column, anonKey }) {
  const out = new Map()
  for (let i = 0; i < hashes.length; i += 25) {
    const batch = hashes.slice(i, i + 25)
    const list = batch.map((h) => `"${h}"`).join(',')
    const url = `${SUPABASE_BASE}/rest/v1/code_v1?hash=in.(${encodeURIComponent(list)})&select=hash,${column}`
    const res = await fetch(url, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } })
    if (!res.ok) throw new Error(`code_v1 fetch failed (${res.status}) for batch at ${i}`)
    for (const row of await res.json()) out.set(row.hash, row[column])
  }
  return out
}

async function generate() {
  const files = (await fs.readdir(runsDir)).filter(isInputFile).sort()
  if (files.length === 0) throw new Error(`no input files under ${runsDir}`)

  const inputs = []
  const credits = new Map()
  for (const file of files) {
    const raw = await fs.readFile(path.join(runsDir, file))
    const parsed = JSON.parse(raw.toString())
    inputs.push({
      file,
      sha256: sha256(raw),
      bytes: raw.length,
      stamp: parsed.stamp,
      upstreamSha: parsed.UPSTREAM_SHA,
      column: parsed.column,
      offset: parsed.offset,
      rows: parsed.samples.length,
      hashes: parsed.samples.map((s) => s.hash),
    })
    for (const s of parsed.samples) {
      if (!credits.has(s.hash)) credits.set(s.hash, { hash: s.hash, ...creditFor(s.code), url: PERMALINK(s.hash) })
    }
  }

  const manifest = {
    _readme:
      'Provenance record AND rebuild recipe for the gitignored .bakery-runs/ inputs behind ' +
      'mini-corpus.json. The tunes themselves are NOT vendored — see mini-corpus-manifest.mjs. ' +
      'Regenerate deliberately with `node packages/app/scripts/mini-corpus-manifest.mjs generate`; ' +
      'rebuild the inputs with `... restore`. Checked by mini-corpus-inputs.test.ts.',
    generatedBy: 'packages/app/scripts/mini-corpus-manifest.mjs',
    source: {
      table: 'code_v1',
      supabaseBase: SUPABASE_BASE,
      upstreamSha: UPSTREAM_SHA,
      utilUrl: UTIL_URL,
      permalink: 'https://strudel.cc/?<hash>',
      permalinkRef: 'util.mjs:32 (shape) · util.mjs:31-42 (the loader that still reads it)',
      note:
        'Credit each tune to its author via the permalink. title/licence are recorded only where ' +
        'the tune states them; null means the author stated nothing, which is why these are not vendored.',
    },
    totals: {
      inputFiles: inputs.length,
      rows: inputs.reduce((n, i) => n + i.rows, 0),
      distinctTunes: credits.size,
      withTitle: [...credits.values()].filter((c) => c.title).length,
      withLicence: [...credits.values()].filter((c) => c.licence).length,
    },
    inputs,
    credits: [...credits.values()].sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)),
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  const t = manifest.totals
  console.log(`wrote ${path.relative(process.cwd(), manifestPath)}`)
  console.log(`  ${t.inputFiles} input files · ${t.rows} rows · ${t.distinctTunes} distinct tunes`)
  console.log(`  credits: ${t.withTitle} titled · ${t.withLicence} declaring a licence`)
}

async function restore(outDir) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const upstream = await resolveUpstream()
  const wanted = [...new Set(manifest.inputs.flatMap((i) => i.hashes))]
  const codes = await fetchByHash(wanted, upstream)

  const missing = wanted.filter((h) => !codes.has(h))
  if (missing.length) {
    console.error(`${missing.length} of ${wanted.length} tunes are no longer in code_v1:`)
    for (const h of missing.slice(0, 10)) console.error(`  ${h}  ${PERMALINK(h)}`)
    throw new Error('cannot rebuild the corpus inputs exactly — upstream rows have gone')
  }

  await fs.mkdir(outDir, { recursive: true })
  let exact = 0
  for (const input of manifest.inputs) {
    // Byte-exact reconstruction depends on matching the sampler's own writer:
    // JSON.stringify(<this key order>, null, 2) — edit-coverage-bakery.mjs:95.
    const body = {
      stamp: input.stamp,
      UPSTREAM_SHA: input.upstreamSha,
      column: input.column,
      offset: input.offset,
      samples: input.hashes.map((hash) => ({ hash, code: codes.get(hash) })),
    }
    const raw = Buffer.from(JSON.stringify(body, null, 2))
    const got = sha256(raw)
    const ok = got === input.sha256
    if (ok) exact++
    else console.error(`  MISMATCH ${input.file}\n    manifest ${input.sha256}\n    rebuilt  ${got}`)
    await fs.writeFile(path.join(outDir, input.file), raw)
  }
  console.log(`restored ${manifest.inputs.length} files to ${outDir}`)
  console.log(`  byte-exact against the manifest: ${exact}/${manifest.inputs.length}`)
  if (exact !== manifest.inputs.length) throw new Error('rebuild is not byte-exact')
}

// Run the CLI only when INVOKED as one. `mini-corpus-inputs.test.ts` imports
// `isInputFile` from here so the two live consumers share ONE input rule
// rather than each keeping a copy — importing must not start a fetch.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2)
  const outFlag = rest.indexOf('--out')
  if (cmd === 'generate') await generate()
  else if (cmd === 'restore') await restore(outFlag >= 0 ? path.resolve(rest[outFlag + 1]) : runsDir)
  else {
    console.error('usage: mini-corpus-manifest.mjs generate | restore [--out DIR]')
    process.exit(2)
  }
}
