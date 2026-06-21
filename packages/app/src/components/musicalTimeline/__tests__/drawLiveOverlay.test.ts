import { describe, it, expect } from 'vitest'
import {
  drawLiveOverlay,
  isMarkLit,
  markSig,
  MIN_LIT_CYCLES,
  type LiveOverlayTheme,
} from '../drawLiveOverlay'
import { laneMarkBands, markRect, COARSEN_PX } from '../drawTimeline'
import { computeLaneLayout } from '../laneLayout'
import type { TimelineScene, SceneNote } from '../timelineScene'

/** Recording mock 2D context — captures fillRect (the only primitive the
 *  overlay draws), like drawTimeline.test's harness. */
function mockCtx(): {
  ctx: CanvasRenderingContext2D
  rects: Array<{ x: number; y: number; w: number; h: number }>
  calls: { clears: number }
} {
  const rects: Array<{ x: number; y: number; w: number; h: number }> = []
  const calls = { clears: 0 }
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect() {
      calls.clears++
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h })
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, rects, calls }
}

const THEME: LiveOverlayTheme = { lit: '#fff', litGlow: '#88f' }

/** One lane, one melodic voice with two pitched notes. */
function sceneFixture(): TimelineScene {
  const notes: SceneNote[] = [
    { cycle: 1, end: 1.5, pitch: 60, gain: 1, voice: 'saw' },
    { cycle: 2, end: 2.5, pitch: 67, gain: 0.5, voice: 'saw' },
  ]
  return {
    lanes: [
      {
        laneKey: 'a',
        color: '#f00',
        density: [0, 1, 1, 0],
        notes,
        pitchMin: 60,
        pitchMax: 67,
        voices: [{ key: 'saw', label: 'saw', melodic: true, pitchMin: 60, pitchMax: 67 }],
        clips: [{ armIndex: -1, startCycle: 0, endCycle: 4, label: null }],
        sourceOffset: null,
        arrangeOffset: null,
      },
    ],
    sections: [],
    displayCycles: 4,
    period: null,
    peakDensity: 1,
    notesCapped: false,
  }
}

// Wide transform → pxPerCycle = 4000/4 = 1000 ≫ COARSEN_PX → marks mode.
const WIDE = { scrollLeft: 0, contentWidth: 4000, viewportWidth: 4000 }

describe('markSig', () => {
  it('keys by voice+pitch, with null collapsing to the empty segment', () => {
    expect(markSig('bd', null)).toBe('bd|') // a drum hit
    expect(markSig(null, 60)).toBe('|60') // a bare synth note
    expect(markSig('piano', 48)).toBe('piano|48') // a sampled melodic note
    expect(markSig(undefined, undefined)).toBe('|')
  })
  it('a hap and its scene mark agree on the same sig', () => {
    // hap-side (s, midiNote) === mark-side (voice, pitch)
    expect(markSig('saw', 60)).toBe(markSig('saw', 60))
  })
})

describe('isMarkLit', () => {
  const note: SceneNote = { cycle: 1, end: 1.5, pitch: 60, gain: 1, voice: 'saw' }
  const active = new Set(['saw|60'])

  it('lit when the playhead is inside [cycle,end) AND the sig is firing', () => {
    expect(isMarkLit(note, 1.2, active)).toBe(true)
  })
  it('dark before the onset', () => {
    expect(isMarkLit(note, 0.9, active)).toBe(false)
  })
  it('dark after the offset', () => {
    expect(isMarkLit(note, 1.6, active)).toBe(false)
  })
  it('dark when the sig is NOT firing (degrade: mark exists but did not sound)', () => {
    expect(isMarkLit(note, 1.2, new Set())).toBe(false)
    expect(isMarkLit(note, 1.2, new Set(['bd|']))).toBe(false)
  })
  it('a zero-duration trigger still lights for a minimum window', () => {
    const hit: SceneNote = { cycle: 2, end: 2, pitch: null, gain: 1, voice: 'bd' }
    const drums = new Set(['bd|'])
    expect(isMarkLit(hit, 2, drums)).toBe(true)
    expect(isMarkLit(hit, 2 + MIN_LIT_CYCLES / 2, drums)).toBe(true)
    expect(isMarkLit(hit, 2 + MIN_LIT_CYCLES * 2, drums)).toBe(false)
  })
  it('a non-finite playhead is never lit', () => {
    expect(isMarkLit(note, Number.NaN, active)).toBe(false)
  })
})

