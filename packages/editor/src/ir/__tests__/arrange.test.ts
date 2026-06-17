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

  it('a NESTED combinator arm tags the OUTER armIndex, not the inner (#451)', () => {
    // arrange arm 0 (weight 2) is itself a `cat` → c3 then e3 over cycles 0,1;
    // arm 1 (weight 1) is g3 at cycle 2. The inner cat must NOT overwrite the
    // outer arm index: both c3 and e3 belong to OUTER arm 0 (one clip), g3 to
    // outer arm 1 — so the timeline sees the cat block as a single outer clip.
    const ir = parse('arrange([2, cat(note("c3"), note("e3"))], [1, note("g3")])')
    const evs = onsets(collectCycles(ir, 0, 3))
    expect(evs).toEqual([
      { note: 'c3', begin: 0, end: 1, arm: 0 },
      { note: 'e3', begin: 1, end: 2, arm: 0 }, // inner cat arm 1, but OUTER arm 0
      { note: 'g3', begin: 2, end: 3, arm: 1 },
    ])
  })

  it('the OUTER index does NOT leak to a sibling track without an arrange (#451)', () => {
    // childCtx.armIndex is scoped to the arrange's own subtree — a sibling track
    // (here a bare note) is walked from the stack's ctx, so it must carry NO
    // armIndex (else `ctx.armIndex ?? armIndex` would wrongly propagate).
    const ir = parse('stack(arrange([2, note("c3")], [1, note("e3")]), note("g3"))')
    const evs = collectCycles(ir, 0, 3)
    const g3 = evs.filter((e) => e.note === 'g3')
    expect(g3.length).toBeGreaterThan(0)
    expect(g3.every((e) => e.armIndex === undefined)).toBe(true)
    // the arrange track still tags its arms
    expect(evs.find((e) => e.note === 'c3')?.armIndex).toBe(0)
    expect(evs.find((e) => e.note === 'e3')?.armIndex).toBe(1)
  })

  it('a nested arm carries loc INNERMOST→OUTERMOST (loc[last] = outer combinator)', () => {
    // loc is ordered leaf→…→outermost: [note "c3", cat(…), arrange(…)]. The
    // timeline's clip anchor is loc[last] (the OUTER arrange); the inner cat is
    // an interior entry. (Bind uses loc[0], the content leaf.)
    const code = 'arrange([2, cat(note("c3"), note("e3"))], [1, note("g3")])'
    const ir = parse(code)
    const ev = collectCycles(ir, 0, 1).find((e) => e.note === 'c3')!
    expect(ev.loc!.length).toBeGreaterThanOrEqual(2)
    const outer = ev.loc![ev.loc!.length - 1]!
    expect(code.slice(outer.start, outer.start + 'arrange('.length)).toBe('arrange(')
    // the inner cat is present as an interior loc entry (not the outermost)
    expect(ev.loc!.some((l) => code.slice(l.start, l.start + 'cat('.length) === 'cat(')).toBe(true)
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

describe('#434 — fastcat/Seq round-trip preserves ONE-cycle semantics', () => {
  // A non-collapsible fastcat: children can't fold into mini, so toStrudel must
  // pick a function form. The bug emitted `cat(...)` (slowcat = one cycle PER
  // child) → a 1-cycle sequence became 2-cycle. Now it emits `fastcat(...)`.
  const FASTCAT = 'fastcat(note("c3").fast(2), note("e3"))'

  it('toStrudel emits fastcat() for a non-collapsible Seq, not cat()', () => {
    const code = toStrudel(parse(FASTCAT))
    expect(code).toMatch(/^fastcat\(/)
    expect(code).not.toMatch(/^cat\(/)
  })

  it('parse → toStrudel → parse is identity (Seq + userMethod fastcat)', () => {
    const first = unwrapD1(parse(FASTCAT))
    expect(first.tag).toBe('Seq')
    if (first.tag === 'Seq') expect(first.userMethod).toBe('fastcat')
    const round = unwrapD1(parse(toStrudel(first)))
    expect(round.tag).toBe('Seq')
    if (round.tag === 'Seq') expect(round.userMethod).toBe('fastcat')
  })

  it('round-tripped code keeps ONE-cycle timing in real Strudel', async () => {
    // Ground truth: the re-emitted code must produce the SAME onsets as the
    // original over the same window. The old cat() emit would shift e3 to
    // cycle 1 (period 2); fastcat() keeps both in cycle 0 (period 1).
    const original = await strudelOnsets(FASTCAT, 2)
    const reemitted = await strudelOnsets(toStrudel(parse(FASTCAT)), 2)
    const norm = (xs: typeof original) =>
      xs.map(e => ({ note: e.note, begin: +e.begin.toFixed(4), end: +e.end.toFixed(4) }))
        .sort((a, b) => a.begin - b.begin)
    expect(norm(reemitted)).toEqual(norm(original))
  })

  it('patternToJSON/patternFromJSON preserves userMethod=fastcat (serialize fix)', () => {
    const ir = parse(FASTCAT)
    const back = unwrapD1(patternFromJSON(patternToJSON(ir)))
    expect(back.tag).toBe('Seq')
    if (back.tag === 'Seq') expect(back.userMethod).toBe('fastcat')
    // and the JSON-restored IR still re-emits fastcat (not cat)
    expect(toStrudel(back)).toMatch(/^fastcat\(/)
  })
})
