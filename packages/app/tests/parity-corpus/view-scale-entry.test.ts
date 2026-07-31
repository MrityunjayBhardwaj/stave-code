/**
 * view-scale-entry.test.ts — the view resolution asked through the PUBLIC ENTRIES (#1116).
 *
 * ── WHY THIS GATE EXISTS, AND WHY THE EXISTING ONES COULD NOT CATCH IT ────────
 * #1055 shipped `ViewScale` into `projectStepGridDerived` / `projectPianoRollDerived`
 * and proved it live by calling those projections directly. That is a correct test of
 * the projections — and it never exercises `parseStepGrid` / `parsePianoRoll`, which
 * try the syntactic CORE first and return it whenever it succeeds. 783 of the 958
 * corpus units that open a grid are core-parsed, and 412 of the 544 that open a roll,
 * including `bd ~ sn ~`, the case the resolution work is named after. So a seam proved
 * live through its own module was unreachable through the entry every caller uses.
 *
 * The lesson generalises past this fix: a gate must enter where callers enter. This
 * file therefore only ever calls `parseStepGrid(mini, k)` / `parsePianoRoll(mini, k)`.
 *
 * ── THE FOUR PROPERTIES ───────────────────────────────────────────────────────
 *   INERT       an explicit `UNREFINED` is indistinguishable from omitting the argument.
 *   LIVE        a scale reaches real units and multiplies the drawn columns by exactly k.
 *   FAITHFUL    a refine is pure MAGNIFICATION — same lanes/notes, every onset at
 *               exactly k× its old column and nothing else moved.
 *   SAME WRITER a refine comes back in the same source shape, because the shape is
 *               WHICH WRITER owns the user's bytes.
 *
 * LIVE alone is satisfied by a projection that draws k× the columns and puts the notes
 * anywhere. FAITHFUL says the view still shows the same music. SAME WRITER is the one
 * added after the fact, and it is the one that caught the deepest defect — see below.
 *
 * ── THE TWO DEFECTS THIS FILE'S OWN FIRST VERSION SHIPPED WITH ────────────────
 * Both were in the SAME direction — a correct model discarded, or the right model
 * produced by the wrong path — and neither is visible in a diff:
 *
 *  1. THE SELF-REPORT IS AN OBLIGATION. The entry decides "was this actually refined?"
 *     by reading `model.viewScale`. Only the CORE paths had been taught to set it, so
 *     the element projection — which multiplies `perBar` by the scale and draws
 *     correctly — was refused for saying nothing. 96 of the first version's 198
 *     "honest refusals" were faithful k× models thrown away. Whoever multiplies by the
 *     scale must also record it.
 *
 *  2. ROUTING MUST NOT DEPEND ON THE VIEW. Ownership was decided by asking each layer
 *     AT THE SCALE, which conflates "I do not own this pattern" with "I own it but
 *     cannot draw it finer yet" — both arrive as `ok: false`. So a scale refusal fell
 *     through to the next writer: 20 grid and 17 roll units changed writer on a zoom,
 *     and 36 of the 37 were faithful magnifications that would have shipped in
 *     silence. Ownership is now asked at `UNREFINED`, at both levels of the chain.
 *
 * ── THE REFUSALS ARE ASSERTED, NOT TOLERATED ──────────────────────────────────
 * Several projections legitimately do not carry a scale: the leaf path anchors each
 * note to its own source span and has no span to subdivide (#1058, and [[PV261]] —
 * it offers no resolution op at all today, so nothing goes dark), while the
 * whole-cycle `<…>` bar expansion and `gridFromAltElements`/`rollFromAltElements`
 * have not been taught it. Those units REFUSE rather than answer a refine request
 * with the document's own layout. The counts are pinned here so that a path silently
 * starting to lie shows up as a number rather than as a passing suite.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseStepGrid,
  parseStepGridCore,
  parsePianoRoll,
  parsePianoRollCore,
} from '../../../editor/src/visualEdit/notation/parse'
import { documentSteps } from '../../../editor/src/visualEdit/notation/viewResolution'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
import type { StepGridModel, PianoRollModel } from '../../../editor/src/visualEdit/notation/model'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'),
)
const minis = [...new Set(corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== ''))]

/** WHICH WRITER owns the bytes — the leaf splicer, the alt writer, or the span writer */
function writerShape(m: {
  leafSource?: unknown
  altSource?: unknown
  source?: unknown
  bars?: number
}): string {
  const kind = m.leafSource ? 'leaf' : m.altSource ? 'alt' : m.source ? 'span' : 'none'
  return `${kind}/bars=${m.bars ?? 1}`
}

