/**
 * writer-reach.test.ts — the committed FLOOR on how much of the real-world corpus
 * the behaviour projection makes EDITABLE, not merely parseable.
 *
 * PARSE-reach (edit-coverage.spec.ts) counts units whose SYNTAX we model. This
 * gate counts WRITER-reach: units the syntactic model REFUSES, that the inherited
 * projection (#922 grid / #924 roll) opens by showing what they PLAY, AND that
 * survive an edit — the write-back re-emits a pattern the ENGINE plays as intended.
 * The two diverge by roughly 40%: a pattern can parse-open and still corrupt on the
 * first click (the #904 class), so "can be viewed" is not "can be edited".
 *
 * WHAT IS MEASURED, through the REAL shipped code — never an inline re-implementation
 * of the projection, which would be a second oracle that can only agree with itself:
 *   refused   — `parse{StepGrid,PianoRoll}Core` says .ok = false (the denominator)
 *   projected — `parse{StepGrid,PianoRoll}` (core → projection fallback) says .ok
 *   editOk    — a modeled edit round-trips: the serialized document, RE-QUERIED
 *               through the real engine, plays exactly the edited note set
 *
 * THE ORACLE is the engine on BOTH sides: expected = what the original pattern plays
 * MINUS the deleted note; got = what the edited document plays. Never a re-parsed
 * column grid — `[~ 1@2]` and `[~ ~ 1@4]` are the same music at two resolutions, and
 * a column compare would false-flag a faithful re-spelling.
 *
 * The compare spans every axis the DOCUMENT carries, on both surfaces. This paragraph
 * used to say the opposite — that the grid is an onset instrument, that "a nested
 * `[hh ~]!16` shows sixteen faithful onsets and its per-cell duration is not the grid's
 * to preserve", and that its probe therefore compares (onset, atom). The first clause is
 * true and the conclusion does not follow (#1026): what the grid PANEL can draw does not
 * bound what the grid WRITER may alter, because "edits locally / no silent data loss" is
 * a property of the file. `[hh ~]!16` is one of the units that made the point — deleting
 * one hit rewrote it to sixteen flat cells and doubled every surviving note's length,
 * and the gate called it reach.
 *
 * THE EDIT PROBE ITSELF LIVES IN `engineEditOracle.ts` (#1009) — the writer census
 * asks the same question of a different writer, and two copies of an edit oracle are
 * two oracles that can only agree with themselves ([[PV192]]). This gate's numbers
 * are what pins that extraction: 131 / 73 with losses `[]`, unchanged BY IT. They are not
 * the current numbers — see the floor below, which has moved twice since, both times
 * because the oracle's sight changed rather than the writers'.
 *
 * THE ASSERTION is a FLOOR, not a snapshot: editOk must not fall below the reach
 * observed when this gate was written. A grammar/subset change that quietly closes
 * units the projection used to open turns this red. The per-reason breakdown is
 * printed as diagnostics — it says WHICH refusals the projection is buying back.
 *
 * DISTRIBUTION, not a hand-picked window: the full committed mini-corpus (1500 real
 * harvested units), both surfaces, is swept.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseStepGrid,
  parseStepGridCore,
  parsePianoRoll,
  parsePianoRollCore,
} from '../../../editor/src/visualEdit/notation/parse'
import type {
  ParseResult,
  PianoRollModel,
  StepGridModel,
} from '../../../editor/src/visualEdit/notation/model'
import {
  GRID_SURFACE,
  ROLL_SURFACE,
  probeEdit,
  type Surface as EditSurface,
} from './engineEditOracle'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/**
 * The reach FLOOR — the writer-reach observed when this gate was written, over the
 * committed corpus. editOk must never fall below it; a projection that closes units
 * it used to open turns this red. Raise it (never lower it silently) when a genuine
 * reach gain is shipped and re-observed.
 *
 * ⚠ RAISED 131/73 → 155/75 at #1022, and NOT because the writers reach further. They
 * are untouched. What this gate counts is VERIFIED reach, and the probe used to read
 * cycle 0 and nothing else — so an alternation whose first arm is a rest (`<- c5>`,
 * `<~ sd ~ sd ~>`) came back empty and its unit was filed unverified rather than
 * counted. The probe now advances to the first bar the model spans that actually
 * sounds. The units were always editable; the oracle could not see them.
 *
 * Worth stating because the distinction is invisible in the number: this is a gain in
 * MEASUREMENT, not in product surface, and must not be quoted as reach the projections
 * bought.
 *
 * ⚠ LOWERED 155 → 126 at #1026, and the same caveat runs the other way. The writers are
 * again untouched. The oracle's grid arm compared ONSETS ONLY, so 29 units whose edit
 * silently changed a surviving note's LENGTH were counted as reach. Restoring the axis
 * removes them from the count; nothing about the product got worse on the day this
 * number fell. It is a loss in FICTION, not in surface, and must not be quoted as a
 * regression the projections caused.
 *
 * The floor returns when #1010 lands — see `DURATION_LOSSES` below for why that is a
 * prediction with a mechanism behind it rather than a hope.
 *
 * ⚠ RE-BASED 126 -> 123 STEP and 75 -> 85 ROLL at #1037, and the writers are again
 * untouched. The CORPUS changed: the harvester now asks the transpiler which
 * strings become patterns instead of approximating it with a regex, so it gained
 * backtick minis (the multi-line, multi-cycle material) and lost commented-out
 * code the text scan could not tell from live code.
 *
 * Decomposed, because a net delta over two opposite effects is not a finding
 * (measured by re-running this gate on the intermediate corpus):
 *
 *     corpus                              step  losses   roll
 *     1500  committed                      126      29     75
 *     1406  minus commented-out code       119      24     70
 *     1535  plus backtick + chained        123      30     85
 *
 * So **seven step units and five roll units of the old floors were code nobody
 * runs** — a `//sound("…")` line the regex harvested as if it were an ask. That
 * part of the floor was fiction, and removing it is a correction, not a
 * regression. Real material then buys +4 step and +15 roll. The roll gains far
 * more because backticks are how people write long melodic and chord patterns,
 * which is the roll's material.
 *
 * Neither number may be quoted against a pre-#1037 one without saying so: they are
 * over different populations ([[P343]]).
 */
