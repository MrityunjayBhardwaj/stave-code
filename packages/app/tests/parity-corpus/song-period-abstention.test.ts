/**
 * song-period-abstention — PRICES the candidate rules for #1104 before any
 * production rule changes: a lane with no period of its own ABSTAINS from the
 * display span instead of vetoing it.
 *
 * #1104 asks what the Song view should span for a song with no exact repeat, and
 * chooses none of its four directions. The first — "show the structural loop,
 * treat modulation as a continuous field over it" — turns out to be
 * `detectDisplayPeriod`'s own grounded phasing rule (#488) extended one case
 * further. `abstainingDetector`'s header carries that argument, the refutation
 * of the unconditional form, and why the floor is on WHEN abstention may speak
 * rather than on how short a period it may return.
 *
 * This file changes no production behaviour. Each candidate is injected into the
 * real `analyzeSong` loop through the measurement seam, so what is priced is
 * what would ship.
 *
 * ── WHY THE ASSERTIONS ARE ABOUT THE INSTRUMENT, NOT THE VERDICT ─────────────
 * Which trade-off to accept is a product decision and not this file's to make.
 * So the expectations pin only what would make a number untrustworthy, and
 * everything else is REPORTED per document for a human to rule on:
 *
 *  1. the denominator and the named eval failures (a document dropping silently
 *     out of the sweep would make every count below look better than it is);
 *  2. structural properties each rule must have if it is the rule it claims to
 *     be — a max over a SUBSET of lanes can never exceed the max over all of
 *     them, so no candidate may lengthen a period or invent aperiodicity;
 *  3. for the `atCapOnly` rules specifically: every document that resolved
 *     BELOW the cap under production must be bit-identical, because below the
 *     cap those rules ARE the production rule. This is the one that would catch
 *     the refuted candidate being measured by mistake.
 *
 * The #1102 shape (a document landing on period 1) is reported as a COST rather
 * than asserted away, because for the unconditional rule it is the finding.
 *
 * ── CONTROL ARM: it lives in the sibling, deliberately ───────────────────────
 * `song-period-sweep.test.ts` sweeps the SAME corpus through the SAME loop with
 * the production rule and pins all 142 documents; it was re-run green after the
 * measurement seam was added, which is what proves the seam inert. Duplicating
 * it here would double a 54-second sweep to re-derive a fact the sibling holds.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sweepCorpus, abstainingDetector, type PeriodVerdict } from './songPeriodSweep'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/**
 * The PRE-DECISION baseline, frozen deliberately.
 *
 * This file prices ALTERNATIVES to the rule #1104 shipped, so it has to compare
 * against the state the decision was made in. Pointing it at the live baseline
 * would silently change what every row means the moment production moved — the
 * shipped rule would read "0 moved" and the alternatives would be measured
 * against themselves rather than against the defect. The live per-document pin
 * is `SONG-PERIOD-BASELINE.json`, owned by `song-period-sweep.test.ts`.
 */
const BASELINE = path.join(HERE, 'SONG-PERIOD-BASELINE-PRE-1104.json')

interface BaselineRow {
  period: number | null
  span: number
  reachedCap: boolean
  lanes: number
}

/** Same eight as the sibling — see its header for the classification. */
const EVAL_FAILURES = [
  '0/-8Xqyjn750i4',
  '0/-MMxsqMYG_ID',
  '250/0vk9wpBvt6Nd',
  '500/3CMJf_qbfks9',
  '500/3HWHF_ZUbZD_',
  '500/3H_LAkg97Urt',
  '500/3HvvWoaCyciz',
  '500/3L25jxCjZ235',
]

/**
 * The family, each differing from its neighbour by ONE clause so a moved
 * document is attributable to that clause. B is kept in the table as the
 * refuted arm: without it the later rows have nothing to be better than.
 */
