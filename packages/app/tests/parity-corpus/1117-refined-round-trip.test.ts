/**
 * 1117-refined-round-trip.test.ts — what a refined view owes the document when a
 * write comes back through it.
 *
 * #1117 admits two more model families to a refined view, so their writes now reach
 * `collapse*ToDocument` — the ÷k guard that asks "can what I am about to write be
 * said at the document's own resolution?". This gate holds the three properties that
 * question has, and it keeps them APART, because they fail for different reasons and
 * only one of them is currently clean:
 *
 *   CONTENT   the model that comes back plays what the document plays.
 *             MUST be exact. A failure here is music silently changed by how closely
 *             someone was looking — the worst outcome this seam can produce.
 *
 *   ARITHMETIC the model that comes back has the document's own column count.
 *             MUST be exact.
 *
 *   SPELLING  the bytes that come back are the document's own bytes.
 *             NOT clean today, and not because of #1117: the collapse reuses the
 *             resolution op, which legitimately re-emits a flat grid, so a document
 *             with internal structure comes back flattened. Filed as #1121 and
 *             measured on BOTH arms — the shipped element-writer family scores
 *             identically with these four projections taught the scale and without,
 *             so the counts below are a pre-existing property being recorded, not a
 *             cost of this change.
 *
 * ⚠ THE SPELLING NUMBERS ARE PINNED AS LITERALS ON PURPOSE. They are the size of a
 * known defect, so they must move the day #1121 is fixed and force a reader here.
 * Asserting "no worse than before" instead would let the defect grow quietly, and
 * asserting cleanliness would be a claim no family can meet today.
 *
 * Shapes are named by the SOURCE STRUCTURE the model carries, not by the function
 * that produced it — `alt-whole` covers both the syntactic whole-cycle alternation
 * and the bar projection, which build the same shape and so write through the same
 * splicer. Naming it after one producer would be a claim the data cannot support.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStepGrid, parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import {
  collapseStepGridToDocument,
  collapsePianoRollToDocument,
} from '../../../editor/src/visualEdit/notation/resolution'
import {
  serializeStepGrid,
  serializePianoRoll,
} from '../../../editor/src/visualEdit/notation/serialize'
import { documentSteps } from '../../../editor/src/visualEdit/notation/viewResolution'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
import type {
  StepGridModel,
  PianoRollModel,
} from '../../../editor/src/visualEdit/notation/model'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'),
)
const minis = [...new Set(corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== ''))]

/** the refine every unit in the corpus can be asked for */
const K = 2

function shapeOf(m: {
  altSource?: unknown
  leafSource?: unknown
  source?: { prefix?: string }
}): string {
  if (m.leafSource) return 'leaf'
  if (m.altSource) return 'alt-element'
  if (m.source?.prefix?.trimStart().startsWith('<')) return 'alt-whole'
  if (m.source) return 'element'
  return 'bare'
}

/** what a grid model PLAYS: every lane's on-columns with their lengths */
function gridContentKey(m: StepGridModel): string {
  return m.lanes
    .map((l) => {
      // Length is part of what a cell PLAYS, so it belongs in the content key — a
      // round trip that kept every onset but changed a note's LENGTH would otherwise
      // pass, and note length is exactly the quantity the refine guard discriminates on.
      const hits = l.cells
        .map((c, i) => (isCellOn(c) ? `${i}:${c.duration}` : null))
        .filter(Boolean)
      return `${l.sound}#${l.part ?? 0}=${hits.join(',')}`
    })
    .sort()
    .join('|')
}

/** what a roll model PLAYS */
function rollContentKey(m: PianoRollModel): string {
  return m.notes
    .map((n) => `${n.pitch}@${n.start}+${n.duration}`)
    .sort()
    .join('|')
}

interface Tally {
  refined: number
  contentChanged: string[]
  wrongSteps: string[]
  nullCollapse: number
  respelled: number
}
const blank = (): Tally => ({
  refined: 0,
  contentChanged: [],
  wrongSteps: [],
  nullCollapse: 0,
  respelled: 0,
})

