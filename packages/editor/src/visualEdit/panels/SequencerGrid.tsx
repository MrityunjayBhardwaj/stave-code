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
import { SEQUENCER_TAB_ID, VISUAL_EDIT_TABS } from './tabs'
import { useActiveChunk } from './useActiveChunk'

const SEQ_HINT =
  VISUAL_EDIT_TABS.find((t) => t.id === SEQUENCER_TAB_ID)?.hint ??
  'Click a drum pattern to edit it as a step grid.'

/** the sequencer only edits sound/sample patterns; notes go to the Piano Roll */
function isStepHead(headFn: string | null): boolean {
  return headFn === 's' || headFn === 'sound'
}

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
  const { chunk, applyEdit, beginGesture, endGesture } = useActiveChunk()
  const [model, setModel] = React.useState<StepGridModel | null>(null)
  // Mirror of `model` for synchronous reads inside pointer handlers (a fast
  // drag fires several paints before React re-renders).
  const modelRef = React.useRef<StepGridModel | null>(null)
  React.useEffect(() => {
    modelRef.current = model
  }, [model])

  // Reconcile model with the chunk: reseed on external edits, keep on echoes.
  React.useEffect(() => {
    if (!chunk || chunk.miniString === null || !isStepHead(chunk.headFn)) {
      modelRef.current = null
      setModel(null)
      return
    }
    const parsed = parseStepGrid(chunk.miniString)
    if (!parsed.ok) {
      modelRef.current = null
      setModel(null)
      return
    }
    // Our own write-back echo (or unchanged) → keep the in-state model so a
    // fully-cleared lane doesn't vanish; otherwise an external edit → reseed.
    const prev = modelRef.current
    const next = prev && serializeStepGrid(prev) === chunk.miniString ? prev : parsed.model
    modelRef.current = next
    setModel(next)
  }, [chunk])

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

  const write = React.useCallback(
    (next: StepGridModel): void => {
      applyEdit((fresh, wb) => {
        if (fresh.miniRange) wb.replaceRange(fresh.miniRange, serializeStepGrid(next), 'seq')
      })
    },
    [applyEdit],
  )

  const paintCell = React.useCallback(
    (laneIndex: number, stepIndex: number, value: boolean): void => {
      const prev = modelRef.current
      if (!prev) return
      const lane = prev.lanes[laneIndex]
      if (!lane || stepIndex >= lane.cells.length || lane.cells[stepIndex] === value) return
      const next = toggleCell(prev, laneIndex, stepIndex, value)
      modelRef.current = next // synchronous so a fast drag reads the latest
      setModel(next)
      write(next)
    },
    [write],
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
      hint: chunk && chunk.miniString !== null && isStepHead(chunk.headFn)
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
                  onPointerDown={(e) => {
                    e.preventDefault()
                    onCellDown(laneIndex, stepIndex, on)
                  }}
                  onPointerEnter={() => onCellEnter(laneIndex, stepIndex)}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    border: '1px solid var(--border, #3a3a42)',
                    borderRadius: 3,
                    // subtle gap at each bar boundary
                    marginLeft: barSize && stepIndex % barSize === 0 && stepIndex !== 0 ? 8 : 0,
                    background: on
                      ? 'var(--accent, #6ea8fe)'
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
