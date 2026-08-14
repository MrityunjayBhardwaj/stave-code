/**
 * _1256-kind-census.spec.ts — INSTRUMENT for #1256, invariant 3's third term.
 *
 * THE QUESTION: of the units invariant 3 currently COUNTS — the accepted set,
 * not the residual — how many are drawn by a view of the wrong KIND?
 *
 * Run:
 *   SWEEP=tests/parity-corpus/_1256-kind-census.spec.ts \
 *     pnpm --filter @stave/app exec vitest run --config vitest.sweep.config.ts
 *
 * ── WHY THE ACCEPTED SET AND NOT THE RESIDUAL ─────────────────────────────
 * Every previous sweep on this arc pointed at the refusals, because reach was
 * the lever. This one points the other way. `classifyUnit` returns `note` when
 * a surface routes and its parser returns a model — two questions, visible as
 * two in `editCoverage.ts:276`. Nothing asks whether the model is the right
 * kind of thing to have drawn. So the accepted set is exactly where an
 * unmeasured term can hide, and its size is what decides whether the figure we
 * quote is a count or an upper bound.
 *
 * ── NO SECOND COPY OF ANY RULE ────────────────────────────────────────────
 * Units and verdicts come from `unitsWithStatus` — the oracle the corpus gates
 * use. The surface comes from `chunkSurface`, the model from the shipped
 * parsers, and the chord question from `chordLanes`. The ONLY thing spelled
 * here is the kind SIGNATURE, which is new by definition: nothing computes it
 * today, and that absence is the finding this file exists to size.
 *
 * ⚠ THE SIGNATURE IS A FILTER, NOT A VERDICT. A count cannot answer "is this
 * the right kind" — that is the lesson #1241 and #1243 both turned on, where
 * the population count was compatible with either fix and only printing the
 * MODEL the surface would draw separated two chord charts from four
 * melodies-as-diagonals. So every signature bucket dumps its rows in full for
 * hand-reading, and the assertions below pin the ARITHMETIC (buckets partition
 * the population, controls are non-empty), never the verdict.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unitsWithStatus, measureDocs, aggregate } from './editCoverage'
import { chunkSurface } from '../../../editor/src/visualEdit/panels/surfaceRoute'
import { chordLanes } from '../../../editor/src/visualEdit/panels/chordLanes'
import {
  parseStepGrid,
  parsePianoRoll,
  parseStepGridCore,
  parsePianoRollCore,
} from '../../../editor/src/visualEdit/notation/parse'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
import { loadCorpus } from '../../../editor/src/visualEdit/miniSource/__tests__/evalHarness'
import census from './WRITER-CENSUS.json'

/**
 * "More than one cell / note" — `writer-census.test.ts:204-207`, verbatim.
 *
 * ⚠ THIS IS A COPY OF A RULE THAT LIVES IN ANOTHER TEST FILE, and a copied rule
 * is a second oracle that answers confidently and diverges silently. It is
 * copied because the original is a module-private function in a `.test.ts` and
 * cannot be imported — which is itself part of this issue's finding, and the
 * follow-up is to give it one home.
 *
 * Until then it is CALIBRATED rather than trusted: the first test below replays
 * it over the census's own 1,273 published rows and requires it to reproduce
 * `coreStructured` exactly. A copy that agrees with the committed artifact on
 * every row of the original population is the same rule; one that does not is
 * caught before any number below is read.
 */
function hasStructure(
  m: { steps?: number; lanes?: { cells: unknown[] }[]; notes?: unknown[] },
  key: 'step' | 'roll',
): boolean {
  if (key === 'roll') return (m.notes?.length ?? 0) > 1
  const hits = (m.lanes ?? []).reduce(
    (n, l) => n + l.cells.filter((c) => isCellOn(c as never)).length,
    0,
  )
  return (m.steps ?? 0) > 1 && hits >= 1
}

/**
 * The kind signatures, drawn from the shipped routing rule's own reasoning
 * (`surfaceRoute.ts:141-145`) rather than invented here.
 *
 *  - `diagonal`   one lane per hit, every lane hit exactly once, three or more
 *                 lanes. This is the melody-as-drum-grid shape by construction:
 *                 a drum pattern reuses its lanes, a melody does not.
 *  - `one-cell`   a single column or at most one hit — a timbre name, not a
 *                 pattern. Already known and already caught by `hasStructure`
 *                 at the census; carried here so the two agree.
 *  - `chord`      the lane names are a chord chart. Deliberately NOT a wrong
 *                 kind — this is the case #1241 shipped a caption for — and it
 *                 is counted so the diagonal bucket cannot silently absorb it.
 *  - `ordinary`   everything else.
 */
