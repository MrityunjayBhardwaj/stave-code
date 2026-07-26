/**
 * writer-census-eval.test.ts — THE WIDENED DENOMINATOR for the reach transfer
 * (#1009, epic #1007 phase P3).
 *
 * ── WHY THIS ARM EXISTS ───────────────────────────────────────────────────────
 * `writer-census.test.ts` measures the transfer over `mini-corpus.json`: 1500 real
 * minis, harvested under the OLD parse-side admission. That population is
 * comparable to the committed floors and to the 234 the epic quotes, which is
 * exactly why it is the calibrated arm — and exactly why it cannot be the only one.
 *
 * A re-measurement over the same population as before can only confirm. The rule
 * ([[PK59]] step 1, as amended) is to ask what the instrument EXCLUDES, widen to
 * the whole population the code serves, and **write the prediction against the
 * widened set expecting the number to fall** — the excluded cases are excluded
 * because they are hard.
 *
 * What the mini-corpus excludes: it is a snapshot of the strings the parse-side
 * walk found. The eval-first resolver (#1006) picks the content span from
 * EVALUATION, so for the same documents it can hand a writer a different string —
 * a binding's initialiser, a chained argument, a root literal. This arm re-derives
 * the ask population that way, from the 150 real tunes, and asks the same
 * counterfactual.
 *
 * PREDICTION, written before the run: the transfer rate FALLS here, because the
 * spans eval newly admits are bound references and chained arguments, which is
 * where shared leaves and long periods live. **If it comes back HIGHER, the
 * widening did not reach the hard cases and what it excluded has to be found**
 * ([[P343]]) — a gate that gets stronger when the hard cases are added was not
 * measuring them.
 *
 * ── WHAT ACTUALLY HAPPENED, AND THE CORRECTION IT FORCED ──────────────────────
 * The rate came back HIGHER: **82.6%** (413/500) against the mini-corpus arm's
 * 79.3%. The pre-committed response was to find what the widening excluded, and it
 * did: **this arm is not a superset of the mini-corpus arm — it is SMALLER.** 671
 * distinct minis against 1500, because the resolver answers exactly ONCE PER UNIT
 * (the content span) while the corpus harvest collected every mini it could find.
 *
 * So "widen the denominator" was the wrong description of this arm from the start.
 * It is not wide-vs-narrow; it is two differently-drawn samples of the same corpus,
 * and what it therefore buys is a ROBUSTNESS check rather than a harder test:
 *
 *   mini-corpus (parse-side harvest)  965/1217 = 79.3%
 *   eval-first, all resolved minis    413/500  = 82.6%
 *   eval-first, ONLY the 275 minis the parse snapshot does not contain
 *                                      73/93   = 78.5%
 *
 * ⚠ THOSE THREE FIGURES ARE PRE-#1019 AND ARE KEPT ONLY TO PRESERVE THE REASONING
 * ABOVE. Naming the `:`-variant (#1019) moved BOTH arms, because both run the same
 * writers over differently-drawn ask populations.
 *
 * ⚠ AND THE "current values" THAT USED TO SIT HERE — 1058/1217, 430/500, 75/93 —
 * HAD THEMSELVES DRIFTED, to 1055/1217, 427/500 and 76/93, because the duration
 * axis (#1026) moved both arms again. That is the third time this file's headline
 * figures went stale in prose while the test stayed green. They are no longer
 * written here: every one of them is now a pinned constant at the foot of this
 * file, asserted exactly, so it cannot move without failing (#1031).
 *
 * And it cost this file its headline conclusion: the eval arm no longer scores
 * HIGHER than the harvest arm, it scores marginally lower. So that ordering was
 * never a population effect — it was one naming hole falling differently across two
 * heavily-overlapping samples. What survives is the weaker, real claim: the two large
 * populations agree inside ~1pp and the new slice sits ~6pp below them.
 *
 * NOTE FOR WHOEVER CHANGES THE WRITERS NEXT — REVERSED AT #1031. This file used to
 * assert only loose bounds (`> 200`, `>= 142`), so it did not turn red when the
 * rate moved; it did not turn red for #1019, and it did not turn red for #1026
 * either. Every printed headline is now pinned to an exact literal. If you have
 * changed a writer, a reader or the oracle, EXPECT this file to fail — that is the
 * point of it. Re-derive the numbers (measure the new value, then re-measure the
 * OLD value on the current tree, because the difference from the recorded figure
 * is someone else's drift and belongs to them), and update the pins in the same
 * commit that moves them, saying which direction and why.
 *
 * The transfer rate is close to a property of the corpus, not of how the
 * asks were drawn. That is a weaker claim than the prediction wanted and a more
 * useful one than either arm alone could support.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unitsWithStatus } from './editCoverage'
import {
  boot,
  evalLocations,
  loadCorpus,
} from '../../../editor/src/visualEdit/miniSource/__tests__/evalHarness'
import {
  admitProposals,
  QUERY_CYCLES,
} from '../../../editor/src/visualEdit/miniSource/evalProposals'
import { resolveMiniSource } from '../../../editor/src/visualEdit/miniSource/resolveMiniSource'
import { SpanIndex } from '../../../editor/src/visualEdit/miniSource/spanRole'
import {
  parseStepGridCore,
  parsePianoRollCore,
  projectStepGridDerived,
  projectPianoRollDerived,
} from '../../../editor/src/visualEdit/notation/parse'
import type { PianoRollModel, StepGridModel } from '../../../editor/src/visualEdit/notation/model'
import { GRID_SURFACE, ROLL_SURFACE, probeEdit } from './engineEditOracle'

const NO_CORE_REFUSAL = { ok: false as const, reason: '(core served this — no refusal)' }

/**
 * The mini-corpus arm's headline, READ from the artifact that arm emits rather
 * than transcribed into a comment here (#1031).
 *
 * It used to be a hand-copied literal, and it said `965/1217 = 79.3%` for three
 * merges after the real value had moved to 1055/1217 — a pre-fix number printed
 * one line away from post-fix ones, which is exactly the side-by-side-populations
 * error this whole comparison exists to guard against. The objection to deriving
 * it was that importing the other TEST file would make each unrunnable alone.
 * That objection does not apply to its committed OUTPUT: `WRITER-CENSUS.json` is
 * a file, reading it couples nothing, and a stale read is now impossible because
 * the figure IS the other arm's own output rather than a copy of it.
 */
