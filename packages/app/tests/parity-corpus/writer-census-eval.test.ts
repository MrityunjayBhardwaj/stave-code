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
 * The three agree inside ~3pp, and the genuinely-new slice is the LOWEST of them —
 * which is the direction the prediction named, at an effect size (0.8pp, n=93) far
 * too small to claim. The transfer rate is a property of the corpus, not of how the
 * asks were drawn. That is a weaker claim than the prediction wanted and a more
 * useful one than either arm alone could support.
 */
import { describe, it, expect } from 'vitest'
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
        `mini-corpus arm, for comparison: 965/1217 = 79.3% transfer`,
        `modules NOT registered ${missingModules.length ? missingModules.join('; ') : 'none'}`,
      ].join('\n'),
    )

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
  }, 900_000)
})
