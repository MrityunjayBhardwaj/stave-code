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
  scaleStepGridTo,
  scalePianoRollTo,
  canScaleStepGridTo,
  canScalePianoRollTo,
  quantizeStepGridTo,
  quantizePianoRollTo,
  stepSlotState,
  rollSlotState,
  RESOLUTION_PRESETS,
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

describe('#479 resolution — absolute slot targets (the 4/8/16/32 control)', () => {
  it('the preset list is 4 / 8 / 16 / 32 / 64', () => {
    expect([...RESOLUTION_PRESETS]).toEqual([4, 8, 16, 32, 64])
  })

  it('step grid: scaling to a higher power-of-2 target doubles repeatedly', () => {
    const m4 = step('bd ~ sn ~') // 4 columns
    expect(serializeStepGrid(scaleStepGridTo(m4, 8))).toBe('bd ~ ~ ~ sn ~ ~ ~')
    expect(scaleStepGridTo(m4, 16).steps).toBe(16) // ×4
  })

  it('step grid: scaling DOWN to a target halves when lossless', () => {
    const m8 = step('bd ~ ~ ~ sn ~ ~ ~') // 8 columns, hits on 0 and 4
    expect(serializeStepGrid(scaleStepGridTo(m8, 4))).toBe('bd ~ sn ~')
    expect(serializeStepGrid(scaleStepGridTo(m8, 2))).toBe('bd sn') // 8→4→2
  })

  it('step grid: a non-power-of-2 ratio is unreachable (no re-timing)', () => {
    const m5 = step('bd ~ sn ~ bd') // 5 columns
    // 5 → 4 / 8 / 16 / 32 are none a power-of-2 ratio → every preset disabled
    for (const target of RESOLUTION_PRESETS) {
      expect(canScaleStepGridTo(m5, target), `5→${target}`).toBe(false)
      expect(scaleStepGridTo(m5, target)).toBe(m5)
    }
  })

  it('step grid: the current count is never offered (active, not clickable)', () => {
    const m8 = step('bd ~ ~ ~ sn ~ ~ ~')
    expect(canScaleStepGridTo(m8, 8)).toBe(false)
    expect(canScaleStepGridTo(m8, 16)).toBe(true)
    expect(canScaleStepGridTo(m8, 4)).toBe(true)
  })

  it('step grid: a target below a LOSSY column is disabled', () => {
    const dense = step('bd sd hh cp bd sd hh cp') // 8 cols, every column filled
    expect(canScaleStepGridTo(dense, 4)).toBe(false) // halving would drop hits
    expect(canScaleStepGridTo(dense, 16)).toBe(true) // doubling up is fine
    expect(scaleStepGridTo(dense, 4)).toBe(dense) // aborts to original
  })

  it('piano roll: scale up then back to source is byte-identical', () => {
    const m4 = roll('c3 e3 g3 a3') // 4 columns
    expect(serializePianoRoll(scalePianoRollTo(m4, 8))).toBe('c3@2 e3@2 g3@2 a3@2')
    const round = serializePianoRoll(scalePianoRollTo(scalePianoRollTo(m4, 8), 4))
    expect(round).toBe('c3 e3 g3 a3')
  })

  it('piano roll: a 3-note melody (non-power-of-2) disables every preset', () => {
    const m3 = roll('c3 e3 g3') // 3 columns
    for (const target of RESOLUTION_PRESETS) {
      expect(canScalePianoRollTo(m3, target), `3→${target}`).toBe(false)
    }
  })

  it('caps an upward target at the column ceiling', () => {
    const wide: StepGridModel = {
      steps: MAX_RESOLUTION_STEPS / 2,
      lanes: [{ sound: 'bd', cells: Array<boolean>(MAX_RESOLUTION_STEPS / 2).fill(false) }],
    }
    // 128 → 256 is fine (== cap), but the doubling that would exceed it aborts.
    expect(scaleStepGridTo(wide, MAX_RESOLUTION_STEPS).steps).toBe(MAX_RESOLUTION_STEPS)
    expect(scaleStepGridTo(wide, MAX_RESOLUTION_STEPS * 2)).toBe(wide)
  })
})

