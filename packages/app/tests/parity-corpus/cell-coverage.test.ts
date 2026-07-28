/**
 * cell-coverage.test.ts — the step grid DRAWS a note across the columns it covers
 * (#1056, Resolution Phase 3).
 *
 * WHY THIS GATE EXISTS, and why it is not `cell-duration.test.ts`. That gate asserts the
 * cell carries a length the engine played; this one asserts the panel turns that length
 * into columns. They are different subjects and they failed independently: the length
 * has been read (P4b) and preserved (P4c) since #1010 and was still invisible, because
 * every visual property of a cell derived from `isCellOn` and a sustained column is
 * `false` — `bd _ sd ~` and `bd ~ sd ~` drew an IDENTICAL picture ([[PV245]]).
 *
 * WHAT IS AND IS NOT CIRCULAR HERE — stated because the issue's first wording asked for
 * a comparison that could only agree with itself. Coverage is DERIVED from the cell
 * length, so re-checking a derived path's coverage against the haps it descends from
 * proves nothing. Four arms are real, and they are real in different ways:
 *   - SYNTACTIC path: lengths come from the AST slot span and never touch the engine, so
 *     an engine comparison is fully independent. Covers 3931 of 6207 drawn columns.
 *   - The DISTRIBUTION arithmetic on every path: conservation, disjointness, and the
 *     room rule are properties of `laneCoverage` alone, not of the length it was handed.
 *   - THE WRITER, reached through TEXT: `sustainTokens` answers the same covered-columns
 *     question in its own loop and spells it `_`, so comparing against the serialized
 *     document puts `laneCoverage` on one side of the comparison only. This is the arm
 *     that is non-circular on the DERIVED paths too, and it runs in both directions
 *     across two tests — see each for the direction it can and cannot see.
 *   - RESOLUTION INVARIANCE, on the shipped ×2 op: what the user sees must not change
 *     when the grid is viewed twice as fine.
 * Reported separately rather than pooled into one green.
 *
 * THE CONTROL ARM THE PHASE OWES ([[PV232]] — a control must be reported, not assumed).
 * #1056's "at 1× the layout is identical" is asserted STRUCTURALLY, not sampled: the
 * set of columns that are a coverage HEAD is exactly the set of ON cells, corpus-wide.
 * That is what makes this change additive — it can light columns that were dark and
 * narrow a bar that was full, and it can never move, add or drop a trigger.
 *
 * AND THE GATE MUST BE ABLE TO FIRE ([[P353]]): a degenerate coverage that draws every
 * note as exactly its own full column — which is precisely the pre-#1056 behaviour — is
 * run through the same comparisons and MUST be caught. If it is not, the phase changed
 * nothing.
 *
 * THE k = 2 / k = 4 ARMS the issue asks for run here, on `scaleStepGrid(m, 'double')` —
 * the SHIPPED ×2 op, which doubles the column count and every cell length exactly as a
 * finer view would. They were first reported as blocked on #1055's view multiple; that
 * was one option too many. When #1055 lands, its parameter is a second input to the same
 * comparison, not a reason this one could not be made.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import { parseStepGrid, parseStepGridCore, parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import { serializeStepGrid } from '../../../editor/src/visualEdit/notation/serialize'
import { scaleStepGrid } from '../../../editor/src/visualEdit/notation/resolution'
import { isCellOn, laneCoverage } from '../../../editor/src/visualEdit/notation/model'
import type { StepCell, StepGridModel } from '../../../editor/src/visualEdit/notation/model'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = [...new Set(corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== ''))]

/** hap bounds are Fraction→float: a note lasting its column arrives as 0.999…8 too */
const EPS = 1e-9

