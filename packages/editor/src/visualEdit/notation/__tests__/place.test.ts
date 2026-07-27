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
import { toggleCell } from '../place'
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
