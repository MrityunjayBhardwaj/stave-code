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
import { cellOn, clampLane, clampPartAtOnset, isCellOn, rollContentRange } from './model'
import type { PianoRollModel, StepCell, StepGridModel } from './model'
import { midiToPitch, pitchToMidi } from './pitch'
import { ifGridSpellable, ifRollSpellable, serializeStepGrid } from './serialize'

/**
 * Does this view accept a NEW note ANYWHERE?
 *
 * The panel asks so it can state the refusal ONCE — "this view edits the notes
 * already here" — instead of rendering a surface of individually-greyed cells
 * with no reason on any of them (#1070). So the question it must answer is
 * exactly "is every placement on this surface refused?", and the answer is
 * `true` whenever at least one is taken, or when there is nothing to ask about.
 *
 * ⚠ A VIEW WITH NO EMPTY CELL ANSWERS `true`, deliberately. There is nothing to
 * grey and nothing to explain on a full grid, and answering `false` there would
 * put the banner on hundreds of corpus units that refuse nothing.
 *
 * ⚠ IT ASKS THE OP, and that is the whole of #1154's second consequence. This
 * used to return `model.leafSource == null` — a PATH inference, resting on
 * "byte surgery has no span to create, so a leaf view accepts nothing, by
 * construction". Indexing rests (#1154) gave those columns a span after all, so
 * the construction argument is simply false now: 248 of 3,584 leaf grid cells
 * across 17 of 82 leaf units are placements the writer WILL take, and inferring
 * from the path would withhold an affordance from every one of them. Derived
 * from `toggleCell`/`placeNote` for the same reason `can<Op>` is — a view-level
 * predicate that PREDICTS the op is a second oracle, and it drifts the moment
 * the op's reach moves, which is exactly what happened here ([[PV241]]).
 *
 * The roll's answer has not moved: the roll's leaf writer indexes no rests, so
 * it still refuses every one of them, and this now MEASURES that rather than
 * asserting it. Whatever the reach is, the panel reads it instead of assuming it.
 *
 * ⚠ THE ROLL ASKS ABOUT ONE ROW IT DOES NOT HOLD, and that is not a flourish —
 * without it the answer is wrong on real units. The roll's display is PADDED
 * around the content (`rollContentRange`), so a roll whose every content cell is
 * full still shows empty rows and still takes a click on them. Asking only
 * about content pitches made "the content is full" read as "nothing to ask",
 * which said "this view places notes" on 4 leaf rolls where every row the user
 * can actually click is refused.
 *
 * It is consulted only once every held cell has refused, so it decides nothing
 * on a view that places anything. And it is representative rather than lucky,
 * measured rather than argued: swept over each such view's WHOLE padded range,
 * the answer is uniform — every element roll takes every padded row, every leaf
 * roll takes none. `every view answering no refuses its whole padded range` is
 * pinned in `placement-admissibility.test.ts` so a row that disagrees is a
 * failure rather than a surprise.
 *
 * ⚠ ASKING THE OP ALSO CORRECTS THREE ROLLS IN THE OTHER DIRECTION, and they
 * are the path rule's error, not the unheld row's — measured by removing the
 * row and watching them stay caught. `<~ [~@3.5 d2@2 c#2@2.5]>` and two like it
 * are element-path rolls, so the path rule called them placeable; they refuse
 * all 267 / 84 / 96 placements over their full padded range, and every one of
 * those was being offered.
 *
 * ⚠ Distinct from writer REACH, which asks "can this view write back?" — a
 * question every leaf view answers yes to, and the axis #986 raised (grid
 * 80→131, roll 56→85). Those figures are true and unaffected; acceptance of new
 * content is a different axis.
 *
 * COST, measured over the corpus per view: grid p50 0.002ms / p99 0.55ms /
 * worst 6.7ms, roll p50 0.004ms / p99 1.0ms / worst 5.7ms — against the grid's
 * own per-cell `placeable` map at p99 2.25ms / worst 13.1ms, which the panel
 * already pays. It stops at the first placement taken, so every view that
 * places anything answers in a cell or two and only a surface refusing
 * everything is scanned in full — which is the surface whose answer needs the
 * whole scan. Both panels memoize it on the model, because `mutate` fires on
 * every pointermove of a drag.
 *
 * And the memo is not the only thing standing between the full scan and a
 * per-frame cost, which is worth saying because the memo alone would not be
 * enough — a drag makes a new model every frame. The view that pays the whole
 * scan is one that refuses everything, and on the roll that is a leaf view,
 * which no drag can change: 0 of 54 leaf rolls accept a velocity edit at all,
 * against 395 of 491 elsewhere. The expensive answer and the draggable surface
 * are disjoint populations, measured rather than hoped.
 */
