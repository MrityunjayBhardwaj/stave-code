/**
 * ResolutionControl — the Slots control's own states, NAMED (#1059).
 *
 * #1059 asks for the control to be named explicitly in a gate rather than covered
 * incidentally by a corpus sweep, and it says why: the op-admissibility sweep once
 * read a clean zero while the largest dead-control population in the codebase sat
 * in the corpus it had just swept, because the one control the panel actually
 * drives was SKIPPED rather than failed. A sweep whose per-case coverage is
 * optional certifies nothing about the case it skipped.
 *
 * So this file asserts the control itself: what it renders, which target it asks
 * about, and which target it hands back on click.
 *
 * ── THE ONE THING THAT IS EASY TO GET WRONG HERE ──────────────────────────────
 * `steps` is what is DRAWN, so the relative targets are `steps × 2` and `steps ÷ 2`
 * — and the control must ASK `slotState` about exactly those, never decide for
 * itself whether they are free. Every assertion below therefore drives a stub
 * `slotState` and checks the target it was asked about, which is the only way to
 * see the difference between "the control asked the right question" and "the
 * control guessed the right answer" ([[P433]] — a check that reconstructs a
 * decision instead of reading it is wrong in the permissive direction).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ResolutionControl } from '../ResolutionControl'
import type { SlotState } from '../../notation/resolution'

afterEach(() => cleanup())

/** render with a slotState driven by an explicit target→state table */
function mount(steps: number, table: Record<number, SlotState>, fallback: SlotState = 'disabled') {
  const asked: number[] = []
  const onScaleTo = vi.fn()
  const slotState = (t: number): SlotState => {
    asked.push(t)
    return table[t] ?? fallback
  }
  render(<ResolutionControl steps={steps} slotState={slotState} onScaleTo={onScaleTo} />)
  return { asked, onScaleTo }
}

const halve = (): HTMLButtonElement =>
  document.querySelector('[data-resolution-halve]') as HTMLButtonElement
const double = (): HTMLButtonElement =>
  document.querySelector('[data-resolution-double]') as HTMLButtonElement
const readout = (): HTMLButtonElement =>
  document.querySelector('[data-resolution-current]') as HTMLButtonElement
const presets = (): HTMLButtonElement[] =>
  [...document.querySelectorAll('[data-resolution-step]')] as HTMLButtonElement[]

describe('ResolutionControl — the relative steps', () => {
  it('renders ÷2, the current count, and ×2', () => {
    mount(16, { 8: 'view', 32: 'view' })
    expect(halve()).not.toBeNull()
    expect(double()).not.toBeNull()
    expect(readout().textContent).toBe('16')
    expect(readout().getAttribute('data-resolution-current')).toBe('16')
  })

  it('asks slotState about steps÷2 and steps×2 — the DRAWN count, not the document', () => {
    const { asked } = mount(16, { 8: 'view', 32: 'view' })
    expect(asked).toContain(8)
    expect(asked).toContain(32)
  })

  it('hands back the TARGET it asked about, not the direction', () => {
    const { onScaleTo } = mount(16, { 8: 'view', 32: 'view' })
    fireEvent.click(double())
    expect(onScaleTo).toHaveBeenCalledWith(32)
    fireEvent.click(halve())
    expect(onScaleTo).toHaveBeenCalledWith(8)
  })

  it('a free target is marked view and carries NO write cue', () => {
    mount(16, { 32: 'view' })
    expect(double().getAttribute('data-resolution-view')).toBe('true')
    expect(double().getAttribute('data-resolution-writes')).toBeNull()
    expect(double().textContent).toBe('×2')
    expect(double().disabled).toBe(false)
  })

  /**
   * THE CUE CHANGE #1059 ASKS FOR, AND ITS OWN CONTROL ARM.
   *
   * The cue used to mark `quantize` alone and mean "this changes your timing".
   * #1059 makes it mean "this rewrites your file" — and `lossless` writes too. The
   * `lossless` case IS the arm: under the previous rule it rendered a bare `÷2`,
   * identical to a free target, so this assertion fails against the code it
   * replaces rather than merely passing against the code it describes ([[P353]] —
   * a zero that was never reachable certifies nothing).
   */
  it('BOTH writing states carry the ~ cue — lossless as well as quantize', () => {
    for (const state of ['lossless', 'quantize'] as SlotState[]) {
      mount(16, { 8: state })
      expect(halve().getAttribute('data-resolution-writes'), state).toBe('true')
      expect(halve().textContent, state).toBe('~÷2')
      expect(halve().getAttribute('data-resolution-view'), state).toBeNull()
      expect(halve().disabled, state).toBe(false)
      expect(halve().title, state).toContain('rewrites your file')
      cleanup()
    }
  })

  it('a disabled target is not pressable and does not call back', () => {
    const { onScaleTo } = mount(16, { 8: 'disabled' })
    expect(halve().disabled).toBe(true)
    fireEvent.click(halve())
    expect(onScaleTo).not.toHaveBeenCalled()
  })

  it('÷2 is unavailable on an odd count — there is no integer grid to ask about', () => {
    const { asked, onScaleTo } = mount(5, { 10: 'view' })
    expect(halve().disabled).toBe(true)
    expect(halve().title).toContain('odd slot count')
    // and it must not have INVENTED a fractional target to ask about
    expect(asked).not.toContain(2.5)
    fireEvent.click(halve())
    expect(onScaleTo).not.toHaveBeenCalled()
  })
})

