import { describe, it, expect } from 'vitest'
import type { SongAnalysis } from '@stave/editor'
import { buildTimelineScene, clipAtCycle, type SceneNote, type SceneClip, type SceneLane, type CollectedMarks } from '../timelineScene'

const analysisFixture: SongAnalysis = {
  periodCycles: 4,
  horizonCycles: 8,
  reachedCap: false,
  lanes: [
    { laneKey: 'bd', onsetsByCycle: [2, 0, 3, 0] },
    { laneKey: 'lead', onsetsByCycle: [1, 1, 1, 1] },
  ],
  sections: [
    { startCycle: 0, endCycle: 1, laneKeys: ['bd', 'lead'] },
    { startCycle: 1, endCycle: 4, laneKeys: ['lead'] },
  ],
}

function marks(
  entries: Record<string, SceneNote[]>,
  capped = false,
  sources: Record<string, number> = {},
  clips: Record<string, SceneClip[]> = {},
  // Outer-combinator anchors (#451); default = `sources` (equal for a
  // non-nested lane, where loc[0] === loc[last]).
  arranges: Record<string, number> = sources,
  // Per-lane statement (label) offsets — `dollarPos` per lane (#579 STEP 2).
  labels: Record<string, number> = {},
): CollectedMarks {
  return {
    marksByLane: new Map(Object.entries(entries)),
    sourceByLane: new Map(Object.entries(sources)),
    arrangeByLane: new Map(Object.entries(arranges)),
    labelOffsetByLane: new Map(Object.entries(labels)),
    clipsByLane: new Map(Object.entries(clips)),
    capped,
  }
}

