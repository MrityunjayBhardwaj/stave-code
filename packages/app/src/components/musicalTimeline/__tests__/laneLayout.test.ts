import { describe, it, expect } from 'vitest'
import { computeLaneLayout, laneAtY } from '../laneLayout'

const lanes = [{ laneKey: 'bd' }, { laneKey: 'lead' }, { laneKey: 'bass' }]

describe('computeLaneLayout', () => {
  it('stacks uniform rows when nothing is expanded', () => {
    const layout = computeLaneLayout(lanes, new Set(), 22, 88)
    expect(layout.boxes.map((b) => b.top)).toEqual([0, 22, 44])
    expect(layout.boxes.every((b) => b.height === 22)).toBe(true)
    expect(layout.boxes.every((b) => !b.expanded)).toBe(true)
    expect(layout.totalHeight).toBe(66)
  })

  it('gives an expanded lane the bigger height and pushes the lanes below it down', () => {
    const layout = computeLaneLayout(lanes, new Set(['lead']), 22, 88)
    expect(layout.boxes[0]).toMatchObject({ laneKey: 'bd', top: 0, height: 22, expanded: false })
    expect(layout.boxes[1]).toMatchObject({ laneKey: 'lead', top: 22, height: 88, expanded: true })
    // 'bass' starts after the tall 'lead' row (22 + 88), not at 44.
    expect(layout.boxes[2]).toMatchObject({ laneKey: 'bass', top: 110, height: 22 })
    expect(layout.totalHeight).toBe(132)
  })

  it('supports multi-expand (cross-track alignment)', () => {
    const layout = computeLaneLayout(lanes, new Set(['bd', 'bass']), 22, 88)
    expect(layout.boxes.map((b) => b.height)).toEqual([88, 22, 88])
    expect(layout.totalHeight).toBe(198)
  })

  it('preserves lane order so boxes line up with scene.lanes and the labels', () => {
    const layout = computeLaneLayout(lanes, new Set(['lead']), 22, 88)
    expect(layout.boxes.map((b) => b.laneKey)).toEqual(['bd', 'lead', 'bass'])
  })

  it('floors degenerate heights to 0 instead of producing NaN geometry', () => {
    const layout = computeLaneLayout(lanes, new Set(), Number.NaN, 50)
    expect(layout.totalHeight).toBe(0)
    expect(layout.boxes.every((b) => b.top === 0 && b.height === 0)).toBe(true)
  })

  it('falls back to the base height when expandedHeight is not larger', () => {
    const layout = computeLaneLayout(lanes, new Set(['lead']), 22, 10)
    expect(layout.boxes[1].height).toBe(22) // 10 < 22 → no shrink
  })
})

describe('laneAtY', () => {
  const layout = computeLaneLayout(lanes, new Set(['lead']), 22, 88)
  // boxes: bd [0,22), lead [22,110), bass [110,132)

  it('maps a y inside a box to that lane', () => {
    expect(laneAtY(layout, 0)).toBe('bd')
    expect(laneAtY(layout, 21)).toBe('bd')
    expect(laneAtY(layout, 22)).toBe('lead') // top edge inclusive
    expect(laneAtY(layout, 100)).toBe('lead')
    expect(laneAtY(layout, 110)).toBe('bass') // exclusive bottom of lead
    expect(laneAtY(layout, 131)).toBe('bass')
  })

  it('returns null above the first box and below the last', () => {
    expect(laneAtY(layout, -1)).toBeNull()
    expect(laneAtY(layout, 132)).toBeNull()
    expect(laneAtY(layout, 9999)).toBeNull()
  })

  it('returns null for a non-finite y', () => {
    expect(laneAtY(layout, Number.NaN)).toBeNull()
  })

  it('returns null when there are no lanes', () => {
    expect(laneAtY(computeLaneLayout([], new Set(), 22, 88), 5)).toBeNull()
  })
})

describe('computeLaneLayout — per-voice sub-rows (#424)', () => {
  const v = (key: string, melodic = false) => ({ key, label: key, melodic })
  const drums = [
    { laneKey: 'drums', voices: [v('bd'), v('sd'), v('hh')] },
    { laneKey: 'lead', voices: [v('square', true)] },
  ]

  it('splits an EXPANDED lane with ≥2 voices into per-voice sub-rows', () => {
    const layout = computeLaneLayout(drums, new Set(['drums']), 22, 96, 20)
    const box = layout.boxes[0]
    expect(box.height).toBe(60) // 3 voices × 20
    expect(box.subRows?.map((s) => s.voiceKey)).toEqual(['bd', 'sd', 'hh'])
    // Sub-rows stack from the lane top in absolute content space, no gaps.
    expect(box.subRows?.map((s) => s.top)).toEqual([0, 20, 40])
    expect(box.subRows?.every((s) => s.height === 20)).toBe(true)
    // 'lead' (single voice) follows the 60px drum lane.
    expect(layout.boxes[1].top).toBe(60)
  })

  it('carries the voice label + melodic flag onto each sub-row', () => {
    const layout = computeLaneLayout(
      [{ laneKey: 'mix', voices: [v('bd'), v('square', true)] }],
      new Set(['mix']),
      22,
      96,
      20,
    )
    const sub = layout.boxes[0].subRows!
    expect(sub[0]).toMatchObject({ voiceKey: 'bd', label: 'bd', melodic: false })
    expect(sub[1]).toMatchObject({ voiceKey: 'square', label: 'square', melodic: true })
  })

  it('keeps a single MELODIC voice as ONE band that SCALES with the sub-row setting (#647)', () => {
    const layout = computeLaneLayout(drums, new Set(['lead']), 22, 96, 20)
    const lead = layout.boxes[1] // voices: [square (melodic)]
    expect(lead.height).toBe(80) // 4 melodic rows × 20, NOT the fixed 96 band
    expect(lead.subRows).toBeUndefined()
    // …and it tracks the slider: a bigger sub-row → a taller band.
    const taller = computeLaneLayout(drums, new Set(['lead']), 22, 96, 40)
    expect(taller.boxes[1].height).toBe(160) // 4 × 40
  })

  it('gives a single PERCUSSIVE voice a single baseline row that scales (#647)', () => {
    const perc = [{ laneKey: 'kick', voices: [v('bd')] }] // not melodic
    const layout = computeLaneLayout(perc, new Set(['kick']), 22, 96, 20)
    expect(layout.boxes[0].height).toBe(20) // 1 × subRowHeight
    expect(layout.boxes[0].subRows).toBeUndefined()
  })

  it('does not split a COLLAPSED multi-voice lane', () => {
    const layout = computeLaneLayout(drums, new Set(), 22, 96, 20)
    expect(layout.boxes[0].height).toBe(22)
    expect(layout.boxes[0].subRows).toBeUndefined()
  })

  it('falls back to the single band when subRowHeight is degenerate', () => {
    const layout = computeLaneLayout(drums, new Set(['drums']), 22, 96, 0)
    expect(layout.boxes[0].height).toBe(96)
    expect(layout.boxes[0].subRows).toBeUndefined()
  })
})
