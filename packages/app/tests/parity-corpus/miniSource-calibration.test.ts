/**
 * THE CALIBRATION — the resolver measured over 150 real Bakery tunes.
 *
 * It lives in @stave/app because the CORPUS does, and it drives the resolver
 * and the headless eval harness from @stave/editor by source path, exactly as
 * `editCoverage.ts` drives the detectors — one oracle, imported, never a second
 * copy. The eval harness must stay in the editor package: it needs
 * `@strudel/tonal`/`@strudel/xen`, which are the editor's dependencies and not
 * the app's, and Node resolves those from the harness file's own location.
 *
 * The unit tests pin the RULE on shapes chosen to exercise it. This pins the
 * rule against real code, and it is the gate that licenses reading anything the
 * resolver says about documents nobody has hand-read.
 *
 * ── HOW TO READ THE HEADLINE, AND WHY IT IS NOT 100% OF ANYTHING ──────────
 * The calibration population is units the coverage harness already calls
 * `note`: `chunkDetect` found a mini string as the first literal argument of a
 * `note`/`n`/`s`/`sound` head call, and the notation parser round-tripped it.
 * For that population the harness's truth (`unit.miniRange`) and the disposal's
 * head-call arm are close to the same statement, so agreement there is a
 * REGRESSION FENCE, not evidence that the rule is right. What the rule can
 * actually get wrong lives in the shapes those units do not have — a control
 * argument, a bound reference, a root literal, a mid-chain override — and those
 * are pinned one-by-one in `miniSource.test.ts` with red-tests behind them, and
 * hand-read on the unoffered pool this file also counts.
 *
 * ── THE DENOMINATORS, SAID OUT LOUD ───────────────────────────────────────
 * This block once printed three figures against three different populations
 * without naming any of them: coverage counted over the 147 documents that have
 * units but printed against 150, exactness counted over the documents that
 * EVALUATED, and the unoffered pool counted over all 150. A gate that quietly
 * excludes the hard documents reads as a stronger result than it is, so each
 * number now states the population it is over:
 *  - coverage — every document, before any skip.
 *  - exactness — every known-content unit in all 150 documents. The parse walk
 *    serves the ones whose document did not evaluate; that is what a fallback
 *    is for, and excluding them measured the easy half.
 *  - presence — only the units in EVALUATING documents, because "is the span
 *    among the located haps" is not a question about a document with no haps.
 *
 * ── WHAT IS ASSERTED, AND WHY EACH ONE CAN FAIL ───────────────────────────
 *  - eval coverage: reported and floored. A sweep that silently stops reaching
 *    documents reads as a reach ceiling.
 *  - exactness: every known-content unit resolves to exactly its known span. A
 *    disposal change that admits a control argument breaks this.
 *  - PRESENCE IS TOTAL, CONDITIONAL ON THE STATEMENT SOUNDING: this is the
 *    sharp one. Every unit whose content span is missing from the located haps
 *    belongs to a statement with NO located hap at all — because a bare pattern
 *    statement that is not the document's last never sounds (the transpiler
 *    returns only the last statement, and when `$:` collected anything the repl
 *    replaces the return with the stack). Not one unit is a case of "the
 *    statement sounds but this mini has no span". If that class ever becomes
 *    non-empty, the eval proposer has a real hole.
 */
import { describe, it, expect } from 'vitest'
import { unitsWithStatus } from './editCoverage'
import { evalLocations, loadCorpus } from '../../../editor/src/visualEdit/miniSource/__tests__/evalHarness'
import { admitProposals } from '../../../editor/src/visualEdit/miniSource/evalProposals'
import { QUERY_CYCLES } from '../../../editor/src/visualEdit/miniSource/evalProposals'
import { resolveMiniSource } from '../../../editor/src/visualEdit/miniSource/resolveMiniSource'
import { SpanIndex } from '../../../editor/src/visualEdit/miniSource/spanRole'

