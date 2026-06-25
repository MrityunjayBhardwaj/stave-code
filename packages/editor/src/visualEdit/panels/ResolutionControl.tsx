/**
 * ResolutionControl — the "Slots" grid-resolution control shared by both grids
 * (#479). Absolute slot-count targets (4 / 8 / 16 / 32 / 64): clicking one SETS
 * the grid to that column count.
 *
 * A target's `SlotState` says how it behaves and how it's drawn:
 *   - `active`   — the current count (highlighted, not clickable);
 *   - `lossless` — a power-of-2 ratio: pure ×2/÷2, hits keep their position
 *      (haps byte-identical) — drawn normal;
 *   - `quantize` — any other ratio: notes snap to the nearest new slot and
 *      collisions merge, so it works on ANY pattern (a 64-step choir → 16) but
 *      changes timing — drawn dimmer with a "~" cue and an honest tooltip;
 *   - `disabled` — not offered (only multi-bar grids, which can't quantize off
 *      the bar grid yet).
 */
import * as React from 'react'

import { RESOLUTION_PRESETS, type SlotState } from '../notation/resolution'

export interface ResolutionControlProps {
  /** current column count — the active preset */
  steps: number
  /** how setting the grid to `target` behaves (active / lossless / quantize / disabled) */
  slotState: (target: number) => SlotState
  /** scale the grid to `target` columns */
  onScaleTo: (target: number) => void
}

export function ResolutionControl({
  steps,
  slotState,
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
          const state = preset === steps ? 'active' : slotState(preset)
          const active = state === 'active'
          const clickable = state === 'lossless' || state === 'quantize'
          const title =
            state === 'active'
              ? `${preset} slots (current)`
              : state === 'lossless'
                ? `${preset} slots — keeps timing`
                : state === 'quantize'
                  ? `${preset} slots — quantizes notes to the grid (changes timing)`
                  : `${preset} slots — unavailable`
          return (
            <button
              key={preset}
              type="button"
              data-resolution-step={preset}
              data-resolution-active={active ? 'true' : undefined}
              data-resolution-quantize={state === 'quantize' ? 'true' : undefined}
              aria-pressed={active}
              aria-label={`${preset} slots`}
              title={title}
              disabled={!active && !clickable}
              onClick={() => {
                if (clickable) onScaleTo(preset)
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
                  : clickable
                    ? 'var(--foreground, #e6e6ea)'
                    : 'var(--foreground-muted, #a0a0aa)',
                // quantize targets are dimmer + italic — a visible "this changes timing" cue
                fontStyle: state === 'quantize' ? 'italic' : 'normal',
                opacity: !active && !clickable ? 0.4 : state === 'quantize' ? 0.75 : 1,
                cursor: active ? 'default' : clickable ? 'pointer' : 'not-allowed',
              }}
            >
              {state === 'quantize' ? `~${preset}` : preset}
            </button>
          )
        })}
      </div>
    </div>
  )
}
