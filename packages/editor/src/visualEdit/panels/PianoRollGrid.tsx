/**
 * Piano Roll — note grid (#383, drag-move + range stability from #391).
 *
 * Parses the mini-notation of the `note(...)` / `n(...)` statement under the
 * cursor into a `PianoRollModel` and renders pitch rows × step columns.
 * Interactions:
 *   - click an empty cell → place a note (one step; overlaps resolved);
 *   - click a note → remove it;
 *   - drag a note → move it in pitch + time (duration preserved), one undo;
 *   - drag a note's right-edge handle → resize its duration (`@n`), one undo.
 * Each edit re-serializes and writes back over the mini range (`'roll'`); a
 * serialization the subset can't express (e.g. a move that would overlap) is
 * dropped, leaving the document untouched — the conservatism rule.
 *
 * The visible pitch range is sticky within a binding: it expands to fit notes
 * but never shrinks when notes are removed, and resets only when the cursor
 * moves to a different statement (#391) — so editing doesn't make rows jump.
 */
import * as React from 'react'

import { parsePianoRoll, applyRollGain } from '../notation/parse'
import { serializePianoRoll, serializeRollGain } from '../notation/serialize'
import type { PianoRollModel, RollNote } from '../notation/model'
import { pitchToMidi, midiToPitch, isBlackKey } from '../notation/pitch'
import { VisualEditStandby } from './VisualEditStandby'
import { PIANO_ROLL_TAB_ID } from './tabs'
import { isRollChunk } from './patternKind'
import { useGridModel } from './useGridModel'
import { usePlayingStep } from './usePlayingStep'
import { placeNote, resizeNote } from '../notation/place'
import { type SelectedNote, gainAtStart, setGroupGain } from './inspector'

const ROLL_HINT = 'Click a melody to edit its notes.'

const DEFAULT_LO = 48 // c3
const DEFAULT_HI = 72 // c5
const MIN_SPAN = 12

/** velocity lane height (px) and the drag distance that spans the full 0→1 */
const LANE_HEIGHT = 48
const VELOCITY_FULL_PX = 80

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** velocity is grid-aligned only for single-bar, non-foreign rolls */
function gainInScope(model: PianoRollModel): boolean {
  return !model.gainForeign && (model.bars ?? 1) === 1
}

/**
 * The token for a row. A numeric pattern (#469) emits the bare row number
 * (`60`, `0`) so new/dragged notes keep the pattern's convention and round-trip;
 * a note-name pattern emits `c4`. The row value itself is the same either way.
 */
const tokenForRow = (numeric: boolean, midi: number): string =>
  numeric ? String(midi) : midiToPitch(midi)

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
  /** 'move' drags the note in pitch+time; 'resize' grows/shrinks its duration */
  mode: 'move' | 'resize'
  /** notes other than the one being dragged — the stable base each move rebuilds from */
  baseNotes: RollNote[]
  duration: number
  steps: number
  /** how far into the note the grab landed (step − note.start) */
  grabOffset: number
  /** the original note's pitch/start, for a click (no-move) removal / resize anchor */
  origPitch: string
  origStart: number
  moved: boolean
}

export interface PianoRollGridProps {
  /** the inspector's selected note (#432), owned by PatternPanel */
  selected?: SelectedNote | null
  onSelect?: (sel: SelectedNote | null) => void
}

