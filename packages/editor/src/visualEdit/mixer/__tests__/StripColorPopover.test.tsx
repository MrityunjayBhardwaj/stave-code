/**
 * StripColorPopover — the Mixer's per-track colour picker (Phase D, #581).
 *
 * Covers the close behaviours, with focus on #587: the popover is positioned
 * from the anchor rect captured on open and does not track the dot afterwards,
 * so it must CLOSE on scroll/resize rather than float away. The editor sibling
 * of the app `TrackSwatchPopover`; both share this fix.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { StripColorPopover } from '../StripColorPopover'

afterEach(() => cleanup())

function fakeRect(): DOMRect {
  return {
    top: 100, bottom: 112, left: 50, right: 62,
    width: 12, height: 12, x: 50, y: 100, toJSON: () => ({}),
  } as DOMRect
}

describe('StripColorPopover — close behaviours', () => {
  it('renders 32 swatches over the shared palette', () => {
    render(<StripColorPopover anchorRect={fakeRect()} onPick={vi.fn()} onClose={vi.fn()} />)
    expect(document.querySelectorAll('[data-mixer-strip-swatch]')).toHaveLength(32)
  })

  it('Escape closes', () => {
    const onClose = vi.fn()
    render(<StripColorPopover anchorRect={fakeRect()} onPick={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // #587 — the console strip row scrolls; the popover would float away from its
  // dot. Close on scroll (capture → any ancestor) and resize (covers zoom).
  it('a scroll closes the popover (#587)', () => {
    const onClose = vi.fn()
    render(<StripColorPopover anchorRect={fakeRect()} onPick={vi.fn()} onClose={onClose} />)
    fireEvent.scroll(window, {})
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a window resize closes the popover (#587)', () => {
    const onClose = vi.fn()
    render(<StripColorPopover anchorRect={fakeRect()} onPick={vi.fn()} onClose={onClose} />)
    fireEvent(window, new Event('resize'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
