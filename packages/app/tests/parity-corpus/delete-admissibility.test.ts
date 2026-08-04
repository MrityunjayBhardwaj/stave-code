/**
 * #1160 — THE DELETE A LEAF SURFACE REFUSES, PINNED ON BOTH SURFACES.
 *
 * `placement-admissibility.test.ts` states its axis as "PLACEMENT only (OFF→ON).
 * Deletes, resizes and velocity are different ops with their own write paths and are
 * not gated here." That was accurate and it left the delete ungated, which is how a
 * refusal affecting half of every leaf ask went four issues without a number.
 *
 * WHAT IS PINNED, and why a pin rather than a bound: about half of every delete
 * offered on a leaf surface is refused, and that is CORRECT — one token backing
 * several columns cannot be made to say two things at once, and letting the last
 * writer win would silently blank cells the user never touched. The refusal is not a
 * defect to be driven to zero. It is a stated property of the surface, and what a
 * stated property needs is an arm that notices when it changes SIZE, in either
 * direction. A `toBeLessThan` would let the rate double unnoticed; a `toBeGreaterThan`
 * would let the refusals quietly vanish into a writer that started guessing.
 *
 * POPULATION (per this boundary's rule that a gate names its population, its axes and
 * its depth):
 *   - every mini in `mini-corpus.json` that opens a step grid with a lane, or a piano
 *     roll with a note;
 *   - split by WRITE PATH — `leafSource` / `altSource` / `source` — because the same
 *     gesture has a different answer per path and nothing in the model surfaces which
 *     one is serving it (#1070);
 *   - grid: every SOUNDING cell of every lane, cleared one at a time. Roll: every
 *     note, dropped one at a time. One ask = one delete a user could actually pose.
 *   - the axis is DELETE only. Placement is gated next door; resize and velocity have
 *     their own write paths and are not gated here either.
 *
 * THE COUNT IS NOT ASSERTED ALONE. Pinning 275 lets the same 275 arrive from a
 * different cause and read as unchanged — the failure mode the placement gate names in
 * its own docstring. So each refusal is also checked against an INDEPENDENT arm: the
 * shared-leaf predicate recomputed from `leafSource` directly, never from the writer's
 * answer. If the writer ever refuses for a new reason the count can stay put and this
 * still breaks.
 *
 * ⚠ THE ROLL'S HALF WAS UNMEASURED WHEN #1160 WAS FILED, and its scope line said so.
 * It turns out to carry the same branch at the same rate, so the population is 551
 * asks across the two surfaces rather than the 275 the issue records.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePianoRoll, parseStepGrid } from '../../../editor/src/visualEdit/notation/parse'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
import type { StepGridModel, PianoRollModel } from '../../../editor/src/visualEdit/notation/model'
import {
  serializePianoRoll,
  serializeStepGrid,
} from '../../../editor/src/visualEdit/notation/serialize'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'))
const minis: string[] = [
  ...new Set(
    (corpus.minis as { mini: string }[]).map((o) => o.mini.trim()).filter((m: string) => m !== ''),
  ),
]

type Path = 'leaf' | 'alt' | 'source'
const pathOf = (m: { leafSource?: unknown; altSource?: unknown; source?: unknown }): Path =>
  m.leafSource ? 'leaf' : m.altSource ? 'alt' : 'source'

interface Tally {
  units: number
  asks: number
  refused: number
  /** refusals whose cell/note sits on a leaf backing more than one column — the cause */
  refusedShared: number
  /** accepted deletes on a shared leaf — see the note at the assertion */
  wroteShared: number
  /** of those, the ones a same-(start, pitch) twin survives — the roll's #1164 residue */
  wroteSharedTwin: number
  /** of those, the ones whose document comes back byte-identical to its source */
  wroteSharedNoOp: number
}
const zero = (): Tally => ({
  units: 0,
  asks: 0,
  refused: 0,
  refusedShared: 0,
  wroteShared: 0,
  wroteSharedTwin: 0,
  wroteSharedNoOp: 0,
})
const get = (m: Map<Path, Tally>, p: Path): Tally => {
  const t = m.get(p) ?? zero()
  m.set(p, t)
  return t
}

