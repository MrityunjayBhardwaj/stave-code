/**
 * edit-locality.test.ts — an edit must change only what it edits.
 *
 * THE LAW (the design doc's invariant B, "round-trip fidelity"): for any
 * modeled edit on a view, the document diff must be CONFINED TO THE EDITED
 * SPAN. Everything the user wrote elsewhere — their `*2`, their `!3`, their
 * groups, their spacing — is none of the edit's business and must survive it
 * byte-identically.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `round-trip.test.ts`. That file measures
 * the UNEDITED open→write path: `serialize(parse(mini)) === mini`. It is
 * necessary and it is not sufficient — it can be satisfied completely without
 * fixing anything a user can see. An implementation that stores the source text
 * and returns it whenever the model is untouched scores a perfect round-trip
 * and still destroys the line on the first click, because the destruction
 * happens on the EDITED path, which that file never exercises. The two files
 * are the two halves of one property, and this is the half with the bug in it.
 *
 * WHAT AN EDIT ACTUALLY DOES TODAY (observed, `bd hh*2 sd cp`, one cell nudged
 * in the `bd` region — nowhere near the `hh*2`):
 *
 *     bd hh*2 sd cp   ->   bd bd hh hh sd ~ cp ~
 *
 * The `*2` is collateral. `useGridModel.mutate` writes `serialize(model)` over
 * the WHOLE mini range, and the model is a flat boolean grid that never knew
 * the `*2` existed, so every edit rewrites every element.
 *
 * THE ORACLE. The element boundaries come from krill — Strudel's own parser,
 * the same authority `parse.ts` consumes — and never from a second scanner
 * written here. A check is only worth the independence of its reference: a
 * hand-written table of expected outputs would encode the same beliefs as the
 * code it checks, and could not disagree with it.
 *
 * THE PROBE. For each mini the grid opens, flip the LAST column and assert the
 * source PREFIX (everything before the last top-level element) is untouched.
 * The last column belongs to the last element — columns run in time order and
 * so do elements — so every byte before it is, by the law, none of the edit's
 * business.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as krillParse } from '@strudel/mini/krill-parser.js'

// Deep source path, not the `@stave/editor` barrel (same convention as
// round-trip.test.ts:57 — the barrel drags gifenc/CJS into the ESM resolver).
import { parseStepGrid } from '../../../editor/src/visualEdit/notation/parse'
import { serializeStepGrid } from '../../../editor/src/visualEdit/notation/serialize'
import type { StepGridModel } from '../../../editor/src/visualEdit/notation/model'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)

/**
 * Ask krill where the last top-level element starts. Returns null when the
 * probe does not apply: a stack/alternation (not a flat sequence of elements),
 * or a single element (no other element to preserve, so nothing to prove).
 * Offsets are into the QUOTED string krill was handed, so they carry a +1.
 */
function lastElementStart(src: string): number | null {
  let ast: { type_?: string; arguments_?: { alignment?: string }; source_?: unknown }
  try {
    ast = krillParse('"' + src + '"') as never
  } catch {
    return null
  }
  if (ast?.type_ !== 'pattern' || ast.arguments_?.alignment !== 'fastcat') return null
  const els = ast.source_ as { location_?: { start?: { offset?: number } } }[]
  if (!Array.isArray(els) || els.length < 2) return null
  const off = els[els.length - 1]?.location_?.start?.offset
  return typeof off === 'number' ? off - 1 : null
}

/** the Sequencer's own edit: flip one cell (SequencerGrid.tsx `toggleCell`) */
function toggleCell(m: StepGridModel, laneIndex: number, stepIndex: number, value: boolean): StepGridModel {
  return {
    ...m,
    lanes: m.lanes.map((lane, i) =>
      i === laneIndex
        ? { ...lane, cells: lane.cells.map((c, j) => (j === stepIndex ? value : c)) }
        : lane,
    ),
  }
}

interface Violation {
  mini: string
  out: string
  prefix: string
}

/** flip the last column of lane 0 and see what happens to everything else */
function probe(mini: string): Violation | null {
  const src = mini.trim()
  const start = lastElementStart(src)
  if (start === null) return null
  const r = parseStepGrid(src)
  if (!r.ok) return null
  const model = r.model
  const lane = model.lanes[0]
  if (!lane || model.steps < 1) return null
  const last = model.steps - 1
  const edited = toggleCell(model, 0, last, !lane.cells[last])
  let out: string | null
  try {
    out = serializeStepGrid(edited)
  } catch {
    return null
  }
  if (out === null) return null
  const prefix = src.slice(0, start)
  return out.startsWith(prefix) ? null : { mini: src, out, prefix }
}

const rows = corpus.minis
  .map(({ mini }) => probe(mini))
  .filter((v): v is Violation => v !== null)

const applicable = corpus.minis.filter(({ mini }) => {
  const src = mini.trim()
  if (lastElementStart(src) === null) return false
  const r = parseStepGrid(src)
  return r.ok && r.model.lanes.length > 0 && r.model.steps > 0
}).length

describe('edit locality — an edit must not touch what it did not edit', () => {
  /**
   * THE LAW. Not a snapshot: a snapshot of violations would pin the damage as
   * acceptable, and this property has no legitimate residual. Everything before
   * the edited element is the user's, and an edit that rewrites it is a bug on
   * every row.
   */
  it('grid: editing the last column leaves every earlier element byte-identical', () => {
    const report = rows
      .slice(0, 12)
      .map((v) => `  ${JSON.stringify(v.mini)}\n     ->   ${JSON.stringify(v.out)}\n     kept?  ${JSON.stringify(v.prefix)}`)
      .join('\n')
    expect(
      rows.length,
      `${rows.length} of ${applicable} real minis lose notation OUTSIDE the edited element.\n${report}`,
    ).toBe(0)
  })

  /**
   * The design doc's own falsifier, spelled out: "`bd!3 sd` survives an edit
   * byte-identically outside the edited span." Kept as a named case next to the
   * corpus sweep because a sweep tells you HOW MANY and a case tells you WHAT.
   */
  it('grid: `bd!3 sd` keeps its `!3` when the edit lands on the `sd`', () => {
    const r = parseStepGrid('bd!3 sd')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // lane 0 is `bd`; column 3 is the `sd` step — turn `bd` on there
    const edited = toggleCell(r.model, 0, 3, true)
    expect(serializeStepGrid(edited)).toBe('bd!3 [bd,sd]')
  })
})
