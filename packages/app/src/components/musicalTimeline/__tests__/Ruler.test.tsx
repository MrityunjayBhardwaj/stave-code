/**
 * Ruler render-shape probes (Phase 20-02 T-03).
 *
 * Behavioral observation only (DV-07): tick counts, label content,
 * caption presence, minor-tick threshold. NO color literal asserts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { act, render, cleanup } from '@testing-library/react'
import { Ruler } from '../Ruler'

let mockRulerWidth = 800

class MockResizeObserver {
  private cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
  }
  observe(target: Element): void {
    Object.defineProperty(target, 'clientWidth', {
      value: mockRulerWidth,
      configurable: true,
    })
    Promise.resolve().then(() => {
      this.cb(
        [
          {
            contentRect: { width: mockRulerWidth, height: 28 } as DOMRectReadOnly,
            target,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      )
    })
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  mockRulerWidth = 800
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
})
afterEach(() => cleanup())

async function renderSettled(ui: React.ReactElement) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(ui)
    await Promise.resolve()
    await Promise.resolve()
  })
  return result
}

describe('Ruler — caption + major ticks', () => {
  it('renders the CYCLES caption verbatim (DV-06)', async () => {
    const { container } = await renderSettled(
      <Ruler currentCycle={null} gridContentWidth={800} />,
    )
    const gutter = container.querySelector('[data-musical-timeline="ruler-gutter"]')
    expect(gutter?.textContent).toBe('CYCLES')
  })

  it('renders 3 major ticks at integer cycle boundaries (WINDOW_CYCLES + 1)', async () => {
    const { container } = await renderSettled(
      <Ruler currentCycle={null} gridContentWidth={800} />,
    )
    const major = container.querySelectorAll('[data-musical-timeline-ruler-major]')
    expect(major).toHaveLength(3)
  })

  it('renders cycle labels 0, 1, 2 in order', async () => {
    const { container } = await renderSettled(
      <Ruler currentCycle={null} gridContentWidth={800} />,
    )
    const labels = Array.from(
      container.querySelectorAll('[data-musical-timeline-ruler-label]'),
    ).map((el) => el.textContent)
    expect(labels).toEqual(['0', '1', '2'])
  })
})

describe('Ruler — minor-tick visibility threshold (Trap 4)', () => {
  it('renders interior minor ticks when ruler area ≥ 200px', async () => {
    mockRulerWidth = 800
    const { container } = await renderSettled(
      <Ruler currentCycle={null} gridContentWidth={800} />,
    )
    const minor = container.querySelectorAll('[data-musical-timeline-ruler-minor]')
    // 2 cycles × (BEATS_PER_CYCLE - 1) interior beats per cycle = 6.
    expect(minor.length).toBe(6)
  })

  it('hides all minor ticks when ruler area < 200px', async () => {
    mockRulerWidth = 150
    const { container } = await renderSettled(
      <Ruler currentCycle={null} gridContentWidth={150} />,
    )
    const minor = container.querySelectorAll('[data-musical-timeline-ruler-minor]')
    expect(minor.length).toBe(0)
    // Major ticks + labels still render.
    const major = container.querySelectorAll('[data-musical-timeline-ruler-major]')
    expect(major.length).toBe(3)
  })
})

describe('Ruler — playhead arrow (DV-10)', () => {
  it('renders the arrow when currentCycle is a finite number', async () => {
    const { container } = await renderSettled(
      <Ruler currentCycle={1.0} gridContentWidth={800} />,
    )
    const arrow = container.querySelector(
      '[data-musical-timeline="ruler-playhead-arrow"]',
    )
    expect(arrow).not.toBeNull()
  })

  it('hides the arrow when currentCycle is null', async () => {
    const { container } = await renderSettled(
      <Ruler currentCycle={null} gridContentWidth={800} />,
    )
    const arrow = container.querySelector(
      '[data-musical-timeline="ruler-playhead-arrow"]',
    )
    expect(arrow).toBeNull()
  })

  it('hides the arrow when currentCycle is NaN', async () => {
    const { container } = await renderSettled(
      <Ruler currentCycle={NaN} gridContentWidth={800} />,
    )
    const arrow = container.querySelector(
      '[data-musical-timeline="ruler-playhead-arrow"]',
    )
    expect(arrow).toBeNull()
  })
})
