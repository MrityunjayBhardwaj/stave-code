import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHighlighting } from './useHighlighting'
import { HapStream } from '../engine/HapStream'

// ---- Mock factory helpers ----
//
// #339 — the hook now paints highlights at the CURRENT range of an invisible
// "anchor" decoration that Monaco keeps position-correct across edits, instead
// of recomputing getPositionAt() per hap. So each hap that highlights produces
// TWO createDecorationsCollection calls: first an ANCHOR (options has no
// className, created at emit), then the visible HIGHLIGHT (options.className,
// created at show). Tests assert on the HIGHLIGHT decorations specifically.

const ANCHOR_RANGE = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 6,
}

function makeCollection(range: typeof ANCHOR_RANGE = ANCHOR_RANGE) {
  return {
    clear: vi.fn(),
    append: vi.fn(),
    set: vi.fn(),
    getRange: vi.fn(() => range),
  }
}

function makeModel() {
  return {
    getPositionAt: vi.fn((offset: number) => ({ lineNumber: 1, column: offset + 1 })),
    onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
  }
}

interface RecordedCollection {
  col: ReturnType<typeof makeCollection>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decos: any[]
  isHighlight: boolean
}

function makeEditor(anchorRange: typeof ANCHOR_RANGE = ANCHOR_RANGE) {
  const collections: RecordedCollection[] = []
  const editor = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createDecorationsCollection: vi.fn((decos: any[]) => {
      const isHighlight = !!decos?.[0]?.options?.className
      // Anchors must return a live range (Monaco-tracked); highlights don't
      // need getRange but a shared shape is fine.
      const col = makeCollection(anchorRange)
      collections.push({ col, decos, isHighlight })
      return col
    }),
    getModel: vi.fn(() => makeModel()),
  }
  const highlights = () => collections.filter((c) => c.isHighlight)
  const anchors = () => collections.filter((c) => !c.isHighlight)
  return { editor, collections, highlights, anchors }
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

  it('(HIGH-01) shows highlight after scheduledAheadMs ms', () => {
    const { editor, highlights } = makeEditor()
    const hapStream = new HapStream()
    const { result } = renderHook(() =>
      useHighlighting(editor as any, hapStream)
    )
    expect(result.current).toBeDefined()

    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0) // scheduledAheadMs = 100ms
    })

    // Before 100ms — anchor may exist, but no visible highlight yet.
    act(() => { vi.advanceTimersByTime(99) })
    expect(highlights()).toHaveLength(0)

    // At 100ms — highlight created
    act(() => { vi.advanceTimersByTime(1) })
    expect(highlights()).toHaveLength(1)
    expect(highlights()[0].decos[0].options.className).toContain('strudel-active-hap')
  })

  it('(HIGH-02) highlight not created at 99ms, created at 100ms (exact timing)', () => {
    const { editor, highlights } = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0) // scheduledAheadMs = 100ms
    })

    act(() => { vi.advanceTimersByTime(99) })
    expect(highlights()).toHaveLength(0)

    act(() => { vi.advanceTimersByTime(1) })
    expect(highlights()).toHaveLength(1)
  })

  it('(HIGH-03) clears highlight at scheduledAheadMs + audioDuration*1000 ms', () => {
    const { editor, highlights } = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // scheduledAheadMs=100, audioDuration=0.5 => clear at 600ms
    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0)
    })

    // Show at 100ms
    act(() => { vi.advanceTimersByTime(100) })
    expect(highlights()).toHaveLength(1)
    const hl = highlights()[0].col

    // Not cleared at 599ms
    act(() => { vi.advanceTimersByTime(499) })
    expect(hl.clear).not.toHaveBeenCalled()

    // Cleared at 600ms total
    act(() => { vi.advanceTimersByTime(1) })
    expect(hl.clear).toHaveBeenCalledTimes(1)
  })

  it('(HIGH-04) two haps at same loc have independent highlight lifecycles', () => {
    const { editor, highlights } = makeEditor()
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

    // Advance to 600ms — both highlights shown (@100, @200); hap1 clears @600.
    act(() => { vi.advanceTimersByTime(600) })
    expect(highlights()).toHaveLength(2)
    const [hl1, hl2] = highlights().map((h) => h.col)
    expect(hl1.clear).toHaveBeenCalledTimes(1)
    expect(hl2.clear).not.toHaveBeenCalled()

    // hl2 cleared at 700ms
    act(() => { vi.advanceTimersByTime(100) })
    expect(hl2.clear).toHaveBeenCalledTimes(1)
  })

  it('(HIGH-04b) two haps at same loc/epoch SHARE one anchor (deduped)', () => {
    const { editor, anchors } = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0)
      hapStream.emit(makeHap(), 0.2, 0.5, 1, 0)
    })

    // Same loc, same (default 0) epoch → exactly ONE anchor for both haps.
    expect(anchors()).toHaveLength(1)
  })

  it('(HIGH-05) null loc hap is silently skipped (no anchor, no highlight)', () => {
    const { editor, collections } = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    act(() => {
      hapStream.emit(makeHap({ loc: null }), 0.1, 0.5, 1, 0)
    })

    act(() => { vi.advanceTimersByTime(1000) })
    expect(collections).toHaveLength(0)
  })

  it('(#339) highlight paints at the anchor CURRENT range, not the raw loc offset', () => {
    // Anchor tracks to line 3 (as Monaco would after edits inserted 2 lines
    // above). locToRange of {0,5} would be line 1 — so a line-3 highlight
    // proves the paint used the tracked anchor, not getPositionAt(staleOffset).
    const TRACKED = { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 6 }
    const { editor, highlights } = makeEditor(TRACKED)
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    act(() => {
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0)
    })
    act(() => { vi.advanceTimersByTime(100) })

    expect(highlights()).toHaveLength(1)
    expect(highlights()[0].decos[0].range).toEqual(TRACKED)
  })

  it('(#339) a new eval epoch rebuilds anchors', () => {
    const { editor, anchors } = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // Epoch 1 — first anchor.
    act(() => {
      hapStream.setEpoch(1)
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0)
    })
    expect(anchors()).toHaveLength(1)
    const firstAnchor = anchors()[0].col

    // Epoch 2 (fresh eval) — old anchor cleared, a new one created.
    act(() => {
      hapStream.setEpoch(2)
      hapStream.emit(makeHap(), 0.1, 0.5, 1, 0)
    })
    expect(firstAnchor.clear).toHaveBeenCalled()
    expect(anchors()).toHaveLength(2)
  })

  it('cleanup cancels all pending timeouts when hapStream changes', () => {
    const { editor, highlights } = makeEditor()
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

    // Switch hapStream — triggers cleanup of first effect (cancels show timer)
    act(() => {
      rerender({ hs: hapStream2 as any })
    })

    // Advance timers — no highlight should appear from the cancelled timeout
    act(() => { vi.advanceTimersByTime(1000) })
    expect(highlights()).toHaveLength(0)
  })

  it('late hap with negative scheduledAheadMs clamps to 0 and shows immediately', () => {
    const { editor, highlights } = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // audioCtxCurrentTime > time => negative scheduledAheadMs
    act(() => {
      hapStream.emit(makeHap(), 0.05, 0.5, 1, 0.1) // scheduledAheadMs = (0.05-0.1)*1000 = -50ms
    })

    // Should appear at 0ms (clamped)
    act(() => { vi.advanceTimersByTime(0) })
    expect(highlights()).toHaveLength(1)
  })

  it('per-note color hap includes strudel-active-hap base class', () => {
    const { editor, highlights } = makeEditor()
    const hapStream = new HapStream()
    renderHook(() => useHighlighting(editor as any, hapStream))

    // Emit with color
    act(() => {
      hapStream.emit(makeHap({ color: '#ff0000' }), 0.1, 0.5, 1, 0)
    })

    act(() => { vi.advanceTimersByTime(100) })
    expect(highlights()).toHaveLength(1)
    expect(highlights()[0].decos[0].options.className).toContain('strudel-active-hap')
  })
})