describe('buildTimelineScene', () => {
  it('returns an empty scene for null analysis', () => {
    const scene = buildTimelineScene(null)
    expect(scene.lanes).toEqual([])
    expect(scene.displayCycles).toBe(1)
    expect(scene.period).toBeNull()
    expect(scene.peakDensity).toBe(1)
    expect(scene.notesCapped).toBe(false)
  })

  it('spans one loop period and carries density + peak', () => {
    const scene = buildTimelineScene(analysisFixture)
    expect(scene.displayCycles).toBe(4) // periodCycles wins over horizon
    expect(scene.period).toBe(4)
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['bd', 'lead']) // first-seen order
    expect(scene.peakDensity).toBe(3) // busiest cell across lanes
    expect(scene.lanes[0].density).toEqual([2, 0, 3, 0])
    expect(scene.sections.length).toBe(2)
  })

  it('falls back to the horizon when no period was found', () => {
    const noPeriod: SongAnalysis = { ...analysisFixture, periodCycles: null, horizonCycles: 8 }
    const scene = buildTimelineScene(noPeriod)
    expect(scene.displayCycles).toBe(8)
    expect(scene.period).toBeNull()
  })

  it('merges note marks and computes per-lane pitch range', () => {
    const scene = buildTimelineScene(
      analysisFixture,
      marks({
        bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }], // percussive → no pitch range
        lead: [
          { cycle: 0, end: 0.5, pitch: 60, gain: 0.5 },
          { cycle: 1, end: 1.5, pitch: 72, gain: 1 },
          { cycle: 2, end: 2.5, pitch: 64, gain: 0.8 },
        ],
      }),
    )
    const bd = scene.lanes.find((l) => l.laneKey === 'bd')!
    const lead = scene.lanes.find((l) => l.laneKey === 'lead')!
    expect(bd.notes.length).toBe(1)
    expect(bd.pitchMin).toBeNull()
    expect(bd.pitchMax).toBeNull()
    expect(lead.notes.length).toBe(3)
    expect(lead.pitchMin).toBe(60)
    expect(lead.pitchMax).toBe(72)
  })

  it('assigns a stable color per lane and leaves note-less lanes empty', () => {
    const scene = buildTimelineScene(analysisFixture, marks({ bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }] }))
    expect(typeof scene.lanes[0].color).toBe('string')
    expect(scene.lanes[0].color.length).toBeGreaterThan(0)
    const lead = scene.lanes.find((l) => l.laneKey === 'lead')!
    expect(lead.notes).toEqual([]) // no marks supplied for this lane
  })

  it('propagates the capped flag', () => {
    const scene = buildTimelineScene(analysisFixture, marks({ bd: [] }, true))
    expect(scene.notesCapped).toBe(true)
  })

  it('resolves the display NAME + colour from the source label (#579 STEP 2)', async () => {
    const { paletteForTrack, trackIndexOf } = await import('../colors')
    // Two lanes keyed positionally (`d1`,`d2`) as the live engine does. `d1` is a
    // NAMED `bass:` track; `d2` is anonymous `$:`. Source + per-lane dollarPos:
    //   `bass: s("bd")`  → offset 0
    //   `$: s("hh")`     → offset 14
    const code = 'bass: s("bd")\n$: s("hh")'
    const analysis = {
      periodCycles: 1,
      horizonCycles: 1,
      lanes: [
        { laneKey: 'd1', onsetsByCycle: [1] },
        { laneKey: 'd2', onsetsByCycle: [1] },
      ],
      sections: [],
      reachedCap: false,
    }
    const scene = buildTimelineScene(analysis, marks({}, false, {}, {}, {}, { d1: 0, d2: 14 }), undefined, code)
    const d1 = scene.lanes.find((l) => l.laneKey === 'd1')!
    const d2 = scene.lanes.find((l) => l.laneKey === 'd2')!
    // Named track: name + colour resolve to the LABEL, not `d1`.
    expect(d1.displayName).toBe('bass')
    expect(d1.color).toBe(paletteForTrack(trackIndexOf('bass'), 'bass'))
    // Anonymous track: name + colour stay positional `d2`.
    expect(d2.displayName).toBe('d2')
    expect(d2.color).toBe(paletteForTrack(trackIndexOf('d2'), 'd2'))
  })

  it('layers a custom-colour override over the palette, keyed by display name (#581)', async () => {
    const { paletteForTrack, trackIndexOf } = await import('../colors')
    const code = 'bass: s("bd")\n$: s("hh")'
    const analysis = {
      periodCycles: 1,
      horizonCycles: 1,
      lanes: [
        { laneKey: 'd1', onsetsByCycle: [1] },
        { laneKey: 'd2', onsetsByCycle: [1] },
      ],
      sections: [],
      reachedCap: false,
    }
    // Override keyed by the lane's DISPLAY NAME: `bass` (the named track's label)
    // and `d2` (the anon track's positional name).
    const overrides = new Map([
      ['bass', '#123456'],
      ['d2', '#abcdef'],
    ])
    const scene = buildTimelineScene(
      analysis,
      marks({}, false, {}, {}, {}, { d1: 0, d2: 14 }),
      undefined,
      code,
      overrides,
    )
    const d1 = scene.lanes.find((l) => l.laneKey === 'd1')!
    const d2 = scene.lanes.find((l) => l.laneKey === 'd2')!
    // The override WINS over the deterministic palette for both.
    expect(d1.color).toBe('#123456')
    expect(d2.color).toBe('#abcdef')
    // Display names are unchanged — only colour is overridden.
    expect(d1.displayName).toBe('bass')
    expect(d2.displayName).toBe('d2')
    // A lane with NO override keeps the palette colour (clear-to-default path).
    const noOverride = buildTimelineScene(
      analysis,
      marks({}, false, {}, {}, {}, { d1: 0, d2: 14 }),
      undefined,
      code,
      new Map(),
    )
    expect(noOverride.lanes.find((l) => l.laneKey === 'd1')!.color).toBe(
      paletteForTrack(trackIndexOf('bass'), 'bass'),
    )
  })

  it('keeps positional d{N} names when no source is supplied', () => {
    const analysis = {
      periodCycles: 1,
      horizonCycles: 1,
      lanes: [{ laneKey: 'd1', onsetsByCycle: [1] }],
      sections: [],
      reachedCap: false,
    }
    const scene = buildTimelineScene(analysis, marks({}, false, {}, {}, { d1: 0 }))
    expect(scene.lanes[0].displayName).toBe('d1')
  })

  it('merges the per-lane source offset for binding (null when absent)', () => {
    const scene = buildTimelineScene(analysisFixture, marks({}, false, { bd: 42 }))
    const bd = scene.lanes.find((l) => l.laneKey === 'bd')!
    const lead = scene.lanes.find((l) => l.laneKey === 'lead')!
    expect(bd.sourceOffset).toBe(42) // bound to source char offset 42
    expect(lead.sourceOffset).toBeNull() // no source provenance for this lane
  })

  it('leaves every lane source offset null when no marks were collected', () => {
    const scene = buildTimelineScene(analysisFixture)
    expect(scene.lanes.every((l) => l.sourceOffset === null)).toBe(true)
  })

  // ── Per-voice grouping (#424) ──────────────────────────────────────────────

  it('groups a lane’s marks into ordered voice sub-groups by sample name', () => {
    const scene = buildTimelineScene(
      analysisFixture,
      marks({
        // 'bd' lane carries a $: drum stack: distinct s per voice, percussive.
        bd: [
          { cycle: 0, end: 0.25, pitch: null, gain: 1, voice: 'bd' },
          { cycle: 0.5, end: 0.75, pitch: null, gain: 1, voice: 'hh' },
          { cycle: 1, end: 1.25, pitch: null, gain: 1, voice: 'bd' }, // bd again
          { cycle: 1.5, end: 1.75, pitch: null, gain: 1, voice: 'sd' },
        ],
      }),
    )
    const lane = scene.lanes.find((l) => l.laneKey === 'bd')!
    // First-seen order, deduped: bd, hh, sd.
    expect(lane.voices.map((v) => v.key)).toEqual(['bd', 'hh', 'sd'])
    expect(lane.voices.every((v) => !v.melodic)).toBe(true)
    expect(lane.voices.every((v) => v.pitchMin === null)).toBe(true)
  })

  it('marks a pitched voice melodic with its own pitch range', () => {
    const scene = buildTimelineScene(
      analysisFixture,
      marks({
        lead: [
          { cycle: 0, end: 0.5, pitch: 60, gain: 1, voice: 'square' },
          { cycle: 1, end: 1.5, pitch: 67, gain: 1, voice: 'square' },
        ],
      }),
    )
    const lane = scene.lanes.find((l) => l.laneKey === 'lead')!
    expect(lane.voices.length).toBe(1)
    expect(lane.voices[0]).toMatchObject({ key: 'square', melodic: true, pitchMin: 60, pitchMax: 67 })
  })

  it('pools marks with no sample name into a single voice', () => {
    const scene = buildTimelineScene(
      analysisFixture,
      marks({
        lead: [
          { cycle: 0, end: 0.5, pitch: 60, gain: 1 }, // no voice → NO_VOICE group
          { cycle: 1, end: 1.5, pitch: 64, gain: 1 },
        ],
      }),
    )
    const lane = scene.lanes.find((l) => l.laneKey === 'lead')!
    expect(lane.voices.length).toBe(1)
    expect(lane.voices[0].melodic).toBe(true)
  })

  it('gives a note-less lane an empty voices list', () => {
    const scene = buildTimelineScene(analysisFixture)
    expect(scene.lanes.every((l) => l.voices.length === 0)).toBe(true)
  })
})

