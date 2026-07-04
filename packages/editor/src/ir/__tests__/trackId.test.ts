/**
 * trackId — the mute-invariant identity rule (#737).
 *
 * A muted track (`_` label prefix) must resolve to the SAME lane identity as its
 * unmuted self, so muting keeps a track in its place (and doesn't collapse every
 * anon `_$:` onto one lane). Guards the P235 trap: identity must strip `_` the
 * same way the DISPLAY deriver (`labelAtOffset`) already does.
 */
import { describe, it, expect } from 'vitest'
import { trackIdFromLabel } from '../trackId'
import { parseStrudel } from '../parseStrudel'
import type { PatternIR } from '../PatternIR'

function trackIds(ir: PatternIR): string[] {
  if (ir.tag === 'Stack') return ir.tracks.map((t) => (t.tag === 'Track' ? t.trackId : '?'))
  if (ir.tag === 'Track') return [ir.trackId]
  return []
}

describe('trackIdFromLabel — mute-invariant identity', () => {
  it('anon `$:` (bare or muted) keeps the positional `d{i+1}`', () => {
    expect(trackIdFromLabel('$', 0)).toBe('d1')
    expect(trackIdFromLabel('_$', 0)).toBe('d1') // muted anon → still positional, NOT '_$'
    expect(trackIdFromLabel('$', 1)).toBe('d2')
    expect(trackIdFromLabel('_$', 1)).toBe('d2')
  })

  it('named track: mute is invariant (same id muted or not)', () => {
    expect(trackIdFromLabel('drums', 0)).toBe('drums')
    expect(trackIdFromLabel('_drums', 0)).toBe('drums') // muted named → same lane, NOT '_drums'
  })

  it('undefined label falls to positional', () => {
    expect(trackIdFromLabel(undefined, 0)).toBe('d1')
  })
})

describe('parseStrudel — muted tracks keep their lane (#737 regression)', () => {
  it('two muted anon `$:` do NOT collapse into one lane', () => {
    // Without the `_`-strip both became trackId `_$` → ONE lane.
    expect(trackIds(parseStrudel('_$: s("bd")\n_$: s("hh")'))).toEqual(['d1', 'd2'])
  })

  it('a muted named track keeps its unmuted identity', () => {
    // Without the strip the muted track became `_drums` — a new lane.
    expect(trackIds(parseStrudel('drums: s("bd")\n_lead: s("hh")'))).toEqual(['drums', 'lead'])
  })

  it('mixed muted/unmuted anon stay in their positional slots', () => {
    expect(trackIds(parseStrudel('$: s("bd")\n_$: s("hh")\n$: s("cp")'))).toEqual(['d1', 'd2', 'd3'])
  })
})
