/**
 * `toggleCell` — the grid's placement gesture, stated at the layer that owns it.
 *
 * The corpus sweeps already exercise this over every real-world mini, and they
 * are what proves it holds at scale. This file is the other half: the contract in
 * a form you can read, at the module the gesture lives in, so the next change to
 * what a toggle does has somewhere obvious to state itself (#1048).
 */
import { describe, it, expect } from 'vitest'
import { parsePianoRoll, parseStepGrid } from '../parse'
import { serializePianoRoll, serializeStepGrid } from '../serialize'
import { canToggleCell, pasteNote, toggleCell, viewPlacesNotes } from '../place'
import { cellOn, isCellOn } from '../model'
import type { PianoRollModel, StepGridModel } from '../model'

function parse(s: string): StepGridModel {
  const r = parseStepGrid(s)
  if (!r.ok) throw new Error(`parse failed: ${r.reason}`)
  return r.model
}

describe('toggleCell — the one definition of what a cell click does (#1048)', () => {
  it('places a hit lasting exactly the column clicked', () => {
    const m = toggleCell(parse('bd ~ sd ~'), 0, 1, true)
    expect(m.lanes[0].cells[1]).toEqual(cellOn())
    expect(serializeStepGrid(m)).toBe('bd bd sd ~')
  })

  it('clears a hit, leaving the rest of the lane alone', () => {
    const m = toggleCell(parse('bd bd sd ~'), 0, 1, false)
    expect(isCellOn(m.lanes[0].cells[1])).toBe(false)
    expect(serializeStepGrid(m)).toBe('bd ~ sd ~')
  })

  it('does not touch the lanes it was not asked about', () => {
    const before = parse('[bd,hh] ~ sd ~')
    const after = toggleCell(before, 0, 1, true)
    expect(after.lanes[1]).toBe(before.lanes[1])
  })

  /**
   * THE CLAMP, which is the reason this function has one definition rather than
   * three. A hit painted into a column an earlier note was still sounding through
   * takes that note's room, so the earlier note has to end where the new one
   * starts. Without it the model carries a length reaching past the new hit —
   * notation nothing can spell — and the writer declines an edit the user plainly
   * made.
   */
  it('shortens a note the new hit lands inside', () => {
    // `bd _ ~ ~` — one note sounding through columns 0 and 1. Painting at column 1
    // takes the room it was using, so it has to end at column 1 instead.
    const after = toggleCell(parse('bd _ ~ ~'), 0, 1, true)
    expect(after.lanes[0].cells[0]).toEqual(cellOn(1))
    expect(after.lanes[0].cells[1]).toEqual(cellOn(1))
    expect(serializeStepGrid(after)).toBe('bd bd ~ ~')
  })

  it('leaves a note alone when the new hit lands after it ends', () => {
    // the same note, but the hit goes at column 2 — where it was already finished
    const after = toggleCell(parse('bd _ ~ ~'), 0, 2, true)
    expect(after.lanes[0].cells[0]).toEqual(cellOn(2))
    expect(serializeStepGrid(after)).toBe('bd _ bd ~')
  })

  /**
   * PHASE 2 (#1064): the clamp spans the `,`-PART, not the lane that was clicked.
   *
   * The writer emits one token per column per part and spells a held note's
   * covered columns `_`, so `[_,sd]` — a sustain and an onset in the same column —
   * has no spelling at all. A note sustaining in a SIBLING lane therefore blocks
   * the column exactly as one in the clicked lane does, and clamping only the
   * clicked lane handed the writer a model it had to refuse. That was 1,717 of
   * the element path's 1,748 declined placements (98.2%).
   *
   * This SHORTENS A DIFFERENT SOUND'S NOTE. That is the product ruling, taken
   * deliberately and applied uniformly rather than conditioned on whether the
   * shortening is one the listener can hear — plain samples discard length, so a
   * conditional rule would make the same click work or not work depending on the
   * sound under it.
   */
  it('shortens a SIBLING lane’s note the new hit lands inside', () => {
    // `bd _ sd ~` — bd sounds through columns 0 and 1; sd is a second lane of the
    // same part. Painting sd at column 1 takes the room bd was using.
    const before = parse('bd _ sd ~')
    expect(before.lanes[0].cells[0], 'fixture: bd spans two columns').toEqual(cellOn(2))
    const after = toggleCell(before, 1, 1, true)
    expect(after.lanes[0].cells[0], 'bd ends where sd starts').toEqual(cellOn(1))
    expect(after.lanes[1].cells[1]).toEqual(cellOn(1))
    expect(serializeStepGrid(after)).toBe('bd sd sd ~')
  })

  /**
   * ...AND STOPS AT THE PART BOUNDARY, because that is where the writer's
   * constraint stops. Parts are serialized independently — each gets its own
   * sequence — so a sustain in one part and an onset in another at the same column
   * is legal notation needing no resolution. Trimming across it would shorten a
   * note the writer was always going to accept: a silent musical change with no
   * notational need, which is the one thing this op must not do ([[PV238]]).
   */
  it('does NOT shorten a note in a different `,`-part', () => {
    // four parts. `E2` and `E1` each span the whole cycle; placing inside part 2
    // subdivides E2's own part and must leave part 3's E1 at full length.
    const before = parse('A2 A2, A1 A1, E2, E1')
    expect(before.lanes.map((l) => l.part ?? 0), 'fixture: four parts').toEqual([0, 1, 2, 3])
    const after = toggleCell(before, 2, 1, true)
    expect(after.lanes[3].cells[0], 'E1 keeps the whole cycle').toEqual(
      before.lanes[3].cells[0],
    )
    expect(after.lanes[3], 'an untouched part is the same object').toBe(before.lanes[3])
    expect(serializeStepGrid(after)).toBe('A2 A2, A1 A1, E2 E2, E1')
  })

  /**
   * ERASING IS NOT CLAMPED. Removing an onset can only give the notes around it
   * more room, never less, so there is nothing to resolve — and running the clamp
   * on a clear would shorten notes for a gesture that never asked to.
   */
  it('clears a cell without touching any other lane', () => {
    const before = parse('bd _ sd ~')
    const after = toggleCell(before, 1, 2, false)
    expect(after.lanes[0], 'the sustaining lane is untouched by a clear').toBe(before.lanes[0])
    expect(serializeStepGrid(after)).toBe('bd _ ~ ~')
  })

  /**
   * The panel guards this before calling (`paintCell` returns early past the end),
   * and the model keeps `cells.length === steps` — measured across the whole
   * corpus, 0 of 966 parsing models have a lane shorter than its grid. Pinned here
   * because the sweeps used to write past the end directly, which simulated a
   * model no gesture can produce.
   */
  it('cannot grow a lane past its own length', () => {
    const m = parse('bd ~ sd ~')
    const after = toggleCell(m, 0, 99, true)
    expect(after.lanes[0].cells).toHaveLength(m.lanes[0].cells.length)
  })
})

