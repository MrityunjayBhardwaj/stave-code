/**
 * Piano Roll — note grid (#383, drag-move + range stability from #391).
 *
 * Parses the mini-notation of the `note(...)` / `n(...)` statement under the
 * cursor into a `PianoRollModel` and renders pitch rows × step columns.
 * Interactions:
 *   - click an empty cell → place a note (one step; overlaps resolved);
 *   - click a note → remove it;
 *   - drag a note → move it in pitch + time (duration preserved), one undo.
 * Each edit re-serializes and writes back over the mini range (`'roll'`); a
 * serialization the subset can't express (e.g. a move that would overlap) is
 * dropped, leaving the document untouched — the conservatism rule.
 *
 * The visible pitch range is sticky within a binding: it expands to fit notes
 * but never shrinks when notes are removed, and resets only when the cursor
 * moves to a different statement (#391) — so editing doesn't make rows jump.
 *
 * Drag-to-resize (`@n` elongation) and live-playhead column highlight remain
 * follow-ups.
 */
import * as React from 'react'

import { parsePianoRoll } from '../notation/parse'
import { serializePianoRoll } from '../notation/serialize'
import type { PianoRollModel, RollNote } from '../notation/model'
import { pitchToMidi, midiToPitch, isBlackKey } from '../notation/pitch'
import type { ChunkInfo } from '../chunkDetect'
import { VisualEditStandby } from './VisualEditStandby'
import { PIANO_ROLL_TAB_ID, VISUAL_EDIT_TABS } from './tabs'
import { useGridModel } from './useGridModel'
import { usePlayingStep } from './usePlayingStep'
import { placeNote } from '../notation/place'

const ROLL_HINT =
  VISUAL_EDIT_TABS.find((t) => t.id === PIANO_ROLL_TAB_ID)?.hint ??
  'Click a melody to edit its notes.'

function isRollChunk(chunk: ChunkInfo): boolean {
  return chunk.miniString !== null && (chunk.headFn === 'note' || chunk.headFn === 'n')
}

const DEFAULT_LO = 48 // c3
const DEFAULT_HI = 72 // c5
const MIN_SPAN = 12

/** content pitch range padded around the notes */
function contentRange(model: PianoRollModel): { lo: number; hi: number } {
  const midis = model.notes
    .map((n) => pitchToMidi(n.pitch))
    .filter((m): m is number => m !== null)
  if (midis.length === 0) return { lo: DEFAULT_LO, hi: DEFAULT_HI }
  let lo = Math.min(...midis) - 2
  const hi = Math.max(Math.max(...midis) + 2, lo + MIN_SPAN)
  return { lo, hi }
}

/** the note covering (midi, step), if any */
function noteAt(model: PianoRollModel, midi: number, step: number): RollNote | undefined {
  return model.notes.find(
    (n) => pitchToMidi(n.pitch) === midi && n.start <= step && step < n.start + n.duration,
  )
}

interface DragState {
  /** notes other than the one being dragged — the stable base each move rebuilds from */
  baseNotes: RollNote[]
  duration: number
  steps: number
  /** how far into the note the grab landed (step − note.start) */
  grabOffset: number
  /** the original note's pitch/start, for a click (no-move) removal */
  origPitch: string
  origStart: number
  moved: boolean
}

