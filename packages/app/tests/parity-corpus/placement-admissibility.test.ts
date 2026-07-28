/**
 * #1064 / #1070 — PROVE BEFORE OFFER, AT THE GESTURE.
 *
 * `op-admissibility.test.ts` (#1010 P4c) asserts this for every op and every
 * control-state function. It never covered the CELL — the interaction the panel
 * exists for — so a click on a cell whose result the writer cannot spell wrote
 * nothing, toggled nothing and said nothing. This is that gate, for placement.
 *
 * POPULATION (stated, per this boundary's standing rule that every gate names
 * its population, its comparison axes and its sampling depth):
 *   - every mini in `mini-corpus.json` that opens a step grid or a piano roll;
 *   - split by WRITE PATH — `leafSource` / `altSource` / `source` — because the
 *     same gesture on the same model has a different answer per path, and
 *     nothing in the model surfaces which one it is (#1070);
 *   - grid: every EMPTY cell of every lane. Roll: every (pitch, step) over the
 *     model's own content range, which is the range the panel displays.
 *   - the axis is PLACEMENT only (OFF→ON). Deletes, resizes and velocity are
 *     different ops with their own write paths and are not gated here.
 *
 * THE COMPARISON IS AGAINST AN INDEPENDENT ARM, not against itself. `canToggleCell`
 * is *derived* from `toggleCell`, so asking whether they agree is a tautology and
 * would read green forever ([[P370]] — a gate that cannot fail). The arm below
 * rebuilds the UNGATED toggle — the pre-#1064 shape — and asks the real writer
 * about its output. That is a deliberate second oracle used as a control, which
 * is the one use [[PV192]] permits: it exists to be compared against, never to
 * decide anything.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePianoRoll, parseStepGrid } from '../../../editor/src/visualEdit/notation/parse'
import { cellOn, clampLane, isCellOn } from '../../../editor/src/visualEdit/notation/model'
import type {
  PianoRollModel,
  StepCell,
  StepGridModel,
} from '../../../editor/src/visualEdit/notation/model'
import {
  canPlaceNote,
  canToggleCell,
  viewPlacesNotes,
} from '../../../editor/src/visualEdit/notation/place'
import {
  serializePianoRoll,
  serializeStepGrid,
} from '../../../editor/src/visualEdit/notation/serialize'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'))
const minis: string[] = corpus.minis.map((o: { mini: string }) => o.mini)

type Path = 'leaf' | 'alt' | 'element'
const pathOf = (m: { leafSource?: unknown; altSource?: unknown }): Path =>
  m.leafSource ? 'leaf' : m.altSource ? 'alt' : 'element'

/**
 * THE CONTROL ARM — `toggleCell` as it stood before #1064: build the model and
 * hand it to the writer, no admissibility question asked. Kept byte-for-byte in
 * shape with the production op minus the `ifGridSpellable` wrapper, so the only
 * variable between the arms is the gate itself.
 */
function ungatedToggle(
  model: StepGridModel,
  laneIndex: number,
  stepIndex: number,
  value: boolean,
): StepGridModel {
  const paint = (v: boolean): StepCell => (v ? cellOn() : false)
  return {
    ...model,
    lanes: model.lanes.map((lane, i) =>
      i === laneIndex
        ? {
            ...lane,
            cells: clampLane(
              lane.cells.map((c, j) => (j === stepIndex ? paint(value) : c)),
              model.steps,
            ),
          }
        : lane,
    ),
  }
}

function ungatedPlace(
  model: PianoRollModel,
  pitch: string,
  start: number,
  duration: number,
): PianoRollModel {
  const groupAt = model.notes.find((n) => n.start === start)
  if (groupAt) {
    return { ...model, notes: [...model.notes, { pitch, start, duration: groupAt.duration }] }
  }
  const nextStart = Math.min(
    ...model.notes.filter((n) => n.start > start).map((n) => n.start),
    model.steps,
  )
  const notes = model.notes.map((n) =>
    n.start < start && n.start + n.duration > start ? { ...n, duration: start - n.start } : n,
  )
  notes.push({ pitch, start, duration: Math.max(1, Math.min(duration, nextStart - start)) })
  return { ...model, notes }
}

interface Tally {
  units: number
  asks: number
  refused: number
}
const zero = (): Tally => ({ units: 0, asks: 0, refused: 0 })

