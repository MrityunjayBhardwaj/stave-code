/**
 * Sequencer — drum/step grid (#382).
 *
 * Parses the mini-notation of the `s(...)` / `sound(...)` statement under the
 * cursor into a `StepGridModel` and renders lanes × steps. Toggling a cell
 * re-serializes the model and writes it back over the mini-notation range
 * (`'seq'`); a drag paints multiple cells as ONE undo step. Anything outside
 * the editable grid subset (`{}`, `*`, euclids, …) → standby, code-only — the
 * conservatism rule.
 *
 * The model lives in component state, not derived per-render from the chunk, so
 * a lane the user clears completely keeps its row (its sound vanishes from the
 * serialized mini, but the row stays editable). The model is reseeded only on
 * EXTERNAL edits — detected by comparing what we'd serialize against the
 * incoming mini; our own write-back echoes leave it untouched.
 *
 * Live-playhead step highlighting is a follow-up (needs the runtime clock,
 * which this editor-seeded panel doesn't yet receive).
 */
import * as React from 'react'

import { parseStepGrid } from '../notation/parse'
import { serializeStepGrid } from '../notation/serialize'
import type { StepGridModel } from '../notation/model'
import { VisualEditStandby } from './VisualEditStandby'
import { SEQUENCER_TAB_ID } from './tabs'
import { isStepChunk } from './patternKind'
import { useGridModel } from './useGridModel'
import { usePlayingStep } from './usePlayingStep'

const SEQ_HINT = 'Click a drum pattern to edit it as a step grid.'

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

export function SequencerGrid(): React.ReactElement {
  const { chunk, model, mutate, beginGesture, endGesture } = useGridModel<StepGridModel>({
    source: 'seq',
    eligible: isStepChunk,
    parse: parseStepGrid,
    serialize: serializeStepGrid,
  })

  const playingStep = usePlayingStep(model?.steps ?? 0, model?.bars ?? 1)

  // Drag-paint: a press sets the paint value (opposite of the pressed cell);
  // entering further cells while held paints them the same. The whole drag is
  // one undo step.
  const paintRef = React.useRef<{ active: boolean; value: boolean }>({
    active: false,
    value: true,
  })

  React.useEffect(() => {
    const onUp = (): void => {
      if (!paintRef.current.active) return
      paintRef.current.active = false
      endGesture()
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [endGesture])

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

  const onCellDown = (laneIndex: number, stepIndex: number, current: boolean): void => {
    paintRef.current = { active: true, value: !current }
    beginGesture()
    paintCell(laneIndex, stepIndex, !current)
  }

  const onCellEnter = (laneIndex: number, stepIndex: number): void => {
    if (!paintRef.current.active) return
    paintCell(laneIndex, stepIndex, paintRef.current.value)
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
      style={{
        padding: 16,
        height: '100%',
        overflow: 'auto',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        touchAction: 'none',
      }}
    >
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
        {model.lanes.map((lane, laneIndex) => (
          <div key={`${lane.sound}:${lane.part ?? 0}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 56,
                fontSize: 11,
                color: 'var(--foreground, #e6e6ea)',
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={lane.sound}
            >
              {lane.sound}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              {lane.cells.map((on, stepIndex) => (
                <button
                  key={stepIndex}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${lane.sound} step ${stepIndex + 1}`}
                  data-seq-cell={`${laneIndex}:${stepIndex}`}
                  data-playing={stepIndex === playingStep ? 'true' : undefined}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    onCellDown(laneIndex, stepIndex, on)
                  }}
                  onPointerEnter={() => onCellEnter(laneIndex, stepIndex)}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    border:
                      stepIndex === playingStep
                        ? '1px solid var(--foreground, #e6e6ea)'
                        : '1px solid var(--border, #3a3a42)',
                    borderRadius: 3,
                    // subtle gap at each bar boundary
                    marginLeft: barSize && stepIndex % barSize === 0 && stepIndex !== 0 ? 8 : 0,
                    background: on
                      ? 'var(--accent, #6ea8fe)'
                      : stepIndex === playingStep
                        ? 'var(--background, #34343c)'
                        : 'var(--background-elevated, #26262c)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