describe('ResolutionControl — the preset dropdown', () => {
  it('presets are absent until the readout is double-clicked', () => {
    mount(16, { 4: 'quantize', 8: 'view', 32: 'view', 64: 'view' })
    expect(presets()).toHaveLength(0)
    fireEvent.doubleClick(readout())
    expect(presets()).toHaveLength(5)
    expect(presets().map((b) => b.getAttribute('data-resolution-step'))).toEqual([
      '4',
      '8',
      '16',
      '32',
      '64',
    ])
  })

  it('a single click does NOT open it — the gesture is a double-click', () => {
    mount(16, {})
    fireEvent.click(readout())
    expect(presets()).toHaveLength(0)
  })

  it('opens from the keyboard too, since a double-click has no keyboard analogue', () => {
    mount(16, {})
    fireEvent.keyDown(readout(), { key: 'Enter' })
    expect(presets()).toHaveLength(5)
  })

  it('choosing a preset hands back that preset and closes', () => {
    const { onScaleTo } = mount(16, { 32: 'view' })
    fireEvent.doubleClick(readout())
    const target = presets().find((b) => b.getAttribute('data-resolution-step') === '32')!
    fireEvent.click(target)
    expect(onScaleTo).toHaveBeenCalledWith(32)
    expect(presets()).toHaveLength(0)
  })

  it('the current count is the active preset and is not a write', () => {
    mount(16, {})
    fireEvent.doubleClick(readout())
    const current = presets().find((b) => b.getAttribute('data-resolution-step') === '16')!
    expect(current.getAttribute('data-resolution-active')).toBe('true')
    expect(current.getAttribute('data-resolution-writes')).toBeNull()
  })

  it('a writing preset is cued and a free one is not — the same rule as the steps', () => {
    mount(16, { 4: 'quantize', 32: 'view' })
    fireEvent.doubleClick(readout())
    const four = presets().find((b) => b.getAttribute('data-resolution-step') === '4')!
    const thirtyTwo = presets().find((b) => b.getAttribute('data-resolution-step') === '32')!
    expect(four.getAttribute('data-resolution-writes')).toBe('true')
    expect(four.textContent).toBe('~4')
    expect(thirtyTwo.getAttribute('data-resolution-view')).toBe('true')
    expect(thirtyTwo.textContent).toBe('32')
  })

  it('Escape closes it', () => {
    mount(16, {})
    fireEvent.doubleClick(readout())
    expect(presets()).toHaveLength(5)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(presets()).toHaveLength(0)
  })
})
