/**
 * 1058-refined-placement.test.ts — placing a hit on a refined grid subdivides the
 * element under it and leaves the rest of the document alone (#1058, Phase 5 of
 * #1052).
 *
 * ── WHY THIS IS A GATE AND NOT A SPIKE ────────────────────────────────────────
 * The spike (`_1058-locality.spec.ts`, cont.159) answered the GO/no-GO question
 * against machinery that did not exist yet: it carried its own `refine()`, a
 * hand-written model rescale, because the reader had no view-scale parameter.
 * #1055 / #1116 / #1117 shipped one, #1057 shipped the write path, and the
 * region splice already spelled a multi-column step as a group — so the phase's
 * behaviour arrived as the composition of its predecessors. What was missing was
 * a gate.
 *
 * ── EVERYTHING HERE IS ASKED, NOT DESCRIBED ───────────────────────────────────
 * Reader `parseStepGrid(mini, k)` · placement `toggleCell` / `placeNote` (the one
 * definition, #1048) · the ÷k guard `collapse*ToDocument` · writer
 * `serializeStepGridWithExtent` · engine `enginePlayedCycle`. Acceptance is
 * `op(m) !== m`, the signal the `notation/` op family defines (#1073) — never a
 * non-null serialize, which reads every refusal as an acceptance.
 *
 * ⚠ LOCALITY IS THE WRITER'S OWN REPORT. The obvious instrument — walk
 * `prefix`/`before`/`raw`/`after`/`suffix` back into absolute offsets and read a
 * byte diff against them — is a SECOND DESCRIPTION of the order `spliceGrid`
 * concatenates in, and it is wrong in a way its own output cannot reveal. When a
 * voided `,`-part holds a single element, rebuilding the part and re-emitting
 * that element produce a diff of the same shape. Measured over 15,200 asks, both
 * instruments side by side: they agree 14,992 times, disagree 208, and every one
 * of the 208 is the walk calling a whole-part rebuild local. Zero errors the
 * other way — the entire error runs toward the verdict nobody re-checks. So the
 * walk is not merely redundant here, it is unsound, and `GridWriteExtent` exists
 * because the writer already decided both facts and threw them away (#1137).
 *
 * ⚠ THOSE TWO-INSTRUMENT FIGURES ARE HISTORICAL — taken when the part-void was
 * unconditional, and kept because they are the ARGUMENT for reporting locality from
 * the writer rather than a description of today's residual. #1137 has since removed
 * most of the population they measured (278 non-local asks → 34). Re-taking them
 * would not re-make the point: the walk's blindness is structural, not a rate.
 *
 * ⚠ WHAT THIS GATE DOES NOT ASSERT, stated rather than left to be assumed:
 * lane-add (works on a fixture, no corpus arm); resize and paste at a refined
 * view; the alternation path's locality — an alt model carries no `source`, so the
 * writer has no regions to report and the question is not defined there; and the
 * ROLL's locality, which is asserted only as accept-and-spell here. The roll has no
 * write-extent report yet, so its arm below is deliberately the weaker one and says
 * so rather than implying the grid's guarantee covers it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parsePianoRoll,
  parseStepGrid,
} from '../../../editor/src/visualEdit/notation/parse'
import {
  serializePianoRoll,
  serializeStepGrid,
  serializeStepGridWithExtent,
} from '../../../editor/src/visualEdit/notation/serialize'
import { placeNote, toggleCell } from '../../../editor/src/visualEdit/notation/place'
import {
  collapsePianoRollToDocument,
  collapseStepGridToDocument,
} from '../../../editor/src/visualEdit/notation/resolution'
import { enginePlayedCycle, HRES, type Note } from './engineEditOracle'

const dir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(dir, 'mini-corpus.json'), 'utf8'),
)
const MINIS = [...new Set(corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== ''))]

/** the multipliers a resolution control would offer first (#1059 will settle the set) */
const SCALES = [2, 4] as const

