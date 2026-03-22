import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Mock useVizRenderer so it doesn't try to instantiate renderers in tests
vi.mock('../visualizers/useVizRenderer', () => ({
  useVizRenderer: vi.fn(),
}))

// Mock p5 to prevent import errors
vi.mock('p5', () => ({ default: vi.fn() }))

import { VizPanel } from '../visualizers/VizPanel'

describe('VizPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockSource = vi.fn()

  it('renders a div with data-testid="viz-panel"', () => {
    render(
      <VizPanel
        source={mockSource}
        hapStream={null}
        analyser={null}
        scheduler={null}
      />
    )
    expect(screen.getByTestId('viz-panel')).toBeTruthy()
  })

  it('has default height of 200px', () => {
    render(
      <VizPanel
        source={mockSource}
        hapStream={null}
        analyser={null}
        scheduler={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.height).toBe('200px')
  })

  it('respects custom vizHeight prop', () => {
    render(
      <VizPanel
        source={mockSource}
        hapStream={null}
        analyser={null}
        scheduler={null}
        vizHeight={300}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.height).toBe('300px')
  })

  it('has background var(--background)', () => {
    render(
      <VizPanel
        source={mockSource}
        hapStream={null}
        analyser={null}
        scheduler={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.background).toBe('var(--background)')
  })

  it('has borderTop 1px solid var(--border)', () => {
    render(
      <VizPanel
        source={mockSource}
        hapStream={null}
        analyser={null}
        scheduler={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.borderTop).toBe('1px solid var(--border)')
  })

  it('has overflow hidden', () => {
    render(
      <VizPanel
        source={mockSource}
        hapStream={null}
        analyser={null}
        scheduler={null}
      />
    )
    const panel = screen.getByTestId('viz-panel')
    expect(panel.style.overflow).toBe('hidden')
  })
})
