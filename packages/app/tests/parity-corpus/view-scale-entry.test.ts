/**
 * view-scale-entry.test.ts — the view resolution asked through the PUBLIC ENTRY (#1116).
 *
 * ── WHY THIS GATE EXISTS, AND WHY THE EXISTING ONES COULD NOT CATCH IT ────────
 * #1055 shipped `ViewScale` into `projectStepGridDerived` and proved it live by calling
 * that projection directly. That is a correct test of the projection — and it never
 * exercises `parseStepGrid`, which tries `parseStepGridCore` FIRST and returns it
 * whenever it succeeds. 783 of the 958 corpus units that open the grid are core-parsed,
 * including `bd ~ sn ~`, the case the resolution work is named after. So a seam proved
 * live through its own module was unreachable through the entry every caller uses.
 *
 * The lesson generalises past this fix: a gate must enter where callers enter. This one
 * therefore only ever calls `parseStepGrid(mini, k)`.
 *
 * ── THE THREE PROPERTIES, AND WHY THE THIRD IS THE LOAD-BEARING ONE ───────────
 *   INERT     an explicit `UNREFINED` is indistinguishable from omitting the argument.
 *   LIVE      a scale reaches real units and multiplies the drawn columns by exactly k.
 *   FAITHFUL  a refine is pure MAGNIFICATION — same lanes, same notes, every onset
 *             column at exactly k× its old index and nothing else moved.
 *
 * LIVE alone is satisfied by a projection that draws k× the columns and puts the notes
 * anywhere; FAITHFUL is what says the view still shows the same music.
 *
 * ── THE REFUSALS ARE ASSERTED, NOT TOLERATED ──────────────────────────────────
 * Several projections legitimately do not carry a scale: the leaf path anchors each note
 * to its own source span and has no span to subdivide (#1058), and the whole-cycle `<…>`
 * bar expansion plus `gridFromAltElements` have not been taught it. Before the entry gate
 * existed those paths answered a refine request with the DOCUMENT's layout and no error —
 * 202 of 958 units drawing exactly what they drew before, which is the silent wrong
 * layout the parameter exists to prevent. The count of honest refusals is pinned here so
 * that a path silently starting to lie shows up as a number, not as a passing suite.
 *
 * BREAK-TESTED, and reported as measured rather than as expected: removing the
 * `honoursViewScale` check reddens the second test with **394 named entries** — the 202
 * affected units seen at each of the two scales, less those whose lanes happen to be
 * empty. The refusal counts are NOT observed under that break, because the faithfulness
 * assertion fails first and the test stops there; the 198 → 1 movement comes from the
 * separate probe run, not from this file. Said explicitly so the header cannot be read
 * as a claim this gate demonstrated.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStepGrid, parseStepGridCore } from '../../../editor/src/visualEdit/notation/parse'
import { documentSteps } from '../../../editor/src/visualEdit/notation/viewResolution'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
import type { StepGridModel } from '../../../editor/src/visualEdit/notation/model'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'),
)
const minis = [...new Set(corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== ''))]

/** the ON column indices per lane — the musical content, independent of column count */
function onsets(m: StepGridModel): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const lane of m.lanes) {
    const cols: number[] = []
    lane.cells.forEach((c, i) => {
      if (isCellOn(c)) cols.push(i)
    })
    out.set(`${lane.sound}#${lane.part ?? 0}`, cols)
  }
  return out
}

describe('#1116 the view scale, through parseStepGrid', () => {
  it('is INERT at the document resolution, and the population is asserted not described', () => {
    const opened = minis.filter((m) => parseStepGrid(m).ok)
    const coreParsed = opened.filter((m) => parseStepGridCore(m).ok)

    // The denominator is pinned, so a gate cannot quietly go green over less material.
    expect(opened.length).toBe(958)
    // …and the split that motivates this file: the core answers for most of them.
    expect(coreParsed.length).toBe(783)

    const differing = opened.filter(
      (m) => JSON.stringify(parseStepGrid(m, 1)) !== JSON.stringify(parseStepGrid(m)),
    )
    expect(differing).toEqual([])
  })

  it('is LIVE and FAITHFUL wherever it is honoured, and REFUSES everywhere else', () => {
    const refusedAt = new Map<number, number>()
    const honouredAt = new Map<number, number>()
    const unfaithful: string[] = []

    for (const mini of minis) {
      const base = parseStepGrid(mini)
      if (!base.ok) continue
      const baseOn = onsets(base.model)

      for (const k of [2, 4]) {
        const r = parseStepGrid(mini, k)
        if (!r.ok) {
          refusedAt.set(k, (refusedAt.get(k) ?? 0) + 1)
          continue
        }
        honouredAt.set(k, (honouredAt.get(k) ?? 0) + 1)

        // LIVE — exactly k× the drawn columns, and the document's own width recoverable
        if (r.model.steps !== base.model.steps * k) {
          unfaithful.push(`${mini} @k=${k}: steps ${r.model.steps} !== ${base.model.steps}*${k}`)
          continue
        }
        if (documentSteps(r.model) !== base.model.steps) {
          unfaithful.push(`${mini} @k=${k}: documentSteps ${documentSteps(r.model)}`)
          continue
        }
        // FAITHFUL — same lanes, every onset at exactly k× its old column
        const got = onsets(r.model)
        if (got.size !== baseOn.size) {
          unfaithful.push(`${mini} @k=${k}: lane count ${got.size} !== ${baseOn.size}`)
          continue
        }
        for (const [lane, cols] of baseOn) {
          const g = got.get(lane)
          if (!g || g.length !== cols.length || g.some((c, i) => c !== cols[i] * k)) {
            unfaithful.push(`${mini} @k=${k}: lane ${lane} moved`)
            break
          }
        }
      }
    }

    // Named, so a failure says WHICH pattern rather than only how many.
    expect(unfaithful).toEqual([])

    // A refine reaches most of the corpus through the entry the panel uses…
    expect(honouredAt.get(2)).toBe(760)
    expect(honouredAt.get(4)).toBe(760)
    // …and the rest REFUSE rather than draw the document's layout for a refine request.
    expect(refusedAt.get(2)).toBe(198)
    expect(refusedAt.get(4)).toBe(198)
  })

  it('magnifies the case the resolution work is named after', () => {
    // #1052's canonical example, core-parsed — the one a derived-only seam could not reach
    expect(parseStepGridCore('bd ~ sn ~').ok).toBe(true)
    for (const [k, cols] of [
      [1, 4],
      [2, 8],
      [4, 16],
      [8, 32],
    ]) {
      const r = parseStepGrid('bd ~ sn ~', k)
      expect(r.ok).toBe(true)
      expect((r as { model: StepGridModel }).model.steps).toBe(cols)
    }
  })
})
