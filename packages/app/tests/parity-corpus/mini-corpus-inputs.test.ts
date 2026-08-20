/**
 * mini-corpus-inputs.test.ts — the corpus's inputs are what the corpus says
 * they are (#1281).
 *
 * WHY THIS GATE EXISTS. `mini-corpus.json` is read by every parity-corpus
 * gate, and until now its input set was chosen by a bare glob over the gitignored
 * `.bakery-runs/`. Two things could go wrong in silence:
 *
 *   - the inputs could be LOST, and nothing recorded enough to rebuild them
 *   - the inputs could WIDEN, because one run of the live sampler drops a new
 *     `edit-samples-*.json` into the same directory and the next harvest's
 *     glob simply picks it up — inside a diff that looks like a refresh
 *
 * `mini-corpus-inputs.json` closes both: it records each input's sha256 and
 * the ordered tune hashes it holds, which is enough to rebuild the inputs
 * exactly (`mini-corpus-manifest.mjs restore`), and it gives this gate a
 * committed answer key to check the directory against.
 *
 * THE THREE-WAY CHECK, AND WHY IT IS NOT CIRCULAR. The manifest is generated
 * FROM the directory, so "directory matches manifest" alone would certify
 * whatever the generator last wrote. The third party is `mini-corpus.json`'s
 * own `harvestedFrom`, which only a full harvest can rewrite. Requiring all
 * three to agree means regenerating the manifest cannot quietly bless a
 * changed input set — the harvested artifact has to move too, and that is a
 * reviewable diff in the file the 25 gates actually read.
 *
 * AND THE FOURTH ARM ASKS THE OTHER DIRECTION (#1305). The three arms above
 * establish that the corpus and the manifest describe the same INPUT SET. They
 * say nothing about whether an individual harvested fragment can be traced back
 * to the tune it came from — and it could not, because each row recorded only a
 * COUNT of source tunes. Now that rows carry `tuneHashes`, the fourth arm holds
 * those citations against the manifest's credits, which is what makes crediting
 * an author or honouring a takedown a per-ITEM operation instead of a full
 * regeneration of a public 300KB artifact.
 *
 * WHAT THE LAST ARM CANNOT DO. `.bakery-runs/` is gitignored — deliberately,
 * because these are unreviewed community tunes and the overwhelming majority
 * declare no licence (see mini-corpus-manifest.mjs). So on any machine without the
 * archive that arm SKIPS, and vitest reports it as skipped rather than
 * passing. That is the honest shape: the arm guards the maintainer machine,
 * which is the only place the directory can widen in the first place.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
// The generator's OWN rule, imported rather than restated — a second copy here
// could drift from the manifest it is checking, silently. Three ungated `_*`
// probes still carry their own copies; they read the directory but assert
// nothing about its membership.
import { isInputFile } from '../../scripts/mini-corpus-manifest.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'mini-corpus-inputs.json'), 'utf8'))
const corpus = JSON.parse(fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'))

const runsDir = path.join(here, '.bakery-runs')
const hasArchive = fs.existsSync(runsDir)

describe('mini-corpus inputs — provenance and reproducibility', () => {
  it('the manifest and the harvested corpus name the SAME inputs, in the same order', () => {
    // harvestedFrom can only be rewritten by a full harvest, so this is the
    // arm that stops a regenerated manifest from blessing a changed input set.
    expect(manifest.inputs.map((i: { file: string }) => i.file)).toEqual(
      corpus.harvestedFrom.map((h: { file: string }) => h.file),
    )
    expect(manifest.inputs.map((i: { rows: number }) => i.rows)).toEqual(
      corpus.harvestedFrom.map((h: { rows: number }) => h.rows),
    )
    expect(manifest.inputs.map((i: { offset: number }) => i.offset)).toEqual(
      corpus.harvestedFrom.map((h: { offset: number }) => h.offset),
    )
  })

  it('the manifest reconciles with itself — totals, row counts and credit coverage', () => {
    const rows = manifest.inputs.reduce((n: number, i: { rows: number }) => n + i.rows, 0)
    const hashLists = manifest.inputs.reduce((n: number, i: { hashes: string[] }) => n + i.hashes.length, 0)
    const distinct = new Set(manifest.inputs.flatMap((i: { hashes: string[] }) => i.hashes))

    // A hand-edited total, or a row count that stopped matching the hashes
    // recorded beside it, fails here rather than at the next restore.
    expect(hashLists).toBe(rows)
    expect(manifest.totals.rows).toBe(rows)
    expect(manifest.totals.inputFiles).toBe(manifest.inputs.length)
    expect(manifest.totals.distinctTunes).toBe(distinct.size)
    expect(manifest.credits).toHaveLength(distinct.size)
    expect(new Set(manifest.credits.map((c: { hash: string }) => c.hash))).toEqual(distinct)
  })

  it('every tune carries a permalink so any use of it can credit its author', () => {
    for (const credit of manifest.credits as { hash: string; url: string }[]) {
      expect(credit.url).toBe(`https://strudel.cc/?${credit.hash}`)
    }
    // Recorded only where the tune itself states them — `null` is the honest
    // answer and is the reason these files are not vendored into the repo.
    const declared = manifest.credits.filter((c: { licence: string | null }) => c.licence).length
    const titled = manifest.credits.filter((c: { title: string | null }) => c.title).length
    expect(manifest.totals.withLicence).toBe(declared)
    expect(manifest.totals.withTitle).toBe(titled)
    expect(declared).toBeLessThan(manifest.credits.length) // most state nothing — see the docblock
  })

  it('every harvested fragment can be credited — its citations resolve into the manifest', () => {
    /*
     * THE JOIN (#1305). `mini-corpus.json` is tracked and public, and holds
     * 73,709 characters of verbatim mini-notation from tunes that mostly
     * declare no licence. Until each row carried `tuneHashes` it recorded only
     * HOW MANY tunes a string came from, so the corpus could cite the set and
     * never the fragment — and attribution and takedown are both per-ITEM.
     *
     * WHY THIS IS NOT CIRCULAR, the same argument as the arm above: the two
     * files are written by two different programs from the same directory —
     * the corpus by `_harvest-mini-corpus.spec.ts`, the manifest by
     * `mini-corpus-manifest.mjs`. Requiring the corpus's citations to land in
     * the manifest's credits means a harvest run against a widened archive
     * cannot pass while the manifest still describes the old one.
     */
    const credited = new Set((manifest.credits as { hash: string }[]).map((c) => c.hash))
    const rows = corpus.minis as { mini: string; tunes: number; tuneHashes: string[] }[]

    // `tunes` is kept beside `tuneHashes` deliberately — two derivations of one
    // fact, so a hand-edit to either is caught here rather than believed.
    //
    // The COUNT leads the string and the mini is JSON-escaped to one line, both
    // for the failure message rather than for the check: minis are multi-line
    // and vitest truncates the display at ~40 characters, so a row identifier
    // placed first pushes the two numbers — the only part that differs — off
    // the end, and the arm reddens without saying what is wrong.
    // `?? []` rather than a bare `.length`: a row that lost the KEY entirely —
    // a corpus written by a pre-#1305 harvest, or a hand-truncation — would
    // otherwise throw a bare TypeError from inside the loop, which names no row
    // and defeats the message this arm is built around. Absent reads as 0 here,
    // and 0 is exactly the failure the arm wants to report.
    rows.forEach((row, i) => {
      const id = `citations for row ${i} ${JSON.stringify(row.mini.slice(0, 24))}`
      expect(`${(row.tuneHashes ?? []).length} ${id}`).toBe(`${row.tunes} ${id}`)
    })

    const cited = new Set(rows.flatMap((r) => r.tuneHashes))
    const unresolvable = [...cited].filter((h) => !credited.has(h))
    expect(unresolvable, 'fragments cite tunes the manifest cannot credit').toEqual([])

    // NON-VACUOUS. `unresolvable` is empty for a corpus that cites nothing at
    // all, so the population is asserted rather than assumed. Unlike in the
    // harvest, these CAN fail here: this arm reads a committed file it did not
    // write, so an emptied or truncated `tuneHashes` reaches it.
    //
    // These read `.tuneHashes` bare, and that is safe only because the count
    // arm above uses `?? []` and therefore reddens FIRST on a row that lost the
    // key entirely — `tunes` is never 0, so absent-reads-as-0 always mismatches
    // there and aborts. The safety is in the ORDER, which is why it is written
    // down rather than left for the next reader to rediscover from a TypeError.
    expect(rows.every((r) => r.tuneHashes.length > 0), 'a fragment cites no tune at all').toBe(true)
    expect(rows.reduce((n, r) => n + r.tuneHashes.length, 0)).toBeGreaterThan(2000)
    expect(cited.size).toBeGreaterThan(300)

    // CONTROL — the membership test must be able to say no, or `unresolvable`
    // is empty for a reason that has nothing to do with the corpus. Mutating a
    // hash the corpus really cites is the cheapest thing that MUST fail: every
    // credit hash is 12 characters, so the 13-character mutant cannot collide
    // with a real one.
    //
    // The positive half of this pair — asserting the UNMUTATED hash IS credited
    // — was deliberately not written. `real` is drawn from `cited`, so with
    // `unresolvable` empty above it that assertion cannot fail, and this file
    // already dropped three of exactly that kind. A control needs the direction
    // that can say no; the direction that says yes is the arm above.
    const real = rows[0].tuneHashes[0]
    expect(credited.has(`${real}x`), 'the membership test cannot say no').toBe(false)

    // Not every tune contributes a fragment, and that is the admission rule
    // rather than a loss: measured 2026-08-20, 349 of 360 are cited and the
    // 11 that are not are documents with no note content to harvest — two are
    // `// @version 1.1` and nothing else, several are bytebeat/`dough` DSP or
    // plain JS helpers, and two are entirely commented out, which the AST
    // proposer never sees (see the harvest's docblock). Stated rather than
    // asserted: `cited.size <= credited.size` follows from `unresolvable`
    // being empty, so pinning it would add a line that cannot fail, and
    // pinning 349 would fail on the next legitimate refresh.
  })

  it.skipIf(!hasArchive)('the archive on disk is exactly the input set the manifest records', () => {
    const onDisk = fs.readdirSync(runsDir).filter(isInputFile).sort()

    // A live sampler run drops a NEW edit-samples-*.json here. That is the
    // silent widening this arm exists to catch, and it fails by name.
    expect(onDisk).toEqual(manifest.inputs.map((i: { file: string }) => i.file))

    for (const input of manifest.inputs as { file: string; sha256: string; bytes: number }[]) {
      const raw = fs.readFileSync(path.join(runsDir, input.file))
      expect(`${input.file} ${raw.length}`).toBe(`${input.file} ${input.bytes}`)
      expect(`${input.file} ${crypto.createHash('sha256').update(raw).digest('hex')}`).toBe(
        `${input.file} ${input.sha256}`,
      )
    }
  })
})