describe('miniSource calibration over 150 real tunes', () => {
  it('resolves every known content span, and every miss is a silent statement', async () => {
    const docs = await loadCorpus()
    expect(docs.length).toBe(150)

    let evalOk = 0
    let known = 0
    let knownEvaluating = 0
    let exact = 0
    let wrong = 0
    let refused = 0
    let servedByParseFallback = 0
    let present = 0
    let missWithSoundingStatement = 0
    let undeclared = 0
    let unoffered = 0
    let unofferedResolved = 0
    let mixedUse = 0
    let tieBreakFired = 0
    const wrongDetail: string[] = []

    for (const doc of docs) {
      const units = unitsWithStatus(doc.code)
      const ev = await evalLocations(doc.code, QUERY_CYCLES)
      // COVERAGE IS COUNTED OVER EVERY DOCUMENT, before anything is skipped. It
      // used to be incremented after the no-units check while still being
      // printed against 150, which made the headline a numerator over 147 and a
      // denominator over 150 — a document that evaluates and happens to contain
      // no unit is still a document the harness reached.
      if (ev.ok) evalOk++
      if (units.length === 0) continue
      const index = SpanIndex.build(doc.code)
      const admitted = admitProposals({ miniLocations: ev.declared, locations: ev.seen })
      undeclared += admitted.undeclared.length
      const proposals = admitted.proposals
      mixedUse += index?.mixedUseBindings().length ?? 0

      for (const { unit, status } of units) {
        if (status.status === 'note' && unit.miniRange) {
          // EVERY known-content unit counts, including the ones in documents
          // that did not evaluate — the parse walk serves those, and skipping
          // them made this gate a statement about the EASY documents while the
          // unoffered-pool figure printed below it covered all 150.
          known++
          const truth = unit.miniRange
          // PRESENCE, unlike exactness, is only answerable where there are
          // proposals to be present in. It stays scoped to the evaluating
          // documents and reports its own denominator.
          if (ev.ok) {
            knownEvaluating++
            const inTruth = proposals.some((p) => p.span[0] >= truth[0] && p.span[1] <= truth[1])
            if (inTruth) present++
            else if (
              proposals.some(
                (p) => p.span[0] >= unit.statementRange[0] && p.span[1] <= unit.statementRange[1],
              )
            ) {
              missWithSoundingStatement++
            }
          }

          const r = resolveMiniSource(doc.code, unit, { proposals, index })
          if (!r.ok) refused++
          else if (r.range[0] === truth[0] && r.range[1] === truth[1]) {
            exact++
            if (r.via === 'parse') servedByParseFallback++
          } else {
            wrong++
            if (wrongDetail.length < 10) {
              wrongDetail.push(
                `${doc.name}: truth=${JSON.stringify(doc.code.slice(truth[0], truth[1]).slice(0, 40))} got=${JSON.stringify(r.text.slice(0, 40))}`,
              )
            }
          }
        }
        if (status.status === 'knobs' || status.status === 'code-only') {
          unoffered++
          if (resolveMiniSource(doc.code, unit, { proposals, index }).ok) unofferedResolved++
        }
      }
      tieBreakFired += index?.tieBreakFired ?? 0
    }

    const pct = (a: number, b: number) => ((100 * a) / b).toFixed(1)
    console.log(
      [
        `\n─── miniSource calibration (window ${QUERY_CYCLES} cycles) ───`,
        `eval coverage      ${evalOk}/${docs.length} (${pct(evalOk, docs.length)}%)  — counted over EVERY document`,
        `undeclared spans   ${undeclared}  (coordinate-space leaks, refused by admission)`,
        `mixed-use bindings ${mixedUse}  (used both ways SOMEWHERE in the doc — the population, not the decisions)`,
        `  tie-break fired  ${tieBreakFired}  (times a binding was used both ways WITHIN one unit, so it actually decided)`,
        `known-content      ${known}  over ALL ${docs.length} documents`,
        `  content present  ${present}/${knownEvaluating} (${pct(present, knownEvaluating)}%)  — of the units in EVALUATING docs, the only ones this is answerable for`,
        `  resolved exactly ${exact}/${known} (${pct(exact, known)}%)  wrong ${wrong}  refused ${refused}`,
        `  of those exact, ${servedByParseFallback} answered by the parse fallback`,
        `unoffered pool     ${unofferedResolved}/${unoffered} (${pct(unofferedResolved, unoffered)}%) got a SPAN — not a view, not an edit`,
        ...wrongDetail.map((w) => `  WRONG ${w}`),
      ].join('\n'),
    )

    // Coverage floor — a silent drop reads as a reach ceiling, not a bug.
    expect(evalOk).toBeGreaterThanOrEqual(130)
    expect(known).toBeGreaterThanOrEqual(515)
    // Exactness: no wrong answers, nothing withheld.
    expect(wrong).toBe(0)
    expect(refused).toBe(0)
    expect(exact).toBe(known)
    // The sharp claim: presence is total, conditional on the statement sounding.
    expect(missWithSoundingStatement).toBe(0)
    // A span was RESOLVED for this many of the units no view is offered for
    // today. Read it as nothing more than that. It is not reach: opening a view,
    // the view having structure, and a modelled edit surviving the engine are
    // three further gates, and the last measurement of that chain converted 173
    // unoffered units to 97 with a mini, 65 with a view, 47 that survived an
    // edit. A one-cell view of an instrument name is a CORRECT resolution and a
    // useless surface, so counting resolutions as reach is the error this
    // number is most likely to be used to make.
    expect(unofferedResolved).toBeGreaterThanOrEqual(115)
  }, 600_000)
})
