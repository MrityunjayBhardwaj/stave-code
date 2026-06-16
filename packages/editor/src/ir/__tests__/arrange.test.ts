/**
 * Phase 5a (#386) — unified time-sequence IR (`arrange`/`cat`/`slowcat`/
 * `fastcat`) + arm-tagged collect. Three layers:
 *   1. STRUCTURE — parseStrudel builds the `Arrange` node (arms, weights, loc).
 *   2. EVENTS    — collect slices arms across cycles + tags `armIndex`.
 *   3. PARITY    — collected events match real Strudel haps (the ground truth).
 *
 * GROUNDED 2026-06-17 (real `@strudel/core@1.2.6` haps):
 *   arrange([2,a],[1,b]) → a:[0,2) b:[2,3), period 3, arm cycle advances.
 *   cat/slowcat(a,b)     → a@cycle0 b@cycle1, period 2 (= arrange weights 1).
 *   fastcat(a,b)         → a@[0,.5) b@[.5,1), period 1 (≡ Seq).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { evalScope, evaluate } from '@strudel/core/evaluate.mjs'
import * as strudelCore from '@strudel/core'
import { mini, miniAllStrings } from '@strudel/mini/mini.mjs'

import { parseStrudel as _parseStrudel, toStrudel, patternToJSON, patternFromJSON } from '../../ir'
import type { PatternIR, IREvent } from '../../ir'
import { collectCycles } from './helpers/collectCycles'
import { unwrapD1 } from './helpers/unwrapD1'
import { normalizeStrudelHap } from '../../engine/NormalizedHap'

const parse = (code: string): PatternIR => unwrapD1(_parseStrudel(code))

beforeAll(async () => {
  await evalScope(Promise.resolve(strudelCore), Promise.resolve({ mini }))
  miniAllStrings()
})

// --- Strudel reference (ground truth) ------------------------------------
type SP = { queryArc: (b: number, e: number) => unknown[] }
async function strudelOnsets(code: string, cycles: number): Promise<Array<{ note: unknown; begin: number; end: number }>> {
  const { pattern } = (await evaluate(code)) as { pattern: SP }
  const num = (x: unknown) => Number((x as { valueOf(): number }).valueOf())
  const out: Array<{ note: unknown; begin: number; end: number }> = []
  for (let c = 0; c < cycles; c++) {
    for (const h of pattern.queryArc(c, c + 1) as Array<{ whole?: { begin: unknown; end: unknown }; part: { begin: unknown }; value: { note?: unknown } }>) {
      if (h.whole && num(h.whole.begin) === num(h.part.begin)) {
        out.push({ note: h.value.note, begin: num(h.whole.begin), end: num(h.whole.end) })
      }
    }
  }
  return out.sort((a, b) => a.begin - b.begin)
}

const onsets = (evs: IREvent[]) =>
  evs
    .map(e => ({ note: e.note, begin: +e.begin.toFixed(4), end: +e.end.toFixed(4), arm: e.armIndex }))
    .sort((a, b) => a.begin - b.begin)

// --------------------------------------------------------------------------
describe('Phase 5a — Arrange IR structure', () => {
  it('arrange([2,a],[1,b]) → Arrange node, 2 arms with weights + per-arm loc', () => {
    const ir = parse('arrange([2, note("c3")], [1, note("e3")])')
    expect(ir.tag).toBe('Arrange')
    if (ir.tag !== 'Arrange') return
    expect(ir.mode).toBe('arrange')
    expect(ir.arms.map(a => a.weight)).toEqual([2, 1])
    // per-arm loc is mandatory (P5b/c write-back needs it)
    expect(ir.arms[0].loc?.[0]).toBeDefined()
    expect(ir.arms[1].loc?.[0]).toBeDefined()
    // arm loc spans the [n, pat] tuple → starts at '[' (weight-editable range)
    const src = 'arrange([2, note("c3")], [1, note("e3")])'
    expect(src.slice(ir.arms[0].loc![0].start, ir.arms[0].loc![0].end)).toBe('[2, note("c3")]')
  })

  it('cat / slowcat → Arrange, all weights 1, mode preserved', () => {
    for (const fn of ['cat', 'slowcat'] as const) {
      const ir = parse(`${fn}(note("c3"), note("e3"))`)
      expect(ir.tag).toBe('Arrange')
      if (ir.tag !== 'Arrange') continue
      expect(ir.mode).toBe(fn)
      expect(ir.arms.map(a => a.weight)).toEqual([1, 1])
    }
  })

  it('fastcat → Seq (one-cycle, ≡ existing node), NOT Arrange', () => {
    const ir = parse('fastcat(note("c3"), note("e3"))')
    expect(ir.tag).toBe('Seq')
  })

  it('method forms: a.cat(b) → Arrange[a,b]; a.fastcat(b) → Seq', () => {
    const c = parse('note("c3").cat(note("e3"))')
    expect(c.tag).toBe('Arrange')
    if (c.tag === 'Arrange') expect(c.arms.length).toBe(2)
    const f = parse('note("c3").fastcat(note("e3"))')
    expect(f.tag).toBe('Seq')
  })
})

describe('Phase 5a — collect timing + armIndex', () => {
  it('arrange slices arms by weight across cycles, tags armIndex', () => {
    const ir = parse('arrange([2, note("c3")], [1, note("e3")])')
    const evs = onsets(collectCycles(ir, 0, 4))
    expect(evs).toEqual([
      { note: 'c3', begin: 0, end: 1, arm: 0 },
      { note: 'c3', begin: 1, end: 2, arm: 0 },
      { note: 'e3', begin: 2, end: 3, arm: 1 },
      { note: 'c3', begin: 3, end: 4, arm: 0 }, // loops (period 3)
    ])
  })

  it("an arm's internal cycle advances across its span (alternating arm)", () => {
    const ir = parse('arrange([2, note("<c3 e3>")], [1, note("g3")])')
    const evs = onsets(collectCycles(ir, 0, 4))
    expect(evs.map(e => e.note)).toEqual(['c3', 'e3', 'g3', 'c3'])
    expect(evs.map(e => e.arm)).toEqual([0, 0, 1, 0])
  })

  it('cat tags armIndex 0/1 per cycle', () => {
    const ir = parse('cat(note("c3"), note("e3"))')
    const evs = onsets(collectCycles(ir, 0, 2))
    expect(evs).toEqual([
      { note: 'c3', begin: 0, end: 1, arm: 0 },
      { note: 'e3', begin: 1, end: 2, arm: 1 },
    ])
  })
})

describe('Phase 5a — parity with real Strudel haps', () => {
  const cases: Array<[string, number]> = [
    ['arrange([2, note("c3")], [1, note("e3")])', 6],
    ['arrange([2, note("c3 d3")], [1, note("e3 f3 g3")])', 6],
    ['cat(note("c3"), note("e3"))', 4],
    ['slowcat(note("c3"), note("e3"))', 4],
    ['fastcat(note("c3"), note("e3"))', 2],
  ]
  for (const [code, cycles] of cases) {
    it(`matches Strudel: ${code}`, async () => {
      const expected = await strudelOnsets(code, cycles)
      const got = collectCycles(parse(code), 0, cycles)
        .map(e => ({ note: e.note, begin: +e.begin.toFixed(4), end: +e.end.toFixed(4) }))
        .sort((a, b) => a.begin - b.begin)
      expect(got).toEqual(expected.map(e => ({ note: e.note, begin: +e.begin.toFixed(4), end: +e.end.toFixed(4) })))
    })
  }
})

describe('Phase 5a — round-trip', () => {
  it('toStrudel re-emits the literal combinator', () => {
    expect(toStrudel(parse('arrange([2, note("c3")], [1, note("e3")])'))).toContain('arrange([2,')
    expect(toStrudel(parse('cat(note("c3"), note("e3"))'))).toMatch(/^cat\(/)
  })

  it('JSON serialize round-trips arms + weights + mode', () => {
    const ir = parse('arrange([2, note("c3")], [1, note("e3")])')
    const back = patternFromJSON(patternToJSON(ir))
    const u = unwrapD1(back)
    expect(u.tag).toBe('Arrange')
    if (u.tag === 'Arrange') expect(u.arms.map(a => a.weight)).toEqual([2, 1])
  })
})
