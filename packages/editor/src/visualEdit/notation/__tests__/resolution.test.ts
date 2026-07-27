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
import type { StepGridModel, PianoRollModel, StepCell } from '../model'

/** serialize → assert the writer did not decline → return the string */
function ser(m: StepGridModel): string {
  const s = serializeStepGrid(m)
  expect(s, 'expected the grid writer not to decline').not.toBeNull()
  return s as string
}

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
    // `bd _`, not `bd ~` (#1010 P4c). ×2 promises "every hit keeps its position", and
    // [[PV240]] reads the length rule off that promise: the length SCALES with the grid, so
    // a note that was one of 5 columns is two of 10 — the same 1/5 of a cycle. The trailing
    // `_` is the printer spelling that sustain. The old `bd ~` re-derived the length from
    // the column and quietly halved every note the op claimed to leave alone.
    expect(serializeStepGrid(m)).toBe('bd _ ~ ~ sn _ ~ ~ bd _')
  })

  it('÷2 is NOT offered on a source-authored grid — it would lengthen every note', () => {
    // This used to halve `bd ~ ~ ~ sn ~ ~ ~ bd ~` to `bd ~ sn ~ bd` and call it the lossless
    // inverse. It is not the inverse of anything: the source wrote ten columns, so each note
    // sounds 1/10 of a cycle, and a 5-column grid can only spell 1/5. The old answer doubled
    // every note's length — invisibly, since the panel draws no duration axis (#1026).
    //
    // So the op is not offered here. The INVERSE claim is real and lives where it is true:
    // the acceptance test below round-trips ×2 then ÷2, because ×2 makes the notes two
    // columns long and ÷2 takes them back to one. `op-admissibility.test.ts` asserts that
    // over the whole corpus — every one of the 884 units ×2 applies to can be undone.
    const doubled = step('bd ~ ~ ~ sn ~ ~ ~ bd ~')
    expect(canHalveStepGrid(doubled)).toBe(false)
    expect(scaleStepGrid(doubled, 'halve')).toBe(doubled) // same reference → mutate skips
  })

  it('×2 then ÷2 returns the byte-identical source (acceptance)', () => {
    const src = 'bd ~ sn ~ bd'
    const round = serializeStepGrid(scaleStepGrid(scaleStepGrid(step(src), 'double'), 'halve'))
    expect(round).toBe(src)
  })

  it('×2 round-trips through parse (stable expanded form)', () => {
    const m = scaleStepGrid(step('bd hh sn'), 'double')
    const reparsed = step(ser(m))
    expect(serializeStepGrid(reparsed)).toBe(serializeStepGrid(m))
  })

  it('preserves multiple lanes when scaling', () => {
    const m = scaleStepGrid(step('bd hh bd hh'), 'double')
    expect(serializeStepGrid(m)).toBe('bd _ hh _ bd _ hh _') // lengths scale with the grid
  })
})

describe('#479 resolution — step grid ÷2 guards (honest, lossless-only)', () => {
  it('disables ÷2 when an odd column carries a hit (would drop it)', () => {
    expect(canHalveStepGrid(step('bd sn'))).toBe(false) // sn on col 1
    expect(canHalveStepGrid(step('bd hh sn hh'))).toBe(false)
  })

  it('an empty odd column is NECESSARY but no longer SUFFICIENT for ÷2', () => {
    // Structure alone used to decide, and `bd ~ sn ~` halved to `bd sn`. Both notes then
    // sounded twice as long, which is the one thing an op may not do to an axis the panel
    // cannot show (#1026). Admissibility is now asked of the real writer, so the structural
    // check is only half of it — see `ifGridSpellable`.
    expect(canHalveStepGrid(step('bd ~ sn ~'))).toBe(false)
    // …and it is TRUE exactly where halving does not lengthen anything: after a ×2, every
    // note is two columns long, so ÷2 returns it to one.
    expect(canHalveStepGrid(scaleStepGrid(step('bd ~ sn ~'), 'double'))).toBe(true)
    expect(
      serializeStepGrid(scaleStepGrid(scaleStepGrid(step('bd ~ sn ~'), 'double'), 'halve')),
    ).toBe('bd ~ sn ~')
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
      lanes: [{ sound: 'bd', cells: Array<StepCell>(MAX_RESOLUTION_STEPS).fill(false) }],
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
    expect(serializeStepGrid(doubled)).toBe('bd _ ~ ~ bd _ ~ ~') // lengths scale (#1010 P4c)
    // each hit keeps its gain (soft 0.5, neutral 1); the mini realigns to the
    // doubled columns, the inserted odd columns are rests.
    //
    // The SUSTAIN column carries a neutral `1` rather than `~`, because `serializeStepGain`
    // emits per COLUMN and a `_` is neither a hit nor a rest to it. Harmless — `.gain`
    // combines with `appLeft`, so it is sampled at the note's ONSET and the value under a
    // sustain is never read — and the round-trip below recovers `0.5 ~ 1 ~` exactly. Filed
    // as its own cleanup rather than fixed here: it is the gain writer's alignment rule, not
    // the resolution op's, and touching it would put this phase inside another gate.
    const g = serializeStepGain(doubled)
    expect(g.kind).toBe('write')
    if (g.kind === 'write') expect(g.value).toBe('0.5 1 ~ ~ 1 1 ~ ~')
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
    expect(serializeStepGrid(scaleStepGridTo(m4, 8))).toBe('bd _ ~ ~ sn _ ~ ~') // lengths scale
    expect(scaleStepGridTo(m4, 16).steps).toBe(16) // ×4
  })

  it('step grid: scaling DOWN a source-authored grid is not offered', () => {
    // Same reason ÷2 is not: 8→4 would double every note's length and 8→2 quadruple it,
    // on an axis the panel cannot show (#1026). Coarsening a grid the user WROTE is
    // therefore refused; coarsening one this control previously widened is not — the
    // round-trip case is asserted in the ×2/÷2 block above and corpus-wide in
    // `op-admissibility.test.ts`.
    const m8 = step('bd ~ ~ ~ sn ~ ~ ~') // 8 columns, hits on 0 and 4
    expect(canScaleStepGridTo(m8, 4)).toBe(false)
    expect(scaleStepGridTo(m8, 4)).toBe(m8)
    expect(scaleStepGridTo(m8, 2)).toBe(m8)
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
    // 4 was `true` until #1010 P4c. Coarsening a SOURCE-authored grid would double every
    // note's length, so it is not offered — the case this test is about (the current count
    // being excluded) is the `8` above, and the widening `16` is its live counterpart.
    expect(canScaleStepGridTo(m8, 4)).toBe(false)
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
      lanes: [{ sound: 'bd', cells: Array<StepCell>(MAX_RESOLUTION_STEPS / 2).fill(false) }],
    }
    // 128 → 256 is fine (== cap), but the doubling that would exceed it aborts.
    expect(scaleStepGridTo(wide, MAX_RESOLUTION_STEPS).steps).toBe(MAX_RESOLUTION_STEPS)
    expect(scaleStepGridTo(wide, MAX_RESOLUTION_STEPS * 2)).toBe(wide)
  })
})

