/**
 * Sequencer — drum/step grid (#382, per-column velocity #409).
 *
 * Parses the mini-notation of the `s(...)` / `sound(...)` statement under the
 * cursor into a `StepGridModel` and renders lanes × steps. Toggling a cell
 * re-serializes the model and writes it back over the mini-notation range
 * (`'seq'`); a drag paints multiple cells as ONE undo step. Anything outside
 * the editable grid subset (`{}`, `/`, …) → standby, code-only — the
 * conservatism rule.
 *
 * Velocity: an ON cell shows its level as a bottom-anchored fill; dragging it
 * vertically sets the column's gain (DAW velocity-lane behaviour — drag down to
 * soften). The level is written to a parallel `.gain("…")` mini aligned to the
 * serialized columns; when every column returns to neutral the `.gain` is
 * removed. Gain is single-part / single-bar only; richer shapes keep toggling
 * but the `.gain` is left untouched.
 *
 * The model lives in component state, not derived per-render from the chunk, so
 * a lane the user clears completely keeps its row. The model is reseeded only
 * on EXTERNAL edits — see `useGridModel`.
 */
import * as React from 'react'

import { parseStepGrid, applyStepGain } from '../notation/parse'
import { serializeStepGrid, serializeStepGain } from '../notation/serialize'
import type { StepGridModel } from '../notation/model'
import { VisualEditStandby } from './VisualEditStandby'
import { SEQUENCER_TAB_ID } from './tabs'
import { isStepChunk } from './patternKind'
import { useGridModel } from './useGridModel'
import { usePlayingStep } from './usePlayingStep'
import { addLane, removeLane } from '../notation/lane'
import { DRUM_SOUNDS } from './soundCatalog'
import { sampleVoice } from './drumVoices'
import { useNoteColorMode, velocityColor } from './noteColor'
import { NoteColorToggle } from './NoteColorToggle'
import { type SelectedNote, setColumnGain } from './inspector'
import { type Tool, DEFAULT_TOOL, resolveCellAction } from './tool'

const SEQ_HINT = 'Click a drum pattern to edit it as a step grid.'

/** px of vertical drag that spans the full 0→1 velocity range */
const VELOCITY_FULL_PX = 80
/** px of movement before a press on an ON cell becomes a drag (not a click) */
const DRAG_THRESHOLD = 4

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** flip one cell, returning a new model (stable lane set preserved) */
function toggleCell(
  model: StepGridModel,
  laneIndex: number,
  stepIndex: number,
  value: boolean,
): StepGridModel {
  return {
    ...model,
    lanes: model.lanes.map((lane, i) =>
      i === laneIndex
        ? { ...lane, cells: lane.cells.map((c, j) => (j === stepIndex ? value : c)) }
        : lane,
    ),
  }
}

/** velocity is grid-aligned only for single-part, single-bar, non-foreign models */
function gainInScope(model: StepGridModel): boolean {
  if (model.gainForeign || (model.bars ?? 1) > 1) return false
  return new Set(model.lanes.map((l) => l.part ?? 0)).size === 1
}

export interface SequencerGridProps {
  /** the inspector's selected step (#432), owned by PatternPanel */
  selected?: SelectedNote | null
  onSelect?: (sel: SelectedNote | null) => void
  /** the active edit tool (#433), owned by PatternPanel */
  tool?: Tool
}

