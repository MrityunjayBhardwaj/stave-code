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

function marks(entries: Record<string, SceneNote[]>, capped = false): CollectedMarks {
  return { marksByLane: new Map(Object.entries(entries)), capped }
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
        bd: [{ cycle: 0, pitch: null, gain: 1 }], // percussive → no pitch range
        lead: [
          { cycle: 0, pitch: 60, gain: 0.5 },
          { cycle: 1, pitch: 72, gain: 1 },
          { cycle: 2, pitch: 64, gain: 0.8 },
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
    const scene = buildTimelineScene(analysisFixture, marks({ bd: [{ cycle: 0, pitch: null, gain: 1 }] }))
    expect(typeof scene.lanes[0].color).toBe('string')
    expect(scene.lanes[0].color.length).toBeGreaterThan(0)
    const lead = scene.lanes.find((l) => l.laneKey === 'lead')!
    expect(lead.notes).toEqual([]) // no marks supplied for this lane
  })

  it('propagates the capped flag', () => {
    const scene = buildTimelineScene(analysisFixture, marks({ bd: [] }, true))
    expect(scene.notesCapped).toBe(true)
  })
})

// `collectNoteMarks` (timelineMarks.ts) needs the runtime `collectCycles` from
// `@stave/editor`, whose CJS `gifenc` dep breaks vitest's loader — so it isn't
// unit-tested here (importing it would pull the editor bundle into this suite).
// Its null-IR guard is trivial; the real collection path is covered by the
// Playwright spec against a real evaluated song.
