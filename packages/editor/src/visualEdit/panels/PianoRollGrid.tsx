/**
 * Piano Roll — note grid (#383).
 *
 * Parses the mini-notation of the `note(...)` / `n(...)` statement under the
 * cursor into a `PianoRollModel` and renders pitch rows × step columns.
 * Clicking an empty cell places a note (one step, overlaps resolved by
 * `placeNote`); clicking a filled cell removes that note. Each edit
 * re-serializes and writes back over the mini range (`'roll'`); a serialization
 * the subset can't express is dropped (the document stays untouched) — the
 * conservatism rule, leaned on hard here because pitch + duration + rests are
 * the most parser-edgey case.
 *
 * v1 is click-to-place / click-to-remove. Drag-to-move and drag-to-resize
 * (and live-playhead column highlight) are follow-ups.
 */
import * as React from 'react'

import { parsePianoRoll } from '../notation/parse'
import { serializePianoRoll } from '../notation/serialize'
import type { PianoRollModel } from '../notation/model'
import { pitchToMidi, midiToPitch, isBlackKey } from '../notation/pitch'
import type { ChunkInfo } from '../chunkDetect'
import { VisualEditStandby } from './VisualEditStandby'
import { PIANO_ROLL_TAB_ID, VISUAL_EDIT_TABS } from './tabs'
import { useGridModel } from './useGridModel'
import { placeNote } from '../notation/place'

const ROLL_HINT =
  VISUAL_EDIT_TABS.find((t) => t.id === PIANO_ROLL_TAB_ID)?.hint ??
  'Click a melody to edit its notes.'

/** the roll edits pitched (note/n) patterns; sounds go to the Sequencer */
function isRollChunk(chunk: ChunkInfo): boolean {
  return chunk.miniString !== null && (chunk.headFn === 'note' || chunk.headFn === 'n')
}

const DEFAULT_LO = 48 // c3
const DEFAULT_HI = 72 // c5
const MIN_SPAN = 12

/** the inclusive midi range of rows to display, padded around the notes */
function pitchRange(model: PianoRollModel): { lo: number; hi: number } {
  const midis = model.notes
    .map((n) => pitchToMidi(n.pitch))
    .filter((m): m is number => m !== null)
  if (midis.length === 0) return { lo: DEFAULT_LO, hi: DEFAULT_HI }
  let lo = Math.min(...midis) - 2
  let hi = Math.max(...midis) + 2
  if (hi - lo < MIN_SPAN) hi = lo + MIN_SPAN
  return { lo, hi }
}

export function PianoRollGrid(): React.ReactElement {
  const { chunk, model, mutate } = useGridModel<PianoRollModel>({
    source: 'roll',
    eligible: isRollChunk,
    parse: parsePianoRoll,
    serialize: serializePianoRoll,
  })

  const toggleNote = React.useCallback(
    (midi: number, step: number): void => {
      mutate((prev) => {
        const pitch = midiToPitch(midi)
        const covering = prev.notes.find(
          (n) => pitchToMidi(n.pitch) === midi && n.start <= step && step < n.start + n.duration,
        )
        if (covering) {
          return { ...prev, notes: prev.notes.filter((n) => n !== covering) }
        }
        return placeNote(prev, pitch, step, 1)
      })
    },
    [mutate],
  )

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

  const { lo, hi } = pitchRange(model)
  const rows: number[] = []
  for (let m = hi; m >= lo; m--) rows.push(m) // high pitch on top

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
                  const note = model.notes.find(
                    (n) =>
                      pitchToMidi(n.pitch) === midi &&
                      n.start <= step &&
                      step < n.start + n.duration,
                  )
                  const on = note !== undefined
                  const isHead = on && note!.start === step
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${midiToPitch(midi)} step ${step + 1}`}
                      data-roll-cell={`${midi}:${step}`}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        toggleNote(midi, step)
                      }}
                      style={{
                        width: 18,
                        height: 16,
                        padding: 0,
                        border: '1px solid var(--border, #3a3a42)',
                        borderRadius: 2,
                        background: on
                          ? 'var(--accent, #6ea8fe)'
                          : black
                            ? 'var(--background, #1c1c20)'
                            : 'var(--background-elevated, #26262c)',
                        // a small notch marks where a held note starts
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