function sweep<M extends { steps: number; viewScale?: number }>(
  parse: (mini: string, k?: number) => { ok: true; model: M } | { ok: false },
  collapse: (m: M) => M | null,
  serialize: (m: M) => string,
  contentKey: (m: M) => string,
): Map<string, Tally> {
  const byShape = new Map<string, Tally>()
  for (const mini of minis) {
    const base = parse(mini)
    if (!base.ok) continue
    const refined = parse(mini, K)
    if (!refined.ok) continue
    const shape = shapeOf(refined.model)
    const t = byShape.get(shape) ?? blank()
    byShape.set(shape, t)
    t.refined++

    const back = collapse(refined.model)
    if (back === null) {
      t.nullCollapse++
      continue
    }
    // ARITHMETIC — the collapse must land on the document's own column count
    if (back.steps !== documentSteps(refined.model)) t.wrongSteps.push(mini)
    // CONTENT — and must still play exactly what the document plays
    if (contentKey(back) !== contentKey(base.model)) t.contentChanged.push(mini)
    // SPELLING — may differ today (#1121); counted, never tolerated silently
    if (serialize(back) !== serialize(base.model)) t.respelled++
  }
  return byShape
}

function pinned(byShape: Map<string, Tally>, pins: Record<string, [number, number, number]>) {
  // ⚠ THE PIN TABLE MUST COVER WHAT WAS OBSERVED, not the other way round. A table
  // keyed by shapes that no longer appear would assert nothing at all and still pass
  // — the loop below would simply never compare anything. Checking the shape SETS
  // against each other is what makes every assertion under it reachable.
  expect(new Set(Object.keys(pins)), 'the pinned shapes and the observed shapes must agree').toEqual(
    new Set(byShape.keys()),
  )
  for (const [shape, [refined, respelled, nulls]] of Object.entries(pins)) {
    const t = byShape.get(shape)!
    expect(t.refined, `${shape}: units drawing a ×${K} view`).toBe(refined)
    expect(t.respelled, `${shape}: units re-spelled by the round trip (#1121)`).toBe(respelled)
    expect(t.nullCollapse, `${shape}: writes that spell the finer grid instead`).toBe(nulls)
  }
}

describe('#1117 — coming back from a refined view', () => {
  it('grid: content and column count survive; spelling is pinned to #1121', () => {
    const byShape = sweep<StepGridModel>(
      parseStepGrid as never,
      collapseStepGridToDocument,
      serializeStepGrid,
      gridContentKey,
    )
    for (const [shape, t] of [...byShape].sort()) {
      console.log(
        `GRID ${shape.padEnd(12)} refined=${String(t.refined).padStart(4)} ` +
          `null=${t.nullCollapse} re-spelled=${t.respelled} ` +
          `content-changed=${t.contentChanged.length} wrong-steps=${t.wrongSteps.length}`,
      )
      expect(t.contentChanged, `${shape}: the round trip changed what plays`).toEqual([])
      expect(t.wrongSteps, `${shape}: the round trip landed on the wrong width`).toEqual([])
    }
    pinned(byShape, GRID_PINS)
  })

  it('roll: content and column count survive; spelling is pinned to #1121', () => {
    const byShape = sweep<PianoRollModel>(
      parsePianoRoll as never,
      collapsePianoRollToDocument,
      serializePianoRoll,
      rollContentKey,
    )
    for (const [shape, t] of [...byShape].sort()) {
      console.log(
        `ROLL ${shape.padEnd(12)} refined=${String(t.refined).padStart(4)} ` +
          `null=${t.nullCollapse} re-spelled=${t.respelled} ` +
          `content-changed=${t.contentChanged.length} wrong-steps=${t.wrongSteps.length}`,
      )
      expect(t.contentChanged, `${shape}: the round trip changed what plays`).toEqual([])
      expect(t.wrongSteps, `${shape}: the round trip landed on the wrong width`).toEqual([])
    }
    pinned(byShape, ROLL_PINS)
  })
})

/* ── pinned populations, re-measured on THIS tree (never inherited) ──────────
 *
 * shape → [units drawing a ×2 view, of those re-spelled by the round trip (#1121),
 *          of those whose collapse declines so the write spells the finer grid]
 *
 * `leaf` is absent by construction: a leaf-anchored model anchors each note to its own
 * source span and so refuses a refine outright, which means it never reaches this
 * sweep. Its absence is asserted by the shape-set equality above, not assumed.
 *
 * The `element` rows are the control: they are the family this change does not touch,
 * and they measured identically on `c12b8d0d` with these projections taught the scale
 * and without. They are pinned here so that if a future change to the collapse moves
 * them, it cannot be mistaken for a cost of the alternation work.
 */
const GRID_PINS: Record<string, [number, number, number]> = {
  'alt-element': [57, 57, 0],
  'alt-whole': [76, 47, 0],
  element: [736, 258, 0],
}
const ROLL_PINS: Record<string, [number, number, number]> = {
  'alt-element': [52, 52, 0],
  'alt-whole': [93, 50, 2],
  element: [345, 161, 2],
}
