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
import type { PianoRollModel, RollNote, ColumnOverlap } from '../notation/model'
import {
  columnCount,
  columnOverlap,
  headColumn,
  rollContentRange,
  sequentialColumnGroups,
  tailColumn,
} from '../notation/model'
import { pitchToMidi, midiToPitch, noteDisplayName, isBlackKey, cLabel } from '../notation/pitch'
import { VisualEditStandby } from './VisualEditStandby'
import { PIANO_ROLL_TAB_ID } from './tabs'
import { opensPianoRoll } from './surfaceRoute'
import { useGridModel } from './useGridModel'
import { usePlayingStep } from './usePlayingStep'
import {
  canRemoveNote,
  pasteNote,
  placeNote,
  removeNote,
  resizeNote,
  viewPlacesNotes,
} from '../notation/place'
import { useNoteColorMode, velocityColor } from './noteColor'
import { useLiftResolution, useViewProver, type ResolutionControlProps } from './ResolutionControl'
import { PatternTrackChip } from './PatternTrackChip'
import {
  rollSlotState,
  quantizePianoRollTo,
  freeZoneScale,
  collapsePianoRollToDocument,
} from '../notation/resolution'
import { UNREFINED, documentSteps, type ViewScale } from '../notation/viewResolution'
import { type SelectedNote, gainAtStart, setGroupGain } from './inspector'
import { type Division, DEFAULT_DIVISION, stepsPerBar, snapInterval, snapColumn } from './division'
import { setNoteClip, getNoteClip } from './clipboard'
import { readChainMethod } from './chainMethod'
import { AUDITION_ENVELOPE, AUDITION_DUR_S } from '../audition'
import { superdough, getAudioContext } from '@strudel/webaudio'

const ROLL_HINT = 'Click a melody to edit its notes.'

/**
 * The right-edge grab zone of a note's tail cell, in px (#530). The visible
 * handle is a thin strip, but a near-miss that lands a few px inside the body
 * used to start a MOVE drag → a no-move release then DELETED the note
 * (click-toggle), so "resize" read as "the note keeps vanishing". Treating the
 * right `RESIZE_ZONE_PX` (or 40% of a wide cell) of the tail as resize-intent
 * makes the edge reliably grabbable and non-destructive. Capped below half the
 * cell so a centre click always stays in the move/delete area, even on a dense
 * grid with narrow cells.
 */
const RESIZE_ZONE_PX = 8

/**
 * Audition hold (#633): superdough has no live note-off, so a held key is kept
 * sounding by retriggering an overlapping sustained note on this interval (ms).
 * Each note's slice = this interval (so notes butt-join), with a short release so
 * the tail bridges the seam; the loop stops on release, so the note rings out
 * within one slice of letting go.
 */
const HOLD_RETRIGGER_MS = AUDITION_DUR_S * 1000

/**
 * What the velocity lane says when the gain writer declines this pattern (#1089).
 *
 * Its own sentence, and not the panel's placement one: 30 of the 33 corpus patterns this
 * covers already show "to add one, use the code view", which a reader takes to mean notes
 * cannot be ADDED — it says nothing about whether the ones here can be made louder.
 */
const VELOCITY_READ_ONLY = 'Shows this pattern’s velocities — to change them, use the code view.'

/** velocity lane height (px) and the drag distance that spans the full 0→1 */
const LANE_HEIGHT = 48
const VELOCITY_FULL_PX = 80

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/**
 * Velocity is grid-aligned for single-bar rolls and for multi-bar `<...>` rolls
 * whose bars are a single column each (`perBar === 1`, steps === bars) — one
 * note/chord per bar, where the gain is a flat sequence wrapped in `<...>`
 * (#632). Subdivided multi-bar (perBar > 1) and any `.gain` we don't manage
 * (`gainForeign`) are out of scope.
 */
function gainInScope(model: PianoRollModel): boolean {
  return !model.gainForeign && (model.bars == null || model.bars === model.steps)
}

/**
 * The token for a row. A numeric pattern (#469) emits the bare row number
 * (`60`, `0`) so new/dragged notes keep the pattern's convention and round-trip;
 * a note-name pattern emits `c4`. The row value itself is the same either way.
 */
const tokenForRow = (numeric: boolean, midi: number): string =>
  numeric ? String(midi) : midiToPitch(midi)

/**
 * The note covering (midi, step), if any — asked as an INTERVAL, not as an integer walk
 * (#1074).
 *
 * The old test was `n.start <= step && step < n.start + n.duration` against an integer
 * `step`, on the belief that `RollNote.duration` counts whole `@n` steps. It does not, and
 * the belief is worth naming because it has produced the same defect three times here:
 * `@n` is not a count of anything. It is a relative WEIGHT — an element occupies
 * `n / Σweights` of its enclosing sequence — so `@1` lasts half a cycle in `bd@1 sd@1` and
 * a quarter in a four-element one. `duration` is that share converted to COLUMNS, and it
 * is routinely fractional: the corpus disagreed on 17 notes. `[c5@0.5 f4@0.5 f5@3]` puts
 * `f4` at start 0.5 for 0.5, spanning `[0.5, 1.0)`, which contains no integer — so the
 * note sounded and was drawn in no column at all. Ten more were drawn for the wrong length
 * in both directions.
 */
