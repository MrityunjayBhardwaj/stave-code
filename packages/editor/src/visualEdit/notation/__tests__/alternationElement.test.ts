import { describe, it, expect } from 'vitest'
import { parseStepGrid, parsePianoRoll } from '../parse'
import { serializeStepGrid, serializePianoRoll } from '../serialize'
import type { PianoRollModel, StepGridModel } from '../model'

/**
 * #920 — a `<...>` alternation used as a sequence ELEMENT (`bd <sd hh>`), not
 * only as the whole cycle. The model bar-expands (one alternative per bar); the
 * writer keeps each source element's bytes and re-emits only the one edited.
 *
 * Phase 1 = clean-rectangle cases (every bar the same step count). Reconciliation
 * (an alternative with a different expanded length, e.g. `!n`) is declined at
 * parse and stays code-only until phase 1b.
 */

const rt = (s: string): string | null => {
  const r = parseStepGrid(s)
  if (!r.ok) return `REFUSED: ${r.reason}`
  return serializeStepGrid(r.model)
}

describe('#920 grid — <...> as a sequence element', () => {
  describe('parses (was refused)', () => {
    for (const s of ['bd <sd hh>', '<bd sd> hh', 'bd <sd hh> oh', 'bd <sd hh cp>']) {
      it(`opens ${s}`, () => {
        const r = parseStepGrid(s)
        expect(r.ok).toBe(true)
        if (r.ok) expect((r.model.bars ?? 1)).toBeGreaterThan(1)
      })
    }
  })

  describe('unedited round-trip = identity', () => {
    for (const s of [
      'bd <sd hh>',
      '<bd sd> hh',
      'bd <sd hh> oh',
      'bd <sd hh cp>', // 3-cycle
      '<bd sd> <hh oh>',
      '<bd sd*2> hh cp', // a `*n` inside a branch (same step count, finer div)
      '<[bd sd] [bd hh]>', // whole-cycle non-regression
      'bd sd hh cp', // flat non-regression
    ]) {
      it(`${s}`, () => {
        expect(rt(s)).toBe(s)
      })
    }
  })

  describe('edit localizes to one element (span surgery)', () => {
    it('editing the alternation touches only that element', () => {
      const r = parseStepGrid('bd <sd hh>')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const m = r.model
      // turn OFF the hh in bar1 (col 3) → the <sd hh> element loses its bar-1 hit
      const hh = m.lanes.find((l) => l.sound === 'hh')!
      const cells = [...hh.cells]
      cells[cells.length - 1] = false
      const edited: StepGridModel = { ...m, lanes: m.lanes.map((l) => (l.sound === 'hh' ? { ...l, cells } : l)) }
      // bar1's alternation slot is now empty → <sd ~>; the leading `bd` is untouched
      expect(serializeStepGrid(edited)).toBe('bd <sd ~>')
    })

    it('editing a MIDDLE element leaves both neighbours byte-identical', () => {
      // `hh` is the static middle element of three; editing it must not disturb
      // the `<bd sd>` before it or the `<cp oh>` after it (last-element-only gates
      // are blind to exactly this — PV197).
      const r = parseStepGrid('<bd sd> hh <cp oh>')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const m = r.model
      const hh = m.lanes.find((l) => l.sound === 'hh')!
      const cells = [...hh.cells]
      cells[4] = false // bar1's hh column (cols: bar0=0,1,2 · bar1=3,4,5)
      const edited: StepGridModel = { ...m, lanes: m.lanes.map((l) => (l.sound === 'hh' ? { ...l, cells } : l)) }
      expect(serializeStepGrid(edited)).toBe('<bd sd> <hh ~> <cp oh>')
    })

    it('editing a static cell in one bar promotes it to an alternation', () => {
      const r = parseStepGrid('bd <sd hh>')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const m = r.model
      // turn OFF bd in bar1 (col 2) — bd was static across both bars
      const bd = m.lanes.find((l) => l.sound === 'bd')!
      const cells = [...bd.cells]
      cells[2] = false
      const edited: StepGridModel = { ...m, lanes: m.lanes.map((l) => (l.sound === 'bd' ? { ...l, cells } : l)) }
      expect(serializeStepGrid(edited)).toBe('<bd ~> <sd hh>')
    })
  })

  describe('reconciliation declines at parse (phase 1b)', () => {
    // `!n` inside a branch makes the branches expand to different lengths, so the
    // bars don't line up — declined until 1b, stays code-only (never a bogus grid).
    for (const s of ['<bd!3 sd> hh', 'bd <sd hh!2>']) {
      it(`${s} stays refused`, () => {
        expect(parseStepGrid(s).ok).toBe(false)
      })
    }
  })
})

const rtRoll = (s: string): string | null => {
  const r = parsePianoRoll(s)
  if (!r.ok) return `REFUSED: ${r.reason}`
  return serializePianoRoll(r.model)
}

describe('#920 roll — <...> as a sequence element', () => {
  describe('parses (was refused)', () => {
    for (const s of ['0 <2 3> 5', 'c3 <e3 g3>', '<0 2> 4 <5 7>']) {
      it(`opens ${s}`, () => {
        const r = parsePianoRoll(s)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.model.bars ?? 1).toBeGreaterThan(1)
      })
    }
  })

  describe('unedited round-trip = identity', () => {
    for (const s of [
      '0 <2 3> 5',
      'c3 <e3 g3>',
      '<0 2> 4 <5 7>',
      '0 <2 3 4> 5', // 3-cycle
      '0 <2 [3 4]> 5', // a group in a branch (same weight, finer div)
      '0 <2 3>@1 5', // explicit trailing where padding varies
      '<[c3,e3] [d3,f3]> g3', // chords in the branches
      '<0 2 5> <0 3 5>', // whole-cycle non-regression (single alternation each)
      '0 2 5', // flat non-regression
    ]) {
      it(`${s}`, () => {
        expect(rtRoll(s)).toBe(s)
      })
    }
  })

  describe('edit localizes to one element', () => {
    it('editing the alternation slot in one bar touches only that element', () => {
      const r = parsePianoRoll('0 <2 3> 5')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const m = r.model
      // bar1's alternation note is `3` at column 4 (cols: bar0=0,1,2 · bar1=3,4,5)
      const edited: PianoRollModel = {
        ...m,
        notes: m.notes.map((n) => (n.start === 4 ? { ...n, pitch: '4' } : n)),
      }
      expect(serializePianoRoll(edited)).toBe('0 <2 4> 5')
    })

    it('editing a static note in one bar promotes it to an alternation', () => {
      const r = parsePianoRoll('0 <2 3> 5')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const m = r.model
      // the leading `0` is static (col 0 and col 3); change bar1's to `7`
      const edited: PianoRollModel = {
        ...m,
        notes: m.notes.map((n) => (n.start === 3 ? { ...n, pitch: '7' } : n)),
      }
      expect(serializePianoRoll(edited)).toBe('<0 7> <2 3> 5')
    })
  })

  describe('reconciliation declines at parse (phase 1b)', () => {
    for (const s of ['0 <2!3 3> 5', '0 <2@2 3> 5']) {
      it(`${s} stays refused`, () => {
        expect(parsePianoRoll(s).ok).toBe(false)
      })
    }
  })
})