type Kind = 'diagonal' | 'one-cell' | 'chord' | 'ordinary'

interface Row {
  doc: string
  head: string
  via: string
  surface: 'step' | 'roll'
  mini: string
  kind: Kind
  steps: number
  lanes: string[]
  hitsPerLane: number[]
  totalHits: number
  /** the census's own `hasStructure`, asked of the real model */
  structured: boolean
  siblingAccepts: boolean
  statement: string
}

/** Lane occupancy for a step model — the only quantity the signature needs. */
function gridShape(model: { steps: number; lanes: { sound: string; cells: unknown[] }[] }) {
  const lanes = model.lanes.map((l) => l.sound)
  const hitsPerLane = model.lanes.map(
    (l) => l.cells.filter((c) => isCellOn(c as never)).length,
  )
  return { lanes, hitsPerLane, totalHits: hitsPerLane.reduce((a, b) => a + b, 0) }
}

function classify(
  lanes: string[],
  hitsPerLane: number[],
  totalHits: number,
  steps: number,
): Kind {
  if (steps <= 1 || totalHits <= 1) return 'one-cell'
  if (chordLanes(lanes)) return 'chord'
  // Every lane struck exactly once, and enough lanes that "each sound plays
  // once" is not just a short pattern. `bd sd hh cp` is a real four-piece
  // pattern and is EXCLUDED by the distinctness requirement being paired with
  // the hit count — it too is one hit per lane, which is why this bucket is a
  // filter for reading and not a verdict on its own.
  if (lanes.length >= 3 && hitsPerLane.every((h) => h === 1)) return 'diagonal'
  return 'ordinary'
}

interface RollRow {
  doc: string
  head: string
  via: string
  mini: string
  notes: number
  steps: number
}

function survey(docs: { name: string; code: string }[]) {
  const rows: Row[] = []
  const rollUnstructured: RollRow[] = []
  let served = 0
  let rollServed = 0
  let skippedNoModel = 0
  const seen = new Set<string>()

  for (const doc of docs) {
    for (const { unit, status } of unitsWithStatus(doc.code)) {
      // The ACCEPTED set — what invariant 3 counts today.
      if (status.status !== 'note') continue
      const mini = unit.miniString
      if (mini === null) continue
      // ⚠ The harness double-collects some spans (an argument walk unioned with
      // `detectAllChunks`). Deduped per document, exactly as the #1243 probe
      // does, so the population is not inflated in the flattering direction.
      const key = `${doc.name}|${unit.miniRange?.join(':') ?? unit.exprRange.join(':')}`
      if (seen.has(key)) continue
      seen.add(key)
      served++

      const surface = chunkSurface(unit)
      if (surface === 'roll') {
        rollServed++
        const roll = parsePianoRoll(mini)
        if (roll.ok && !hasStructure(roll.model, 'roll')) {
          rollUnstructured.push({
            doc: doc.name,
            head: unit.headFn ?? '(none)',
            via: unit.miniVia ?? '(none)',
            mini,
            notes: roll.model.notes.length,
            steps: roll.model.steps,
          })
        }
        continue
      }
      const grid = parseStepGrid(mini)
      if (!grid.ok) {
        // Cannot happen while the harness and the parser agree; counted rather
        // than assumed away, because a silent zero here would make every
        // bucket below a claim about a population that was never assembled.
        skippedNoModel++
        continue
      }
      const { lanes, hitsPerLane, totalHits } = gridShape(grid.model)
      rows.push({
        doc: doc.name,
        head: unit.headFn ?? '(none)',
        via: unit.miniVia ?? '(none)',
        surface: 'step',
        mini,
        kind: classify(lanes, hitsPerLane, totalHits, grid.model.steps),
        steps: grid.model.steps,
        lanes,
        hitsPerLane,
        totalHits,
        structured: hasStructure(grid.model, 'step'),
        siblingAccepts: parsePianoRoll(mini).ok,
        statement: doc.code.slice(
          unit.statementRange[0],
          Math.min(unit.statementRange[1], unit.statementRange[0] + 200),
        ),
      })
    }
  }
  return { rows, rollUnstructured, served, rollServed, skippedNoModel }
}

