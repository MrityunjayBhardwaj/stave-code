/**
 * reconcileSoloMutes — the whole solo-as-code-mutes policy (#735).
 *
 * These lock the behaviours a user relies on: soloing mutes every OTHER muteable
 * track and un-mutes the soloed one; the snapshot captures the pre-solo mutes on
 * first activation; clearing solo RESTORES that snapshot (so a hand-set mute
 * survives a solo→un-solo round-trip, not wiped); non-muteable strips are never
 * targeted.
 */
import { describe, it, expect } from 'vitest'

import { reconcileSoloMutes, type SoloStripFacts } from '../soloMuteSync'

// d1/d2/d3 named tracks (muteable); `bare` = a bare-expression strip (not muteable).
const base: SoloStripFacts[] = [
  { id: 'd1', muted: false, muteable: true },
  { id: 'd2', muted: false, muteable: true },
  { id: 'd3', muted: false, muteable: true },
]

describe('reconcileSoloMutes', () => {
  it('solo mutes every other track; captures an empty snapshot when nothing was muted', () => {
    const { targetMuted, nextSnapshot } = reconcileSoloMutes(base, new Set(['d2']), null)
    expect(targetMuted).toEqual(new Set(['d1', 'd3'])) // d2 soloed → audible
    expect(nextSnapshot).toEqual(new Set()) // no pre-solo mutes
  })

  it('soloing a track that was muted un-mutes it (it becomes the audible one)', () => {
    const strips = base.map((s) => (s.id === 'd2' ? { ...s, muted: true } : s))
    const { targetMuted, nextSnapshot } = reconcileSoloMutes(strips, new Set(['d2']), null)
    expect(targetMuted.has('d2')).toBe(false) // d2 un-muted despite being muted before
    expect(targetMuted).toEqual(new Set(['d1', 'd3']))
    expect(nextSnapshot).toEqual(new Set(['d2'])) // snapshot remembers d2 was muted
  })

  it('multiple solos keep all soloed tracks audible', () => {
    const { targetMuted } = reconcileSoloMutes(base, new Set(['d1', 'd3']), null)
    expect(targetMuted).toEqual(new Set(['d2']))
  })

  it('preserves the snapshot across further solo edits (does NOT re-capture)', () => {
    // d1 muted by hand; solo d2 (snapshot={d1}); now also solo d3 — snapshot must stay {d1}.
    const strips = base.map((s) => (s.id === 'd1' ? { ...s, muted: true } : s))
    const { nextSnapshot } = reconcileSoloMutes(strips, new Set(['d2', 'd3']), new Set(['d1']))
    expect(nextSnapshot).toEqual(new Set(['d1']))
  })

  it('clearing solo RESTORES the pre-solo mutes (hand-set mute survives)', () => {
    // Pre-solo: d1 was muted. Snapshot carried {d1}. Un-solo (empty set) → restore {d1}.
    const { targetMuted, nextSnapshot } = reconcileSoloMutes(base, new Set(), new Set(['d1']))
    expect(targetMuted).toEqual(new Set(['d1'])) // d1 stays muted; d2/d3 audible
    expect(nextSnapshot).toBeNull()
  })

  it('clearing solo with no snapshot un-mutes everything', () => {
    const { targetMuted, nextSnapshot } = reconcileSoloMutes(base, new Set(), null)
    expect(targetMuted).toEqual(new Set())
    expect(nextSnapshot).toBeNull()
  })

  it('never targets a non-muteable (bare-expression) strip', () => {
    const strips: SoloStripFacts[] = [
      ...base,
      { id: '#3', muted: false, muteable: false },
    ]
    const { targetMuted } = reconcileSoloMutes(strips, new Set(['d1']), null)
    expect(targetMuted.has('#3')).toBe(false) // can't carry `_` → left alone
    expect(targetMuted).toEqual(new Set(['d2', 'd3']))
  })
})
