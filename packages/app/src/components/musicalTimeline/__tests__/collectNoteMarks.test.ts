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

  it('routes a loc-less hap to its OWN eval lane by trackId, not a default IR lane (#864)', () => {
    // A sampled-signal hap carries NO loc → un-attributable by containment. P1b
    // routes it to an EVAL lane keyed by its producer id (`$1` → `d2`), NOT the
    // first IR lane — so it neither vanishes nor pollutes an unrelated lane.
    const haps = [
      { begin: 0, end: 1, trackId: '$1', note: 'C3', gain: 1 },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    // Its own eval lane `d2` (`$1` → d{1+1}); the IR lanes d1/d2 got no marks
    // (d2 here is the EVAL lane, disjoint from any IR lane — the mock IR has
    // events only under d1/d2 keys, but this hap has no loc so it can't attach).
    expect(marks.marksByLane.get('d2')?.map((n) => n.pitch)).toEqual([C3])
    // Not routed to the first IR lane (the old default-lane pollution bug).
    expect(marks.marksByLane.get('d1')).toBeUndefined()
  })

  it('keys a named-producer eval lane by the name verbatim (#864)', () => {
    // An un-attributable hap from a NAMED producer (no loc) → eval lane keyed by
    // the name, not a positional `d{N}` — mirroring `trackIdFromLabel`.
    const haps = [
      { begin: 0, end: 1, trackId: 'bass', note: 'E3', gain: 1 },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    expect(marks.marksByLane.get('bass')?.map((n) => n.pitch)).toEqual([E3])
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

/**
 * `sourceOffset` — the note's link back to its own source token (#874 phase 1).
 *
 * A `SceneNote` is a PROJECTION of an `IREvent`. In the retired DOM live view a
 * drawn note WAS its event, so `evt.loc[0].start` was always in hand and
 * click-to-source came free from identity; the canvas projection kept geometry
 * and dropped the link, which is how the gesture vanished with no commit that
 * removed it. These tests hold the link that restores it.
 *
 * Phase 1 is DATA ONLY — nothing renders or clicks differently yet. What is
 * asserted here is exactly what phase 2's hit-test will read.
 */
describe('collectNoteMarks — sourceOffset (#874)', () => {
  it('carries each IR mark’s own source offset (pre-eval fallback)', () => {
    // No eval events → IR path. d1's event is located at char 10, d2's at 40.
    const marks = collectNoteMarks(null, { fake: true } as never, 4)

    expect(marks.marksByLane.get('d1')![0].sourceOffset).toBe(10)
    expect(marks.marksByLane.get('d2')![0].sourceOffset).toBe(40)
  })

  it('carries each eval hap’s own source offset', () => {
    const haps = [
      { begin: 0, end: 0.5, trackId: '$0', note: 'C3', gain: 1, loc: [{ start: 12, end: 14 }] },
      { begin: 0.5, end: 1, trackId: '$1', note: 'E3', gain: 1, loc: [{ start: 42, end: 44 }] },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    expect(marks.marksByLane.get('d1')![0].sourceOffset).toBe(12)
    expect(marks.marksByLane.get('d2')![0].sourceOffset).toBe(42)
  })

  it('gives each note its OWN offset, not its lane’s shared anchor', () => {
    // The discriminating case, and the reason the feature exists: two haps on
    // ONE lane, at DIFFERENT source tokens. A per-LANE offset (which already
    // exists as `sourceByLane`, anchored at char 10 for d1) would collapse both
    // notes to one destination — clicking either note would jump to the same
    // place, which is the lane-level behaviour we already have. Per-NOTE offsets
    // are the whole point of #874, so assert they DIVERGE from the anchor and
    // from each other.
    const haps = [
      { begin: 0, end: 0.5, trackId: '$0', note: 'C3', gain: 1, loc: [{ start: 12, end: 14 }] },
      { begin: 0.5, end: 1, trackId: '$0', note: 'E3', gain: 1, loc: [{ start: 16, end: 18 }] },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    const d1 = marks.marksByLane.get('d1')!
    expect(d1.map((n) => n.sourceOffset)).toEqual([12, 16])
    // Both notes live on the lane whose anchor is 10 — neither reports it.
    expect(marks.sourceByLane.get('d1')).toBe(10)
  })

  it('takes loc[0] when the leaf token leads — `s("bd*2")` shape', () => {
    // A REAL shape, observed through the transpiler: one mini string contributes
    // its locations in SOURCE order, so the note's token leads and its operator
    // (`*2`) follows. loc[0] is the token — the case phase 1 targets.
    //   s("bd*2") → locations: [ "bd"[3,5], "2"[6,7] ]
    const haps = [
      {
        begin: 0,
        end: 0.5,
        trackId: '$0',
        s: 'bd',
        gain: 1,
        loc: [{ start: 3, end: 5 }, { start: 6, end: 7 }],
      },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    expect(marks.marksByLane.get('d1')![0].sourceOffset).toBe(3)
  })

  it('KNOWN RESIDUAL: a mini-string transform arg displaces the note token off loc[0]', () => {
    // Pins OBSERVED reality so phase 2 inherits a fact, not an assumption. A
    // transform whose arg is a MINI STRING contributes its locations FIRST, so
    // the note's own token lands LAST:
    //   n("0 2 4").scale("C:major") → [ "major"[20,25], "C"[18,19], "0"[3,4] ]
    // Carrying loc[0] therefore gives every note on the track the SAME offset —
    // the scale argument — while each note's degree token sits at the end.
    //
    // This test asserts what the code DOES, not what #874 ultimately wants: it
    // documents the gap rather than hiding it. Phase 2 must decide which element
    // to read, and when it changes this expectation SHOULD flip — that is the
    // point. (The degrees below differ per note, so a correct phase-2 rule yields
    // 3 DISTINCT offsets where today all three are 20.)
    const scaleHap = (note: string, degreeStart: number) => ({
      begin: 0,
      end: 0.5,
      trackId: '$0',
      note,
      gain: 1,
      loc: [
        { start: 20, end: 25 }, // "major" — the transform's own mini-string arg
        { start: 18, end: 19 }, // "C"
        { start: degreeStart, end: degreeStart + 1 }, // the note's OWN degree token
      ],
    })
    const haps = [
      scaleHap('C3', 3),
      scaleHap('E3', 5),
      scaleHap('G3', 7),
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    // All three collapse onto the scale arg — the residual, made visible.
    expect(marks.marksByLane.get('d1')!.map((n) => n.sourceOffset)).toEqual([20, 20, 20])
  })

  it('reports null for a loc-less hap rather than inventing an offset', () => {
    // A sampled/continuous signal hap carries no `loc` (P274/#864) — there is no
    // source token to point at. null is a PRINCIPLED residual: phase 3 falls back
    // to the existing lane-level jump. Guessing the lane's anchor here would send
    // a click somewhere the note did not come from.
    const haps = [
      { begin: 0, end: 1, trackId: '$1', note: 'C3', gain: 1 },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    expect(marks.marksByLane.get('d2')![0].sourceOffset).toBeNull()
  })

  it('reports null for a non-finite offset rather than passing it through', () => {
    // A garbage `loc` must not become a NaN cursor position downstream.
    const haps = [
      { begin: 0, end: 1, trackId: '$0', note: 'C3', gain: 1, loc: [{ start: NaN, end: 14 }] },
    ] as unknown as Parameters<typeof collectNoteMarks>[0]

    const marks = collectNoteMarks(haps, { fake: true } as never, 4)

    // Un-attributable by containment (NaN) → its own eval lane, offset null.
    expect(marks.marksByLane.get('d1')![0].sourceOffset).toBeNull()
  })
})
