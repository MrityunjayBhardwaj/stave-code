/**
 * useKeyboardCommands -- unit tests (Phase 10.2 Task 08).
 *
 * Covers the Cmd+K chord detection:
 *   - Cmd+K then V --> workspace.openPreviewToSide fires
 *   - Cmd+K then B --> workspace.toggleBackgroundPreview fires
 *   - Cmd+K then wrong key --> no command fires, chord exits
 *   - Cmd+K timeout (1s) --> chord expires, subsequent V is normal keystroke
 *   - Standalone V without Cmd+K --> no command fires
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'
import { useKeyboardCommands, type UseKeyboardCommandsOptions } from '../useKeyboardCommands'
import { resetCommandRegistryForTests } from '../CommandRegistry'
import type { WorkspaceTab } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTab(fileId: string): WorkspaceTab {
  return { kind: 'editor', id: `tab-${fileId}`, fileId }
}

const hydraProvider = {
  extensions: ['hydra'],
  label: 'Hydra',
  keepRunningWhenHidden: false,
  reload: 'instant' as const,
  render: () => null,
}

function makeOpts(
  overrides?: Partial<UseKeyboardCommandsOptions>,
): UseKeyboardCommandsOptions {
  return {
    getActiveTab: () => makeTab('pianoroll.hydra'),
    getActiveGroupId: () => 'g1',
    getActiveGroup: () => ({ id: 'g1', tabs: [], activeTabId: null }),
    shellActions: {
      addTab: vi.fn(),
      splitGroupWithTab: vi.fn(),
      updateGroupBackground: vi.fn(),
      closeTab: vi.fn(),
      findTabByFileId: vi.fn(() => null),
      openPopoutPreview: vi.fn(),
    },
    getPreviewProvider: (lang) => (lang === 'hydra' ? hydraProvider : undefined),
    ...overrides,
  }
}

/**
 * Minimal test component that wires the hook.
 */
function TestHarness({ opts }: { opts: UseKeyboardCommandsOptions }) {
  useKeyboardCommands(opts)
  return <div data-testid="harness" />
}

function fireKeyDown(
  key: string,
  modifiers?: { metaKey?: boolean; ctrlKey?: boolean },
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers?.metaKey ?? false,
    ctrlKey: modifiers?.ctrlKey ?? false,
  })
  window.dispatchEvent(event)
  return event
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useKeyboardCommands', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetCommandRegistryForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Cmd+K then V dispatches workspace.openPreviewToSide', () => {
    const opts = makeOpts()
    render(<TestHarness opts={opts} />)

    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('v')
    })

    expect(opts.shellActions.splitGroupWithTab).toHaveBeenCalledTimes(1)
  })

  it('Cmd+K then B dispatches workspace.toggleBackgroundPreview', () => {
    const opts = makeOpts()
    render(<TestHarness opts={opts} />)

    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('b')
    })

    expect(opts.shellActions.updateGroupBackground).toHaveBeenCalledTimes(1)
  })

  it('Cmd+K then W dispatches workspace.openPreviewInWindow', () => {
    const opts = makeOpts()
    render(<TestHarness opts={opts} />)

    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('w')
    })

    expect(opts.shellActions.openPopoutPreview).toHaveBeenCalledTimes(1)
  })

  it('Cmd+K then wrong key exits chord, no command fires', () => {
    const opts = makeOpts()
    render(<TestHarness opts={opts} />)

    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('x')
    })

    expect(opts.shellActions.splitGroupWithTab).not.toHaveBeenCalled()
    expect(opts.shellActions.updateGroupBackground).not.toHaveBeenCalled()
    expect(opts.shellActions.openPopoutPreview).not.toHaveBeenCalled()
  })

  it('Cmd+K timeout expires, subsequent V is a normal keystroke', () => {
    const opts = makeOpts()
    render(<TestHarness opts={opts} />)

    act(() => {
      fireKeyDown('k', { metaKey: true })
    })

    // Advance past the chord timeout (1s)
    act(() => {
      vi.advanceTimersByTime(1100)
    })

    act(() => {
      fireKeyDown('v')
    })

    // No command should have fired -- the chord expired.
    expect(opts.shellActions.splitGroupWithTab).not.toHaveBeenCalled()
  })

  it('standalone V without Cmd+K does not fire any command', () => {
    const opts = makeOpts()
    render(<TestHarness opts={opts} />)

    act(() => {
      fireKeyDown('v')
    })

    expect(opts.shellActions.splitGroupWithTab).not.toHaveBeenCalled()
    expect(opts.shellActions.updateGroupBackground).not.toHaveBeenCalled()
    expect(opts.shellActions.openPopoutPreview).not.toHaveBeenCalled()
  })

  it('Ctrl+K works as alternative to Cmd+K', () => {
    const opts = makeOpts()
    render(<TestHarness opts={opts} />)

    act(() => {
      fireKeyDown('k', { ctrlKey: true })
    })
    act(() => {
      fireKeyDown('v')
    })

    expect(opts.shellActions.splitGroupWithTab).toHaveBeenCalledTimes(1)
  })

  it('cleans up listener on unmount', () => {
    const opts = makeOpts()
    const { unmount } = render(<TestHarness opts={opts} />)

    unmount()

    // After unmount, Cmd+K V should not fire.
    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('v')
    })

    expect(opts.shellActions.splitGroupWithTab).not.toHaveBeenCalled()
  })
})