function overlapAt(
  model: PianoRollModel,
  midi: number,
  step: number,
): { note: RollNote; overlap: ColumnOverlap } | undefined {
  for (const n of model.notes) {
    if (pitchToMidi(n.pitch) !== midi) continue
    const overlap = columnOverlap(n.start, n.start + n.duration, step)
    if (overlap) return { note: n, overlap }
  }
  return undefined
}

/** the note covering (midi, step), if any */
function noteAt(model: PianoRollModel, midi: number, step: number): RollNote | undefined {
  return overlapAt(model, midi, step)?.note
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
  /** snap/quantize division for move + resize (#432 Slice 2), owned by PatternPanel */
  division?: Division
  /** lift the grid-resolution ("Slots") control to the Pattern inspector (#601) */
  onResolution?: (r: ResolutionControlProps | null) => void
}

export function PianoRollGrid({
  selected,
  onSelect,
  division = DEFAULT_DIVISION,
  onResolution,
}: PianoRollGridProps = {}): React.ReactElement {
  // How finely this panel DRAWS the pattern (#1057) — a view only; the first write
  // absorbs it. A roll length is measured in columns, so a refine magnifies note
  // DURATIONS alongside their starts and the picture stays proportional.
  const [viewScale, setViewScale] = React.useState<ViewScale>(UNREFINED)
  const { chunk, model, mutate, beginGesture, endGesture } = useGridModel<PianoRollModel>({
    source: 'roll',
    eligible: opensPianoRoll,
    parse: parsePianoRoll,
    serialize: serializePianoRoll,
    applyGain: applyRollGain,
    serializeGain: serializeRollGain,
    viewScale,
    onViewScaleConsumed: () => setViewScale(UNREFINED),
    collapseToDocument: collapsePianoRollToDocument,
  })

  // A refinement belongs to the pattern it was made on — see `SequencerGrid` for
  // why carrying it across a cursor move could send an editable pattern to standby.
  const chunkKey = chunk ? `${chunk.exprRange[0]}:${chunk.miniString ?? ''}` : null
  React.useEffect(() => {
    setViewScale(UNREFINED)
  }, [chunkKey])

  const dragRef = React.useRef<DragState | null>(null)
  // A velocity-lane drag: vertical drag on a note's bar sets that group's gain.
  const velRef = React.useRef<{ start: number; startY: number; startGain: number } | null>(null)
  const playingStep = usePlayingStep(
    model?.steps ?? 0,
    model?.bars ?? 1,
    model ? columnCount(model) : 0,
  )
  const [colorMode] = useNoteColorMode()
  // Pitch row the pointer is over → highlight its key on the keyboard (#430).
  const [hoveredMidi, setHoveredMidi] = React.useState<number | null>(null)
  // Audition (#633): press-and-hold a key to sustain it (drag to glissando).
  // `holdMidiRef` = the pitch currently held (null when released); `holdTimerRef`
  // = the retrigger interval that keeps it sounding while held.
  const holdMidiRef = React.useRef<number | null>(null)
  const holdTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Latest selection + setter for use inside window-listener effects without
  // re-subscribing (#432). The grid sets selection; PatternPanel owns it.
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedRef = React.useRef(selected)
  selectedRef.current = selected
  const select = (sel: SelectedNote | null): void => onSelectRef.current?.(sel)

  // Sticky pitch range: expand to fit, never shrink within a binding; reset on
  // statement change (#391).
  // Seeded from the same rule that will reseed it — a model with nothing spellable
  // in it is exactly what the panel shows before one arrives.
  const [range, setRange] = React.useState<{ lo: number; hi: number }>(() =>
    rollContentRange({ notes: [] }),
  )
  const stmtIdRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (!model) return
    // Never reflow the rows mid-drag: a moved note expanding the range would
    // shift every row, so the cell under the pointer would change midi and the
    // drag would run away. The range catches up once the drag ends.
    if (dragRef.current) return
    const content = rollContentRange(model)
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
    // Key on `model` ONLY, not `[model, chunk]` (#597). `chunk` (the cursor's
    // statement) updates one render BEFORE `model` (useGridModel sets it in an
    // effect keyed on chunk). Firing on `chunk` ran the statement-change reset
    // on the STALE render — reseeding from the PREVIOUS track's model — so the
    // correct model always arrived in the expand-only union branch and the row
    // extent grew monotonically across track switches (never shrank, stuck at
    // the widest track). Firing on `model` only skips that stale render: the
    // reset runs once `model` matches the new `chunk`, replacing the extent.
    // Within-track edits still change `model` → id matches → sticky union (#391).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  // The roll's half of placement admissibility (#1064/#1070) — the VIEW-level
  // question only, and that asymmetry with the grid is measured, not stylistic.
  //
  // A leaf-anchored roll writes by byte surgery at each note's own span, and the
  // roll's leaf writer indexes no rest to swap, so it creates nothing: 18,386 of
  // 18,386 corpus placements on that path are refused, which is 96.3% of
  // everything inert on this surface. This one boolean catches all of it.
  //
  // The remaining 3.7% would need the grid's per-cell map, and here it does not
  // pay for itself. The roll's own paths are near-clean (element 0.9%, alt
  // 0.0%), while a roll view spans rows × steps rather than lanes × steps —
  // measured over the corpus, per model change: grid p50 0.01ms / p99 2.1ms,
  // roll p50 0.28ms / p99 21.7ms / worst 50ms at 1,632 cells. `mutate` fires on
  // every pointermove of a move drag, so on the roll that map would be a
  // per-frame cost, to make 0.9% of cells legible.
  //
  // Correctness does not rest on this either way: `placeNote` still asks the
  // real writer, so a refused click leaves the document untouched exactly as a
  // gated one would. What the 0.9% does not get is the affordance — unchanged
  // from today, and stated rather than quietly dropped.
  //
  // ⚠ IT ASKS THE OP NOW rather than reading the write path (#1154). The roll's
  // leaf writer indexes no rests, so its answer is the same `false` it always
  // was — but it is measured rather than inferred, and it stops at the first
  // acceptance, so a roll that places anything answers in one cell. Memoized on
  // the model, because a leaf roll (which refuses everything and is therefore
  // scanned in full) would otherwise pay for that scan on every render.
  const placesNotes = React.useMemo(() => (model ? viewPlacesNotes(model) : false), [model])
  // How many columns this roll DRAWS — not `model.steps`, which is the pattern's length
  // and need not be a whole number of columns (#1087). See `columnCount`.
  const cols = model ? columnCount(model) : 0
  /**
   * Can a velocity drag actually WRITE? (#1089)
   *
   * Asked of the REAL writer, not predicted. `gainInScope` answers a different question —
   * whether the lane should RENDER — and the two had drifted apart: for a pattern like
   * `[c5@0.5 f4@0.5 f5@3]` it is true (not foreign, single-bar) so the lane rendered in
   * full, every column took a `ns-resize` cursor and a pointer handler, and
   * `serializeRollGain` then declined every write. 305 columns across 33 corpus patterns
   * offered a drag that silently did nothing.
   *
   * The writer's refusal is CORRECT — the gain mini is one slot per column (`"0.5 1 1 1"`)
   * and a note beginning mid-column has no slot of its own to hold a value. The panel just
   * never asked it. `serializeRollGain` is already the exact predicate, so this is a read
   * and not a new rule — the failure mode `can<Op>` helpers have here is predicting the
   * writer, and asking it is what makes that impossible.
   *
   * Asked of the CURRENT model rather than of the model a drag would produce, and that is
   * measured rather than assumed: the skip is caused by the note geometry, which a gain
   * edit does not move, so the two answers never differ (0 of 2950 corpus columns).
   */
  const gainWritable = React.useMemo(
    () => (model ? serializeRollGain(model).kind !== 'skip' : false),
    [model],
  )

  React.useEffect(() => {
    const onUp = (): void => {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null
      // a press with no move on a note body = a click → DELETE it (click-toggle:
      // click empty adds, click a note removes). A no-move on the resize handle
      // does nothing; a real drag already moved/resized it.
      if (!d.moved && d.mode === 'move') {
        mutate((prev) => removeNote(prev, d.origStart, d.origPitch))
      }
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

  // Play one note through the same global audio graph the engine drives (#633).
  // `superdough` is a module singleton shared with the engine, so it reuses the
  // loaded samples/output. We pass the bound track's sound (`.s`) and the row's
  // note name (superdough parses the name itself, so the pitch matches playback),
  // plus a sustaining envelope so a held key rings out instead of the default
  // pluck (the synth `sustain` defaults to 0). Synth sounds always render;
  // sample/soundfont sounds need the engine initialized (a played doc) — else
  // this silently no-ops. superdough is async: an unready/unknown sound REJECTS,
  // so .catch it too (the try/catch only guards a synchronous throw).
  const playMidi = (midi: number): void => {
    try {
      const ctx = getAudioContext()
      void ctx.resume() // the press is the user gesture that unlocks audio
      const sound = chunk ? readChainMethod(chunk, ['sound', 's'])?.value : null
      // Shared envelope (#816) so a key tap and the Mixer picker's ▶ preview
      // sound identical — both trigger the same note shape through superdough.
      const value: Record<string, unknown> = {
        note: midiToPitch(midi),
        ...AUDITION_ENVELOPE,
      }
      if (sound) value.s = sound
      void superdough(value, ctx.currentTime + 0.02, HOLD_RETRIGGER_MS / 1000, 0.5, 0)?.catch(() => {})
    } catch {
      /* audio graph not ready — never break the UI */
    }
  }

  // Press-and-hold sustains the pitch (#633): superdough has no live note-off, so
  // a tight retrigger of an overlapping sustained note keeps it sounding while
  // held and lets go shortly after release. Dragging onto another key moves the
  // held pitch (glissando).
  const startHold = (midi: number): void => {
    holdMidiRef.current = midi
    playMidi(midi)
    if (holdTimerRef.current == null) {
      holdTimerRef.current = setInterval(() => {
        if (holdMidiRef.current != null) playMidi(holdMidiRef.current)
      }, HOLD_RETRIGGER_MS)
    }
  }
  const moveHold = (midi: number): void => {
    if (holdMidiRef.current == null || holdMidiRef.current === midi) return
    holdMidiRef.current = midi
    playMidi(midi) // immediate response as the drag crosses keys
  }
  const stopHold = (): void => {
    holdMidiRef.current = null
    if (holdTimerRef.current != null) {
      clearInterval(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  // Release the hold anywhere (the drag may end off a key); stop on unmount too.
  React.useEffect(() => {
    window.addEventListener('pointerup', stopHold)
    window.addEventListener('pointercancel', stopHold)
    return () => {
      window.removeEventListener('pointerup', stopHold)
      window.removeEventListener('pointercancel', stopHold)
      if (holdTimerRef.current != null) clearInterval(holdTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onBarDown = (start: number, e: React.PointerEvent): void => {
    if (!model) return
    velRef.current = { start, startY: e.clientY, startGain: gainAtStart(model, start) }
    beginGesture()
  }

  const onCellDown = (midi: number, step: number, e: React.PointerEvent): void => {
    if (!model) return
    // ⌘/Ctrl-click → SELECT this cell (for copy/paste, #528): the position is a
    // pitch token + step, so it works on an empty cell too (a paste target). No
    // edit. Modifier-gated, independent of the plain-click toggle.
    if (e.metaKey || e.ctrlKey) {
      select({ kind: 'roll', pitch: tokenForRow(!!model.numeric, midi), start: step })
      return
    }
    const note = noteAt(model, midi, step)
    if (note) {
      // Pressing the trailing edge of the note's TAIL cell = resize intent (#530),
      // even if the thin handle strip was missed. Widening this grab zone stops
      // a near-miss from starting a move/delete instead of a resize.
      //
      // ANCHORED TO THE BAR, NOT THE CELL (#1078) — and asked of the same
      // `tailColumn` the render uses. Both halves were wrong for a note that does
      // not fill its column. The integer walk (`start + duration - 1 === step`)
      // never matches a fractional note at all — `c5@0.5` asks `-0.5 === 0` — so
      // the generous zone simply never fired for the notes that most need it,
      // while the render drew them a handle; and measuring inward from the CELL's
      // right edge put the zone past the end of a bar that stops mid-column.
      //
      // The zone runs from the bar's trailing edge to the cell's right edge, so
      // nothing that used to resize stops resizing: for a whole-column note the
      // bar's edge IS the cell's edge and this reduces to the old rule exactly,
      // which is the control that keeps 4842-minus-18 notes unchanged. Its depth
      // scales with the BAR — a grab zone should be proportional to the thing it
      // grabs — floored at RESIZE_ZONE_PX so a 3px bar stays aimable, and still
      // capped against the CELL so it can never reach into a neighbouring column.
      const isTail = tailColumn(note) === step
      const rect = e.currentTarget.getBoundingClientRect()
      const ov = columnOverlap(note.start, note.start + note.duration, step)
      const barEnd = ov ? (ov.offset + ov.extent) * rect.width : rect.width
      const barW = ov ? ov.extent * rect.width : rect.width
      const zone = Math.min(rect.width * 0.45, Math.max(RESIZE_ZONE_PX, barW * 0.4))
      if (isTail && e.clientX - rect.left >= barEnd - zone) {
        onResizeDown(note)
        return
      }
      // a note: start a move drag; a press with no drag deletes it (onUp).
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
      // empty cell → place a one-step note (its own undo). Direct edit, no select.
      mutate((prev) => placeNote(prev, tokenForRow(!!prev.numeric, midi), step, 1))
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
    // Snap interval in columns for the active division (#432 Slice 2); null when
    // the division is the native grid or doesn't divide this grid evenly — then
    // move/resize land on the raw hovered column, exactly as before.
    const interval = snapInterval(stepsPerBar(model.steps, model.bars), division)
    if (d.mode === 'resize') {
      // duration = columns from the note start through the hovered column;
      // snap the END edge to the division line (min one division when snapping).
      // resizeNote floors at 1 and resizes only the grabbed note, by pitch — a note may
      // sustain under a later onset (#628). Where it caps depends on the model: the grid
      // end in a single-bar roll, the next onset in a multi-bar one, since `<...>` cannot
      // spell a mixed-duration chord inside one slot.
      //
      // ⚠ THIS COMMENT DOCUMENTED THE OPPOSITE OF WHAT HAPPENED until #1318. Multi-bar
      // rolls resized the whole chord and capped at any pitch's onset, so a drag on one
      // voice silently restretched its neighbours. The comment was right about the
      // intent and wrong about the code, which is the direction that gets believed.
      //
      // ⚠ IT CAN NOW DECLINE, returning the model unchanged — `mutate` treats that as no
      // edit, so the drag simply does not move, which is the right answer for a length
      // the document cannot carry. The handle is still drawn unconditionally though; the
      // grid gates its own on `canResizeCell` and the roll does not yet.
      let dur = step - d.origStart + 1
      if (interval) dur = Math.max(interval, snapColumn(d.origStart + dur, interval) - d.origStart)
      mutate((prev) => resizeNote(prev, d.origStart, d.origPitch, dur))
      d.moved = true
      return
    }
    let newStart = Math.max(0, Math.min(step - d.grabOffset, d.steps - 1))
    if (interval) newStart = Math.max(0, Math.min(snapColumn(newStart, interval), d.steps - 1))
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
  }

  // Delete/Backspace removes the selected note (#432 — removal moved off the
  // plain click). One undo step; clears the selection.
  const removeSelected = (): void => {
    const sel = selectedRef.current
    if (!sel || sel.kind !== 'roll') return
    mutate((prev) => removeNote(prev, sel.start, sel.pitch))
    select(null)
  }

  // ⌘/Ctrl-C → copy the note at the selected cell (its shape: pitch/duration/
  // gain) to the session clipboard (#528). No-op if the selected cell is empty.
  const copySelected = (): void => {
    const sel = selectedRef.current
    if (!model || !sel || sel.kind !== 'roll') return
    const note = model.notes.find((n) => n.pitch === sel.pitch && n.start === sel.start)
    if (!note) return
    setNoteClip({ pitch: note.pitch, duration: note.duration, gain: note.gain ?? 1 })
  }

  // ⌘/Ctrl-V → stamp the clip's duration + velocity at the SELECTED cell
  // (⌘-clicked target), replacing any note already there. One undo (#528).
  const pasteClip = (): void => {
    const clip = getNoteClip()
    const sel = selectedRef.current
    if (!model || !clip || !sel || sel.kind !== 'roll') return
    mutate((prev) => {
      // Replace-at-target is ONE op (`pasteNote`), so a refusal takes the clear
      // back with it instead of leaving a deletion behind. The gain is applied
      // only once the paste itself is known to have happened — `setGroupGain`
      // cannot decline, so composing it onto a refusal would write a gain
      // change for a note that was never pasted.
      const pasted = pasteNote(prev, sel.pitch, sel.start, clip.duration)
      if (pasted === prev) return prev
      return setGroupGain(pasted, sel.start, clip.gain)
    })
  }

  // PROVE, DON'T PREDICT — ask `parsePianoRoll` whether it really draws this
  // pattern at `scale`, never infer it from the arithmetic (#1117 refuses four).
  // Memoized per mini; the roll's parse is the dearer of the two (1.74ms/ask).
  const canDrawView = useViewProver(chunk?.miniString, parsePianoRoll)

  // Grid resolution (#479, #1057): a free-zone target changes only how finely we
  // DRAW and leaves the document byte-identical. Everything else is unchanged —
  // lossless ×2/÷2 when the ratio allows (onsets byte-identical), else quantize
  // the notes onto the new grid, a no-op target returning the same model so
  // `mutate` skips. The verdict comes from the same `rollSlotState` call that
  // renders the button, so the control and the click cannot disagree.
  const scaleToSlots = (target: number): void => {
    if (!model) return
    if (rollSlotState(model, target, canDrawView) === 'view') {
      const scale = freeZoneScale(documentSteps(model), target)
      if (scale !== null) setViewScale(scale)
      return
    }
    mutate((prev) => quantizePianoRollTo(prev, target))
  }

  // The "Slots" control now lives in the Pattern inspector (#601) — lift this
  // grid's resolution state to it instead of rendering it in the overlay header.
  // (`scaleToSlots` is a fresh closure each render; useLiftResolution keeps it
  // ref-backed so the lift stays loop-free.)
  useLiftResolution(
    model?.steps ?? null,
    (t) => (model ? rollSlotState(model, t, canDrawView) : 'disabled'),
    scaleToSlots,
    onResolution,
  )

  if (!model) {
    return React.createElement(VisualEditStandby, {
      panel: PIANO_ROLL_TAB_ID,
      hint:
        chunk && opensPianoRoll(chunk)
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
          return
        }
        if (e.metaKey || e.ctrlKey) {
          if (e.key === 'c' || e.key === 'C') {
            e.preventDefault()
            copySelected()
          } else if (e.key === 'v' || e.key === 'V') {
            e.preventDefault()
            pasteClip()
          }
        }
      }}
      style={{
        position: 'relative',
        height: '100%',
        outline: 'none', // focusable for the Delete key (#432); scroll is on the inner div (#518)
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        touchAction: 'none',
      }}
    >
      {/* Track identity (#589) — the bound track's colour dot + name, pinned
          top-LEFT as an overlay (same no-vertical-cost reasoning as the controls
          below). Click the dot to recolour, double-click the name to rename. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <PatternTrackChip />
      </div>
      {/* ONE statement for a view that cannot take a new note (#1070) — the same
          fact the grid states, on the surface that carries 18,386 of the corpus's
          19,098 inert roll placements. Moving, resizing, deleting and velocity
          all still work on the notes that are here. */}
      {!placesNotes && (
        <div
          data-roll-no-placement
          style={{
            fontSize: 11,
            color: 'var(--foreground-muted, #a0a0aa)',
            padding: '0 8px 4px',
          }}
        >
          Edits the notes already here — to add one, use the code view.
        </div>
      )}
      {/* "Slots" moved to the Pattern inspector (#601) and the Note Color toggle
          to the editor Settings tab (#602) — the old top-right overlay is gone,
          so the piano roll keeps its full height for pitch rows. */}
      <div
        // always-visible (non-overlay) scrollbar when the rows overflow the
        // panel, styled in globals.css (the editor ships no CSS) — #pattern-scrollbar.
        data-pattern-scroll
        style={{ padding: 16, height: '100%', overflow: 'auto', boxSizing: 'border-box' }}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}
          onPointerLeave={() => setHoveredMidi(null)}
        >
          {rows.map((midi) => {
          // Piano black/white striping only makes sense for note-name rows;
          // for numeric patterns a row is a raw value (MIDI or degree), not a
          // key, so stripe uniformly and let the numeric label carry the pitch.
          const black = !model.numeric && isBlackKey(midi)
          const hovered = midi === hoveredMidi
          const keyC = cLabel(midi)
          return (
            <div
              key={midi}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              // Don't chase hover mid-drag — a re-render here would interrupt the
              // note move/resize gesture (which is driven by cell pointerenter).
              onPointerEnter={() => {
                if (!dragRef.current && !velRef.current) setHoveredMidi(midi)
              }}
            >
              {model.numeric ? (
                // Numeric rows are raw values/degrees, not piano keys — keep the
                // value label (no keyboard graphic).
                <span
                  style={{
                    width: 36,
                    fontSize: 9,
                    textAlign: 'right',
                    color: 'var(--foreground, #e6e6ea)',
                  }}
                >
                  {tokenForRow(true, midi)}
                </span>
              ) : (
                // Graphical piano key (#430). Fixed-width key bed so the note
                // cells stay column-aligned across every row (PV120 single
                // vertical axis — same `rows` midi list). White keys fill the
                // bed light; a black key is a shorter dark bar overlaid on the
                // BACK (left) of the bed, leaving the white front edge visible —
                // the keyboard look. C rows are labelled (C is always white).
                <span
                  data-roll-key={midi}
                  data-roll-key-black={black ? 'true' : undefined}
                  // Press-and-hold to audition (sustains while held); drag onto
                  // another key to glissando (#633).
                  title={`Play ${noteDisplayName(midi)}`}
                  onPointerDown={(e) => {
                    e.preventDefault() // don't start a text selection / steal focus
                    startHold(midi)
                  }}
                  onPointerEnter={() => moveHold(midi)}
                  style={{
                    position: 'relative',
                    width: 40,
                    height: 16,
                    flex: '0 0 auto',
                    boxSizing: 'border-box',
                    borderRadius: '2px 3px 3px 2px',
                    border: '1px solid var(--border, #3a3a42)',
                    background: hovered ? '#cdd3ff' : '#e8e8ec',
                    color: '#3a3a42',
                    fontSize: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 3,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    touchAction: 'none', // let a touch-drag glissando across keys
                  }}
                >
                  {black && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '62%',
                        background: hovered ? '#3a3a44' : '#1b1b20',
                        borderRadius: '1px 2px 2px 1px',
                      }}
                    />
                  )}
                  <span style={{ position: 'relative' }}>{keyC ?? ''}</span>
                </span>
              )}
              <div style={{ display: 'flex', gap: 1, flex: 1, minWidth: 0 }}>
                {Array.from({ length: cols }, (_, step) => {
                  const hit = overlapAt(model, midi, step)
                  const note = hit?.note
                  const on = note !== undefined
                  const isHead = on && headColumn(note!) === step
                  const isTail = on && tailColumn(note!) === step
                  // the ⌘-clicked copy/paste cell — highlighted whether or not a
                  // note sits there, so an empty paste target is visible (#528).
                  const isSel =
                    selected?.kind === 'roll' &&
                    selected.start === step &&
                    selected.pitch === tokenForRow(!!model.numeric, midi)
                  // On a view that takes no new note, an empty cell says so
                  // (#1070). A cell holding a note keeps every gesture it had —
                  // move, resize, delete, velocity — and so does ⌘-click, which
                  // selects a paste target without editing anything.
                  const canPlace = on || placesNotes
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${tokenForRow(!!model.numeric, midi)} step ${step + 1}`}
                      // THE SELECTION, SAID RATHER THAN ONLY DRAWN (#1080). Until
                      // now selection was a data attribute and a ring — one for
                      // tests, one for pixels, neither of which reaches assistive
                      // tech, so the copy/paste target was announced exactly like
                      // every other cell. #1077 was the same object failing for
                      // sighted users; restoring the ring is what made the half
                      // that was never there worth writing down.
                      //
                      // `aria-current` rather than `aria-selected`: this cell IS
                      // the target of the next paste, which is what `aria-current`
                      // means on a control. `aria-selected` would imply a
                      // listbox/grid role, and declaring one commits the panel to a
                      // keyboard contract (roving tabindex, arrow-key navigation)
                      // it does not implement — announcing a contract you do not
                      // keep is worse than the omission. That role, and the
                      // navigation it obliges, is its own question (#1083).
                      aria-current={isSel ? 'true' : undefined}
                      data-roll-cell={`${midi}:${step}`}
                      data-roll-selected={isSel ? 'true' : undefined}
                      data-playing={step === playingStep ? 'true' : undefined}
                      data-roll-cell-inert={canPlace ? undefined : 'true'}
                      aria-disabled={canPlace ? undefined : true}
                      // `canPlace` is false only when the view takes no new note
                      // at all, so there is one reason to give, not two.
                      title={
                        canPlace
                          ? undefined
                          : 'This pattern edits its existing notes — add notes in the code view.'
                      }
                      onPointerDown={(e) => {
                        e.preventDefault()
                        // ⌘/Ctrl-click is selection, not an edit — it stays
                        // available on a cell that cannot take a note.
                        if (!canPlace && !(e.metaKey || e.ctrlKey)) return
                        onCellDown(midi, step, e)
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
                        // The note is drawn by the fill BELOW, not by this background, so
                        // that a note occupying part of a column occupies part of the box
                        // (#1074). The cell keeps its own empty-cell background.
                        background:
                          step === playingStep
                            ? 'var(--background, #34343c)'
                            : black
                              ? 'var(--background, #1c1c20)'
                              : 'var(--background-elevated, #26262c)',
                        cursor: 'pointer',
                        // The selection ring (#432) is NOT here — see the overlay that
                        // is the cell's last child (#1077).
                      }}
                    >
                      {hit && (
                        // The note itself. WIDTH is how much of this column it sounds
                        // for and LEFT is where in the column it begins — the same
                        // geometry the step grid draws (#1056), from the same shared
                        // `columnOverlap` rule, with the offset that only the roll needs
                        // because only a roll note carries a fractional start.
                        //
                        // A non-head is dimmed, which is what this surface already did
                        // via the button's own opacity; moving it onto the fill keeps the
                        // cell's playhead border and selection ring at full strength.
                        <span
                          data-roll-fill
                          data-roll-sustain={!isHead ? 'true' : undefined}
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${hit.overlap.offset * 100}%`,
                            width: `${hit.overlap.extent * 100}%`,
                            background:
                              colorMode === 'velocity'
                                ? velocityColor(note!.gain ?? 1)
                                : 'var(--accent, #6ea8fe)',
                            opacity: isHead ? 1 : 0.7,
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                      {isHead && (
                        // Note name inside the bar (#605) — rendered on the head
                        // cell, clipped to THE BAR so it never spills onto a
                        // neighbour or onto the empty part of its own column.
                        // pointer-events:none so it never blocks the cell's
                        // pointer gestures (paint/drag) or the tail resize handle.
                        //
                        // Positioned against the FILL's box, not the cell's (#1078).
                        // While the note WAS the whole cell the two rectangles
                        // coincided and nothing had to choose; once the note became a
                        // child span occupying only its overlap (#1076), `inset: 0`
                        // put the label on empty background BESIDE the bar it names —
                        // 12 of 4842 corpus notes, every one of them a note that
                        // begins mid-column. Same two numbers the bar uses, so the
                        // two cannot drift apart again.
                        <span
                          data-roll-note-name
                          // aria-hidden holds, checked rather than assumed (#1080):
                          // this renders `noteDisplayName(midi)`, which is
                          // `midiToPitch(midi)` capitalised, and the cell's own
                          // aria-label opens with `tokenForRow` — the same
                          // `midiToPitch(midi)`. The name is already announced.
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${hit!.overlap.offset * 100}%`,
                            width: `${hit!.overlap.extent * 100}%`,
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: 3,
                            fontSize: 8,
                            lineHeight: 1,
                            fontWeight: 600,
                            color: '#fff',
                            textShadow: '0 1px 1px rgba(0,0,0,0.55)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            pointerEvents: 'none',
                          }}
                        >
                          {model.numeric ? String(midi) : noteDisplayName(midi)}
                        </span>
                      )}
                      {isTail && (
                        // The resize handle sits at the BAR's trailing edge, not the
                        // cell's (#1078). A note that ends mid-column used to put its
                        // handle at the far side of the column — floating in empty
                        // background past the end of the note it resizes, which is a
                        // handle you cannot aim at because it is not on the thing.
                        // 18 of 4842 corpus notes.
                        //
                        // WIDTH IS CLAMPED TO THE BAR: a `@0.25` note in a
                        // minimum-width (12px) column is a 3px bar, and a fixed 8px
                        // handle would be wider than the note, overhanging backwards
                        // past its own start. The handle is never wider than what it
                        // resizes. What that costs — a very small note draws a very
                        // small handle — is paid back by the pointer-down grab zone
                        // below, which is floored and invisible: what you SEE is the
                        // note's own trailing edge, what you can HIT is larger.
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
                            right: `${(1 - hit!.overlap.offset - hit!.overlap.extent) * 100}%`,
                            width: `min(${RESIZE_ZONE_PX}px, ${hit!.overlap.extent * 100}%)`,
                            cursor: 'ew-resize',
                            background: 'var(--foreground, #e6e6ea)',
                            opacity: 0.45,
                            borderRadius: '0 2px 2px 0',
                          }}
                        />
                      )}
                      {isSel && (
                        // Selection ring (#432), drawn as the LAST child rather than as
                        // the cell's own inset shadow (#1077).
                        //
                        // An inset box-shadow paints with the element's background, and
                        // every child paints above it. That cost nothing while the note
                        // WAS the background; once the note became a child span (#1074)
                        // the ring was covered on every cell holding a note — which is
                        // every cell you would want to select. Measured against the
                        // previous build: 424 white ring pixels on a selected note cell
                        // → 0, while a selected EMPTY cell was unaffected, which is
                        // exactly why every existing assertion stayed green.
                        //
                        // Drawn last so it frames whatever is underneath — note, name,
                        // resize handle or bare cell — and never has to know which.
                        <span
                          data-roll-selection
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            // Laid out against the PADDING box, so the ring sits a pixel
                            // further in than the old inset shadow did — measured 403
                            // white frame pixels against the original 424. Growing the
                            // overlay by the border width to close that gap was tried and
                            // MEASURED WORSE: at `inset: -1` the ring is drawn outside the
                            // cell and bleeds across the 1px lane gap (2156). The pixel
                            // nearest the border is not worth a ring that leaves its cell.
                            inset: 0,
                            borderRadius: 2,
                            boxShadow: 'inset 0 0 0 2px var(--foreground, #e6e6ea)',
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
        {gainInScope(model) && (
          <div
            data-roll-velocity-lane
            // The velocity lane is the last child INSIDE the scroll area, so it
            // scrolls together with the pitch rows (the #604 sticky / #624 footer
            // pinning is reverted): the always-visible scrollbar lets you scroll
            // straight down to it, so it no longer needs to be pinned or pulled
            // out as a footer.
            style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 8 }}
          >
          <span
              // The reason, stated rather than left to a dead gesture (#1089). The lane
              // still shows the pattern's real gains; what it cannot do here is change
              // them, because a note starting mid-column has no gain slot of its own.
              title={
                gainWritable
                  ? undefined
                  : VELOCITY_READ_ONLY
              }
              style={{
                width: 36,
                fontSize: 9,
                textAlign: 'right',
                color: 'var(--foreground-muted, #a0a0aa)',
              }}
            >
              vel{gainWritable ? '' : ' ·'}
            </span>
            <div style={{ display: 'flex', gap: 1, flex: 1, minWidth: 0, height: LANE_HEIGHT }}>
              {Array.from({ length: cols }, (_, col) => {
                // Prefer the note that STARTS at this column (it keeps its own
                // velocity); otherwise a held note (`@n`) sustaining over the
                // column fills the slot with its velocity. So extending a note
                // copies its velocity onto the empty slots it covers, while a
                // slot that already has its own note keeps that note's velocity.
                const covering =
                  model.notes.find((n) => n.start === col) ??
                  model.notes.find((n) => n.start < col && col < n.start + n.duration)
                const g = covering ? gainAtStart(model, covering.start) : 1
                // SPLIT THE COLUMN when more than one group sounds through it AND those
                // groups are sequential — one ends where the next begins (#1086). Then
                // each gets its own bar at its own offset/extent, the geometry the roll's
                // own rows have drawn since #1074. A group that begins mid-column had no
                // bar at all before this: the lane asked `n.start === col`, an equality a
                // fractional start never satisfies.
                //
                // Groups that overlap IN TIME are NOT split — a stack's simultaneous
                // voices are not sequential along the column's time axis, so laying them
                // out that way stacks one bar on another. 129 of the corpus's 137
                // multi-group columns are that case and they keep today's single bar;
                // what they should show instead is #1088, a layout question.
                const split = sequentialColumnGroups(model.notes, col)
                return (
                  <div
                    key={col}
                    data-vel-col={col}
                    // The gesture is offered only where the writer accepts it (#1089).
                    // On a pattern whose gain the writer declines the bars still draw —
                    // they carry the gains the pattern really has — but there is no
                    // cursor and no handler, because both would promise a write that
                    // cannot happen.
                    data-vel-readonly={gainWritable ? undefined : 'true'}
                    // Stated where the pointer actually goes. The panel's other refusal
                    // ("to add one, use the code view") is about PLACEMENT and covers 30
                    // of these 33 patterns, but it does not say anything about velocity —
                    // a reader takes it to mean notes cannot be ADDED, not that the ones
                    // here cannot be made louder. So the lane owes its own reason.
                    title={
                      gainWritable
                        ? undefined
                        : VELOCITY_READ_ONLY
                    }
                    onPointerDown={
                      covering && gainWritable
                        ? (e) => {
                            e.preventDefault()
                            onBarDown(covering.start, e)
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
                      cursor: covering && gainWritable ? 'ns-resize' : 'default',
                    }}
                  >
                    {split
                      ? split.map((grp) => {
                          const gg = gainAtStart(model, grp.start)
                          return (
                            <span
                              key={grp.start}
                              data-vel-bar={col}
                              data-vel-group={grp.start}
                              data-gain={gg}
                              style={{
                                position: 'absolute',
                                // laid against the column's own box, like the note fill
                                left: `${grp.offset * 100}%`,
                                width: `${grp.extent * 100}%`,
                                bottom: 0,
                                height: `${clamp01(gg) * 100}%`,
                                background:
                                  colorMode === 'velocity' ? velocityColor(gg) : 'var(--accent, #6ea8fe)',
                                borderRadius: 2,
                                // VISUAL ONLY, and still deliberately so. Every column
                                // that splits today sits in a pattern with a
                                // fractional-start note, and `serializeRollGain` skips
                                // exactly those — the gain mini is one slot per column,
                                // and a note beginning mid-column has no slot of its own.
                                // #1089 has since made the whole column read-only in that
                                // case, so there is no drag here to divide per group; a
                                // per-bar drag becomes worth building the day a split
                                // column appears in a pattern the gain writer accepts,
                                // and not before.
                                pointerEvents: 'none',
                              }}
                            />
                          )
                        })
                      : covering && (
                          // bottom-anchored bar = the note group's velocity (full = neutral)
                          <span
                            data-vel-bar={col}
                            data-vel-group={covering.start}
                            data-gain={g}
                            style={{
                              position: 'absolute',
                              left: 1,
                              right: 1,
                              bottom: 0,
                              height: `${clamp01(g) * 100}%`,
                              background: colorMode === 'velocity' ? velocityColor(g) : 'var(--accent, #6ea8fe)',
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
    </div>
  )
}
