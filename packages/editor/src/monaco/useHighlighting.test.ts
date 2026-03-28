import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHighlighting } from './useHighlighting'
import { HapStream } from '../engine/HapStream'

// ---- Mock factory helpers ----

function makeCollection() {
  return { clear: vi.fn(), append: vi.fn(), set: vi.fn() }
}

function makeModel() {
  return {
    getPositionAt: vi.fn((offset: number) => ({ lineNumber: 1, column: offset + 1 })),
  }
}

function makeEditor() {
  const editor = {
    createDecorationsCollection: vi.fn(() => makeCollection()),
    getModel: vi.fn(() => makeModel()),
  }
  return editor
}

/** Build a hap object that produces the specified loc via HapStream.emit enrichment */
function makeHap(
  overrides: {
    loc?: Array<{ start: number; end: number }> | null
    color?: string | null
  } = {}
) {
  const loc = overrides.loc !== undefined ? overrides.loc : [{ start: 0, end: 5 }]
  return {
    context: { locations: loc },
    value: { color: overrides.color ?? null },
  }
}

describe('useHighlighting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('(HIGH-01) shows decoration after scheduledAheadMs ms', () => {
    const editor = makeEditor()
    const hapStream = new HapStream()
    const { result } = renderHook(() =>
      useHighlighting(editor as any, hapStream)
    )
    expect(result.current).toBeDefined()

    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0) // scheduledAheadMs = 100ms
    })

    // Before 100ms — no decoration
    act(() => { vi.advanceTimersByTime(99) })
    expect(editor.createDecorationsCollection).not.toHaveBeenCalled()

    // At 100ms — decoration created
    act(() => { vi.advanceTimersByTime(1) })
    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1)

    const decorationArg = (editor.createDecorationsCollection.mock.calls[0] as unknown[])[0] as unknown[]
    expect((decorationArg[0] as any).options.className).toContain('strudel-active-hap')
  })

  it('(HIGH-02) decoration not created at 99ms, created at 100ms (exact timing)', () => {
    const editor = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0) // scheduledAheadMs = 100ms
    })

    act(() => { vi.advanceTimersByTime(99) })
    expect(editor.createDecorationsCollection).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(1) })
    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1)
  })

  it('(HIGH-03) clears decoration at scheduledAheadMs + audioDuration*1000 ms', () => {
    const collection = makeCollection()
    const editor = {
      createDecorationsCollection: vi.fn(() => collection),
      getModel: vi.fn(() => makeModel()),
    }
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // scheduledAheadMs=100, audioDuration=0.5 => clear at 600ms
    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0)
    })

    // Show at 100ms
    act(() => { vi.advanceTimersByTime(100) })
    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1)

    // Not cleared at 599ms
    act(() => { vi.advanceTimersByTime(499) })
    expect(collection.clear).not.toHaveBeenCalled()

    // Cleared at 600ms total
    act(() => { vi.advanceTimersByTime(1) })
    expect(collection.clear).toHaveBeenCalledTimes(1)
  })

  it('(HIGH-04) two haps at same loc have independent lifecycles', () => {
    const col1 = makeCollection()
    const col2 = makeCollection()
    let callCount = 0
    const editor = {
      createDecorationsCollection: vi.fn(() => {
        callCount++
        return callCount === 1 ? col1 : col2
      }),
      getModel: vi.fn(() => makeModel()),
    }
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // Hap 1: scheduledAheadMs=100, audioDuration=0.5 => show@100, clear@600
    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0)
    })

    // Hap 2: scheduledAheadMs=200, audioDuration=0.5 => show@200, clear@700
    act(() => {
      hapStream.emit(makeHap(), 0.2, 0.5, 1, 0)
    })

    // Advance to 700ms — hap1 show@100, clear@600; hap2 show@200
    act(() => { vi.advanceTimersByTime(600) })
    expect(col1.clear).toHaveBeenCalledTimes(1)
    expect(col2.clear).not.toHaveBeenCalled()

    // col2 cleared at 700ms
    act(() => { vi.advanceTimersByTime(100) })
    expect(col2.clear).toHaveBeenCalledTimes(1)
  })

  it('(HIGH-05) null loc hap is silently skipped', () => {
    const editor = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    act(() => {
      hapStream.emit(makeHap({ loc: null }), 0.1, 0.5, 1, 0)
    })

    act(() => { vi.advanceTimersByTime(1000) })
    expect(editor.createDecorationsCollection).not.toHaveBeenCalled()
  })

  it('cleanup cancels all pending timeouts when hapStream changes', () => {
    const editor = makeEditor()
    const hapStream1 = new HapStream()
    const hapStream2 = new HapStream()

    const { rerender } = renderHook(
      ({ hs }) => useHighlighting(editor as any, hs),
      { initialProps: { hs: hapStream1 as any } }
    )

    // Emit on first hapStream
    act(() => {
      hapStream1.emit(makeHap(), 0.1, 0.5, 1, 0)
    })

    // Switch hapStream — triggers cleanup of first effect
    act(() => {
      rerender({ hs: hapStream2 as any })
    })

    // Advance timers — no decoration should have been created from the cancelled timeout
    act(() => { vi.advanceTimersByTime(1000) })
    expect(editor.createDecorationsCollection).not.toHaveBeenCalled()
  })

  it('late hap with negative scheduledAheadMs clamps to 0 and shows immediately', () => {
    const editor = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // audioCtxCurrentTime > time => negative scheduledAheadMs
    act(() => {
      hapStream.emit(makeHap(), 0.05, 0.5, 1, 0.1) // scheduledAheadMs = (0.05-0.1)*1000 = -50ms
    })

    // Should appear at 0ms (clamped)
    act(() => { vi.advanceTimersByTime(0) })
    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1)
  })

  it('per-note color hap includes strudel-active-hap base class', () => {
    const editor = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // Emit with color
    act(() => {
      hapStream.emit(makeHap({ color: '#ff0000' }), 0.1, 0.5, 1, 0)
    })

    act(() => { vi.advanceTimersByTime(100) })
    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1)
    const decorations = (editor.createDecorationsCollection.mock.calls[0] as unknown[])[0] as unknown[]
    expect((decorations[0] as any).options.className).toContain('strudel-active-hap')
  })
})
