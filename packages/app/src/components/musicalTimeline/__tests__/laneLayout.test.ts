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