/**
 * PROVE BEFORE OFFER, AT THE CELL (#1064) — an op is admissible exactly when its
 * result is WRITABLE, asked of the real writer. `resize.ts` and `resolution.ts`
 * have applied this since #1010 P4c; the cell, which is the gesture the panel
 * exists for, was the one that never got it. The visible consequence was silence:
 * a click the writer could not spell wrote nothing, toggled nothing, said nothing.
 */
describe('placement admissibility — the op refuses rather than going inert (#1064)', () => {
  it('refuses by returning the INPUT, so `mutate` skips and `can*` is derivable', () => {
    // `<bd - - -> *2` is leaf-anchored: its notes are written by byte surgery at
    // their own spans, so a note at a column no leaf sits under has no spelling.
    const m = parse('<bd - - -> *2')
    expect(m.leafSource, 'fixture must reach the leaf path').toBeTruthy()
    const after = toggleCell(m, 0, 1, true)
    expect(after, 'refusal is the input by reference').toBe(m)
    expect(canToggleCell(m, 0, 1, true)).toBe(false)
  })

  it('leaves the document exactly as written when it refuses', () => {
    const src = '<bd - - -> *2'
    const m = parse(src)
    expect(serializeStepGrid(toggleCell(m, 0, 1, true))).toBe(src)
  })

  it('still offers the placements the writer will take', () => {
    const m = parse('bd ~ sd ~')
    expect(canToggleCell(m, 0, 1, true)).toBe(true)
    expect(toggleCell(m, 0, 1, true)).not.toBe(m)
  })

  /**
   * DELETES ARE NOT GATED BY THIS DECISION. A leaf view exists to edit what is
   * already there, and byte surgery at an existing note's own span is precisely
   * what it can do — so clearing a hit goes through on the same model that
   * refuses a placement. This is the split that showed placement is unsupported
   * BY CONSTRUCTION rather than broken (#1070): 63 deletes written vs 0 places.
   */
  it('a leaf view still clears the notes it holds', () => {
    const m = parse('<bd - - -> *2')
    const laneCell = m.lanes[0].cells.findIndex((c) => isCellOn(c))
    expect(laneCell, 'fixture must have a hit to clear').toBeGreaterThanOrEqual(0)
    expect(canToggleCell(m, 0, laneCell, false)).toBe(true)
  })
})