// `collectNoteMarks` (timelineMarks.ts) needs the runtime `collectCycles` from
// `@stave/editor`, whose CJS `gifenc` dep breaks vitest's loader — so it isn't
// unit-tested here (importing it would pull the editor bundle into this suite).
// Its null-IR guard is trivial; the real collection path is covered by the
// Playwright spec against a real evaluated song.

describe('clips (#386)', () => {
  it('synthesises ONE implicit clip per bare track spanning the whole song', () => {
    const scene = buildTimelineScene(analysisFixture) // no clipsByLane
    for (const lane of scene.lanes) {
      expect(lane.clips).toEqual([
        { armIndex: -1, startCycle: 0, endCycle: 4, label: null },
      ])
    }
  })

  it('uses the derived per-arm clips when the track is an arrangement', () => {
    const bdClips: SceneClip[] = [
      { armIndex: 0, startCycle: 0, endCycle: 2, label: 'bd' },
      { armIndex: 1, startCycle: 2, endCycle: 4, label: 'sd' },
    ]
    const scene = buildTimelineScene(analysisFixture, marks({}, false, {}, { bd: bdClips }))
    const bd = scene.lanes.find((l) => l.laneKey === 'bd')!
    expect(bd.clips).toEqual(bdClips)
    // the other lane has no derived clips → still one implicit clip
    const lead = scene.lanes.find((l) => l.laneKey === 'lead')!
    expect(lead.clips).toEqual([{ armIndex: -1, startCycle: 0, endCycle: 4, label: null }])
  })
})

describe('clipAtCycle', () => {
  const lane = {
    clips: [
      { armIndex: 0, startCycle: 0, endCycle: 2, label: 'a' },
      { armIndex: 1, startCycle: 2, endCycle: 3, label: 'b' },
    ],
  } as unknown as SceneLane
  it('returns the clip whose [start, end) contains the cycle', () => {
    expect(clipAtCycle(lane, 0)?.armIndex).toBe(0)
    expect(clipAtCycle(lane, 1.9)?.armIndex).toBe(0)
    expect(clipAtCycle(lane, 2)?.armIndex).toBe(1) // boundary is exclusive on the left clip
    expect(clipAtCycle(lane, 2.5)?.armIndex).toBe(1)
  })
  it('returns null outside every clip', () => {
    expect(clipAtCycle(lane, 3)).toBeNull() // endCycle exclusive
    expect(clipAtCycle(lane, -1)).toBeNull()
  })
})

