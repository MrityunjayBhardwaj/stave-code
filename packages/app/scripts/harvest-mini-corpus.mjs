#!/usr/bin/env node
/**
 * harvest-mini-corpus.mjs — freeze the mini-notation strings real people write.
 *
 * Reads live-Bakery sample files (the `edit-samples-*.json` that
 * `edit-coverage-bakery.mjs` writes into the gitignored `.bakery-runs/`) and
 * extracts every distinct mini string, producing the COMMITTED, hermetic
 * `mini-corpus.json` that `mini-corpus.test.ts` gates against.
 *
 * WHY THIS EXISTS. The vendored `.strudel` corpus is 57 curated tunes, and it
 * demonstrably misses the shapes that break: swapping the mini grammar for
 * krill (#903) silently made `[c4,e4,g4,c5]*2` uneditable, and the per-fixture
 * gate stayed GREEN because no fixture contained a chord with a multiplier. It
 * was caught by diffing verdicts over ~1500 real strings — a throwaway script,
 * deleted the same day. This file is that script, kept.
 *
 * Curated fixtures encode what we thought to write down. This encodes what
 * people actually wrote. The gate needs both.
 *
 * Usage:
 *   node packages/app/scripts/harvest-mini-corpus.mjs [--in <dir>] [--out <file>]
 *
 * Default `--in` is the local `.bakery-runs/`. To REFRESH from live Bakery,
 * first run `pnpm edit:coverage:bakery --n 120 --offset 0` (and 250, 500 — the
 * `--offset` flag takes ONE number, so sweep by re-running), then run this.
 *
 * Refreshing is a deliberate act with its own PR, exactly like a corpus
 * refresh: new strings shift the gate's snapshot, and that diff must be read
 * rather than regenerated past.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpusDir = path.resolve(here, '..', 'tests', 'parity-corpus')

const args = process.argv.slice(2)
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt
}
const inDir = path.resolve(argOf('--in', path.join(corpusDir, '.bakery-runs')))
const outFile = path.resolve(argOf('--out', path.join(corpusDir, 'mini-corpus.json')))

/** the call heads whose first argument the notation models are asked to open */
const HEADS = new Set(['s', 'sound', 'note', 'n'])

/**
 * WHICH LITERALS ARE MINI — asked of the transpiler, not guessed (#1037).
 *
 * This used to be a regex, `\b(?:s|sound|note|n)\(\s*"([^"\\]*)"`, and it
 * carried three restrictions its own comment listed honestly: double quotes only,
 * no escapes, first argument only. What nobody had measured was that the excluded
 * set is not a smaller sample of the same thing — the backtick strings it stepped
 * over are ten times longer, 86% multi-line against 0%, and twice as likely to
 * carry an alternation. Backticks are how people write multi-cycle patterns, so
 * the corpus was biased away from exactly the material the readers are weakest on,
 * and every reach figure over it was optimistic by an unmeasured amount.
 *
 * The rule is now taken from `@strudel/transpiler/transpiler.mjs` rather than
 * approximated, because "which strings become patterns" is the transpiler's
 * answer and a regex restating it is a second oracle:
 *
 *   - `isBackTickString` (:382) — a TemplateLiteral whose parent is not a tagged
 *     template IS reified, from `quasis[0].value.raw`. So backticks are in.
 *   - `isStringWithDoubleQuotes` (:375) — `node.raw[0] === '"'`, and nothing else.
 *     **Single quotes are NOT reified**, which is the whole reason the codebase
 *     writes `.p('name')` with single quotes for string identifiers. Harvesting
 *     them would put things like `s('wt_flute')` — a sample name, never parsed as
 *     notation — into a corpus that gates the notation models.
 *
 * Parsed with acorn, the same parser the chunk detector uses, so the JS grammar is
 * never hand-rolled here. Two consequences that had to be MEASURED rather than
 * assumed, because the first cut of this lost 180 strings the regex had:
 *
 *   - **A commented-out call is not an ask.** 96 of those 180 were inside `//`
 *     lines — `//sound("<bd hh sd [hh oh]>*2")`. The regex scanned raw text and
 *     could not tell; the AST never sees them. That is a correctness gain, and it
 *     means the old corpus was partly a record of code nobody runs.
 *   - **The argument is often a CHAIN, not a bare literal.** `.s("<a b>".slow(64))`
 *     puts a CallExpression there, and the transpiler still reifies the string
 *     inside it, so it is still note content for that head. `rootLiteral` walks to
 *     the leftmost literal of the chain. Missing this cost 35 live strings.
 *
 * And a document that does not PARSE still has to contribute, or the corpus
 * silently loses whatever is inside it — 25 of 770 documents fail acorn, holding
 * 49 distinct strings. Those fall back to the old regex, and the count of
 * fallbacks is REPORTED rather than swallowed.
 *
 * STILL DELIBERATELY EXCLUDED, and stated rather than hidden:
 *   - first argument of those four heads only — `.struct("x*4")`, `.mask(…)`,
 *     `.scale(…)` are not collected. They are patterns, but not NOTE CONTENT, and
 *     this corpus gates the note-content readers.
 *   - interpolated templates — Strudel reifies only `quasis[0]`, so `` `a${x}b` ``
 *     plays as `a`. Harvesting that fragment would put a string in the corpus that
 *     no author wrote and no reader should be judged on.
 */
/** the OLD net, kept for documents acorn cannot parse — never the primary path */
const MINI_ARG_FALLBACK = /\b(?:s|sound|note|n)\(\s*"([^"\\]*)"/g