/**
 * How many DISTINCT columns each leaf span backs — recomputed from the source, never
 * from the writer's answer.
 *
 * Two precisions, both of which a coarser count got wrong and the corpus caught:
 *
 *  - DISTINCT columns, not occurrences. A span appearing twice inside ONE column is not
 *    shared in the sense that matters: clearing that column writes `~` through both
 *    occurrences at once, so there is nothing to disagree about.
 *  - the anchor must be the deleted cell's OWN. `cols[c]` holds every atom sounding at
 *    column `c` ACROSS LANES, so asking "is anything here shared" answers for notes the
 *    user did not touch. A first cut did exactly that and scored 19 grid / 65 roll
 *    accepted deletes as shared-but-taken, which read like a hole in the property and
 *    was a hole in the question.
 */
const fanoutOf = (perColumn: { start: number; end: number }[][]): Map<string, number> => {
  const cols = new Map<string, Set<number>>()
  perColumn.forEach((spans, c) => {
    for (const s of spans) {
      const k = `${s.start}:${s.end}`
      const seen = cols.get(k) ?? new Set<number>()
      seen.add(c)
      cols.set(k, seen)
    }
  })
  return new Map([...cols].map(([k, seen]) => [k, seen.size]))
}

const gridTally = new Map<Path, Tally>()
const rollTally = new Map<Path, Tally>()

for (const mini of minis) {
  let g: StepGridModel | null = null
  try {
    const r = parseStepGrid(mini)
    g = r.ok ? r.model : null
  } catch {
    g = null
  }
  if (g && g.lanes.length > 0) {
    const t = get(gridTally, pathOf(g))
    t.units++
    const ls = g.leafSource
    const fan = ls ? fanoutOf(ls.cols.map((col) => col.map((a) => a.span))) : null
    for (let li = 0; li < g.lanes.length; li++) {
      for (let c = 0; c < g.steps; c++) {
        if (!isCellOn(g.lanes[li].cells[c])) continue
        t.asks++
        const lanes = g.lanes.map((l, i) =>
          i === li ? { ...l, cells: l.cells.map((cell, j) => (j === c ? false : cell)) } : l,
        )
        // the cell's own anchor: `columnAtoms` keys a lane's contribution by `sound`,
        // so that is what pairs this lane's cell with the leaf it was read from
        const shared =
          fan !== null &&
          (ls?.cols[c] ?? [])
            .filter((a) => a.atom === g!.lanes[li].sound)
            .some((a) => (fan.get(`${a.span.start}:${a.span.end}`) ?? 0) > 1)
        if (serializeStepGrid({ ...g, lanes }) === null) {
          t.refused++
          if (shared) t.refusedShared++
        } else if (shared) t.wroteShared++
      }
    }
  }

  let p: PianoRollModel | null = null
  try {
    const r = parsePianoRoll(mini)
    p = r.ok ? r.model : null
  } catch {
    p = null
  }
  if (p && p.notes.length > 0) {
    const t = get(rollTally, pathOf(p))
    t.units++
    const ls = p.leafSource
    // the roll's column key is the note's START — a chord contributes several anchors
    // there, each with its own disjoint leaf, so the buckets are per start
    const byStart = new Map<number, { start: number; end: number }[]>()
    for (const a of ls?.anchors ?? [])
      byStart.set(a.start, [...(byStart.get(a.start) ?? []), a.span])
    const fan = ls ? fanoutOf([...byStart.values()]) : null
    for (let ni = 0; ni < p.notes.length; ni++) {
      t.asks++
      const note = p.notes[ni]
      // the note's own anchor — same start AND same pitch, so a chord member's
      // neighbour is not mistaken for this note's leaf
      const shared =
        fan !== null &&
        (ls?.anchors ?? [])
          .filter((a) => a.start === note.start && a.pitch === note.pitch)
          .some((a) => (fan.get(`${a.span.start}:${a.span.end}`) ?? 0) > 1)
      const dropped = { ...p, notes: p.notes.filter((_, i) => i !== ni) }
      const out = serializePianoRoll(dropped)
      if (out === null) {
        t.refused++
        if (shared) t.refusedShared++
      } else if (shared) {
        t.wroteShared++
        // the residue's CAUSE, carried in the gate rather than left to an inert probe:
        // a surviving same-(start, pitch) twin, and a document that came back unchanged
        if (dropped.notes.some((n) => n.start === note.start && n.pitch === note.pitch))
          t.wroteSharedTwin++
        if (ls && out === ls.src) t.wroteSharedNoOp++
      }
    }
  }
}

