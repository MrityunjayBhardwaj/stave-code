import { describe, it, expect } from 'vitest'
import { drawTimeline, laneRenderMode, COARSEN_PX, MIN_MARK_W, type DrawTransform, type DrawTheme } from '../drawTimeline'
import { computeLaneLayout } from '../laneLayout'
import type { TimelineScene } from '../timelineScene'

const theme: DrawTheme = {
  background: '#000',
  rowAlt: '#111',
  section: '#222',
  sectionAlt: '#333',
  gridline: '#444',
  clipFill: '#555',
  clipBorder: '#666',
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
        { cycle: 0, end: 0.25, pitch: 60, gain: 1 },
        { cycle: 2, end: 2.25, pitch: 72, gain: 0.5 },
        { cycle: 2.5, end: 2.75, pitch: 64, gain: 0.8 }, // fractional → only marks render here
      ],
      pitchMin: 60,
      pitchMax: 72,
      voices: [{ key: 'lead', label: 'lead', melodic: true, pitchMin: 60, pitchMax: 72 }],
      clips: [],
      sourceOffset: null,
      arrangeOffset: null,
    },
  ],
}

/** Default collapsed layout (one 22px row), the common case for these tests. */
const flat = computeLaneLayout(scene.lanes, new Set(), 22, 88)

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
  it('an expanded lane with marks forces marks even when zoomed out', () => {
    expect(laneRenderMode(COARSEN_PX - 1, true, true)).toBe('marks')
    expect(laneRenderMode(1000, false, true)).toBe('density') // still no marks → density
  })
})

describe('drawTimeline', () => {
  const vw = 400

  it('draws mini-note marks when zoomed in (a mark lands at the fractional cycle 2.5)', () => {
    // contentWidth 4000 over 4 cycles = 1000px/cycle ≫ COARSEN_PX → marks mode.
    const transform: DrawTransform = { scrollLeft: 0, contentWidth: 4000, viewportWidth: vw }
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme, flat)
    // cycle 2.5 → contentX = (2.5/4)*4000 = 2500; with scrollLeft 0 it's off-screen
    // (vw=400). Scroll so it's visible and re-check instead:
    const { ctx: ctx2, rects: rects2 } = mockCtx()
    drawTimeline(ctx2, scene, { ...transform, scrollLeft: 2400 }, theme, flat)
    const screenXof = (cycle: number) => (cycle / 4) * 4000 - 2400
    // #459 — mark height now scales with the row: at rowHeight 22 it's
    // barHeightForBand(22 − 2·3) = max(3, 16 − 12) = 4 (was a fixed 3).
    const markAt25 = rects2.some((r) => Math.abs(r.x - screenXof(2.5)) < 1 && r.h === 4)
    expect(markAt25).toBe(true)
    // sanity: marks are short (h=4), unlike full-height bands/gridlines.
    expect(rects2.some((r) => r.h === 4)).toBe(true)
    expect(rects.length).toBeGreaterThan(0)
  })

  it('draws coarse density when zoomed out (no fractional-cycle rect)', () => {
    // contentWidth 40 over 4 cycles = 10px/cycle < COARSEN_PX → density mode.
    const transform: DrawTransform = { scrollLeft: 0, contentWidth: 40, viewportWidth: vw }
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme, flat)
    const screenXof = (cycle: number) => (cycle / 4) * 40
    // density only draws at integer cycles 0 and 2 — never at 2.5.
    expect(rects.some((r) => Math.abs(r.x - screenXof(2.5)) < 0.5 && r.h !== 22)).toBe(false)
    // and there IS a density cell at integer cycle 2 (padded height, not full).
    expect(rects.some((r) => Math.abs(r.x - screenXof(2)) < 0.5)).toBe(true)
  })

  it('no-ops cleanly on a degenerate transform', () => {
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, { scrollLeft: 0, contentWidth: 0, viewportWidth: 0 }, theme, flat)
    expect(rects.length).toBe(0)
  })

  it('places a second lane at its layout top (variable row heights)', () => {
    const two: TimelineScene = {
      ...scene,
      lanes: [scene.lanes[0], { ...scene.lanes[0], laneKey: 'bass' }],
    }
    // 'lead' expanded to 88px → 'bass' starts at y=88, not y=22.
    const layout = computeLaneLayout(two.lanes, new Set(['lead']), 22, 88)
    expect(layout.boxes[1].top).toBe(88)
    const { ctx, rects } = mockCtx()
    // Zoomed out so each lane draws density (integer cells) at its own top.
    drawTimeline(ctx, two, { scrollLeft: 0, contentWidth: 40, viewportWidth: vw }, theme, layout)
    // bass density cells sit in its band [88, 110) — i.e. at least one rect with y >= 88.
    expect(rects.some((r) => r.y >= 88 && r.y < 110)).toBe(true)
  })

  it('an expanded lane draws per-beat gridlines spanning its taller band', () => {
    // 1000px/cycle → 250px/beat ≫ BEAT_GRID_MIN_PX → beat grid shows.
    const layout = computeLaneLayout(scene.lanes, new Set(['lead']), 22, 88)
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, { scrollLeft: 0, contentWidth: 4000, viewportWidth: vw }, theme, layout)
    // A beat gridline is a 1px-wide column the full height of the 88px band.
    const beatGrid = rects.filter((r) => r.w === 1 && r.h === 88 && r.y === 0)
    expect(beatGrid.length).toBeGreaterThan(0)
  })

  it('draws marks with DURATION-proportional width (a sustained note is a long bar)', () => {
    const durScene: TimelineScene = {
      ...scene,
      lanes: [
        {
          ...scene.lanes[0],
          notes: [
            { cycle: 0, end: 0, pitch: 60, gain: 1 }, // zero-duration trigger → MIN_MARK_W
            { cycle: 1, end: 2, pitch: 64, gain: 1 }, // a whole cycle long
          ],
        },
      ],
    }
    // 4000px / 4 cycles = 1000 px/cycle ≫ COARSEN_PX → marks mode.
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, durScene, { scrollLeft: 0, contentWidth: 4000, viewportWidth: 4000 }, theme, flat)
    const marks = rects.filter((r) => r.h === 4) // mark height (collapsed, rowHeight 22 → 4; #459)
    const short = marks.find((r) => Math.abs(r.x - 0) < 1)!
    const long = marks.find((r) => Math.abs(r.x - 1000) < 1)! // cycle 1 → x=1000
    expect(short.w).toBe(MIN_MARK_W) // floored
    expect(long.w).toBe(1000) // (2 − 1) cycles × 1000 px/cycle
    expect(long.w).toBeGreaterThan(short.w)
  })

  it('places each voice of an expanded multi-voice lane on its own sub-band baseline (#424)', () => {
    // A drum lane with two percussive voices (bd, sd) at the same cycle. Before
    // #424 both landed on ONE centered baseline; now each draws in its own
    // sub-row, so the two marks sit at DIFFERENT y.
    const drumScene: TimelineScene = {
      ...scene,
      lanes: [
        {
          laneKey: 'drums',
          color: '#fa0',
          density: [2, 0, 0, 0],
          notes: [
            { cycle: 0, end: 0.25, pitch: null, gain: 1, voice: 'bd' },
            { cycle: 0, end: 0.25, pitch: null, gain: 1, voice: 'sd' },
          ],
          pitchMin: null,
          pitchMax: null,
          voices: [
            { key: 'bd', label: 'bd', melodic: false, pitchMin: null, pitchMax: null },
            { key: 'sd', label: 'sd', melodic: false, pitchMin: null, pitchMax: null },
          ],
          clips: [],
          sourceOffset: null,
          arrangeOffset: null,
        },
      ],
    }
    // Expanded with 2 voices → sub-rows (22px each → 44px lane). 1000px/cycle → marks.
    const layout = computeLaneLayout(drumScene.lanes, new Set(['drums']), 22, 88, 22)
    expect(layout.boxes[0].subRows?.length).toBe(2)
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, drumScene, { scrollLeft: 0, contentWidth: 4000, viewportWidth: 4000 }, theme, layout)
    // Marks are the short rects at x≈0 (cycle 0). #459 — the sub-row mark scales
    // with the sub-row height: barHeightForBand(22 − 2·2) = max(3, 18 − 12) = 6.
    // The two voices must land on DIFFERENT baselines — bd sub-row 0, sd sub-row 1.
    const marks = rects.filter((r) => r.h === 6 && Math.abs(r.x - 0) < 1)
    expect(marks.length).toBe(2)
    const ys = marks.map((r) => r.y).sort((a, b) => a - b)
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(20) // ~one SUB_ROW_HEIGHT apart
    // Sub-row 0 baseline sits in [0,22), sub-row 1 in [22,44) — no overlap.
    expect(ys[0]).toBeLessThan(22)
    expect(ys[1]).toBeGreaterThanOrEqual(22)
  })
})

