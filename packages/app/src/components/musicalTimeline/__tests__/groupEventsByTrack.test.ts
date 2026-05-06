/**
 * groupEventsByTrack — D-04 grouping fallback chain.
 *
 * trackId → s → '$default'. First-seen insertion order. Fresh array
 * per call (PV34).
 */
import { describe, it, expect } from 'vitest'
import type { IREvent } from '../../../../../editor/src/ir/IREvent'
import { groupEventsByTrack } from '../groupEventsByTrack'

function evt(partial: Partial<IREvent>): IREvent {
  return {
    begin: 0,
    end: 0.1,
    endClipped: 0.1,
    note: null,
    freq: null,
    s: null,
    gain: 1,
    velocity: 1,
    color: null,
    ...partial,
  }
}

describe('groupEventsByTrack (D-04)', () => {
  it('returns empty array for empty input', () => {
    expect(groupEventsByTrack([])).toEqual([])
  })

  it('groups by trackId when present', () => {
    const events = [
      evt({ trackId: 'bd', s: 'bd' }),
      evt({ trackId: 'bd', s: 'bd', begin: 0.25 }),
      evt({ trackId: 'hh', s: 'hh', begin: 0.5 }),
    ]
    const groups = groupEventsByTrack(events)
    expect(groups).toHaveLength(2)
    expect(groups[0].trackId).toBe('bd')
    expect(groups[0].events).toHaveLength(2)
    expect(groups[1].trackId).toBe('hh')
  })

  it('falls back to s when trackId is undefined', () => {
    const events = [evt({ trackId: undefined, s: 'piano' })]
    expect(groupEventsByTrack(events)[0].trackId).toBe('piano')
  })

  it("falls back to '$default' when both trackId and s are null/undefined", () => {
    const events = [evt({ trackId: undefined, s: null })]
    expect(groupEventsByTrack(events)[0].trackId).toBe('$default')
  })

  it('preserves first-seen insertion order across mixed keys', () => {
    const events = [
      evt({ s: 'cp' }),
      evt({ trackId: 'bd', s: 'bd' }),
      evt({ s: null }), // → '$default'
      evt({ s: 'cp' }), // already seen → no new group
      evt({ trackId: 'bd', s: 'bd' }), // already seen
    ]
    const groups = groupEventsByTrack(events)
    expect(groups.map((g) => g.trackId)).toEqual(['cp', 'bd', '$default'])
    expect(groups[0].events).toHaveLength(2) // cp×2
    expect(groups[1].events).toHaveLength(2) // bd×2
    expect(groups[2].events).toHaveLength(1) // $default×1
  })

  it('returns a fresh array per call (PV34)', () => {
    const events = [evt({ trackId: 'bd' })]
    const a = groupEventsByTrack(events)
    const b = groupEventsByTrack(events)
    expect(a).not.toBe(b)
  })
})
