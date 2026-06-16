/**
 * Phase 5b (#437) — arrangement write-back substrate: combinator-arm parser +
 * surgical serializer. Three layers, mirroring the P5a IR test:
 *   1. DETECT     — parser exposes per-arm ranges (weight + pattern) for
 *                   arrange/cat/slowcat at the JS-argument altitude.
 *   2. SERIALIZE  — each op is a surgical OffsetEdit set; byte-fidelity (only
 *                   the targeted bytes move).
 *   3. PARITY     — edit the TEXT, re-parse with parseStrudel → the Arrange IR
 *                   changed exactly as intended (the loop closes; PV122 #1–#3).
 */
import { describe, it, expect } from 'vitest'
import {
  detectArrangeAt,
  detectAllArrangeCalls,
  setWeight,
  reorderArm,
  insertArm,
  removeArm,
  wrapBare,
  applyEdits,
} from '../index'
import { parseStrudel } from '../../ir'
import type { PatternIR } from '../../ir'

/** Pull the inner expression out of parseStrudel's synthetic `d1` Track. */
function inner(ir: PatternIR): PatternIR {
  if (ir.tag === 'Track' && (ir as { userMethod?: string }).userMethod === undefined) {
    return (ir as { body: PatternIR }).body
  }
  return ir
}
function asArrange(code: string): PatternIR & { tag: 'Arrange' } {
  const node = inner(parseStrudel(code))
  if (node.tag !== 'Arrange') throw new Error(`expected Arrange, got ${node.tag}`)
  return node
}
const slice = (doc: string, r: [number, number]): string => doc.slice(r[0], r[1])

describe('arrange parser — detectArrangeAt', () => {
  it('exposes weight + pattern ranges for an arrange node', () => {
    const doc = 'arrange([2, s("bd")], [1, s("hh")])'
    const call = detectArrangeAt(doc, doc.indexOf('[2'))
    expect(call).not.toBeNull()
    expect(call!.mode).toBe('arrange')
    expect(slice(doc, call!.callRange)).toBe(doc)
    expect(slice(doc, call!.calleeRange)).toBe('arrange')
    expect(call!.arms).toHaveLength(2)
    expect(slice(doc, call!.arms[0].weightRange!)).toBe('2')
    expect(slice(doc, call!.arms[0].patternRange)).toBe('s("bd")')
    expect(slice(doc, call!.arms[0].armRange)).toBe('[2, s("bd")]')
    expect(slice(doc, call!.arms[1].weightRange!)).toBe('1')
    expect(slice(doc, call!.arms[1].patternRange)).toBe('s("hh")')
  })

  it('exposes bare-pattern arms (no weight) for cat / slowcat', () => {
    const doc = 'cat(s("bd"), note("c3 e3"))'
    const call = detectArrangeAt(doc, doc.indexOf('s("bd")'))
    expect(call!.mode).toBe('cat')
    expect(call!.arms[0].weightRange).toBeNull()
    expect(slice(doc, call!.arms[0].patternRange)).toBe('s("bd")')
    expect(slice(doc, call!.arms[1].patternRange)).toBe('note("c3 e3")')
  })

  it('binds the INNERMOST combinator when nested', () => {
    const doc = 'arrange([2, cat(s("bd"), s("hh"))], [1, s("cp")])'
    const inCat = doc.indexOf('s("hh")')
    const call = detectArrangeAt(doc, inCat)
    expect(call!.mode).toBe('cat')
    expect(slice(doc, call!.callRange)).toBe('cat(s("bd"), s("hh"))')
  })

  it('returns null off any combinator, and rejects a malformed arrange arm', () => {
    expect(detectArrangeAt('s("bd")', 2)).toBeNull()
    // arrange arm not a [n, pat] tuple → unparseable as an arrange clip
    expect(detectArrangeAt('arrange(s("bd"))', 10)).toBeNull()
  })

  it('detectAllArrangeCalls finds every call in source order', () => {
    const doc = '$: cat(s("a"), s("b"))\n$: arrange([2, s("c")], [1, s("d")])'
    const calls = detectAllArrangeCalls(doc)
    expect(calls.map((c) => c.mode)).toEqual(['cat', 'arrange'])
  })
})