/** what the ENGINE sounded: per token, the [begin, end) intervals in COLUMNS */
function playedSpans(mini: string, perBar: number, bars: number): Map<string, [number, number][]> | null {
  let pat: unknown
  try {
    pat = reifyMini(mini)
  } catch {
    return null
  }
  const out = new Map<string, [number, number][]>()
  for (let cyc = 0; cyc < bars; cyc++) {
    let haps: Array<{
      hasOnset?: () => boolean
      whole?: { begin: { valueOf(): number }; end: { valueOf(): number } }
      value: unknown
    }>
    try {
      haps = (pat as { queryArc(a: number, b: number): typeof haps }).queryArc(cyc, cyc + 1)
    } catch {
      return null
    }
    for (const h of haps) {
      if (!(h.hasOnset?.() ?? false) || !h.whole) continue
      const v = h.value
      // the token as the reader spells it: a string, or a `:`-variant's ARRAY (#1019)
      const token = typeof v === 'string' ? v : Array.isArray(v) ? v.join(':') : null
      if (token === null) continue
      const begin = (h.whole.begin.valueOf() - cyc) * perBar + cyc * perBar
      const end = (h.whole.end.valueOf() - cyc) * perBar + cyc * perBar
      out.set(token, [...(out.get(token) ?? []), [begin, end]])
    }
  }
  return out
}

/** the syntactic path names a lane by its SOURCE bytes; the engine hands back members */
const normalizeToken = (token: string): string =>
  token
    .split(':')
    .map((part) => (part !== '' && !Number.isNaN(Number(part)) ? String(Number(part)) : part))
    .join(':')

/**
 * The degenerate reader the control arm runs: every trigger draws exactly its own full
 * column and nothing carries — i.e. what the grid did before this phase.
 */
function flatCoverage(cells: StepCell[]): ({ start: number; extent: number } | undefined)[] {
  return cells.map((c, i) => (isCellOn(c) ? { start: i, extent: 1 } : undefined))
}

interface Unit {
  mini: string
  model: StepGridModel
  spans: Map<string, [number, number][]>
  perBar: number
  path: 'syntactic' | 'derived' | 'derived+leaf'
}

const units: Unit[] = []
for (const mini of minis) {
  const r = parseStepGrid(mini)
  if (!r.ok) continue
  const bars = Math.max(1, r.model.bars ?? 1)
  const perBar = r.model.steps / bars
  if (!Number.isInteger(perBar) || perBar <= 0) continue
  const spans = playedSpans(mini, perBar, bars)
  if (spans === null) continue
  units.push({
    mini,
    model: r.model,
    spans,
    perBar,
    path: parseStepGridCore(mini).ok ? 'syntactic' : r.model.leafSource ? 'derived+leaf' : 'derived',
  })
}

