/**
 * _1116-lost-units-edit.spec.ts — PROBE (inert).
 *
 * The 10 grid units that stopped opening between the pinned pre-#1047 copy and the live
 * tree refuse with two gates: `view-unusable` (2) and `no-leaf-anchor` (8). The standing
 * suspicion is that these are DELIBERATE refusals — views that opened but could not
 * honour an edit. That is a claim about the OLD behaviour, so ask the OLD code.
 *
 * The test: open each unit on BASE, clear the first lit cell, serialize with BASE's own
 * writer, and read the result. If clearing one cell rewrites notation the user did not
 * touch — or silently drops a `/n`, `!n` or an operator — then the view was lossy and
 * the live refusal is a REPAIR. If the edit comes back clean and local, the refusal
 * costs real reach and is a regression worth filing.
 *
 * Judged by READING the ten outputs, not by a predicate: a predicate here would be me
 * deciding the answer in advance and then measuring my own decision.
 */
import { describe, it } from 'vitest'
import * as base from './__p4c_base__/parse'
import * as baseSer from './__p4c_base__/serialize'
import { isCellOn } from './__p4c_base__/model'
import type { StepGridModel } from './__p4c_base__/model'

const LOST = [
  '[hh ~]!16',
  '[~ [<[d3,a3,f4]!2 [d3,bb3,g4]!2> ~]]*2',
  'amen:1/4',
  'bassloop2:4/2',
  'breaks:2/2',
  'breaks:5/2',
  'breaks:8/2',
  'lp:6/4',
  'sd:4/2',
  '~ ~ ~ bd(<2 4!2>, 8)',
]

describe('#1116 — what the OLD view did when you edited these', () => {
  it('clears one cell on the base writer and prints what came back', () => {
    for (const mini of LOST) {
      const r = base.parseStepGrid(mini) as { ok: boolean; model?: StepGridModel }
      if (!r.ok || !r.model) {
        console.log(`\n${mini}\n   base did not open it (unexpected)`)
        continue
      }
      const m = r.model
      // find the first lit cell anywhere
      let hit: [number, number] | null = null
      for (let li = 0; li < m.lanes.length && !hit; li++) {
        for (let ci = 0; ci < m.lanes[li].cells.length; ci++) {
          if (isCellOn(m.lanes[li].cells[ci])) {
            hit = [li, ci]
            break
          }
        }
      }
      if (!hit) {
        console.log(`\n${mini}\n   base opened ${m.steps} cols but NO lit cell — nothing to click`)
        continue
      }
      const [li, ci] = hit
      const edited: StepGridModel = {
        ...m,
        lanes: m.lanes.map((l, i) =>
          i === li ? { ...l, cells: l.cells.map((c, j) => (j === ci ? false : c)) } : l,
        ),
      }
      const out = baseSer.serializeStepGrid(edited)
      console.log(`\n${mini}`)
      console.log(`   base view: ${m.steps} cols, ${m.lanes.length} lane(s); cleared lane ${li} col ${ci}`)
      console.log(`   →  ${out === null ? '(writer declined)' : JSON.stringify(out)}`)
    }
  })
})
