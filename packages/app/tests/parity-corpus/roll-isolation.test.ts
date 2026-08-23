/**
 * roll-isolation.test.ts — THE ROLL'S HALF OF `surface-isolation.test.ts`.
 *
 * That file pins every toggle the STEP GRID can be asked, and closes with a stated limit:
 * the invariant it enforces runs in one direction only, because the roll has no
 * equivalent arm. This is that arm. The two together mean a change to either surface is
 * visible to the suite, whichever surface it was made for.
 *
 * ⚠ WHY IT EXISTS, AND WHY THE ARGUMENT FOR IT IS THE SAME ONE TWICE (#1315). Scoping the
 * roll's placement cap moved 3,541 asks — real changes to what the editor writes — and the
 * app suite passed 1216/1216 before and after, because no committed test covered a single
 * one of them. That is the second time in two commits: #1314 moved 84 asks under a suite
 * that passed 1213/1213 both ways, and the answer then was to commit the grid's arm rather
 * than keep the measurement in a session log. A suite that cannot see a change cannot
 * approve one, and the fix for that is coverage of the SURFACE, not one more example.
 *
 * WHAT IT SWEEPS. Every (pitch, start, duration) placement the roll can be asked, over the
 * corpus units that round-trip — the population that found both defects. Duration matters
 * and is why it is here: the instrument this replaces posed duration-1 asks only, at
 * pitches absent from the model, so neither defect could occur in it however healthy its
 * denominators looked.
 *
 * WHAT MOVING THE PIN MEANS. `ROLL_ANSWERS` is one hash over every answer. It is SUPPOSED
 * to trip on any deliberate change to roll placement or to the roll writer — that is the
 * contract, the same one `GRID_ANSWERS` carries. When it trips, say which change moved it
 * and why, and re-pin. What it must never do is move quietly while someone is working on
 * the grid, or on a shared rule both surfaces call.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import { placeNote } from '../../../editor/src/visualEdit/notation/place'
import { serializePianoRoll } from '../../../editor/src/visualEdit/notation/serialize'

const dir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(dir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/** measured 2026-08-24 on studio_v0.2.0 + the scoped placement cap */
const ROLL_UNITS = 596
const ROLL_ASKS = 131103
const ROLL_REFUSED = 17710
const ROLL_ANSWERS = '0b706083df7ec0d5'

/** the durations are the axis the previous instrument lacked — see the header */
const DURATIONS = [1, 2, 4]

const shortHash = (s: string): string =>
  crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)

interface Sweep {
  units: number
  asks: number
  refused: number
  answers: Map<string, string>
}

function sweepRoll(): Sweep {
  const answers = new Map<string, string>()
  let units = 0
  let asks = 0
  let refused = 0
  for (const mini of minis) {
    const r = parsePianoRoll(mini)
    if (!r.ok) continue
    const m = r.model
    // the same admission rule the grid arm uses: only units the writer reproduces, so a
    // moved answer is a change in the EDIT and never in what the view was willing to open
    if (serializePianoRoll(m) !== mini) continue
    units++
    const pitches = [...new Set(m.notes.map((n) => n.pitch))].sort()
    for (const pitch of pitches) {
      for (let start = 0; start < m.steps; start++) {
        for (const duration of DURATIONS) {
          asks++
          const key = [mini, pitch, start, duration].join('␟')
          const next = placeNote(m, pitch, start, duration)
          if (next === m) {
            answers.set(key, 'REFUSED')
            refused++
            continue
          }
          const out = serializePianoRoll(next)
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

describe('surface isolation — the roll, every placement it can be asked', () => {
  const sweep = sweepRoll()

  it('the sweep actually ran — denominators before verdicts', () => {
    // A pinned hash below is only a measurement if these are non-zero and expected. Every
    // silent-zero mistake in this corpus starts with a comparison that never happened.
    expect(sweep.units, 'roll units that round-trip').toBe(ROLL_UNITS)
    expect(sweep.asks, 'placements posed').toBe(ROLL_ASKS)
    expect(sweep.answers.size).toBeGreaterThan(0)
  })

  it('every placement the roll can be asked answers exactly as pinned', () => {
    expect(sweep.refused, 'refusals').toBe(ROLL_REFUSED)
    expect(aggregate(sweep.answers), 'aggregate over every roll answer').toBe(ROLL_ANSWERS)
  })

  it('POSITIVE CONTROL — the aggregate can tell two sweeps apart', () => {
    // Without this, a hash that agreed for the wrong reason — an empty map, one constant
    // answer — would read exactly like a passing gate.
    const perturbed = new Map(sweep.answers)
    const first = [...perturbed.keys()].sort()[0]
    perturbed.set(first, 'DELIBERATELY-DIFFERENT')
    expect(aggregate(perturbed)).not.toBe(ROLL_ANSWERS)
    expect(new Set(sweep.answers.values()).size, 'answers are not all one value').toBeGreaterThan(
      1,
    )
  })
})
