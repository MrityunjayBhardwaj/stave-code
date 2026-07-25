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
 * The compare is per each view's OWN editable axes. The ROLL models duration (`@n`),
 * so its probe is duration-aware — the full (onset, duration, atom) multiset, so a
 * lost `@n` is caught even when the onset count is unchanged. The GRID is an ONSET
 * instrument — elongation is explicitly outside its subset (the core refuses `@n`),
 * so a nested `[hh ~]!16` shows sixteen faithful onsets and its per-cell duration is
 * not the grid's to preserve; its probe compares (onset, atom).
 *
 * THE EDIT PROBE ITSELF LIVES IN `engineEditOracle.ts` (#1009) — the writer census
 * asks the same question of a different writer, and two copies of an edit oracle are
 * two oracles that can only agree with themselves ([[PV192]]). This gate's numbers
 * are what pins that extraction: 131 / 73 with losses `[]`, unchanged by it.
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
 */
const FLOOR_STEP = 131
const FLOOR_ROLL = 73

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
  losses: string[]
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
    } else if (probe.verdict === 'corrupt' && t.losses.length < 20) {
      t.losses.push(`${JSON.stringify(mini)}  edit→${JSON.stringify(probe.out)}`)
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
    console.log(`  -- LOSSES sample (${t.losses.length}) --`)
    t.losses.forEach((l) => console.log(`     ✗ ${l}`))
  }
}

describe('writer-reach — the projection makes real refused units editable, and edits survive', () => {
  const step = sweep(SURFACES[0])
  const roll = sweep(SURFACES[1])

  it('step grid: projection reach holds at or above the floor', () => {
    report('step grid (#922)', step, FLOOR_STEP)
    // every projected unit that got a clean probe must round-trip — no partial credit
    expect(step.losses, step.losses.join('\n')).toEqual([])
    expect(step.editOk, `step writer-reach ${step.editOk} fell below floor ${FLOOR_STEP}`).toBeGreaterThanOrEqual(FLOOR_STEP)
  })

  it('piano roll: projection reach holds at or above the floor', () => {
    report('piano roll (#924)', roll, FLOOR_ROLL)
    expect(roll.losses, roll.losses.join('\n')).toEqual([])
    expect(roll.editOk, `roll writer-reach ${roll.editOk} fell below floor ${FLOOR_ROLL}`).toBeGreaterThanOrEqual(FLOOR_ROLL)
  })
})
