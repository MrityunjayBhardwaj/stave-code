/**
 * roll-cap-sweep.test.ts — the piano roll's leaf period cap, measured on BOTH of the
 * populations it governs, reported separately and never netted (#1020).
 *
 * WHY THIS FILE EXISTS. `LEAF_PROJECT_BARS.roll` was set to 4 by a sweep at 4/6/8/12/16
 * that showed exactly zero gain at every value. That sweep ran through
 * `writer-reach.test.ts`, whose population is one line — `if (core.ok) continue`. So it
 * asked "does raising the roll's cap help the patterns the syntactic core REFUSES?" and
 * the honest answer was no. **A gate defined as another gate's complement carries a
 * population restriction that none of its numbers mention** ([[P345]]): the other half —
 * the 414 roll asks the core SERVES — was never swept, and there the same cap is the
 * single largest blocker on the reach the core is the sole provider of.
 *
 * So this gate sweeps both:
 *
 *   POPULATION A — core-REFUSED (`parsePianoRollCore` says no).  `writer-reach`'s
 *                  population. What a cap raise BUYS on top of what already ships.
 *   POPULATION B — core-SERVED (`parsePianoRollCore` says yes).  The writer census's
 *                  population. What a cap raise SAVES when the core is deleted (#1012).
 *
 * They are reported as two numbers with their populations named. A single netted figure
 * is the exact error this file was filed to undo, and it would hide the finding: the two
 * populations move in opposite directions because they are made of different notation —
 * A's long-period roll patterns are `!n`/`@n` REPETITIONS whose notes share one source
 * atom, B's are branch ALTERNATIONS whose notes each own their token.
 *
 * REACH IS NOT ENOUGH, AND THAT IS THE OTHER HALF OF THE ORIGINAL DECISION. The cap was
 * left at 4 partly because the views a raise opened were only **13–58% live** — a roll
 * where almost nothing the user drags moves reads as broken, which is worse than an
 * honest refusal ([[PV222]]). So every view this reports carries `liveness` (the
 * fraction of its cleanly-singleton notes whose own delete round-trips through the
 * engine) and `structured` (more than one note — a one-note roll is a correct model and
 * a useless surface). `liveness` comes from `engineEditOracle.ts`, so the sweep and the
 * reach gate cannot disagree about what "an edit survived" means; `structured` comes
 * from `notation/model.ts`'s `hasStructure`, so this sweep and the writer census cannot
 * disagree about what "worth showing" means (#1259 — it used to be spelled here, which
 * is what that sentence originally papered over by naming one source for both).
 *
 * HOW A SWEEP IS RUN. The cap is a module constant, deliberately — it is a shipped
 * bound, not a knob, and threading a parameter through the writer to sweep it would mean
 * measuring a code path production never takes. To sweep, set the constant, run this
 * file, repeat. `scripts/roll-cap-sweep.mjs` drives that and diffs the emitted rows PER
 * ASK, which is what makes "additive only" checkable rather than assertable.
 *
 * The cap this run measured is READ BACK OUT OF THE SHIPPED REFUSAL SENTENCE rather than
 * taken from the environment: a sweep that labels its rows from its own driver can
 * silently attribute one cap's numbers to another, and an instrument's label is exactly
 * the kind of claim that has been wrong here before ([[P347]]).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PROJECTION_PERIOD_BOUNDS,
  parsePianoRoll,
  parsePianoRollCore,
  projectPianoRollDerived,
} from '../../../editor/src/visualEdit/notation/parse'
import { hasStructure } from '../../../editor/src/visualEdit/notation/model'
import type { PianoRollModel, StepGridModel } from '../../../editor/src/visualEdit/notation/model'
import { ROLL_SURFACE, liveness, probeEdit } from './engineEditOracle'
import { truePeriod } from './enginePeriod'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/** the census's fallback: population B's asks have no core refusal to carry */
const NO_CORE_REFUSAL = { ok: false as const, reason: '(core served this — no refusal)' }

