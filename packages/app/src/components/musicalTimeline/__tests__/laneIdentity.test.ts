/**
 * laneIdentity.test.ts — the app-side lane resolver (#498/U1) must (a) implement
 * `trackId ?? s ?? '$default'` and (b) NEVER drift from the editor's
 * authoritative `laneKeyOf`. The drift guard deep-imports the real `laneKeyOf`
 * (from `ir/songAnalysis`, types-only transitive deps → barrel/gifenc-free,
 * P172) and asserts the two agree across every shape — so a future change to
 * either definition fails here instead of silently breaking the hap→mark match
 * the U3 overlay relies on.
 */
import { describe, it, expect } from 'vitest'
import { resolveLaneKey, DEFAULT_LANE_KEY, containingAnchor } from '../laneIdentity'
// Authoritative editor definition, deep-imported to dodge the @stave/editor
// barrel (gifenc CJS crash under vite-node, P172).
import { laneKeyOf } from '../../../../../editor/src/ir/songAnalysis'

describe('resolveLaneKey (#498/U1)', () => {
  it('prefers trackId', () => {
    expect(resolveLaneKey({ trackId: 'd1', s: 'bd' })).toBe('d1')
  })
  it('falls back to s when trackId is absent', () => {
    expect(resolveLaneKey({ s: 'hh' })).toBe('hh')
    expect(resolveLaneKey({ trackId: null, s: 'hh' })).toBe('hh')
    expect(resolveLaneKey({ trackId: undefined, s: 'hh' })).toBe('hh')
  })
  it('falls back to the sentinel when neither is present', () => {
    expect(resolveLaneKey({})).toBe(DEFAULT_LANE_KEY)
    expect(resolveLaneKey({ trackId: null, s: null })).toBe(DEFAULT_LANE_KEY)
    expect(DEFAULT_LANE_KEY).toBe('$default')
  })
  it('treats an empty-string trackId as present (matches ?? semantics)', () => {
    // `?? ` only falls through on null/undefined — an explicit '' is a value.
    expect(resolveLaneKey({ trackId: '', s: 'bd' })).toBe('')
  })
})

describe('drift guard — resolveLaneKey === editor laneKeyOf', () => {
  // The exact shapes a hap / IR event can carry. If either definition changes,
  // one of these diverges and the hap→scene-mark match (U3) silently breaks.
  const cases = [
    { trackId: 'd1', s: 'bd' },
    { trackId: 'lead', s: 'sawtooth' },
    { trackId: 'chord-0' },
    { s: 'hh' },
    { s: 'sd', note: 60 },
    {},
    { trackId: undefined, s: undefined },
  ]
  for (const ev of cases) {
    it(`agrees for ${JSON.stringify(ev)}`, () => {
      // laneKeyOf takes an IREvent; these partials exercise the same fields it reads.
      expect(resolveLaneKey(ev)).toBe(laneKeyOf(ev as Parameters<typeof laneKeyOf>[0]))
    })
  }
})

describe('containingAnchor — the one source-containment reconciler (#1101)', () => {
  // Ascending, as every caller must supply. Two `$:` statements at 0 and 23.
  const anchors = [
    ['d1', 0],
    ['d2', 23],
  ] as ReadonlyArray<readonly [string, number]>

  it('attributes an offset to the LARGEST anchor at or before it', () => {
    expect(containingAnchor(anchors, 0)).toBe('d1')
    expect(containingAnchor(anchors, 22)).toBe('d1')
    expect(containingAnchor(anchors, 23)).toBe('d2') // inclusive at the boundary
    expect(containingAnchor(anchors, 999)).toBe('d2')
  })

  it('returns undefined when the offset precedes every anchor', () => {
    // A bare-ref hap whose `loc` points at a `const` above the first statement —
    // it belongs to no declared track, and a guess would fold it into one.
    expect(containingAnchor([['d1', 10]], 4)).toBeUndefined()
  })

  it('returns undefined for an absent or non-finite offset, never a guess', () => {
    // A hap with no `loc`, or a row with no statement offset (an unlabelled
    // statement). There is no positional answer, so it must not invent one.
    expect(containingAnchor(anchors, undefined)).toBeUndefined()
    expect(containingAnchor(anchors, NaN)).toBeUndefined()
    expect(containingAnchor(anchors, Infinity)).toBeUndefined()
  })

  it('returns undefined against no anchors at all', () => {
    expect(containingAnchor([], 5)).toBeUndefined()
  })

  it('MISANSWERS unsorted input — the ascending precondition is load-bearing', () => {
    // The scan keeps the last anchor ≤ `start` and breaks at the first one past it,
    // which only yields "the largest ≤" while the list ascends. This pins the
    // failure so the docstring's precondition is enforced rather than advisory: a
    // caller that forgets to sort gets a confident wrong answer, not an error.
    const descending = [
      ['d2', 23],
      ['d1', 0],
    ] as ReadonlyArray<readonly [string, number]>
    // Correct answers on this data are d2 (for 30) and d1 (for 5). Both are wrong:
    expect(containingAnchor(descending, 30)).toBe('d1') // keeps scanning past d2
    expect(containingAnchor(descending, 5)).toBeUndefined() // breaks at d2 immediately
    // …and are right once sorted, which is what every call site does.
    const ascending = [...descending].sort((a, b) => a[1] - b[1])
    expect(containingAnchor(ascending, 30)).toBe('d2')
    expect(containingAnchor(ascending, 5)).toBe('d1')
  })
})