export function PianoRollGrid({ selected, onSelect }: PianoRollGridProps = {}): React.ReactElement {
  const { chunk, model, mutate, beginGesture, endGesture } = useGridModel<PianoRollModel>({
    source: 'roll',
    eligible: isRollChunk,
    parse: parsePianoRoll,
    serialize: serializePianoRoll,
    applyGain: applyRollGain,
    serializeGain: serializeRollGain,
  })

  const dragRef = React.useRef<DragState | null>(null)
  // A velocity-lane drag: vertical drag on a note's bar sets that group's gain.
  const velRef = React.useRef<{ start: number; startY: number; startGain: number } | null>(null)
  const playingStep = usePlayingStep(model?.steps ?? 0, model?.bars ?? 1)

  // Latest selection + setter for use inside window-listener effects without
  // re-subscribing (#432). The grid sets selection; PatternPanel owns it.
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedRef = React.useRef(selected)
  selectedRef.current = selected
  const select = (sel: SelectedNote | null): void => onSelectRef.current?.(sel)

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
      // a press with no move on a note body = a click → SELECT it (#432;
      // removal moved to the Delete key). A no-move on the resize handle does
      // nothing. A real drag already selected the note in onCellEnter.
      if (!d.moved && d.mode === 'move') select({ kind: 'roll', pitch: d.origPitch, start: d.origStart })
      endGesture()
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [mutate, endGesture])

  // Velocity-lane drag: vertical drag on a note's bar sets its group's gain
  // (down = softer, up to a neutral-1 ceiling). One undo step per drag.
  React.useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const v = velRef.current
      if (!v) return
      const next = clamp01(v.startGain - (e.clientY - v.startY) / VELOCITY_FULL_PX)
      mutate((prev) => setGroupGain(prev, v.start, next))
    }
    const onUp = (): void => {
      if (!velRef.current) return
      velRef.current = null
      endGesture()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [mutate, endGesture])

  const onBarDown = (start: number, e: React.PointerEvent): void => {
    if (!model) return
    velRef.current = { start, startY: e.clientY, startGain: gainAtStart(model, start) }
    const rep = model.notes.find((n) => n.start === start)
    if (rep) select({ kind: 'roll', pitch: rep.pitch, start }) // inspect the group (#432)
    beginGesture()
  }

  const onCellDown = (midi: number, step: number): void => {
    if (!model) return
    const note = noteAt(model, midi, step)
    if (note) {
      dragRef.current = {
        mode: 'move',
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
      // empty cell → place a one-step note (its own undo) and select it (#432)
      mutate((prev) => placeNote(prev, tokenForRow(!!prev.numeric, midi), step, 1))
      select({ kind: 'roll', pitch: tokenForRow(!!model.numeric, midi), start: step })
    }
  }

  // Grab a note's right-edge handle → resize its duration. Anchored at the
  // note's start; the column the pointer reaches sets the new length.
  const onResizeDown = (note: RollNote): void => {
    if (!model) return
    dragRef.current = {
      mode: 'resize',
      baseNotes: model.notes.filter((n) => n !== note),
      duration: note.duration,
      steps: model.steps,
      grabOffset: 0,
      origPitch: note.pitch,
      origStart: note.start,
      moved: false,
    }
    beginGesture()
  }

  const onCellEnter = (midi: number, step: number): void => {
    const d = dragRef.current
    if (!d || !model) return
    if (d.mode === 'resize') {
      // duration = columns from the note start through the hovered column;
      // resizeNote floors at 1 and caps at the next note (no overlap).
      const dur = step - d.origStart + 1
      mutate((prev) => resizeNote(prev, d.origStart, dur))
      d.moved = true
      select({ kind: 'roll', pitch: d.origPitch, start: d.origStart })
      return
    }
    const newStart = Math.max(0, Math.min(step - d.grabOffset, d.steps - 1))
    const newPitch = tokenForRow(!!model.numeric, midi)
    const dur = Math.max(1, Math.min(d.duration, d.steps - newStart))
    const moved: PianoRollModel = {
      steps: d.steps,
      ...(model.bars != null ? { bars: model.bars } : {}),
      ...(model.numeric ? { numeric: true } : {}),
      notes: [...d.baseNotes, { pitch: newPitch, start: newStart, duration: dur }],
    }
    // rebuild from the fixed base each time → no accumulation drift; a move
    // that can't serialize (overlap) is dropped by useGridModel.
    mutate(() => moved)
    d.moved = true
    select({ kind: 'roll', pitch: newPitch, start: newStart }) // follow the note (#432)
  }

  // Delete/Backspace removes the selected note (#432 — removal moved off the
  // plain click). One undo step; clears the selection.
  const removeSelected = (): void => {
    const sel = selectedRef.current
    if (!sel || sel.kind !== 'roll') return
    mutate((prev) => ({
      ...prev,
      notes: prev.notes.filter((n) => !(n.pitch === sel.pitch && n.start === sel.start)),
    }))
    select(null)
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
      tabIndex={0}
      // Cell pointerdowns call preventDefault (blocks default focus, P200), so
      // focus the grid in the capture phase to receive the Delete key (#432).
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
        {rows.map((midi) => {
          // Piano black/white striping only makes sense for note-name rows;
          // for numeric patterns a row is a raw value (MIDI or degree), not a
          // key, so stripe uniformly and let the numeric label carry the pitch.
          const black = !model.numeric && isBlackKey(midi)
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
                {tokenForRow(!!model.numeric, midi)}
              </span>
              <div style={{ display: 'flex', gap: 1, flex: 1, minWidth: 0 }}>
                {Array.from({ length: model.steps }, (_, step) => {
                  const note = noteAt(model, midi, step)
                  const on = note !== undefined
                  const isHead = on && note!.start === step
                  const isTail = on && note!.start + note!.duration - 1 === step
                  const isSel =
                    on &&
                    selected?.kind === 'roll' &&
                    note!.pitch === selected.pitch &&
                    note!.start === selected.start
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${tokenForRow(!!model.numeric, midi)} step ${step + 1}`}
                      data-roll-cell={`${midi}:${step}`}
                      data-roll-selected={isSel ? 'true' : undefined}
                      data-playing={step === playingStep ? 'true' : undefined}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        onCellDown(midi, step)
                      }}
                      onPointerEnter={() => onCellEnter(midi, step)}
                      style={{
                        position: 'relative',
                        flex: '1 1 0',
                        minWidth: 12,
                        maxWidth: 44,
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
                        // selection ring (#432) — distinct from the playhead border
                        boxShadow: isSel
                          ? 'inset 0 0 0 2px var(--foreground, #e6e6ea)'
                          : undefined,
                      }}
                    >
                      {isTail && (
                        <span
                          data-roll-resize={`${midi}:${note!.start}`}
                          aria-label={`resize ${tokenForRow(!!model.numeric, midi)}`}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onResizeDown(note!)
                          }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            right: 0,
                            width: 5,
                            cursor: 'ew-resize',
                            background: 'var(--foreground, #e6e6ea)',
                            opacity: 0.45,
                            borderRadius: '0 2px 2px 0',
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
        {gainInScope(model) && (
          <div
            data-roll-velocity-lane
            style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 8 }}
          >
            <span
              style={{
                width: 36,
                fontSize: 9,
                textAlign: 'right',
                color: 'var(--foreground-muted, #a0a0aa)',
              }}
            >
              vel
            </span>
            <div style={{ display: 'flex', gap: 1, flex: 1, minWidth: 0, height: LANE_HEIGHT }}>
              {Array.from({ length: model.steps }, (_, col) => {
                const isStart = model.notes.some((n) => n.start === col)
                const g = gainAtStart(model, col)
                return (
                  <div
                    key={col}
                    data-vel-col={col}
                    onPointerDown={
                      isStart
                        ? (e) => {
                            e.preventDefault()
                            onBarDown(col, e)
                          }
                        : undefined
                    }
                    style={{
                      position: 'relative',
                      flex: '1 1 0',
                      minWidth: 12,
                      maxWidth: 44,
                      height: '100%',
                      borderRadius: 2,
                      background: 'var(--background-elevated, #26262c)',
                      cursor: isStart ? 'ns-resize' : 'default',
                    }}
                  >
                    {isStart && (
                      // bottom-anchored bar = the note group's velocity (full = neutral)
                      <span
                        data-vel-bar={col}
                        data-gain={g}
                        style={{
                          position: 'absolute',
                          left: 1,
                          right: 1,
                          bottom: 0,
                          height: `${clamp01(g) * 100}%`,
                          background: 'var(--accent, #6ea8fe)',
                          borderRadius: 2,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
