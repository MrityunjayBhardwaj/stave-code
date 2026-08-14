/**
 * _harvest-mini-corpus.spec.ts — freeze the mini-notation strings real people write.
 *
 * Reads live-Bakery sample files (the `edit-samples-*.json` that
 * `edit-coverage-bakery.mjs` writes into the gitignored `.bakery-runs/`) and
 * extracts every distinct mini string, producing the COMMITTED, hermetic
 * `mini-corpus.json` that `mini-corpus.test.ts` and 23 other gates read.
 *
 * Run:
 *   SWEEP=tests/parity-corpus/_harvest-mini-corpus.spec.ts \
 *     pnpm --filter @stave/app exec vitest run --config vitest.sweep.config.ts
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
 * Refreshing is a deliberate act with its own PR, exactly like a corpus
 * refresh: new strings shift 24 gates' snapshots at once, and that diff must be
 * READ BY DIRECTION rather than regenerated past. `vitest -u` cannot tell an
 * arrival (the feature) from a departure (a regression).
 *
 * ── WHY THIS IS NOT A `.mjs` SCRIPT ANY MORE (#1242) ──────────────────────
 * It was `packages/app/scripts/harvest-mini-corpus.mjs`, run by node. The
 * admission rule below needs the product's own resolver, which lives in
 * TypeScript, and plain node cannot get to it: importing the `@stave/editor`
 * barrel from node fails at `@kabelsalat/web` (a browser-only export), and the
 * repo has no `tsx`. Restating the resolver's rule here in JS was the other
 * option and is the second-oracle failure this tree keeps re-learning — it
 * answers confidently and diverges silently ([[P519]]). So the harvest moved to
 * where the rule already is. Two things came free: it now parses documents with
 * `parseTopLevel` — the SAME acorn options the product uses — where the script
 * passed `sourceType: 'module'` and silently disagreed on 3 strings; and the
 * harvest can carry assertions, which a script could not.
 *
 * ── TWO PROPOSERS, ONE CORPUS (#1242) ─────────────────────────────────────
 * The script admitted the first literal argument of `s`/`sound`/`note`/`n`.
 * That is bit-for-bit the rule #1240 replaced in the product, so every string
 * the resolver newly reaches was invisible to all 24 gates.
 *
 * The obvious repair — swap in the product's rule — was MEASURED first
 * (`_1242-harvest-reach.spec.ts`) and is wrong. Over the same 360 tunes it is a
 * ROTATION, not a widening:
 *
 *     old literal rule                          1538
 *     unit walk, surface-routed                 1202
 *       arrivals  (walk \ literal)                97   <- what #1240 bought
 *       departures (literal \ walk)              432   <- what a swap would cost
 *     union                                     1635
 *
 * They answer different questions and neither contains the other. The literal
 * rule asks PER LITERAL — every `s(…)`/`note(…)` call anywhere, several to a
 * statement. The unit walk asks PER UNIT — one per top-level statement plus
 * nested combinator voices, and it REFUSES a unit whose span is ambiguous
 * (`resolveMini`'s `alternatives` gate, which is its soundness condition). So
 * the corpus takes BOTH, and each entry records which proposer found it.
 *
 * ── WHAT THE UNIT WALK IS FILTERED BY, AND WHY BOTH FILTERS ARE LOAD-BEARING ─
 *  1. SURFACE. Only units the panel would route to a notation surface, i.e.
 *     `unitsWithStatus` status `note` or `note-broken` — which is exactly
 *     `chunkSurface(unit) !== null`, the one predicate the panel itself asks
 *     ([[PV327]]). Unfiltered, the walk admits 448 rather than 97, of which 284
 *     are `samples("github:…")` bank URLs. A corpus that gates the NOTE-CONTENT
 *     readers must not be scored on sample-bank paths.
 *  2. REIFIABILITY. Only spans the transpiler actually turns into a Pattern.
 *     `SpanIndex` deliberately offers SINGLE-quoted literals too (its own
 *     docblock: "mini-parsed at runtime like any other string"), and the parse
 *     proposer will resolve one. The transpiler does not rewrite them
 *     (`isStringWithDoubleQuotes` = `node.raw[0] === '"'`, and nothing else), so
 *     admitting them puts strings in the corpus that no reader is ever handed:
 *     measured, exactly 2 — a csound `.orc` URL from `loadOrc('github:…')` and a
 *     bytebeat expression `s('t*(t+(t<<7)^…)')`.
 *     ⚠ Those two docblocks disagree about what runtime does with a
 *     single-quoted string. Unresolved, and deliberately not settled here: this
 *     file keeps the TRANSPILER-grounded rule, which is the cited one and the
 *     conservative one.
 *
 * ── WHICH LITERALS ARE MINI — asked of the transpiler, not guessed (#1037) ──
 * This used to be a regex, `\b(?:s|sound|note|n)\(\s*"([^"\\]*)"`, carrying
 * three restrictions its own comment listed honestly: double quotes only, no
 * escapes, first argument only. What nobody had measured was that the excluded
 * set is not a smaller sample of the same thing — the backtick strings it
 * stepped over are ten times longer, 86% multi-line against 0%, and twice as
 * likely to carry an alternation. Backticks are how people write multi-cycle
 * patterns, so the corpus was biased away from exactly the material the readers
 * are weakest on.
 *
 * The rule is taken from `@strudel/transpiler/transpiler.mjs` rather than
 * approximated:
 *   - `isBackTickString` (:382) — a TemplateLiteral whose parent is not a tagged
 *     template IS reified, from `quasis[0].value.raw`. So backticks are in.
 *   - `isStringWithDoubleQuotes` (:375) — `node.raw[0] === '"'`, and nothing
 *     else. Single quotes are NOT reified, which is why the codebase writes
 *     `.p('name')` with single quotes for string identifiers.
 *
 * Two consequences that had to be MEASURED, because the first cut of this lost
 * 180 strings the regex had:
 *   - **A commented-out call is not an ask.** 96 of those 180 were inside `//`
 *     lines. The regex scanned raw text; the AST never sees them. The old
 *     corpus was partly a record of code nobody runs.
 *   - **The argument is often a CHAIN.** `.s("<a b>".slow(64))` puts a
 *     CallExpression there and the transpiler still reifies the string inside
 *     it. `rootLiteral` walks to the leftmost literal. Missing this cost 35.
 *
 * And a document that does not PARSE still has to contribute, or the corpus
 * silently loses whatever is inside it. Those fall back to the old regex, and
 * the count of fallbacks is REPORTED rather than swallowed.
 *
 * STILL DELIBERATELY EXCLUDED, and stated rather than hidden:
 *   - `.struct("x*4")`, `.mask(…)`, `.scale(…)` as the LITERAL proposer's own
 *     find. They are patterns, but not note content. (They do appear as a unit's
 *     HEAD in the walk's arrivals — `"c4, eb4, g4, bb4".mask("<1 0 0 0>")` — but
 *     there the admitted span is the root literal, which IS the note content.)
 *   - interpolated templates — Strudel reifies only `quasis[0]`, so `` `a${x}b` ``
 *     plays as `a`. Harvesting that fragment would put a string in the corpus
 *     that no author wrote and no reader should be judged on.
 *
 * ── COUNTS ARE PER DISTINCT TUNE, AND `uses` IS GONE ──────────────────────
 * Several `.bakery-runs/` files are RE-FETCHES of the same offset window: 24
 * files on disk hold 1820 rows of 360 distinct tunes. The script deduped
 * `distinctTunes` and left `uses` and `unparsedDocs` counting ROWS, so both were
 * inflated by whatever re-fetches happened to be on the machine — `unparsedDocs`
 * read 25 against 7 files and 49 against 24, for the same 360 tunes. Everything
 * here is keyed on the distinct tune hash instead; `unparsedDocs` now reads 10.
 *
 * `uses` was DROPPED rather than repaired. Under one proposer it meant "times
 * this string was written"; under two there is no honest definition — a string
 * both proposers find in one document would count twice, and counting it once
 * makes it `tunes` with extra steps. Checked before removing ([[P538]]'s
 * discipline, not a guess): no consumer reads it, every one of the 24 gates and
 * 39 probes destructures `{ mini }` alone, and `mini-corpus.test.ts` reads only
 * `distinct` and `distinctTunes`. `tunes` — distinct tunes carrying the string —
 * survives and is the number anyone actually wanted.
 *
 * ⚠ Verified before any of this: the harvested mini LIST is byte-identical
 * across the 7-file and 24-file input sets, so the input set is CONTENT-NEUTRAL
 * and this run's diff is attributable to the RULE alone.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unitsWithStatus } from './editCoverage'
import { parseTopLevel } from '../../../editor/src/visualEdit/chunkDetect'

/* eslint-disable @typescript-eslint/no-explicit-any */

