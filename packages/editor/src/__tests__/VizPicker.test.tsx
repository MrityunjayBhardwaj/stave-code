import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { VizPicker } from '../visualizers/VizPicker'
import { DEFAULT_VIZ_DESCRIPTORS } from '../visualizers/defaultDescriptors'

describe('VizPicker', () => {
  it('renders 7 mode buttons from DEFAULT_VIZ_DESCRIPTORS', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} />)
    expect(screen.getByTestId('viz-btn-pianoroll')).toBeTruthy()
    expect(screen.getByTestId('viz-btn-scope')).toBeTruthy()
    expect(screen.getByTestId('viz-btn-spectrum')).toBeTruthy()
    expect(screen.getByTestId('viz-btn-spiral')).toBeTruthy()
    expect(screen.getByTestId('viz-btn-pitchwheel')).toBeTruthy()
  })

  it('default active button pianoroll has data-active="true"', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} />)
    expect(screen.getByTestId('viz-btn-pianoroll').getAttribute('data-active')).toBe('true')
  })

  it('non-active buttons do not have data-active="true"', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} />)
    expect(screen.getByTestId('viz-btn-scope').getAttribute('data-active')).toBeNull()
    expect(screen.getByTestId('viz-btn-spectrum').getAttribute('data-active')).toBeNull()
  })

  it('clicking scope button calls onIdChange with "scope"', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} />)
    fireEvent.click(screen.getByTestId('viz-btn-scope'))
    expect(onIdChange).toHaveBeenCalledWith('scope')
    expect(onIdChange).toHaveBeenCalledTimes(1)
  })

  it('container has height 32px', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} />)
    const container = screen.getByTestId('viz-picker')
    expect(container.style.height).toBe('32px')
  })

  it('container has background var(--surface)', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} />)
    const container = screen.getByTestId('viz-picker')
    expect(container.style.background).toBe('var(--surface)')
  })

  it('container has borderBottom 1px solid var(--border)', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} />)
    const container = screen.getByTestId('viz-picker')
    expect(container.style.borderBottom).toBe('1px solid var(--border)')
  })

  it('returns null when showVizPicker is false', () => {
    const onIdChange = vi.fn()
    const { container } = render(
      <VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={onIdChange} showVizPicker={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('active button has accent styling', () => {
    const onIdChange = vi.fn()
    render(<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="scope" onIdChange={onIdChange} />)
    const scopeBtn = screen.getByTestId('viz-btn-scope')
    expect(scopeBtn.getAttribute('data-active')).toBe('true')
    expect(scopeBtn.style.background).toBe('var(--accent-dim)')
    expect(scopeBtn.style.outline).toBe('1px solid var(--accent)')
  })
})