function miniCorpusArm(): { transfers: number; asks: number; pct: string } {
  const j = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'WRITER-CENSUS.json'),
      'utf8',
    ),
  ) as { rows: { outcome: string }[] }
  const transfers = j.rows.filter((r) => r.outcome === 'transfers').length
  return {
    transfers,
    asks: j.rows.length,
    pct: ((100 * transfers) / j.rows.length).toFixed(1) + '%',
  }
}

const SURFACES = [
  {
    key: 'step' as const,
    core: parseStepGridCore,
    derived: (m: string) => projectStepGridDerived(m, NO_CORE_REFUSAL),
    edit: GRID_SURFACE,
  },
  {
    key: 'roll' as const,
    core: parsePianoRollCore,
    derived: (m: string) => projectPianoRollDerived(m, NO_CORE_REFUSAL),
    edit: ROLL_SURFACE,
  },
]

describe('the reach transfer over the EVAL-FIRST ask population', () => {
  it('re-derives the ask population from evaluation and reports how the rate moves', async () => {
    const docs = await loadCorpus()
    expect(docs.length).toBe(150)
    const { missingModules } = (await boot()) as { missingModules: string[] }

    /** every mini the eval-first resolver hands a writer, across all 150 documents */
    const resolved = new Set<string>()
    /** …and only the ones for units the parse-side walk did NOT already offer */
    const newlyAdmitted = new Set<string>()
    let evalOk = 0
    let units = 0
    let resolvedUnits = 0

    for (const doc of docs) {
      const us = unitsWithStatus(doc.code)
      const ev = await evalLocations(doc.code, QUERY_CYCLES)
      if (ev.ok) evalOk++
      if (us.length === 0) continue
      const index = SpanIndex.build(doc.code)
      const proposals = admitProposals({
        miniLocations: ev.declared,
        locations: ev.seen,
      }).proposals

      for (const { unit, status } of us) {
        units++
        const r = resolveMiniSource(doc.code, unit, { proposals, index })
        if (!r.ok) continue
        resolvedUnits++
        const text = r.text.trim()
        if (text === '') continue
        resolved.add(text)
        // A unit the coverage harness offers no view for today: its mini is not in
        // the parse-side snapshot, so this is the part of the population the
        // mini-corpus excludes.
        if (status.status !== 'note') newlyAdmitted.add(text)
      }
    }

    /** run the census counterfactual over an arbitrary set of minis */
    const rate = (set: Set<string>) => {
      let coreServed = 0
      let transfers = 0
      let untransferable = 0
      let unverified = 0
      for (const mini of set) {
        for (const s of SURFACES) {
          const core = s.core(mini)
          if (!core.ok) continue
          coreServed++
          const d = s.derived(mini)
          if (!d.ok) {
            untransferable++
            continue
          }
          const v = probeEdit(mini, d.model as StepGridModel & PianoRollModel, s.edit).verdict
          if (v === 'ok') transfers++
          else if (v === 'corrupt') untransferable++
          else unverified++
        }
      }
      return { coreServed, transfers, untransferable, unverified }
    }

    const all = rate(resolved)
    const fresh = rate(newlyAdmitted)
    const otherArm = miniCorpusArm()
    const pct = (a: number, b: number) => (b === 0 ? 'n/a' : ((100 * a) / b).toFixed(1) + '%')

    console.log(
      [
        `\n─── reach transfer over the EVAL-FIRST ask population ───`,
        `eval coverage        ${evalOk}/${docs.length}  — the population this arm could reach at all`,
        `units                ${units}, of which ${resolvedUnits} got a span`,
        `distinct minis        ${resolved.size}  (of these, ${newlyAdmitted.size} are for units no view is offered for today)`,
        ``,
        `ALL eval-resolved minis:`,
        `  core-served asks    ${all.coreServed}`,
        `  transfers           ${all.transfers}  (${pct(all.transfers, all.coreServed)})`,
        `  untransferable      ${all.untransferable}  (${pct(all.untransferable, all.coreServed)})`,
        `  unverified          ${all.unverified}`,
        ``,
        `ONLY the newly-admitted minis — the slice mini-corpus.json excludes:`,
        `  core-served asks    ${fresh.coreServed}`,
        `  transfers           ${fresh.transfers}  (${pct(fresh.transfers, fresh.coreServed)})`,
        `  untransferable      ${fresh.untransferable}  (${pct(fresh.untransferable, fresh.coreServed)})`,
        `  unverified          ${fresh.unverified}`,
        ``,
        // DERIVED from `WRITER-CENSUS.json`, that arm's own committed output — no
        // longer transcribed, so it cannot disagree with the arm it reports on.
        `mini-corpus arm, for comparison: ${otherArm.transfers}/${otherArm.asks} = ${otherArm.pct} transfer`,
        `modules NOT registered ${missingModules.length ? missingModules.join('; ') : 'none'}`,
      ].join('\n'),
    )

    /* ── the bounds that express INTENT ──────────────────────────────────────── */

    // The arm has to contain minis the parse-side snapshot does not, or it is
    // measuring the same thing twice and its agreement means nothing. Note this is
    // NOT a superset check — see the header: this population is smaller overall,
    // and that is the correction the run forced.
    expect(newlyAdmitted.size).toBeGreaterThan(200)
    // Eval coverage belongs beside every figure computed from an eval sweep: this
    // arm is over the documents that evaluated, and the floor is #1008's.
    expect(evalOk).toBeGreaterThanOrEqual(142)
    // Both arms must find a non-trivial core-served population, or the comparison
    // of their rates is between two numbers one of which is noise.
    expect(all.coreServed).toBeGreaterThan(200)

    /* ── the PINS (#1031) ────────────────────────────────────────────────────────
     * Every figure the report above prints, asserted exactly. The bounds alone let
     * this file print three generations of stale headlines while staying green;
     * they say what must never be true, and say nothing about what IS true.
     *
     * A bound and a pin answer different questions and this file needs both: the
     * bound survives an intended change, the pin makes an unintended one loud.
     */
    expect({
      evalOk,
      docs: docs.length,
      units,
      resolvedUnits,
      resolvedMinis: resolved.size,
      newlyAdmitted: newlyAdmitted.size,
    }).toEqual(POPULATION)

    expect(all).toEqual(ALL_RESOLVED)
    expect(fresh).toEqual(NEWLY_ADMITTED)
    expect({ transfers: otherArm.transfers, asks: otherArm.asks }).toEqual(MINI_CORPUS_ARM)

    // A module that stops registering silently shrinks the population every figure
    // above is computed over — a restriction that would otherwise appear only as a
    // number moving for no visible reason. Pinned by NAME so a NEW one fires while
    // the known-broken one stays quiet.
    expect(missingModules.map((m) => m.split(':')[0]).sort()).toEqual(MISSING_MODULES)
  }, 900_000)
})

