/**
 * #1731 — a synth lane draws its own rendered loudness when collapsed. Three
 * pure pieces: `envelopeTrackIds` says which tracks to render, `attachEnvelopes`
 * puts each render on its lane, and `drawTimeline` draws it behind the marks.
 * The pixels are read back off the real canvas in `synth-lane-envelope.spec.ts`.
 */
import { describe, it, expect } from 'vitest'
import { ENVELOPE_ALPHA, ENVELOPE_STALE_ALPHA, drawTimeline, type DrawTheme, type DrawTransform } from '../drawTimeline'
import { computeLaneLayout } from '../laneLayout'
import { DEFAULT_METER } from '../../../lib/meter'
import {
  attachEnvelopes,
  envelopeTrackIds,
  type LaneEnvelope,
  type SceneLane,
  type SceneNote,
  type TimelineScene,
} from '../timelineScene'

interface Rect { x: number; y: number; w: number; h: number; style: string; alpha: number }

function mockCtx() {
  const rects: Rect[] = []
  const ctx = {
    fillStyle: '' as string,
    globalAlpha: 1,
    font: '' as string,
    textBaseline: '' as string,
    clearRect() {},
    save() {},
    restore() {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, style: ctx.fillStyle, alpha: ctx.globalAlpha })
    },
    fillText() {},
    measureText(text: string) {
      return { width: text.length * 6 } as TextMetrics
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

const theme: DrawTheme = {
  background: '#000', rowAlt: '#111', section: '#222', sectionAlt: '#333',
  gridline: '#444', clipFill: '#555', clipCaption: '#fff', clipBorder: '#666',
  automationLine: '#777',
}

const synth: SceneNote[] = [{ cycle: 0, end: 0.5, pitch: 48, gain: 1, voice: 'sawtooth' }]

function lane(key: string, notes: SceneNote[], extra: Partial<SceneLane> = {}): SceneLane {
  return {
    laneKey: key,
    displayName: key,
    color: '#0af',
    density: [1, 1, 1, 1],
    notes,
    pitchMin: 48,
    pitchMax: 48,
    voices: [],
    clips: [],
    sourceOffset: null,
    arrangeOffset: null,
    labelOffset: null,
    automations: [],
    stepped: [],
    ...extra,
  }
}

function sceneOf(lanes: SceneLane[]): TimelineScene {
  return {
    displayCycles: 4,
    windowOriginCycles: 0,
    period: 4,
    peakDensity: 1,
    notesCapped: false,
    sections: [],
    lanes,
  }
}

/** Silent first half, loud second half: 8 columns over 4 cycles. */
function swell(stale = false): LaneEnvelope {
  const data = new Float32Array(16)
  for (let c = 4; c < 8; c++) {
    data[2 * c] = -0.2
    data[2 * c + 1] = 0.2
  }
  return { data, columns: 8, cycles: 4, stale }
}

describe('envelopeTrackIds — which tracks to render (#1731)', () => {
  it('names the track behind every non-audio lane with marks, once, in lane order', () => {
    const scene = sceneOf([
      lane('d1', synth),
      lane('d2', synth, { audio: true }),
      lane('d3', []),
      lane('d4', synth),
      lane('d5', synth),
    ])
    const byLane = new Map([
      ['d1', '$0'],
      ['d2', '$1'],
      ['d3', '$2'],
      ['d4', '$3'],
      ['d5', '$3'],
    ])
    expect(envelopeTrackIds(scene, byLane)).toEqual(['$0', '$3'])
  })

  it('asks for nothing without the lane→track join', () => {
    expect(envelopeTrackIds(sceneOf([lane('d1', synth)]), undefined)).toEqual([])
  })
})

describe('attachEnvelopes — each render on its lane (#1731)', () => {
  it('puts a track\'s envelope on its lane, and none on an audio lane', () => {
    const env = swell()
    const scene = sceneOf([lane('d1', synth), lane('d2', synth, { audio: true })])
    const out = attachEnvelopes(scene, new Map([['d1', '$0'], ['d2', '$1']]), () => env)
    expect(out.lanes[0].envelope).toBe(env)
    expect(out.lanes[1].envelope).toBeUndefined()
  })

  it('drops an envelope the engine no longer has', () => {
    const scene = sceneOf([lane('d1', synth, { envelope: swell() })])
    const out = attachEnvelopes(scene, new Map([['d1', '$0']]), () => null)
    expect('envelope' in out.lanes[0]).toBe(false)
  })

  it('returns the same scene when nothing changes', () => {
    const scene = sceneOf([lane('d1', synth)])
    expect(attachEnvelopes(scene, new Map([['d1', '$0']]), () => null)).toBe(scene)
    expect(attachEnvelopes(scene, undefined, () => swell())).toBe(scene)
  })
})

describe('drawTimeline — a collapsed synth lane draws its envelope (#1731)', () => {
  // 100 px per cycle; the envelope covers 400 px, 50 px per column.
  const transform: DrawTransform = { scrollLeft: 0, contentWidth: 400, viewportWidth: 400, meter: DEFAULT_METER }

  const envelopeColumns = (rects: Rect[], alpha: number) =>
    rects.filter((r) => r.w === 1 && Math.abs(r.alpha - alpha) < 1e-9)

  it('draws where the track sounds and nothing where it is silent, scaled to its own peak', () => {
    const scene = sceneOf([lane('d1', synth, { envelope: swell() })])
    const layout = computeLaneLayout(scene.lanes, new Set(), 60, 88)
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme, layout)
    const cols = envelopeColumns(rects, ENVELOPE_ALPHA)
    expect(cols.length).toBe(200) // x 200..399: the loud half, one per pixel
    expect(Math.min(...cols.map((r) => r.x))).toBe(200)
    expect(cols.every((r) => r.style === '#0af')).toBe(true)
    // Peak 0.2 fills the row minus its padding: 0.2 is the track's loudest.
    const box = layout.boxes[0]
    expect(cols[0].h).toBeCloseTo(box.height - 2 * 3, 5)
  })

  it('an onset click does not set the scale: the held level fills the row', () => {
    // 100 columns over 4 cycles; each 25-column note opens with a 1.0 click and
    // then holds 0.25 — the shape of an oscillator's note, measured on a square.
    // Clicks are 4% of the columns (a real 10 ms click on a 1 s note is 1%).
    const data = new Float32Array(200)
    for (let c = 0; c < 100; c++) {
      const v = c % 25 === 0 ? 1 : 0.25
      data[2 * c] = -v
      data[2 * c + 1] = v
    }
    const scene = sceneOf([lane('d1', synth, { envelope: { data, columns: 100, cycles: 4, stale: false } })])
    const layout = computeLaneLayout(scene.lanes, new Set(), 60, 88)
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme, layout)
    const held = envelopeColumns(rects, ENVELOPE_ALPHA).filter((r) => r.x === 50) // mid-note: column 12
    expect(held).toHaveLength(1)
    expect(held[0].h).toBeCloseTo(layout.boxes[0].height - 2 * 3, 5)
  })

  it('a stale envelope draws in the muted caption colour, at its own opacity', () => {
    const scene = sceneOf([lane('d1', synth, { envelope: swell(true) })])
    const layout = computeLaneLayout(scene.lanes, new Set(), 60, 88)
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme, layout)
    expect(envelopeColumns(rects, ENVELOPE_ALPHA).length).toBe(0)
    const cols = envelopeColumns(rects, ENVELOPE_STALE_ALPHA)
    expect(cols.length).toBe(200)
    expect(cols.every((r) => r.style === theme.clipCaption)).toBe(true)
  })

  it('an expanded lane draws no envelope: expanding is the note-editing view', () => {
    const scene = sceneOf([lane('d1', synth, { envelope: swell() })])
    const layout = computeLaneLayout(scene.lanes, new Set(['d1']), 60, 88)
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme, layout)
    expect(envelopeColumns(rects, ENVELOPE_ALPHA).length).toBe(0)
  })

  it('draws behind the marks: every envelope column comes before the first mark', () => {
    const scene = sceneOf([lane('d1', [{ cycle: 3, end: 3.5, pitch: 48, gain: 1, voice: 'sawtooth' }], { envelope: swell() })])
    const layout = computeLaneLayout(scene.lanes, new Set(), 60, 88)
    const { ctx, rects } = mockCtx()
    drawTimeline(ctx, scene, transform, theme, layout)
    const lastEnvelope = rects.map((r, i) => (r.w === 1 && Math.abs(r.alpha - ENVELOPE_ALPHA) < 1e-9 ? i : -1)).reduce((a, b) => Math.max(a, b))
    const mark = rects.findIndex((r) => r.x === 300 && r.w === 50 && r.style === '#0af')
    expect(mark).toBeGreaterThan(lastEnvelope)
  })
})
