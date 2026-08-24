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
import {
  canRemoveNote,
  canResizeNote,
  placeNote,
  removeNote,
  resizeNote,
} from '../../../editor/src/visualEdit/notation/place'
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
 * ⚠ THE PLURAL CONTRACT, PINNED — NOT A DEFECT (#1321). Twenty asks move a second note,
 * and every one of them shares the target's `start` AND `pitch` — a comma-stack holding
 * the same pitch twice. That is the editor's stated rule: a gesture acts on every note at
 * the cell it addresses, which is what delete already does by construction and what paste
 * promises in its own docstring. `(start, pitch)` is the CELL ADDRESS here, not a note
 * identity, and taking it is correct rather than a misread.
 *
 * The alternative was measured and rejected: under a singular reading the second twin is
 * unreachable by any gesture — `overlapAt` returns the first note covering a cell — so it
 * would sit in the document, audible, with no way to select, resize or delete it.
 *
 * Pinned anyway, because the NUMBER is still worth guarding: 20 of that shape and 0 of any
 * other, counted separately below so a violation of the real rule cannot hide in here.
 * ⚠ Do not "fix" this to 0 — that would strand notes. See #1321 for the decision.
 */
const RESIZE_DUPLICATE_STRAYS = 20

/** #1324, characterized in the assertion below — pinned so it cannot grow unnoticed */
const RESIZE_UNREOPENABLE = 119

interface ResizeSweep extends Sweep {
  /** asks that changed a note the gesture did not name AND could have named — must be 0 */
  strayed: number
  /** asks that changed only a note sharing the target's cell — the plural contract, #1321 */
  strayedTwin: number
  /** asks whose result cannot be written down at all */
  unspellable: number
  /** asks whose written bytes the PARSER REJECTS — a different property (#1324) */
  unreadable: number
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
  let unreadable = 0
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
        // ⚠ A DIFFERENT PROPERTY FROM `unspellable`, and the reason #1324 hid under a
        // green arm: "the writer returned bytes" is not "the view can reopen them".
        else if (!parsePianoRoll(out).ok) unreadable++
        answers.set(key, out === null ? 'NULL' : shortHash(out))
      }
    }
  }
  return {
    units,
    asks,
    refused,
    answers,
    strayed,
    strayedTwin,
    unspellable,
    unreadable,
    strayExample,
  }
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

  it('a resize acts on every note sharing the addressed cell, as the contract says', () => {
    // The plural contract (#1321), pinned rather than merely allowed: these notes share the
    // target's start AND pitch, so the gesture addressed a cell holding both and acting on
    // both is correct. It must not GROW, and a regression of the #1318 kind — moving a note
    // the gesture COULD have named — lands in `strayed` above rather than here.
    expect(sweep.strayedTwin, 'strays that share the target start AND pitch').toBe(
      RESIZE_DUPLICATE_STRAYS,
    )
  })

  it('a resize never writes a model that cannot be spelled', () => {
    // 1,069 asks did before #1318, and every one of them showed the user a length the
    // document never received. The honest answer for those is a refusal.
    expect(sweep.unspellable, 'resizes whose result serializes to null').toBe(0)
  })

  it('the writes the roll can no longer REOPEN are exactly the known 119', () => {
    // ⚠ A DIFFERENT PROPERTY FROM `unspellable`, and 0 for that one while this was 119 —
    // which is how #1324 stayed invisible under a green arm. "The writer returned bytes"
    // is not "the view can reopen them".
    //
    // ⚠ AND THE BYTES ARE VALID. Every one of the 119 is the parser's `unstable-period`
    // ADMISSION gate — "the pattern does not repeat within 4 bars" — across 5 units, with
    // zero syntax errors. Strudel plays these documents; the roll just declines to draw
    // them, so the surface falls back to code after the edit.
    //
    // ⚠ PINNED, NOT FIXED, AND DELIBERATELY. Gating the writer on a reparse removes all
    // 119 and costs p99 0.100ms -> 549ms, worst 4.3ms -> 2,155ms, because resize runs on
    // every pointermove and `parsePianoRoll` runs the real grammar. No parse-free
    // discriminator survives measurement either: the write path does not separate them
    // (all 119 are `splice`, so are 5,890 healthy writes), and a comma-count proxy catches
    // 3 of 119 while refusing 2,624 good writes. The affordable fix is one parse when the
    // GESTURE COMMITS rather than one per frame, which belongs to #1324.
    //
    // 1 of the 119 predates #1318; 118 are its ladder reaching pitch-scoped spellings the
    // whole-chord answer never produced. Placement is 0 on both builds.
    expect(sweep.unreadable, 'resizes the roll can no longer reopen — see #1324').toBe(
      RESIZE_UNREOPENABLE,
    )
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

/** measured 2026-08-24 on studio_v0.2.0 + the delete writer */
const DELETE_UNITS = 595
const DELETE_ASKS = 5480

/**
 * ⚠ PINNED WITH ITS ARGUMENT, because a bare number here reads as a defect and is not one.
 * Delete declines on 382 of 5,480 asks, and every one of them WROTE NULL before this op
 * existed — the panel's inline `filter` produced a model the document cannot spell,
 * `useGridModel` dropped it, and the note stayed on screen with nothing said. Measured
 * head-to-head over this population: 5,098 answers byte-identical, 0 answers changed,
 * 0 asks that previously wrote real bytes now refuse.
 *
 * So this number is the silent no-ops becoming nameable, not capability lost. If it FALLS,
 * something learned to spell a case it could not — good, re-pin and say which. If it RISES,
 * the writer lost reach and that is a regression.
 */
const DELETE_REFUSED = 382

const DELETE_ANSWERS = '7f3696bdde0bb4ee'

interface DeleteSweep extends Sweep {
  /** asks whose written bytes serialize to null — must be 0, the whole point of the op */
  unspellable: number
  /** asks where a note the delete KEPT came back different — must be 0 */
  survivorChanged: number
  /** asks where `canRemoveNote` disagreed with the op it is derived from — must be 0 */
  canDisagreed: number
  /** asks that removed more than one note: the plural contract, correct, counted not tolerated */
  plural: number
  survivorExample: string | null
}

/**
 * Every note the roll holds, deleted.
 *
 * ⚠ THE ASK IS THE CELL, NOT THE NOTE, and the sweep is keyed by INDEX anyway. Under the
 * plural contract a delete addresses a cell and takes every note in it, so two asks at a
 * twin pair are the same ask twice — keyed by index they stay distinguishable, which is
 * what lets `plural` be counted rather than inferred.
 */
function sweepDelete(): DeleteSweep {
  const answers = new Map<string, string>()
  let units = 0
  let asks = 0
  let refused = 0
  let unspellable = 0
  let survivorChanged = 0
  let canDisagreed = 0
  let plural = 0
  let survivorExample: string | null = null
  const sig = (n: { pitch: string; start: number; duration: number }): string =>
    `${n.pitch}@${n.start}+${n.duration}`
  for (const mini of minis) {
    const r = parsePianoRoll(mini)
    if (!r.ok) continue
    const m = r.model
    if (serializePianoRoll(m) !== mini) continue
    if (m.notes.length === 0) continue
    units++
    const before = m.notes.map(sig)
    for (let j = 0; j < m.notes.length; j++) {
      const n = m.notes[j]
      asks++
      const key = [mini, j, n.start, n.pitch].join('␟')
      const next = removeNote(m, n.start, n.pitch)

      // the predicate is DERIVED from the op; assert that rather than trusting it
      if (canRemoveNote(m, n.start, n.pitch) !== (next !== m)) canDisagreed++

      if (next === m) {
        answers.set(key, 'REFUSED')
        refused++
        continue
      }

      const removed = m.notes.length - next.notes.length
      if (removed > 1) plural++

      // ⚠ REMOVAL IS NOT A CHANGE; RE-SPELLING IS. Compare the notes the delete KEPT,
      // by index on the source side, against what came back. Deleting must never alter
      // a voice it leaves standing — measured 0 before this op existed, and the reason
      // the fix here is a gate rather than a ladder: there is no better spelling to seek.
      const kept = m.notes
        .map((x, i) => i)
        .filter((i) => !(m.notes[i].pitch === n.pitch && m.notes[i].start === n.start))
      const after = next.notes.map(sig)
      const moved = kept.filter((i, k) => after[k] !== before[i])
      if (moved.length > 0) {
        survivorChanged++
        if (survivorExample === null)
          survivorExample = `${mini} — delete ${n.pitch}@${n.start} altered ${moved
            .map((i) => before[i])
            .join(', ')}`
      }

      const out = serializePianoRoll(next)
      if (out === null) unspellable++
      answers.set(key, out === null ? 'NULL' : shortHash(out))
    }
  }
  return {
    units,
    asks,
    refused,
    answers,
    unspellable,
    survivorChanged,
    canDisagreed,
    plural,
    survivorExample,
  }
}

describe('surface isolation — the roll, every delete it can be asked', () => {
  const sweep = sweepDelete()

  it('sweeps the population it claims to', () => {
    expect(sweep.units).toBe(DELETE_UNITS)
    expect(sweep.asks).toBe(DELETE_ASKS)
  })

  it('never writes a model that cannot be spelled', () => {
    // 382 asks did before this op existed, and each showed the user a note that stayed
    // put with no refusal — the same shape the step grid's cell gesture had before it
    // was gated. The honest answer is to decline, which is what `refused` counts.
    expect(sweep.unspellable, 'deletes whose result serializes to null').toBe(0)
  })

  it('never alters a note it leaves standing', () => {
    expect(
      sweep.survivorChanged,
      `a surviving note was re-spelled — ${sweep.survivorExample}`,
    ).toBe(0)
  })

  it('offers exactly what it will accept', () => {
    // `canRemoveNote` IS the op — asserted rather than assumed, so the two cannot drift.
    expect(sweep.canDisagreed, 'canRemoveNote disagreed with removeNote').toBe(0)
  })

  it('declines only where the document cannot carry the result', () => {
    expect(sweep.refused).toBe(DELETE_REFUSED)
  })

  it('answers every delete the same way', () => {
    expect(aggregate(sweep.answers)).toBe(DELETE_ANSWERS)
  })
})