const here = path.dirname(fileURLToPath(import.meta.url))
const inDir = path.resolve(process.env.HARVEST_IN ?? path.join(here, '.bakery-runs'))
const outFile = path.resolve(process.env.HARVEST_OUT ?? path.join(here, 'mini-corpus.json'))

/** the call heads whose first argument the LITERAL proposer offers */
const HEADS = new Set(['s', 'sound', 'note', 'n'])

/** the OLD net, kept for documents acorn cannot parse — never the primary path */
const MINI_ARG_FALLBACK = /\b(?:s|sound|note|n)\(\s*"([^"\\]*)"/g

/** statuses whose content a notation surface is asked to open — `chunkSurface(u) !== null` */
const ASKED = new Set(['note', 'note-broken'])

/**
 * The string a chained first argument is rooted at. `"<a b>".slow(64)` parses as
 * a CallExpression over a MemberExpression over the Literal, and the transpiler
 * rewrites that Literal exactly as it would a bare one.
 */
function rootLiteral(node: any): string | null {
  let n = node
  while (n) {
    if (n.type === 'Literal')
      return typeof n.value === 'string' && n.raw?.[0] === '"' ? n.value : null
    if (n.type === 'TemplateLiteral')
      return n.expressions.length === 0 ? n.quasis[0].value.raw : null
    if (n.type === 'CallExpression') n = n.callee
    else if (n.type === 'MemberExpression') n = n.object
    else return null
  }
  return null
}

