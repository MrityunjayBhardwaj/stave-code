/**
 * #1064 / #1070 — PROVE BEFORE OFFER, AT THE GESTURE.
 *
 * `op-admissibility.test.ts` (#1010 P4c) asserts this for every op and every
 * control-state function. It never covered the CELL — the interaction the panel
 * exists for — so a click on a cell whose result the writer cannot spell wrote
 * nothing, toggled nothing and said nothing. This is that gate, for placement.
 *
 * POPULATION (stated, per this boundary's standing rule that every gate names
 * its population, its comparison axes and its sampling depth):
 *   - every mini in `mini-corpus.json` that opens a step grid or a piano roll;
 *   - split by WRITE PATH — `leafSource` / `altSource` / `source` — because the
 *     same gesture on the same model has a different answer per path, and
 *     nothing in the model surfaces which one it is (#1070);
 *   - grid: every EMPTY cell of every lane. Roll: every (pitch, step) over the
 *     model's own content range, which is the range the panel displays.
 *   - the axis is PLACEMENT only (OFF→ON). Deletes, resizes and velocity are
 *     different ops with their own write paths and are not gated here.
 *
 * THE COMPARISON IS AGAINST AN INDEPENDENT ARM, not against itself. `canToggleCell`
 * is *derived* from `toggleCell`, so asking whether they agree is a tautology and
 * would read green forever ([[P370]] — a gate that cannot fail). The arm below
 * rebuilds the UNGATED toggle — the pre-#1064 shape — and asks the real writer
 * about its output. That is a deliberate second oracle used as a control, which
 * is the one use [[PV192]] permits: it exists to be compared against, never to
 * decide anything.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePianoRoll, parseStepGrid } from '../../../editor/src/visualEdit/notation/parse'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
import { midiToPitch, pitchToMidi } from '../../../editor/src/visualEdit/notation/pitch'
import { ungatedPlace, ungatedToggle } from './ungatedOps'
import {
  canPlaceNote,
  canToggleCell,
  placeNote,
  toggleCell,
  viewPlacesNotes,
} from '../../../editor/src/visualEdit/notation/place'
import {
  serializePianoRoll,
  serializeStepGrid,
} from '../../../editor/src/visualEdit/notation/serialize'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'))
const minis: string[] = corpus.minis.map((o: { mini: string }) => o.mini)

type Path = 'leaf' | 'alt' | 'element'
const pathOf = (m: { leafSource?: unknown; altSource?: unknown }): Path =>
  m.leafSource ? 'leaf' : m.altSource ? 'alt' : 'element'

// THE CONTROL ARM — the ops as they stood before #1064: build the model and hand
// it to the writer, no admissibility question asked. Moved to `ungatedOps.ts` when
// the #1058 probe needed the same arm (#1073); the justification for keeping a
// second oracle at all lives with the definitions.

interface Tally {
  units: number
  asks: number
  refused: number
}
const zero = (): Tally => ({ units: 0, asks: 0, refused: 0 })

describe('#1064/#1070 — a placement is offered exactly when the writer will take it', () => {
  /**
   * WHICH 31, not just how many. Pinning the count alone lets the same number arrive
   * from a different cause and read as "unchanged".
   *
   * Its own `it()` deliberately: an assertion placed after a failing one never runs,
   * so folding this into the sweep above would make it evidence for nothing on
   * exactly the breaks that matter — which is what happened when it was first written
   * that way, and was only visible by reading which arms had actually executed.
   *
   * The multi-part clause carries its own denominator, so it cannot quietly become a
   * statement about an empty set.
   */
  it('the residual is 31 refusals over 9 minis, every one of them multi-part', () => {
    const refusingMinis = new Set<string>()
    let refused = 0
    let onMultiPart = 0
    let multiPartUnits = 0

    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok || pathOf(r.model) !== 'element') continue
      const parts = new Set(r.model.lanes.map((l) => l.part ?? 0)).size
      if (parts > 1) multiPartUnits++
      for (let lane = 0; lane < r.model.lanes.length; lane++)
        for (let col = 0; col < r.model.steps; col++) {
          if (isCellOn(r.model.lanes[lane].cells[col])) continue
          if (canToggleCell(r.model, lane, col, true)) continue
          refused++
          refusingMinis.add(mini)
          if (parts > 1) onMultiPart++
        }
    }

    expect(
      { refused, onMultiPart, distinctMinis: refusingMinis.size, multiPartUnits },
      'the part-relative causes `partColumns` owns — and 64 multi-part units exist to refuse, so this is not a claim about an empty set',
    ).toEqual({ refused: 31, onMultiPart: 31, distinctMinis: 9, multiPartUnits: 64 })
  })

  it('grid: the offer matches the writer on every cell, split by write path', () => {
    const by: Record<Path, Tally> = { leaf: zero(), alt: zero(), element: zero() }
    let disagreements = 0
    const examples: string[] = []
    let leafOffered = 0
    let leafUnitsOffering = 0
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok) continue
      const p = pathOf(r.model)
      by[p].units++
      let offeredHere = 0
      for (let lane = 0; lane < r.model.lanes.length; lane++) {
        for (let col = 0; col < r.model.steps; col++) {
          if (isCellOn(r.model.lanes[lane].cells[col])) continue // placement only
          by[p].asks++
          const offered = canToggleCell(r.model, lane, col, true)
          // the independent arm: would the real writer have taken it?
          const writable = serializeStepGrid(ungatedToggle(r.model, lane, col, true)) !== null
          if (offered !== writable) {
            disagreements++
            if (examples.length < 8)
              examples.push(`${JSON.stringify(mini)} [${lane},${col}] offered=${offered} writable=${writable}`)
          }
          if (!offered) by[p].refused++
          if (offered) offeredHere++
          if (p === 'leaf' && offered) leafOffered++
        }
      }
      if (p === 'leaf' && offeredHere > 0) leafUnitsOffering++
    }

    // THE CLAIM: the offer equals what the writer will take, whatever that is.
    // It held in phase 1 when the answer was "refuse 1,748 of these", and it
    // holds now that the clamp has made all but 31 of them writable — which is
    // the point of deriving the offer from the op rather than pinning it.
    expect(examples.join('\n')).toBe('')
    expect(disagreements, 'the offer must equal what the writer will accept').toBe(0)

    // THE PHASE-2 MOVEMENT, against the phase-1 figures this file used to pin.
    // Asks are IDENTICAL on all three paths — an ask is an empty cell, and the
    // clamp does not create or destroy one — so the refusal column is the whole
    // delta and no denominator moved underneath it.
    //
    //   element   1,748 → 31    (15.0% → 0.27% refused)
    //   alt         512 → 0
    //   leaf      3,584 → 3,584 (unchanged by the clamp — and then moved by
    //                            #1154, see below)
    //
    // ⚠ THE LEAF FIGURE MOVED IN PHASE 3, AND THE SENTENCE THAT USED TO EXPLAIN
    // IT WAS FALSIFIED RATHER THAN OUTDATED. It read "byte surgery has no span
    // to create, so #1070 is untouched by this". A rest is real bytes with a
    // real span; it produced no hap, so nothing indexed it, and that — not the
    // nature of byte surgery — is why a leaf column took nothing. #1154 indexes
    // rests beside the anchors, so a column holding a `~` now has a span to
    // write through, and 248 of the 3,584 are placements the writer takes:
    // 3,584 → 3,336 refused, across 17 of the 82 leaf units.
    //
    // The scope this was approved under — "only the `~` WE just wrote, undoing
    // the user's own delete" — turned out not to exist. The model is re-read
    // from the document after every write, so nothing marks a rest as one this
    // writer produced, and there is no line of code that could tell the two
    // apart. The wide version is what the code can express and it is the one
    // that shipped: a rest's bytes swapped for a note is the most basic grid
    // edit there is, and every other write path already does it.
    //
    // ⚠ THE 31 ARE THE PREDICTED RESIDUAL, not a leftover. #1064 measured its
    // own population before any fix existed: of 1,748 declines, 1,717 (98.2%)
    // were "another lane sustaining through the clicked column" and "the
    // remaining 31 are other causes". The clamp removed exactly the 1,717 it
    // names and left exactly the 31 it does not.
    //
    // WHAT THEY ARE, classified rather than assumed, and now ASSERTED below rather
    // than only described: all 31 sit on MULTI-PART (`,`-stacked) units, over 9
    // distinct minis. So they are not this clamp's mechanism reappearing at the
    // edges; they are the part-relative causes `partColumns` owns, where a part
    // carries its own coarser resolution or a region (`sd(2,4,1)`, `[- cp]*2`)
    // cannot be re-emitted with an onset added.
    //
    // ⚠ THE "AND NOT ONE IS FRACTIONAL" CLAUSE WAS DROPPED, because it reported on
    // an empty set. Re-measured on this tree: the element path holds ZERO units with
    // a fractional cell length, so no refusal could have been fractional and the
    // clause was true without being evidence. (The detector was checked against
    // #1069's own example, `[bd _ _ _, ~ ~ hh ~]`, which does read fractional —
    // `bd@0.5 sd hh cp` is the WRONG control, since the reader raises the resolution
    // and hands back integral lengths.) Fractional lengths are #1069's subject and
    // they live on other paths.
    //
    // ⚠ UNITS DIFFER BY 8 ON THE ELEMENT PATH, and the CAUSE stated here was wrong
    // until it was measured: it is not "parseable models vs models that open a
    // placeable view". `mini-corpus.json` holds 1535 entries and 1527 distinct
    // minis, and this sweep maps them RAW while the committed sweep dedupes — the 8
    // are duplicate entries counted twice. They contribute zero asks (each is a grid
    // with no empty cell), which is why every ask-level figure is comparable either
    // way, and which is also what made the wrong attribution survive: the true
    // consequence was correct while the reason was not.
    expect(
      { asks: by.element.asks, refused: by.element.refused },
      'element path — 1,748 → 31 refused, the causes #1064 did not name',
    ).toEqual({ asks: 11633, refused: 31 })
    expect(
      { asks: by.leaf.asks, refused: by.leaf.refused },
      'leaf path — 93.1% refused; the 248 taken are the columns holding a rest (#1154)',
    ).toEqual({ asks: 3584, refused: 3336 })
    expect(
      { asks: by.alt.asks, refused: by.alt.refused },
      'alt path — 512 → 0 refused',
    ).toEqual({ asks: 3427, refused: 0 })
    expect(
      { leaf: by.leaf.units, alt: by.alt.units, element: by.element.units },
      'parseable units per path',
    ).toEqual({ leaf: 82, alt: 57, element: 827 })

    // The residual's SHAPE is asserted in its own test below, not here — an assertion
    // that sits after a failing one never runs, so bundling it into this body would
    // make it evidence for nothing on exactly the breaks that matter.

    // WHICH LEAF PLACEMENTS, not just how many — the same rule the residual
    // above follows. 248 cells is a number that could arrive from anywhere; that
    // they cluster on 17 of the 82 leaf units is the shape that says they are
    // rest columns and not a leak spread thinly across the path.
    //
    // ⚠ THIS ASSERTION USED TO READ `leafOffered === 0`, WITH "a leaf-anchored
    // grid takes no new note at all" on it. That was #1070's invariant and it is
    // now false — see the phase-3 note above. It is re-pinned rather than deleted
    // because the number is exactly what would move if the rest index ever
    // widened past what it was measured to reach.
    expect(
      { leafOffered, leafUnitsOffering },
      'leaf placements the writer takes, and how many units they sit on (#1154)',
    ).toEqual({ leafOffered: 248, leafUnitsOffering: 17 })
  })

  /**
   * The roll's op-level half. ⚠ The roll PANEL asks only the view-level
   * question — the per-cell map costs p99 21.7ms per model change there (vs the
   * grid's 2.1ms, since a roll spans rows × steps) to make 0.9% of cells
   * legible, and `mutate` fires on every frame of a move drag. That is an
   * affordance decision; this gate is about the OP, which is what keeps a
   * refused click from writing, and it holds on every cell regardless.
   */
  it('roll: the op refuses exactly what the writer refuses, split by write path', () => {
    const by: Record<Path, Tally> = { leaf: zero(), alt: zero(), element: zero() }
    let disagreements = 0
    const examples: string[] = []
    let leafOffered = 0

    for (const mini of minis) {
      const r = parsePianoRoll(mini)
      if (!r.ok) continue
      const p = pathOf(r.model)
      by[p].units++
      // the pitches the panel shows: the model's own content, which is what
      // `contentRange` seeds the sticky range from.
      const pitches = [...new Set(r.model.notes.map((n) => n.pitch))]
      for (const pitch of pitches) {
        for (let step = 0; step < r.model.steps; step++) {
          if (r.model.notes.some((n) => n.pitch === pitch && n.start === step)) continue
          by[p].asks++
          const offered = canPlaceNote(r.model, pitch, step, 1)
          const writable = serializePianoRoll(ungatedPlace(r.model, pitch, step, 1)) !== null
          if (offered !== writable) {
            disagreements++
            if (examples.length < 8)
              examples.push(`${JSON.stringify(mini)} [${pitch},${step}] offered=${offered} writable=${writable}`)
          }
          if (!offered) by[p].refused++
          if (p === 'leaf' && offered) leafOffered++
        }
      }
    }

    expect(examples.join('\n')).toBe('')
    expect(disagreements, 'the offer must equal what the writer will accept').toBe(0)
    expect(leafOffered, 'a leaf-anchored roll takes no new note at all').toBe(0)
    // Sampling depth stated rather than assumed: the sweep must actually reach
    // all three paths, or a zero above is an instrument verdict, not a code one.
    expect(by.leaf.units, 'leaf rolls reached').toBeGreaterThan(0)
    expect(by.element.units, 'element rolls reached').toBeGreaterThan(0)
    expect(by.element.asks, 'element roll placements reached').toBeGreaterThan(1000)
  })

  /**
   * ONE RULE, BOTH SURFACES (#1064 phase 2) — a new onset ends every note that
   * was sounding through its column, and the two grids resolve it over the same
   * scope.
   *
   * The roll has always done this: `placeNote` trims every note crossing the
   * click with NO pitch filter, so placing a note has always shortened whatever
   * else was sounding — including a different pitch, audibly, on the 42.7% of
   * routed units whose length the engine honours. The grid clamped only the lane
   * that was clicked, which is narrower than the notation it has to emit, and
   * that mismatch is #1064. They now agree, and this is the gate that keeps them
   * agreeing rather than a sentence in a commit message.
   *
   * ASSERTED AS A PROPERTY OF THE RESULT, not by comparing the two functions:
   * after any ACCEPTED placement, nothing sustains across the new onset. That
   * holds for both ops without either one knowing about the other, which is what
   * makes it a shared rule instead of a shared implementation.
   *
   * ⚠ ONE EXCEPTION, AND IT IS THE ROLL'S ALONE — found by this gate firing, not
   * predicted: `placeNote` returns early when a group already starts at the
   * clicked column (the note joins the chord and adopts its duration), and that
   * branch trims nothing. Excluding it takes the roll to zero violations, so the
   * chord-join branch is the WHOLE of the exception — measured by removing it and
   * watching the count go to zero, not assumed from reading the code.
   *
   * ⚠ WHAT THIS GATE CANNOT CATCH, stated so nobody reads it as broader than it
   * is: it inspects ACCEPTED placements only, so DELETING the clamp does not turn
   * it red — the placements simply become refusals and are skipped. That
   * regression is caught by the pinned per-path counts above (element would go
   * back to 1,748) and by the offer-vs-writer arm. This one catches a clamp that
   * trims the wrong thing, or not far enough while still being writable, which is
   * the failure the other two cannot see. All three were proven to fire.
   *
   * It is also legitimate rather than a second bug. A sustain across a column
   * that already carries an onset was there BEFORE the placement — the click did
   * not create the overlap — and the roll can express overlap in notation that
   * the grid cannot (parallel comma-lanes, #628), which is exactly why `resizeNote`
   * lets a roll note sustain under a later onset. The grid has no such spelling,
   * so its arm below carries no exception at all. Same rule, different notation
   * underneath it; the asymmetry is in the representation, and it is stated here
   * rather than smoothed over by weakening the grid's arm to match.
   */
  it('both surfaces: an accepted placement leaves nothing sustaining across it', () => {
    let gridChecks = 0
    let rollChecks = 0
    let joinedAChord = 0
    const violations: string[] = []

    for (const mini of minis) {
      const g = parseStepGrid(mini)
      if (g.ok && !g.model.leafSource) {
        const m = g.model
        for (let lane = 0; lane < m.lanes.length; lane++)
          for (let col = 0; col < m.steps; col++) {
            if (isCellOn(m.lanes[lane].cells[col])) continue
            const next = toggleCell(m, lane, col, true)
            if (next === m) continue // refused — the writer's call, not this rule's
            gridChecks++
            const part = m.lanes[lane].part ?? 0
            for (const ln of next.lanes) {
              if ((ln.part ?? 0) !== part) continue
              for (let c = 0; c < col; c++) {
                const cell = ln.cells[c]
                if (isCellOn(cell) && c + cell.duration > col + 1e-6 && violations.length < 8)
                  violations.push(`grid ${JSON.stringify(mini)} lane=${lane} col=${col} sustain@${c}`)
              }
            }
          }
      }

      const r = parsePianoRoll(mini)
      if (r.ok && !r.model.leafSource) {
        const m = r.model
        const pitches = [...new Set(m.notes.map((n) => n.pitch))]
        for (const pitch of pitches)
          for (let step = 0; step < m.steps; step++) {
            if (m.notes.some((n) => n.pitch === pitch && n.start === step)) continue
            const next = placeNote(m, pitch, step, 1)
            if (next === m) continue
            if (m.notes.some((n) => n.start === step)) { joinedAChord++; continue }
            rollChecks++
            for (const n of next.notes)
              if (n.start < step && n.start + n.duration > step + 1e-6 && violations.length < 8)
                violations.push(`roll ${JSON.stringify(mini)} pitch=${pitch} step=${step} sustain@${n.start}`)
          }
      }
    }

    expect(violations.join('\n')).toBe('')
    // Sampling depth stated: a zero above is only a code verdict if both arms
    // actually ran ([[P364]] — a uniformly-empty arm is an instrument verdict).
    expect(gridChecks, 'accepted grid placements checked').toBeGreaterThan(10000)
    expect(rollChecks, 'accepted roll placements checked').toBeGreaterThan(10000)
    // The exception is COUNTED, not merely skipped — a `continue` with no number
    // on it is how a population restriction goes unnamed ([[P345]]).
    expect(joinedAChord, 'roll placements that joined an existing chord').toBeGreaterThan(0)
  })

  /**
   * THE CONTROL ARM'S OWN GUARD (#1073). The arms above are only a comparison if
   * `ungatedToggle` still builds what `toggleCell` builds — it is a hand-kept copy
   * of the production op minus its spellability wrapper, and nothing made the two
   * move together. If the production construction changed and the copy did not,
   * "would the writer have taken it?" would quietly start answering about a model
   * the op never produces, and every assertion here would keep passing while
   * measuring nothing.
   *
   * The invariant is exact and derivable: wherever `toggleCell` does NOT refuse,
   * it returns precisely what the ungated copy built. So compare the two directly
   * on every accepted placement, rather than trusting them to be edited in step.
   * Now that a second sweep depends on the copy (#1058's hypothesis arm), the
   * copy is load-bearing in two places and worth pinning in one.
   */
  it('the ungated control arm still builds what the production op builds', () => {
    let compared = 0
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok) continue
      for (let lane = 0; lane < r.model.lanes.length; lane++)
        for (let col = 0; col < r.model.steps; col++) {
          if (isCellOn(r.model.lanes[lane].cells[col])) continue
          const gated = toggleCell(r.model, lane, col, true)
          if (gated === r.model) continue // refused — the wrapper's answer, not the build
          compared++
          expect(
            gated,
            `${JSON.stringify(mini)} [${lane},${col}]: the control arm has drifted from the op`,
          ).toEqual(ungatedToggle(r.model, lane, col, true))
        }
    }
    // the population must be non-empty, or the comparison above reports on nothing
    expect(compared, 'accepted placements compared').toBeGreaterThan(1000)  })

  /**
   * ⚠ THIS TEST NO LONGER ASKS A PATH QUESTION, and the rename is the finding.
   *
   * It used to assert `viewPlacesNotes(model) === !model.leafSource` — a view-level
   * predicate PREDICTING the op, justified by "byte surgery has no span to create,
   * so a leaf view accepts nothing, by construction". #1154 gave rest columns a span
   * and the construction argument became false, at which point the prediction was
   * withholding the affordance on 248 cells the writer would have taken.
   *
   * So the claim is now the one that was always the point of asking at the view:
   * THE VIEW-LEVEL ANSWER AGREES WITH EVERY CELL ON THAT VIEW. That is what entitles
   * the panel to state it once instead of greying a surface with no reason on any of
   * it — and unlike the path rule, it cannot be falsified by the op's reach moving,
   * because it is derived from the op.
   *
   * ⚠ NOT A TAUTOLOGY, though it restates the function's own rule ([[P370]]). The
   * function EARLY-EXITS on the first acceptance and enumerates its own asks; this
   * arm counts every cell independently, so a wrong ask set or a wrong exit shows up
   * as a disagreement. Proven by breaking it: restoring `model.leafSource == null`
   * turns this red on the first leaf grid that takes a note.
   */
  it('viewPlacesNotes agrees with every cell of the view it describes', () => {
    let leafViews = 0
    let leafViewsPlacing = 0
    let nonLeafWithAnAsk = 0
    let nonLeafWithSomeOffer = 0
    let viewsWithNoAsk = 0
    const disagreements: string[] = []
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok) continue
      const places = viewPlacesNotes(r.model)
      let asks = 0
      let offers = 0
      for (let lane = 0; lane < r.model.lanes.length; lane++)
        for (let col = 0; col < r.model.steps; col++) {
          if (isCellOn(r.model.lanes[lane].cells[col])) continue
          asks++
          if (canToggleCell(r.model, lane, col, true)) offers++
        }
      // THE CLAIM, stated so it holds for every view on every path: the view says
      // "no" exactly when it was asked something and refused all of it. A view with
      // no empty cell says "yes" — there is nothing to grey and nothing to explain,
      // and that branch is not academic: 418 corpus grids have no empty cell at all,
      // and a naive `some()` would have put the banner on every one of them.
      if (places !== (asks === 0 || offers > 0) && disagreements.length < 8)
        disagreements.push(`${JSON.stringify(mini)} view=${places} asks=${asks} offers=${offers}`)
      if (asks === 0) viewsWithNoAsk++
      if (r.model.leafSource) {
        leafViews++
        if (places) leafViewsPlacing++
      } else {
        if (asks > 0) nonLeafWithAnAsk++
        if (offers > 0) nonLeafWithSomeOffer++
      }
    }
    expect(disagreements.join('\n')).toBe('')
    expect(leafViews, 'leaf grids in the corpus').toBe(82)
    // WHAT THE PATH RULE WOULD HAVE SAID, pinned as the delta rather than described:
    // it answered `false` on all 82. 19 of them now answer `true` — the 17 that take
    // a note on a rest column, plus 2 with no empty cell to ask about.
    expect(leafViewsPlacing, 'leaf grids that take a note somewhere (#1154)').toBe(19)
    // The denominators, so none of the above can quietly become a claim about an
    // empty set — and the positive control for the no-ask branch.
    expect(viewsWithNoAsk, 'grids with no empty cell at all').toBe(418)
    // THE OTHER HALF OF THE CLAIM, and the one that would catch an over-broad
    // gate: suppressing placement on leaf views must not have suppressed it
    // anywhere else. Every non-leaf view that has an empty cell at all still
    // offers at least one — 468 of 468, no exceptions. A gate that quietly
    // greyed a whole surface would show up here as a shortfall.
    expect(nonLeafWithAnAsk, 'non-leaf grids with any empty cell').toBe(468)
    expect(nonLeafWithSomeOffer, 'non-leaf grids that still take a note').toBe(468)
  })

  /**
   * THE ROLL'S HALF, and it exists because the roll's ask space is NOT the surface
   * the panel draws. `contentRange` pads the display around the notes, so a roll
   * whose every content cell is full still shows empty rows and still takes a click
   * on them — which means `viewPlacesNotes` cannot read "no empty content cell" as
   * "nothing to ask". It probes one row the model does not hold for exactly that
   * reason, and this is the arm that says the one row is representative.
   *
   * THE CLAIM: every roll answering "this view places nothing" refuses its WHOLE
   * padded display range, not merely the row that was probed. The range is rebuilt
   * here from `contentRange`'s own rule (±2 semitones, which is the panel's) — a
   * deliberate second oracle used as a control and never to decide anything, the one
   * use [[PV192]] permits.
   */
  it('roll: a view that says it places nothing refuses its whole padded range', () => {
    let saidNo = 0
    let rowsSwept = 0
    const leaks: string[] = []
    for (const mini of minis) {
      const r = parsePianoRoll(mini)
      if (!r.ok || viewPlacesNotes(r.model)) continue
      const m = r.model
      saidNo++
      const midis = [...new Set(m.notes.map((n) => n.pitch))]
        .map(pitchToMidi)
        .filter((x): x is number => x !== null)
      if (midis.length === 0) continue
      for (let midi = Math.min(...midis) - 2; midi <= Math.max(...midis) + 2; midi++) {
        const token = m.numeric ? String(midi) : midiToPitch(midi)
        for (let step = 0; step < m.steps; step++) {
          if (m.notes.some((n) => n.pitch === token && n.start === step)) continue
          rowsSwept++
          if (canPlaceNote(m, token, step, 1) && leaks.length < 8)
            leaks.push(`${JSON.stringify(mini)} [${token},${step}] the view said no and the op said yes`)
        }
      }
    }
    expect(leaks.join('\n')).toBe('')
    // Sampling depth PINNED, not merely bounded below ([[P364]]) — and pinned
    // because the unheld row is exactly what this number counts. Drop it from
    // `viewPlacesNotes` and this goes 57 → 53: the 4 leaf rolls whose content is
    // full stop answering "no" while every row a user can click on them is still
    // refused. Measured by removing it, not predicted — the first draft of this
    // comment claimed 7, on the assumption that the 3 element rolls refusing
    // their whole range needed the unheld row too. They do not; their content
    // cells already refuse, so asking the op at all is what catches them.
    // A `toBeGreaterThan` would have let the 4 vanish quietly.
    expect(saidNo, 'rolls answering "places nothing"').toBe(57)
    expect(rowsSwept, 'padded-range placements swept on them').toBeGreaterThan(1000)
  })
})
