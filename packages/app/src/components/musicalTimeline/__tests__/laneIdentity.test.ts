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
import { resolveLaneKey, DEFAULT_LANE_KEY } from '../laneIdentity'
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
