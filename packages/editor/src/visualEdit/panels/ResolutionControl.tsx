/**
 * ResolutionControl — the "Slots" grid-resolution control shared by both grids
 * (#479). Absolute slot-count targets (4 / 8 / 16 / 32): clicking one scales the
 * grid to that column count by pure ×2 / ÷2, so hits keep their position and the
 * haps are byte-identical (verified in `notation/resolution.ts`). It's an editing
 * affordance, not a musical change.
 *
 * A target is offered ENABLED only when it's losslessly reachable — a power-of-2
 * ratio of the current count, and (going down) no hit/note falls on a dropped
 * column. The current count is shown active; non-power-of-2 grids (a triplet's
 * 12, a hand-written melody) show every preset disabled rather than re-time the
 * pattern — the honest-control rule. Real fixed-rate length editing (changing the
 * step COUNT without re-timing) needs polymeter and is a deferred follow-up.
 */
import * as React from 'react'

import { RESOLUTION_PRESETS } from '../notation/resolution'

export interface ResolutionControlProps {
  /** current column count — the active preset */
  steps: number
  /** is `target` losslessly reachable from the current count? */
  canScaleTo: (target: number) => boolean
  /** scale the grid to `target` columns */
  onScaleTo: (target: number) => void
}

export function ResolutionControl({
  steps,
  canScaleTo,
  onScaleTo,
}: ResolutionControlProps): React.ReactElement {
  return (
    <div
      data-resolution-control
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
    >
      <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>Slots</span>
      <div
        role="group"
        aria-label="grid resolution"
        style={{
          display: 'inline-flex',
          border: '1px solid var(--border, #3a3a42)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {RESOLUTION_PRESETS.map((preset, i) => {
          const active = preset === steps
          const enabled = active || canScaleTo(preset)
          return (
            <button
              key={preset}
              type="button"
              data-resolution-step={preset}
              data-resolution-active={active ? 'true' : undefined}
              aria-pressed={active}
              aria-label={`${preset} slots`}
              title={
                active
                  ? `${preset} slots (current)`
                  : enabled
                    ? `${preset} slots — keeps timing`
                    : `${preset} slots — unavailable (would re-time this pattern)`
              }
              disabled={!enabled}
              onClick={() => {
                if (!active) onScaleTo(preset)
              }}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                border: 'none',
                borderRight:
                  i < RESOLUTION_PRESETS.length - 1
                    ? '1px solid var(--border, #3a3a42)'
                    : 'none',
                background: active ? 'var(--accent, #6ea8fe)' : 'transparent',
                color: active
                  ? '#fff'
                  : enabled
                    ? 'var(--foreground, #e6e6ea)'
                    : 'var(--foreground-muted, #a0a0aa)',
                opacity: enabled ? 1 : 0.4,
                cursor: active ? 'default' : enabled ? 'pointer' : 'not-allowed',
              }}
            >
              {preset}
            </button>
          )
        })}
      </div>
    </div>
  )
}
