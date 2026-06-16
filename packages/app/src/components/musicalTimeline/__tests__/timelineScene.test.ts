import { describe, it, expect } from 'vitest'
import type { SongAnalysis } from '@stave/editor'
import { buildTimelineScene, type SceneNote, type CollectedMarks } from '../timelineScene'

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
): CollectedMarks {
  return {
    marksByLane: new Map(Object.entries(entries)),
    sourceByLane: new Map(Object.entries(sources)),
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