/**
 * The cap this run actually measured, read out of the shipped code.
 *
 * `gateReason('unstable-period', 'roll')` prints the LEAF cap verbatim, so a pattern
 * whose period is past any plausible cap makes the writer say its own bound out loud.
 * Asked of the writer rather than trusted from `process.env`, because the one thing a
 * sweep must not get wrong is which cap a row belongs to.
 */
function shippedRollCap(): number {
  // period 26 — past `PERIOD_SEARCH`, so past every admissible cap at every sweep value
  const past = '<0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25>'
  const r = projectPianoRollDerived(past, NO_CORE_REFUSAL)
  if (r.ok) throw new Error('cap probe opened a view — the probe pattern is no longer past the cap')
  if (r.gate !== 'unstable-period')
    throw new Error(`cap probe stopped at ${r.gate}, not the period gate — cannot read the cap`)
  const m = /within (\d+) bars/.exec(r.reason)
  if (!m) throw new Error(`cap probe's sentence does not name a bound: ${r.reason}`)
  return Number(m[1])
}

const CAP = shippedRollCap()

type Pop = 'A-core-refused' | 'B-core-served'
type Outcome = 'transfers' | 'no-view' | 'view-corrupts' | 'no-probe'

interface Row {
  pop: Pop
  mini: string
  outcome: Outcome
  /** the gate that stopped it, when nothing opened */
  gate?: string
  /** which derived writer served it */
  writer?: 'leaf' | 'element'
  /**
   * More than one note — a one-note roll is a correct model and a useless surface.
   *
   * SHARED, not restated (#1259). This was a copy: the census's `hasStructure` was
   * surface-generic and unexported, so its roll clause was spelled out again here with
   * a note saying the two must move together or the two documents start quoting
   * different gains from the same run. That coupling is now structural — the predicate
   * has one home in `notation/model.ts` and this file calls it with `'roll'`.
   */
  structured?: boolean
  notes?: number
  /** notes whose own delete round-trips / notes cleanly probeable; null when none are */
  alive?: number
  probed?: number
  /** notes that MIS-WRITE — a dead cell and a lying cell are not the same fact */
  liveCorrupt?: number
  /** the engine's own period, for the asks the cap governs */
  period?: number
}

/**
 * One population's rows.
 *
 * `A` asks the SHIPPED path (`parsePianoRoll`, core → projection) because that is what
 * a user gets. `B` asks `projectPianoRollDerived`, the writer chain BELOW the core,
 * because the question there is what survives the core being deleted — asking the
 * shipped path would just return the core's own model and measure nothing.
 */
function sweep(pop: Pop): Row[] {
  const out: Row[] = []
  for (const mini of minis) {
    const core = parsePianoRollCore(mini)
    if (core.ok !== (pop === 'B-core-served')) continue

    const r =
      pop === 'A-core-refused' ? parsePianoRoll(mini) : projectPianoRollDerived(mini, NO_CORE_REFUSAL)

    if (!r.ok) {
      const gate = r.gate ?? '(no gate — did not reify)'
      out.push({
        pop,
        mini,
        outcome: 'no-view',
        gate,
        // the period is what the cap is ABOUT; computed only where it can decide
        // something, because 48 engine queries per mini over 1500 minis is not free
        ...(gate === 'unstable-period' ? { period: truePeriod(mini) } : {}),
      })
      continue
    }
    const m = r.model as StepGridModel & PianoRollModel
    const writer = m.leafSource ? 'leaf' : 'element'
    const probe = probeEdit(mini, m, ROLL_SURFACE)
    const live = liveness(mini, m, ROLL_SURFACE)
    out.push({
      pop,
      mini,
      outcome:
        probe.verdict === 'ok' ? 'transfers' : probe.verdict === 'corrupt' ? 'view-corrupts' : 'no-probe',
      writer,
      structured: hasStructure(m, 'roll'),
      notes: m.notes?.length ?? 0,
      ...(live ? { alive: live.alive, probed: live.probed, liveCorrupt: live.corrupt } : {}),
      // a leaf-served view is one the cap could have decided; the element writer's own
      // cap never moves in this sweep, so its rows are carried as the control arm
      ...(writer === 'leaf' ? { period: truePeriod(mini) } : {}),
    })
  }
  return out
}

