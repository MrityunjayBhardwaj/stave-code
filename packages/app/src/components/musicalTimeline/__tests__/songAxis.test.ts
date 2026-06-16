import { describe, it, expect } from 'vitest'
import {
  songCycleToX,
  xToSongCycle,
  wrapSongPosition,
  clampZoom,
  contentWidthFor,
  scrollLeftForZoom,
  followScrollLeft,
  rulerTicks,
  MIN_ZOOM,
  MAX_ZOOM,
  BEATS_PER_BAR,
  MAX_TICKS,
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

describe('followScrollLeft', () => {
  // viewport 800, content 1600 (zoom 2) → maxScroll 800. Default band = middle
  // 60% → in-band span of viewport-x is [160, 640].
  it('returns the current offset unchanged when the playhead is in-band (no churn)', () => {
    // playhead content-x 800, scrollLeft 400 → viewport-x 400 (dead centre).
    expect(followScrollLeft(800, 800, 1600, 400)).toBe(400)
    // viewport-x 640 (right band edge) is still in-band.
    expect(followScrollLeft(1040, 800, 1600, 400)).toBe(400)
  })

  it('recenters the playhead when it exits the band to the right', () => {
    // playhead content-x 1200, scrollLeft 0 → viewport-x 1200 > 640 → out of band.
    // target = 1200 - 400 = 800 (clamped to maxScroll 800).
    expect(followScrollLeft(1200, 800, 1600, 0)).toBe(800)
  })

  it('recenters when the playhead exits the band to the left', () => {
    // playhead content-x 600, scrollLeft 700 → viewport-x -100 < 160 → out of band.
    // target = 600 - 400 = 200.
    expect(followScrollLeft(600, 800, 1600, 700)).toBe(200)
  })

  it('clamps (pins) at the song ends without oscillating', () => {
    // near the end: playhead 1550, already scrolled to max 800 → viewport-x 750
    // (out of band) but recenter target 1150 clamps back to 800 == current → no churn.
    expect(followScrollLeft(1550, 800, 1600, 800)).toBe(800)
    // near the start: playhead 40, scrollLeft 0 → target -360 clamps to 0.
    expect(followScrollLeft(40, 800, 1600, 0)).toBe(0)
  })

  it('no-ops when there is nothing to scroll (not zoomed) or on degenerate input', () => {
    // content == viewport → maxScroll 0 → returns the clamped current offset.
    expect(followScrollLeft(400, 800, 800, 0)).toBe(0)
    expect(followScrollLeft(400, 0, 1600, 123)).toBe(123) // viewportWidth 0
    expect(followScrollLeft(Number.NaN, 800, 1600, 400)).toBe(400) // non-finite playhead
    // an out-of-range current offset is clamped into the scrollable range: with
    // current clamped to 800, a playhead at 1200 is dead-centre → in-band → 800.
    expect(followScrollLeft(1200, 800, 1600, 5000)).toBe(800)
  })

  it('recenters on every step when deadZone is 0', () => {
    // band 0 → in-band span collapses to the exact centre; any drift recenters.
    // playhead 820, scrollLeft 400 → viewport-x 420 ≠ 400 → target 820 - 400 = 420.
    expect(followScrollLeft(820, 800, 1600, 400, { deadZone: 0 })).toBe(420)
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
  it('caps the total tick count on a long song at high zoom (#415)', () => {
    // 4000 cycles × 1000px/cycle would emit 4000 majors uncapped → thin by
    // powers of two until majors fit the budget.
    const ticks = rulerTicks(4000, 1000, 'cycles')
    expect(ticks.length).toBeLessThanOrEqual(MAX_TICKS)
    // step doubled to 8 (4000/8 = 500 ≤ 600) → first majors are 0, 8, 16…
    expect(ticks.slice(0, 3).map((t) => t.cycle)).toEqual([0, 8, 16])
  })

  it('drops beats when they would blow the budget, keeping only majors', () => {
    // 256 bars at step 1 with wide beats: 256×4 = 1024 > MAX_TICKS → beats off.
    const ticks = rulerTicks(256, 250, 'bars')
    expect(ticks.every((t) => t.major)).toBe(true)
    expect(ticks.length).toBe(256)
    expect(ticks.length).toBeLessThanOrEqual(MAX_TICKS)
  })

  it('returns [] for degenerate inputs', () => {
    expect(rulerTicks(0, 100, 'cycles')).toEqual([])
    expect(rulerTicks(4, 0, 'cycles')).toEqual([])
    expect(rulerTicks(4, Number.NaN, 'cycles')).toEqual([])
  })
})