describe('#1160 — a leaf surface refuses the delete when one token backs several columns', () => {
  it('GRID: the leaf path refuses 275 of 557 deletes across 82 units', () => {
    const t = gridTally.get('leaf')!
    expect({ units: t.units, asks: t.asks, refused: t.refused }).toEqual({
      units: 82,
      asks: 557,
      refused: 275,
    })
  })

  it('ROLL: the leaf path refuses 276 of 591 deletes across 54 units', () => {
    // The half #1160 was filed without. Same branch, same rate — so the property is
    // about the leaf projection itself, not about either surface's edit vocabulary.
    const t = rollTally.get('leaf')!
    expect({ units: t.units, asks: t.asks, refused: t.refused }).toEqual({
      units: 54,
      asks: 591,
      refused: 276,
    })
  })

  it('every refusal is a SHARED leaf, recomputed from the source rather than the writer', () => {
    // The independent arm. `refusedShared` is derived by counting how many columns each
    // span backs — the writer is not consulted — so a refusal arriving from any other
    // branch shows up here even if the totals above are untouched.
    //
    // Its own `it()` on purpose: an assertion after a failing one never runs, so folding
    // this into the counts would make it evidence for nothing on exactly the breaks that
    // matter.
    const g = gridTally.get('leaf')!
    const r = rollTally.get('leaf')!
    expect({ grid: g.refusedShared, roll: r.refusedShared }).toEqual({ grid: 275, roll: 276 })
  })

  it('GRID: sharing is not merely necessary but SUFFICIENT — an exact iff, no residue', () => {
    // Without this, "every refusal is shared" would still be satisfied by a writer that
    // refused everything. Zero accepted deletes on a shared leaf makes the predicate
    // decide the answer both ways, which is what lets the property be stated in the
    // docs as a rule rather than as a tendency.
    //
    // The POSITIVE CONTROL for this absence is the arm below: the identical measurement
    // on the roll returns 24, so a zero here is a fact about the grid and not a counter
    // that never increments.
    expect(gridTally.get('leaf')!.wroteShared).toBe(0)
  })

  it('ROLL: sharing is necessary but NOT sufficient — 24 accepted, every one a unison (#1164)', () => {
    // The residue is pinned WITH ITS CAUSE, not as a bare count. A count alone lets the
    // same 24 arrive from somewhere else and read as unchanged — the failure this file's
    // header calls out, and it would be a poor joke to commit it here.
    //
    // The cause: two `,`-stacked parts sound the same pitch at one column. `after` is
    // built as a SET, so dropping one of a unison pair leaves the pitch present, nothing
    // enters `gone`, every anchor asserts its own bytes, and the document comes back
    // byte-identical while reporting success. Both consequences are asserted, so fixing
    // #1164 must restate the number rather than let a silent no-op become a silent
    // something.
    const r = rollTally.get('leaf')!
    expect({ accepted: r.wroteShared, twinSurvives: r.wroteSharedTwin, unchanged: r.wroteSharedNoOp })
      .toEqual({ accepted: 24, twinSurvives: 24, unchanged: 24 })
  })

  it('POSITIVE CONTROL — the non-leaf paths take the same gesture', () => {
    // A refusal rate means nothing unless the same sweep, through the same call, can be
    // seen ACCEPTING deletes. Pinned per path rather than summed so that one path going
    // silent cannot be absorbed by another.
    const gs = gridTally.get('source')!
    const ga = gridTally.get('alt')!
    const rs = rollTally.get('source')!
    const ra = rollTally.get('alt')!
    expect({
      gridSource: { asks: gs.asks, refused: gs.refused },
      gridAlt: { asks: ga.asks, refused: ga.refused },
      rollAlt: { asks: ra.asks, refused: ra.refused },
    }).toEqual({
      gridSource: { asks: 3579, refused: 0 },
      gridAlt: { asks: 582, refused: 0 },
      rollAlt: { asks: 736, refused: 0 },
    })
    // The roll's `source` path refuses a little, and it is NOT this issue's branch —
    // these sit outside both leaf splicers. Pinned here so the residue has a number
    // instead of hiding inside a "non-leaf accepts everything" claim that is false.
    expect({ asks: rs.asks, refused: rs.refused }).toEqual({ asks: 3515, refused: 31 })
  })
})