describe('#479 quantize-set — reduce any pattern to any slot count', () => {
  it('step grid: at a lossless ratio, quantize and ×2 now DIFFER on length', () => {
    // This test used to assert the two agree. They no longer do, and both are right:
    // [[PV240]] reads each op's length rule off the promise that op already made, and the
    // two promises differ. ×2 preserves musical time, so the length SCALES
    // (`bd _ ~ ~ sn _ ~ ~`). Quantize REFINING keeps the slot count (#607: "do not stretch
    // into the widened gap"), so the length is KEPT (`bd ~ ~ ~ sn ~ ~ ~`). Same onsets,
    // different note lengths, from two controls a user might reasonably expect to agree —
    // recorded here rather than smoothed over, and filed for a product call.
    const m4 = step('bd ~ sn ~')
    expect(serializeStepGrid(quantizeStepGridTo(m4, 8))).toBe('bd ~ ~ ~ sn ~ ~ ~') // KEEP
    expect(serializeStepGrid(scaleStepGridTo(m4, 8))).toBe('bd _ ~ ~ sn _ ~ ~') // SCALE
    // and COARSENING is not offered at all, for the reason the ÷2 block gives
    const m8 = step('bd ~ ~ ~ sn ~ ~ ~')
    expect(quantizeStepGridTo(m8, 4)).toBe(m8)
  })

  it('step grid: a NON-power-of-2 REDUCE is not offered (it would lengthen every note)', () => {
    // 5 → 4 snapped bd@0→0, sn@2→2, bd@4→3 and emitted `bd ~ sn bd`. The onsets were right
    // and every length was wrong by 5/4, so the op is refused now. REFINING still applies —
    // it keeps the slot count (#607) and so keeps every length spellable.
    const m5 = step('bd ~ sn ~ bd')
    expect(quantizeStepGridTo(m5, 4)).toBe(m5)
    expect(quantizeStepGridTo(m5, 16)).not.toBe(m5)
    expect(serializeStepGrid(quantizeStepGridTo(m5, 16))).not.toBeNull()
  })

  it('step grid: a lossy reduce is refused rather than merged into wrong lengths', () => {
    // The merge rule itself is unchanged and still right (collide → keep the SHORTEST, so a
    // merged note never sounds longer than one it stands for). What changed is that the
    // merged lengths are then scaled by 4/8 and land at half a column, which the grid cannot
    // spell — so the op declines instead of emitting a plausible 4-column grid whose every
    // note is the wrong length.
    const dense = step('bd sd hh cp bd sd hh cp')
    expect(quantizeStepGridTo(dense, 4)).toBe(dense)
    // REFINING the same grid is still offered and still writes
    expect(ser(quantizeStepGridTo(dense, 16)).split(' ').length).toBe(16)
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

  it('slot state classifies active / lossless / quantize / disabled', () => {
    const m5 = step('bd ~ sn ~ bd') // 5 cols (non-power-of-2)
    expect(stepSlotState(m5, 5)).toBe('active')
    // REFINING at a non-power-of-2 ratio is a quantize and is still offered: it keeps each
    // note's column count (#607), so nothing becomes unspellable.
    expect(stepSlotState(m5, 8)).toBe('quantize')
    // COARSENING is now `disabled` rather than `quantize` (#1010 P4c). 5→4 scales every
    // length by 4/5 and the grid can only spell whole columns, so `quantizeStepGridTo`
    // declines — and a control whose op declines must not be offered, or it is a button the
    // user can press to no effect. `stepSlotState` asks the op rather than predicting it.
    expect(stepSlotState(m5, 4)).toBe('disabled')
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