/* ── the sweep ─────────────────────────────────────────────────────── */

interface GridAsk {
  mini: string
  lane: number
  col: number
  /** the op's own verdict: did it apply? */
  accepted: boolean
  /** null when the op refused or the writer declined */
  out: string | null
  path: 'splice' | 'leaf' | 'alt' | 'rebuild' | 'declined'
  /** total source regions — "one element moved" is only a promise when this is > 1 */
  regions: number | null
  regionsReemitted: number | null
  /** region count of each part the writer rebuilt — its own report, not a guess */
  rebuiltParts: number[] | null
}

interface GridSweep {
  opensAtDocument: number
  admitsFinerView: number
  refusesFinerView: Map<string, number>
  asks: GridAsk[]
}

function sweepGrid(k: number): GridSweep {
  const out: GridSweep = {
    opensAtDocument: 0,
    admitsFinerView: 0,
    refusesFinerView: new Map(),
    asks: [],
  }
  for (const mini of MINIS) {
    const base = parseStepGrid(mini)
    // an identity base is required: without it "the document did not change" has
    // no meaning, because the writer never reproduced it in the first place
    if (!base.ok || serializeStepGrid(base.model) !== mini) continue
    out.opensAtDocument++

    const fine = parseStepGrid(mini, k)
    if (!fine.ok) {
      // `gate` is optional: it is present whenever a PROJECTION ran and declined,
      // and absent where the mini never reified at all. Naming the absence keeps
      // the two apart instead of folding them into one bucket.
      const gate = fine.gate ?? 'no-gate'
      out.refusesFinerView.set(gate, (out.refusesFinerView.get(gate) ?? 0) + 1)
      continue
    }
    out.admitsFinerView++
    const m = fine.model

    // every column the refinement created, in every lane
    for (let lane = 0; lane < m.lanes.length; lane++)
      for (let col = 1; col < m.steps; col += k) {
        const next = toggleCell(m, lane, col, true)
        if (next === m) {
          out.asks.push({
            mini, lane, col, accepted: false, out: null,
            path: 'declined', regions: null, regionsReemitted: null, rebuiltParts: null,
          })
          continue
        }
        // A write only spells the finer resolution when the edit actually used a
        // column the document does not have — asked of the real ÷k guard, the way
        // the panel asks it (#1057).
        const atDocument = collapseStepGridToDocument(next)
        const { mini: written, extent } = serializeStepGridWithExtent(atDocument ?? next)
        out.asks.push({
          mini, lane, col, accepted: true, out: written,
          path: extent.path,
          regions: extent.path === 'splice' ? extent.regions : null,
          regionsReemitted: extent.path === 'splice' ? extent.regionsReemitted : null,
          rebuiltParts: extent.path === 'splice' ? extent.rebuiltParts : null,
        })
      }
  }
  return out
}

const SWEPT = new Map<number, GridSweep>(SCALES.map((k) => [k, sweepGrid(k)]))

/** which write path answered, per ask */
const pathCounts = (s: GridSweep): Record<string, number> =>
  Object.fromEntries(
    [...new Set(s.asks.map((a) => a.path))].map((p) => [p, s.asks.filter((a) => a.path === p).length]),
  )

/* ── the engine comparison ─────────────────────────────────────────── */

const key = (n: Note): string => `${Math.round(n.pos * HRES)}|${Math.round(n.dur * HRES)}|${n.atom}`

function diffNotes(want: Note[], got: Note[]): { added: Note[]; removed: Note[] } {
  const counts = new Map<string, number>()
  for (const n of want) counts.set(key(n), (counts.get(key(n)) ?? 0) + 1)
  const added: Note[] = []
  for (const n of got) {
    const kk = key(n)
    const c = counts.get(kk) ?? 0
    if (c > 0) counts.set(kk, c - 1)
    else added.push(n)
  }
  const removed: Note[] = []
  for (const n of want) {
    const kk = key(n)
    const c = counts.get(kk) ?? 0
    if (c > 0) { counts.set(kk, c - 1); removed.push(n) }
  }
  return { added, removed }
}

