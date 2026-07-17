import { describe, it, expect } from 'vitest'
import { parseStepGrid } from '../parse'
import { serializeStepGrid } from '../serialize'
import type { StepGridModel } from '../model'

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
