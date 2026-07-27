/**
 * PLACEMENT — putting a note into a view and taking one out, resolving what
 * that costs the notes already there. One module per concern, both surfaces
 * inside it, as `resize.ts` and `resolution.ts` already are.
 *
 * The roll places a pitched note at a column; the grid flips a cell in a lane.
 * Both must leave a model the writer can spell, and both do it the same way —
 * a new onset takes the room an earlier note was sounding through, so that
 * earlier note ends where the new one starts.
 *
 * This is the ONE definition of each gesture. The panels are callers, and so
 * are the corpus sweeps: a test that models the edit itself is a second oracle
 * for what an edit *is*, and it cannot catch a change in the edit — it quietly
 * keeps testing the old one (#1048).
 */
import { cellOn, clampLane } from './model'
import type { PianoRollModel, StepCell, StepGridModel } from './model'

/**
 * What a painted cell holds. A hit the user places lasts exactly the column they
 * clicked — that is the box they see, and one column is what the notation spells
 * without any grouping.
 *
 * It is NOT matched to whatever length the lane's other notes happen to have: on a
 * grid projected from `[hh ~]!16` every existing note lasts half a column, and
 * quietly giving a new note that length would be the view deciding the music. If
 * painting on such a grid should offer the prevailing length, that is a product
 * question, and it belongs with the per-note length control (#1053).
 */
const paint = (value: boolean): StepCell => (value ? cellOn() : false)

/**
 * Flip one cell of the step grid, returning a new model (stable lane set preserved).
 * This is what a click on a cell does — the panel and every corpus sweep call it.
 */
export function toggleCell(
  model: StepGridModel,
  laneIndex: number,
  stepIndex: number,
  value: boolean,
): StepGridModel {
  return {
    ...model,
    lanes: model.lanes.map((lane, i) =>
      i === laneIndex
        ? {
            ...lane,
            // CLAMPED, because a promise about lengths is a promise about ROOM
            // (#1010 P4b/P4c). Painting a hit into a column an earlier note was
            // still sounding through shortens that note — the room it had is gone.
            // Without this the model keeps a length that reaches past the new hit,
            // which is notation nothing can spell, and the writer rightly declines
            // an edit the user plainly made. The resize and quantize ops already
            // clamp for exactly this reason; paint is the third op that moves
            // onsets closer together, and it was the one still missing it.
            cells: clampLane(
              lane.cells.map((c, j) => (j === stepIndex ? paint(value) : c)),
              model.steps,
            ),
          }
        : lane,
    ),
  }
}

/**
 * Insert a note into a roll, resolving overlaps so the result stays a flat,
 * tileable sequence (what the serializer requires). DAW-style resolution:
 *  - a group already at `start` → the note joins the chord, adopting its
 *    duration (chord members share one);
 *  - an earlier note sustaining across `start` → it trims to end at `start`;
 *  - the next group (or the grid end) caps the new note's duration.
 */

export function placeNote(
  model: PianoRollModel,
  pitch: string,
  start: number,
  duration: number,
): PianoRollModel {
  const groupAt = model.notes.find((n) => n.start === start)
  if (groupAt) {
    return { ...model, notes: [...model.notes, { pitch, start, duration: groupAt.duration }] }
  }
  const nextStart = Math.min(
    ...model.notes.filter((n) => n.start > start).map((n) => n.start),
    model.steps,
  )
  const notes = model.notes.map((n) =>
    n.start < start && n.start + n.duration > start ? { ...n, duration: start - n.start } : n,
  )
  notes.push({ pitch, start, duration: Math.max(1, Math.min(duration, nextStart - start)) })
  return { ...model, notes }
}

/**
 * Resize the single note identified by (`start`, `pitch`) to `duration` steps.
 * The new duration floors at 1 and caps only at the grid end. A note may now
 * sustain UNDER a later onset (overlap is expressible via parallel comma-lanes,
 * #628), so each note resizes independently — stretching one chord member no
 * longer drags the others. The serializer packs any resulting overlap into lanes.
 */
export function resizeNote(
  model: PianoRollModel,
  start: number,
  pitch: string,
  duration: number,
): PianoRollModel {
  // Multi-bar `<...>` can't express overlap or a mixed-duration chord (parallel
  // lanes are single-bar only), so keep the legacy whole-chord resize capped at
  // the next onset there — otherwise the write would serialize to null and drop.
  if ((model.bars ?? 1) > 1) {
    const nextStart = Math.min(
      ...model.notes.filter((n) => n.start > start).map((n) => n.start),
      model.steps,
    )
    const capped = Math.max(1, Math.min(duration, nextStart - start))
    return {
      ...model,
      notes: model.notes.map((n) => (n.start === start ? { ...n, duration: capped } : n)),
    }
  }
  const capped = Math.max(1, Math.min(duration, model.steps - start))
  return {
    ...model,
    notes: model.notes.map((n) =>
      n.start === start && n.pitch === pitch ? { ...n, duration: capped } : n,
    ),
  }
}
