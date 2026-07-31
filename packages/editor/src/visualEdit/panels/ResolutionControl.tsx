/**
 * ResolutionControl — the "Slots" grid-resolution control shared by both grids
 * (#479). Absolute slot-count targets (4 / 8 / 16 / 32 / 64): clicking one SETS
 * the grid to that column count.
 *
 * A target's `SlotState` says how it behaves and how it's drawn:
 *   - `active`   — the current count (highlighted, not clickable);
 *   - `view`     — the free zone (#1057): a whole multiple of what the DOCUMENT
 *      spells, so the panel simply draws the same notation more finely and your
 *      file is not touched at all. Drawn normal, and the tooltip says so — this
 *      is the only state that writes nothing, and a user deciding whether it is
 *      safe to press should not have to find that out by pressing it;
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

/**
 * Lift a grid's resolution control up to the Pattern inspector (#601). The grid
 * owns the model and the write-back; the inspector only RENDERS the buttons — so
 * each grid reports its `ResolutionControlProps` upward and `PatternPanel` pushes
 * them down to `MixerBody` (the same path `division`/Snap already takes).
 *
 * It re-lifts only when the slot COUNT changes — that's both the headline state
 * and the active highlight. `slotState`/`onScaleTo` are ref-backed so they always
 * read the latest model/mutate WITHOUT re-firing the lift, which keeps it
 * loop-free no matter whether the grid's model object is referentially stable
 * (PianoRollGrid's `scaleToSlots` is a fresh closure each render). `null` steps
 * (no grid-editable pattern) lifts `null`, and unmount clears it — so the
 * inspector shows Slots exactly when a grid is editable.
 */
export function useLiftResolution(
  steps: number | null,
  slotState: (target: number) => SlotState,
  onScaleTo: (target: number) => void,
  onResolution?: (r: ResolutionControlProps | null) => void,
): void {
  const slotStateRef = React.useRef(slotState)
  slotStateRef.current = slotState
  const onScaleToRef = React.useRef(onScaleTo)
  onScaleToRef.current = onScaleTo
  const stableSlotState = React.useCallback((t: number) => slotStateRef.current(t), [])
  const stableScaleTo = React.useCallback((t: number) => onScaleToRef.current(t), [])

  React.useEffect(() => {
    if (!onResolution) return
    onResolution(
      steps == null ? null : { steps, slotState: stableSlotState, onScaleTo: stableScaleTo },
    )
  }, [steps, onResolution, stableSlotState, stableScaleTo])

  // Clear on unmount only (e.g. cursor leaves a grid pattern → grid unmounts) so
  // a steps change re-lifts in place without a null flicker.
  React.useEffect(() => {
    return () => onResolution?.(null)
  }, [onResolution])
}

/**
 * A memoized "does the parser really draw this at `scale`?" prover (#1057).
 *
 * The free zone is offered only on proof, and the proof is a real parse — the whole
 * point is that it cannot be predicted. But `slotState` is asked once per preset on
 * every render of the control, so the naive prover parses five times per render, at a
 * measured 0.84ms (grid) / 1.74ms (roll) per refined ask. That cost is fine per
 * GESTURE and wrong per FRAME, and nothing bounds how often this control re-renders.
 *
 * So the answers are cached per mini. The cache is keyed by the mini itself and thrown
 * away whenever it changes, which makes staleness unrepresentable rather than
 * something to remember to invalidate: a cached answer can only ever be read for the
 * exact string it was computed from. Bounded by construction — at most one entry per
 * preset, for one mini at a time.
 */
export function useViewProver(
  mini: string | null | undefined,
  parse: (mini: string, scale: number) => { ok: boolean },
): (scale: number) => boolean {
  const cacheRef = React.useRef<{ mini: string | null; answers: Map<number, boolean> }>({
    mini: null,
    answers: new Map(),
  })
  const parseRef = React.useRef(parse)
  parseRef.current = parse
  const key = mini ?? null
  return React.useCallback(
    (scale: number): boolean => {
      if (key == null) return false
      const c = cacheRef.current
      if (c.mini !== key) {
        c.mini = key
        c.answers = new Map()
      }
      const hit = c.answers.get(scale)
      if (hit !== undefined) return hit
      const answer = parseRef.current(key, scale).ok
      c.answers.set(scale, answer)
      return answer
    },
    [key],
  )
}

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
          const clickable = state === 'view' || state === 'lossless' || state === 'quantize'
          const title =
            state === 'active'
              ? `${preset} slots (current)`
              : state === 'view'
                ? `${preset} slots — view only, your pattern is unchanged`
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
              // the free zone is observable from the DOM: a spec can assert that
              // pressing this wrote nothing WITHOUT having to infer which state it was in
              data-resolution-view={state === 'view' ? 'true' : undefined}
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