export function PianoRollGrid(): React.ReactElement {
  const { chunk, model, mutate, beginGesture, endGesture } = useGridModel<PianoRollModel>({
    source: 'roll',
    eligible: isRollChunk,
    parse: parsePianoRoll,
    serialize: serializePianoRoll,
  })

  const dragRef = React.useRef<DragState | null>(null)
  const playingStep = usePlayingStep(model?.steps ?? 0, model?.bars ?? 1)

  // Sticky pitch range: expand to fit, never shrink within a binding; reset on
  // statement change (#391).
  const [range, setRange] = React.useState<{ lo: number; hi: number }>({
    lo: DEFAULT_LO,
    hi: DEFAULT_HI,
  })
  const stmtIdRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (!model) return
    // Never reflow the rows mid-drag: a moved note expanding the range would
    // shift every row, so the cell under the pointer would change midi and the
    // drag would run away. The range catches up once the drag ends.
    if (dragRef.current) return
    const content = contentRange(model)
    const id = chunk ? chunk.statementRange[0] : null
    if (stmtIdRef.current !== id) {
      stmtIdRef.current = id
      setRange(content) // new statement → reseed
    } else {
      setRange((prev) => ({
        lo: Math.min(prev.lo, content.lo),
        hi: Math.max(prev.hi, content.hi),
      }))
    }
  }, [model, chunk])

  React.useEffect(() => {
    const onUp = (): void => {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null
      // a press with no move = a click → remove the note (rebuild from the base)
      if (!d.moved) mutate((prev) => ({ ...prev, notes: d.baseNotes }))
      endGesture()
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [mutate, endGesture])

  const onCellDown = (midi: number, step: number): void => {
    if (!model) return
    const note = noteAt(model, midi, step)
    if (note) {
      dragRef.current = {
        baseNotes: model.notes.filter((n) => n !== note),
        duration: note.duration,
        steps: model.steps,
        grabOffset: step - note.start,
        origPitch: note.pitch,
        origStart: note.start,
        moved: false,
      }
      beginGesture()
    } else {
      // empty cell → place a one-step note (its own undo)
      mutate((prev) => placeNote(prev, midiToPitch(midi), step, 1))
    }
  }

  const onCellEnter = (midi: number, step: number): void => {
    const d = dragRef.current
    if (!d || !model) return
    const newStart = Math.max(0, Math.min(step - d.grabOffset, d.steps - 1))
    const newPitch = midiToPitch(midi)
    const dur = Math.max(1, Math.min(d.duration, d.steps - newStart))
    const moved: PianoRollModel = {
      steps: d.steps,
      ...(model.bars != null ? { bars: model.bars } : {}),
      notes: [...d.baseNotes, { pitch: newPitch, start: newStart, duration: dur }],
    }
    // rebuild from the fixed base each time → no accumulation drift; a move
    // that can't serialize (overlap) is dropped by useGridModel.
    mutate(() => moved)
    d.moved = true
  }

  if (!model) {
    return React.createElement(VisualEditStandby, {
      panel: PIANO_ROLL_TAB_ID,
      hint:
        chunk && isRollChunk(chunk)
          ? "This melody isn't grid-editable — edit it as code."
          : ROLL_HINT,
      icon: 'music',
    })
  }

  const rows: number[] = []
  for (let m = range.hi; m >= range.lo; m--) rows.push(m) // high pitch on top

  return (
    <div
      data-bottom-panel-tab="piano-roll"
      style={{
        padding: 16,
        height: '100%',
        overflow: 'auto',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        touchAction: 'none',
      }}
    >
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((midi) => {
          const black = isBlackKey(midi)
          return (
            <div key={midi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 36,
                  fontSize: 9,
                  textAlign: 'right',
                  color: black
                    ? 'var(--foreground-muted, #a0a0aa)'
                    : 'var(--foreground, #e6e6ea)',
                }}
              >
                {midiToPitch(midi)}
              </span>
              <div style={{ display: 'flex', gap: 1 }}>
                {Array.from({ length: model.steps }, (_, step) => {
                  const note = noteAt(model, midi, step)
                  const on = note !== undefined
                  const isHead = on && note!.start === step
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${midiToPitch(midi)} step ${step + 1}`}
                      data-roll-cell={`${midi}:${step}`}
                      data-playing={step === playingStep ? 'true' : undefined}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        onCellDown(midi, step)
                      }}
                      onPointerEnter={() => onCellEnter(midi, step)}
                      style={{
                        width: 18,
                        height: 16,
                        padding: 0,
                        border:
                          step === playingStep
                            ? '1px solid var(--foreground, #e6e6ea)'
                            : '1px solid var(--border, #3a3a42)',
                        borderRadius: 2,
                        background: on
                          ? 'var(--accent, #6ea8fe)'
                          : step === playingStep
                            ? 'var(--background, #34343c)'
                            : black
                              ? 'var(--background, #1c1c20)'
                              : 'var(--background-elevated, #26262c)',
                        opacity: on && !isHead ? 0.7 : 1,
                        cursor: 'pointer',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