describe('the step grid draws a note across the columns it covers (#1056)', () => {
  it('CONTROL — at 1× every trigger is still exactly one head: no note moves, appears or vanishes', () => {
    // The phase's own "the layout is identical" claim, asserted structurally over the
    // whole corpus rather than eyeballed on a fixture. A head is `cov.start === c`, and
    // it must coincide with `isCellOn` cell for cell.
    let heads = 0
    let cells = 0
    const bad: string[] = []
    for (const u of units) {
      for (const lane of u.model.lanes) {
        const cov = laneCoverage(lane.cells, u.model.steps)
        lane.cells.forEach((cell, c) => {
          const isHead = cov[c] !== undefined && cov[c]!.start === c
          if (isCellOn(cell)) cells++
          if (isHead) heads++
          if (isHead !== isCellOn(cell)) {
            bad.push(`${u.mini} lane=${lane.sound} col=${c} head=${isHead} on=${isCellOn(cell)}`)
          }
        })
      }
    }
    console.log(
      `\n===== #1056 COVERAGE =====\n` +
        `  units   ${units.length}\n` +
        `  ON cells ${cells}   heads ${heads}`,
    )
    expect(bad.slice(0, 8), 'a coverage head must be exactly a trigger — the trigger layout is untouched').toEqual([])
    expect(heads).toBe(cells)
  })

  it('the drawing is CONSERVATIVE and DISJOINT — every note draws the time it has, once', () => {
    // Properties of `laneCoverage` alone, so they hold on every read path: the extents a
    // note contributes sum to the time it actually occupies (its length, or the room it
    // has when the next hit or the grid end cuts it short), and no column is drawn twice.
    const bad: string[] = []
    let carried = 0 // columns lit that are NOT the trigger's own — the phase's new pixels
    let partial = 0 // columns drawn narrower than full — the sub-column case
    for (const u of units) {
      const steps = u.model.steps
      for (const lane of u.model.lanes) {
        const cov = laneCoverage(lane.cells, steps)
        const perNote = new Map<number, number>()
        cov.forEach((cv, c) => {
          if (!cv) return
          if (cv.start !== c) carried++
          if (Math.abs(cv.extent - 1) > EPS) partial++
          if (cv.extent < 0 || cv.extent > 1 + EPS) bad.push(`${u.mini} col=${c} extent=${cv.extent}`)
          perNote.set(cv.start, (perNote.get(cv.start) ?? 0) + cv.extent)
        })
        for (const [start, drawn] of perNote) {
          const cell = lane.cells[start]
          if (!isCellOn(cell)) {
            bad.push(`${u.mini} col=${start} coverage with no trigger`)
            continue
          }
          // the room rule, read the way `clampLane` enforces it
          let next = start + 1
          while (next < lane.cells.length && !isCellOn(lane.cells[next])) next++
          const room = Math.min(next, steps) - start
          const want = Math.max(0, Math.min(cell.duration, room))
          if (Math.abs(drawn - want) > 1e-6) {
            bad.push(`${u.mini} lane=${lane.sound} col=${start} drawn=${drawn} want=${want}`)
          }
        }
      }
    }
    console.log(`  carried columns ${carried}   partial columns ${partial}`)
    expect(bad.slice(0, 8), 'a note must draw exactly the time it occupies, and no column twice').toEqual([])
    // The phase is only real if it changed the picture, so the size of the change is
    // PINNED rather than asserted non-zero: a regression that quietly reverts to
    // one-box-per-trigger fails here instead of going green over nothing ([[P353]]).
    //
    // 1489 columns are lit that were dark before, and 12 are drawn narrower than a full
    // column (8 heads — genuinely sub-column notes — and 4 tails of a fractional length).
    // Both figures moved once during this phase, from 1550/73, when the float-sliver rule
    // below was added; the 61 removed are the same 61 in each, which is what says they
    // were one cause and not a drift.
    expect(carried).toBe(1489)
    expect(partial).toBe(12)
  })

  it('SYNTACTIC path — every column the grid lights, the engine was sounding that voice', () => {
    // The independent arm: on this path the length comes from the AST slot span and the
    // engine is never consulted, so agreement is evidence rather than restatement. The
    // derived paths are reported alongside but carry the circularity noted in the header.
    const bad: string[] = []
    const checked = new Map<string, number>()
    for (const u of units) {
      for (const lane of u.model.lanes) {
        const cov = laneCoverage(lane.cells, u.model.steps)
        const spans = u.spans.get(lane.sound) ?? u.spans.get(normalizeToken(lane.sound)) ?? []
        cov.forEach((cv, c) => {
          if (!cv) return
          checked.set(u.path, (checked.get(u.path) ?? 0) + 1)
          if (u.path !== 'syntactic') return
          // the drawn slice of this column, in column units
          const from = c
          const to = c + cv.extent
          const sounded = spans.some(([b, e]) => b <= from + EPS && to <= e + EPS)
          if (!sounded) {
            bad.push(
              `${JSON.stringify(u.mini).slice(0, 60)} ${lane.sound} col=${c} ` +
                `drawn=[${from},${to.toFixed(4)}] played=[${spans.map(([b, e]) => `${b}-${e}`).join(' ')}]`,
            )
          }
        })
      }
    }
    console.log(`  columns checked by path: ${[...checked].map(([k, v]) => `${k} ${v}`).join(', ')}`)
    for (const b of bad.slice(0, 10)) console.log(`  UNSOUNDED ${b}`)
    expect(bad.slice(0, 8), 'the grid lit a column the pattern was not sounding that voice through').toEqual([])
  })

  it('CONTROL — a reader that draws every note as one full column is caught', () => {
    // The pre-#1056 behaviour, run through the same conservation comparison. If this
    // passes, the gate above cannot distinguish the new drawing from the old one.
    let caught = 0
    for (const u of units) {
      const steps = u.model.steps
      let any = false
      for (const lane of u.model.lanes) {
        const cov = flatCoverage(lane.cells)
        const perNote = new Map<number, number>()
        cov.forEach((cv, c) => {
          if (cv) perNote.set(cv.start, (perNote.get(cv.start) ?? 0) + cv.extent)
        })
        for (const [start, drawn] of perNote) {
          const cell = lane.cells[start]
          if (!isCellOn(cell)) continue
          let next = start + 1
          while (next < lane.cells.length && !isCellOn(lane.cells[next])) next++
          const room = Math.min(next, steps) - start
          const want = Math.max(0, Math.min(cell.duration, room))
          if (Math.abs(drawn - want) > 1e-6) any = true
        }
      }
      if (any) caught++
    }
    console.log(`  degenerate (one-box-per-trigger) reader caught on ${caught} units`)
    expect(caught, 'the old drawing must fail the new gate, or the gate is not testing the change').toBeGreaterThan(0)

    // and on a NAMED unit, so the control cannot pass by accident of aggregation:
    // `bd [sd sd sd]` gives `bd` three of six columns — one box is not that.
    const r = parseStepGrid('bd [sd sd sd]')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const bd = r.model.lanes.find((l) => l.sound === 'bd')!
    const cov = laneCoverage(bd.cells, r.model.steps)
    expect(cov.filter((c) => c !== undefined).length).toBe(3)
    expect(cov[0]).toEqual({ start: 0, extent: 1 })
    expect(cov[1]).toEqual({ start: 0, extent: 1 })
    expect(cov[2]).toEqual({ start: 0, extent: 1 })
    expect(flatCoverage(bd.cells).filter((c) => c !== undefined).length).toBe(1)
  })

  it('the sub-column case draws a PARTIAL column, which is the one thing the roll never needs', () => {
    // The roll's `@n` is integral by construction, so a fractional extent is grid-only —
    // the axis this phase adds that could not be borrowed from the sibling surface.
    //
    // FIXTURE TAKEN FROM THE CORPUS, NOT FROM A COMMENT. The obvious candidate is
    // `[hh ~]!16`, quoted for exactly this property in `cell-duration.test.ts` — but the
    // same comment lists it among the units P4c STOPPED offering a grid view for, so it
    // no longer parses and the assertion would have been vacuous. Resolve a
    // cross-reference against its own source ([[P382]]).
    const r = parseStepGrid('<bd - - -> *2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const lane = r.model.lanes[0]
    const cov = laneCoverage(lane.cells, r.model.steps)
    expect(cov[0]?.extent).toBeCloseTo(0.5, 9)
    expect(cov[0]?.start).toBe(0)
  })

  it('k = 2 and k = 4 — the drawing is resolution-generic, on the SHIPPED ×2 op', () => {
    // #1056 asks for these arms and they were first reported as blocked on #1055's view
    // multiple. That was one option too many: `scaleStepGrid(model, 'double')` already
    // ships, already doubles both the column count and every cell length, and is exactly
    // the input a k = 2 view would hand the renderer. Measuring at a shipped op is also
    // the only honest way to do it — a figure taken at a constant nothing ships at
    // describes a build that does not exist ([[PK67]]).
    //
    // THE PROPERTY: doubling the resolution must not change what the user sees. Each
    // note draws twice the columns of half the width, so its TOTAL drawn time is
    // invariant in cycles and exactly doubles in columns, and every head lands on twice
    // its old index. A renderer that lit "the note's column" rather than the note's TIME
    // would keep a total of 1 across the doubling and fail here.
    let doubled = 0
    let quadrupled = 0
    let skipped = 0
    const bad: string[] = []

    const drawn = (m: StepGridModel): Map<string, { total: number; heads: number[] }> => {
      const out = new Map<string, { total: number; heads: number[] }>()
      m.lanes.forEach((lane, li) => {
        const cov = laneCoverage(lane.cells, m.steps)
        let total = 0
        const heads: number[] = []
        cov.forEach((cv, c) => {
          if (!cv) return
          total += cv.extent
          if (cv.start === c) heads.push(c)
        })
        out.set(`${li}:${lane.sound}`, { total, heads })
      })
      return out
    }

    for (const u of units) {
      const x1 = u.model
      const x2 = scaleStepGrid(x1, 'double')
      // POPULATION, NAMED: `scaleStepGrid` returns the model unchanged when the writer
      // cannot spell the result, so this arm asks only about grids that really can be
      // viewed at 2× today. Counted rather than filtered away in silence ([[P345]]).
      if (x2 === x1) {
        skipped++
        continue
      }
      doubled++
      const a = drawn(x1)
      const b = drawn(x2)
      for (const [key, one] of a) {
        const two = b.get(key)
        if (!two) {
          bad.push(`${u.mini} ${key} lane vanished at 2x`)
          continue
        }
        if (Math.abs(two.total - one.total * 2) > 1e-6) {
          bad.push(`${u.mini} ${key} total ${one.total} -> ${two.total} (want ${one.total * 2})`)
        }
        const want = one.heads.map((h) => h * 2)
        if (JSON.stringify(two.heads) !== JSON.stringify(want)) {
          bad.push(`${u.mini} ${key} heads ${JSON.stringify(two.heads)} want ${JSON.stringify(want)}`)
        }
      }

      const x4 = scaleStepGrid(x2, 'double')
      if (x4 === x2) continue
      quadrupled++
      const c4 = drawn(x4)
      for (const [key, one] of a) {
        const four = c4.get(key)
        if (!four) continue
        if (Math.abs(four.total - one.total * 4) > 1e-6) {
          bad.push(`${u.mini} ${key} total@4x ${one.total} -> ${four.total}`)
        }
      }
    }
    console.log(`  k=2 on ${doubled} units, k=4 on ${quadrupled}, not viewable at 2x ${skipped}`)
    for (const b of bad.slice(0, 8)) console.log(`  DRIFT ${b}`)
    expect(bad.slice(0, 8), 'the drawn time must be invariant under a resolution change').toEqual([])
    expect(doubled).toBeGreaterThan(0)
    expect(quadrupled).toBeGreaterThan(0)
  })

  it('THE WRITER AGREES — the carried columns are the ones the document spells `_`', () => {
    // THE ARM THAT IS NOT CIRCULAR, and it took two tries to get there. The comparison
    // must reach a source that `laneCoverage` had no hand in, so it reads the SERIALIZED
    // TEXT and takes the `_` positions straight out of it. `_` is the printer's own
    // answer to the same question, computed in its own loop (`sustainTokens`, which
    // builds a `covered[]` array from `Math.round(n.duration)`), and #1056 named exactly
    // this as the point: "the sustain already has a spelling in the writer, so the visual
    // has a document counterpart to stay honest against."
    //
    // THE FIRST VERSION OF THIS ARM WAS A TAUTOLOGY AND IS RECORDED AS ONE. It round-
    // tripped the model and compared the picture before against the picture after — but
    // built BOTH pictures with `laneCoverage`, so breaking the coverage rule broke both
    // sides identically and the arm stayed green while four others went red. A gate whose
    // two sides share the code under test cannot fail ([[P381]]/[[P370]]); it was caught
    // by running the red-test and noticing which arms did NOT fire, which is the only
    // reason it is not still sitting here reading green.
    //
    // SUSTAIN IS A PER-COLUMN FACT, NOT A PER-LANE ONE — and getting that wrong is what
    // made the first population useless. Restricting to single-lane models left 357 units
    // containing ZERO `_` between them, because `bd _ sd ~` is TWO lanes sharing one token
    // sequence: the thing being compared had been defined out of the population, and the
    // arm read green over 357 units of nothing. Measured before being believed.
    //
    // POPULATION, BOUNDED AND NAMED: models whose serialization is one flat token sequence
    // of exactly `steps` tokens — any number of lanes, since a column's token is shared.
    // Excluded are stacked parts and nested groups, which spell a column across several
    // tokens; inferring which token is which column would mean re-implementing the reader,
    // a second oracle and exactly what this arm exists to avoid. Sizes printed, including
    // how many sustains the population actually contains, so a repeat of the vacuous
    // version fails loudly instead of reading green.
    let compared = 0
    let outOfShape = 0
    let declined = 0
    let sustains = 0
    const bad: string[] = []
    for (const u of units) {
      const m = u.model
      const text = serializeStepGrid(m)
      if (text === null) {
        declined++
        continue
      }
      // FLATNESS HAS TO BE CHECKED ON THE SYNTAX, NOT THE TOKEN COUNT. Splitting on
      // whitespace and counting was not enough: `[a4,c#4,e4],[~ f#6 e6]` happens to yield
      // `steps` pieces, and the pieces are fragments like `e6]` rather than columns. Any
      // grouping, stacking or operator character means a column is not one token here.
      const tokens = text.trim().split(/\s+/)
      if (/[[\]{}<>,*!@/]/.test(text) || tokens.length !== m.steps) {
        outOfShape++
        continue
      }
      compared++
      // a column is carried if ANY lane's note is sounding through it
      const covs = m.lanes.map((lane) => laneCoverage(lane.cells, m.steps))
      const spelledSustain = tokens.map((t) => t === '_')
      sustains += spelledSustain.filter(Boolean).length
      for (let c = 0; c < m.steps; c++) {
        const drewCarried = covs.some((cov) => cov[c] !== undefined && cov[c]!.start !== c)
        if (drewCarried !== spelledSustain[c]) {
          bad.push(
            `${JSON.stringify(u.mini).slice(0, 50)} col=${c} drew=${drewCarried ? 'carried' : 'not'} ` +
              `document=${JSON.stringify(tokens[c])}`,
          )
        }
      }
    }
    console.log(
      `  writer agreement: compared ${compared} units (${sustains} sustain tokens), ` +
        `not one flat sequence ${outOfShape}, writer declined ${declined}`,
    )
    for (const b of bad.slice(0, 6)) console.log(`  DISAGREE ${b}`)
    expect(bad.slice(0, 6), 'a column the grid draws as carried must be a column the file spells `_`').toEqual([])
    expect(compared).toBeGreaterThan(0)
    // WHAT THIS ARM CANNOT CATCH, measured rather than left to the reader. The flat
    // population contains ZERO `_`: every carried column in this corpus lives in a mini
    // whose serialization is grouped or stacked, and those are excluded above because a
    // column is not one token in them. So at corpus scale this proves only that the grid
    // never draws a carry the document does not have — the over-draw direction. Failing
    // to draw one it DOES have is the other half, and is covered by the fixture arm
    // below, on minis that actually carry a sustain. Pinned so that if the corpus ever
    // gains flat sustain material this comment stops being true out loud.
    expect(sustains, 'if this is no longer 0, widen the assertion — the arm just got stronger').toBe(0)
  })

  it('THE WRITER AGREES, the other direction — a `_` in the document is a carried column', () => {
    // The half the corpus arm structurally cannot reach. These minis DO carry a sustain,
    // and each is checked against the writer's own spelling of it: the drawn carry set
    // must be exactly the `_` positions in the serialized text. `laneCoverage` is on one
    // side of this comparison only — the other side is `sustainTokens`' independent
    // `covered[]` loop, reached through text.
    const cases: Array<[string, string[]]> = [
      // mini, expected per-lane picture (# head, = carried, - empty)
      ['bd _ sd ~', ['bd:#=--', 'sd:--#-']],
      ['bd _ _ sd', ['bd:#==-', 'sd:---#']],
      ['hh hh bd _', ['hh:##--', 'bd:--#=']],
    ]
    for (const [mini, want] of cases) {
      const r = parseStepGrid(mini)
      expect(r.ok, `${mini} should open a grid`).toBe(true)
      if (!r.ok) continue
      const m = r.model
      const got = m.lanes.map((lane) => {
        const cov = laneCoverage(lane.cells, m.steps)
        return `${lane.sound}:${lane.cells.map((_, c) => (!cov[c] ? '-' : cov[c]!.start === c ? '#' : '=')).join('')}`
      })
      expect(got, `${mini} drawn`).toEqual(want)

      // and the document says the same thing, in its own vocabulary
      const text = serializeStepGrid(m)
      expect(text, `${mini} must round-trip`).not.toBeNull()
      const tokens = text!.trim().split(/\s+/)
      expect(tokens.length).toBe(m.steps)
      const spelled = tokens.map((t) => t === '_')
      for (let c = 0; c < m.steps; c++) {
        const drew = m.lanes.some((lane) => {
          const cov = laneCoverage(lane.cells, m.steps)
          return cov[c] !== undefined && cov[c]!.start !== c
        })
        expect(drew, `${mini} col=${c} — drawn carry vs document ${JSON.stringify(tokens[c])}`).toBe(spelled[c])
      }
    }
  })

  it('THE ROLL — already draws length, so this phase is a no-op there; measured, not assumed', () => {
    // #1056 warns that "a change that buys the grid something and the roll nothing has
    // happened repeatedly here, and the reverse would be more surprising still". This is
    // the reverse case, so it gets a number rather than a reading of the code.
    //
    // The roll's cell is drawn from `noteAt(model, midi, step)`, which covers
    // `start <= step < start + duration` and dims a non-head with `opacity 0.7` — the
    // vocabulary the grid has just adopted. Two things could still make it a non-no-op:
    // a note whose coverage the roll's integer walk gets wrong, or a FRACTIONAL duration
    // it has no way to draw. Both are counted.
    let notes = 0
    let integral = 0
    let invisible = 0 // drawn in NO column at all
    let misdrawn = 0 // drawn, but not for the time it sounds (either way)
    let rolls = 0
    const affected = new Set<string>()
    for (const mini of minis) {
      const r = parsePianoRoll(mini)
      if (!r.ok) continue
      rolls++
      for (const n of r.model.notes) {
        notes++
        // what the roll's own predicate lights for this note
        let lit = 0
        for (let s = 0; s < r.model.steps; s++) {
          if (n.start <= s && s < n.start + n.duration) lit++
        }
        const want = Math.max(0, Math.min(n.duration, r.model.steps - n.start))
        if (Math.abs(lit - want) < EPS) {
          integral++
          continue
        }
        affected.add(mini)
        if (lit === 0) invisible++
        else misdrawn++
      }
    }
    console.log(
      `  ROLL: ${rolls} models, ${notes} notes — exact ${integral}, ` +
        `invisible ${invisible}, misdrawn ${misdrawn}, in ${affected.size} minis`,
    )
    // NO-OP CONFIRMED FOR THE COVERAGE WALK, AND REFUTED FOR FRACTIONS. The roll's
    // `noteAt` already covers `start <= step < start + duration` and already dims a
    // non-head, so 4825 of 4842 notes need nothing from this phase — that half of the
    // prediction holds.
    //
    // The other half did not, and #1056 asked for it to be measured rather than inferred
    // precisely because "the reverse would be more surprising still". `RollNote.duration`
    // is documented as counting whole `@n` steps; the corpus disagrees on 17 notes across
    // 4 minis, and the mechanism is one — `noteAt` tests an INTEGER step against the
    // half-open span `[start, start + duration)` — with two outcomes:
    //   - 7 are drawn in NO column at all. `f4` at start 0.5 for 0.5 spans `[0.5, 1.0)`,
    //     which contains no integer, so the note is simply not there.
    //   - 10 are drawn for the wrong length, in BOTH directions: `[b3,e4,g4]@0.75` gets a
    //     whole column for three quarters of one, and `c#2` at 13.5 for 2.5 columns gets
    //     two. So this is not a rounding convention — it is the absence of a partial
    //     column, which is exactly what the grid gained here.
    // The split was hand-derived as 9/8 first and measured at 7/10; the two that moved are
    // long fractional notes, which read as "overdrawn" until the direction is checked.
    //
    // PRE-EXISTING and untouched by this phase — nothing here changes `parse.ts` or the
    // roll panel. Filed separately rather than widened into this one; the fix wants the
    // grid's `laneCoverage` rule shared across both surfaces, which is #1032's direction.
    expect(integral + invisible + misdrawn).toBe(notes)
    expect(integral).toBe(4825)
    expect(invisible).toBe(7)
    expect(misdrawn).toBe(10)
    expect(affected.size).toBe(4)
  })

  it('a note that fills its column exactly does not claim the next one (float slivers)', () => {
    // The defect this file caught before it shipped. `1.0000000000000004` is what "one
    // column" arrives as after Fraction→float, and the first draft carried it into the
    // next column at an extent of 4e-16 — an invisible bar in a column the pattern never
    // sounds through, on real corpus material.
    const sliver: StepCell[] = [{ duration: 1.0000000000000004 }, false, false, false]
    const cov = laneCoverage(sliver, 4)
    expect(cov[0]).toEqual({ start: 0, extent: 1 })
    expect(cov[1], 'a 4e-16 remainder is not a column').toBeUndefined()

    // and the threshold is nowhere near a REAL sub-column value — the smallest the
    // corpus carries is 0.5, nine orders of magnitude away.
    const real = laneCoverage([{ duration: 1.5 }, false], 2)
    expect(real[1]?.extent).toBeCloseTo(0.5, 9)
  })
})