const FLOOR_STEP = 141
const FLOOR_ROLL = 85

/**
 * The units whose edit survives the engine on every axis EXCEPT duration.
 *
 * Enumerated rather than counted, and asserted as a set rather than as a ceiling, so
 * that a thirtieth cannot arrive unnoticed and a fix cannot quietly trade one for
 * another. Every entry is a real loss: the emitted document plays the right atoms at
 * the right instants and holds one of them for a different length.
 *
 * WHY THIS SET HAS A MECHANISM AND NOT JUST A SIZE — measured per unit across both
 * populations (#1026): all 29 here, and all 11 on the census's counterfactual arm,
 * come from the ELEMENT RE-EMIT. The leaf adapter produces **0 of 40**. That is not a
 * coincidence to be re-checked each time; it follows from what the two writers are.
 * Leaf surgery replaces the edited note's own source bytes and COPIES everything else,
 * so the structural bytes that carry duration — `@n`, `!n`, `*n`, nesting, spacing —
 * ride back out verbatim and it is incapable of changing a length it was not asked to
 * change. The element re-emit re-spells the whole element from a cell model, and a cell
 * model has no duration in it, so it re-spells at the grid's resolution and every
 * length in the element is re-derived from scratch. `[hh ~]!16` → `~ hh hh …` is that
 * in one line.
 *
 * SO THIS LIST IS #1010's SCORECARD. Retiring the element re-emit in favour of surgery
 * wherever a span exists empties it — the ones with a span become clean splices, the
 * ones without (a shared leaf, `!16`) become honest refusals. Either outcome removes
 * the silent rewrite, which is the whole point. When that lands, this array goes to
 * empty and `FLOOR_STEP` returns toward 155.
 *
 * ⚠ 29 -> 30 at #1037, again a corpus change and not a writer change: five of the
 * 29 were commented-out code and six real ones arrived with the backtick material.
 * Still 0 leaf, 30 element — the mechanism claim below is unaffected, which is the
 * point of asserting it separately from the membership.
 */