const CANDIDATES = [
  { id: 'B  abstain always          ', rule: { atCapOnly: false } },
  { id: 'C  abstain at cap only     ', rule: { atCapOnly: true } },
  { id: 'D  C + period must exceed 1', rule: { atCapOnly: true, minPeriod: 2 } },
  { id: 'E  C + lane majority       ', rule: { atCapOnly: true, minLaneShare: 0.5 } },
  {
    id: 'F  C + both clauses        ',
    rule: { atCapOnly: true, minPeriod: 2, minLaneShare: 0.5 },
  },
  // ── D + ONE further clause each, aimed at D's residual: six documents that
  // recover to a 2-cycle span because the ostinatos answer while the melody and
  // bass abstain. D is the base for all of them, so any difference in the table
  // below is that one clause and nothing else.
  { id: 'G  D + densest lane answers', rule: { atCapOnly: true, minPeriod: 2, requireDensestLane: true } },
  {
    id: 'H  D + answered ≥60% events',
    rule: { atCapOnly: true, minPeriod: 2, minAnsweredEventShare: 0.6 },
  },
  {
    id: 'I  D + no abstainer ≥15%   ',
    rule: { atCapOnly: true, minPeriod: 2, maxAbstainingLaneShare: 0.15 },
  },
  // J's threshold sits in an empirical GAP, not on a tuned value: the recovered
  // periods jump 2 → 6 with nothing at 3, 4 or 5. K and L exist to MEASURE that
  // insensitivity rather than derive it from J's distribution — if all three
  // agree, the number is a partition of the data and not a knob.
  { id: 'J  D but period must be ≥4 ', rule: { atCapOnly: true, minPeriod: 4 } },
  { id: 'K  … same but ≥3           ', rule: { atCapOnly: true, minPeriod: 3 } },
  { id: 'L  … same but ≥6           ', rule: { atCapOnly: true, minPeriod: 6 } },
] as const

const fmt = (p: number | null) => (p === null ? 'none' : String(p))

/**
 * The summary table's columns, name and value in ONE place.
 *
 * Not a style choice. The first version of this table wrote its header as a
 * string literal and its rows as a separate expression, then a column was
 * inserted into the rows and not the header — so every figure after the second
 * was printed under the wrong name, in a table whose whole purpose is to be read
 * off and quoted. Deriving both from this list makes that misalignment
 * unrepresentable rather than merely asserted against.
 */
const COLUMNS: ReadonlyArray<{ name: string; of: (p: Priced) => number }> = [
  { name: 'moved', of: (p) => p.moved.length },
  { name: 'recovered(>1)', of: (p) => p.recoveredReal.length },
  { name: 'short(<4)', of: (p) => p.shortRecoveries.length },
  { name: 'cap→1', of: (p) => p.recoveredToOne.length },
  { name: 'newly-1', of: (p) => p.newlyPeriodOne.length },
  { name: 'lost-correct', of: (p) => p.lostCorrectPeriod.length },
  { name: 'still-at-cap', of: (p) => p.stillAtCap },
]

interface Priced {
  id: string
  atCapOnly: boolean
  moved: PeriodVerdict[]
  recoveredReal: PeriodVerdict[]
  recoveredToOne: PeriodVerdict[]
  newlyPeriodOne: PeriodVerdict[]
  lostCorrectPeriod: PeriodVerdict[]
  shortened: PeriodVerdict[]
  lengthened: PeriodVerdict[]
  newlyAperiodic: PeriodVerdict[]
  changedBelowCap: PeriodVerdict[]
  /** period and span identical, `reachedCap` not — a state change with no
   *  visible span consequence, invisible to a period/span-only comparison. */
  capFlipOnly: PeriodVerdict[]
  /** recoveries to a span BELOW 4 cycles — D's named residual, where an ostinato
   *  sets the span while a heavy melodic lane abstains. Reported as its own
   *  column so the table answers "is the residual gone" without a second probe. */
  shortRecoveries: PeriodVerdict[]
  stillAtCap: number
}

