import { describe, it, expect } from 'vitest'

import { parseStepGrid, parsePianoRoll, applyStepGain, applyRollGain } from '../parse'
import { serializeStepGrid, serializePianoRoll, serializeStepGain } from '../serialize'
import {
  scaleStepGrid,
  scalePianoRoll,
  canDoubleStepGrid,
  canHalveStepGrid,
  canDoublePianoRoll,
  canHalvePianoRoll,
  MAX_RESOLUTION_STEPS,
} from '../resolution'
import type { StepGridModel, PianoRollModel } from '../model'

/** parse → assert ok → return model */
function step(s: string): StepGridModel {
  const r = parseStepGrid(s)
  expect(r.ok, `expected ${s} to parse`).toBe(true)
  if (!r.ok) throw new Error('unreachable')
  return r.model
}
function roll(s: string): PianoRollModel {
  const r = parsePianoRoll(s)
  expect(r.ok, `expected ${s} to parse`).toBe(true)
  if (!r.ok) throw new Error('unreachable')
  return r.model
}

describe('#479 resolution — step grid ×2 / ÷2', () => {
  it('×2 splits each column, inserting empty odd columns (timing preserved)', () => {
    const m = scaleStepGrid(step('bd ~ sn ~ bd'), 'double')
    expect(m.steps).toBe(10)
    expect(serializeStepGrid(m)).toBe('bd ~ ~ ~ sn ~ ~ ~ bd ~')
  })

  it('÷2 merges pairs back to the source (lossless inverse)', () => {
    const doubled = step('bd ~ ~ ~ sn ~ ~ ~ bd ~')
    const halved = scaleStepGrid(doubled, 'halve')
    expect(halved.steps).toBe(5)
    expect(serializeStepGrid(halved)).toBe('bd ~ sn ~ bd')
  })

  it('×2 then ÷2 returns the byte-identical source (acceptance)', () => {
    const src = 'bd ~ sn ~ bd'
    const round = serializeStepGrid(scaleStepGrid(scaleStepGrid(step(src), 'double'), 'halve'))
    expect(round).toBe(src)
  })

  it('×2 round-trips through parse (stable expanded form)', () => {
    const m = scaleStepGrid(step('bd hh sn'), 'double')
    const reparsed = step(serializeStepGrid(m))
    expect(serializeStepGrid(reparsed)).toBe(serializeStepGrid(m))
  })

  it('preserves multiple lanes when scaling', () => {
    const m = scaleStepGrid(step('bd hh bd hh'), 'double')
    expect(serializeStepGrid(m)).toBe('bd ~ hh ~ bd ~ hh ~')
  })
})

describe('#479 resolution — step grid ÷2 guards (honest, lossless-only)', () => {
  it('disables ÷2 when an odd column carries a hit (would drop it)', () => {
    expect(canHalveStepGrid(step('bd sn'))).toBe(false) // sn on col 1
    expect(canHalveStepGrid(step('bd hh sn hh'))).toBe(false)
  })

  it('enables ÷2 only when every odd column is empty', () => {
    expect(canHalveStepGrid(step('bd ~ sn ~'))).toBe(true)
    expect(serializeStepGrid(scaleStepGrid(step('bd ~ sn ~'), 'halve'))).toBe('bd sn')
  })

  it('disables ÷2 on an odd column count', () => {
    expect(canHalveStepGrid(step('bd ~ sn'))).toBe(false) // 3 columns
  })

  it('a non-applicable direction returns the SAME model (mutate skips the write)', () => {
    const m = step('bd sn')
    expect(scaleStepGrid(m, 'halve')).toBe(m)
  })

  it('caps ×2 at the column ceiling', () => {
    const wide: StepGridModel = {
      steps: MAX_RESOLUTION_STEPS,
      lanes: [{ sound: 'bd', cells: Array<boolean>(MAX_RESOLUTION_STEPS).fill(false) }],
    }
    expect(canDoubleStepGrid(wide)).toBe(false)
    expect(scaleStepGrid(wide, 'double')).toBe(wide)
    expect(canDoubleStepGrid(step('bd ~ sn ~'))).toBe(true)
  })
})

