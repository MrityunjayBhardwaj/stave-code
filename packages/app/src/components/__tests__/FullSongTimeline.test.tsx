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
})