/**
 * PASTE IS ONE OP, and this is why. Replace-at-target clears the target note and
 * then places — so if the place is refused and the clear is not taken back, the
 * gesture writes a DELETION the user never asked for. It writes it happily,
 * because the cleared model serializes perfectly well; only the placement was
 * unspellable. Found in self-review of #1064: gating `placeNote` turned a paste
 * that used to do nothing into a paste that deleted its own target.
 */
describe('pasteNote — a refused paste takes its own clear back (#528/#1064)', () => {
  // A REAL hazard case, found by sweeping the corpus rather than reasoned up:
  // pasting a 3-step note over the `4` refuses, and the cleared model — missing
  // that `4` — serializes perfectly well. 573 such (note, duration) cases exist
  // across the corpus, on the alt path as well as the leaf one, so this is not
  // a leaf-only corner.
  const SRC = '0 1 2 <4 6 3 [6 7]> <- - - 6> - <- 8> <- - - [2 1]> '
  const PITCH = '4'
  const START = 6
  const DUR = 3

  function roll(s: string): PianoRollModel {
    const r = parsePianoRoll(s)
    if (!r.ok) throw new Error(`parse failed: ${r.reason}`)
    return r.model
  }

  it('returns the ORIGINAL model when the placement is refused', () => {
    const m = roll(SRC)
    expect(pasteNote(m, PITCH, START, DUR)).toBe(m)
  })

  /**
   * The load-bearing assertion — the exact shape the bug had. Clearing first and
   * placing second yields a model that serializes FINE and is missing the target
   * note, so the write goes through and takes the note with it. Asserted on the
   * bytes, because "the model is unchanged" is not the claim; "the user's
   * document is unchanged" is.
   */
  it('the naive clear-then-place would have written a deletion', () => {
    const m = roll(SRC)
    const cleared = {
      ...m,
      notes: m.notes.filter((n) => !(n.start === START && n.pitch === PITCH)),
    }
    const naive = serializePianoRoll(cleared)
    expect(naive, 'the half-applied model is writable — that is the hazard').not.toBeNull()
    expect(naive).toContain('<~ 6 3 [6 7]>') // the `4` is gone
    // and the op does not produce it: the document comes back untouched
    expect(serializePianoRoll(pasteNote(m, PITCH, START, DUR))).toBe(serializePianoRoll(m))
  })

  it('still pastes where the writer takes it', () => {
    const m = roll('c4 e4 ~ g4')
    const out = pasteNote(m, 'e4', 2, 1)
    expect(out).not.toBe(m)
    expect(out.notes.some((n) => n.pitch === 'e4' && n.start === 2)).toBe(true)
  })
})

describe('viewPlacesNotes — the PATH question, asked once per view (#1070)', () => {
  it('is false for a leaf-anchored view and true otherwise', () => {
    expect(viewPlacesNotes(parse('<bd - - -> *2'))).toBe(false)
    expect(viewPlacesNotes(parse('bd ~ sd ~'))).toBe(true)
  })

  /**
   * The whole point of asking it at the view: it must agree with what every
   * cell would say, so the panel can state it once instead of greying each cell
   * with no reason on it.
   */
  it('agrees with every cell on the view it describes', () => {
    const m = parse('<bd - - -> *2')
    expect(viewPlacesNotes(m)).toBe(false)
    for (let col = 0; col < m.steps; col++)
      if (!isCellOn(m.lanes[0].cells[col])) expect(canToggleCell(m, 0, col, true)).toBe(false)
  })
})