/** the ON column indices per lane — the grid's music, independent of column count */
function gridOnsets(m: StepGridModel): Map<string, number[]> {
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

/** null = a faithful k× magnification; else the first way it is not */
function gridMoved(base: StepGridModel, got: StepGridModel, k: number): string | null {
  const b = gridOnsets(base)
  const g = gridOnsets(got)
  if (g.size !== b.size) return `lane count ${g.size} !== ${b.size}`
  for (const [lane, cols] of b) {
    const x = g.get(lane)
    if (!x) return `lane ${lane} missing`
    if (x.length !== cols.length) return `lane ${lane} onsets ${x.length} !== ${cols.length}`
    if (x.some((c, i) => c !== cols[i] * k)) return `lane ${lane} moved`
  }
  return null
}

/** the roll's music is pitch + start + DURATION, and all three scale together */
function rollMoved(base: PianoRollModel, got: PianoRollModel, k: number): string | null {
  if (got.notes.length !== base.notes.length) {
    return `note count ${got.notes.length} !== ${base.notes.length}`
  }
  const key = (n: { pitch: string; start: number; duration: number }, f: number) =>
    `${n.pitch}@${n.start * f}+${n.duration * f}`
  const b = base.notes.map((n) => key(n, k)).sort()
  const g = got.notes.map((n) => key(n, 1)).sort()
  for (let i = 0; i < b.length; i++) if (b[i] !== g[i]) return `note ${g[i]} !== ${b[i]}`
  return null
}

type Model = { steps: number; viewScale?: number; bars?: number }
type Parse<M> = (m: string, k?: number) => { ok: true; model: M } | { ok: false; reason: string }

/**
 * One sweep, run for each surface. Returns the honoured/refused counts per scale plus
 * every named violation, so a failure says WHICH pattern rather than only how many.
 */
function sweep<M extends Model>(
  parse: Parse<M>,
  moved: (base: M, got: M, k: number) => string | null,
) {
  const honoured = new Map<number, number>()
  const refused = new Map<number, number>()
  const violations: string[] = []
  const name = (m: string) => JSON.stringify(m.length > 48 ? m.slice(0, 48) + '…' : m)

  for (const mini of minis) {
    const base = parse(mini)
    if (!base.ok) continue
    for (const k of [2, 4]) {
      const r = parse(mini, k)
      if (!r.ok) {
        refused.set(k, (refused.get(k) ?? 0) + 1)
        continue
      }
      honoured.set(k, (honoured.get(k) ?? 0) + 1)
      // LIVE — exactly k× the drawn columns, and the document's own width recoverable
      if (r.model.steps !== base.model.steps * k) {
        violations.push(`${name(mini)} @k=${k}: steps ${r.model.steps} !== ${base.model.steps}*${k}`)
        continue
      }
      if (documentSteps(r.model) !== base.model.steps) {
        violations.push(`${name(mini)} @k=${k}: documentSteps ${documentSteps(r.model)}`)
        continue
      }
      // SAME WRITER — a zoom must not hand the document to a different writer
      const was = writerShape(base.model)
      const is = writerShape(r.model)
      if (was !== is) {
        violations.push(`${name(mini)} @k=${k}: writer ${was} → ${is}`)
        continue
      }
      // FAITHFUL — pure magnification
      const why = moved(base.model, r.model, k)
      if (why) violations.push(`${name(mini)} @k=${k}: ${why}`)
    }
  }
  return { honoured, refused, violations }
}

describe('#1116 the view scale, through the public entries', () => {
  it('is INERT at the document resolution, and the populations are asserted not described', () => {
    const grids = minis.filter((m) => parseStepGrid(m).ok)
    const rolls = minis.filter((m) => parsePianoRoll(m).ok)

    // The denominators are pinned, so a gate cannot quietly go green over less material.
    expect(grids.length).toBe(958)
    expect(rolls.length).toBe(544)
    // …and the split that motivates this file: the core answers for most of them.
    expect(grids.filter((m) => parseStepGridCore(m).ok).length).toBe(783)
    expect(rolls.filter((m) => parsePianoRollCore(m).ok).length).toBe(412)

    expect(
      grids.filter((m) => JSON.stringify(parseStepGrid(m, 1)) !== JSON.stringify(parseStepGrid(m))),
    ).toEqual([])
    expect(
      rolls.filter(
        (m) => JSON.stringify(parsePianoRoll(m, 1)) !== JSON.stringify(parsePianoRoll(m)),
      ),
    ).toEqual([])
  })

  it('grid: LIVE, FAITHFUL and SAME-WRITER wherever honoured; REFUSES everywhere else', () => {
    const { honoured, refused, violations } = sweep(parseStepGrid, gridMoved)
    expect(violations).toEqual([])
    expect(honoured.get(2)).toBe(836)
    expect(honoured.get(4)).toBe(836)
    expect(refused.get(2)).toBe(122)
    expect(refused.get(4)).toBe(122)
  })

  it('roll: LIVE, FAITHFUL and SAME-WRITER wherever honoured; REFUSES everywhere else', () => {
    const { honoured, refused, violations } = sweep(parsePianoRoll, rollMoved)
    expect(violations).toEqual([])
    expect(honoured.get(2)).toBe(451)
    expect(refused.get(2)).toBe(93)
    // one long pattern crosses the VIEW ceiling at ×4 and not at ×2 — the ceiling
    // doing exactly its job, so the two scales are pinned separately rather than
    // averaged into one number that would hide it
    expect(honoured.get(4)).toBe(450)
    expect(refused.get(4)).toBe(94)
  })

  it('magnifies the case the resolution work is named after, on both surfaces', () => {
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

    expect(parsePianoRollCore('c3 ~ e3 ~').ok).toBe(true)
    for (const [k, cols] of [
      [1, 4],
      [2, 8],
      [4, 16],
      [8, 32],
    ]) {
      const r = parsePianoRoll('c3 ~ e3 ~', k)
      expect(r.ok).toBe(true)
      const m = (r as { model: PianoRollModel }).model
      expect(m.steps).toBe(cols)
      // a roll note's LENGTH is measured in columns, so it magnifies with them
      expect(m.notes.map((n) => [n.start, n.duration])).toEqual([
        [0, cols / 4],
        [cols / 2, cols / 4],
      ])
    }
  })
})
