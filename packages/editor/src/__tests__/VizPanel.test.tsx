import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Mock useP5Sketch so it doesn't try to instantiate p5 in tests
vi.mock('../visualizers/useP5Sketch', () => ({
  useP5Sketch: vi.fn(),
}))

// Mock p5 to prevent import errors
vi.mock('p5', () => ({ default: vi.fn() }))

import { VizPanel } from '../visualizers/VizPanel'

describe('VizPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a div with data-testid="viz-panel"', () => {
    const sketchFactory = vi.fn()
    render(
      <VizPanel
        sketchFactory={sketchFactory}
        hapStream={null}
        analyser={null}
      />
    )
    expect(screen.getByTestId('viz-panel')).toBeTruthy()
  })

  it('has default height of 200px', () => {
    const sketchFactory = vi.fn()
    render(
      <VizPanel
        sketchFactory={sketchFactory}
        hapStream={null}
        analyser={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.height).toBe('200px')
  })

  it('respects custom vizHeight prop', () => {
    const sketchFactory = vi.fn()
    render(
      <VizPanel
        sketchFactory={sketchFactory}
        hapStream={null}
        analyser={null}
        vizHeight={300}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.height).toBe('300px')
  })

  it('has background var(--background)', () => {
    const sketchFactory = vi.fn()
    render(
      <VizPanel
        sketchFactory={sketchFactory}
        hapStream={null}
        analyser={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.background).toBe('var(--background)')
  })

  it('has borderTop 1px solid var(--border)', () => {
    const sketchFactory = vi.fn()
    render(
      <VizPanel
        sketchFactory={sketchFactory}
        hapStream={null}
        analyser={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.borderTop).toBe('1px solid var(--border)')
  })

  it('has overflow hidden', () => {
    const sketchFactory = vi.fn()
    render(
      <VizPanel
        sketchFactory={sketchFactory}
        hapStream={null}
        analyser={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.overflow).toBe('hidden')
  })
})
