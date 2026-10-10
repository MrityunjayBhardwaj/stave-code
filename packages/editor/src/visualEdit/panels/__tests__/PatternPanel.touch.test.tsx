/**
 * The Pattern tab on a phone or tablet shows the grid alone (#1990).
 *
 * The panel's children are replaced with markers: this is about which columns the
 * panel draws, not about what is in them. The browser's answer to "is the main pointer
 * a finger" is a stand-in `matchMedia` the test can flip while the panel is mounted.
 */
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

vi.mock('../useActiveChunk', () => ({ useActiveChunk: () => ({ chunk: null }) }))
vi.mock('../../../codeView', () => ({ chunkSurface: () => null }))
vi.mock('../SequencerGrid', () => ({ SequencerGrid: () => null }))
vi.mock('../PianoRollGrid', () => ({ PianoRollGrid: () => null }))
vi.mock('../VisualEditStandby', () => ({ VisualEditStandby: () => <div data-standby /> }))
vi.mock('../../mixer/MixerPanel', () => ({ MixerPanel: () => <div data-mixer-body /> }))

import { PatternPanel } from '../PatternPanel'
import { TOUCH_DEVICE_QUERY } from '../useTouchDevice'

/** a `matchMedia` whose answer for the touch query can be changed while mounted */
function pointer(coarse: boolean): { set(next: boolean): void; asked: string[] } {
  let matches = coarse
  const listeners = new Set<() => void>()
  const asked: string[] = []
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
  }
  window.matchMedia = ((q: string) => {
    asked.push(q)
    return mql
  }) as unknown as typeof window.matchMedia
  return {
    asked,
    set(next) {
      matches = next
      for (const fn of [...listeners]) fn()
    },
  }
}

const original = window.matchMedia
afterEach(() => {
  cleanup()
  window.matchMedia = original
})

const mixer = (root: HTMLElement): Element | null => root.querySelector('[data-pattern-mixer]')
const grid = (root: HTMLElement): Element | null => root.querySelector('[data-pattern-grid]')

describe('PatternPanel — the right column on a phone or tablet', () => {
  it('a mouse: the grid and the column, as before', () => {
    const p = pointer(false)
    const { container } = render(<PatternPanel />)
    expect(grid(container)).not.toBeNull()
    expect(mixer(container)).not.toBeNull()
    expect(container.querySelector('[data-mixer-body]')).not.toBeNull()
    // the question put to the browser is the pointer one, not a width
    expect(new Set(p.asked)).toEqual(new Set([TOUCH_DEVICE_QUERY]))
  })

  it('a finger: the grid alone', () => {
    pointer(true)
    const { container } = render(<PatternPanel />)
    expect(grid(container)).not.toBeNull()
    expect(mixer(container)).toBeNull()
    expect(container.querySelector('[data-mixer-body]')).toBeNull()
  })

  it('follows a change while the panel is open, both ways', () => {
    const p = pointer(false)
    const { container } = render(<PatternPanel />)
    expect(mixer(container)).not.toBeNull()
    act(() => p.set(true))
    expect(mixer(container)).toBeNull()
    act(() => p.set(false))
    expect(mixer(container)).not.toBeNull()
  })

  it('a browser with no matchMedia at all is a desktop', () => {
    ;(window as { matchMedia?: unknown }).matchMedia = undefined
    const { container } = render(<PatternPanel />)
    expect(mixer(container)).not.toBeNull()
  })
})
