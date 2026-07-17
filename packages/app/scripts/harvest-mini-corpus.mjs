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

const here = path.dirname(fileURLToPath(import.meta.url))
const corpusDir = path.resolve(here, '..', 'tests', 'parity-corpus')

const args = process.argv.slice(2)
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt
}
const inDir = path.resolve(argOf('--in', path.join(corpusDir, '.bakery-runs')))
const outFile = path.resolve(argOf('--out', path.join(corpusDir, 'mini-corpus.json')))

/**
 * The mini strings a grid/roll can be asked to open: the double-quoted first
 * argument of `s`/`sound`/`note`/`n`. That is exactly the set the notation
 * models parse, which is what makes this corpus the right net for that code.
 *
 * Deliberately narrow, and the limits are worth stating rather than hiding:
 *   - double quotes only — `'...'` and backticks are not harvested
 *   - no escapes (`[^"\\]*`) — a mini containing `\"` is skipped
 *   - first argument only — `.struct("x*4")` / `.mask(...)` are NOT collected
 * Widening any of these grows the corpus and moves the snapshot; that is a
 * deliberate change, not a silent one.
 */
const MINI_ARG = /\b(?:s|sound|note|n)\(\s*"([^"\\]*)"/g

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
      for (const m of String(s.code).matchAll(MINI_ARG)) {
        const mini = m[1]
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
    pattern: MINI_ARG.source,
    distinct: minis.length,
    minis,
  }
  await fs.writeFile(outFile, JSON.stringify(out, null, 2) + '\n')

  const totalUses = minis.reduce((n, m) => n + m.uses, 0)
  console.log(
    `sources : ${files.length} sample files over ${new Set(sources.map((s) => s.offset)).size} offset windows` +
      ` -> ${distinctTunes.size} DISTINCT tunes (${sources.reduce((n, s) => n + s.tunes, 0)} rows incl. re-fetches)`,
  )
  console.log(`distinct: ${minis.length} mini strings (${totalUses} uses)`)
  console.log(`out     : ${path.relative(process.cwd(), outFile)}`)
}

main().catch((err) => {
  console.error('harvest-mini-corpus failed:', err.message)
  process.exit(1)
})
