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
 * "An earlier note" means ANY of them, not the one in the lane or pitch that was
 * clicked. The roll has always read it that way (`placeNote` trims across
 * pitches); the grid read it per lane, which is narrower than the notation it has
 * to produce, and that mismatch was #1064. Both now resolve over the scope the
 * WRITER constrains — the `,`-part's column — and both do it unconditionally,
 * without asking whether the shortening is one the listener will hear.
 *
 * This is the ONE definition of each gesture. The panels are callers, and so
 * are the corpus sweeps: a test that models the edit itself is a second oracle
 * for what an edit *is*, and it cannot catch a change in the edit — it quietly
 * keeps testing the old one (#1048).
 */
import { cellOn, clampLane, clampPartAtOnset } from './model'
import type { PianoRollModel, StepCell, StepGridModel } from './model'
import { ifGridSpellable, ifRollSpellable } from './serialize'

/**
 * Does this view accept a NEW note at all?
 *
 * Not a per-cell question and not a prediction of the writer — it reads WHICH
 * writer the parse chose. A leaf-anchored model (#986) is written by byte
 * surgery at each note's own `location_` span, so changing or deleting a note
 * that exists works, and creating one cannot: a new note has no span to operate
 * on, and `serialize*` correctly returns null every time. Measured over the
 * corpus, leaf placements are refused 3,584/3,584 on the grid and
 * 18,386/18,386 on the roll, while deletes on the same units go through
 * (63 written / 19 refused) — so this is a property of the path, not a bug in
 * the writer and not a stale-anchoring artefact (#1070).
 *
 * The per-cell gate below would already refuse each of those placements. This
 * exists so the panel can say it ONCE, as a view-level fact, rather than render
 * 136 units' worth of individually-greyed cells with no reason given.
 *
 * ⚠ Distinct from writer REACH, which asks "can this view write back?" — a
 * question every leaf view answers yes to, and the axis #986 raised (grid
 * 80→131, roll 56→85). Those figures are true and unaffected; acceptance of new
 * content is a different axis that nothing measured until now.
 */
export function viewPlacesNotes(model: { leafSource?: unknown }): boolean {
  return model.leafSource == null
}

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
  // ADMISSIBLE EXACTLY WHEN THE RESULT IS WRITABLE, asked of the real writer
  // ([[PV241]]) — the same rule `resize.ts` and `resolution.ts` already apply to
  // every op they offer. It had reached every op and every control-state
  // function and never reached the CELL, which is the gesture the panel exists
  // for: `SequencerGrid` toggled unconditionally and `useGridModel` returned on
  // the null serialize before updating the model, so a declined click wrote
  // nothing, toggled nothing and said nothing — 1,748 of 11,633 placements
  // (15.0%) on the element path, and 31.3% of the grid's overall (#1064).
  //
  // Returning the INPUT by reference is what the `notation/` op family already
  // means by "could not apply": `mutate` skips the write and every `can<Op>`
  // reduces to `op(model) !== model`, with no second predicate to drift.
  // Putting it HERE rather than in the panel is deliberate — an admissibility
  // rule enumerated caller-by-caller is exactly how the cell was missed.
  const painted = model.lanes.map((lane, i) =>
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
  )
  // ...AND OVER THE SCOPE THE WRITER CONSTRAINS, which is the `,`-part, not the
  // lane the click landed in ([[PV243]]). One token per column per part, a held
  // note's covered columns spelled `_`, and `[_,bd]` unspellable — so a note
  // sustaining in a SIBLING lane blocks the column just as surely as one in this
  // lane, and clamping only here left the writer a model it had to refuse. That
  // was 1,717 of the element path's 1,748 declines, and it stops being a corner
  // under #1052's refinement, where every new column sits under a sustain.
  //
  // Only on placement: erasing a cell removes an onset, which can only give the
  // notes around it more room, never less.
  const lanes = value
    ? clampPartAtOnset(painted, model.lanes[laneIndex]?.part ?? 0, stepIndex)
    : painted
  return ifGridSpellable(model, { ...model, lanes })
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
  // Gated by the real writer, exactly as `toggleCell` is — same rule, the other
  // surface. The roll's own paths are near-clean (element 0.9%, alt 0.0%), so
  // this is cheap here; what it buys is that the roll cannot drift back into
  // offering a gesture the writer refuses, and that `canPlaceNote` is derivable
  // rather than a second predicate. Leaf rolls refuse all 18,386 (#1070).
  const groupAt = model.notes.find((n) => n.start === start)
  if (groupAt) {
    return ifRollSpellable(model, {
      ...model,
      notes: [...model.notes, { pitch, start, duration: groupAt.duration }],
    })
  }
  const nextStart = Math.min(
    ...model.notes.filter((n) => n.start > start).map((n) => n.start),
    model.steps,
  )
  const notes = model.notes.map((n) =>
    n.start < start && n.start + n.duration > start ? { ...n, duration: start - n.start } : n,
  )
  notes.push({ pitch, start, duration: Math.max(1, Math.min(duration, nextStart - start)) })
  return ifRollSpellable(model, { ...model, notes })
}

/**
 * Replace whatever sits at (`pitch`, `start`) with a note of `duration` — the
 * paste gesture (#528), as ONE op rather than a clear composed with a place.
 *
 * The composition is the whole reason this exists. `placeNote` signals "could
 * not apply" by returning its input, and a paste's input is the model with the
 * target note ALREADY removed — so a caller that clears first and places second
 * turns a refusal into a deletion the user never asked for, and writes it,
 * because the cleared model serializes perfectly well. Composing a
 * decline-capable op with one that cannot decline puts the atomicity of the
 * whole gesture on the caller, and it is not the caller's to carry.
 *
 * Refusing returns the ORIGINAL model, so the clear goes back with it.
 */
export function pasteNote(
  model: PianoRollModel,
  pitch: string,
  start: number,
  duration: number,
): PianoRollModel {
  const cleared = {
    ...model,
    notes: model.notes.filter((n) => !(n.start === start && n.pitch === pitch)),
  }
  const placed = placeNote(cleared, pitch, start, duration)
  return placed === cleared ? model : placed
}

/**
 * Is this exact gesture admissible? Derived from the op rather than predicted
 * alongside it, so the two cannot disagree ([[PV241]], [[P369]]).
 *
 * The panel asks these per cell to decide whether to OFFER the gesture. Ask
 * `viewPlacesNotes` first: on a creation-incapable path the honest answer is
 * "this view does not place notes", not a cell-by-cell decline (#1070).
 */
export const canToggleCell = (
  model: StepGridModel,
  laneIndex: number,
  stepIndex: number,
  value: boolean,
): boolean => toggleCell(model, laneIndex, stepIndex, value) !== model

export const canPlaceNote = (
  model: PianoRollModel,
  pitch: string,
  start: number,
  duration: number,
): boolean => placeNote(model, pitch, start, duration) !== model

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
