/**
 * Source track order off the IR (#871) — the lane order the user wrote.
 *
 * The IR is the structure layer, and it carries a Track node per statement even
 * for a track that emits NO events (a signal, a bare ref) — which is precisely
 * the track the eval-backed lanes exist for. These pin that contract on the IR
 * SHAPES the real parser produces (observed via parseStrudel).
 */
import { describe, it, expect } from 'vitest'
import type { PatternIR } from '@stave/editor'
import { sourceTrackOrder } from '../trackOrder'

const track = (trackId: string, start?: number): PatternIR =>
  ({
    tag: 'Track',
    trackId,
    body: { tag: 'Code', code: '', lang: 'strudel' },
    ...(start != null ? { loc: [{ start, end: start + 1 }] } : {}),
  }) as unknown as PatternIR

const stack = (...tracks: PatternIR[]): PatternIR => ({ tag: 'Stack', tracks }) as unknown as PatternIR

describe('sourceTrackOrder', () => {
  it('reads a Stack root in source order (the multi-track shape)', () => {
    // `$: note(sine…segment(8))` then `$: s("bd sd hh")` — the signal track is
    // FIRST in the source and emits no events, but the IR still names it d1.
    expect(sourceTrackOrder(stack(track('d1', 0), track('d2', 38)))).toEqual(['d1', 'd2'])
  })

  it('reads named tracks verbatim (the lane-key space the eval lanes share)', () => {
    expect(sourceTrackOrder(stack(track('sig', 0), track('drums', 40)))).toEqual(['sig', 'drums'])
  })

  it('reads a bare Track root (single track / bare loop)', () => {
    expect(sourceTrackOrder(track('d1', 0))).toEqual(['d1'])
    expect(sourceTrackOrder(track('d1'))).toEqual(['d1']) // bare loop: no loc
  })

  it('returns nothing to order by when the IR is absent or trackless', () => {
    expect(sourceTrackOrder(null)).toEqual([])
    expect(sourceTrackOrder(undefined)).toEqual([])
    expect(sourceTrackOrder({ tag: 'Pure', value: 1 } as unknown as PatternIR)).toEqual([])
    // A Stack whose children aren't Tracks contributes no order.
    expect(sourceTrackOrder(stack({ tag: 'Pure', value: 1 } as unknown as PatternIR))).toEqual([])
  })

  it('skips unidentified tracks and dedupes', () => {
    const noId = { tag: 'Track', body: { tag: 'Code' } } as unknown as PatternIR
    expect(sourceTrackOrder(stack(track('d1'), noId, track('d1'), track('d2')))).toEqual(['d1', 'd2'])
  })
})
