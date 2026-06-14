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
import type { KnobRange } from './knobRanges'

export interface KnobProps {
  label: string
  value: number
  range: KnobRange
  onChange: (value: number) => void
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
  onGestureStart,
  onGestureEnd,
}: KnobProps): React.ReactElement {
  const dragRef = React.useRef<{ startY: number; startPos: number } | null>(null)

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
      }}
    >
      <div
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
        onKeyDown={onKeyDown}
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
    </div>
  )
}
