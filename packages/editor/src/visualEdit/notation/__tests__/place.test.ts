/**
 * `toggleCell` — the grid's placement gesture, stated at the layer that owns it.
 *
 * The corpus sweeps already exercise this over every real-world mini, and they
 * are what proves it holds at scale. This file is the other half: the contract in
 * a form you can read, at the module the gesture lives in, so the next change to
 * what a toggle does has somewhere obvious to state itself (#1048).
 */
import { describe, it, expect } from 'vitest'
import { parseStepGrid } from '../parse'
import { serializeStepGrid } from '../serialize'
import { canToggleCell, toggleCell, viewPlacesNotes } from '../place'
import { cellOn, isCellOn } from '../model'
import type { StepGridModel } from '../model'

function parse(s: string): StepGridModel {
  const r = parseStepGrid(s)
  if (!r.ok) throw new Error(`parse failed: ${r.reason}`)
  return r.model
}

describe('toggleCell — the one definition of what a cell click does (#1048)', () => {
  it('places a hit lasting exactly the column clicked', () => {
    const m = toggleCell(parse('bd ~ sd ~'), 0, 1, true)
    expect(m.lanes[0].cells[1]).toEqual(cellOn())
    expect(serializeStepGrid(m)).toBe('bd bd sd ~')
  })

  it('clears a hit, leaving the rest of the lane alone', () => {
    const m = toggleCell(parse('bd bd sd ~'), 0, 1, false)
    expect(isCellOn(m.lanes[0].cells[1])).toBe(false)
    expect(serializeStepGrid(m)).toBe('bd ~ sd ~')
  })

  it('does not touch the lanes it was not asked about', () => {
    const before = parse('[bd,hh] ~ sd ~')
    const after = toggleCell(before, 0, 1, true)
    expect(after.lanes[1]).toBe(before.lanes[1])
  })

  /**
   * THE CLAMP, which is the reason this function has one definition rather than
   * three. A hit painted into a column an earlier note was still sounding through
   * takes that note's room, so the earlier note has to end where the new one
   * starts. Without it the model carries a length reaching past the new hit —
   * notation nothing can spell — and the writer declines an edit the user plainly
   * made.
   */
  it('shortens a note the new hit lands inside', () => {
    // `bd _ ~ ~` — one note sounding through columns 0 and 1. Painting at column 1
    // takes the room it was using, so it has to end at column 1 instead.
    const after = toggleCell(parse('bd _ ~ ~'), 0, 1, true)
    expect(after.lanes[0].cells[0]).toEqual(cellOn(1))
    expect(after.lanes[0].cells[1]).toEqual(cellOn(1))
    expect(serializeStepGrid(after)).toBe('bd bd ~ ~')
  })

  it('leaves a note alone when the new hit lands after it ends', () => {
    // the same note, but the hit goes at column 2 — where it was already finished
    const after = toggleCell(parse('bd _ ~ ~'), 0, 2, true)
    expect(after.lanes[0].cells[0]).toEqual(cellOn(2))
    expect(serializeStepGrid(after)).toBe('bd _ bd ~')
  })

  /**
   * The panel guards this before calling (`paintCell` returns early past the end),
   * and the model keeps `cells.length === steps` — measured across the whole
   * corpus, 0 of 966 parsing models have a lane shorter than its grid. Pinned here
   * because the sweeps used to write past the end directly, which simulated a
   * model no gesture can produce.
   */
  it('cannot grow a lane past its own length', () => {
    const m = parse('bd ~ sd ~')
    const after = toggleCell(m, 0, 99, true)
    expect(after.lanes[0].cells).toHaveLength(m.lanes[0].cells.length)
  })
})

/**
 * PROVE BEFORE OFFER, AT THE CELL (#1064) — an op is admissible exactly when its
 * result is WRITABLE, asked of the real writer. `resize.ts` and `resolution.ts`
 * have applied this since #1010 P4c; the cell, which is the gesture the panel
 * exists for, was the one that never got it. The visible consequence was silence:
 * a click the writer could not spell wrote nothing, toggled nothing, said nothing.
 */
describe('placement admissibility — the op refuses rather than going inert (#1064)', () => {
  it('refuses by returning the INPUT, so `mutate` skips and `can*` is derivable', () => {
    // `<bd - - -> *2` is leaf-anchored: its notes are written by byte surgery at
    // their own spans, so a note at a column no leaf sits under has no spelling.
    const m = parse('<bd - - -> *2')
    expect(m.leafSource, 'fixture must reach the leaf path').toBeTruthy()
    const after = toggleCell(m, 0, 1, true)
    expect(after, 'refusal is the input by reference').toBe(m)
    expect(canToggleCell(m, 0, 1, true)).toBe(false)
  })

  it('leaves the document exactly as written when it refuses', () => {
    const src = '<bd - - -> *2'
    const m = parse(src)
    expect(serializeStepGrid(toggleCell(m, 0, 1, true))).toBe(src)
  })

  it('still offers the placements the writer will take', () => {
    const m = parse('bd ~ sd ~')
    expect(canToggleCell(m, 0, 1, true)).toBe(true)
    expect(toggleCell(m, 0, 1, true)).not.toBe(m)
  })

  /**
   * DELETES ARE NOT GATED BY THIS DECISION. A leaf view exists to edit what is
   * already there, and byte surgery at an existing note's own span is precisely
   * what it can do — so clearing a hit goes through on the same model that
   * refuses a placement. This is the split that showed placement is unsupported
   * BY CONSTRUCTION rather than broken (#1070): 63 deletes written vs 0 places.
   */
  it('a leaf view still clears the notes it holds', () => {
    const m = parse('<bd - - -> *2')
    const laneCell = m.lanes[0].cells.findIndex((c) => isCellOn(c))
    expect(laneCell, 'fixture must have a hit to clear').toBeGreaterThanOrEqual(0)
    expect(canToggleCell(m, 0, laneCell, false)).toBe(true)
  })
})

describe('viewPlacesNotes — the PATH question, asked once per view (#1070)', () => {
  it('is false for a leaf-anchored view and true otherwise', () => {
    expect(viewPlacesNotes(parse('<bd - - -> *2'))).toBe(false)
    expect(viewPlacesNotes(parse('bd ~ sd ~'))).toBe(true)
  })

  /**
   * The whole point of asking it at the view: it must agree with what every
   * cell would say, so the panel can state it once instead of greying each cell
   * with no reason on it.
   */
  it('agrees with every cell on the view it describes', () => {
    const m = parse('<bd - - -> *2')
    expect(viewPlacesNotes(m)).toBe(false)
    for (let col = 0; col < m.steps; col++)
      if (!isCellOn(m.lanes[0].cells[col])) expect(canToggleCell(m, 0, col, true)).toBe(false)
  })
})