export function SequencerGrid({
  selected,
  onSelect,
  tool = DEFAULT_TOOL,
}: SequencerGridProps = {}): React.ReactElement {
  const { chunk, model, mutate, beginGesture, endGesture } = useGridModel<StepGridModel>({
    source: 'seq',
    eligible: isStepChunk,
    parse: parseStepGrid,
    serialize: serializeStepGrid,
    applyGain: applyStepGain,
    serializeGain: serializeStepGain,
  })

  const playingStep = usePlayingStep(model?.steps ?? 0, model?.bars ?? 1)
  const [colorMode] = useNoteColorMode()

  // Latest selection + setter for window-listener effects (#432).
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedRef = React.useRef(selected)
  selectedRef.current = selected
  const select = (sel: SelectedNote | null): void => onSelectRef.current?.(sel)

  // One pointer gesture from a cell press. An OFF cell paints immediately (snappy
  // step entry); an ON cell starts PENDING — a vertical drag past the threshold
  // becomes velocity, a horizontal drag becomes paint-off, and a release with no
  // move is a plain toggle-off. The whole gesture is one undo step.
  const gestureRef = React.useRef<{
    lane: number
    step: number
    startX: number
    startY: number
    startGain: number
    mode: 'paint' | 'pending' | 'velocity'
    paintValue: boolean
  } | null>(null)

  const gainScoped = model ? gainInScope(model) : false

  const paintCell = React.useCallback(
    (laneIndex: number, stepIndex: number, value: boolean): void => {
      mutate((prev) => {
        const lane = prev.lanes[laneIndex]
        if (!lane || stepIndex >= lane.cells.length || lane.cells[stepIndex] === value) {
          return prev // no change → useGridModel skips the write
        }
        return toggleCell(prev, laneIndex, stepIndex, value)
      })
    },
    [mutate],
  )

  // Add a new drum voice (#516). The new lane is all-rest, so it stages in the
  // model and only writes to the source on the first hit (useGridModel keeps it
  // because serialize is unchanged). Remove drops the voice from the pattern.
  const addVoice = React.useCallback(
    (sound: string): void => {
      mutate((prev) => addLane(prev, sound))
    },
    [mutate],
  )
  const removeVoice = React.useCallback(
    (sound: string): void => {
      mutate((prev) => removeLane(prev, sound))
    },
    [mutate],
  )

  React.useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const g = gestureRef.current
      if (!g) return
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (g.mode === 'pending') {
        if (gainScoped && Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) >= Math.abs(dx)) {
          g.mode = 'velocity'
        } else if (Math.abs(dx) > DRAG_THRESHOLD) {
          g.mode = 'paint'
          paintCell(g.lane, g.step, g.paintValue) // toggle the start cell off
          return
        } else {
          return
        }
      }
      if (g.mode === 'velocity') {
        // drag DOWN (positive dy) softens; up to a full-1 ceiling, down to 0.
        const next = clamp01(g.startGain - dy / VELOCITY_FULL_PX)
        mutate((prev) => setColumnGain(prev, g.step, next))
      }
    }
    const onUp = (): void => {
      const g = gestureRef.current
      if (!g) return
      gestureRef.current = null
      // a plain click on an ON cell no longer toggles off (#432 — it selected on
      // down; Delete turns it off). Velocity/paint-off gestures already ran.
      endGesture()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [mutate, paintCell, endGesture, gainScoped])

  const onCellDown = (laneIndex: number, stepIndex: number, current: boolean, e: React.PointerEvent): void => {
    beginGesture()
    // #433 — a selected Pencil/Eraser forces draw/erase, overriding the
    // context-inferred toggle. Both reuse the existing paint gesture (Pencil
    // paints ON, Eraser paints OFF), so a drag keeps painting that value.
    const action = resolveCellAction(tool)
    if (action !== 'smart') {
      const on = action === 'place'
      gestureRef.current = {
        lane: laneIndex,
        step: stepIndex,
        startX: e.clientX,
        startY: e.clientY,
        startGain: 1,
        mode: 'paint',
        paintValue: on,
      }
      paintCell(laneIndex, stepIndex, on)
      select(on ? { kind: 'step', lane: laneIndex, step: stepIndex } : null)
      return
    }
    if (current) {
      // an ON cell: a plain click now SELECTS it (#432 — toggle-off moved to the
      // Delete key); a vertical drag still becomes velocity, a horizontal drag
      // paint-off. Select on down so the inspector binds immediately.
      select({ kind: 'step', lane: laneIndex, step: stepIndex })
      gestureRef.current = {
        lane: laneIndex,
        step: stepIndex,
        startX: e.clientX,
        startY: e.clientY,
        startGain: model?.gains?.[stepIndex] ?? 1,
        mode: 'pending',
        paintValue: false,
      }
    } else {
      // empty cell → paint on immediately + select, then keep painting on enter
      gestureRef.current = {
        lane: laneIndex,
        step: stepIndex,
        startX: e.clientX,
        startY: e.clientY,
        startGain: 1,
        mode: 'paint',
        paintValue: true,
      }
      paintCell(laneIndex, stepIndex, true)
      select({ kind: 'step', lane: laneIndex, step: stepIndex })
    }
  }

  const onCellEnter = (laneIndex: number, stepIndex: number): void => {
    const g = gestureRef.current
    if (!g || g.mode !== 'paint') return
    paintCell(laneIndex, stepIndex, g.paintValue)
  }

  // Delete/Backspace turns the selected step off (#432 — removal moved off the
  // plain click) and clears the selection.
  const removeSelected = (): void => {
    const sel = selectedRef.current
    if (!sel || sel.kind !== 'step') return
    paintCell(sel.lane, sel.step, false)
    select(null)
  }

  if (!model) {
    return React.createElement(VisualEditStandby, {
      panel: SEQUENCER_TAB_ID,
      hint: chunk && isStepChunk(chunk)
        ? "This pattern isn't grid-editable — edit it as code."
        : SEQ_HINT,
      icon: 'symbol-array',
    })
  }

  const barSize = model.bars ? model.steps / model.bars : 0

  return (
    <div
      data-bottom-panel-tab="sequencer"
      tabIndex={0}
      // cell pointerdowns preventDefault (block default focus, P200) → focus in
      // the capture phase so Delete reaches the grid (#432).
      onPointerDownCapture={(e) => (e.currentTarget as HTMLElement).focus({ preventScroll: true })}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          removeSelected()
        }
      }}
      style={{
        padding: 16,
        height: '100%',
        overflow: 'auto',
        outline: 'none',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        touchAction: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <NoteColorToggle />
        </div>
        {model.lanes.map((lane, laneIndex) => {
          const voice = sampleVoice(lane.sound)
          return (
          <div key={`${lane.sound}:${lane.part ?? 0}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              data-seq-voice={lane.sound}
              style={{
                width: 72,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 5,
                fontSize: 11,
                color: 'var(--foreground, #e6e6ea)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
              title={lane.sound}
            >
              <span
                data-seq-voice-dot
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  flex: '0 0 auto',
                  borderRadius: '50%',
                  background: voice.color,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{voice.label}</span>
            </span>
            <button
              type="button"
              aria-label={`remove ${lane.sound}`}
              data-seq-remove-voice={lane.sound}
              title={`Remove ${lane.sound}`}
              onClick={() => removeVoice(lane.sound)}
              style={{
                width: 16,
                height: 16,
                flex: '0 0 auto',
                padding: 0,
                lineHeight: '14px',
                fontSize: 12,
                borderRadius: 3,
                border: '1px solid var(--border, #3a3a42)',
                background: 'transparent',
                color: 'var(--foreground-muted, #a0a0aa)',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            <div style={{ display: 'flex', gap: 2, flex: 1, minWidth: 0 }}>
              {lane.cells.map((on, stepIndex) => {
                const gain = model.gains?.[stepIndex] ?? 1
                const isPlaying = stepIndex === playingStep
                const isSel =
                  on &&
                  selected?.kind === 'step' &&
                  selected.lane === laneIndex &&
                  selected.step === stepIndex
                return (
                  <button
                    key={stepIndex}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${lane.sound} step ${stepIndex + 1}`}
                    data-seq-cell={`${laneIndex}:${stepIndex}`}
                    data-seq-selected={isSel ? 'true' : undefined}
                    data-gain={on && gainScoped ? gain : undefined}
                    data-playing={isPlaying ? 'true' : undefined}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      onCellDown(laneIndex, stepIndex, on, e)
                    }}
                    onPointerEnter={() => onCellEnter(laneIndex, stepIndex)}
                    style={{
                      position: 'relative',
                      flex: '1 1 0',
                      minWidth: 16,
                      maxWidth: 56,
                      height: 22,
                      padding: 0,
                      overflow: 'hidden',
                      border: isPlaying
                        ? '1px solid var(--foreground, #e6e6ea)'
                        : '1px solid var(--border, #3a3a42)',
                      borderRadius: 3,
                      // subtle gap at each bar boundary
                      marginLeft: barSize && stepIndex % barSize === 0 && stepIndex !== 0 ? 8 : 0,
                      background: isPlaying
                        ? 'var(--background, #34343c)'
                        : 'var(--background-elevated, #26262c)',
                      cursor: gainScoped && on ? 'ns-resize' : 'pointer',
                      // selection ring (#432), distinct from the playhead border
                      boxShadow: isSel
                        ? 'inset 0 0 0 2px var(--foreground, #e6e6ea)'
                        : undefined,
                    }}
                  >
                    {on && (
                      // bottom-anchored fill = velocity (full when neutral); when
                      // gain is out of scope it always reads full, so the cell
                      // looks exactly like the pre-velocity solid square. The
                      // hue is the voice colour (#471), or a velocity ramp when
                      // View ▸ Note Color = Velocity (#428).
                      <span
                        data-seq-fill
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: `${clamp01(gainScoped ? gain : 1) * 100}%`,
                          background:
                            colorMode === 'velocity'
                              ? velocityColor(gainScoped ? gain : 1)
                              : voice.color,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ width: 72, flex: '0 0 auto' }} />
          <select
            data-seq-add-voice
            aria-label="add drum voice"
            value=""
            onChange={(e) => {
              if (e.target.value) addVoice(e.target.value)
            }}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 4,
              border: '1px dashed var(--border, #3a3a42)',
              background: 'var(--background-elevated, #26262c)',
              color: 'var(--foreground-muted, #a0a0aa)',
              cursor: 'pointer',
            }}
          >
            <option value="">+ add voice…</option>
            {DRUM_SOUNDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
