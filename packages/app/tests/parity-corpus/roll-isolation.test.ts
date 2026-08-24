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
import { canResizeNote, placeNote, resizeNote } from '../../../editor/src/visualEdit/notation/place'
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

/** measured 2026-08-24 on the same tree, resizing every note the roll holds */
const RESIZE_UNITS = 595
const RESIZE_ASKS = 16440
const RESIZE_ANSWERS = '35db149654f900c6'

/**
 * ⚠ THE RESIDUAL, PINNED RATHER THAN TOLERATED (#1321). Twenty asks still move a note the
 * gesture did not name, and every one of them moves a note sharing the target's `start`
 * AND `pitch` — a comma-stack holding the same pitch twice. `resizeNote` names its note by
 * that value tuple and the drag passes the same one, so neither can tell the two apart;
 * the identity is missing from the API rather than misread by the writer. Measured: 20 of
 * that shape, 0 of any other, which is why the two are counted separately below.
 */
const RESIZE_DUPLICATE_STRAYS = 20

interface ResizeSweep extends Sweep {
  /** asks that changed a note the gesture did not name AND could have named — must be 0 */
  strayed: number
  /** asks that changed only an indistinguishable twin of the target — #1321 */
  strayedTwin: number
  /** asks whose result cannot be written down at all */
  unspellable: number
  strayExample: string | null
}

/**
 * THE SAME SWEEP FOR THE GESTURE NEXT DOOR (#1318).
 *
 * ⚠ WHY A SECOND ARM RATHER THAN TRUST IN THE FIRST. "An edit may not change what the
 * user did not touch" was established on PLACEMENT and enforced there twice — the
 * same-pitch trim (#1310) and the cap ladder (#1315). Resize, the neighbouring function
 * in the same file on the same surface, broke it the whole time: its multi-bar branch
 * accepted a `pitch` argument and never read it. An invariant enforced where it was
 * discovered is not enforced across the gestures that can violate it, so every op that
 * can break one needs its own sweep rather than an argument that it probably behaves.
 *
 * ⚠ THE HASH IS NOT THE WHOLE GATE HERE. A pinned aggregate is re-pinned whenever someone
 * changes the writer deliberately, and a re-pin would happily absorb the defect coming
 * back. So the invariant is asserted BY NAME — `strayed` must be 0 — and that assertion
 * survives any re-pin. Same for `unspellable`: this surface used to write 1,069 models
 * that serialize to null, which the view showed as a length the document never received.
 */
function sweepResize(): ResizeSweep {
  const answers = new Map<string, string>()
  let units = 0
  let asks = 0
  let refused = 0
  let strayed = 0
  let strayedTwin = 0
  let unspellable = 0
  let strayExample: string | null = null
  const sig = (n: { pitch: string; start: number; duration: number }): string =>
    `${n.pitch}@${n.start}+${n.duration}`
  for (const mini of minis) {
    const r = parsePianoRoll(mini)
    if (!r.ok) continue
    const m = r.model
    if (serializePianoRoll(m) !== mini) continue
    if (m.notes.length === 0) continue
    units++
    // ⚠ KEYED BY INDEX, NOT BY (start, pitch). A comma-stack can hold the same pitch twice
    // at one start, so the value tuple is not an identity — keying on it merged 84 asks
    // and made this sweep disagree with the census that shares its population.
    const before = m.notes.map(sig)
    for (let j = 0; j < m.notes.length; j++) {
      const n = m.notes[j]
      for (const duration of DURATIONS) {
        asks++
        const key = [mini, j, n.start, n.pitch, duration].join('␟')
        const next = resizeNote(m, n.start, n.pitch, duration)
        if (next === m) {
          answers.set(key, 'REFUSED')
          refused++
          continue
        }
        // ⚠ COMPARED BY INDEX, not by filtering the value tuple out. Filtering
        // `(start, pitch)` hides exactly the notes #1321 is about — the target's
        // indistinguishable twin drops out of both sides and its movement is invisible.
        // The throwaway census did it that way and reported 0 where this reports 20.
        const moved = next.notes
          .map((x, i) => ({ i, sig: sig(x) }))
          .filter((e) => e.i !== j && e.sig !== before[e.i])
        if (moved.length > 0) {
          const twinsOnly = moved.every(
            (e) => m.notes[e.i].start === n.start && m.notes[e.i].pitch === n.pitch,
          )
          if (twinsOnly) strayedTwin++
          else {
            strayed++
            if (strayExample === null)
              strayExample = `${mini} — resize ${n.pitch}@${n.start} to ${duration} moved ${moved
                .map((e) => `${before[e.i]}→${e.sig}`)
                .join(', ')}`
          }
        }
        const out = serializePianoRoll(next)
        if (out === null) unspellable++
        answers.set(key, out === null ? 'NULL' : shortHash(out))
      }
    }
  }
  return { units, asks, refused, answers, strayed, strayedTwin, unspellable, strayExample }
}

