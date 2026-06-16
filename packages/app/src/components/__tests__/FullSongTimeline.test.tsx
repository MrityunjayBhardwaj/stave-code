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
import { act, render, cleanup } from '@testing-library/react'
import type { SongAnalysis } from '@stave/editor'
import { FullSongTimeline } from '../FullSongTimeline'

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

  it('renders section chips and onset cells once a width is known', async () => {
    const { container } = renderFull()
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelectorAll('[data-full-song-section]').length).toBe(2)
    // bd has onsets in cycles 0 and 2 → 2 cells; hh in all 4 → 4 cells.
    expect(container.querySelectorAll('[data-full-song-cell]').length).toBe(6)
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
