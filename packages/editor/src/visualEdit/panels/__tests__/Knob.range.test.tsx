/**
 * Knob range popup (#844) — observes the real DOM interaction: double-click the
 * dial opens an in-place start/end editor, Apply reports the new range, Reset
 * clears it. The write-to-code side is covered by knobsFromChunk.test.ts; this
 * pins the component wiring the unit tests can't see.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Knob } from '../Knob'
import type { KnobRange } from '../knobRanges'

afterEach(() => cleanup())

const RANGE: KnobRange = { min: 0, max: 1, step: 0.01, scale: 'linear' }

describe('Knob — custom range popup (#844)', () => {
  it('double-click opens the popup prefilled with the current range', () => {
    render(<Knob label="room" value={0.25} range={RANGE} onChange={vi.fn()} onRangeChange={vi.fn()} />)
    expect(document.querySelector('[data-knob-range-popup]')).toBeNull()
    fireEvent.doubleClick(screen.getByRole('slider'))
    const inputs = document.querySelectorAll('[data-knob-range-input]')
    expect(inputs).toHaveLength(2)
    expect((inputs[0] as HTMLInputElement).value).toBe('0')
    expect((inputs[1] as HTMLInputElement).value).toBe('1')
  })

  it('editing start/end and clicking Apply reports the new range', () => {
    const onRangeChange = vi.fn()
    render(<Knob label="room" value={0.25} range={RANGE} onChange={vi.fn()} onRangeChange={onRangeChange} />)
    fireEvent.doubleClick(screen.getByRole('slider'))
    const [minInput, maxInput] = document.querySelectorAll('[data-knob-range-input]')
    fireEvent.change(minInput, { target: { value: '0' } })
    fireEvent.change(maxInput, { target: { value: '100' } })
    fireEvent.click(document.querySelector('[data-knob-range-apply]') as Element)
    expect(onRangeChange).toHaveBeenCalledWith(0, 100)
  })

  it('a zero-span or empty entry is ignored, not written to code', () => {
    const onRangeChange = vi.fn()
    render(<Knob label="room" value={0.25} range={RANGE} onChange={vi.fn()} onRangeChange={onRangeChange} />)
    fireEvent.doubleClick(screen.getByRole('slider'))
    const [minInput, maxInput] = document.querySelectorAll('[data-knob-range-input]')
    fireEvent.change(minInput, { target: { value: '50' } })
    fireEvent.change(maxInput, { target: { value: '50' } })
    fireEvent.click(document.querySelector('[data-knob-range-apply]') as Element)
    expect(onRangeChange).not.toHaveBeenCalled()
  })

  it('Reset appears only with onRangeReset and fires it', () => {
    const onRangeReset = vi.fn()
    render(
      <Knob
        label="room"
        value={0.25}
        range={RANGE}
        onChange={vi.fn()}
        onRangeChange={vi.fn()}
        onRangeReset={onRangeReset}
      />,
    )
    fireEvent.doubleClick(screen.getByRole('slider'))
    fireEvent.click(document.querySelector('[data-knob-range-reset]') as Element)
    expect(onRangeReset).toHaveBeenCalledOnce()
  })

  it('a dial with no onRangeChange is not range-editable — double-click does nothing', () => {
    render(<Knob label="euclid 1" value={3} range={RANGE} onChange={vi.fn()} />)
    fireEvent.doubleClick(screen.getByRole('slider'))
    expect(document.querySelector('[data-knob-range-popup]')).toBeNull()
  })

  it('an outside mousedown dismisses the popup', () => {
    render(<Knob label="room" value={0.25} range={RANGE} onChange={vi.fn()} onRangeChange={vi.fn()} />)
    fireEvent.doubleClick(screen.getByRole('slider'))
    expect(document.querySelector('[data-knob-range-popup]')).not.toBeNull()
    fireEvent.mouseDown(document.body)
    expect(document.querySelector('[data-knob-range-popup]')).toBeNull()
  })
})