export function viewPlacesNotes(model: StepGridModel | PianoRollModel): boolean {
  let asked = 0
  if ('lanes' in model) {
    for (let lane = 0; lane < model.lanes.length; lane++)
      for (let col = 0; col < model.steps; col++) {
        if (isCellOn(model.lanes[lane].cells[col])) continue
        asked++
        if (canToggleCell(model, lane, col, true)) return true
      }
    return asked === 0
  }
  // The rows the panel shows: the model's own content, plus one it does not hold,
  // because the display is padded around the content and an empty padded row takes a
  // click like any other. Spelled the way the panel spells a row — bare number on a
  // numeric pattern (#469), note name otherwise — so an unspellable token cannot be
  // mistaken for an unwritable placement.
  //
  // ⚠ THE PADDED ROW IS READ FROM THE RULE THAT DRAWS IT, NEVER GUESSED AT (#1163).
  // This used to probe `min − 1` — a row that happens to be padding because
  // `contentRange` pads by two, a constant that lived in `PianoRollGrid.tsx` with
  // nothing between them. Either could have moved alone: drop the padding and this
  // asks about a row nobody can click, widen it and this under-asks, and no arm could
  // fail either way. `rollContentRange` now owns the rule and both read it.
  //
  // ONE row, not the whole padded range, and that is measured rather than conceded:
  // sweeping every drawn row changes the answer on 0 of 544 corpus rolls and costs
  // 7× (p99 0.5 → 5.4ms, worst 2.5 → 18.0ms per view — the neighbourhood of the
  // per-cell map #1070 declined at 21.7ms). Taking the row FROM the range costs
  // nothing at all: identical ask count, identical answers. That the one row is
  // representative of the whole padded range is not assumed either — it is pinned in
  // `placement-admissibility.test.ts`, alongside the arm that fails if this cheap
  // probe and the panel's full surface ever disagree.
  //
  // The guard is not "are there notes?" but "is the range derived from CONTENT?".
  // `rollContentRange` falls back to a default octave when nothing in the model spells a
  // pitch, and a default row is not a padded one — there is no content for it to sit
  // beside, and asking about it would be asking about an arbitrary row.
  const pitches = new Set(model.notes.map((n) => n.pitch))
  if (model.notes.some((n) => pitchToMidi(n.pitch) !== null)) {
    const below = rollContentRange(model).lo
    pitches.add(model.numeric ? String(below) : midiToPitch(below))
  }
  for (const pitch of pitches)
    for (let step = 0; step < model.steps; step++) {
      if (model.notes.some((n) => n.pitch === pitch && n.start === step)) continue
      asked++
      if (canPlaceNote(model, pitch, step, 1)) return true
    }
  return asked === 0
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
 * How many columns a note at (`laneIndex`, `stepIndex`) may occupy, OVER THE SCOPE THE
 * WRITER CONSTRAINS — the `,`-part's column, not the lane the note sits in.
 *
 * This is #1064's rule read in the other direction. Placement resolves a colliding onset
 * by shortening whatever was sounding through it (`clampPartAtOnset`); a length edit asks
 * the same question from the other side — how far can this note reach before it meets
 * one? Both have to use the PART, because the grid writes one token per column per part
 * and a note sustaining in a SIBLING lane blocks the column just as surely as one in this
 * lane: `[_,sn]` is a chord containing a token that means nothing there.
 *
 * FOUND BY THE GATE, not by reading. Capping with `clampLane` alone — the lane's own
 * rule, which is what `laneCoverage` reads to DRAW — let a drag ask for a length that
 * reached under a sibling's onset, and `sustainTokens` then declined the write outright.
 * The user's drag did not cap at the neighbour; it stopped working when it passed one.
 *
 * ⚠ SO THIS DELIBERATELY DIFFERS FROM THE DRAWING'S ROOM RULE, and the asymmetry is
 * sound: `laneCoverage` is per lane because it renders whatever model it is handed, and
 * a model that reaches under a sibling onset is unwritable and therefore never reaches it.
 * The cap is the stricter of the two, so every length this returns is one the panel can
 * also draw.
 */
function partRoom(model: StepGridModel, laneIndex: number, stepIndex: number): number {
  const part = model.lanes[laneIndex]?.part ?? 0
  let next = model.steps
  for (const lane of model.lanes) {
    if ((lane.part ?? 0) !== part) continue
    for (let j = stepIndex + 1; j < lane.cells.length && j < next; j++) {
      if (isCellOn(lane.cells[j])) {
        next = j
        break
      }
    }
  }
  return next - stepIndex
}

/**
 * Set the length of the note at (`laneIndex`, `stepIndex`) to `duration` COLUMNS —
 * `resizeNote`'s half of the pair on the grid, and the gesture #1053 asks for.
 *
 * WHY THE GRID GETS ONE AT ALL. The model has carried a cell's length since #1010 P4b,
 * the printer has preserved it since P4c, and #1056 put it on screen. Length was the one
 * axis the panel could show and could not set, so the only way to shorten a note was to
 * leave the view and edit the code — which is the gap the whole code↔view line exists to
 * close.
 *
 * THE CAP IS `partRoom`, not the lane's own room; see its note for why the two differ and
 * why the drawing legitimately uses the looser one.
 *
 * FLOORS AT ONE COLUMN, exactly as `resizeNote` does, and for a sharper reason here: the
 * grid writes one token per column and a sustain as `_`, so a length below one column has
 * no spelling at this resolution at all (`sustainTokens` declines it). Flooring is not a
 * policy choice about small notes; it is the shortest thing the writer can say.
 *
 * DECLINES BY RETURNING ITS INPUT, so `canResizeCell` is the op rather than a second
 * predicate beside it ([[PV241]]). Three populations decline, and all three are correct:
 *  - a sustain with NO REST IN REACH to write itself into. The writer will absorb the
 *    rests a lengthened note runs over, taking bytes that said "nothing starts here"
 *    (#1146) — but where every column in reach carries a note there is nothing to take,
 *    and `bd*4` cannot grow at all.
 *  - a length that would sustain under ANOTHER sound in the same `,`-part. `partRoom`
 *    caps rather than declines here, so this only bites where the cap cannot help.
 *  - an edit the DOCUMENT would not record — see the byte comparison below.
 *
 * MEASURED OVER THE 966-UNIT GRID CORPUS: 1016 of 4729 notes are offered a handle (552
 * can grow, 464 can only shorten), spread over 240 units. Every one produces writable
 * notation and a document that actually changes — asserted in `op-admissibility.test.ts`,
 * which is also where the 571 dead offers this op used to make are recorded.
 *
 * ⚠ Those figures were 854 / 390 / 178 before #1146, and the gap was entirely the
 * neighbouring-bytes decline: on FLAT grids the handle reached 46 of 732 units and now
 * reaches 105.
 *
 * ⚠⚠ NOW 1273 OF 5251, AND THE RISE IS A DEFECT BEING REMOVED RATHER THAN REACH BEING
 * ADDED (#1235). The identity below is what made that defect invisible: the leaf writer
 * compared TOKENS only, so it answered a resize with the source bytes unchanged, and this
 * function dutifully reported "the document did not move" and withdrew the handle. 270
 * handles were dark that way — every one on a model carrying leaf spans — and nothing
 * anywhere reported a problem, because from here a swallowed write and an inexpressible
 * length are the same observation. The writer refuses the length now and the element
 * writer answers it. (The denominator moved 4729 → 5251 with the corpus, not with this.)
 */
export function resizeCell(
  model: StepGridModel,
  laneIndex: number,
  stepIndex: number,
  duration: number,
): StepGridModel {
  const cell = model.lanes[laneIndex]?.cells[stepIndex]
  if (!isCellOn(cell)) return model
  const capped = Math.max(1, Math.min(duration, partRoom(model, laneIndex, stepIndex)))
  const lanes = model.lanes.map((lane, i) =>
    i === laneIndex
      ? {
          ...lane,
          cells: clampLane(
            lane.cells.map((c, j) => (j === stepIndex ? cellOn(capped) : c)),
            model.steps,
          ),
        }
      : lane,
  )
  // Identity when the clamp lands back on the length that was already there — a drag
  // held past the next hit reaches the same maximum on every pointermove, and without
  // this each frame would be a fresh model and a fresh write of identical bytes.
  //
  // Compared EXACTLY rather than within an epsilon, because the two sides are the
  // integers this gesture deals in: the drag asks for a whole number of columns and
  // `clampLane` caps at a whole number of columns.
  const next = lanes[laneIndex].cells[stepIndex]
  if (isCellOn(next) && next.duration === cell.duration) return model

  const written = serializeStepGrid({ ...model, lanes })
  if (written === null) return model
  // ...AND IDENTITY WHEN THE DOCUMENT DOES NOT MOVE, which is a second and sharper
  // question than whether the length changed ([[PV241]] applied to the write, not the op).
  //
  // Found by fixture rather than reasoned: on `[bd ~ ~ ~, hh ~ hh ~]` a cell's length is
  // HALF a column, so setting it to one column changes the model — and serializes to the
  // very same bytes, because the writer spells this part at its own two-column width and
  // a half-column note has no shorter spelling to lose. `useGridModel` keeps a model whose
  // serialization is unchanged (that is what lets an all-rest lane stage before its first
  // hit), so without this the panel would redraw the note LONGER while the document said
  // nothing had happened — the view and the code disagreeing about the music, which is the
  // one outcome the whole code↔view line exists to prevent.
  //
  // Cheaper than it looks, and it replaces work rather than adding it: `ifGridSpellable`
  // would serialize this model anyway, so the null check above IS that gate, inlined.
  if (written === serializeStepGrid(model)) return model
  return { ...model, lanes }
}

export const canResizeCell = (
  model: StepGridModel,
  laneIndex: number,
  stepIndex: number,
  duration: number,
): boolean => resizeCell(model, laneIndex, stepIndex, duration) !== model

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