describe('#479 resolution — step grid velocity scales with the grid', () => {
  it('×2 keeps each hit gain and inserts neutral odd columns', () => {
    // bd on cols 0 and 2, soft (0.5) and loud — a per-column .gain string.
    const base = applyStepGain(step('bd ~ bd ~'), { mini: '0.5 ~ 1 ~', numeric: null, foreign: false })
    const doubled = scaleStepGrid(base, 'double')
    expect(doubled.steps).toBe(8)
    expect(serializeStepGrid(doubled)).toBe('bd ~ ~ ~ bd ~ ~ ~')
    // each hit keeps its gain (soft 0.5, neutral 1); the mini realigns to the
    // doubled columns, the inserted odd columns are rests.
    const g = serializeStepGain(doubled)
    expect(g.kind).toBe('write')
    if (g.kind === 'write') expect(g.value).toBe('0.5 ~ ~ ~ 1 ~ ~ ~')
  })

  it('÷2 round-trips a velocity grid back to source', () => {
    const base = applyStepGain(step('bd ~ bd ~'), { mini: '0.5 ~ 1 ~', numeric: null, foreign: false })
    const round = scaleStepGrid(scaleStepGrid(base, 'double'), 'halve')
    expect(serializeStepGrid(round)).toBe('bd ~ bd ~')
    expect(canHalveStepGrid(scaleStepGrid(base, 'double'))).toBe(true)
  })
})

describe('#479 resolution — piano roll ×2 / ÷2', () => {
  it('×2 scales start AND duration so onsets are preserved', () => {
    const m = scalePianoRoll(roll('c3 e3 g3'), 'double')
    expect(m.steps).toBe(6)
    expect(serializePianoRoll(m)).toBe('c3@2 e3@2 g3@2')
  })

  it('×2 doubles a held note span (@n → @2n)', () => {
    const m = scalePianoRoll(roll('c3@2 e3'), 'double')
    expect(serializePianoRoll(m)).toBe('c3@4 e3@2')
  })

  it('×2 then ÷2 returns the byte-identical source (acceptance)', () => {
    for (const src of ['c3 e3 g3', 'c3@2 e3', '~ c3 ~ e3']) {
      const round = serializePianoRoll(
        scalePianoRoll(scalePianoRoll(roll(src), 'double'), 'halve'),
      )
      expect(round, src).toBe(src)
    }
  })

  it('keeps a rest-led pattern aligned', () => {
    const m = scalePianoRoll(roll('~ c3'), 'double')
    expect(serializePianoRoll(m)).toBe('~ ~ c3@2')
  })
})

describe('#479 resolution — piano roll ÷2 guards', () => {
  it('disables ÷2 when a note starts on an odd column', () => {
    expect(canHalvePianoRoll(roll('~ c3'))).toBe(false) // starts at col 1
  })

  it('disables ÷2 when a note spans an odd number of columns', () => {
    // c3 dur 1, e3 dur 1 over 2 steps → durations odd → not halvable
    expect(canHalvePianoRoll(roll('c3 e3'))).toBe(false)
  })

  it('enables ÷2 when every note is even-aligned and even-length', () => {
    expect(canHalvePianoRoll(roll('c3@2 e3@2'))).toBe(true)
    expect(serializePianoRoll(scalePianoRoll(roll('c3@2 e3@2'), 'halve'))).toBe('c3 e3')
  })

  it('a non-applicable direction returns the SAME model', () => {
    const m = roll('c3 e3')
    expect(scalePianoRoll(m, 'halve')).toBe(m)
  })

  it('caps ×2 at the column ceiling', () => {
    const wide: PianoRollModel = { steps: MAX_RESOLUTION_STEPS, notes: [] }
    expect(canDoublePianoRoll(wide)).toBe(false)
    expect(scalePianoRoll(wide, 'double')).toBe(wide)
  })

  it('×2 carries per-note velocity unchanged', () => {
    const base = applyRollGain(roll('c3 e3'), { mini: '0.5 1', numeric: null, foreign: false })
    const doubled = scalePianoRoll(base, 'double')
    expect(doubled.notes.map((n) => n.gain ?? 1)).toEqual([0.5, 1])
    expect(serializePianoRoll(doubled)).toBe('c3@2 e3@2')
  })
})