/* ── PINNED FIGURES (#1031) ───────────────────────────────────────────────────
 * Observed 2026-07-27. These are the numbers the header used to carry as prose
 * and get wrong three times running. Moving one is a real event: re-derive it,
 * establish whether the movement is yours or drift someone else's change left
 * behind, and update it here in the commit that causes it.
 */

/** the ask population this arm draws, before any writer is asked anything */
const POPULATION = {
  evalOk: 142,
  docs: 150,
  units: 1039,
  resolvedUnits: 898,
  resolvedMinis: 671,
  newlyAdmitted: 266,
}

/** the counterfactual over every eval-resolved mini */
const ALL_RESOLVED = { coreServed: 500, transfers: 427, untransferable: 33, unverified: 40 }

/** the counterfactual over ONLY the slice `mini-corpus.json` does not contain */
const NEWLY_ADMITTED = { coreServed: 93, transfers: 76, untransferable: 7, unverified: 10 }

/**
 * The sibling arm's headline, pinned here too even though it is DERIVED from
 * `WRITER-CENSUS.json`. Deriving stops the two disagreeing; pinning is what makes
 * the sibling's own movement visible from this side, which is the failure that
 * started this — 965/1217 sat here across three merges of someone else's change.
 */
const MINI_CORPUS_ARM = { transfers: 1026, asks: 1204 }
// ⚠ MOVED 1055/1217 -> 1026/1204 at #1037, when the harvester was rebuilt and the
// corpus went 1500 -> 1535 units. This pin FIRED on that change, which is the whole
// reason it exists: the sibling arm moved and this side found out immediately
// instead of three merges later. Note what did NOT move — this arm's own
// population is derived from EVALUATION, and evaluation never sees commented-out
// code, so shedding the 94 dead-code strings changed the sibling without touching
// the 266 newly-admitted here.

/**
 * Known-unregistered modules. `@strudel/soundfonts` fails on a CommonJS interop
 * problem with `soundfont2` and has done throughout; it is pinned rather than
 * fixed so that a SECOND module joining it turns this red instead of quietly
 * removing documents from every figure above.
 */
const MISSING_MODULES = ['@strudel/soundfonts']