describe('surface isolation — the roll, every resize it can be asked', () => {
  const sweep = sweepResize()

  it('the sweep actually ran — denominators before verdicts', () => {
    expect(sweep.units, 'roll units that round-trip and hold a note').toBe(RESIZE_UNITS)
    expect(sweep.asks, 'resizes posed').toBe(RESIZE_ASKS)
    expect(sweep.answers.size).toBeGreaterThan(0)
  })

  it('a resize never changes a note the gesture did not name', () => {
    // Asserted by name so a future re-pin of the aggregate cannot absorb the defect
    // coming back. 642 of these were real before #1318.
    expect(sweep.strayed, `notes moved that the gesture never named — ${sweep.strayExample}`).toBe(
      0,
    )
  })

  it('the only notes it still moves are ones it cannot tell from the target', () => {
    // Pinned, not tolerated (#1321): equal on both sides means the writer cannot name
    // which one was grabbed, so this cannot be fixed here — but it must not GROW, and a
    // regression of the #1318 kind would land in `strayed` above rather than here.
    expect(sweep.strayedTwin, 'strays that share the target start AND pitch').toBe(
      RESIZE_DUPLICATE_STRAYS,
    )
  })

  it('a resize never writes a model that cannot be spelled', () => {
    // 1,069 asks did before #1318, and every one of them showed the user a length the
    // document never received. The honest answer for those is a refusal.
    expect(sweep.unspellable, 'resizes whose result serializes to null').toBe(0)
  })

  it('every resize the roll can be asked answers exactly as pinned', () => {
    expect(aggregate(sweep.answers), 'aggregate over every roll resize').toBe(RESIZE_ANSWERS)
  })

  it('canResizeNote IS the op, not a predicate beside it', () => {
    // The same assertion `cellResize.test.ts` makes of `canResizeCell`, and the reason
    // the roll's twin exists at all (#1318): a view-level predicate that PREDICTS the
    // writer is a second oracle and drifts the moment the writer's reach moves. Asked of
    // every ask in the sweep, so agreement is measured rather than argued.
    //
    // ⚠ THIS IS ALSO ITS ONLY CALLER TODAY, and that is stated rather than hidden — the
    // roll's panel still draws its length handle unconditionally, so `canResizeNote` is
    // tree-shaken out of the shipped bundle while `canResizeCell` is not. Wiring the
    // handle is #1322; until then this keeps the predicate from drifting unseen.
    let asked = 0
    let disagreeing = 0
    for (const mini of minis) {
      const r = parsePianoRoll(mini)
      if (!r.ok) continue
      const m = r.model
      if (serializePianoRoll(m) !== mini) continue
      for (const n of m.notes)
        for (const duration of DURATIONS) {
          asked++
          if (canResizeNote(m, n.start, n.pitch, duration) !== (resizeNote(m, n.start, n.pitch, duration) !== m))
            disagreeing++
        }
    }
    expect(asked, 'asks the predicate was compared on').toBe(RESIZE_ASKS)
    expect(disagreeing, 'canResizeNote disagrees with the op it stands for').toBe(0)
  })

  it('POSITIVE CONTROL — the aggregate can tell two sweeps apart', () => {
    const perturbed = new Map(sweep.answers)
    const first = [...perturbed.keys()].sort()[0]
    perturbed.set(first, 'DELIBERATELY-DIFFERENT')
    expect(aggregate(perturbed)).not.toBe(RESIZE_ANSWERS)
    expect(new Set(sweep.answers.values()).size, 'answers are not all one value').toBeGreaterThan(
      1,
    )
  })
})

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
