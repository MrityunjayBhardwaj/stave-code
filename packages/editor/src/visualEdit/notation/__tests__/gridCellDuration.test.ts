/**
 * gridCellDuration.test.ts — the step CELL carries how long its note sounds
 * (#1010 P4b), and the grid ops keep that length meaning what it says.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE COVERAGE GATES. P4b is a representation
 * change: it must move no number anywhere, and "no number moved" is exactly as
 * consistent with the new field being correctly populated as with it being silently
 * empty — nothing consumes it until P4c. So the field is asserted DIRECTLY, on values
 * a degenerate reader could not produce:
 *
 *   - lengths UNEQUAL to each other in one pattern (`bd hh*2 sd cp` → 2 and 1)
 *   - lengths GREATER than a column (`bd [sd sd sd]` → 3)
 *   - lengths SMALLER than a column (`[hh ~]!16` → 0.5 — a reader returning the
 *     column width cannot produce this, and neither can one returning a slot span)
 *   - a length that is neither (`[bd@0.5 - - -]` → 1/7)
 *
 * A reader that answered "1" for everything passes any test built from evenly spaced
 * single-column notes, which is most of the corpus. These are the cases that fail it.
 *
 * The sibling of `gridOnsetDuration.test.ts` (P4a, the same discipline one layer up,
 * where the axis first reached `Onset.durs`). Corpus-wide agreement with the engine
 * for every ON cell is `cell-duration.test.ts` in the app package; this file pins the
 * hand-checked cases and the ops' semantics.
 */
import { describe, it, expect } from 'vitest'
import { parseStepGrid } from '../parse'
import { cellOn, isCellOn } from '../model'
import type { StepCell, StepGridModel } from '../model'
import { scaleStepGrid, quantizeStepGridTo } from '../resolution'
import { resizeGrid } from '../resize'

/** the lengths of one lane's cells, `null` where the cell is off */
const lens = (m: StepGridModel, sound: string): (number | null)[] => {
  const lane = m.lanes.find((l) => l.sound === sound)
  if (!lane) throw new Error(`no lane ${sound}`)
  return lane.cells.map((c) => (isCellOn(c) ? c.duration : null))
}

const grid = (mini: string): StepGridModel => {
  const r = parseStepGrid(mini)
  if (!r.ok) throw new Error(`${mini}: ${r.reason}`)
  return r.model
}

describe('a step cell carries its note’s length, in columns', () => {
  it('a plain step lasts exactly its column', () => {
    expect(lens(grid('bd ~ bd ~'), 'bd')).toEqual([1, null, 1, null])
  })

  it('a step beside a subdivided one lasts the columns it OWNS', () => {
    // `bd hh*2 sd cp` is four steps on eight columns: `bd`, `sd` and `cp` each own
    // two, the two `hh` one each. Nothing in the view showed this before — the cell
    // was one bit and the writer re-derived every length as one column.
    const m = grid('bd hh*2 sd cp')
    expect(m.steps).toBe(8)
    expect(lens(m, 'bd')).toEqual([2, null, null, null, null, null, null, null])
    expect(lens(m, 'hh')).toEqual([null, null, 1, 1, null, null, null, null])
    expect(lens(m, 'sd')).toEqual([null, null, null, null, 2, null, null, null])
    expect(lens(m, 'cp')).toEqual([null, null, null, null, null, null, 2, null])
  })

  it('a step beside a three-way group owns three columns', () => {
    expect(lens(grid('bd [sd sd sd]'), 'bd')).toEqual([3, null, null, null, null, null])
  })

  it('a note SHORTER than its column keeps its real length', () => {
    // The case the whole phase is named after: sixteen notes of 1/32 cycle on a
    // 1/16 grid. Re-derived at the view's resolution they come back TWICE as long,
    // which is the duration loss #1026 counted 40 of.
    expect(lens(grid('[hh ~]!16'), 'hh')).toEqual(Array<number>(16).fill(0.5))
  })

  it('a length that is neither a column nor half of one', () => {
    // `[bd@0.5 - - -]` is one seventh of a cycle on a one-column grid. No rounding
    // to the grid, and nothing a span-shaped reader would produce.
    const [only] = lens(grid('[bd@0.5 - - -]'), 'bd')
    expect(only).toBeCloseTo(1 / 7, 12)
  })

  it('a `,`-stack part coarser than the shared grid is scaled to it', () => {
    // `sd` is one note over the whole cycle while `bd bd` sets the grid to two
    // columns, so `sd` lasts TWO of them. The first cut of P4b left it at one — the
    // part's own column count — and `cell-duration.test.ts` caught it on its first
    // run, over 69 cells in 14 units.
    const m = grid('bd bd, sd')
    expect(m.steps).toBe(2)
    expect(lens(m, 'bd')).toEqual([1, 1])
    expect(lens(m, 'sd')).toEqual([2, null])
  })

  it('an elongation read through the leaf projection keeps its length', () => {
    // `bd _sd` — bd held over two of three slots. The syntactic core refuses `_`
    // elongation outright, so this is the projected path, and it agrees with the
    // core's own arithmetic about what a held note lasts.
    const m = grid('bd _sd')
    expect(lens(m, 'bd')).toEqual([2, null, null])
    expect(lens(m, 'sd')).toEqual([null, null, 1])
  })
})