describe('#479 quantize-set — reduce any pattern to any slot count', () => {
  it('step grid: a lossless ratio gives the SAME result as ×2/÷2', () => {
    const m4 = step('bd ~ sn ~')
    expect(serializeStepGrid(quantizeStepGridTo(m4, 8))).toBe('bd ~ ~ ~ sn ~ ~ ~') // == scaleTo
    expect(serializeStepGrid(quantizeStepGridTo(step('bd ~ ~ ~ sn ~ ~ ~'), 4))).toBe('bd ~ sn ~')
  })

  it('step grid: a NON-power-of-2 reduce quantizes hits to the nearest slot', () => {
    // 5 columns → 4: bd@0→0, sn@2→round(2*4/5)=2, bd@4→round(4*4/5)=3
    expect(serializeStepGrid(quantizeStepGridTo(step('bd ~ sn ~ bd'), 4))).toBe('bd ~ sn bd')
  })

  it('step grid: a lossy reduce merges colliding hits instead of dropping them', () => {
    // every column filled, 8 → 4: pairs (0,1)(2,3)(4,5)(6,7) each collapse to one hit
    const dense = step('bd sd hh cp bd sd hh cp')
    const out = quantizeStepGridTo(dense, 4)
    expect(out.steps).toBe(4)
    // each lane still present, no crash, serializes to a valid 4-col grid
    expect(serializeStepGrid(out).split(' ').length).toBe(4)
  })

  it('piano roll: a non-power-of-2 reduce snaps notes and always serializes', () => {
    // 3 → 4 (finer, non-divisor): each note snaps onto the 4-grid
    expect(serializePianoRoll(quantizePianoRollTo(roll('c3 e3 g3'), 4))).not.toBeNull()
  })

  it('piano roll: REDUCES the long 64-step choir melody to 16 without dropping the write', () => {
    const choir =
      '~ ~ ~ ~ ~ ~ ~ ~ [e4,d5]@4 d5 ~ ~ ~ [g4,a#4]@2 d5 ~ ~ [f5,c#4] ~ ~ b4@4 g4 ~ ~ ~ [c5,d4]@4 e5 ~ f#5 ~ [b4,d4]@2 f5 ~ ~ c5 ~ ~ [g4,a4]@3 d5 ~ ~ ~ d5 e4@8'
    const m = roll(choir)
    expect(m.steps).toBe(64)
    const out = quantizePianoRollTo(m, 16)
    expect(out.steps).toBe(16)
    const s = serializePianoRoll(out)
    expect(s, 'reduced melody must serialize (no silent drop)').not.toBeNull()
    // every note lands on the 16-grid, in range, no overlap (buildGroups would null otherwise)
    expect(out.notes.every((n) => n.start >= 0 && n.start + n.duration <= 16)).toBe(true)
  })

  it('piano roll: ADDING slots keeps each note a single slot — no stretch (#607)', () => {
    // the old resolution-doubling stretched durations (`c3@2 e3@2 g3@2 a3@2`);
    // now a 1-slot note stays 1 slot, repositioned proportionally — onsets are
    // preserved and the freed grid shows as gaps.
    expect(serializePianoRoll(quantizePianoRollTo(roll('c3 e3 g3 a3'), 8))).toBe(
      'c3 ~ e3 ~ g3 ~ a3 ~',
    )
  })

  it('piano roll: ADDING slots keeps a held note its slot-count, not its proportion (#607)', () => {
    // c3 holds 2 of 3 slots, e3 the last. 3 → 6: c3 stays @2 (does NOT scale to
    // @4), e3 stays 1 slot; both onsets map proportionally (0 and 2/3 → 0 and 4/6).
    const out = quantizePianoRollTo(roll('c3@2 e3'), 6)
    const c3 = out.notes.find((n) => n.pitch === 'c3')!
    const e3 = out.notes.find((n) => n.pitch === 'e3')!
    expect([c3.start, c3.duration]).toEqual([0, 2]) // kept slot-count, onset preserved
    expect([e3.start, e3.duration]).toEqual([4, 1]) // proportional reposition, 1 slot
  })

  it('piano roll: REDUCING slots still scales duration down (stays in range, #607)', () => {
    // the conservative rule is increase-only; a coarsen still shrinks durations
    // so a held note can't run past the smaller grid.
    const out = quantizePianoRollTo(roll('c3@4 e3@4'), 4) // 8 → 4
    expect(out.notes.every((n) => n.start + n.duration <= 4)).toBe(true)
  })

  it('piano roll: ADDING slots on a MULTI-BAR grid is conservative too (#607)', () => {
    const m = roll('<c3 e3>') // multi-bar alternation
    expect((m.bars ?? 1) > 1).toBe(true) // guard: this exercises the multi-bar branch
    const out = quantizePianoRollTo(m, m.steps * 2) // pow-of-2 increase
    expect(out.steps).toBe(m.steps * 2)
    expect(out.bars).toBe(m.bars) // bars preserved
    // every note keeps its slot-count duration (no stretch), starts double, all
    // stay in range, and it still serializes (no off-bar / overlap drop).
    out.notes.forEach((n, i) => {
      expect(n.duration).toBe(m.notes[i].duration)
      expect(n.start).toBe(m.notes[i].start * 2)
    })
    expect(out.notes.every((n) => n.start + n.duration <= out.steps)).toBe(true)
    expect(serializePianoRoll(out)).not.toBeNull()
  })

  it('quantize is a no-op for the current count', () => {
    const m = step('bd ~ sn ~')
    expect(quantizeStepGridTo(m, 4)).toBe(m)
  })

  it('slot state classifies active / lossless / quantize', () => {
    const m5 = step('bd ~ sn ~ bd') // 5 cols (non-power-of-2)
    expect(stepSlotState(m5, 5)).toBe('active')
    expect(stepSlotState(m5, 4)).toBe('quantize') // not a power-of-2 ratio → quantize, still offered
    const m4 = step('bd ~ sn ~')
    expect(stepSlotState(m4, 4)).toBe('active')
    expect(stepSlotState(m4, 8)).toBe('lossless') // power-of-2 ratio
    expect(rollSlotState(roll('c3 e3 g3'), 8)).toBe('quantize') // 3→8 not power-of-2
  })

  it('multi-bar grids stay lossless-only (quantize would not bar-align)', () => {
    const mb = step('<bd sn>') // bars 2
    // a lossy target is disabled rather than quantized for multi-bar
    expect(stepSlotState(mb, 4)).not.toBe('quantize')
  })
})