describe('eval-backed lanes (#864 / P1b)', () => {
  it('renders a lane for a marks key not present in the analysis, appended after IR lanes', () => {
    // `d2` is an eval-only lane (a signal/bare-ref track the IR analysis missed):
    // it appears in the marks but NOT in `analysisFixture.lanes` (bd, lead).
    const scene = buildTimelineScene(
      analysisFixture,
      marks({
        bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }],
        d2: [
          { cycle: 0, end: 0.5, pitch: 48, gain: 1 },
          { cycle: 0, end: 0.5, pitch: 52, gain: 1 },
          { cycle: 2, end: 2.5, pitch: 55, gain: 1 },
        ],
      }),
    )
    // IR lanes first (bd, lead), eval lane appended (d2).
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['bd', 'lead', 'd2'])
    const d2 = scene.lanes.find((l) => l.laneKey === 'd2')!
    // Density synthesised from the marks: 2 onsets in cycle 0, 1 in cycle 2.
    expect(d2.density).toEqual([2, 0, 1, 0])
    // Pitch range from its marks; a positional display name (no labelOffset).
    expect(d2.pitchMin).toBe(48)
    expect(d2.pitchMax).toBe(55)
    expect(d2.displayName).toBe('d2')
    // One implicit clip spanning the display span (no armIndex on eval marks).
    expect(d2.clips).toEqual([{ armIndex: -1, startCycle: 0, endCycle: 4, label: null }])
  })

  it('folds eval-lane density into peakDensity', () => {
    const scene = buildTimelineScene(
      analysisFixture, // IR peak is 3 (bd cell)
      marks({
        d2: [
          { cycle: 1, end: 1.5, pitch: 60, gain: 1 },
          { cycle: 1, end: 1.5, pitch: 62, gain: 1 },
          { cycle: 1, end: 1.5, pitch: 64, gain: 1 },
          { cycle: 1, end: 1.5, pitch: 65, gain: 1 }, // 4 onsets in cycle 1
        ],
      }),
    )
    expect(scene.peakDensity).toBe(4) // eval lane's busiest cell beats the IR peak
  })

  it('adds no lanes when every marks key is an IR lane (no regression)', () => {
    const scene = buildTimelineScene(
      analysisFixture,
      marks({ bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }] }),
    )
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['bd', 'lead'])
  })
})

describe('source lane order (#871)', () => {
  // An eval-only lane (`sig`) written BEFORE the IR-backed lanes. Without a
  // source order the scene can only append it after them (the default above).
  const evalFirst = () =>
    marks({
      sig: [{ cycle: 0, end: 0.5, pitch: 48, gain: 1 }],
      bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }],
      lead: [{ cycle: 0, end: 0.5, pitch: 60, gain: 1 }],
    })

  const keys = (analysis: SongAnalysis, order?: readonly string[]) =>
    buildTimelineScene(analysis, evalFirst(), undefined, undefined, undefined, order).lanes.map(
      (l) => l.laneKey,
    )

  it('ranks an eval lane INTO source order, not after the IR lanes', () => {
    expect(keys(analysisFixture, ['sig', 'bd', 'lead'])).toEqual(['sig', 'bd', 'lead'])
  })

  it('places the eval lane between IR lanes when that is where it was written', () => {
    expect(keys(analysisFixture, ['bd', 'sig', 'lead'])).toEqual(['bd', 'sig', 'lead'])
  })

  it('leaves an IR-only song untouched (its analysis order already follows the IR)', () => {
    const irOnly = marks({ bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }] })
    const scene = buildTimelineScene(analysisFixture, irOnly, undefined, undefined, undefined, [
      'bd',
      'lead',
    ])
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['bd', 'lead'])
  })

  it('falls back to the appended order when there is no source order', () => {
    expect(keys(analysisFixture)).toEqual(['bd', 'lead', 'sig'])
    expect(keys(analysisFixture, [])).toEqual(['bd', 'lead', 'sig'])
  })

  it('keeps a lane the order does not mention (no source position) at the end', () => {
    // `lead` is absent from the track list — it keeps its relative place last
    // rather than being dropped or guessed at.
    expect(keys(analysisFixture, ['sig', 'bd'])).toEqual(['sig', 'bd', 'lead'])
  })
})

