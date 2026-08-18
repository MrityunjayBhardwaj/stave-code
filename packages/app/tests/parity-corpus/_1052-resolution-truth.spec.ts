/**
 * _1052-resolution-truth.spec.ts — THROWAWAY INSTRUMENT. Does the grid behave the way
 * a DAW's grid is supposed to behave?
 *
 * Run:
 *   SWEEP=tests/parity-corpus/_1052-resolution-truth.spec.ts \
 *     pnpm --filter @stave/app exec vitest run --config vitest.sweep.config.ts
 *
 * THE SPEC, in the product's own terms (#1052), as three separable claims:
 *
 *   1. FREE      changing the grid alone changes only the VIEW. Your file is not
 *                touched. (Ableton's Narrow/Widen Grid: you zoom, your MIDI does not
 *                move.)
 *   2. TRUE      the finer view is a faithful picture of the document underneath. A
 *                note occupying one cell at 8 occupies two at 16 — same music, drawn
 *                at twice the density, nothing invented and nothing lost.
 *   3. HONEST    mutating AT the finer grid may legitimately change the code, because
 *                the user asked for something the old resolution cannot say. What it
 *                may NOT do is disturb anything they did not touch.
 *
 * 1 and 2 are about looking. 3 is about writing, and it is the one with teeth: a write
 * that spells the finer grid is CORRECT, and a write that also re-spells the notes
 * either side of it is the failure #1052 exists to prevent.
 *
 * ── WHY THIS IS NOT ANSWERED BY WHAT IS ALREADY HERE ──────────────────────────
 * `free-zone-equivalence.test.ts` gates claim 1 and `cell-coverage.test.ts` gates a
 * piece of claim 2, both over their own populations. Claim 3 has only ever been
 * measured in BYTES (`_1007-subdivide-route.spec.ts`: the shipped route moves p50
 * 0.298 of a long document against a leaf delete's 0.036). Bytes cannot say whether
 * the notes that moved still PLAY the same — a faithful re-spelling at a finer
 * resolution moves bytes and changes no music, and that is precisely the case the
 * byte metric cannot tell from destruction. So the arm that matters here is the one
 * nobody has run: the ENGINE on both sides of the shipped write.
 *
 * ── THE ORACLE, AND WHAT COUNTS AS DAMAGE ─────────────────────────────────────
 * `enginePlayedCycle` on the source and on the emitted document, every bar the model
 * spans, keyed (onset, duration, atom) — the project's one definition, never a
 * re-parsed column grid ([[P301]]: `[~ 1@2]` and `[~ ~ 1@4]` are the same music).
 *
 * The verdict is deliberately ASYMMETRIC, because the two directions mean different
 * things:
 *   added   — the note the user just placed. Exactly 1 is the whole point of the
 *             gesture, so this is the SUCCESS axis.
 *   removed — a note that was in the document before and is not in it now, or is
 *             now at a different instant/length/value.
 * A byte ratio cannot separate these two and this can.
 *
 * ⚠ AND "removed" IS STILL TOO COARSE FOR DAMAGE — re-cut after the first run, which
 * read 835 of 934 as damaged. Almost all of it is the PLACEMENT CLAMP: put a hit in
 * the second half of a cell and the note already there must shorten to make room, so
 * `bd - - -` becomes `[bd bd] - - -`, removing `bd@0.25` and adding `bd@0.125`. The
 * note did not go anywhere; it got shorter, and that is the gesture working (#1064
 * made it sanctioned, and `1058` counts it the same way). So the verdict splits:
 *   CLAMPED  — something in the result still starts at that instant with that value
 *   VANISHED — nothing does. The note stopped sounding, and this is the real loss.
 * Reporting one number for both would have called the feature a defect on 89% of the
 * corpus.
 *
 * ⚠ AND THE COMPARISON MUST COLLAPSE, for the same reason `GRID_SURFACE.collapses` is
 * `true`. Both units the re-cut still flagged were the documented collapse rather than
 * loss — `[d4,f4,d4]` and `hh(<3,7>,16)` — so the surface's own rule is applied to
 * both sides instead of an exception being carved for the two that tripped it.
 *
 * ── CALIBRATION BEFORE ANYTHING IS READ ([[PK103]] step 7) ────────────────────
 * Three figures already known from other instruments are re-derived here and
 * asserted: 1021 units opening a step grid, 1013 DISTINCT units with an identity base
 * (`1058-refined-placement`), and 934 route-A placements posed
 * (`_1007-subdivide-route`). If any moves, this instrument is measuring a different
 * population and its treatment columns mean nothing.
 *
 * ⚠ ONE ASK PER UNIT, first admissible odd column, scanned col-then-lane — the SAME
 * order the route probe uses, so the two runs describe the same 934 asks.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStepGrid } from '../../../editor/src/visualEdit/notation/parse'
import type { StepGridModel } from '../../../editor/src/visualEdit/notation/model'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
import { toggleCell } from '../../../editor/src/visualEdit/notation/place'
import {
  collapseStepGridToDocument,
  stepSlotState,
} from '../../../editor/src/visualEdit/notation/resolution'
import {
  serializeStepGrid,
  serializeStepGridWithExtent,
} from '../../../editor/src/visualEdit/notation/serialize'
import { enginePlayedCycle, HRES, type Note } from './engineEditOracle'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/** the equivalence key — identical to `engineEditOracle`'s and `1058`'s, on purpose */
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
    if (c > 0) {
      counts.set(kk, c - 1)
      removed.push(n)
    }
  }
  return { added, removed }
}

