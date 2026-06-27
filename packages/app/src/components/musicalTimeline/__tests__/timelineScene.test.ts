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
