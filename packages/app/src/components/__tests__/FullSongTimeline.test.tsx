/**
 * FullSongTimeline coverage (#385) —
 *   - lane labels render from analysis.lanes
 *   - section chips + onset cells render once a width is known
 *   - empty state when there is no analysis
 *   - clicking the ruler/grid calls onSeek (the DV-10 relaxation)
 *
 * Pure props in (no @stave/editor runtime dependency — SongAnalysis is a
 * type), so no module mock is needed. A MockResizeObserver supplies the grid
 * width (jsdom ships none), mirroring MusicalTimeline.test.tsx.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { act, render, cleanup, fireEvent } from '@testing-library/react'
import type { SongAnalysis } from '@stave/editor'

// FullSongTimeline now pulls the editor runtime (collectCycles/laneKeyOf, via
// timelineMarks) into its import graph; the real module drags in a CJS dep
// (gifenc) that breaks vitest's loader. These props never pass a real `ir`, so
// the stubs are loaded but never called — the mini-note collection path is
// covered by the Playwright spec against a real song.
// Trim-gesture fixture (#437): an `arrange` song with TWO bd arms — arm 0 over
// cycles [0,2), arm 1 over [2,4). The events carry `armIndex` + `loc` so
// collectNoteMarks builds real clips (armIndex ≥ 0 = trimmable). Returned only
// when an `ir` is passed, so the no-`ir` tests above still see no marks.
const { TRIM_EVENTS } = vi.hoisted(() => ({
  TRIM_EVENTS: [
    { begin: 0, end: 1, s: 'bd', armIndex: 0, loc: [{ start: 9, end: 21 }] },
    { begin: 1, end: 2, s: 'bd', armIndex: 0, loc: [{ start: 9, end: 21 }] },
    { begin: 2, end: 3, s: 'bd', armIndex: 1, loc: [{ start: 23, end: 35 }] },
    { begin: 3, end: 4, s: 'bd', armIndex: 1, loc: [{ start: 23, end: 35 }] },
  ],
}))
vi.mock('@stave/editor', () => ({
  collectCycles: (ir: unknown) => (ir ? TRIM_EVENTS : []),
  laneKeyOf: (ev: { trackId?: string; s?: string }) => ev?.trackId ?? ev?.s ?? '$default',
}))

import { FullSongTimeline } from '../FullSongTimeline'

// jsdom ships no PointerEvent, so fireEvent.pointer* would drop clientX/pointerId
// (the trim hit-test reads both). Shim it as a MouseEvent subclass that keeps the
// coordinate init and carries pointerId — enough for the gesture tests below.
if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    pointerId: number
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 1
    }
  }
  ;(globalThis as { PointerEvent?: unknown }).PointerEvent =
    PointerEventShim as unknown as typeof PointerEvent
}

let mockGridWidth = 800
class MockResizeObserver {
  private cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
  }
  observe(target: Element): void {
    Object.defineProperty(target, 'clientWidth', { value: mockGridWidth, configurable: true })
    Promise.resolve().then(() => {
      this.cb(
        [{ contentRect: { width: mockGridWidth, height: 48 } as DOMRectReadOnly, target } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    })
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  mockGridWidth = 800
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
})
afterEach(() => cleanup())

const analysisFixture: SongAnalysis = {
  periodCycles: 4,
  horizonCycles: 8,
  reachedCap: false,
  lanes: [
    { laneKey: 'bd', onsetsByCycle: [2, 0, 2, 0] },
    { laneKey: 'hh', onsetsByCycle: [1, 1, 1, 1] },
  ],
  sections: [
    { startCycle: 0, endCycle: 1, laneKeys: ['bd', 'hh'] },
    { startCycle: 1, endCycle: 4, laneKeys: ['hh'] },
  ],
}

function renderFull(overrides?: Partial<React.ComponentProps<typeof FullSongTimeline>>) {
  const props = {
    analysis: analysisFixture,
    getSongPosition: () => null,
    onSeek: vi.fn(),
    getDrawerOpen: () => true,
    getActiveTabId: () => 'musical-timeline',
    ...overrides,
  }
  const utils = render(<FullSongTimeline {...props} />)
  return { ...utils, onSeek: props.onSeek as ReturnType<typeof vi.fn> }
}

describe('FullSongTimeline', () => {
  it('renders a lane label per analysis lane', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const lanes = container.querySelectorAll('[data-full-song-lane]')
    expect(lanes.length).toBe(2)
    expect(container.querySelector('[data-full-song-lane="bd"]')).not.toBeNull()
    expect(container.querySelector('[data-full-song-lane="hh"]')).not.toBeNull()
  })

  it('renders section chips on the ruler and mounts the canvas body', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    // Section chips live on the (DOM) ruler overlay.
    expect(container.querySelectorAll('[data-full-song-section]').length).toBe(2)
    // The onset heatmap is now drawn on the canvas (the per-cell DOM nodes are
    // gone). Assert the canvas surface mounted; pixel output is covered by the
    // drawTimeline unit tests + the Playwright screenshot.
    expect(container.querySelector('[data-full-song-canvas]')).not.toBeNull()
    expect(container.querySelectorAll('[data-full-song-cell]').length).toBe(0)
  })

  it('shows an empty state when there is no analysis', async () => {
    const { container } = renderFull({ analysis: null })
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelectorAll('[data-full-song-lane]').length).toBe(0)
    expect(container.textContent).toContain('No song to map yet')
  })

  it('calls onSeek when the grid is clicked (DV-10 relaxation)', async () => {
    const { container, onSeek } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const grid = container.querySelector('[data-full-song="grid"]') as HTMLElement
    await act(async () => {
      grid.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50 }))
    })
    expect(onSeek).toHaveBeenCalledTimes(1)
    // jsdom getBoundingClientRect is zero-width → seek resolves to cycle 0,
    // but the call itself proves the wiring (x→cycle math is unit-tested
    // separately in songAxis.test.ts).
    expect(typeof onSeek.mock.calls[0][0]).toBe('number')
  })

  it('toggles a lane expansion and binds it when the disclosure caret is clicked', async () => {
    const onBindLane = vi.fn()
    const { container } = renderFull({ onBindLane })
    await act(async () => {
      await Promise.resolve()
    })
    const row = () => container.querySelector('[data-full-song-lane="bd"]') as HTMLElement
    expect(row().getAttribute('data-expanded')).toBe('false')
    const caret = container.querySelector('[data-full-song-lane-expand="bd"]') as HTMLElement
    await act(async () => {
      caret.click()
    })
    expect(row().getAttribute('data-expanded')).toBe('true') // accordion expanded
    expect(onBindLane).toHaveBeenCalledTimes(1) // bound into the Pattern panel
    // no `ir` in this fixture → no source provenance, so the offset is null.
    expect(onBindLane).toHaveBeenLastCalledWith(null)
    await act(async () => {
      ;(container.querySelector('[data-full-song-lane-expand="bd"]') as HTMLElement).click()
    })
    expect(row().getAttribute('data-expanded')).toBe('false') // collapses again
  })

  it('supports multi-expand (two lanes expanded for cross-track alignment)', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      ;(container.querySelector('[data-full-song-lane-expand="bd"]') as HTMLElement).click()
      ;(container.querySelector('[data-full-song-lane-expand="hh"]') as HTMLElement).click()
    })
    expect(container.querySelector('[data-full-song-lane="bd"]')!.getAttribute('data-expanded')).toBe('true')
    expect(container.querySelector('[data-full-song-lane="hh"]')!.getAttribute('data-expanded')).toBe('true')
  })

  it('exposes the loop length for observation', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const meta = container.querySelector('[data-full-song-period]')
    expect(meta?.getAttribute('data-full-song-period')).toBe('loop 4')
  })

  // ── Zoom + ruler controls (#412) ───────────────────────────────────────────

  it('renders zoom controls at 100% with Fit/zoom-out disabled', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const cluster = container.querySelector('[data-full-song-zoom]') as HTMLElement
    expect(cluster.getAttribute('data-full-song-zoom')).toBe('100')
    expect((container.querySelector('[data-full-song-zoom-fit]') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('[data-full-song-zoom-out]') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('[data-full-song-zoom-in]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('zooms in on the + button (enables Fit/zoom-out)', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const zoomIn = container.querySelector('[data-full-song-zoom-in]') as HTMLButtonElement
    await act(async () => {
      zoomIn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // default ZOOM_STEP is 1.5 → 150%
    expect(container.querySelector('[data-full-song-zoom]')?.getAttribute('data-full-song-zoom')).toBe('150')
    expect((container.querySelector('[data-full-song-zoom-fit]') as HTMLButtonElement).disabled).toBe(false)
  })

  // ── Follow toggle (#415) ───────────────────────────────────────────────────

  it('renders the Follow toggle defaulting to on', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const toggle = container.querySelector('[data-full-song-follow-toggle]') as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('data-follow')).toBe('on')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('flips Follow off on click', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const toggle = container.querySelector('[data-full-song-follow-toggle]') as HTMLButtonElement
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(toggle.getAttribute('data-follow')).toBe('off')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles CYCLES ↔ BARS and adds beat ticks in bars mode', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    const toggle = container.querySelector('[data-full-song-units-toggle]') as HTMLButtonElement
    expect(toggle.textContent).toBe('CYCLES')
    // CYCLES: 4 major ticks (period 4 across 800px → 200px/cycle), no beats.
    expect(container.querySelectorAll('[data-full-song-tick="major"]').length).toBe(4)
    expect(container.querySelectorAll('[data-full-song-tick="beat"]').length).toBe(0)
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(toggle.textContent).toBe('BARS')
    // BARS: 4 majors + 4×3 interior beat ticks (200/4 = 50px/beat ≥ 14).
    expect(container.querySelectorAll('[data-full-song-tick="major"]').length).toBe(4)
    expect(container.querySelectorAll('[data-full-song-tick="beat"]').length).toBe(12)
  })
})

describe('FullSongTimeline — trim a clip (drag right edge → set-weight, #437)', () => {
  // The fixture song is `arrange([2, s("bd")], [2, s("hh")])`-shaped: bd lane has
  // two clips, arm 0 over [0,2) and arm 1 over [2,4). At zoom 1 the period (4)
  // fits 800px → 200px/cycle, so arm 0's right edge sits at x=400. We grab just
  // inside it, drag to cycle 3, and expect a set-weight to 3 for arm 0.
  function renderTrimmable(onTrimClip: ReturnType<typeof vi.fn>) {
    const utils = renderFull({ ir: {} as never, onTrimClip })
    const grid = utils.container.querySelector('[data-full-song="grid"]') as HTMLElement
    // jsdom has no layout — supply the grid rect the content-space math reads.
    grid.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 48, right: 800, bottom: 48, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    return { ...utils, grid }
  }

  it('drags arm 0’s right edge to cycle 3 → onTrimClip(arm 0, weight 3)', async () => {
    const onTrimClip = vi.fn()
    const { grid } = renderTrimmable(onTrimClip)
    await act(async () => {
      await Promise.resolve()
    })
    // Grab 2px inside arm 0's right edge (x=400), in the bd row (y≈10).
    fireEvent.pointerDown(grid, { clientX: 398, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(grid, { clientX: 600, clientY: 10, pointerId: 1 }) // cycle 3
    fireEvent.pointerUp(grid, { clientX: 600, clientY: 10, pointerId: 1 })
    expect(onTrimClip).toHaveBeenCalledTimes(1)
    // sourceOffset = the bd lane's first event loc (9); arm 0; new whole-cycle weight 3.
    expect(onTrimClip).toHaveBeenCalledWith({ sourceOffset: 9, armIndex: 0, weight: 3 })
  })

  it('grabs the LAST clip’s right edge (at the song end) and shrinks it', async () => {
    const onTrimClip = vi.fn()
    const { grid } = renderTrimmable(onTrimClip)
    await act(async () => {
      await Promise.resolve()
    })
    // Arm 1 spans [2,4); its right edge is the song end at x=800. Grab it and
    // drag left to cycle 3 → new weight 1 (4−2 was 2). clipAtCycle(4) is null —
    // the edge-proximity scan is what makes this clip grabbable.
    fireEvent.pointerDown(grid, { clientX: 798, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(grid, { clientX: 600, clientY: 10, pointerId: 1 }) // cycle 3
    fireEvent.pointerUp(grid, { clientX: 600, clientY: 10, pointerId: 1 })
    expect(onTrimClip).toHaveBeenCalledWith({ sourceOffset: 9, armIndex: 1, weight: 1 })
  })

  it('a click that lands NOT on a clip edge seeks instead of trimming', async () => {
    const onTrimClip = vi.fn()
    const { grid, onSeek } = renderTrimmable(onTrimClip)
    await act(async () => {
      await Promise.resolve()
    })
    // Mid-clip (x=100 ≈ cycle 0.5), nowhere near an edge → seek, no trim.
    fireEvent.pointerDown(grid, { clientX: 100, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(grid, { clientX: 100, clientY: 10, pointerId: 1 })
    expect(onTrimClip).not.toHaveBeenCalled()
    expect(onSeek).toHaveBeenCalledTimes(1)
  })

  it('a drag that does not change the weight does not fire onTrimClip', async () => {
    const onTrimClip = vi.fn()
    const { grid } = renderTrimmable(onTrimClip)
    await act(async () => {
      await Promise.resolve()
    })
    // Grab the edge and release without crossing into a new cycle (stays weight 2).
    fireEvent.pointerDown(grid, { clientX: 398, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(grid, { clientX: 402, clientY: 10, pointerId: 1 }) // still cycle 2
    fireEvent.pointerUp(grid, { clientX: 402, clientY: 10, pointerId: 1 })
    expect(onTrimClip).not.toHaveBeenCalled()
  })
})