/** the grid's collapse: identical events at one instant are ONE cell (GRID_SURFACE) */
function collapse(rows: Note[]): Note[] {
  const seen = new Set<string>()
  return rows.filter((n) => {
    const k = key(n)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** the first empty ODD column, scanned col-then-lane — same order as the route probe */
function firstOddPlacement(m: StepGridModel): StepGridModel | null {
  for (let col = 1; col < m.steps; col += 2)
    for (let lane = 0; lane < m.lanes.length; lane++) {
      if (isCellOn(m.lanes[lane].cells[col])) continue
      const next = toggleCell(m, lane, col, true)
      if (next !== m) return next
    }
  return null
}

describe('#1052 — is the grid FREE to look at, TRUE to the document, and HONEST when written?', () => {
  it('measures all three claims over the corpus', () => {
    let units = 0
    const identityDistinct = new Set<string>()

    // ---- CLAIM 1: is a x2 resolution change free? ----
    const slot = new Map<string, number>()

    // ---- CLAIM 2: is the x2 view a faithful picture? ----
    let truthAsked = 0
    let truthExact = 0
    let truthShapeMismatch = 0
    const truthWrong: string[] = []
    const exTruth: string[] = []

    // ---- CLAIM 3: does the write disturb anything untouched? ----
    let posed = 0
    let wrote = 0
    let queried = 0
    let cleanOne = 0 // exactly the placed note added, nothing touched at all
    let clamped = 0 // a neighbour SHORTENED to make room — sanctioned by #1064
    let vanished = 0 // a note stopped sounding at its instant entirely — real loss
    let oddAdds = 0 // wrote, played, but did not add exactly one
    let unqueryable = 0
    let vanishedNotes = 0
    const exVanish: [string, string, string][] = []

    for (const mini of minis) {
      const base = parseStepGrid(mini)
      if (!base.ok) continue
      const m = base.model as StepGridModel
      units++
      const identity = serializeStepGrid(m) === mini
      if (identity) identityDistinct.add(mini)

      // ── CLAIM 1 ── what does the shipped control say about doubling?
      // `canDrawView` PROVES the view draws by asking the parser, which is how the
      // panel proves it — never a prediction of the parser's answer.
      const st = stepSlotState(m, m.steps * 2, (scale) => parseStepGrid(mini, scale).ok)
      slot.set(st, (slot.get(st) ?? 0) + 1)

      const fine = parseStepGrid(mini, 2)
      if (!fine.ok) continue
      const f = fine.model as StepGridModel

      // ── CLAIM 2 ── one cell at N must be exactly two cells at 2N, same music.
      truthAsked++
      if (f.steps !== m.steps * 2 || f.lanes.length !== m.lanes.length) {
        truthShapeMismatch++
      } else {
        let ok = true
        for (let lane = 0; lane < m.lanes.length && ok; lane++)
          for (let i = 0; i < m.steps && ok; i++) {
            const b = m.lanes[lane].cells[i]
            const a0 = f.lanes[lane].cells[2 * i]
            const a1 = f.lanes[lane].cells[2 * i + 1]
            if (isCellOn(b)) {
              // the note moves to column 2i and doubles in width; the slot the
              // refinement created beside it must be EMPTY, not a second onset
              if (!isCellOn(a0) || a0.duration !== b.duration * 2 || isCellOn(a1)) ok = false
            } else if (isCellOn(a0) || isCellOn(a1)) {
              ok = false // silence at N became sound at 2N — invented content
            }
          }
        if (ok) truthExact++
        else {
          truthWrong.push(mini)
          if (mini.length >= 40 && exTruth.length < 3) exTruth.push(mini)
        }
      }

      // ── CLAIM 3 ── mutate at the finer grid, then ask the ENGINE what survived.
      if (!identity) continue
      const placed = firstOddPlacement(f)
      if (placed === null) continue
      posed++
      const atDocument = collapseStepGridToDocument(placed)
      const { mini: out } = serializeStepGridWithExtent(atDocument ?? placed)
      if (out === null) continue
      wrote++

      const bars = f.bars ?? 1
      let added: Note[] = []
      let removed: Note[] = []
      let queryable = true
      for (let b = 0; b < bars; b++) {
        const want = enginePlayedCycle(mini, b)
        const got = enginePlayedCycle(out, b)
        if (want === null || got === null) {
          queryable = false
          break
        }
        // THE GRID COLLAPSES, and the comparison must too — `GRID_SURFACE.collapses`
        // is `true` because a cell holds a hit or it does not, so it cannot carry two
        // IDENTICAL events at one instant. `hh(<3,7>,16)` plays 10 haps at 7 distinct
        // instants and a FAITHFUL re-emit plays 7; `[d4,f4,d4]` sounds d4 twice at one
        // onset and re-emits as `[d4,f4]`. Diffing as a raw multiset reports both as
        // lost notes, which is the false flag `engineEditOracle`'s `collapses` flag
        // exists to prevent. Applying the surface's own documented rule, never an
        // exception carved for the two units that tripped it.
        const d = diffNotes(collapse(want), collapse(got))
        added = added.concat(d.added)
        removed = removed.concat(d.removed)
      }
      if (!queryable) {
        unqueryable++
        continue
      }
      queried++
      // ⚠ RE-CUT AFTER THE FIRST RUN. "removed > 0" read as damage on 835 of 934, and
      // inspecting the examples showed almost all of it is the PLACEMENT CLAMP: place a
      // hit into the second half of a cell and the note already there must shorten to
      // make room. `bd - - -` becoming `[bd bd] - - -` removes `bd@0.25` and adds
      // `bd@0.125` — the note did not go anywhere, it got shorter, and that is the
      // gesture working. #1064 made it the sanctioned behaviour and `1058` counts it
      // the same way (net one new row). A metric that cannot tell a shortened
      // neighbour from a deleted note is not measuring damage.
      //
      // So: a removed note is VANISHED only if nothing in the result starts at its
      // instant with its value. If something does, the note is still there and only
      // its length moved — that is the clamp.
      const gone = removed.filter(
        (r) => !added.some((a) => Math.round(a.pos * HRES) === Math.round(r.pos * HRES) && a.atom === r.atom),
      )
      if (gone.length > 0) {
        vanished++
        vanishedNotes += gone.length
        if (exVanish.length < 4) exVanish.push([mini, out, `vanished ${gone.length}: ${gone.map((g) => g.atom).join(' ')}`])
      } else if (removed.length > 0) clamped++
      else if (added.length === 1) cleanOne++
      else oddAdds++
    }

    const pct = (a: number, b: number) => (b === 0 ? 'n/a' : `${((a / b) * 100).toFixed(1)}%`)

    console.log(`\n===== #1052: free to look at, true to the document, honest when written? =====`)
    console.log(`  corpus minis                  ${minis.length}`)
    console.log(`  units opening a step grid     ${units}      <- calibration: 1021`)
    console.log(`  ...DISTINCT, identity base    ${identityDistinct.size}      <- calibration: 1013`)

    console.log(`\n  -- CLAIM 1: is doubling the grid FREE? (the shipped control's own verdict) --`)
    for (const [k, v] of [...slot.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`     ${String(v).padStart(5)}  ${k.padEnd(10)} ${pct(v, units)}`)
    console.log(`     'view' means the panel redraws and the file is NOT touched.`)

    console.log(`\n  -- CLAIM 2: is the x2 view TRUE to the document? --`)
    console.log(`     asked (admits a x2 view)   ${truthAsked}`)
    console.log(`     one cell -> exactly two    ${truthExact}   ${pct(truthExact, truthAsked)}`)
    console.log(`     shape mismatch             ${truthShapeMismatch}`)
    console.log(`     cell mismatch              ${truthWrong.length}`)

    console.log(`\n  -- CLAIM 3: does writing at the finer grid disturb anything untouched? --`)
    console.log(`     placements posed           ${posed}      <- calibration: 934`)
    console.log(`     ...wrote a document        ${wrote}`)
    console.log(`     ...engine answered         ${queried}   (unqueryable ${unqueryable})`)
    console.log(`     VANISHED: a note stopped sounding entirely  ${vanished}   ${pct(vanished, queried)}   (${vanishedNotes} notes)`)
    console.log(`     clamped: a neighbour shortened for room     ${clamped}   ${pct(clamped, queried)}   <- sanctioned (#1064)`)
    console.log(`     clean:   nothing else touched at all        ${cleanOne}   ${pct(cleanOne, queried)}`)
    console.log(`     other:   played but not exactly one added   ${oddAdds}   ${pct(oddAdds, queried)}`)
    console.log(`     -> UNDISTURBED (clean + clamped) = ${cleanOne + clamped}   ${pct(cleanOne + clamped, queried)}`)

    if (exTruth.length) {
      console.log(`\n  -- where the x2 VIEW is not a faithful doubling --`)
      for (const s of exTruth) console.log(`     ${JSON.stringify(s)}`)
    }
    if (exVanish.length) {
      console.log(`\n  -- where a note VANISHED (not merely shortened) --`)
      for (const [b, a, why] of exVanish) {
        console.log(`     ${why}`)
        console.log(`       before  ${JSON.stringify(b)}`)
        console.log(`       after   ${JSON.stringify(a)}`)
      }
    }

    // ---- CALIBRATION. Nothing above may be read if these move. ----
    expect(units, 'units opening a step grid').toBe(1021)
    expect(identityDistinct.size, 'distinct identity base — 1058').toBe(1013)
    expect(posed, 'route-A placements posed — _1007-subdivide-route').toBe(934)
    // and the engine must have answered for a real share, or claim 3 is vacuous
    expect(queried, 'engine answered too few asks to read claim 3').toBeGreaterThan(300)
  })
})