describe('drawLiveOverlay', () => {
  it('clears its surface every call', () => {
    const { ctx, calls } = mockCtx()
    drawLiveOverlay(ctx, sceneFixture(), WIDE, layoutFor(sceneFixture()), 1.2, new Set(['saw|60']), THEME)
    expect(calls.clears).toBe(1)
  })

  it('lights the mark under the playhead whose voice+pitch is firing', () => {
    const scene = sceneFixture()
    const { ctx, rects } = mockCtx()
    // Playhead at 1.2 → inside note0 [1,1.5); active set has its sig.
    drawLiveOverlay(ctx, scene, WIDE, layoutFor(scene), 1.2, new Set(['saw|60']), THEME)
    // glow + core for the one lit mark (2 fillRects); note1 [2,2.5) is not lit.
    expect(rects.length).toBe(2)
  })

  it('does not light a mark whose sig is absent (degrade)', () => {
    const scene = sceneFixture()
    const { ctx, rects } = mockCtx()
    drawLiveOverlay(ctx, scene, WIDE, layoutFor(scene), 1.2, new Set(['saw|67']), THEME)
    expect(rects.length).toBe(0)
  })

  it('draws nothing when stopped (playheadCycle null) or no sigs firing', () => {
    const scene = sceneFixture()
    const a = mockCtx()
    drawLiveOverlay(a.ctx, scene, WIDE, layoutFor(scene), null, new Set(['saw|60']), THEME)
    expect(a.rects.length).toBe(0)
    expect(a.calls.clears).toBe(1) // still cleared
    const b = mockCtx()
    drawLiveOverlay(b.ctx, scene, WIDE, layoutFor(scene), 1.2, new Set(), THEME)
    expect(b.rects.length).toBe(0)
  })

  it('lights nothing in density mode (zoomed out — no marks drawn to light)', () => {
    const scene = sceneFixture()
    const { ctx, rects } = mockCtx()
    // Narrow: pxPerCycle = (COARSEN_PX-1)*4 / 4 < COARSEN_PX → density.
    const narrow = { scrollLeft: 0, contentWidth: (COARSEN_PX - 1) * 4, viewportWidth: 4000 }
    drawLiveOverlay(ctx, scene, narrow, layoutFor(scene), 1.2, new Set(['saw|60']), THEME)
    expect(rects.length).toBe(0)
  })

  it('a lit mark sits exactly over its BASE mark (shared geometry, no drift)', () => {
    const scene = sceneFixture()
    const layout = layoutFor(scene)
    const { ctx, rects } = mockCtx()
    drawLiveOverlay(ctx, scene, WIDE, layout, 1.2, new Set(['saw|60']), THEME)
    // The base geometry for note0 in lane 0.
    const band = laneMarkBands(scene.lanes[0], layout.boxes[0])[0]
    const baseRect = markRect(scene.lanes[0].notes[0], band, 1000, 4000, 0, 4, (c) => c * 1000)
    expect(baseRect).not.toBeNull()
    // The bright CORE (second of glow+core) shares the base rect's x/y/w/h.
    const core = rects[1]
    expect(core.x).toBeCloseTo(baseRect!.x, 5)
    expect(core.y).toBeCloseTo(baseRect!.y, 5)
    expect(core.w).toBeCloseTo(baseRect!.w, 5)
    expect(core.h).toBeCloseTo(baseRect!.h, 5)
  })
})

function layoutFor(scene: TimelineScene) {
  return computeLaneLayout(scene.lanes, new Set(), 40, 96)
}