/** Is this node a literal the TRANSPILER reifies into a Pattern? */
function isReified(node: any): boolean {
  if (node.type === 'Literal') return typeof node.value === 'string' && node.raw?.[0] === '"'
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0
  return false
}

function walkAst(node: any, fn: (n: any) => void): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) return void node.forEach((n) => walkAst(n, fn))
  if (typeof node.type !== 'string') return
  fn(node)
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue
    walkAst(node[k], fn)
  }
}

type Found = { mini: string; via: 'literal' | 'unit' }

/**
 * Every mini string one document contributes, tagged by which proposer found
 * it. `unparsed` is set when the document did not parse and the text fallback
 * answered instead — reported, never swallowed.
 */
function minisIn(code: string): { found: Found[]; unparsed: boolean } {
  const stmts = parseTopLevel(code)
  if (!stmts) {
    const found: Found[] = []
    for (const m of code.matchAll(MINI_ARG_FALLBACK)) found.push({ mini: m[1], via: 'literal' })
    return { found, unparsed: true }
  }

  const found: Found[] = []

  // PROPOSER 1 — the literal walk. Every reified first argument of a content head.
  for (const stmt of stmts) {
    walkAst(stmt, (node) => {
      if (node.type !== 'CallExpression' || node.arguments.length === 0) return
      const c = node.callee
      const name =
        c?.type === 'Identifier'
          ? c.name
          : c?.type === 'MemberExpression' && c.property?.type === 'Identifier'
            ? c.property.name
            : null
      if (!name || !HEADS.has(name)) return
      const lit = rootLiteral(node.arguments[0])
      if (lit !== null) found.push({ mini: lit, via: 'literal' })
    })
  }

  // The interiors of every literal the transpiler reifies, so a resolved span
  // can be checked against the transpiler's rule rather than against a quote
  // character. `literalInterior` is `[start + 1, end - 1]`; matching that here
  // is what makes the key comparable to a unit's `miniRange`.
  const reified = new Set<string>()
  for (const stmt of stmts) {
    walkAst(stmt, (node) => {
      if (isReified(node)) reified.add(`${node.start + 1}-${node.end - 1}`)
    })
  }

  // PROPOSER 2 — the product's unit walk, through the harness's own enumerator
  // so there is no second copy of `collectUnits`/`classifyUnit` beside it.
  for (const { unit, status } of unitsWithStatus(code)) {
    if (!ASKED.has(status.status)) continue
    if (unit.miniString === null || unit.miniRange === null) continue
    if (!reified.has(`${unit.miniRange[0]}-${unit.miniRange[1]}`)) continue
    found.push({ mini: unit.miniString, via: 'unit' })
  }

  return { found, unparsed: false }
}