describe('drawClips (#386)', () => {
  const vw = 400
  it('draws a bordered filled rect per clip segment over the shared transform', () => {
    // Two clips: arm 0 cycles [0,2), arm 1 [2,4). 100px/cycle (contentWidth 400).
    const clipScene: TimelineScene = {
      ...scene,
      lanes: [
        {
          ...scene.lanes[0],
          notes: [],
          clips: [
            { armIndex: 0, startCycle: 0, endCycle: 2, label: 'a' },
            { armIndex: 1, startCycle: 2, endCycle: 4, label: 'b' },
          ],
        },
      ],
    }
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, clipScene, { scrollLeft: 0, contentWidth: 400, viewportWidth: vw }, theme, flat)
    // Clip fills span their cycle range: arm0 [0,200), arm1 [200,400).
    const fill0 = rects.find((r) => r.x === 0 && r.w === 200 && r.h === 22)
    const fill1 = rects.find((r) => r.x === 200 && r.w === 200 && r.h === 22)
    expect(fill0).toBeDefined()
    expect(fill1).toBeDefined()
    // Border at the internal boundary cycle 2 (x=200), full row height.
    const borderAt200 = rects.find((r) => Math.abs(r.x - 200) < 1 && r.w === 1 && r.h === 22)
    expect(borderAt200).toBeDefined()
  })

  it('an implicit single clip fills the whole lane (bare track, seamless)', () => {
    const oneClip: TimelineScene = {
      ...scene,
      lanes: [{ ...scene.lanes[0], notes: [], clips: [{ armIndex: -1, startCycle: 0, endCycle: 4, label: null }] }],
    }
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, oneClip, { scrollLeft: 0, contentWidth: 400, viewportWidth: vw }, theme, flat)
    expect(rects.some((r) => r.x === 0 && r.w === 400 && r.h === 22)).toBe(true)
  })
})
