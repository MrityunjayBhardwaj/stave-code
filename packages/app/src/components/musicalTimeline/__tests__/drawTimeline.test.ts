import { describe, it, expect } from 'vitest'
import { drawTimeline, laneRenderMode, COARSEN_PX, type DrawTransform, type DrawTheme } from '../drawTimeline'
import type { TimelineScene } from '../timelineScene'

const theme: DrawTheme = {
  background: '#000',
  rowAlt: '#111',
  section: '#222',
  sectionAlt: '#333',
  gridline: '#444',
}

interface Rect { x: number; y: number; w: number; h: number }

/** Recording mock 2D context — captures every fillRect (the only primitive the
 *  renderer uses) so tests can assert positions/counts without a real canvas. */
function mockCtx() {
  const rects: Rect[] = []
  const ctx = {
    fillStyle: '' as string,
    globalAlpha: 1,
    clearRect() {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

const scene: TimelineScene = {
  displayCycles: 4,
  period: 4,
  peakDensity: 2,
  notesCapped: false,
  sections: [{ startCycle: 0, endCycle: 4, laneKeys: ['lead'] }],
  lanes: [
    {
      laneKey: 'lead',
      color: '#0af',
      density: [1, 0, 2, 0], // onsets at integer cycles 0 and 2
      notes: [
        { cycle: 0, pitch: 60, gain: 1 },
        { cycle: 2, pitch: 72, gain: 0.5 },
        { cycle: 2.5, pitch: 64, gain: 0.8 }, // fractional → only marks render here
      ],
      pitchMin: 60,
      pitchMax: 72,
    },
  ],
}

describe('laneRenderMode', () => {
  it('shows marks when a cycle is wide enough, density when narrow', () => {
    expect(laneRenderMode(COARSEN_PX + 1, true)).toBe('marks')
    expect(laneRenderMode(COARSEN_PX - 1, true)).toBe('density')
  })
  it('always uses density when the lane has no marks', () => {
    expect(laneRenderMode(1000, false)).toBe('density')
  })
  it('degenerate pxPerCycle → density', () => {
    expect(laneRenderMode(Number.NaN, true)).toBe('density')
  })
})

describe('drawTimeline', () => {
  const vw = 400

  it('draws mini-note marks when zoomed in (a mark lands at the fractional cycle 2.5)', () => {
    // contentWidth 4000 over 4 cycles = 1000px/cycle ≫ COARSEN_PX → marks mode.
    const transform: DrawTransform = { scrollLeft: 0, contentWidth: 4000, viewportWidth: vw, rowHeight: 22, height: 22 }
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme)
    // cycle 2.5 → contentX = (2.5/4)*4000 = 2500; with scrollLeft 0 it's off-screen
    // (vw=400). Scroll so it's visible and re-check instead:
    const { ctx: ctx2, rects: rects2 } = mockCtx()
    drawTimeline(ctx2, scene, { ...transform, scrollLeft: 2400 }, theme)
    const screenXof = (cycle: number) => (cycle / 4) * 4000 - 2400
    const markAt25 = rects2.some((r) => Math.abs(r.x - screenXof(2.5)) < 1 && r.h === 3)
    expect(markAt25).toBe(true)
    // sanity: marks are short (h=3), unlike full-height bands/gridlines.
    expect(rects2.some((r) => r.h === 3)).toBe(true)
    expect(rects.length).toBeGreaterThan(0)
  })

  it('draws coarse density when zoomed out (no fractional-cycle rect)', () => {
    // contentWidth 40 over 4 cycles = 10px/cycle < COARSEN_PX → density mode.
    const transform: DrawTransform = { scrollLeft: 0, contentWidth: 40, viewportWidth: vw, rowHeight: 22, height: 22 }
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme)
    const screenXof = (cycle: number) => (cycle / 4) * 40
    // density only draws at integer cycles 0 and 2 — never at 2.5.
    expect(rects.some((r) => Math.abs(r.x - screenXof(2.5)) < 0.5 && r.h !== 22)).toBe(false)
    // and there IS a density cell at integer cycle 2 (padded height, not full).
    expect(rects.some((r) => Math.abs(r.x - screenXof(2)) < 0.5)).toBe(true)
  })

  it('no-ops cleanly on a degenerate transform', () => {
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, { scrollLeft: 0, contentWidth: 0, viewportWidth: 0, rowHeight: 22, height: 22 }, theme)
    expect(rects.length).toBe(0)
  })
})