function report(label: string, docs: { name: string; code: string }[]) {
  const { rows, rollUnstructured, served, rollServed, skippedNoModel } = survey(docs)
  const of = (k: Kind) => rows.filter((r) => r.kind === k)

  // ── TERM 3, APPLIED WITH THE RULE THE REPO ALREADY HAS ───────────────────
  // `hasStructure` is not new and is not mine: it is the census's own predicate,
  // whose docblock says a one-cell view "round-trips perfectly and is useless".
  // The only question here is how many units invariant 3 COUNTS would fail it.
  const gridUnstructured = rows.filter((r) => !r.structured)

  // ⚠ THE DENOMINATOR IS DERIVED IN THIS RUN, never carried in. Every figure in
  // this arc's history that went stale did so by being typed once and quoted
  // afterwards; the invariant's own percentage is exactly that kind of number,
  // so it is recomputed here from the same oracle in the same process.
  const a = aggregate(measureDocs(docs))
  const restated = a.uStructural - (gridUnstructured.length + rollUnstructured.length)

  console.log(`\n════════ ${label} — ${docs.length} documents ════════`)
  console.log(`musical units (the invariant's denominator)     : ${a.totalUnits}`)
  console.log(`structural today  (offered + round-trips)       : ${a.uStructural}` +
    `  = ${((100 * a.uStructural) / a.totalUnits).toFixed(1)}%`)
  console.log(`  note ${a.uNote} · clip ${a.uClip} · master ${a.uMaster}` +
    `   | broken ${a.uBroken} · knobs ${a.uKnobs} · code ${a.uCode}`)
  console.log(`units invariant 3 COUNTS today (status 'note')  : ${served}`)
  console.log(`  drawn as a piano roll                         : ${rollServed}`)
  console.log(`  drawn as a step grid                          : ${rows.length}`)
  console.log(`  routed to a grid whose parse failed (must be 0): ${skippedNoModel}`)
  console.log(`\n  — TERM 3: units that FAIL the census's own structure test —`)
  console.log(`  grid, single column or no hit                 : ${gridUnstructured.length}`)
  console.log(`  roll, one note or fewer                       : ${rollUnstructured.length}`)
  console.log(
    `  TOTAL counted-but-unstructured                : ${gridUnstructured.length + rollUnstructured.length}` +
      `  (${((100 * (gridUnstructured.length + rollUnstructured.length)) / Math.max(served, 1)).toFixed(1)}% of what invariant 3 counts)`,
  )
  console.log(
    `\n  STRUCTURAL, restated with term 3 applied      : ${restated}/${a.totalUnits}` +
      ` = ${((100 * restated) / a.totalUnits).toFixed(1)}%` +
      `   (today's figure is ${((100 * a.uStructural) / a.totalUnits).toFixed(1)}%)`,
  )

  // ── THE CEILING, RE-DERIVED ──────────────────────────────────────────────
  // A `note-broken` unit is one a view was OFFERED for and refused; repairing
  // every refusal moves the whole pool into structural. `knobs` and `code-only`
  // cannot move without NEW admission, so they bound it. This is the arithmetic
  // #1001 ran when the answer was "out of reach" — re-run rather than quoted,
  // because admission has widened twice since.
  const ceiling = a.uStructural + a.uBroken
  const target = Math.ceil(0.9 * a.totalUnits)
  console.log(`\n  — the ceiling, re-derived on this tree —`)
  console.log(`  90% of ${a.totalUnits} musical units                    : ${target}`)
  console.log(
    `  ceiling on terms 1+2 (every refusal repaired) : ${ceiling}/${a.totalUnits}` +
      ` = ${((100 * ceiling) / a.totalUnits).toFixed(1)}%   ` +
      `→ 90% is ${ceiling >= target ? 'REACHABLE' : 'OUT OF REACH'}`,
  )
  console.log(`     unreachable without new admission: knobs ${a.uKnobs} + code ${a.uCode} = ${a.uKnobs + a.uCode}`)
  // ⚠ AN UPPER BOUND AND SAID SO. A refused unit has no model, so its structure
  // cannot be asked — the 189 repairs are credited in full, which is generous by
  // construction. The true term-3 ceiling is at or below this.
  const ceiling3 = ceiling - (gridUnstructured.length + rollUnstructured.length)
  console.log(
    `  ceiling on terms 1+2+3 (UPPER BOUND)          : ${ceiling3}/${a.totalUnits}` +
      ` = ${((100 * ceiling3) / a.totalUnits).toFixed(1)}%   ` +
      `→ 90% is ${ceiling3 >= target ? 'REACHABLE' : 'OUT OF REACH'}`,
  )
  // The arithmetic must close, or one of these pools is being double-counted.
  console.log(
    `  closure check: ${a.uStructural} + ${a.uBroken} + ${a.uKnobs} + ${a.uCode} = ` +
      `${a.uStructural + a.uBroken + a.uKnobs + a.uCode} (must equal ${a.totalUnits})`,
  )
  // ── THE ROLL HALF IS NOT ONE THING, AND THE SPLIT IS A PRODUCT CALL ──────
  // `hasStructure` asks `notes > 1` of a roll, and its docblock defends that:
  // the roll has no empty columns of its own, so a note count is the only
  // measure of content it has. Applied faithfully that is what the numbers
  // above use. But a SINGLE note spanning several columns can still be dragged
  // in time, which is a real edit — so the roll half splits into a part nobody
  // would defend and a part somebody might. Reported separately rather than
  // folded, because a contested number quoted as a settled one is how this
  // invariant got into trouble in the first place.
  const rollNothing = rollUnstructured.filter((r) => r.notes === 0 || r.steps <= 1)
  const rollDraggable = rollUnstructured.filter((r) => r.notes === 1 && r.steps > 1)
  console.log(`\n  — the roll half, split —`)
  console.log(`  no note at all, or a single column   : ${rollNothing.length}  (nothing to edit)`)
  console.log(`  one note across ${'>1'} columns         : ${rollDraggable.length}  (draggable in time — CONTESTED)`)
  console.log(
    `  so term 3's range on this population : ` +
      `${gridUnstructured.length + rollNothing.length} … ${gridUnstructured.length + rollUnstructured.length} units`,
  )
  const lo = a.uStructural - (gridUnstructured.length + rollUnstructured.length)
  const hi = a.uStructural - (gridUnstructured.length + rollNothing.length)
  console.log(
    `  STRUCTURAL restated, as a RANGE      : ${lo}–${hi}/${a.totalUnits}` +
      ` = ${((100 * lo) / a.totalUnits).toFixed(1)}%–${((100 * hi) / a.totalUnits).toFixed(1)}%`,
  )

  console.log(`\n  — roll rows with one note or fewer, for hand-reading —`)
  for (const r of rollUnstructured.slice(0, 30)) {
    console.log(`     ${r.doc.padEnd(30)} head=${r.head.padEnd(8)} via=${r.via.padEnd(9)} notes=${r.notes}  ${JSON.stringify(r.mini.slice(0, 60))}`)
  }
  if (rollUnstructured.length > 30) console.log(`     … ${rollUnstructured.length - 30} more`)
  console.log(`\n  — the step-grid population by kind signature —`)
  for (const k of ['ordinary', 'diagonal', 'one-cell', 'chord'] as Kind[]) {
    console.log(`  ${String(of(k).length).padStart(5)}  ${k}`)
  }

  for (const k of ['diagonal', 'one-cell', 'chord'] as Kind[]) {
    const list = of(k)
    console.log(`\n  ── ${k.toUpperCase()} (${list.length}) — every row, for hand-reading —`)
    for (const r of list) {
      console.log(`\n     ${r.doc}  head=${r.head}  via=${r.via}  steps=${r.steps}`)
      console.log(`     mini      : ${JSON.stringify(r.mini)}`)
      console.log(`     lanes     : ${JSON.stringify(r.lanes)}`)
      console.log(`     hits/lane : ${JSON.stringify(r.hitsPerLane)}  total=${r.totalHits}`)
      console.log(`     roll would accept: ${r.siblingAccepts}`)
      console.log(`     statement : ${JSON.stringify(r.statement.replace(/\s+/g, ' '))}`)
    }
  }

  // CONTROL: `ordinary` must dominate. A signature that buckets most of a real
  // drum corpus as wrong-kind is measuring its own threshold, not the corpus.
  console.log(`\n  — ORDINARY sample (control: these must read as real patterns) —`)
  for (const r of of('ordinary').slice(0, 12)) {
    console.log(`     ${r.doc.padEnd(34)} lanes=${JSON.stringify(r.lanes).slice(0, 60)} hits=${JSON.stringify(r.hitsPerLane).slice(0, 40)}`)
  }

  return { rows, rollUnstructured, served, rollServed, skippedNoModel, of, a, ceiling, ceiling3, target }
}