describe('Song display period — lane-abstention candidates (#1104)', () => {
  it('prices each candidate per document against the pinned production baseline', async () => {
    const before: Record<string, BaselineRow> = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    const capBefore = Object.values(before).filter((b) => b.reachedCap).length
    const priced: Priced[] = []

    for (const { id, rule } of CANDIDATES) {
      const verdicts = await sweepCorpus(abstainingDetector(rule))
      const evaluated = verdicts.filter((v) => v.ok)

      // Asserted per candidate, before any figure is quoted from it.
      expect(
        verdicts
          .filter((v) => !v.ok)
          .map((v) => v.name)
          .sort(),
      ).toEqual(EVAL_FAILURES)
      expect(evaluated.length).toBe(142)
      expect(evaluated.filter((v) => before[v.name] === undefined).map((v) => v.name)).toEqual([])

      const p: Priced = {
        id,
        atCapOnly: rule.atCapOnly,
        moved: [],
        recoveredReal: [],
        recoveredToOne: [],
        newlyPeriodOne: [],
        lostCorrectPeriod: [],
        shortened: [],
        lengthened: [],
        newlyAperiodic: [],
        changedBelowCap: [],
        capFlipOnly: [],
        shortRecoveries: [],
        stillAtCap: evaluated.filter((v) => v.reachedCap).length,
      }

      for (const v of evaluated) {
        const b = before[v.name]
        // `reachedCap` is part of the comparison because the pinned baseline row
        // pins it, and because it moves INDEPENDENTLY of period and span: a
        // document can keep period 1 / span 1 and still change from "resolved at
        // horizon 8" to "gave up at the 256-cycle cap". Comparing only period and
        // span reported 16 such documents as unchanged.
        if (b.period === v.period && b.span === v.span && b.reachedCap === v.reachedCap) continue
        p.moved.push(v)
        if (b.period === v.period && b.span === v.span) p.capFlipOnly.push(v)
        // A document that left the cap but landed on 1 is in BOTH columns: the
        // 256-cycle sliver and the single stretched clip are both wrong, so
        // counting it as a recovery would overstate the win.
        if (b.reachedCap && !v.reachedCap) {
          if (v.period === 1) p.recoveredToOne.push(v)
          else {
            p.recoveredReal.push(v)
            if (v.period !== null && v.period < 4) p.shortRecoveries.push(v)
          }
        }
        if (!b.reachedCap && v.reachedCap) p.newlyAperiodic.push(v)
        if (b.period !== 1 && v.period === 1) p.newlyPeriodOne.push(v)
        // The unambiguous regression: a correct bounded period replaced by 1.
        if (b.period !== null && b.period > 1 && v.period === 1) p.lostCorrectPeriod.push(v)
        if (b.period !== null && v.period !== null) {
          if (v.period < b.period) p.shortened.push(v)
          else if (v.period > b.period) p.lengthened.push(v)
        }
        if (!b.reachedCap) p.changedBelowCap.push(v)
      }
      priced.push(p)
    }

    const line = (v: PeriodVerdict) => {
      const b = before[v.name]
      return `      ${v.name.padEnd(20)} period ${fmt(b.period).padStart(4)} → ${fmt(
        v.period,
      ).padEnd(4)}  span ${String(b.span).padStart(4)} → ${String(v.span).padEnd(4)}`
    }

    console.log(
      [
        '',
        `─── #1104 lane abstention, ${142} documents, ${capBefore} at the 256-cycle cap before ───`,
        '',
        '  rule                         ' + COLUMNS.map((c) => c.name.padStart(c.name.length + 2)).join(''),
        ...priced.map(
          (p) =>
            `  ${p.id}` +
            COLUMNS.map((c) => String(c.of(p)).padStart(c.name.length + 2)).join(''),
        ),
        '',
        ...priced.flatMap((p) => [
          `  ── ${p.id.trim()} ──`,
          `    recovered to a real period (>1): ${p.recoveredReal.length}`,
          ...p.recoveredReal.map(line),
          `    left the cap but landed on 1:   ${p.recoveredToOne.length}`,
          ...p.recoveredToOne.map(line),
          `    LOST a correct bounded period:  ${p.lostCorrectPeriod.length}`,
          ...p.lostCorrectPeriod.map(line),
          `    shortened (bounded→bounded):    ${p.shortened.length}`,
          ...p.shortened.map(line),
          `    recoveries below 4 cycles:      ${p.shortRecoveries.length}`,
          ...p.shortRecoveries.map(line),
          `    cap-flip only (same period/span):${p.capFlipOnly.length}`,
          ...p.capFlipOnly.map(line),
          '',
        ]),
      ].join('\n'),
    )

    for (const p of priced) {
      // A max over a SUBSET of the lanes the veto rule required all of cannot
      // exceed the max over all of them, so no rule here may LENGTHEN a period
      // it inherited. A violation means the rule is not the rule this file
      // claims to price.
      expect({ id: p.id, lengthened: p.lengthened.map((v) => v.name) }).toEqual({
        id: p.id,
        lengthened: [],
      })
      // THE STRUCTURAL CHECK on the floor: below the cap these rules ARE the
      // production rule — the veto still holds, and the extra clauses are gated
      // on a lane having abstained — so a document that resolved below the cap
      // must come back bit-identical, `reachedCap` included.
      //
      // This assertion has already earned its place: with the clauses ungated,
      // `minPeriod: 2` moved all 19 period-1 documents, and 16 of them moved in a
      // way a period/span comparison could not see at all. It is also why
      // `newlyAperiodic` is asserted here rather than reported — for these rules
      // a document can only leave the cap, never arrive at it.
      if (p.atCapOnly) {
        expect({
          id: p.id,
          changedBelowCap: p.changedBelowCap.map((v) => v.name),
          newlyAperiodic: p.newlyAperiodic.map((v) => v.name),
        }).toEqual({ id: p.id, changedBelowCap: [], newlyAperiodic: [] })
      }
    }
  }, 1_200_000)
})