/**
 * EMPTY as of #1010 P4c — the printer preserves lengths instead of re-deriving them.
 *
 * All 30 were duration-only: the emitted document agreed with the expectation on
 * every onset and every atom and differed only in how long a note sounded. 24 are
 * now spelled — a held note's covered columns come out as `_` (sustain), which is
 * what the grid's own resolution can say. The other 6 have lengths it cannot say at
 * all (a note shorter than a column, or a column another note already starts in),
 * and those are REFUSED rather than shortened: the writer declines, the projection
 * stops offering the view, and the document is left alone. A derived view that
 * mis-writes is worse than one that declines, and it is not a close call here —
 * across those 6 units the one-note-per-onset probe found 49 of 50 notes already
 * mis-writing, so what a refusal costs is one live note, not six live views.
 *
 * Kept as an exact set rather than deleted: a thirty-first loss arriving is what
 * this assertion exists to catch, and `[]` states that more loudly than no list.
 */
const DURATION_LOSSES: string[] = []

/* ── the sweep ──────────────────────────────────────────────────────────────── */

/**
 * A surface = the two writers to compare plus how the shared edit oracle drives it.
 * `core`/`full` are this gate's question (does the PROJECTION buy back what the
 * syntactic model refused); `edit` is the probe, imported so the census can hold a
 * different writer to exactly the same standard.
 */
interface Surface {
  key: 'step' | 'roll'
  core: (m: string) => ParseResult<StepGridModel | PianoRollModel>
  full: (m: string) => ParseResult<StepGridModel | PianoRollModel>
  edit: EditSurface
}

const SURFACES: Surface[] = [
  { key: 'step', core: parseStepGridCore, full: parseStepGrid, edit: GRID_SURFACE },
  { key: 'roll', core: parsePianoRollCore, full: parsePianoRoll, edit: ROLL_SURFACE },
]

interface Tally {
  refused: number
  projected: number
  editOk: number
  refusedReasons: Map<string, number>
  reachByReason: Map<string, number>
  /** for units NO writer opened: the gate that actually stopped them (#990) */
  unopenedGates: Map<string, number>
  /**
   * Every unit whose edit corrupts — the mini it came from and the document the
   * writer emitted, plus which writer emitted it.
   *
   * UNCAPPED, deliberately. This used to stop recording at 20 while the report
   * printed `LOSSES sample (${t.losses.length})`, so a run with 29 losses said 20
   * and read as the whole set. A bound on coverage that does not announce itself is
   * indistinguishable from complete coverage, which is the whole failure this gate
   * exists to catch, committed by the gate. The report still prints a SAMPLE — it
   * just says how many it is a sample of.
   */
  losses: { mini: string; out: string; writer: 'leaf' | 'element' }[]
}
const blank = (): Tally => ({
  refused: 0,
  projected: 0,
  editOk: 0,
  refusedReasons: new Map(),
  reachByReason: new Map(),
  unopenedGates: new Map(),
  losses: [],
})

function sweep(s: Surface): Tally {
  const t = blank()
  for (const mini of minis) {
    const core = s.core(mini)
    if (core.ok) continue // the core writer's surface — tested elsewhere
    const reason = core.reason
    const r = s.full(mini)
    t.refused++
    t.refusedReasons.set(reason, (t.refusedReasons.get(reason) ?? 0) + 1)
    if (!r.ok) {
      // Nothing opened it — record the gate that actually stopped it, not the
      // core's syntactic message (#990). This is the residual bucketed by CAUSE,
      // which is what a reach lever has to be sized against: `unstable-period`
      // is the period cap, `wrong-surface` is a unit that was never this view's
      // to open and should not be read as a gap at all.
      const g = r.gate ?? '(core syntax)'
      t.unopenedGates.set(g, (t.unopenedGates.get(g) ?? 0) + 1)
      continue
    }
    const m = r.model as StepGridModel & PianoRollModel
    t.projected++

    // The edit round-trip, verified through the real engine on both sides, by the
    // ONE shared probe (`engineEditOracle.ts`). A `no-probe` verdict — fully
    // chorded, a non-integer per-bar width, or a writer that declined — is
    // UNVERIFIED and counts as neither reach nor a loss, exactly as it always did
    // when these were four separate `continue`s.
    const probe = probeEdit(mini, m, s.edit)
    if (probe.verdict === 'ok') {
      t.editOk++
      t.reachByReason.set(reason, (t.reachByReason.get(reason) ?? 0) + 1)
    } else if (probe.verdict === 'corrupt') {
      t.losses.push({ mini, out: probe.out, writer: m.leafSource ? 'leaf' : 'element' })
    }
  }
  return t
}

