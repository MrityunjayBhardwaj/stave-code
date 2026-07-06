/**
 * BackdropPopover — #771 fixed-file mode.
 *
 * The pattern-file chrome opens the popover with a viz PICKER (choose a viz →
 * pin it). The viz-file chrome (via onOpenVizBackdropControls) opens it in
 * `fixedFile` mode: the target viz is already known, so the picker is replaced
 * by a static "backdrop: {name}" label while every other control (opacity,
 * quality, crop, reveal, clear, viz-span) appears exactly as in the pinned
 * pattern flow.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { BackdropPopover } from '../BackdropPopover'

afterEach(() => {
  cleanup()
})

function fakeRect(): DOMRect {
  return {
    top: 100,
    bottom: 112,
    left: 50,
    right: 62,
    width: 40,
    height: 12,
    x: 50,
    y: 100,
    toJSON: () => ({}),
  } as DOMRect
}

function baseProps() {
  return {
    anchorRect: fakeRect(),
    onClose: vi.fn(),
    vizFiles: [
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ],
    onSetBackdrop: vi.fn(),
    onCropBackground: vi.fn(),
    onRevealBackground: vi.fn(),
    initialOpacity: 0.8,
    initialQuality: 'half' as const,
    onSetOpacity: vi.fn(),
    onSetQuality: vi.fn(),
    vizSpan: 'file' as const,
    onSetVizSpan: vi.fn(),
  }
}

describe('#771 — BackdropPopover fixedFile mode', () => {
  it('replaces the picker with a static backdrop name and renders full controls', () => {
    const { getByTestId, queryByTestId } = render(
      <BackdropPopover
        {...baseProps()}
        backgroundFileId="rings"
        backgroundFileName="rings"
        fixedFile={{ id: 'rings', name: 'rings' }}
      />,
    )
    // No picker in fixed mode — the viz is already chosen.
    expect(queryByTestId('backdrop-popover-picker')).toBeNull()
    // Static name shown instead.
    expect(getByTestId('backdrop-popover-fixed-name').textContent).toBe('rings')
    // Pinned controls all present (opacity via quality/clear proxies).
    expect(getByTestId('backdrop-chrome-quality')).toBeTruthy()
    expect(getByTestId('backdrop-chrome-crop')).toBeTruthy()
    expect(getByTestId('backdrop-chrome-clear')).toBeTruthy()
    expect(getByTestId('backdrop-chrome-vizspan')).toBeTruthy()
    // The whole surface reports pinned so the pinned block renders.
    expect(getByTestId('backdrop-popover').getAttribute('data-pinned')).toBe(
      'true',
    )
  })

  it('clear routes through onSetBackdrop(null)', () => {
    const props = baseProps()
    const { getByTestId } = render(
      <BackdropPopover
        {...props}
        backgroundFileId="rings"
        backgroundFileName="rings"
        fixedFile={{ id: 'rings', name: 'rings' }}
      />,
    )
    fireEvent.click(getByTestId('backdrop-chrome-clear'))
    expect(props.onSetBackdrop).toHaveBeenCalledWith(null)
  })

  it('without fixedFile the classic picker is still rendered (pattern flow)', () => {
    const { getByTestId, queryByTestId } = render(
      <BackdropPopover
        {...baseProps()}
        backgroundFileId={null}
        backgroundFileName={null}
      />,
    )
    expect(getByTestId('backdrop-popover-picker')).toBeTruthy()
    expect(queryByTestId('backdrop-popover-fixed-name')).toBeNull()
  })
})