describe('the grid ops keep a length meaning what it says', () => {
  it('×2 doubles every length — the note keeps its time, at a finer resolution', () => {
    const m = scaleStepGrid(grid('bd hh*2 sd cp'), 'double')
    expect(m.steps).toBe(16)
    expect(lens(m, 'bd')[0]).toBe(4)
    expect(lens(m, 'hh').filter((d) => d !== null)).toEqual([2, 2])
  })

  it('÷2 halves them, and needs no integrality guard the roll needs', () => {
    // `RollNote.duration` counts whole `@n` steps, so an odd length cannot halve and
    // `canHalvePianoRoll` refuses. A cell's length is fractional by design: 1 → 0.5
    // represents exactly, so ÷2 stays available and only ever SHORTENS in columns.
    const m = scaleStepGrid(grid('bd ~ sd ~'), 'halve')
    expect(m.steps).toBe(2)
    expect(lens(m, 'bd')).toEqual([0.5, null])
    expect(lens(m, 'sd')).toEqual([null, 0.5])
  })

  it('spread scales lengths with the grid; pad keeps them', () => {
    // The two modes hold opposite things fixed, and each is now consistent about
    // lengths as well as positions: spread preserves musical time, pad preserves
    // step indices and lets the groove stretch.
    const m: StepGridModel = { steps: 2, lanes: [{ sound: 'bd', cells: [cellOn(), false] }] }
    expect(lens(resizeGrid(m, 4, 'spread'), 'bd')).toEqual([2, null, null, null])
    expect(lens(resizeGrid(m, 4, 'pad'), 'bd')).toEqual([1, null, null, null])
  })

  it('quantize scales down when coarsening and keeps the count when refining', () => {
    const m = grid('bd hh*2 sd cp')
    // 8 → 4: every length halves with the grid, so a 2-column `bd` stays half a cycle
    expect(lens(quantizeStepGridTo(m, 4), 'bd')[0]).toBe(1)
    // 8 → 16: the note keeps its COLUMN count rather than stretching (#607, the rule
    // the roll already follows), so it occupies less of the cycle than before
    expect(lens(quantizeStepGridTo(m, 16), 'bd')[0]).toBe(2)
  })

  it('quantize merging a column keeps the SHORTER note, and clamps to the next hit', () => {
    // two hits of different lengths landing in one bucket: the merged cell may not
    // sound longer than a note it stands for, and may not reach past the next hit
    const m: StepGridModel = {
      steps: 4,
      lanes: [{ sound: 'bd', cells: [cellOn(3), cellOn(1), false, cellOn(1)] }],
    }
    const q = quantizeStepGridTo(m, 2)
    // col 0's three columns scale to 1.5 and then CLAMP to 1 — the next hit is
    // adjacent. Cols 1 and 3 both land in bucket 1 and merge to the shorter (0.5).
    expect(lens(q, 'bd')).toEqual([1, 0.5])
  })

  it('an off cell is `false`, so every "is anything here?" reader still works', () => {
    const cells: StepCell[] = grid('bd ~ bd ~').lanes[0].cells
    expect(cells.filter(Boolean).length).toBe(2)
    expect(cells.some(Boolean)).toBe(true)
    expect(cells[1]).toBe(false)
  })
})
