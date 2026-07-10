/**
 * Knob — a draggable dial over a single numeric value.
 *
 * Vertical drag (or up/down arrows) changes the value across its range; the
 * Mixer maps each change to a surgical text edit of the underlying literal.
 * Accessible as a `slider` (aria-valuemin/max/now) so it's keyboard-usable and
 * Playwright-observable.
 *
 * Reports `onChange(value)` live during a drag and brackets the gesture with
 * `onGestureStart` / `onGestureEnd` so the Mixer can coalesce the whole drag
 * into one undo step.
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import type { KnobRange } from './knobRanges'

export interface KnobProps {
  label: string
  value: number
  range: KnobRange
  onChange: (value: number) => void
  /** when set, a small `×` removes this effect's call (#575) */
  onRemove?: () => void
  /** when set, double-clicking the dial opens an in-place popup to edit its
   *  range; committing calls this with the new start/end (#844). Absent → the
   *  dial isn't range-editable (e.g. a multi-arg function's real args). */
  onRangeChange?: (min: number, max: number) => void
  /** when set, the popup shows a "Reset" that clears the custom range back to
   *  the method default (#844). Absent → no custom range to reset. */
  onRangeReset?: () => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
}

/** pixels of vertical drag to sweep the full range */
const DRAG_SPAN_PX = 160

/** value → slider position in [0, 1] */
function toPosition(value: number, r: KnobRange): number {
  if (r.scale === 'log' && r.min > 0 && value > 0) {
    return Math.log(value / r.min) / Math.log(r.max / r.min)
  }
  return (value - r.min) / (r.max - r.min || 1)
}

/** slider position in [0, 1] → value, quantized to the range step */
function fromPosition(pos: number, r: KnobRange): number {
  const clamped = Math.max(0, Math.min(1, pos))
  let value: number
  if (r.scale === 'log' && r.min > 0) {
    value = r.min * Math.pow(r.max / r.min, clamped)
  } else {
    value = r.min + clamped * (r.max - r.min)
  }
  const stepped = Math.round(value / r.step) * r.step
  // step can be fractional (0.01) — clean the float noise the multiply leaves.
  const decimals = (String(r.step).split('.')[1] ?? '').length
  return Number(stepped.toFixed(decimals))
}