/* ── the gates ─────────────────────────────────────────────────────── */

describe('#1058 — a hit placed on a refined grid subdivides one element', () => {
  it('CALIBRATION — the population is what the corpus holds, at every scale', () => {
    for (const k of SCALES) {
      const s = SWEPT.get(k)!
      expect(s.opensAtDocument, `k=${k} opens`).toBe(958)
      expect(s.admitsFinerView, `k=${k} admits`).toBe(876)
      // ONE refusal gate, and it is the leaf path saying so by name: a leaf model
      // anchors each note to its own source span, so there is no span to
      // subdivide, and the entry refuses a refine rather than quietly drawing the
      // document's own layout for one.
      expect([...s.refusesFinerView.entries()], `k=${k} gates`).toEqual([['no-finer-view', 82]])
      expect(s.asks.length, `k=${k} asks`).toBe(19221)
      // IDENTICAL AT EVERY SCALE, and that is the point rather than a coincidence:
      // the population, the routing and the refusals are properties of the
      // PATTERN, so a view multiplier must not move any of them (#1116).
      expect(pathCounts(s), `k=${k} paths`).toEqual({ splice: 15200, alt: 4009, declined: 12 })
    }
  })

  it('PROPERTY 1 — every placement the op accepts, the writer can spell', () => {
    for (const k of SCALES) {
      const s = SWEPT.get(k)!
      const unspellable = s.asks.filter((a) => a.accepted && a.out === null)
      expect(unspellable, `k=${k}: accepted but unwritable`).toEqual([])
      // and the op's refusals are a bounded, named set rather than a rate
      const declined = s.asks.filter((a) => !a.accepted)
      expect(declined.length, `k=${k} declines`).toBe(12)
      expect([...new Set(declined.map((d) => d.mini))].length, `k=${k} declining units`).toBe(5)
    }
  })

  it('PROPERTY 3 — the write moves ONE element, asked of the writer', () => {
    for (const k of SCALES) {
      const s = SWEPT.get(k)!
      const spliced = s.asks.filter((a) => a.accepted && a.path === 'splice')
      const nonLocal = spliced.filter(
        (a) => !(a.rebuiltParts!.length === 0 && a.regionsReemitted! <= 1),
      )

      // THE LOAD-BEARING RESULT: not one accepted placement re-emits a second
      // REGION. Every non-local write is a whole-`,`-part rebuild instead — one
      // mechanism, which is what makes #1137 a single fix rather than a class.
      expect(
        nonLocal.filter((a) => a.regionsReemitted! > 1),
        `k=${k}: a second element re-emitted`,
      ).toEqual([])
      expect(nonLocal.every((a) => a.rebuiltParts!.length > 0), `k=${k}: all part-rebuilds`).toBe(true)
      expect(nonLocal.length, `k=${k} non-local asks`).toBe(34)

      // pinned BY UNIT, so a fix to #1137 reads as a named delta and a regression
      // cannot hide inside a rate
      expect([...new Set(nonLocal.map((a) => a.mini))].sort(), `k=${k}`).toEqual(NON_LOCAL_UNITS)
      expect(spliced.length - nonLocal.length, `k=${k} local`).toBe(15166)
    }
  })

  it('the residual is where the FINER spelling does not exist — the fallback, not the rule', () => {
    // #1137 SETTLED THE OPEN CALL BY REMOVING MOST OF ITS POPULATION. This used to
    // read "most of the non-local residual is a ONE-element part", and asked whether
    // rebuilding a one-element part counts as non-local at all — since rebuilding it
    // and re-emitting its one element produce the same bytes. That question mattered
    // when it covered 170 of 278 asks. The writer now reads a part at the finest width
    // its own elements still describe rather than voiding it, so 244 of those 278 are
    // ordinary splices and the single-element class is 16 of a residual of 34.
    //
    // What is left is the honest fallback: the finer read was attempted, produced no
    // spelling, and the whole-part rebuild answered — which is what shipped before, so
    // nothing regressed to reach it. Still reported rather than decided, and still only
    // reportable because the writer says which part it rebuilt; the byte diff cannot
    // see a part-rebuild at all (#1137).
    for (const k of SCALES) {
      const nonLocal = SWEPT.get(k)!.asks.filter(
        (a) => a.accepted && a.path === 'splice' && a.rebuiltParts!.length > 0,
      )
      // EVERY rebuilt part's size comes from the writer, so "was the part a single
      // element?" is answered rather than inferred from the model afterwards.
      const singleElement = nonLocal.filter((a) => a.rebuiltParts!.every((n) => n === 1))
      expect(singleElement.length, `k=${k}`).toBe(SINGLE_ELEMENT_PART_VOIDS)
    }
  })

  it('LOCALITY IS VACUOUS where the source is a single region — reported, not hidden', () => {
    // `hh*8`, `hh(<3,7>,16)`, `amen/4`: one element owns the whole cycle, so a
    // write re-emits it and satisfies every locality rule while re-deriving the
    // entire pattern. #994's self-review found this and `vacuousLocality` routes
    // around it at parse time; the gate must not count it as evidence that
    // placement is local, which is exactly what reporting `1 of 1` prevents.
    for (const k of SCALES) {
      const spliced = SWEPT.get(k)!.asks.filter((a) => a.accepted && a.path === 'splice')
      const vacuous = spliced.filter((a) => a.regions === 1)
      expect(vacuous.length, `k=${k} vacuous asks`).toBe(1562)
      expect([...new Set(vacuous.map((a) => a.mini))].length, `k=${k} vacuous units`).toBe(412)
    }
  })

  it('a vacuous write is lossy, and it is lossy at the DOCUMENT resolution too', () => {
    // The control arm that keeps this out of #1058's ledger. Same unit, same lane,
    // same column, with and without a refinement in play: the whole cycle is
    // re-derived either way and the `<3,7>` alternation is destroyed either way.
    // Refining changes the MAGNITUDE (twice the columns to re-emit), never the
    // mechanism — so this is the element writer's known bound, not something this
    // phase opened.
    const mini = 'hh(<3, 7>, 16)'
    const write = (k: number): string | null => {
      const r = k === 1 ? parseStepGrid(mini) : parseStepGrid(mini, k)
      if (!r.ok) return null
      const m = r.model
      for (let col = 0; col < m.steps; col++) {
        if (m.lanes[0].cells[col] !== false) continue
        const next = toggleCell(m, 0, col, true)
        if (next === m) continue
        return serializeStepGrid(collapseStepGridToDocument(next) ?? next)
      }
      return null
    }
    // the euclid survives an unedited round trip
    const opened = parseStepGrid(mini)
    expect(opened.ok).toBe(true)
    if (opened.ok) expect(serializeStepGrid(opened.model)).toBe(mini)
    // ...and is flattened by an edit at BOTH, which is the point of the arm
    expect(write(1)).toBe('hh hh ~ hh ~ hh ~ hh ~ ~ hh ~ hh ~ hh ~')
    expect(write(2)).toBe(
      'hh hh ~ ~ ~ ~ hh _ ~ ~ hh _ ~ ~ hh _ ~ ~ ~ ~ hh _ ~ ~ hh _ ~ ~ hh _ ~ ~',
    )
  })

  it('PROPERTY 2 — the document plays what the grid says, plus one hit', () => {
    // Sampled deterministically, and the sample is STATED: the engine query is the
    // expensive part and a full sweep is minutes, not seconds.
    const s = SWEPT.get(2)!
    // NON-VACUOUS ONLY. A single-region source is re-derived wholesale by any
    // edit — see the arm above — so including it would measure the element
    // writer's known bound rather than this phase's property.
    const accepted = s.asks.filter(
      (a) => a.accepted && a.out !== null && a.path === 'splice' && a.regions! > 1,
    )
    const stride = Math.max(1, Math.floor(accepted.length / 300))
    const sample = accepted.filter((_, i) => i % stride === 0).slice(0, 300)
    expect(sample.length, 'sample size').toBeGreaterThan(200)

    let clean = 0
    const wrong: string[] = []
    for (const a of sample) {
      const parsed = parseStepGrid(a.mini, 2)
      if (!parsed.ok) continue
      const bars = parsed.model.bars ?? 1
      let added: Note[] = []
      let removed: Note[] = []
      let queryable = true
      for (let b = 0; b < bars; b++) {
        const want = enginePlayedCycle(a.mini, b)
        const got = enginePlayedCycle(a.out!, b)
        if (want === null || got === null) { queryable = false; break }
        const d = diffNotes(want, got)
        added = added.concat(d.added)
        removed = removed.concat(d.removed)
      }
      if (!queryable) continue
      // EXACTLY ONE NET NEW ROW. Notes that merely change duration appear on both
      // sides of the diff — that is the placement clamp, which #1064 made the
      // sanctioned behaviour: a new onset takes the room an earlier note had.
      if (added.length - removed.length === 1) clean++
      else wrong.push(a.mini)
    }
    // NAMED, NOT EXCLUDED. The only documents that gain anything other than one
    // row are the ones whose re-emit drops a duplicate chord member — #1065, the
    // corruption cause the spike itself filed, and proven below to fire at the
    // document's own resolution too. Asserting membership rather than filtering
    // them out beforehand means a NEW loss cannot arrive unnoticed.
    expect([...new Set(wrong)], 'rows lost or gained beyond the one placed').toEqual(
      wrong.length === 0 ? [] : [DUPLICATE_CHORD_UNIT],
    )
    expect(clean).toBeGreaterThan(200)
  })

  it('OWNERSHIP — refining never hands the pattern to a different writer', () => {
    // The hazard #1120 shipped and #1116 named: a scale that re-routes a pattern
    // swaps the writer that owns the user's bytes, silently and faithfully. Asked
    // as WHICH PATH answered, never as reach — reach is the axis that would not
    // have caught it.
    const at = (k: number): Map<string, string> => {
      const m = new Map<string, string>()
      for (const mini of MINIS) {
        const r = k === 1 ? parseStepGrid(mini) : parseStepGrid(mini, k)
        if (!r.ok) continue
        m.set(mini, r.model.leafSource ? 'leaf' : r.model.altSource ? 'alt' : 'core')
      }
      return m
    }
    const base = at(1)
    for (const k of SCALES) {
      const fine = at(k)
      const moved = [...fine.entries()].filter(([mini, p]) => base.get(mini) !== undefined && base.get(mini) !== p)
      expect(moved, `k=${k}: patterns that changed writer on a zoom`).toEqual([])
    }
  })

  it('CONTROL — at the document\'s own resolution the refined path is never entered', () => {
    // `bd [hh hh] sn ~` already carries div > 1, so a hit on an eighth needs no
    // refinement at all. This is the gesture #1120's refined-only fallback sits
    // next to; it must stay on the ordinary path and stay local.
    const doc = parseStepGrid('bd [hh hh] sn ~')
    expect(doc.ok).toBe(true)
    if (!doc.ok) return
    expect(doc.model.viewScale).toBeUndefined()
    const next = toggleCell(doc.model, 0, 1, true)
    expect(next).not.toBe(doc.model)
    // the document can spell it, so nothing is respelled finer
    const atDocument = collapseStepGridToDocument(next)
    expect(atDocument).not.toBeNull()
    const { mini, extent } = serializeStepGridWithExtent(atDocument ?? next)
    expect(mini).toBe('[bd bd] [hh hh] sn ~')
    expect(extent).toEqual({ path: 'splice', regions: 4, regionsReemitted: 1, rebuiltParts: [] })
  })

  it('the duplicate-chord loss is the WRITER\'s, at either resolution', () => {
    // Control arm keeping #1065 out of this phase's ledger. Same unit, same lane,
    // same column, with and without a refinement in play: the bar the edit lands
    // in is re-emitted and `[d4,f4,d4]` comes back `[d4,f4]` BOTH times. The
    // untouched bars keep their duplicate, which is the splice doing its job and
    // is also why this went unnoticed.
    const firstEdit = (k: number): string | null => {
      const r = k === 1 ? parseStepGrid(DUPLICATE_CHORD_UNIT) : parseStepGrid(DUPLICATE_CHORD_UNIT, k)
      if (!r.ok) return null
      const m = r.model
      for (let lane = 0; lane < m.lanes.length; lane++)
        for (let col = 0; col < m.steps; col++) {
          if (m.lanes[lane].cells[col] !== false) continue
          const next = toggleCell(m, lane, col, true)
          if (next === m) continue
          const out = serializeStepGrid(collapseStepGridToDocument(next) ?? next)
          if (out !== null) return out
        }
      return null
    }
    // unedited, the duplicate survives at both resolutions
    const doc = parseStepGrid(DUPLICATE_CHORD_UNIT)
    expect(doc.ok).toBe(true)
    if (doc.ok) expect(serializeStepGrid(doc.model)).toBe(DUPLICATE_CHORD_UNIT)
    // edited, the touched bar loses it at both
    for (const k of [1, 2]) {
      const out = firstEdit(k)
      expect(out, `k=${k}`).not.toBeNull()
      expect(out!.split('\n')[1], `k=${k} the touched bar`).not.toContain('d4,f4,d4')
    }
  })

  it('TERMINATION — repeated placement widens the group and never nests deeper', () => {
    // The issue asked for this to be capped or measured. Measured: the element
    // becomes a wider flat group, never a group inside a group, and the document
    // stops opening after the third gesture (#1066). Bounded, and the bound is
    // the reader's, not a cap invented here.
    let mini = 'bd ~ sn ~'
    const trace: string[] = []
    for (let i = 0; i < 6; i++) {
      const fine = parseStepGrid(mini, 2)
      if (!fine.ok) { trace.push(`refused:${fine.gate}`); break }
      const m = fine.model
      let placed = false
      for (let col = 1; col < m.steps; col += 2) {
        const next = toggleCell(m, 0, col, true)
        if (next === m) continue
        const out = serializeStepGrid(collapseStepGridToDocument(next) ?? next)
        if (out === null) continue
        mini = out
        trace.push(out)
        placed = true
        break
      }
      if (!placed) { trace.push('no-admissible-placement'); break }
    }
    expect(trace).toEqual([
      '[bd bd] ~ sn ~',
      '[bd bd bd _] ~ sn ~',
      '[bd bd bd _ bd _ _ _] ~ sn ~',
      'refused:irrational-onset',
    ])
    // depth never exceeds one: no group ever opens inside a group
    for (const t of trace) expect(t).not.toMatch(/\[[^\]]*\[/)
  })
})

/**
 * The units whose write STILL rebuilds a whole `,`-part instead of splicing it,
 * after #1137 (was 21 units / 278 asks; now 4 / 34).
 *
 * PINNED BY NAME rather than counted, so a change there reads as a named delta and a
 * regression cannot hide inside a rate. The same set appears at the document's own
 * resolution with no refinement in play — so refining does not open this, it only
 * supplies more columns at which it fires.
 *
 * ⚠ WHAT LEAVING THIS LIST MEANS, since the direction is not symmetric. A unit
 * DROPPING off is a part that now splices — the #1137 fix reaching further. A unit
 * ARRIVING is a part that stopped splicing, which is a regression: the writer had a
 * local answer for it and lost one. The four below are the residual where reading the
 * part finer produced no spelling at all, so the pre-#1137 whole-part rebuild
 * answered. Nothing regressed to reach them; that rebuild is what always shipped.
 */
const NON_LOCAL_UNITS: string[] = [
  "[b4,d4,f#4],b5*3 c#6*2",
  "bd sd oh hh hh [oh hh oh], hh ht bd",
  "c2, eb3 g3 [bb3 c4 c3]",
  "c2, eb3 g3 [bb3 c4]",
]

/**
 * Non-local writes whose rebuilt parts held a SINGLE element each — 16 of the 34
 * residual, down from 170 of 278 before #1137.
 *
 * Rebuilding such a part and re-emitting its one element produce the same bytes, so
 * this class may not be non-local at all by #1137's words. That was the open call
 * while it covered most of the residual; it now covers under half of a much smaller
 * one, which is why the fix went to the mechanism rather than to the definition.
 *
 * The figure comes from the writer's own report of each rebuilt part's size; the
 * earlier version of this gate inferred it from the model instead and took the
 * minimum across ALL parts, which is the wrong part whenever they differ in size.
 */
const SINGLE_ELEMENT_PART_VOIDS = 16

/**
 * The corpus unit whose chords carry a duplicate member (`[d4,f4,d4]`). Any
 * re-emit of the bar holding it drops the duplicate — #1065, filed off the spike's
 * own corruption count, and independent of this phase (see the arm below).
 */
const DUPLICATE_CHORD_UNIT = "<\n[bb3 [d4,f4,d4] ~[d4,f4,d4]~ ~]\n[bb3 [c4, e4, g4]~[c4, e4, g4]~ ~]\n[d3 [f3,a3,c4]~ [f3,a3,c4]~ ~ ]\n[[bb2,bb3] [d4, f4, a4]~[d4, f4, a4]~ ~ ]\n[bb3 [d4,f4,d4] ~[d4,f4,d4]~ ~]\n[bb3 [c4, e4, g4]~[c4, e4, g4]~ ~]\n[bb3 [c4, e4, g4]~[c4, e4, g4]~ ~]\n[d3 [f3,a3,c4]~ [f3,a3,c4]~ ~ ]\n>"

describe('#1058 — the roll, gated separately', () => {
  it('a refined roll takes a note at every new column', () => {
    for (const k of SCALES) {
      let opens = 0
      let admits = 0
      const gates = new Map<string, number>()
      let asks = 0
      let accepted = 0
      let written = 0
      for (const mini of MINIS) {
        const base = parsePianoRoll(mini)
        if (!base.ok || serializePianoRoll(base.model) !== mini) continue
        opens++
        const fine = parsePianoRoll(mini, k)
        if (!fine.ok) {
          const gate = fine.gate ?? 'no-gate'
          gates.set(gate, (gates.get(gate) ?? 0) + 1)
          continue
        }
        admits++
        const m = fine.model
        for (const pitch of new Set(m.notes.map((n) => n.pitch)))
          for (let col = 1; col < m.steps; col += k) {
            asks++
            const next = placeNote(m, pitch, col, 1)
            if (next === m) continue
            accepted++
            if (serializePianoRoll(collapsePianoRollToDocument(next) ?? next) !== null) written++
          }
      }
      expect(opens, `k=${k} opens`).toBe(542)
      expect(admits, `k=${k} admits`).toBe(k === 2 ? 488 : 487)
      expect(gates.get('no-finer-view'), `k=${k} leaf refusals`).toBe(54)
      expect(asks, `k=${k} asks`).toBeGreaterThan(4000)
      // the roll's notes carry a duration natively, so a finer column is never
      // unspellable for it the way a `_` run can be for the grid
      expect(accepted, `k=${k} accepted`).toBe(asks)
      expect(written, `k=${k} written`).toBe(asks)
    }
  })
})