describe('declared-but-silent lanes (#1098)', () => {
  // A track the DOCUMENT declares that produced no analysis events AND no eval
  // marks. The everyday case is a MUTED track: Strudel refuses a `_`-prefixed
  // registration, so it emits no haps by design and both evaluated row sources
  // are correctly empty. Without a structural row source it has no row at all —
  // it vanishes rather than fading, and nothing raises.
  const irMarks = () =>
    marks({
      bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }],
      lead: [{ cycle: 0, end: 0.5, pitch: 60, gain: 1 }],
    })

  const keysWithOrder = (order?: readonly string[], m: CollectedMarks = irMarks()) =>
    buildTimelineScene(analysisFixture, m, undefined, undefined, undefined, order).lanes.map(
      (l) => l.laneKey,
    )

  it('gives a declared track with no events and no marks its own row', () => {
    // `mute` is declared between the two sounding tracks and produces nothing.
    expect(keysWithOrder(['bd', 'mute', 'lead'])).toEqual(['bd', 'mute', 'lead'])
  })

  it('places the silent row where it was WRITTEN, first or last', () => {
    expect(keysWithOrder(['mute', 'bd', 'lead'])).toEqual(['mute', 'bd', 'lead'])
    expect(keysWithOrder(['bd', 'lead', 'mute'])).toEqual(['bd', 'lead', 'mute'])
  })

  it('draws EVERY declared track when the whole document is silent', () => {
    // The all-muted document. Pre-#1098 this rendered the "no song" empty state
    // over tracks the user had actually written.
    const silent: SongAnalysis = { ...analysisFixture, lanes: [], sections: [] }
    const scene = buildTimelineScene(
      silent,
      marks({}),
      undefined,
      undefined,
      undefined,
      ['d1', 'd2'],
    )
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['d1', 'd2'])
  })

  it('builds the silent row as present-and-empty, not degenerate', () => {
    const scene = buildTimelineScene(
      analysisFixture,
      irMarks(),
      undefined,
      undefined,
      undefined,
      ['bd', 'mute', 'lead'],
    )
    const lane = scene.lanes.find((l) => l.laneKey === 'mute') as SceneLane
    expect(lane).toBeDefined()
    // One density bucket per displayed cycle, all zero — the same length rule
    // the eval lanes follow, so the canvas draws a row with no bars.
    expect(lane.density).toEqual([0, 0, 0, 0])
    expect(lane.density.length).toBe(scene.displayCycles)
    expect(lane.notes).toEqual([])
    expect(lane.voices).toEqual([])
    expect(lane.pitchMin).toBeNull()
    expect(lane.pitchMax).toBeNull()
    // Every lane has >= 1 clip; with no clips of its own it gets the whole-song
    // implicit one, so clip hit-testing and geometry behave normally.
    expect(lane.clips).toEqual([
      { armIndex: -1, startCycle: 0, endCycle: 4, label: null },
    ])
  })

  it('does not disturb the peak density', () => {
    const withSilent = buildTimelineScene(
      analysisFixture,
      irMarks(),
      undefined,
      undefined,
      undefined,
      ['bd', 'mute', 'lead'],
    )
    const without = buildTimelineScene(analysisFixture, irMarks(), undefined, undefined, undefined, [
      'bd',
      'lead',
    ])
    expect(withSilent.peakDensity).toBe(without.peakDensity)
    expect(withSilent.peakDensity).toBe(3)
  })

  it('resolves a MUTED named track to its bare display name', () => {
    // `_bass:` at offset 0 — identity is already mute-invariant (`bass`), and the
    // display deriver strips the marker too, so the silent row reads `bass`.
    const code = '_bass: s("e1*2")\nbd: s("bd*4")'
    const scene = buildTimelineScene(
      analysisFixture,
      marks({ bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }] }, false, {}, {}, {}, { bass: 0 }),
      undefined,
      code,
      undefined,
      ['bass', 'bd', 'lead'],
    )
    const lane = scene.lanes.find((l) => l.laneKey === 'bass') as SceneLane
    expect(lane).toBeDefined()
    expect(lane.displayName).toBe('bass')
    expect(lane.labelOffset).toBe(0)
  })

  // ── The rows this must NOT add ──────────────────────────────────────────────
  // These are controls: the same code path, asked about tracks that already have
  // a row. A duplicate row is the failure mode a freely-chosen key produces, and
  // it is worse than a missing one — the user sees the track twice.

  it('does not duplicate a track that already has an ANALYSIS lane', () => {
    expect(keysWithOrder(['bd', 'lead'])).toEqual(['bd', 'lead'])
  })

  it('does not duplicate a track that already has an EVAL-marks lane', () => {
    // `sig` is eval-backed only (no analysis lane) AND declared. One row.
    const m = marks({
      sig: [{ cycle: 0, end: 0.5, pitch: 48, gain: 1 }],
      bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }],
      lead: [{ cycle: 0, end: 0.5, pitch: 60, gain: 1 }],
    })
    expect(keysWithOrder(['sig', 'bd', 'lead'], m)).toEqual(['sig', 'bd', 'lead'])
  })

  it('does NOT let a marks ANNOTATION create a row (no phantom lanes)', () => {
    // The row source is the document's track list, deliberately NOT the marks
    // annotation maps. Those additionally carry lanes the RESILIENT structural
    // walk reaches on mid-edit/invalid code, plus zero-event containment-anchor
    // seeds — none of which is a statement the user wrote. `collectNoteMarks`
    // states that annotate-only rule; this pins it from the consumer's side,
    // where a future change of row source would otherwise land silently.
    // `ghost` has a label offset, a source offset and a clip, but no marks and
    // no place in the track list → no row.
    const annotated = marks(
      { bd: [{ cycle: 0, end: 0.5, pitch: null, gain: 1 }] },
      false,
      { ghost: 12 },
      { ghost: [{ armIndex: 0, startCycle: 0, endCycle: 2, label: 'A' }] },
      { ghost: 12 },
      { ghost: 12 },
    )
    const scene = buildTimelineScene(analysisFixture, annotated, undefined, undefined, undefined, [
      'bd',
      'lead',
    ])
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['bd', 'lead'])
  })

  it('adds nothing when a row is keyed by a name the IR does not use', () => {
    // REGRESSION ARM. `$: s("bd*4").p('kick')` draws its row under `kick` — the
    // producer id — while the IR calls that statement `d1`, because `.p()` is a
    // chain method and not the statement's label. Observed in the browser: one
    // declared track, one drawn row, two different names. A plain key difference
    // reads `d1` as unrepresented and invents a SECOND row for the same track,
    // which is worse than the missing row this whole block exists to fix.
    const oneTrackNamedByProducer: SongAnalysis = {
      periodCycles: 1,
      horizonCycles: 1,
      reachedCap: false,
      lanes: [{ laneKey: 'kick', onsetsByCycle: [4] }],
      sections: [],
    }
    const scene = buildTimelineScene(
      oneTrackNamedByProducer,
      marks({ kick: [{ cycle: 0, end: 0.25, pitch: null, gain: 1 }] }),
      undefined,
      undefined,
      undefined,
      ['d1'],
    )
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['kick'])
  })

  it('still fills a display that is genuinely SHORT of the document', () => {
    // The pigeonhole only withholds rows when the display is already as wide as
    // the document. Two rows drawn, four tracks declared → the two unrepresented
    // statements are still added, so the guard cannot silently swallow the fix.
    expect(keysWithOrder(['bd', 'lead', 'mute1', 'mute2'])).toEqual([
      'bd',
      'lead',
      'mute1',
      'mute2',
    ])
  })

  it('adds nothing when no track list is given', () => {
    // The pre-#1098 contract: absent/empty order → rows come from evaluated
    // output alone. Guards the fallback every non-Strudel caller relies on.
    expect(keysWithOrder(undefined)).toEqual(['bd', 'lead'])
    expect(keysWithOrder([])).toEqual(['bd', 'lead'])
  })

  it('adds nothing for a bare document whose one row is eval-backed (#1094)', () => {
    // The bare-capture key (`$0`) is mapped onto the positional `d1` before it
    // reaches the marks, and the IR's single Track node is `d1` too. The two
    // halves agree, so the structural source finds it already drawn — ONE row.
    const bare: SongAnalysis = { periodCycles: 1, horizonCycles: 1, reachedCap: false, lanes: [], sections: [] }
    const scene = buildTimelineScene(
      bare,
      marks({ d1: [{ cycle: 0, end: 0.25, pitch: null, gain: 1 }] }),
      undefined,
      undefined,
      undefined,
      ['d1'],
    )
    expect(scene.lanes.map((l) => l.laneKey)).toEqual(['d1'])
  })
})
