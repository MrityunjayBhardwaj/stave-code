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
 * Length: a note is drawn across the columns it covers (#1056) and its trailing
 * edge carries a handle that sets how long it sounds, in whole columns (#1053) —
 * the roll's gesture on the other surface. The handle is drawn only where the
 * writer would take the drag, so it never promises an edit the document refuses.
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
import { columnCount, isCellOn, laneCoverage } from '../notation/model'
import type { StepGridModel } from '../notation/model'
import { VisualEditStandby } from './VisualEditStandby'
import { SEQUENCER_TAB_ID } from './tabs'
import { opensStepGrid } from './surfaceRoute'
import { useGridModel } from './useGridModel'
import { usePlayingStep } from './usePlayingStep'
import { addLane, removeLane } from '../notation/lane'
import { canResizeCell, canToggleCell, resizeCell, toggleCell, viewPlacesNotes } from '../notation/place'
import { DRUM_SOUNDS } from './soundCatalog'
import { sampleVoice } from './drumVoices'
import { chordLanes } from './chordLanes'
import { useNoteColorMode, velocityColor } from './noteColor'
import { useLiftResolution, useViewProver, type ResolutionControlProps } from './ResolutionControl'
import { PatternTrackChip } from './PatternTrackChip'
import {
  stepSlotState,
  stepResolutionEffect,
  quantizeStepGridTo,
  freeZoneScale,
  collapseStepGridToDocument,
} from '../notation/resolution'
import { UNREFINED, documentSteps, type ViewScale } from '../notation/viewResolution'
import { setColumnGain } from './inspector'

const SEQ_HINT = 'Click a drum pattern to edit it as a step grid.'

/** px of vertical drag that spans the full 0→1 velocity range */
const VELOCITY_FULL_PX = 80
/** px of movement before a press on an ON cell becomes a drag (not a click) */
const DRAG_THRESHOLD = 4
/**
 * Width of the note-length handle, and the floor on its invisible grab zone (#1053).
 *
 * The SAME number the piano roll uses, because this is the same gesture on the other
 * surface and #1053 asks the two to agree rather than diverge. Kept as its own constant
 * here rather than imported: the roll's is a private detail of the roll's geometry, and
 * an import would make either panel's tuning silently retune the other.
 */
const RESIZE_ZONE_PX = 8

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** velocity is grid-aligned only for single-part, single-bar, non-foreign models */
function gainInScope(model: StepGridModel): boolean {
  if (model.gainForeign || (model.bars ?? 1) > 1) return false
  return new Set(model.lanes.map((l) => l.part ?? 0)).size === 1
}

export interface SequencerGridProps {
  /** lift the grid-resolution ("Slots") control to the Pattern inspector (#601) */
  onResolution?: (r: ResolutionControlProps | null) => void
}

export function SequencerGrid({ onResolution }: SequencerGridProps = {}): React.ReactElement {
  // How finely this panel DRAWS the pattern (#1057). Purely a view: nothing here
  // reaches the document until an actual edit is made, and the first write absorbs
  // it (`useGridModel` → `absorbViewScale`).
  const [viewScale, setViewScale] = React.useState<ViewScale>(UNREFINED)
  const { chunk, model, mutate, beginGesture, endGesture } = useGridModel<StepGridModel>({
    source: 'seq',
    eligible: opensStepGrid,
    parse: parseStepGrid,
    serialize: serializeStepGrid,
    applyGain: applyStepGain,
    serializeGain: serializeStepGain,
    viewScale,
    onViewScaleConsumed: () => setViewScale(UNREFINED),
    collapseToDocument: collapseStepGridToDocument,
  })

  // A refinement belongs to the pattern it was made on. Dropping it when the cursor
  // moves keeps a leftover zoom from deciding whether the NEXT pattern opens at all —
  // four projections refuse a finer view (#1117), so a carried scale could send an
  // perfectly editable pattern to standby with nothing reporting why.
  const chunkKey = chunk ? `${chunk.exprRange[0]}:${chunk.miniString ?? ''}` : null
  React.useEffect(() => {
    setViewScale(UNREFINED)
  }, [chunkKey])

  // The grid's length is always a whole number of columns, so `columnCount` is `steps`
  // here; it is asked anyway so both panels bound the playhead by the same rule (#1087).
  const playingStep = usePlayingStep(
    model?.steps ?? 0,
    model?.bars ?? 1,
    model ? columnCount(model) : 0,
  )
  const [colorMode] = useNoteColorMode()

  // One pointer gesture from a cell press. An OFF cell paints immediately (snappy
  // step entry); an ON cell starts PENDING — a vertical drag past the threshold
  // becomes velocity, a horizontal drag becomes paint-off, and a release with no
  // move is a plain toggle-off. The whole gesture is one undo step.
  //
  // A press inside a note's trailing grab zone is 'resize' and is decided BEFORE any
  // of that (#1053), so it never passes through 'pending' — which is what keeps a
  // release with no movement from falling through to the toggle-off in `onUp`.
  // `step` is then the note's OWN start column, not the column pressed.
  const gestureRef = React.useRef<{
    lane: number
    step: number
    startX: number
    startY: number
    startGain: number
    mode: 'paint' | 'pending' | 'velocity' | 'resize'
    paintValue: boolean
  } | null>(null)

  const gainScoped = model ? gainInScope(model) : false

  // Does this view place notes ANYWHERE? Said ONCE here rather than as a grid
  // full of individually dead cells with no reason on them (#1070) — the per-cell
  // map below refuses each of them anyway; this is what lets the panel give a
  // reason for the surface.
  //
  // ⚠ It ASKS, and no longer reads the write path. A leaf-anchored projection
  // used to be creation-incapable by construction; since rests carry a span
  // (#1154) some leaf grids take a note and most still do not, so the honest
  // answer is per view and only the view can give it. Memoized for the same
  // reason `placeable` is: `mutate` fires every pointermove of a drag.
  const placesNotes = React.useMemo(() => (model ? viewPlacesNotes(model) : false), [model])

  // Is this a CHORD CHART rather than a drum kit (#1241)? Asked of the lane
  // tokens, because the route cannot answer it: seven of the thirteen units
  // that reach this grid without an `s()` head are ordinary drum patterns whose
  // sound is assigned further down the chain, so "the head was silent" would
  // relabel them all. Memoized on the lane names rather than the model, since
  // every drag rebuilds the model and none of them renames a lane.
  const laneKey = model ? model.lanes.map((l) => l.sound).join('\u0000') : ''
  const isChordChart = React.useMemo(
    () => chordLanes(laneKey === '' ? [] : laneKey.split('\u0000')),
    [laneKey],
  )

  // PROVE BEFORE OFFER, at the cell — the gesture this panel exists for.
  // `canToggleCell` runs the real op and asks the real writer, so it cannot
  // drift from what a click actually does ([[PV241]]). Only the OFF→ON direction
  // is gated: an ON cell still carries its delete and its velocity drag, which
  // are different ops with their own write paths, and narrowing those is not
  // what #1070 decided.
  //
  // Memoized on the model, so the serialize-per-empty-cell is paid once per
  // edit rather than once per render.
  const placeable = React.useMemo(
    () =>
      model
        ? model.lanes.map((lane, li) =>
            lane.cells.map((c, si) => (isCellOn(c) ? true : canToggleCell(model, li, si, true))),
          )
        : null,
    [model],
  )

  // How long each note SOUNDS, per column (#1056). The grid drew one full box per
  // trigger and nothing at all for the columns a note carried on through, so
  // `bd _ sd ~` and `bd ~ sd ~` were the same picture — a length the parser reads
  // and the printer preserves that no user could see ([[PV245]]).
  //
  // Memoized alongside `placeable` and for the same reason: `mutate` fires every
  // pointermove of a drag, so anything derived per cell is recomputed per frame
  // unless it hangs off the model ([[P380]] — where the comment claiming a per-cell
  // map was cheap predated any measurement, so this one carries the number).
  //
  // MEASURED over the 958 corpus models, same shape as that entry: p50 0.0006ms,
  // p99 0.0063ms, worst 0.0985ms — against `placeable`'s p99 2.25ms and worst
  // 13.10ms on the same run, i.e. 0.86% of its total. The carry loop breaks at the
  // next onset, so a lane costs one pass over its own cells however long the notes
  // are. It rides along with the expensive memo rather than adding a frame cost.
  const coverage = React.useMemo(
    () => (model ? model.lanes.map((lane) => laneCoverage(lane.cells, model.steps)) : null),
    [model],
  )

  // PROVE BEFORE OFFER, at the length handle (#1053) — the same rule the cell already
  // applies, asked of `resizeCell` itself so the handle cannot promise a drag the writer
  // declines. A note gets a handle exactly when SOME length other than its own is
  // admissible: one column longer, or one shorter. Both are asked, because the two
  // decline independently — a note with no room ahead can still be shortened, and a note
  // already at one column can only grow.
  //
  // Asked around the ROUNDED length, since that is the lattice the gesture moves on: a
  // drag sets a whole number of columns, and a sub-column note (`[hh ~]!16` → 0.5) is
  // offered the nearest whole lengths rather than a fraction it could not be dragged to.
  //
  // Keyed by the note's HEAD column, so a two-column note asks once rather than once per
  // column it covers. Memoized on the model beside `placeable`/`coverage` and for the
  // same reason ([[P380]]): `mutate` fires every pointermove, so anything derived per
  // cell is recomputed per frame unless it hangs off the model.
  //
  // MEASURED over the 966 corpus models, because [[P380]] is precisely the entry where a
  // comment called a per-cell map cheap before anyone had timed one: p50 0.0022ms, p99
  // 0.357ms, worst 1.26ms — against `placeable`'s p50 0.0047ms, p99 2.54ms, worst 14.4ms
  // on the same run, i.e. **16.1% of its total**. It costs less than the map beside it
  // despite serializing, because it asks once per NOTE while `placeable` asks once per
  // EMPTY cell, and grids have far more of those.
  const resizable = React.useMemo(() => {
    if (!model) return null
    return model.lanes.map((lane, li) => {
      const out = new Set<number>()
      lane.cells.forEach((c, si) => {
        if (!isCellOn(c)) return
        const d = Math.round(c.duration)
        if (canResizeCell(model, li, si, d + 1) || canResizeCell(model, li, si, d - 1)) out.add(si)
      })
      return out
    })
  }, [model])

  const paintCell = React.useCallback(
    (laneIndex: number, stepIndex: number, value: boolean): void => {
      mutate((prev) => {
        const lane = prev.lanes[laneIndex]
        if (!lane || stepIndex >= lane.cells.length || isCellOn(lane.cells[stepIndex]) === value) {
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

  // PROVE, DON'T PREDICT: does the parser actually draw this pattern at `scale`?
  // Asked of `parseStepGrid` itself, because four projections refuse a finer view
  // (#1117) and an offer made on arithmetic alone is how a control ends up
  // clickable and inert — the defect #1010 P4c had to repair once already.
  // Memoized per mini: the control asks once per preset per render, and a real
  // parse per ask is a per-gesture cost charged at a per-frame rate.
  const canDrawView = useViewProver(chunk?.miniString, parseStepGrid)

  // Grid resolution (#479, #1057): a target in the free zone changes only how
  // finely we DRAW — the document is left byte-identical. Everything else keeps
  // today's behaviour: lossless ×2/÷2 when the ratio allows, else quantize the
  // hits onto the new grid, with a no-op target returning the same model so
  // `useGridModel` skips the write.
  //
  // The verdict comes from `stepSlotState` — the SAME call that renders the
  // button — so a target cannot be drawn as a view change and then written, or
  // shown as a write and then silently absorbed. One authority, asked twice.
  const scaleToSlots = React.useCallback(
    (target: number): void => {
      if (!model) return
      if (stepSlotState(model, target, canDrawView) === 'view') {
        const scale = freeZoneScale(documentSteps(model), target)
        if (scale !== null) setViewScale(scale)
        return
      }
      mutate((prev) => quantizeStepGridTo(prev, target))
    },
    [model, canDrawView, mutate],
  )

  // The "Slots" control now lives in the Pattern inspector (#601) — lift this
  // grid's resolution state to it instead of rendering it in the grid header.
  useLiftResolution(
    model?.steps ?? null,
    (t) => (model ? stepSlotState(model, t, canDrawView) : 'disabled'),
    scaleToSlots,
    onResolution,
    // #1061 — what the press would COST, asked of the very op `scaleToSlots` runs, so
    // the sentence in the tooltip and the write the user gets are the same computation.
    // A free-zone target never reaches the op, and reports nothing, which is correct:
    // looking closer costs nothing.
    (t) =>
      model && stepSlotState(model, t, canDrawView) !== 'view'
        ? stepResolutionEffect(model, t)
        : { lengthened: 0, snapped: 0, merged: 0 },
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
      // a plain click on an ON cell with NO drag → toggle it OFF (click-toggle:
      // click empty turns a step on, click it again turns it off). A vertical/
      // horizontal drag already ran as velocity / paint-off and left mode !=
      // 'pending'.
      if (g.mode === 'pending') paintCell(g.lane, g.step, false)
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
    if (current) {
      // an ON cell starts PENDING: a vertical drag becomes velocity, a horizontal
      // drag paint-off, and a release with no drag toggles it OFF (onUp). Direct
      // edit — no selection.
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
      // empty cell → paint on immediately, then keep painting on enter
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
    }
  }

  // Grab a note's trailing handle → set its length. Anchored at the note's own start
  // column, so the column the pointer reaches IS the new length and the drag never
  // accumulates: every pointermove re-applies an ABSOLUTE duration to the same note.
  const onResizeDown = (laneIndex: number, startCol: number): void => {
    beginGesture()
    gestureRef.current = {
      lane: laneIndex,
      step: startCol,
      startX: 0,
      startY: 0,
      startGain: 1,
      mode: 'resize',
      paintValue: false,
    }
  }

  const onCellEnter = (laneIndex: number, stepIndex: number): void => {
    const g = gestureRef.current
    if (!g) return
    if (g.mode === 'resize') {
      // The LANE the pointer wanders into is ignored, exactly as the roll ignores the
      // row: a resize is a horizontal gesture and a few px of vertical drift should not
      // silently retarget it. `resizeCell` floors at one column and `clampLane` caps at
      // the room the note has, so a drag back past the note's own start, or forward past
      // the next hit, lands on the shortest/longest length rather than doing nothing.
      mutate((prev) => resizeCell(prev, g.lane, g.step, stepIndex - g.step + 1))
      return
    }
    if (g.mode !== 'paint') return
    paintCell(laneIndex, stepIndex, g.paintValue)
  }

  if (!model) {
    return React.createElement(VisualEditStandby, {
      panel: SEQUENCER_TAB_ID,
      hint: chunk && opensStepGrid(chunk)
        ? "This pattern isn't grid-editable — edit it as code."
        : SEQ_HINT,
      icon: 'symbol-array',
    })
  }

  const barSize = model.bars ? model.steps / model.bars : 0

  return (
    <div
      data-bottom-panel-tab="sequencer"
      // always-visible (non-overlay) scrollbar when the grid overflows the panel,
      // styled in globals.css (the editor ships no CSS) — #pattern-scrollbar.
      data-pattern-scroll
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {/* Track identity (#589) — the bound track's colour dot + name; click
              the dot to recolour, double-click the name to rename. */}
          {/* "Slots" moved to the Pattern inspector (#601); the Note Color toggle
              moved to the editor Settings tab (#602). Both are lifted/owned
              elsewhere now — the header just carries the track identity chip. */}
          <PatternTrackChip />
        </div>
        {/* ONE statement for a view that cannot take a new note, rather than a
            grid of dead cells with no reason on them (#1070). The notes that are
            here still edit, delete and take velocity — which is what this view
            was opened for. */}
        {/* THE LANES ARE CHORD SYMBOLS, AND NOTHING ELSE HERE SAYS SO (#1241).
            Every other affordance in this panel reads as a drum machine — that is
            what a step grid has always been — so a musician who wrote a chord
            chart is looking at one and has no way to tell it understood. The
            edits are already correct; a delete on a chord lane removes that
            chord. This is the sentence that was missing, not a new capability. */}
        {isChordChart && (
          <div
            data-seq-chord-chart
            style={{
              fontSize: 11,
              color: 'var(--foreground-muted, #a0a0aa)',
              paddingBottom: 2,
            }}
          >
            Chord chart — each lane is a chord, not a sound.
          </div>
        )}
        {!placesNotes && (
          <div
            data-seq-no-placement
            style={{
              fontSize: 11,
              color: 'var(--foreground-muted, #a0a0aa)',
              paddingBottom: 2,
            }}
          >
            Edits the notes already here — to add one, use the code view.
          </div>
        )}
        {model.lanes.map((lane, laneIndex) => {
          const voice = sampleVoice(lane.sound)
          return (
          <div key={`${lane.sound}:${lane.part ?? 0}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Per-voice label only — the colour dot was removed (#589); the track's
                identity colour lives in the PatternTrackChip up top, so a separate
                drumVoices palette here would read as a second, conflicting colour code. */}
            <span
              data-seq-voice={lane.sound}
              style={{
                width: 72,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontSize: 11,
                color: 'var(--foreground, #e6e6ea)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
              title={lane.sound}
            >
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
              {lane.cells.map((cell, stepIndex) => {
                // A cell is drawn from the note SOUNDING through it, not from the
                // trigger alone (#1056): `cov.extent` is how much of this column
                // the note fills, so a half-column note draws a half-width bar and
                // a two-column note lights both. `on` stays the trigger — it is
                // what the ops, `aria-pressed` and the velocity gesture mean.
                const on = isCellOn(cell)
                const cov = coverage?.[laneIndex]?.[stepIndex]
                /** this column is carried by a note that began earlier in the lane */
                const held = cov !== undefined && cov.start !== stepIndex
                // THE LAST COLUMN THIS NOTE COVERS, read off the same array that draws
                // it rather than recomputed from `start + duration` (#1053). The two
                // would agree only while every model is a `clampLane` fixpoint, and the
                // drawing is the thing the handle must sit on the end of — so it is the
                // drawing that has to be asked. `undefined` past the lane end is not the
                // same note, which is what makes the final column a tail.
                const isTail =
                  cov !== undefined && coverage?.[laneIndex]?.[stepIndex + 1]?.start !== cov.start
                /** the note's own start column, when this cell carries an offerable handle */
                const resizeStart =
                  cov !== undefined && isTail && resizable?.[laneIndex]?.has(cov.start)
                    ? cov.start
                    : null
                // A held column shows the HEAD's velocity, not its own: the grid's
                // gains are per column and a column with no trigger has none, so
                // reading `stepIndex` would make a long note jump to full height
                // halfway through. Same rule the roll's velocity lane already uses.
                const gain = model.gains?.[cov ? cov.start : stepIndex] ?? 1
                const isPlaying = stepIndex === playingStep
                // An empty cell is offered only where the writer will take it.
                // Where it will not, the cell is inert AND says so, instead of
                // swallowing the click the way it did before (#1064/#1070).
                const canPlace = on || (placeable?.[laneIndex]?.[stepIndex] ?? true)
                return (
                  <button
                    key={stepIndex}
                    type="button"
                    aria-pressed={on}
                    // A carried column now LOOKS different and has to READ different:
                    // the fill says "a note is sounding through here" to anyone who can
                    // see it, and without this the accessible name is identical to an
                    // empty cell's. Making the picture richer is what opened the gap.
                    aria-label={
                      held
                        ? `${lane.sound} step ${stepIndex + 1}, held from step ${cov!.start + 1}`
                        : `${lane.sound} step ${stepIndex + 1}`
                    }
                    data-seq-cell={`${laneIndex}:${stepIndex}`}
                    data-gain={on && gainScoped ? gain : undefined}
                    data-playing={isPlaying ? 'true' : undefined}
                    data-seq-cell-inert={canPlace ? undefined : 'true'}
                    aria-disabled={canPlace ? undefined : true}
                    // WHY THIS CELL IS INERT, and the two reasons are not
                    // interchangeable. On the element and alt paths every
                    // remaining refusal is part-relative — a sound sustaining
                    // through the clicked column, which the corpus gate pins at
                    // 31 of 11,633, all on `,`-stacked units. On a leaf grid the
                    // reason is never that: the column simply has no span to
                    // write through.
                    //
                    // ⚠ SO IT CANNOT KEY ON `placesNotes` ANY MORE (#1154). That
                    // used to be the same question as "is this leaf-anchored?";
                    // now 17 leaf units place a note somewhere, and keying the
                    // wording on the view-level answer told ~950 of their refused
                    // cells that a sound was sustaining through them when none
                    // was. The affordance is decided by the op; only the sentence
                    // is decided here, and it reads the path because the path is
                    // what makes the two reasons different.
                    title={
                      canPlace
                        ? undefined
                        : model.leafSource
                          ? 'This pattern edits its existing notes — add steps in the code view.'
                          : 'Adding a step here would change how long another sound plays — the grid has no way to write that.'
                    }
                    onPointerDown={(e) => {
                      e.preventDefault()
                      // RESIZE INTENT IS DECIDED FIRST, and before the placement guard.
                      // The grab zone runs inward from the BAR's trailing edge, which on
                      // a held note is a column the placement gate has already made inert
                      // (a hit cannot be painted under a sustain) — so a `!canPlace`
                      // return above this would leave every note longer than one column
                      // with a handle that is drawn and cannot be pressed.
                      //
                      // Zone geometry mirrors the roll's (#1078): proportional to the BAR
                      // so a short note still gets a zone on the thing it resizes, floored
                      // so a 2px bar stays aimable, and capped against the CELL so it can
                      // never swallow more of the cell than the gestures it shares with.
                      // A grid note always begins AT its column, so the bar's trailing
                      // edge is simply its extent — the roll's `offset` term is 0 here.
                      if (resizeStart !== null) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const barW = clamp01(cov!.extent) * rect.width
                        const zone = Math.min(rect.width * 0.45, Math.max(RESIZE_ZONE_PX, barW * 0.4))
                        if (e.clientX - rect.left >= barW - zone) {
                          onResizeDown(laneIndex, resizeStart)
                          return
                        }
                      }
                      if (!canPlace) return
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
                      cursor: !canPlace ? 'default' : gainScoped && on ? 'ns-resize' : 'pointer',
                    }}
                  >
                    {cov && (
                      // Two orthogonal axes on one bar, which is how a DAW draws a
                      // note: WIDTH is how much of this column the note sounds for
                      // (#1056), HEIGHT is velocity, bottom-anchored and full when
                      // neutral — so a length-1 note at neutral gain is the same
                      // solid square it has always been. The hue is the voice
                      // colour (#471), or a velocity ramp when View ▸ Note Color =
                      // Velocity (#428).
                      //
                      // A carried column is dimmed rather than drawn solid, the
                      // vocabulary the piano roll already ships for the same fact
                      // (`opacity: on && !isHead ? 0.7 : 1`) — one held note reads
                      // as one note, and never as a second trigger.
                      <span
                        data-seq-fill
                        data-seq-sustain={held ? 'true' : undefined}
                        data-seq-extent={cov.extent !== 1 ? cov.extent.toFixed(4) : undefined}
                        style={{
                          position: 'absolute',
                          left: 0,
                          bottom: 0,
                          // `minWidth` is a floor on the PIXEL, not on the datum: a
                          // note whose length rounds to nothing still has to be
                          // visible, or the grid would silently lose a trigger it
                          // can spell.
                          width: `${clamp01(cov.extent) * 100}%`,
                          minWidth: held ? 0 : 2,
                          height: `${clamp01(gainScoped ? gain : 1) * 100}%`,
                          background:
                            colorMode === 'velocity'
                              ? velocityColor(gainScoped ? gain : 1)
                              : voice.color,
                          opacity: held ? 0.7 : 1,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    {resizeStart !== null && (
                      // THE LENGTH HANDLE (#1053) — the axis #1056 made visible, made
                      // settable. Same shape as the roll's, because this is the same
                      // gesture on the other surface and the issue asks the two to agree.
                      //
                      // It sits at the BAR's trailing edge rather than the cell's, so a
                      // note that stops mid-column carries its handle on its own end
                      // instead of floating in the empty background past it. Width is
                      // clamped to the bar for the same reason the roll clamps it: a
                      // handle wider than the note would overhang backwards past the
                      // note's own start. What that costs a very short note — a very
                      // small handle — is paid back by the invisible grab zone above.
                      //
                      // RENDERED ONLY WHERE A DRAG WOULD DO SOMETHING (`resizable`),
                      // which is the panel's standing rule for every affordance it draws
                      // (#1064/#1070): a handle on a note whose every length the writer
                      // declines is a control the user can press to no effect, and this
                      // project ranks that worse than not offering it at all.
                      <span
                        data-seq-resize={`${laneIndex}:${resizeStart}`}
                        aria-label={`resize ${lane.sound} step ${resizeStart + 1}`}
                        onPointerDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onResizeDown(laneIndex, resizeStart)
                        }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          right: `${(1 - clamp01(cov!.extent)) * 100}%`,
                          width: `min(${RESIZE_ZONE_PX}px, ${clamp01(cov!.extent) * 100}%)`,
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
        {/* The drum catalogue is the wrong menu for a chord chart — it would
            offer Kick and Snare as things to add to a progression. Withdrawn
            rather than restocked: a chord picker is a different feature, and
            offering the wrong one is worse than offering none. Every other
            gesture in the grid keeps working. */}
        {!isChordChart && (
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
        )}
      </div>
    </div>
  )
}
