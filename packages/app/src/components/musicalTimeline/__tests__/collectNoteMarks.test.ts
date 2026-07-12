/**
 * collectNoteMarks — eval-backed DISPLAY marks (#861).
 *
 * The Song timeline's note marks must come from the EVALUATED haps, not the
 * static IR: the IR carries the raw source token (`note:"0"` for `n("0 2 4")`)
 * and drops `.scale`, so IR-read pitch is null → a flat pitchless bar (P274).
 * The evaluated hap carries the RESOLVED note (`"C3"`), which `extractPitch`
 * parses directly — no scale/degree logic needed.
 *
 * `collectNoteMarks` pulls the runtime `collectCycles`/`laneKeyOf` from
 * `@stave/editor` (a CJS-`gifenc`-laden barrel), so — mirroring
 * FullSongTimeline.test.tsx — we mock just those two. The IR events the mock
 * returns deliberately carry a BARE-INTEGER `note` (`"0"`), which is exactly
 * the case the static IR gets wrong; the eval events carry note NAMES. So a
 * pitched mark can ONLY come from the eval path, making the two paths
 * distinguishable in the assertions below.
 */
import { describe, it, expect, vi } from 'vitest'

// IR events (what `collectCycles` returns) — TWO `$:` lanes:
//   d1 at statement offset (dollarPos) 0, its mini-notation at chars [10,20]
//   d2 at statement offset 30,            its mini-notation at chars [40,50]
// `note:"0"` is the P274 symptom: extractPitch rejects a bare int → pitch null.
const { IR_EVENTS } = vi.hoisted(() => ({
  IR_EVENTS: [
    { begin: 0, end: 1, trackId: 'd1', dollarPos: 0, note: '0', loc: [{ start: 10, end: 20 }] },
    { begin: 0, end: 1, trackId: 'd2', dollarPos: 30, note: '0', loc: [{ start: 40, end: 50 }] },
  ],
}))
vi.mock('@stave/editor', () => ({
  collectCycles: () => IR_EVENTS,
  laneKeyOf: (ev: { trackId?: string; s?: string }) => ev?.trackId ?? ev?.s ?? '$default',
}))

import { collectNoteMarks } from '../timelineMarks'

// C3 = 48, E3 = 52, G3 = 55 (C4 = 60 convention, per pitch.ts).
const C3 = 48
const E3 = 52

describe('collectNoteMarks — eval-backed marks (#861)', () => {
  it('derives pitched marks from the eval haps (resolved note names)', () => {
    // One hap per lane, note already RESOLVED by Strudel (as `n().scale()`
    // would yield). trackId is `$0`/`$1` (the eval scheme) — DIFFERENT from the
    // IR lane keys `d1`/`d2`, to prove attribution is NOT trackId equality.
    const haps = [
      { begin: 0, end: 0.5, trackId: '$0', note: 'C3', gain: 1, loc: [{ start: 12, end: 14 }] },
      { begin: 0.5, end: 1, trackId: '$1', note: 'E3', gain: 1, loc: [{ start: 42, end: 44 }] },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    // Containment: hap at char 12 → largest dollarPos ≤ 12 is 0 → lane d1;
    // hap at char 42 → largest ≤ 42 is 30 → lane d2.
    const d1 = marks.marksByLane.get('d1')
    const d2 = marks.marksByLane.get('d2')
    expect(d1).toHaveLength(1)
    expect(d2).toHaveLength(1)
    expect(d1![0].pitch).toBe(C3)
    expect(d2![0].pitch).toBe(E3)
  })

  it('attributes haps by source containment across two lanes, not trackId', () => {
    // Both haps carry trackId `$9` (matching NEITHER IR lane) — pure containment
    // decides. Char 15 is inside d1's statement (dollarPos 0, before d2's 30);
    // char 45 is past d2's statement start (30).
    const haps = [
      { begin: 0, end: 0.5, trackId: '$9', note: 'C3', gain: 1, loc: [{ start: 15, end: 17 }] },
      { begin: 0, end: 0.5, trackId: '$9', note: 'E3', gain: 1, loc: [{ start: 45, end: 47 }] },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    expect(marks.marksByLane.get('d1')?.map((n) => n.pitch)).toEqual([C3])
    expect(marks.marksByLane.get('d2')?.map((n) => n.pitch)).toEqual([E3])
  })

  it('routes a loc-less hap to the first-seen (default) lane, not dropped', () => {
    // A sampled/continuous-signal hap carries NO loc → un-attributable by
    // containment → the first IR lane (`d1`). Kept (still plays), just not
    // lane-precise (the eval-backed-lanes follow-on, P1b).
    const haps = [
      { begin: 0, end: 1, trackId: '$3', note: 'C3', gain: 1 },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    expect(marks.marksByLane.get('d1')?.map((n) => n.pitch)).toEqual([C3])
    expect(marks.marksByLane.get('d2')).toBeUndefined()
  })

  it('falls back to IR marks (source-lossy pitch) when there are no eval events', () => {
    // Pre-eval: `events` is null → marks come from the IR. The IR note is a bare
    // integer `"0"` → extractPitch returns null → a flat, pitchless mark. This is
    // the very failure the eval path fixes; the fallback preserves today's
    // behaviour so nothing regresses before the first eval.
    const marks = collectNoteMarks(null, { fake: true } as never, 4)

    const d1 = marks.marksByLane.get('d1')
    expect(d1).toHaveLength(1)
    expect(d1![0].pitch).toBeNull()
    // Structure is still IR-derived in both paths — both lanes present.
    expect(marks.marksByLane.get('d2')).toHaveLength(1)
  })

  it('keeps structure (label offsets) IR-derived even on the eval path', () => {
    const haps = [
      { begin: 0, end: 0.5, trackId: '$0', note: 'C3', gain: 1, loc: [{ start: 12, end: 14 }] },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    // dollarPos (label offset) comes from the IR, regardless of the mark source.
    expect(marks.labelOffsetByLane.get('d1')).toBe(0)
    expect(marks.labelOffsetByLane.get('d2')).toBe(30)
  })
})
