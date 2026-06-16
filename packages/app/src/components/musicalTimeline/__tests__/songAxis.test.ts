import { describe, it, expect } from 'vitest'
import {
  songCycleToX,
  xToSongCycle,
  wrapSongPosition,
  clampZoom,
  contentWidthFor,
  scrollLeftForZoom,
  rulerTicks,
  MIN_ZOOM,
  MAX_ZOOM,
  BEATS_PER_BAR,
} from '../songAxis'

describe('songCycleToX', () => {
  it('maps a cycle linearly across the width', () => {
    expect(songCycleToX(0, 8, 800)).toBe(0)
    expect(songCycleToX(4, 8, 800)).toBe(400)
    expect(songCycleToX(8, 8, 800)).toBe(800)
  })

  it('clamps out-of-range cycles to the edges', () => {
    expect(songCycleToX(-2, 8, 800)).toBe(0)
    expect(songCycleToX(20, 8, 800)).toBe(800)
  })

  it('returns 0 for degenerate inputs', () => {
    expect(songCycleToX(null, 8, 800)).toBe(0)
    expect(songCycleToX(4, 0, 800)).toBe(0)
    expect(songCycleToX(4, 8, 0)).toBe(0)
    expect(songCycleToX(Number.NaN, 8, 800)).toBe(0)
  })
})

describe('xToSongCycle', () => {
  it('inverts songCycleToX', () => {
    expect(xToSongCycle(0, 8, 800)).toBe(0)
    expect(xToSongCycle(400, 8, 800)).toBeCloseTo(4)
  })

  it('clamps x to the canvas and keeps the result below displayCycles', () => {
    expect(xToSongCycle(-50, 8, 800)).toBe(0)
    // far edge → just below 8 (so it seeks the last cycle, not a wrap to 0)
    const atEdge = xToSongCycle(800, 8, 800)
    expect(atEdge).toBeLessThan(8)
    expect(atEdge).toBeGreaterThan(7.9)
  })

  it('returns 0 for degenerate inputs', () => {
    expect(xToSongCycle(100, 0, 800)).toBe(0)
    expect(xToSongCycle(100, 8, 0)).toBe(0)
  })

  it('round-trips a mid cycle through both directions', () => {
    const x = songCycleToX(3, 8, 800)
    expect(xToSongCycle(x, 8, 800)).toBeCloseTo(3)
  })
})

describe('wrapSongPosition', () => {
  it('wraps a position past the loop length back into [0, displayCycles)', () => {
    expect(wrapSongPosition(2, 8)).toBe(2)
    expect(wrapSongPosition(10, 8)).toBe(2)
    expect(wrapSongPosition(8, 8)).toBe(0)
  })

  it('handles negative positions', () => {
    expect(wrapSongPosition(-1, 8)).toBe(7)
  })

  it('returns null for null / non-finite / degenerate', () => {
    expect(wrapSongPosition(null, 8)).toBeNull()
    expect(wrapSongPosition(Number.NaN, 8)).toBeNull()
    expect(wrapSongPosition(4, 0)).toBeNull()
  })
})

describe('clampZoom', () => {
  it('clamps to [MIN_ZOOM, MAX_ZOOM]', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM)
    expect(clampZoom(1000)).toBe(MAX_ZOOM)
    expect(clampZoom(4)).toBe(4)
  })
  it('falls back to MIN_ZOOM for non-finite (incl. infinity)', () => {
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MIN_ZOOM)
  })
})

describe('contentWidthFor', () => {
  it('returns the viewport width at zoom 1 and widens proportionally', () => {
    expect(contentWidthFor(800, 1)).toBe(800)
    expect(contentWidthFor(800, 2)).toBe(1600)
  })
  it('never shrinks below the viewport, and degenerates to 0', () => {
    expect(contentWidthFor(800, 0.5)).toBe(800)
    expect(contentWidthFor(0, 4)).toBe(0)
  })
})

describe('scrollLeftForZoom (cursor-centered)', () => {
  it('keeps the content point under the cursor pinned when zooming in', () => {
    // viewport 800, at zoom 1 the cursor at x=400 sits over content x=400.
    // Zoom to 2 → that content point is now at 800; to keep it under x=400 we
    // scroll to 800 - 400 = 400.
    const next = scrollLeftForZoom({
      oldZoom: 1,
      newZoom: 2,
      scrollLeft: 0,
      cursorX: 400,
      viewportWidth: 800,
    })
    expect(next).toBe(400)
  })
  it('clamps to the scrollable range', () => {
    // far-right cursor zooming in would push past max scroll → clamp.
    const next = scrollLeftForZoom({
      oldZoom: 1,
      newZoom: 2,
      scrollLeft: 0,
      cursorX: 800,
      viewportWidth: 800,
    })
    expect(next).toBe(800) // maxScroll = 800*2 - 800
  })
  it('never goes negative and handles degenerate inputs', () => {
    expect(
      scrollLeftForZoom({ oldZoom: 2, newZoom: 1, scrollLeft: 0, cursorX: 0, viewportWidth: 800 }),
    ).toBe(0)
    expect(
      scrollLeftForZoom({ oldZoom: 1, newZoom: 2, scrollLeft: 0, cursorX: 400, viewportWidth: 0 }),
    ).toBe(0)
  })
})

describe('rulerTicks', () => {
  it('emits a 0-indexed major per cycle when there is room (CYCLES)', () => {
    const ticks = rulerTicks(4, 200, 'cycles')
    expect(ticks.map((t) => t.label)).toEqual(['0', '1', '2', '3'])
    expect(ticks.every((t) => t.major)).toBe(true)
  })
  it('uses 1-indexed bar labels and adds beat ticks when zoomed in (BARS)', () => {
    const ticks = rulerTicks(2, 200, 'bars') // 200px/cycle → 50px/beat ≥ 14
    const majors = ticks.filter((t) => t.major)
    expect(majors.map((t) => t.label)).toEqual(['1', '2'])
    const beats = ticks.filter((t) => !t.major)
    // 2 bars × (BEATS_PER_BAR - 1) interior beat ticks
    expect(beats.length).toBe(2 * (BEATS_PER_BAR - 1))
    expect(beats.map((t) => t.cycle)).toContain(0.25)
    expect(beats.every((t) => t.label === null)).toBe(true)
  })
  it('drops beat ticks when each beat is too narrow', () => {
    const ticks = rulerTicks(2, 40, 'bars') // 40/4 = 10px/beat < 14 → no beats
    expect(ticks.every((t) => t.major)).toBe(true)
  })
  it('thins majors by powers of two when zoomed out', () => {
    // 64 cycles across 800px → 12.5px/cycle; step doubles until ≥40 → step 4.
    const ticks = rulerTicks(64, 12.5, 'cycles')
    expect(ticks.map((t) => t.cycle)).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60])
  })
  it('returns [] for degenerate inputs', () => {
    expect(rulerTicks(0, 100, 'cycles')).toEqual([])
    expect(rulerTicks(4, 0, 'cycles')).toEqual([])
    expect(rulerTicks(4, Number.NaN, 'cycles')).toEqual([])
  })
})
