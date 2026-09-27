/**
 * ExtendHandle — the `+` just past a grid's last column (#1824).
 *
 *   click  → add one bar that continues the pattern (Logic's Step Sequencer:
 *            "the added steps duplicate the existing pattern")
 *   drag   → grow the grid one column at a time while held; on release, add that
 *            many columns' worth of EMPTY bars, rounded up (Logic's region resize:
 *            "lengthen a MIDI region to add silence"). Whole bars, because a
 *            pattern whose length is not a whole number of cycles is one neither
 *            grid can draw.
 *
 * Positioned by MEASURING the grid's last column rather than by arithmetic: the
 * cells are flexible (12–44px) and the two grids lay out their rows differently.
 * `cellAttr` names the attribute both grids put on every cell, whose value ends in
 * `:<step>`.
 */
import * as React from 'react'

import type { PatternLength } from './usePatternLength'

/** px the pointer may wander on a press before it counts as a drag */
const CLICK_SLOP_PX = 4

export interface ExtendHandleProps {
  length: PatternLength
  /** the grid element whose cells are measured */
  gridRef: React.RefObject<HTMLElement | null>
  /** `data-roll-cell` or `data-seq-cell` */
  cellAttr: string
  /** drawn columns (the model's `steps`) */
  cols: number
}

interface Frame {
  /** px, relative to the handle's positioned parent */
  left: number
  top: number
  height: number
  /** px from one column's left edge to the next's */
  pitch: number
  /** the parent's inner width — nothing drawn here may end past it */
  maxRight: number
}

export function ExtendHandle({ length, gridRef, cellAttr, cols }: ExtendHandleProps): React.ReactElement | null {
  const selfRef = React.useRef<HTMLButtonElement | null>(null)
  const [frame, setFrame] = React.useState<Frame | null>(null)
  const [added, setAdded] = React.useState(0)
  // Pointer or focus on the handle — only then is the (Strudel-querying) verdict asked.
  const [engaged, setEngaged] = React.useState(false)
  const dragRef = React.useRef<{ x: number; moved: boolean } | null>(null)
  // The click that follows a drag's pointerup must not also add a bar.
  const swallowClick = React.useRef(false)

  const measure = React.useCallback(() => {
    const grid = gridRef.current
    const parent = selfRef.current?.offsetParent as HTMLElement | null
    if (!grid || !parent || cols < 1) return
    const last = grid.querySelectorAll<HTMLElement>(`[${cellAttr}$=":${cols - 1}"]`)
    const prev = grid.querySelector<HTMLElement>(`[${cellAttr}$=":${cols - 2}"]`)
    if (last.length === 0) return
    const p = parent.getBoundingClientRect()
    const g = grid.getBoundingClientRect()
    const l = last[0].getBoundingClientRect()
    const right = Math.max(...Array.from(last, (c) => c.getBoundingClientRect().right))
    const pitch = prev ? l.left - prev.getBoundingClientRect().left : l.width + 1
    const next: Frame = {
      left: right - p.left + parent.scrollLeft + 3,
      top: g.top - p.top + parent.scrollTop,
      height: g.height,
      pitch: Math.max(pitch, 1),
      maxRight: parent.clientWidth,
    }
    setFrame((f) =>
      f && f.left === next.left && f.top === next.top && f.height === next.height && f.pitch === next.pitch && f.maxRight === next.maxRight
        ? f
        : next,
    )
  }, [gridRef, cellAttr, cols])

  React.useLayoutEffect(measure)
  React.useEffect(() => {
    const grid = gridRef.current
    if (!grid || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(grid)
    return () => ro.disconnect()
  }, [gridRef, measure])

  const perBar = Math.max(1, Math.round(cols / length.bars))
  const barsFor = (n: number): number => Math.ceil(n / perBar)
  const verdict = engaged ? length.verdict() : null
  const blocked = verdict && !verdict.duplicate.ok ? verdict.duplicate.reason : null
  const appendBlocked = verdict && !verdict.append.ok ? verdict.append.reason : null

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, moved: false }
    setAdded(0)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = dragRef.current
    if (!d || !frame) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) < CLICK_SLOP_PX) return
    d.moved = true
    // one column at a time: a column counts once the pointer is half-way across it
    setAdded(appendBlocked ? 0 : Math.max(0, Math.floor(dx / frame.pitch + 0.5)))
  }
  const onPointerUp = (): void => {
    const d = dragRef.current
    dragRef.current = null
    if (!d?.moved) return // a click — `onClick` adds the bar
    swallowClick.current = true
    const n = added
    setAdded(0)
    if (n > 0) length.onAddBars(barsFor(n))
  }

  const ghostWidth = frame ? added * frame.pitch : 0
  const label = blocked
    ? `Can't continue this pattern: ${blocked}`
    : 'Add a bar that continues the pattern (click) or empty bars (drag)'

  return (
    <>
      {frame && added > 0 && (
        <div
          data-extend-ghost={added}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: frame.left - 2,
            top: frame.top,
            width: ghostWidth,
            height: frame.height,
            boxSizing: 'border-box',
            border: '1px dashed var(--accent, #6b6bcb)',
            borderRadius: 2,
            background: 'rgba(107, 107, 203, 0.10)',
            pointerEvents: 'none',
          }}
        />
      )}
      {frame && added > 0 && (
        <div
          role="status"
          data-extend-tip
          style={{
            position: 'absolute',
            // under the grid, ending at the handle — or at the panel's edge when a long
            // drag has carried the handle past it (to its right is the inspector)
            left: Math.min(frame.left + ghostWidth + 22, frame.maxRight),
            top: frame.top + frame.height + 6,
            transform: 'translateX(-100%)',
            whiteSpace: 'nowrap',
            padding: '4px 8px',
            fontSize: 11,
            color: 'var(--foreground, #e6e6ea)',
            background: 'var(--surface-2, #14142a)',
            border: '1px solid var(--border, #34345a)',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 4,
          }}
        >
          {`+${added} ${added === 1 ? 'step' : 'steps'} → adds ${barsFor(added)} ${barsFor(added) === 1 ? 'bar' : 'bars'}`}
        </div>
      )}
      <button
        ref={selfRef}
        type="button"
        data-extend-handle
        aria-label={label}
        title={label}
        aria-disabled={blocked && appendBlocked ? 'true' : undefined}
        onPointerEnter={() => setEngaged(true)}
        onPointerLeave={() => setEngaged(false)}
        onFocus={() => setEngaged(true)}
        onBlur={() => setEngaged(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null
          setAdded(0)
        }}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          length.onDuplicate()
        }}
        style={{
          position: 'absolute',
          left: (frame?.left ?? 0) + ghostWidth,
          top: frame?.top ?? 0,
          height: frame?.height ?? 0,
          width: 22,
          visibility: frame ? 'visible' : 'hidden',
          boxSizing: 'border-box',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 3,
          border: `1px ${added > 0 ? 'solid' : 'dashed'} ${added > 0 ? 'var(--accent, #6b6bcb)' : 'var(--border, #3a3a5a)'}`,
          background: added > 0 ? 'rgba(107, 107, 203, 0.16)' : 'transparent',
          color: 'var(--foreground-muted, #9a9ac0)',
          cursor: blocked && appendBlocked ? 'not-allowed' : added > 0 ? 'ew-resize' : 'pointer',
          opacity: blocked && appendBlocked ? 0.4 : 1,
          touchAction: 'none',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </>
  )
}