describe('#1256 — what kind of view the accepted units are drawn as', () => {
  // ⚠ RUNS FIRST AND EVERYTHING BELOW DEPENDS ON IT. The structure predicate is
  // copied out of another test file, so before it is used to size anything it
  // has to be shown to BE that rule. Replayed over the census's own 1,273
  // committed rows against its published `coreStructured` column.
  it('CALIBRATION — the copied predicate reproduces the committed census exactly', () => {
    const rows = (census as { rows: { mini: string; surface: 'step' | 'roll'; coreStructured: boolean }[] }).rows
    let agree = 0
    let disagree = 0
    const examples: string[] = []
    for (const r of rows) {
      const parsed = r.surface === 'roll' ? parsePianoRollCore(r.mini) : parseStepGridCore(r.mini)
      const mine = parsed.ok ? hasStructure(parsed.model, r.surface) : false
      if (mine === r.coreStructured) agree++
      else {
        disagree++
        if (examples.length < 10) {
          examples.push(`${r.surface} mine=${mine} census=${r.coreStructured} :: ${JSON.stringify(r.mini.slice(0, 60))}`)
        }
      }
    }
    console.log(`\n  CALIBRATION over ${rows.length} committed census rows`)
    console.log(`    agree    : ${agree}`)
    console.log(`    disagree : ${disagree}`)
    for (const e of examples) console.log(`      ⚠ ${e}`)
    // Non-vacuity: the column must contain BOTH answers, or agreement is free.
    const trues = rows.filter((r) => r.coreStructured).length
    console.log(`    census column: ${trues} structured / ${rows.length - trues} not`)
    expect(trues).toBeGreaterThan(0)
    expect(rows.length - trues).toBeGreaterThan(0)
    expect(disagree).toBe(0)
  })

  it('vendored corpus', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.strudel')).sort()
    const docs = files.map((f) => ({ name: f, code: fs.readFileSync(path.join(dir, f), 'utf8') }))
    const r = report('VENDORED CORPUS', docs)
    expect(docs.length).toBeGreaterThan(0)
    expect(r.skippedNoModel).toBe(0)
    // The buckets partition the grid population exactly — no row counted twice,
    // none dropped.
    expect(r.of('ordinary').length + r.of('diagonal').length + r.of('one-cell').length + r.of('chord').length)
      .toBe(r.rows.length)
    // Non-vacuity: the signature must find real drum patterns, or every
    // wrong-kind count below is a claim about an empty instrument.
    expect(r.of('ordinary').length).toBeGreaterThan(0)
  })

  it('150 real Bakery tunes', async () => {
    const docs = await loadCorpus()
    const r = report('150 REAL TUNES', docs)
    expect(docs.length).toBe(150)
    expect(r.skippedNoModel).toBe(0)
    // The four pools must partition the musical units — otherwise the ceiling
    // arithmetic above is over a population that was counted twice.
    expect(r.a.uStructural + r.a.uBroken + r.a.uKnobs + r.a.uCode).toBe(r.a.totalUnits)
    // Term 3 must actually bite, or every conclusion drawn from it is about an
    // empty set — and it must not swallow the whole population either.
    expect(r.rollUnstructured.length + r.rows.filter((x) => !x.structured).length).toBeGreaterThan(0)
    expect(r.rows.filter((x) => x.structured).length).toBeGreaterThan(0)
    expect(r.of('ordinary').length + r.of('diagonal').length + r.of('one-cell').length + r.of('chord').length)
      .toBe(r.rows.length)
    expect(r.of('ordinary').length).toBeGreaterThan(0)
  })
})
