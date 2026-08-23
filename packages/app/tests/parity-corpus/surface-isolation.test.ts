/**
 * surface-isolation.test.ts — AN EDIT TO ONE SURFACE MUST NOT MOVE THE OTHER.
 *
 * The step grid and the piano roll are two views over one notation, and they share more
 * than they diverge: one parser, one model, one writer, and a growing set of shared rules
 * (`columnOverlap` is the current one). That sharing is deliberate and worth keeping — the
 * alternative is two implementations of mini-notation that drift. What it costs is a
 * standing hazard: a change made FOR one surface can move the other silently, because the
 * thing both call is the thing that changed.
 *
 * ⚠ WHY THIS EXISTS AS A GATE RATHER THAN A HABIT (#1314). While scoping the roll's
 * placement ops, the claim "the grid is untouched" rested on reading the diff — the edits
 * were inside `placeNote`, and the shared predicate was newly CALLED rather than changed.
 * That reasoning was correct and it was still only inference. Asked properly, per ask
 * across both builds, the grid returned 0 of 62,424 moved — a measurement, and a different
 * kind of statement from an argument.
 *
 * ⚠ AND THE REASON A PASSING SUITE IS NOT THIS GUARD: the same change moved 84 roll asks
 * and the app suite passed 1213/1213 before and after, because no committed test covers
 * any of those 84. A suite that cannot see a change cannot approve one. This arm can see
 * the whole surface at once, which is what makes its zero mean something.
 *
 * WHAT MOVING THE PIN MEANS. `GRID_ANSWERS` is one hash over every toggle the grid can be
 * asked. It is SUPPOSED to trip on any deliberate grid change — that is the point, the
 * same contract every other pinned figure here carries. When it trips, say which change
 * moved it and why, and re-pin. What it must never do is move quietly while someone is
 * working on the roll.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStepGrid } from '../../../editor/src/visualEdit/notation/parse'
import { toggleCell } from '../../../editor/src/visualEdit/notation/place'
import { serializeStepGrid } from '../../../editor/src/visualEdit/notation/serialize'

const dir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(dir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/** measured 2026-08-23 on studio_v0.2.0 + #1314, and identical on the build before it */
const GRID_UNITS = 1021
const GRID_ASKS = 62424
const GRID_REFUSED = 4899
const GRID_ANSWERS = 'be66ed01e4467421'

const shortHash = (s: string): string =>
  crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)

interface Sweep {
  units: number
  asks: number
  refused: number
  answers: Map<string, string>
}

function sweepGrid(): Sweep {
  const answers = new Map<string, string>()
  let units = 0
  let asks = 0
  let refused = 0
  for (const mini of minis) {
    const r = parseStepGrid(mini)
    if (!r.ok) continue
    const m = r.model
    if (serializeStepGrid(m) !== mini) continue
    units++
    for (let lane = 0; lane < m.lanes.length; lane++) {
      for (let step = 0; step < m.lanes[lane].cells.length; step++) {
        for (const value of [true, false]) {
          asks++
          const key = [mini, lane, step, value ? 'on' : 'off'].join('␟')
          const next = toggleCell(m, lane, step, value)
          if (next === m) {
            answers.set(key, 'REFUSED')
            refused++
            continue
          }
          const out = serializeStepGrid(next)
          answers.set(key, out === null ? 'NULL' : shortHash(out))
        }
      }
    }
  }
  return { units, asks, refused, answers }
}

const aggregate = (answers: Map<string, string>): string => {
  const h = crypto.createHash('sha256')
  for (const key of [...answers.keys()].sort()) {
    h.update(key)
    h.update('=')
    h.update(answers.get(key)!)
    h.update('\n')
  }
  return h.digest('hex').slice(0, 16)
}

describe('surface isolation — the grid does not move when the roll is worked on', () => {
  const sweep = sweepGrid()

  it('the sweep actually ran — denominators before verdicts', () => {
    // A zero further down is only a measurement if this is non-zero. The whole family of
    // silent-zero mistakes in this corpus begins with a comparison that never happened.
    expect(sweep.units, 'grid units that round-trip').toBe(GRID_UNITS)
    expect(sweep.asks, 'toggles posed').toBe(GRID_ASKS)
    expect(sweep.answers.size).toBeGreaterThan(0)
  })

  it('every toggle the grid can be asked answers exactly as pinned', () => {
    expect(sweep.refused, 'refusals').toBe(GRID_REFUSED)
    expect(aggregate(sweep.answers), 'aggregate over every grid answer').toBe(GRID_ANSWERS)
  })

  it('POSITIVE CONTROL — the aggregate can tell two sweeps apart', () => {
    // Without this, a hash that agreed for the wrong reason (an empty map, a constant
    // answer) would read exactly like a passing gate.
    const perturbed = new Map(sweep.answers)
    const first = [...perturbed.keys()].sort()[0]
    perturbed.set(first, 'DELIBERATELY-DIFFERENT')
    expect(aggregate(perturbed)).not.toBe(GRID_ANSWERS)
    expect(new Set(sweep.answers.values()).size, 'answers are not all one value').toBeGreaterThan(
      1,
    )
  })
})
