/**
 * #1730 — a lane whose every sound is a file draws as an audio track when
 * collapsed. Two pure pieces: `markAudioLanes` decides WHICH lanes, and
 * `laneMarkBands` gives such a lane's collapsed band its whole height. The pixels
 * are read back off the real canvas in `take-waveform.spec.ts`.
 */
import { describe, it, expect } from 'vitest'
import { laneMarkBands, markRect } from '../drawTimeline'
import { computeLaneLayout } from '../laneLayout'
import { markAudioLanes, markBarsLanes, NO_VOICE, type TimelineScene, type SceneNote } from '../timelineScene'

function sceneOf(notes: SceneNote[], pitchMin: number | null = null, pitchMax: number | null = null): TimelineScene {
  return {
    lanes: [
      {
        laneKey: 'a',
        displayName: 'a',
        color: '#f00',
        density: [1, 1],
        notes,
        pitchMin,
        pitchMax,
        voices: [],
        clips: [{ armIndex: -1, startCycle: 0, endCycle: 2, label: null, nameRange: null, sectionName: '' }],
        sourceOffset: null,
        arrangeOffset: null,
        labelOffset: null,
        automations: [],
        stepped: [],
      },
    ],
    sections: [],
    displayCycles: 2,
    windowOriginCycles: 0,
    period: null,
    peakDensity: 1,
    notesCapped: false,
  }
}

/** The registry, as a set of names that are files. */
const files = (...names: string[]) => (voice: string) => names.includes(voice)

describe('markAudioLanes — which lanes are audio tracks (#1730)', () => {
  it('a lane whose every mark plays a file is an audio lane', () => {
    const scene = sceneOf([
      { cycle: 0, end: 1, pitch: null, gain: 1, voice: 'take_1' },
      { cycle: 1, end: 2, pitch: 62, gain: 1, voice: 'casio' },
    ])
    expect(markAudioLanes(scene, files('take_1', 'casio')).lanes[0].audio).toBe(true)
  })

  it('one synth note on the lane keeps the ordinary row', () => {
    const scene = sceneOf([
      { cycle: 0, end: 1, pitch: null, gain: 1, voice: 'take_1' },
      { cycle: 1, end: 2, pitch: 48, gain: 1, voice: 'sawtooth' },
    ])
    expect(markAudioLanes(scene, files('take_1')).lanes[0].audio ?? false).toBe(false)
  })

  it('a note with no sound name is not a file', () => {
    const scene = sceneOf([{ cycle: 0, end: 1, pitch: 60, gain: 1, voice: NO_VOICE }])
    expect(markAudioLanes(scene, () => true).lanes[0].audio ?? false).toBe(false)
  })

  it('a lane with no marks is not an audio lane', () => {
    expect(markAudioLanes(sceneOf([]), () => true).lanes[0].audio ?? false).toBe(false)
  })

  it('without a registry nothing changes, and an unchanged answer keeps the scene', () => {
    const scene = sceneOf([{ cycle: 0, end: 1, pitch: null, gain: 1, voice: 'take_1' }])
    expect(markAudioLanes(scene, undefined)).toBe(scene)
    const once = markAudioLanes(scene, files('take_1'))
    expect(markAudioLanes(once, files('take_1'))).toBe(once)
  })
})

describe('laneMarkBands — an audio lane in overview (#1730)', () => {
  const take: SceneNote[] = [
    { cycle: 0, end: 1, pitch: 60, gain: 1, voice: 'casio' },
    { cycle: 1, end: 2, pitch: 72, gain: 1, voice: 'casio' },
  ]
  const ROW = 25

  function bands(audio: boolean, expanded: boolean) {
    const scene = markAudioLanes(sceneOf(take, 60, 72), audio ? files('casio') : files())
    const layout = computeLaneLayout(scene.lanes, new Set(expanded ? ['a'] : []), ROW, 100, ROW)
    const box = layout.boxes[0]
    const band = laneMarkBands(scene.lanes[0], box)[0]
    const rects = take.map((n) => markRect(n, band, 100, 400, 0, 2, (c) => c * 100)!)
    return { box, band, rects }
  }

  it('collapsed: every mark fills the row, at the same height whatever its pitch', () => {
    const { box, rects } = bands(true, false)
    for (const r of rects) {
      expect(r.y).toBe(box.top + 3)
      expect(r.h).toBe(ROW - 6)
    }
  })

  it('the same lane NOT playing files keeps the pitch contour — the control', () => {
    const { rects } = bands(false, false)
    expect(rects[0].h).toBeLessThan(ROW / 2)
    expect(rects[0].y).not.toBe(rects[1].y)
  })

  it('expanded: the editing view is untouched, audio lane or not', () => {
    const audio = bands(true, true)
    const plain = bands(false, true)
    expect(audio.band).toEqual(plain.band)
  })
})

describe('markBarsLanes — a track set to Bars (#1738)', () => {
  const take: SceneNote[] = [{ cycle: 0, end: 1, pitch: null, gain: 1, voice: 'take_1' }]

  it('marks the lane whose display name is set to Bars', () => {
    expect(markBarsLanes(sceneOf(take), new Set(['a'])).lanes[0].bars).toBe(true)
  })

  it('returns the SAME scene when no lane is set to Bars', () => {
    const scene = sceneOf(take)
    expect(markBarsLanes(scene, new Set())).toBe(scene)
    expect(markBarsLanes(scene, new Set(['other']))).toBe(scene)
  })

  it('a lane set to Bars is never an audio lane, even when every mark is a file', () => {
    const bars = markBarsLanes(sceneOf(take), new Set(['a']))
    expect(markAudioLanes(bars, files('take_1')).lanes[0].audio ?? false).toBe(false)
    // CONTROL — the same lane unset is one.
    expect(markAudioLanes(sceneOf(take), files('take_1')).lanes[0].audio).toBe(true)
  })
})