describe('#1064/#1070 — a placement is offered exactly when the writer will take it', () => {
  it('grid: the offer matches the writer on every cell, split by write path', () => {
    const by: Record<Path, Tally> = { leaf: zero(), alt: zero(), element: zero() }
    let disagreements = 0
    const examples: string[] = []
    let leafOffered = 0

    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok) continue
      const p = pathOf(r.model)
      by[p].units++
      for (let lane = 0; lane < r.model.lanes.length; lane++) {
        for (let col = 0; col < r.model.steps; col++) {
          if (isCellOn(r.model.lanes[lane].cells[col])) continue // placement only
          by[p].asks++
          const offered = canToggleCell(r.model, lane, col, true)
          // the independent arm: would the real writer have taken it?
          const writable = serializeStepGrid(ungatedToggle(r.model, lane, col, true)) !== null
          if (offered !== writable) {
            disagreements++
            if (examples.length < 8)
              examples.push(`${JSON.stringify(mini)} [${lane},${col}] offered=${offered} writable=${writable}`)
          }
          if (!offered) by[p].refused++
          if (p === 'leaf' && offered) leafOffered++
        }
      }
    }

    // THE CLAIM. Not "the panel refuses less" — it refuses exactly as much, and
    // now says so before the click instead of swallowing it.
    expect(examples.join('\n')).toBe('')
    expect(disagreements, 'the offer must equal what the writer will accept').toBe(0)

    // CALIBRATION against the committed #1070 figures — the measurement the
    // decision was taken on. Asks and refusals reproduce EXACTLY on all three
    // paths, which is what licenses the rest of this file.
    //
    // ⚠ UNITS DIFFER BY 8 ON THE ELEMENT PATH, and the difference is named
    // rather than pinned away: this sweep counts every model that PARSES (827),
    // the committed sweep counted those that open a placeable view (819). The 8
    // contribute zero asks — a grid with no empty cell has no placement to
    // offer — which is why every ask-level figure is identical. Counting
    // parseable units is the honest denominator for "did the offer match the
    // writer"; it is NOT the denominator for a placement percentage.
    expect(
      { asks: by.element.asks, refused: by.element.refused },
      'element path — reproduces the committed 1,748 / 11,633 = 15.0%',
    ).toEqual({ asks: 11633, refused: 1748 })
    expect(
      { asks: by.leaf.asks, refused: by.leaf.refused },
      'leaf path — 100.0%, refused by construction',
    ).toEqual({ asks: 3584, refused: 3584 })
    expect(
      { asks: by.alt.asks, refused: by.alt.refused },
      'alt path — 512 / 3,427 = 14.9%',
    ).toEqual({ asks: 3427, refused: 512 })
    expect(
      { leaf: by.leaf.units, alt: by.alt.units, element: by.element.units },
      'parseable units per path',
    ).toEqual({ leaf: 82, alt: 57, element: 827 })

    // #1070's own invariant: a leaf-anchored grid accepts NO placement. Byte
    // surgery edits a note's own span, and a new note has no span — so this is a
    // property of the path, and `viewPlacesNotes` is entitled to answer it once
    // for the whole view instead of the panel asking 3,584 times.
    expect(leafOffered, 'a leaf-anchored grid takes no new note at all').toBe(0)
  })

  it('roll: the offer matches the writer on every cell, split by write path', () => {
    const by: Record<Path, Tally> = { leaf: zero(), alt: zero(), element: zero() }
    let disagreements = 0
    const examples: string[] = []
    let leafOffered = 0

    for (const mini of minis) {
      const r = parsePianoRoll(mini)
      if (!r.ok) continue
      const p = pathOf(r.model)
      by[p].units++
      // the pitches the panel shows: the model's own content, which is what
      // `contentRange` seeds the sticky range from.
      const pitches = [...new Set(r.model.notes.map((n) => n.pitch))]
      for (const pitch of pitches) {
        for (let step = 0; step < r.model.steps; step++) {
          if (r.model.notes.some((n) => n.pitch === pitch && n.start === step)) continue
          by[p].asks++
          const offered = canPlaceNote(r.model, pitch, step, 1)
          const writable = serializePianoRoll(ungatedPlace(r.model, pitch, step, 1)) !== null
          if (offered !== writable) {
            disagreements++
            if (examples.length < 8)
              examples.push(`${JSON.stringify(mini)} [${pitch},${step}] offered=${offered} writable=${writable}`)
          }
          if (!offered) by[p].refused++
          if (p === 'leaf' && offered) leafOffered++
        }
      }
    }

    expect(examples.join('\n')).toBe('')
    expect(disagreements, 'the offer must equal what the writer will accept').toBe(0)
    expect(leafOffered, 'a leaf-anchored roll takes no new note at all').toBe(0)
    // Sampling depth stated rather than assumed: the sweep must actually reach
    // all three paths, or a zero above is an instrument verdict, not a code one.
    expect(by.leaf.units, 'leaf rolls reached').toBeGreaterThan(0)
    expect(by.element.units, 'element rolls reached').toBeGreaterThan(0)
    expect(by.element.asks, 'element roll placements reached').toBeGreaterThan(1000)
  })

  it('viewPlacesNotes answers the PATH question, and no non-leaf view lost placement', () => {
    let leafViews = 0
    let nonLeafWithAnAsk = 0
    let nonLeafWithSomeOffer = 0
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok) continue
      const places = viewPlacesNotes(r.model)
      expect(places, 'viewPlacesNotes must read the write path').toBe(!r.model.leafSource)
      let asks = 0
      let offers = 0
      for (let lane = 0; lane < r.model.lanes.length; lane++)
        for (let col = 0; col < r.model.steps; col++) {
          if (isCellOn(r.model.lanes[lane].cells[col])) continue
          asks++
          if (canToggleCell(r.model, lane, col, true)) offers++
        }
      if (!places) {
        leafViews++
        // The view-level answer and every cell on it must say the same thing —
        // which is what entitles the panel to say it ONCE instead of greying
        // 3,584 cells with no reason on them (#1070).
        expect(offers, 'a leaf view offers no placement anywhere').toBe(0)
      } else {
        if (asks > 0) nonLeafWithAnAsk++
        if (offers > 0) nonLeafWithSomeOffer++
      }
    }
    expect(leafViews, 'leaf grids in the corpus').toBe(82)
    // THE OTHER HALF OF THE CLAIM, and the one that would catch an over-broad
    // gate: suppressing placement on leaf views must not have suppressed it
    // anywhere else. Every non-leaf view that has an empty cell at all still
    // offers at least one — 468 of 468, no exceptions. A gate that quietly
    // greyed a whole surface would show up here as a shortfall.
    expect(nonLeafWithAnAsk, 'non-leaf grids with any empty cell').toBe(468)
    expect(nonLeafWithSomeOffer, 'non-leaf grids that still take a note').toBe(468)
  })
})