describe('harvest — regenerate mini-corpus.json from .bakery-runs', () => {
  it('writes the committed corpus', () => {
    const files = fs
      .readdirSync(inDir)
      .filter((f) => f.startsWith('edit-samples-') && f.endsWith('.json'))
      .sort()
    expect(files.length, `No edit-samples-*.json in ${inDir}`).toBeGreaterThan(0)

    /** tune hash → document source. Re-fetches of one tune collapse here. */
    const byHash = new Map<string, string>()
    const sources: { file: string; upstreamSha: string | null; offset: number | null; rows: number }[] = []
    for (const f of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(inDir, f), 'utf8'))
      const samples = raw.samples ?? raw
      sources.push({
        file: f,
        upstreamSha: raw.UPSTREAM_SHA ?? null,
        offset: raw.offset ?? null,
        rows: samples.length,
      })
      for (const s of samples) if (s.hash && !byHash.has(s.hash)) byHash.set(s.hash, String(s.code))
    }

    /** mini string → { tunes, via } */
    const seen = new Map<string, { tunes: Set<string>; via: Set<string> }>()
    let unparsedDocs = 0

    for (const [hash, code] of byHash) {
      const { found, unparsed } = minisIn(code)
      if (unparsed) unparsedDocs++
      for (const { mini, via } of found) {
        // A mini that is only whitespace carries nothing to draw and nothing to
        // round-trip; it is noise in a verdict snapshot.
        if (mini.trim() === '') continue
        let e = seen.get(mini)
        if (!e) seen.set(mini, (e = { tunes: new Set(), via: new Set() }))
        e.tunes.add(hash)
        e.via.add(via)
      }
    }

    // Sorted so the committed file — and every verdict snapshot keyed off it —
    // has a stable order. An unstable order turns every refresh into an
    // unreadable diff, which is how a gate stops being read.
    const minis = [...seen.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([mini, e]) => ({
        mini,
        tunes: e.tunes.size,
        via: e.via.has('literal') ? (e.via.has('unit') ? 'both' : 'literal') : 'unit',
      }))

    const viaTally = { literal: 0, unit: 0, both: 0 } as Record<string, number>
    for (const m of minis) viaTally[m.via]++

    const out = {
      _readme:
        'Distinct mini-notation strings harvested from real public Bakery tunes. ' +
        'Committed so the notation parsers are gated against what people actually ' +
        'write, not only against the curated .strudel fixtures. Regenerate with ' +
        'tests/parity-corpus/_harvest-mini-corpus.spec.ts; a refresh is its own PR ' +
        'and its snapshot diff must be read BY DIRECTION, never -u past.',
      harvestedFrom: sources,
      // DISTINCT, not the sum over `sources` — several sample files are
      // re-fetches of the same offset window, so summing double-counts. Every
      // count in this file is keyed on the distinct tune hash for that reason.
      distinctTunes: byHash.size,
      pattern:
        'Union of two proposers over each distinct tune (#1242). ' +
        'LITERAL: first argument of s/sound/note/n, when it is a double-quoted ' +
        'Literal or an uninterpolated TemplateLiteral — mirroring @strudel/transpiler ' +
        'isStringWithDoubleQuotes / isBackTickString. ' +
        'UNIT: the note content the product itself resolves for every unit the panel ' +
        'routes to a notation surface (chunkSurface != null), restricted to spans the ' +
        'transpiler reifies. Single-quoted strings are NOT mini and are excluded by both.',
      distinct: minis.length,
      via: viaTally,
      unparsedDocs,
      minis,
    }
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n')

    // eslint-disable-next-line no-console
    console.log(
      `\nsources : ${files.length} sample files over ${new Set(sources.map((s) => s.offset)).size}` +
        ` offset windows -> ${byHash.size} DISTINCT tunes` +
        ` (${sources.reduce((n, s) => n + s.rows, 0)} rows incl. re-fetches)\n` +
        `distinct: ${minis.length} mini strings ` +
        `(literal ${viaTally.literal}, unit ${viaTally.unit}, both ${viaTally.both})\n` +
        `unparsed: ${unparsedDocs} distinct tune(s) fell back to the text scan\n` +
        `out     : ${path.relative(process.cwd(), outFile)}`,
    )

    // CONTROLS — a harvest that silently collected nothing from one proposer
    // would look exactly like a healthy one in the file it writes, because the
    // other proposer's strings are still there. Assert BOTH are non-vacuous.
    expect(viaTally.literal + viaTally.both, 'literal proposer found nothing').toBeGreaterThan(1000)
    expect(viaTally.unit + viaTally.both, 'unit proposer found nothing').toBeGreaterThan(500)
    expect(minis.length).toBeGreaterThan(1000)
    expect(byHash.size).toBeGreaterThan(300)
  })
})