describe('arrange serializer — surgical, byte-fidelity', () => {
  it('round-trip: setting a weight to its current value is a no-op edit', () => {
    const doc = 'arrange([2, s("bd")], [1, s("hh")])'
    const call = detectArrangeAt(doc, doc.indexOf('[2'))!
    expect(applyEdits(doc, setWeight(doc, call, 0, 2))).toBe(doc)
  })

  it('set-weight changes ONLY the weight digits', () => {
    const doc = 'arrange([2, s("bd")], [1, s("hh")])'
    const call = detectArrangeAt(doc, doc.indexOf('[2'))!
    const out = applyEdits(doc, setWeight(doc, call, 0, 3))
    expect(out).toBe('arrange([3, s("bd")], [1, s("hh")])')
    // exactly one character differs
    expect([...out].filter((ch, i) => ch !== doc[i])).toEqual(['3'])
  })

  it('set-weight on cat promotes cat → arrange, patterns verbatim (PV122 #3)', () => {
    const doc = 'cat(s("bd"), note("c3 e3"))'
    const call = detectArrangeAt(doc, 0)!
    const out = applyEdits(doc, setWeight(doc, call, 1, 2))
    expect(out).toBe('arrange([1, s("bd")], [2, note("c3 e3")])')
  })

  it('set-weight 1 on cat is a no-op (cat weight is implicitly 1)', () => {
    const doc = 'cat(s("bd"), s("hh"))'
    const call = detectArrangeAt(doc, 0)!
    expect(applyEdits(doc, setWeight(doc, call, 0, 1))).toBe(doc)
  })

  it('§2.1 wrap: a bare pattern becomes an arrange with a leading silence', () => {
    const doc = 's("bd")'
    const out = applyEdits(doc, wrapBare([0, doc.length], 16, 1))
    expect(out).toBe('arrange([16, silence], [1, s("bd")])')
  })

  it('remove-arm drops the arm and one separator', () => {
    const doc = 'arrange([2, s("bd")], [1, s("hh")], [1, s("cp")])'
    const call = detectArrangeAt(doc, 0)!
    expect(applyEdits(doc, removeArm(doc, call, 1))).toBe(
      'arrange([2, s("bd")], [1, s("cp")])',
    )
    // last arm
    expect(applyEdits(doc, removeArm(doc, call, 2))).toBe(
      'arrange([2, s("bd")], [1, s("hh")])',
    )
  })

  it('remove-arm refuses to empty the combinator (PV122 #5)', () => {
    const doc = 'arrange([2, s("bd")])'
    const call = detectArrangeAt(doc, 0)!
    expect(removeArm(doc, call, 0)).toEqual([])
  })

  it('insert-arm adds an arm at an index and at the end', () => {
    const doc = 'arrange([2, s("bd")], [1, s("hh")])'
    const call = detectArrangeAt(doc, 0)!
    expect(applyEdits(doc, insertArm(doc, call, 1, '[3, s("cp")]'))).toBe(
      'arrange([2, s("bd")], [3, s("cp")], [1, s("hh")])',
    )
    expect(applyEdits(doc, insertArm(doc, call, 2, '[3, s("cp")]'))).toBe(
      'arrange([2, s("bd")], [1, s("hh")], [3, s("cp")])',
    )
  })

  it('reorder-arm moves an arm, patterns verbatim', () => {
    const doc = 'arrange([2, s("bd")], [1, s("hh")], [1, s("cp")])'
    const call = detectArrangeAt(doc, 0)!
    expect(applyEdits(doc, reorderArm(doc, call, 2, 0))).toBe(
      'arrange([1, s("cp")], [2, s("bd")], [1, s("hh")])',
    )
  })
})

describe('arrange parity — edit text → re-parse → IR changed (PV122 #1–#3)', () => {
  it('set-weight moves the clip extent: re-parsed arm weight + period change', () => {
    const doc = 'arrange([2, s("bd")], [2, s("hh")])'
    const before = asArrange(doc)
    expect(before.arms.map((a) => a.weight)).toEqual([2, 2]) // period 4
    // edit through the arm loc the IR already carries (the write-back anchor)
    const anchor = before.arms[0].loc![0].start
    const call = detectArrangeAt(doc, anchor)!
    const out = applyEdits(doc, setWeight(doc, call, 0, 4))

    const after = asArrange(out)
    expect(after.mode).toBe('arrange')
    expect(after.arms.map((a) => a.weight)).toEqual([4, 2]) // period now 6
    // arm 0 spans [0,4); arm 1 now starts at cycle 4 (was 2) — extent moved
    const period = after.arms.reduce((s, a) => s + a.weight, 0)
    expect(period).toBe(6)
  })

  it('cat promotion re-parses as a weighted arrange', () => {
    const doc = 'cat(s("bd"), s("hh"))'
    const before = asArrange(doc)
    expect(before.mode).toBe('cat')
    const call = detectArrangeAt(doc, before.arms[1].loc![0].start)!
    const out = applyEdits(doc, setWeight(doc, call, 1, 3))

    const after = asArrange(out)
    expect(after.mode).toBe('arrange')
    expect(after.arms.map((a) => a.weight)).toEqual([1, 3])
  })
})
