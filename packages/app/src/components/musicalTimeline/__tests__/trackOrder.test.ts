/**
 * The song's declared top-level tracks, off the IR (#871 order, #1101 offsets).
 *
 * The IR is the structure layer, and it carries a Track node per statement even
 * for a track that emits NO events (a signal, a bare ref, a MUTED track) — which
 * is precisely the track the eval-backed lanes and the silent rows exist for.
 * These pin that contract on the IR SHAPES the real parser produces (observed via
 * parseStrudel).
 *
 * Each entry carries the STATEMENT OFFSET when the statement has a label, which
 * is what lets a row and its declaring statement be matched by POSITION rather
 * than by name (#1101) — the two disagree whenever `.p('name')` is used. The
 * ABSENCE of an offset is equally load-bearing: it means the statement is
 * unlabelled, and muting is a prefix on the label, so such a statement can never
 * be muted and is never owed a silent row.
 */
import { describe, it, expect } from 'vitest'
import type { PatternIR } from '@stave/editor'
import { captureLaneOrder, declaredTracks } from '../trackOrder'

const track = (trackId: string, start?: number): PatternIR =>
  ({
    tag: 'Track',
    trackId,
    body: { tag: 'Code', code: '', lang: 'strudel' },
    ...(start != null ? { loc: [{ start, end: start + 1 }] } : {}),
  }) as unknown as PatternIR

/** A `// $:` row — declared so its number holds still, but never run (#1696). */
const ghost = (trackId: string, start?: number): PatternIR =>
  ({ ...(track(trackId, start) as object), commented: true }) as unknown as PatternIR

const stack = (...tracks: PatternIR[]): PatternIR => ({ tag: 'Stack', tracks }) as unknown as PatternIR

/** Just the ids, in order — what lane ORDERING reads. */
const ids = (ir: PatternIR | null | undefined): string[] => declaredTracks(ir).map((t) => t.id)

describe('declaredTracks', () => {
  it('reads a Stack root in source order (the multi-track shape)', () => {
    // `$: note(sine…segment(8))` then `$: s("bd sd hh")` — the signal track is
    // FIRST in the source and emits no events, but the IR still names it d1.
    expect(ids(stack(track('d1', 0), track('d2', 38)))).toEqual(['d1', 'd2'])
  })

  it('reads named tracks verbatim (the lane-key space the eval lanes share)', () => {
    expect(ids(stack(track('sig', 0), track('drums', 40)))).toEqual(['sig', 'drums'])
  })

  it('reads a bare Track root (single track / bare loop)', () => {
    expect(ids(track('d1', 0))).toEqual(['d1'])
    expect(ids(track('d1'))).toEqual(['d1']) // bare loop: no loc
  })

  it('returns nothing to order by when the IR is absent or trackless', () => {
    expect(declaredTracks(null)).toEqual([])
    expect(declaredTracks(undefined)).toEqual([])
    expect(declaredTracks({ tag: 'Pure', value: 1 } as unknown as PatternIR)).toEqual([])
    // A Stack whose children aren't Tracks declares nothing.
    expect(declaredTracks(stack({ tag: 'Pure', value: 1 } as unknown as PatternIR))).toEqual([])
  })

  it('skips unidentified tracks and dedupes', () => {
    const noId = { tag: 'Track', body: { tag: 'Code' } } as unknown as PatternIR
    expect(ids(stack(track('d1'), noId, track('d1'), track('d2')))).toEqual(['d1', 'd2'])
  })

  it('carries the offset of every labelled statement (#1101)', () => {
    expect(declaredTracks(stack(track('d1', 0), track('d2', 38)))).toEqual([
      { id: 'd1', offset: 0 },
      { id: 'd2', offset: 38 },
    ])
  })

  it('omits the offset for an UNLABELLED statement, and that absence is the signal', () => {
    // A bare statement (`s("bd*4")`, `arrange(...)`, `stack(...)`) has no
    // `$:`/`name:` label, so the Track carries no loc. Muting is a PREFIX on that
    // label, so a statement with no offset cannot be muted — which is what lets
    // the scene builder withhold a silent row for it rather than guessing by name.
    expect(declaredTracks(track('d1'))).toEqual([{ id: 'd1' }])
    expect(declaredTracks(stack(track('d1'), track('d2', 12)))).toEqual([
      { id: 'd1' },
      { id: 'd2', offset: 12 },
    ])
  })

  it('never reports a non-finite offset as an offset', () => {
    // An offset is only usable as a coordinate if it is a real number; a NaN one
    // would make `containingAnchor` answer undefined anyway, so it must be
    // reported as ABSENT here rather than passed along as present-but-unusable.
    const weird = {
      tag: 'Track',
      trackId: 'd1',
      body: { tag: 'Code' },
      loc: [{ start: NaN, end: 1 }],
    } as unknown as PatternIR
    expect(declaredTracks(weird)).toEqual([{ id: 'd1' }])
  })
})

/**
 * #1696 — the lanes an ENGINE producer id (`$N`) indexes.
 *
 * `declaredTracks` answers "what rows does this document have"; this answers
 * "which of them did strudel actually run". They differ by exactly the
 * commented-out labels, and that difference is what the `$N` join needs: a
 * `// $:` is a row to the document and nothing at all to the engine, so
 * counting it shifts every id past it onto the wrong row.
 */
describe('captureLaneOrder', () => {
  it('drops a commented row and keeps the rest in source order', () => {
    //     const p = s("bd*2")
    //     // $: s("a")        ← d1, declared, never run
    //     p                   ← d2, what plays
    expect(captureLaneOrder(stack(ghost('d1', 20), track('d2', 33)))).toEqual(['d2'])
  })

  it('drops every commented row, not just the first', () => {
    expect(
      captureLaneOrder(stack(ghost('d1', 20), ghost('d2', 33), track('d3', 46))),
    ).toEqual(['d3'])
  })

  it('a MUTED row stays — `_$:` is a statement strudel runs', () => {
    // The distinction the whole fix rests on. A muted label returns silence
    // without registering, but it IS a statement, and both sides number it.
    // Were mute ever folded in with comment here, every id after a muted
    // track would shift by one.
    const muted = { ...(track('d1', 20) as object), muted: true } as unknown as PatternIR
    expect(captureLaneOrder(stack(muted, track('d2', 31)))).toEqual(['d1', 'd2'])
  })

  it('without ghosts it is exactly `declaredTracks` — the old assumption, intact', () => {
    // The control arm: where the arithmetic `$N → d{N+1}` was right, this
    // returns the list that makes it right, so nothing moves.
    const ir = stack(track('d1', 0), track('d2', 30), track('d3', 60))
    expect(captureLaneOrder(ir)).toEqual(declaredTracks(ir).map((t) => t.id))
  })

  it('no IR is an empty list, which the join reads as "no answer"', () => {
    expect(captureLaneOrder(null)).toEqual([])
  })
})
