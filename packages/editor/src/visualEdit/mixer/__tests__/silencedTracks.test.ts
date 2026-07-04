/**
 * silencedNamesFrom — the pure rule the Song Timeline fades lanes by (#731).
 *
 * A track reads as SILENCED when it's MUTED or dimmed by a solo elsewhere — the
 * same rule the Mixer dims a strip by. These lock: nothing silenced when nothing
 * is muted/soloed (so an untouched mix fades no lane), mute → the muted track's
 * DISPLAY NAME (the Timeline join key, not the strip id), and solo → every
 * NON-soloed track's name (membership tested by `id`, the solo key).
 */
import { describe, it, expect } from 'vitest'

import { silencedNamesFrom, type SilenceFacts } from '../silencedTracks'

// Two anonymous tracks (id `#0`/`#1`, display `d1`/`d2`) + one named (`bass`).
const strips: SilenceFacts[] = [
  { id: '#0', name: 'd1', muted: false },
  { id: '#1', name: 'd2', muted: false },
  { id: 'bass', name: 'bass', muted: false },
]

describe('silencedNamesFrom', () => {
  it('silences nothing when nothing is muted and no solo is active', () => {
    // The fail-without case: with no fade rule the Timeline would look identical
    // to the Mixer regardless of state — here the correct result is an empty set.
    expect(silencedNamesFrom(strips, new Set())).toEqual(new Set())
  })

  it('silences a muted track by its DISPLAY NAME (the Timeline join key)', () => {
    const muted = strips.map((s) => (s.id === '#1' ? { ...s, muted: true } : s))
    expect(silencedNamesFrom(muted, new Set())).toEqual(new Set(['d2']))
  })

  it('silences every NON-soloed track when a solo is active', () => {
    // Solo the named track (id `bass`) → both anonymous tracks fade, `bass` stays.
    expect(silencedNamesFrom(strips, new Set(['bass']))).toEqual(new Set(['d1', 'd2']))
  })

  it('keeps every soloed track lit', () => {
    expect(silencedNamesFrom(strips, new Set(['#0', 'bass']))).toEqual(new Set(['d2']))
  })

  it('unions mute and solo-dim (a muted soloed track still fades)', () => {
    // Edge: a track can be BOTH soloed and muted — mute wins, it fades.
    const muted = strips.map((s) => (s.id === '#0' ? { ...s, muted: true } : s))
    // solo `#0` (muted) + `bass` → `#0` fades from mute, `d2` from solo-dim, bass lit
    expect(silencedNamesFrom(muted, new Set(['#0', 'bass']))).toEqual(new Set(['d1', 'd2']))
  })
})
