import { describe, it, expect } from 'vitest'

import {
  DIVISIONS,
  DEFAULT_DIVISION,
  stepsPerBar,
  snapInterval,
  isRepresentable,
  snapColumn,
} from '../division'

describe('division catalogue (#432 Slice 2)', () => {
  it('defaults to the native grid (no extra snap)', () => {
    expect(DEFAULT_DIVISION).toBe('grid')
    expect(DIVISIONS[0].value).toBe('grid')
    expect(DIVISIONS[0].notesPerBar).toBeNull()
  })
  it('uses 4/4 notes-per-bar for each musical division', () => {
    const byValue = Object.fromEntries(DIVISIONS.map((d) => [d.value, d.notesPerBar]))
    expect(byValue['1/4']).toBe(4)
    expect(byValue['1/8']).toBe(8)
    expect(byValue['1/16']).toBe(16)
    expect(byValue['1/8T']).toBe(12) // a quarter = 3 eighth-triplets → 4×3
    expect(byValue['1/16T']).toBe(24) // an eighth = 3 sixteenth-triplets → 8×3
  })
})

describe('stepsPerBar', () => {
  it('divides total steps by bars', () => {
    expect(stepsPerBar(16, 1)).toBe(16)
    expect(stepsPerBar(32, 2)).toBe(16)
    expect(stepsPerBar(12, 1)).toBe(12)
  })
  it('treats a missing/zero bar count as one bar', () => {
    expect(stepsPerBar(8)).toBe(8)
    expect(stepsPerBar(8, 0)).toBe(8)
  })
})

describe('snapInterval — interval = stepsPerBar / notesPerBar (whole ≥1 only)', () => {
  it('snaps a 16-step bar to representable straight divisions', () => {
    expect(snapInterval(16, '1/4')).toBe(4)
    expect(snapInterval(16, '1/8')).toBe(2)
    expect(snapInterval(16, '1/16')).toBe(1)
  })
  it('returns null for divisions finer than the grid', () => {
    expect(snapInterval(8, '1/16')).toBeNull() // 8/16 = 0.5 → sub-cell
    expect(snapInterval(4, '1/8')).toBeNull() // 4/8 = 0.5
  })
  it('returns null for triplets on a straight (power-of-two) grid', () => {
    expect(snapInterval(16, '1/8T')).toBeNull() // 16/12 = 1.33…
    expect(snapInterval(16, '1/16T')).toBeNull()
  })
  it('snaps triplets on a triplet grid', () => {
    expect(snapInterval(12, '1/8T')).toBe(1) // 12/12
    expect(snapInterval(24, '1/8T')).toBe(2) // 24/12
    expect(snapInterval(24, '1/16T')).toBe(1) // 24/24
  })
  it('returns null for the native grid sentinel', () => {
    expect(snapInterval(16, 'grid')).toBeNull()
  })
  it('returns null for a degenerate (≤0) bar', () => {
    expect(snapInterval(0, '1/4')).toBeNull()
  })
})

describe('isRepresentable', () => {
  it('always allows the native grid', () => {
    expect(isRepresentable(16, 'grid')).toBe(true)
    expect(isRepresentable(7, 'grid')).toBe(true)
  })
  it('mirrors snapInterval for musical divisions', () => {
    expect(isRepresentable(16, '1/8')).toBe(true)
    expect(isRepresentable(16, '1/8T')).toBe(false)
    expect(isRepresentable(12, '1/8T')).toBe(true)
  })
})

describe('snapColumn — round to the nearest division line', () => {
  it('snaps to the nearest multiple of the interval', () => {
    expect(snapColumn(5, 4)).toBe(4) // round(1.25) = 1 → 4
    expect(snapColumn(6, 4)).toBe(8) // round(1.5) = 2 → 8
    expect(snapColumn(2, 4)).toBe(4) // round(0.5) = 1 → 4
    expect(snapColumn(1, 4)).toBe(0) // round(0.25) = 0
  })
  it('is identity when there is no snap (null or unit interval)', () => {
    expect(snapColumn(5, null)).toBe(5)
    expect(snapColumn(5, 1)).toBe(5)
    expect(snapColumn(5, 0)).toBe(5)
  })
})