function report(name: string, t: Tally, floor: number): void {
  console.log(`\n===== WRITER-REACH: ${name} (${minis.length} corpus units) =====`)
  console.log(`  refused by the syntactic model: ${t.refused}`)
  console.log(`  projected to an editable view:  ${t.projected}`)
  console.log(`  edit round-trips correctly:     ${t.editOk}   (floor ${floor})   <-- writer-reach`)
  console.log(`  -- refused-reason histogram (denominator) --`)
  for (const [k, v] of [...t.refusedReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`     ${String(v).padStart(3)}x  ${k}`)
  console.log(`  -- writer-reach bought back, by refused reason --`)
  for (const [k, v] of [...t.reachByReason.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`     +${String(v).padStart(2)}  ${k}`)
  console.log(`  -- units NO writer opened, by the gate that stopped them (#990) --`)
  for (const [k, v] of [...t.unopenedGates.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`     ${String(v).padStart(4)}x  ${k}`)
  if (t.losses.length) {
    const SAMPLE = 20
    const byWriter = (w: string) => t.losses.filter((l) => l.writer === w).length
    console.log(
      `  -- LOSSES: ${t.losses.length} total  (leaf ${byWriter('leaf')} / element ${byWriter('element')})` +
        `${t.losses.length > SAMPLE ? `, showing the first ${SAMPLE}` : ''} --`,
    )
    t.losses
      .slice(0, SAMPLE)
      .forEach((l) => console.log(`     ✗ [${l.writer}] ${JSON.stringify(l.mini)}  edit→${JSON.stringify(l.out)}`))
  }
}

describe('writer-reach — the projection makes real refused units editable, and edits survive', () => {
  const step = sweep(SURFACES[0])
  const roll = sweep(SURFACES[1])

  it('step grid: projection reach holds at or above the floor', () => {
    report('step grid (#922)', step, FLOOR_STEP)
    // Every projected unit that got a clean probe must round-trip, EXCEPT the named
    // duration set — asserted as an exact set, so a thirtieth cannot arrive unnoticed
    // and a fix cannot silently trade one loss for another (#1026).
    expect(
      step.losses.map((l) => l.mini).sort(),
      step.losses.map((l) => `${JSON.stringify(l.mini)}  edit→${JSON.stringify(l.out)}`).join('\n'),
    ).toEqual([...DURATION_LOSSES].sort())
    // …and the mechanism is asserted, not just the membership: the leaf adapter copies
    // every byte it did not edit, so it CANNOT change a length it was not asked to.
    // A leaf-written loss appearing here would mean that reasoning is wrong.
    expect(
      step.losses.filter((l) => l.writer === 'leaf'),
      'a leaf-adapter write lost duration — byte surgery is supposed to make that impossible',
    ).toEqual([])
    expect(step.editOk, `step writer-reach ${step.editOk} fell below floor ${FLOOR_STEP}`).toBeGreaterThanOrEqual(FLOOR_STEP)
  })

  it('piano roll: projection reach holds at or above the floor', () => {
    report('piano roll (#924)', roll, FLOOR_ROLL)
    // The roll's arm was ALREADY duration-aware, so it is the control for #1026: this
    // stays empty and 75 stays 75 across the change. A roll movement would have meant
    // the edit did something other than restore the grid's missing axis.
    expect(roll.losses, roll.losses.map((l) => l.mini).join('\n')).toEqual([])
    expect(roll.editOk, `roll writer-reach ${roll.editOk} fell below floor ${FLOOR_ROLL}`).toBeGreaterThanOrEqual(FLOOR_ROLL)
  })
})