const pct = (a: number, b: number): string => (b === 0 ? '   n/a' : `${((a / b) * 100).toFixed(1)}%`)

function report(rows: Row[], pop: Pop): void {
  const by = (o: Outcome) => rows.filter((r) => r.outcome === o)
  const opened = rows.filter((r) => r.outcome !== 'no-view')
  const leaf = opened.filter((r) => r.writer === 'leaf')
  const gates = new Map<string, number>()
  for (const r of by('no-view')) gates.set(r.gate!, (gates.get(r.gate!) ?? 0) + 1)

  console.log(`\n===== ROLL CAP ${CAP} — POPULATION ${pop} (${rows.length} asks) =====`)
  console.log(`  opened by a derived writer      ${opened.length}   (${leaf.length} leaf / ${opened.length - leaf.length} element)`)
  console.log(`  transfers (edit survives)       ${by('transfers').length}   ${pct(by('transfers').length, rows.length)}`)
  console.log(`  no view at all                  ${by('no-view').length}`)
  console.log(`  view CORRUPTS                   ${by('view-corrupts').length}   <-- must be 0`)
  console.log(`  unverified (no clean probe)     ${by('no-probe').length}`)
  console.log(`  -- what stopped the ones with no view --`)
  for (const [k, v] of [...gates.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`     ${String(v).padStart(4)}x  ${k}`)

  // THE OTHER HALF OF THE DECISION: is the view worth showing? Reported for the LEAF
  // writer only — it is the one this cap governs.
  const withLive = leaf.filter((r) => r.probed !== undefined && r.probed > 0)
  const alive = withLive.reduce((n, r) => n + r.alive!, 0)
  const probed = withLive.reduce((n, r) => n + r.probed!, 0)
  const liveCorrupt = withLive.reduce((n, r) => n + (r.liveCorrupt ?? 0), 0)
  console.log(`  -- LEAF-served views: is the view worth showing --`)
  console.log(`     structured (>1 note)         ${leaf.filter((r) => r.structured).length} of ${leaf.length}`)
  console.log(`     notes that respond to a drag ${alive} of ${probed}   ${pct(alive, probed)} live`)
  console.log(`     notes that MIS-WRITE         ${liveCorrupt}   <-- the one-note probe cannot see these`)
  if (withLive.length) {
    const per = withLive
      .map((r) => ({ r, f: r.alive! / r.probed! }))
      .sort((a, b) => a.f - b.f)
    console.log(`     least-live views:`)
    for (const { r, f } of per.slice(0, 8))
      console.log(
        `       ${pct(r.alive!, r.probed!)} (${r.alive}/${r.probed}) period=${r.period ?? '?'}  ${JSON.stringify(r.mini)}`,
      )
  }
  // the asks the cap is ABOUT, by where their true period falls relative to it
  const periodRows = by('no-view').filter((r) => r.gate === 'unstable-period')
  const within = periodRows.filter((r) => r.period! > 0 && r.period! <= CAP)
  const past = periodRows.filter((r) => r.period! > CAP)
  const aperiodic = periodRows.filter((r) => r.period === 0)
  console.log(`  -- refused for period: ${past.length} past cap ${CAP}, ${aperiodic.length} aperiodic, ${within.length} WITHIN the cap (must be 0) --`)
}

const rowsA = sweep('A-core-refused')
const rowsB = sweep('B-core-served')

describe(`the roll's leaf period cap at ${CAP}, on both populations it governs`, () => {
  it('reports each population separately, and neither may corrupt', () => {
    report(rowsA, 'A-core-refused')
    report(rowsB, 'B-core-served')

    // Emitted per ask so a sweep across caps can be diffed PER UNIT. "Additive only"
    // is a claim about individual asks and netting two totals cannot check it — an
    // ask lost and an ask gained show up as zero ([[PV233]]).
    const dir = path.join(corpusDir, '.roll-cap-runs')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, `cap-${CAP}.json`),
      JSON.stringify({ cap: CAP, rows: [...rowsA, ...rowsB] }, null, 1),
    )

    // THE MUST-NOT, at every cap: a derived view that mis-writes is worse than no view.
    for (const rows of [rowsA, rowsB])
      expect(
        rows.filter((r) => r.outcome === 'view-corrupts').map((r) => r.mini),
        'a derived roll view corrupts on edit',
      ).toEqual([])

    // …and the stronger form the reach gates cannot state, because they verify ONE note
    // per view: over EVERY cleanly-singleton note of every bar, nothing mis-writes. A
    // note may be declined — that is a dead cell, and the liveness figure above is what
    // reports it — but no note may write the document back wrong.
    for (const rows of [rowsA, rowsB])
      expect(
        rows.filter((r) => (r.liveCorrupt ?? 0) > 0).map((r) => r.mini),
        'a note this view offers mis-writes, and the one-note probe does not reach it',
      ).toEqual([])
  })

  it('holds both populations at or above the reach they had when the cap was last decided', () => {
    // FLOORS, not snapshots — the same contract `writer-reach` uses. They are stated per
    // POPULATION on purpose: a single netted figure is what let one population's null
    // result decide this cap for both of them ([[P345]]), and these two move
    // independently. Raise them (never lower them silently) when a gain is shipped and
    // re-observed on the population it belongs to.
    const transfers = (rows: Row[]): number => rows.filter((r) => r.outcome === 'transfers').length

    // Population A is the one production reaches today. Its reach is `writer-reach`'s
    // roll floor and must agree with it — two gates disagreeing about the same number
    // over the same population would mean one of them is measuring something else.
    // ⚠ 75 -> 85 at #1037 (corpus rebuilt: backtick minis in, commented-out code
    // out). No runtime code changed in that diff, so the move is the population's.
    expect(transfers(rowsA), 'population A reach fell below the committed roll floor').toBeGreaterThanOrEqual(85)

    // Population B's is what the core's deletion would inherit (#1012). It is a floor
    // and not a target: it only becomes user-facing when the core stops answering first.
    // ⚠ 347 -> 339 at #1037, same cause and the opposite direction: population B is
    // the core-SERVED arm, and the commented-out strings this corpus stopped
    // harvesting were disproportionately simple ones the core served and the
    // projection transferred. Losing fiction lowers a count; it does not lower reach.
    expect(transfers(rowsB), 'population B transfer count fell').toBeGreaterThanOrEqual(339)
  })

  it('never admits a period it has not verified — the cap stays within half the probe window', () => {
    // `detectPeriod` confirms period p by finding a repeat among the probed cycles, so p
    // is only VERIFIED once 2p cycles were probed. At p = 16 against a 24-cycle probe,
    // cycles 8–15 are checked against nothing and a period-32 pattern masquerades as
    // period-16 — a view that silently stops being true one cycle past its own width.
    //
    // Taken from the shipped bound rather than written out as `12` (#1025). The literal
    // could not track `PERIOD_PROBE`, so raising the probe would have left this
    // stale-but-GREEN — a guard observable only in the passing state.
    expect(CAP).toBeLessThanOrEqual(PROJECTION_PERIOD_BOUNDS.maxVerifiedBars)

    // and the label is not a misattribution: nothing refused for period has a period
    // the cap would have admitted
    for (const rows of [rowsA, rowsB]) {
      const within = rows
        .filter((r) => r.gate === 'unstable-period' && r.period! > 0 && r.period! <= CAP)
        .map((r) => `period=${r.period} ${r.mini}`)
      expect(within, 'refused for period, but the period is within the cap').toEqual([])
    }
  })
})
