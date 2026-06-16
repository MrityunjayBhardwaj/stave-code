/**
 * layoutTrackRows — Phase 20-12 β-2 unit tests.
 *
 * Coverage matches plan §4 β-2 PART C:
 *   - collapsed → ROW_HEIGHT band, no leaves
 *   - expanded single-leaf → 1 * SUB_ROW_HEIGHT, 1 leaf
 *   - expanded 3-leaf stack → 3 * SUB_ROW_HEIGHT, monotonic top
 *   - cursor advance (track2.top = track1.top + track1.height)
 *   - empty Stack expanded → ROW_HEIGHT placeholder, 0 leaves
 */

import { describe, it, expect } from 'vitest'
import type { PatternIR, IREvent } from '@stave/editor'
import {
  layoutTrackRows,
  ROW_HEIGHT,
  SUB_ROW_HEIGHT,
  TRACK_GAP,
} from '../layoutTrackRows'

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

const PURE: PatternIR = { tag: 'Pure' } as PatternIR

function stack(...children: PatternIR[]): PatternIR {
  return {
    tag: 'Stack',
    tracks: children,
  } as PatternIR
}

describe('20-12 β-2 — layoutTrackRows', () => {
  it('collapsed track → ROW_HEIGHT band, zero leaves', () => {
    const result = layoutTrackRows(
      [{ trackId: 'd1', body: PURE, events: [] }],
      () => true, // collapsed
    )
    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0]).toMatchObject({
      trackId: 'd1',
      top: 0,
      height: ROW_HEIGHT,
      collapsed: true,
    })
    expect(result.tracks[0].leaves).toHaveLength(0)
    expect(result.totalHeight).toBe(ROW_HEIGHT)
  })

  it('expanded single-leaf (non-Stack body) → 1 * SUB_ROW_HEIGHT, 1 leaf', () => {
    const result = layoutTrackRows(
      [{ trackId: 'd1', body: PURE, events: [evt({ s: 'bd' })] }],
      () => false, // expanded
    )
    expect(result.tracks).toHaveLength(1)
    const t = result.tracks[0]
    expect(t.collapsed).toBe(false)
    expect(t.height).toBe(SUB_ROW_HEIGHT)
    expect(t.leaves).toHaveLength(1)
    expect(t.leaves[0]).toMatchObject({
      leafIndex: 0,
      top: 0,
      height: SUB_ROW_HEIGHT,
    })
    expect(result.totalHeight).toBe(SUB_ROW_HEIGHT)
  })

  it('expanded 3-leaf Stack → 3 * SUB_ROW_HEIGHT, monotonic increasing tops', () => {
    const body = stack(PURE, PURE, PURE)
    const result = layoutTrackRows(
      [{ trackId: 'd1', body, events: [] }],
      () => false,
    )
    const t = result.tracks[0]
    expect(t.height).toBe(3 * SUB_ROW_HEIGHT)
    expect(t.leaves).toHaveLength(3)
    expect(t.leaves[0].top).toBe(0)
    expect(t.leaves[1].top).toBe(SUB_ROW_HEIGHT)
    expect(t.leaves[2].top).toBe(2 * SUB_ROW_HEIGHT)
    // Each band has exactly SUB_ROW_HEIGHT.
    for (const leaf of t.leaves) {
      expect(leaf.height).toBe(SUB_ROW_HEIGHT)
    }
  })

  it('cursor advances across multiple tracks with a TRACK_GAP between lanes (#342)', () => {
    const result = layoutTrackRows(
      [
        { trackId: 'd1', body: PURE, events: [] }, // expanded → 1 * SUB_ROW
        { trackId: 'd2', body: stack(PURE, PURE), events: [] }, // expanded → 2 * SUB_ROW
        { trackId: 'd3', body: PURE, events: [] }, // collapsed → ROW
      ],
      (id) => id === 'd3',
    )
    const [t1, t2, t3] = result.tracks
    expect(t1.top).toBe(0)
    expect(t1.height).toBe(SUB_ROW_HEIGHT)
    // #342 — each subsequent lane is offset by its predecessor's height
    // PLUS the inter-lane gap, so bars don't bleed into the next track.
    expect(t2.top).toBe(t1.top + t1.height + TRACK_GAP)
    expect(t2.height).toBe(2 * SUB_ROW_HEIGHT)
    expect(t3.top).toBe(t2.top + t2.height + TRACK_GAP)
    expect(t3.height).toBe(ROW_HEIGHT)
    // No trailing gap after the last lane.
    expect(result.totalHeight).toBe(t3.top + t3.height)
  })

  it('empty Stack expanded → ROW_HEIGHT placeholder, zero leaves', () => {
    const result = layoutTrackRows(
      [{ trackId: 'd1', body: stack(), events: [] }],
      () => false,
    )
    const t = result.tracks[0]
    expect(t.collapsed).toBe(false)
    expect(t.height).toBe(ROW_HEIGHT)
    expect(t.leaves).toHaveLength(0)
  })

  it('melodic discriminator: leaf with at least one extractable pitch sets melodic=true with auto-fit range', () => {
    const result = layoutTrackRows(
      [
        {
          trackId: 'p1',
          body: PURE,
          events: [
            evt({ note: 'c4' }), // MIDI 60
            evt({ note: 'g4' }), // MIDI 67
          ],
        },
      ],
      () => false,
    )
    const leaf = result.tracks[0].leaves[0]
    expect(leaf.melodic).toBe(true)
    expect(leaf.pitchRange).toEqual({ min: 60, max: 67 })
  })

  it('percussive leaf (no extractable pitch) → melodic=false, no pitchRange', () => {
    const result = layoutTrackRows(
      [{ trackId: 'd1', body: PURE, events: [evt({ s: 'bd' })] }],
      () => false,
    )
    const leaf = result.tracks[0].leaves[0]
    expect(leaf.melodic).toBe(false)
    expect(leaf.pitchRange).toBeUndefined()
  })

  // Phase 20-12 wave-δ — custom subRowHeight from editor settings.
  describe('wave-δ — custom subRowHeight override', () => {
    it('expanded leaves use the custom subRowHeight (height + top + totalHeight propagate)', () => {
      const body = stack(PURE, PURE, PURE) // 3 leaves
      const result = layoutTrackRows(
        [{ trackId: 'd1', body, events: [] }],
        () => false,
        32, // custom override (default = SUB_ROW_HEIGHT = 18)
      )
      const track = result.tracks[0]
      expect(track.leaves).toHaveLength(3)
      // Each leaf band picks up the custom height.
      expect(track.leaves[0].height).toBe(32)
      expect(track.leaves[1].height).toBe(32)
      expect(track.leaves[2].height).toBe(32)
      // Top stacks at the custom step (cursor + leafIndex * subRowHeight).
      expect(track.leaves[0].top).toBe(0)
      expect(track.leaves[1].top).toBe(32)
      expect(track.leaves[2].top).toBe(64)
      // Total = 3 * 32 = 96; totalHeight (grid) reflects it.
      expect(track.height).toBe(96)
      expect(result.totalHeight).toBe(96)
    })

    it('default subRowHeight (no arg) preserves SUB_ROW_HEIGHT contract', () => {
      const body = stack(PURE, PURE)
      const result = layoutTrackRows(
        [{ trackId: 'd1', body, events: [] }],
        () => false,
      )
      expect(result.tracks[0].leaves[0].height).toBe(SUB_ROW_HEIGHT)
      expect(result.tracks[0].height).toBe(2 * SUB_ROW_HEIGHT)
    })

    it('collapsed rows ignore subRowHeight (always ROW_HEIGHT)', () => {
      const result = layoutTrackRows(
        [{ trackId: 'd1', body: PURE, events: [] }],
        () => true,
        48,
      )
      expect(result.tracks[0].height).toBe(ROW_HEIGHT)
      expect(result.tracks[0].leaves).toHaveLength(0)
    })
  })
})