export function Knob({
  label,
  value,
  range,
  onChange,
  onRemove,
  onRangeChange,
  onRangeReset,
  onGestureStart,
  onGestureEnd,
}: KnobProps): React.ReactElement {
  const dragRef = React.useRef<{ startY: number; startPos: number } | null>(null)

  // Custom-range popup (#844): double-click the dial to edit its start/end. The
  // draft strings mirror the two inputs; commit parses them and writes to code.
  const [editing, setEditing] = React.useState(false)
  const [draftMin, setDraftMin] = React.useState('')
  const [draftMax, setDraftMax] = React.useState('')
  // The popup is portaled to <body> and positioned off the dial's viewport rect:
  // the Mixer console drawer is `overflow:hidden`, so an in-flow absolute popup
  // would be clipped (same reason AddEffectMenu portals — #844 review).
  const [popupPos, setPopupPos] = React.useState<{ top: number; left: number } | null>(null)
  const sliderRef = React.useRef<HTMLDivElement>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)

  const POPUP_W = 132

  const openRangeEditor = (): void => {
    if (!onRangeChange) return
    setDraftMin(String(range.min))
    setDraftMax(String(range.max))
    setEditing(true)
  }

  const commitRange = (): void => {
    const min = Number(draftMin)
    const max = Number(draftMax)
    // Ignore a non-numeric or zero-span entry rather than writing junk into code.
    if (Number.isFinite(min) && Number.isFinite(max) && min !== max) {
      onRangeChange?.(min, max)
    }
    setEditing(false)
  }

  // Place the portal off the dial's rect; flip above when cramped below.
  React.useLayoutEffect(() => {
    if (!editing) return
    const r = sliderRef.current?.getBoundingClientRect()
    if (!r) return
    const margin = 8
    const height = 96 // approx popup height for the flip decision
    const openUp = window.innerHeight - r.bottom - margin < height && r.top > height
    setPopupPos({
      top: openUp ? Math.max(margin, r.top - 4 - height) : r.bottom + 4,
      left: Math.max(
        margin,
        Math.min(r.left + r.width / 2 - POPUP_W / 2, window.innerWidth - POPUP_W - margin),
      ),
    })
  }, [editing])

  // Dismiss on outside click, Escape, resize, or any ancestor scroll — a fixed
  // popup would otherwise drift from the dial (mirrors AddEffectMenu).
  React.useEffect(() => {
    if (!editing) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (sliderRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setEditing(false)
    }
    const dismiss = (): void => setEditing(false)
    const onScroll = (e: Event): void => {
      const t = e.target
      if (t instanceof Node && popupRef.current?.contains(t)) return
      setEditing(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [editing])

  const pos = Math.max(0, Math.min(1, toPosition(value, range)))
  // sweep the indicator across a 270° arc (−135° … +135°)
  const angle = -135 + pos * 270

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { startY: e.clientY, startPos: toPosition(value, range) }
    onGestureStart?.()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const dy = drag.startY - e.clientY // up = increase
    const nextPos = drag.startPos + dy / DRAG_SPAN_PX
    const next = fromPosition(nextPos, range)
    if (next !== value) onChange(next)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    dragRef.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    onGestureEnd?.()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    let next = value
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = value + range.step
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = value - range.step
    else return
    e.preventDefault()
    next = Math.max(range.min, Math.min(range.max, next))
    const decimals = (String(range.step).split('.')[1] ?? '').length
    next = Number(next.toFixed(decimals))
    if (next !== value) {
      onGestureStart?.()
      onChange(next)
      onGestureEnd?.()
    }
  }

  return (
    <div
      data-knob={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        width: 64,
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {onRemove && (
        <button
          type="button"
          data-knob-remove={label}
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
          onClick={onRemove}
          style={{
            position: 'absolute',
            top: -2,
            right: 2,
            width: 14,
            height: 14,
            padding: 0,
            lineHeight: '12px',
            fontSize: 11,
            borderRadius: 3,
            cursor: 'pointer',
            border: '1px solid var(--border, #3a3a42)',
            background: 'var(--background, #1c1c20)',
            color: 'var(--foreground-muted, #a0a0aa)',
          }}
        >
          ×
        </button>
      )}
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onRangeChange ? openRangeEditor : undefined}
        onKeyDown={onKeyDown}
        title={onRangeChange ? 'Drag to change · double-click to set range' : undefined}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--background-elevated, #26262c)',
          border: '1px solid var(--border, #3a3a42)',
          position: 'relative',
          cursor: 'ns-resize',
          touchAction: 'none',
        }}
      >
        {/* indicator line */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 2,
            height: 16,
            background: 'var(--accent, #6ea8fe)',
            transformOrigin: 'bottom center',
            transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: 'var(--foreground, #e6e6ea)',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          maxWidth: 60,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={label}
      >
        {label}
      </span>
      <span
        data-knob-value={label}
        style={{
          fontSize: 10,
          color: 'var(--foreground-muted, #a0a0aa)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {editing &&
        createPortal(
        <div
          ref={popupRef}
          data-knob-range-popup={label}
          // Own pointer/keys: stop a stray drag from starting on the parent knob,
          // and keep Escape/Enter local to the popup.
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: popupPos?.top ?? 0,
            left: popupPos?.left ?? 0,
            width: POPUP_W,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 8,
            borderRadius: 6,
            border: '1px solid var(--border, #3a3a42)',
            background: 'var(--background, #1c1c20)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {(['min', 'max'] as const).map((which) => (
              <label
                key={which}
                style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 9 }}
              >
                <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>
                  {which === 'min' ? 'Start' : 'End'}
                </span>
                <input
                  data-knob-range-input={which}
                  type="number"
                  autoFocus={which === 'min'}
                  value={which === 'min' ? draftMin : draftMax}
                  onChange={(e) =>
                    (which === 'min' ? setDraftMin : setDraftMax)(e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRange()
                    else if (e.key === 'Escape') setEditing(false)
                  }}
                  style={{
                    width: 52,
                    padding: '3px 5px',
                    fontSize: 11,
                    borderRadius: 4,
                    border: '1px solid var(--border, #3a3a42)',
                    background: 'var(--background-elevated, #26262c)',
                    color: 'var(--foreground, #e6e6ea)',
                  }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            <button
              type="button"
              data-knob-range-apply={label}
              onClick={commitRange}
              style={{
                flex: 1,
                padding: '3px 8px',
                fontSize: 11,
                borderRadius: 4,
                cursor: 'pointer',
                border: '1px solid var(--accent, #6ea8fe)',
                background: 'var(--accent, #6ea8fe)',
                color: '#0b0b0e',
              }}
            >
              Apply
            </button>
            {onRangeReset && (
              <button
                type="button"
                data-knob-range-reset={label}
                title="Reset to default range"
                onClick={() => {
                  onRangeReset()
                  setEditing(false)
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  cursor: 'pointer',
                  border: '1px solid var(--border, #3a3a42)',
                  background: 'var(--background-elevated, #26262c)',
                  color: 'var(--foreground-muted, #a0a0aa)',
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>,
          document.body,
        )}
    </div>
  )
}