/**
 * The string a chained first argument is rooted at. `"<a b>".slow(64)` parses as a
 * CallExpression over a MemberExpression over the Literal, and the transpiler
 * rewrites that Literal exactly as it would a bare one.
 */
function rootLiteral(node) {
  let n = node
  while (n) {
    if (n.type === 'Literal') return typeof n.value === 'string' && n.raw?.[0] === '"' ? n.value : null
    if (n.type === 'TemplateLiteral') return n.expressions.length === 0 ? n.quasis[0].value.raw : null
    if (n.type === 'CallExpression') n = n.callee
    else if (n.type === 'MemberExpression') n = n.object
    else return null
  }
  return null
}

function miniLiteralsIn(code) {
  let ast
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true })
  } catch {
    // Fall back to the old text scan rather than dropping the document. Reported
    // by the caller so the size of the degraded slice is never invisible.
    const out = []
    for (const m of code.matchAll(MINI_ARG_FALLBACK)) out.push(m[1])
    out.unparsed = true
    return out
  }
  const out = []
  const walk = (node, parent) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) walk(n, parent)
      return
    }
    if (typeof node.type === 'string') {
      if (node.type === 'CallExpression' && node.arguments.length > 0) {
        const callee = node.callee
        const name =
          callee?.type === 'Identifier'
            ? callee.name
            : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
              ? callee.property.name
              : null
        if (name && HEADS.has(name)) {
          const lit = rootLiteral(node.arguments[0])
          if (lit !== null) out.push(lit)
        }
      }
      for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue
        walk(node[k], node)
      }
    }
  }
  walk(ast, null)
  return out
}

async function main() {
  const files = (await fs.readdir(inDir))
    .filter((f) => f.startsWith('edit-samples-') && f.endsWith('.json'))
    .sort()
  if (files.length === 0) {
    throw new Error(
      `No edit-samples-*.json in ${inDir}\n` +
        `Run: pnpm edit:coverage:bakery --n 120 --offset 0   (then 250, 500)`,
    )
  }

  /** mini string → { tunes: Set<hash>, uses: number } */
  const seen = new Map()
  const sources = []
  /**
   * Distinct tune hashes. Summing `samples.length` across files DOUBLE-COUNTS:
   * the sampler is re-run per window over time, so several files are re-fetches
   * of the same offset. Summing reported "770 tunes" for what is really 360 —
   * an inflated number that would have gone into the committed provenance and
   * been quoted later as coverage.
   */
  const distinctTunes = new Set()
  /** documents acorn could not parse, which fell back to the text scan */
  let unparsedDocs = 0

  for (const f of files) {
    const raw = JSON.parse(await fs.readFile(path.join(inDir, f), 'utf8'))
    const samples = raw.samples ?? raw
    sources.push({
      file: f,
      upstreamSha: raw.UPSTREAM_SHA ?? null,
      offset: raw.offset ?? null,
      tunes: samples.length,
    })
    for (const s of samples) if (s.hash) distinctTunes.add(s.hash)
    for (const s of samples) {
      const hash = s.hash ?? null
      const found = miniLiteralsIn(String(s.code))
      if (found.unparsed) unparsedDocs++
      for (const mini of found) {
        // A mini that is only whitespace carries nothing to draw and nothing
        // to round-trip; it is noise in a verdict snapshot.
        if (mini.trim() === '') continue
        let e = seen.get(mini)
        if (!e) seen.set(mini, (e = { tunes: new Set(), uses: 0 }))
        e.uses++
        if (hash) e.tunes.add(hash)
      }
    }
  }

  // Sorted so the committed file — and every verdict snapshot keyed off it —
  // has a stable order. An unstable order turns every refresh into an
  // unreadable diff, which is how a gate stops being read.
  const minis = [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([mini, e]) => ({ mini, uses: e.uses, tunes: e.tunes.size }))

  const out = {
    _readme:
      'Distinct mini-notation strings harvested from real public Bakery tunes. ' +
      'Committed so the notation parsers are gated against what people actually ' +
      'write, not only against the curated .strudel fixtures. Regenerate with ' +
      'scripts/harvest-mini-corpus.mjs; a refresh is its own PR and its snapshot ' +
      'diff must be read, never -u past.',
    harvestedFrom: sources,
    // DISTINCT, not the sum over `sources` — several sample files are
    // re-fetches of the same offset window, so summing double-counts.
    distinctTunes: distinctTunes.size,
    pattern:
      'AST (acorn): first argument of s/sound/note/n, when it is a double-quoted ' +
      'Literal or an uninterpolated TemplateLiteral — mirroring ' +
      '@strudel/transpiler isStringWithDoubleQuotes / isBackTickString. ' +
      'Single-quoted strings are NOT mini and are excluded.',
    distinct: minis.length,
    unparsedDocs,
    minis,
  }
  await fs.writeFile(outFile, JSON.stringify(out, null, 2) + '\n')

  const totalUses = minis.reduce((n, m) => n + m.uses, 0)
  console.log(
    `sources : ${files.length} sample files over ${new Set(sources.map((s) => s.offset)).size} offset windows` +
      ` -> ${distinctTunes.size} DISTINCT tunes (${sources.reduce((n, s) => n + s.tunes, 0)} rows incl. re-fetches)`,
  )
  console.log(`distinct: ${minis.length} mini strings (${totalUses} uses)`)
  console.log(`unparsed: ${unparsedDocs} document(s) fell back to the text scan`)
  console.log(`out     : ${path.relative(process.cwd(), outFile)}`)
}

main().catch((err) => {
  console.error('harvest-mini-corpus failed:', err.message)
  process.exit(1)
})
