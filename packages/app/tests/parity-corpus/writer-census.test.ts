/**
 * writer-census.test.ts — WHICH WRITER SERVES EACH SURFACE-ASK, and what would
 * serve it if the syntactic core were deleted (#1009, epic #1007 phase P3).
 *
 * ── THE QUESTION ──────────────────────────────────────────────────────────────
 * `notation/parse.ts`'s syntactic core (M2 — krill AST → cells) is the largest
 * block of meaning re-derivation left in the editing path. It cannot simply be
 * deleted: it serves surface-asks that NEITHER derived projection serves, and
 * deleting it today deletes those views. So the question is not "can we remove
 * it" but "how much of its reach TRANSFERS to the derived projections" — and the
 * answer has to be per ask, because an aggregate that stays flat hides a large
 * re-routing in both directions ([[PK58]]).
 *
 * ── THE MEASUREMENT IS A COUNTERFACTUAL, RUN AS EQUAL-AND-OPPOSITE MOVES ──────
 * For every ask the core serves, BOTH writers are put through the SAME edit probe
 * (`engineEditOracle.ts`, the one `writer-reach.test.ts` uses):
 *
 *   incumbent    — the core's own model. VERIFIED, never assumed: an ask whose
 *                  core edit corrupts was never reach on either side, and
 *                  charging it to the projection would be a free win for the
 *                  incumbent.
 *   counterfactual — `project{StepGrid,PianoRoll}Derived`, the real writer chain
 *                  below the core, asked in the real order. Never re-derived
 *                  here: the order is the contract and a local copy of it is a
 *                  second oracle ([[PV192]]).
 *
 * ── WHAT IS COUNTED, AND WHAT IS DELIBERATELY NOT ─────────────────────────────
 * Four outcomes per ask, and the third is not a failure:
 *   transfers        — a derived writer opens it AND the edit survives the engine
 *   no-view          — no derived writer opens it at all (untransferable, parse)
 *   view-corrupts    — a derived writer opens it and the edit corrupts
 *                      (untransferable, edit — and the worse of the two, because
 *                      the view looks fine)
 *   no-probe         — opened, but no clean single-note delete exists. UNVERIFIED,
 *                      neither transferred nor untransferable ([[PK59]] step 5).
 *
 * ── WHY THE ASK COUNT IS NOT A MINI COUNT ─────────────────────────────────────
 * A mini can be core-served on BOTH surfaces, so 2 asks can be 1 string. Both
 * figures are printed and the distinct-mini count is the one to quote when the
 * question is "how much TEXT loses its view" ([[PV231]] clause 3).
 *
 * ── THE ASSERTIONS ────────────────────────────────────────────────────────────
 * The denominator is pinned to `writer-reach`'s complement (803 grid / 414 roll,
 * both derived from the same corpus by the same core functions), so this census
 * and that gate cannot drift apart silently. The transfer figures are pinned as
 * a BAND, not a floor: this is a measurement, and a number that moves in either
 * direction is a finding either way.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import {
  parseStepGrid,
  parseStepGridCore,
  parsePianoRoll,
  parsePianoRollCore,
  projectStepGridDerived,
  projectPianoRollDerived,
  tailToken,
} from '../../../editor/src/visualEdit/notation/parse'
import type {
  ParseResult,
  PianoRollModel,
  StepGridModel,
} from '../../../editor/src/visualEdit/notation/model'
import {
  GRID_SURFACE,
  ROLL_SURFACE,
  probeEdit,
  type NoProbeReason,
  type Surface as EditSurface,
} from './engineEditOracle'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/**
 * What `projectXDerived` should say when nothing below the core opened the ask.
 *
 * In the census's world the core SUCCEEDED, so there is no core refusal to report
 * — and `refused` returns the passed reason verbatim for `not-a-pattern`, which is
 * how a mini that will not reify at all shows up distinctly instead of borrowing
 * some other writer's gate.
 */
const NO_CORE_REFUSAL = { ok: false as const, reason: '(core served this — no refusal)' }

type Outcome = 'transfers' | 'no-view' | 'view-corrupts' | 'no-probe'
type Writer = 'leaf' | 'element'

interface Ask {
  mini: string
  surface: 'step' | 'roll'
  outcome: Outcome
  /** which derived writer answered, when one did */
  writer?: Writer
  /** the gate that stopped every derived writer, when none did */
  gate?: string
  /** why there was no clean probe, when that is the outcome */
  noProbe?: NoProbeReason
  /** whether the INCUMBENT (the core's own model) survives the same probe */
  coreProbe: 'ok' | 'corrupt' | 'no-probe'
  /** does the derived view have STRUCTURE — more than one cell/note ([[P338]] cl.2) */
  structured?: boolean
  /** does the derived view show the same shape the core's does */
  sameShape?: boolean
  /** the structural feature of the MINI, for classifying the residual by mechanism */
  shape: string
  /**
   * Does this mini play a `word:index` ARRAY value (krill's `bd:3`)?
   *
   * Recorded because it turned out to be the DOMINANT untransferable mechanism and
   * it is not structural: `readGridOnsets` names a string, a number and an `{s,n}`
   * object, and krill hands it `["bd", 3]` for a `:`-variant, which falls through
   * to `no-note-content`. Filed separately (#1019); split out here so this phase's
   * residual separates "the projection has a hole" from "the bijection genuinely
   * fails", which is the difference between a fix and a bound.
   */
  arrayValue: boolean
  /** does the CORE's own view have structure — i.e. is the view being lost worth keeping */
  coreStructured: boolean
}

/**
 * THE MECHANISM CLASSIFIER — a property of the mini's own text, asked
 * independently of any refusal label.
 *
 * The labels have overstated the opportunity every time they have been counted
 * ([[P328]]: the reason string names the wrong subsystem; [[P335]]: it names the
 * wrong size). So the residual is cross-tabbed against what the notation actually
 * IS, and the label is carried alongside rather than trusted.
 *
 * `shared-leaf` is first because it is the predicted dominant class: one source
 * atom that plays several onsets (`bd*2`, `bd!3`, `bd(3,8)`, `hh@2`) is exactly
 * where the cell↔leaf-span bijection fails ([[PV218]]) — the core models it
 * syntactically, a behaviour projection sees N onsets with one span to write to.
 * Order matters: the first matching clause wins, so a mini with both `*n` and a
 * `<…>` is filed under `shared-leaf`.
 */
function shapeOf(mini: string): string {
  const bare = mini.replace(/\s+/g, '')
  if (bare === '' || /^[~-]+$/.test(bare)) return 'rests-only'
  // one source atom, several onsets — the predicted dominant untransferable class
  if (/[*!@]\s*\d/.test(mini) || /\(\s*<?\d/.test(mini)) return 'shared-leaf'
  if (/\?/.test(mini)) return 'degrade-random'
  if (/<|>/.test(mini)) return 'alternation'
  if (/,/.test(mini)) return 'stack'
  if (/\[|\]/.test(mini)) return 'nested-group'
  if (/^[^\s]+$/.test(mini)) return 'single-atom'
  return 'flat-sequence'
}

/**
 * Does any hap this mini plays carry an ARRAY value?
 *
 * krill lowers `bd:3` to the value `["bd", 3]` — the sample-index pair a control
 * resolves. Asked of the ENGINE rather than by grepping for `:`, because `:` also
 * appears inside `sd:1:.5` and in note names, and a text test would be a second
 * oracle for a question the engine answers directly ([[PV192]]).
 *
 * PROBED OVER A WINDOW, not cycle 0. `<- cp:1>` rests in cycle 0 and plays its
 * `:`-variant in cycle 1, so a single-cycle probe classifies it as array-free and
 * files it under the structural residual — the window-dependence [[PV229]] names,
 * arriving here as a misclassification rather than a miscount. 24 cycles covers
 * every period the surface caps admit (max 12) with a doubling for confirmation.
 */
const ARRAY_PROBE_CYCLES = 24
function playsArrayValue(m: string): boolean {
  try {
    const pat = reifyMini(m) as { queryArc(a: number, b: number): { value: unknown }[] }
    for (let c = 0; c < ARRAY_PROBE_CYCLES; c++) {
      if (pat.queryArc(c, c + 1).some((h) => Array.isArray(h.value))) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * More than one cell / note — a one-cell view round-trips perfectly and is useless
 * ([[P338]] clause 2).
 *
 * The two surfaces get DIFFERENT predicates on purpose, and the asymmetry is worth
 * stating because it is easy to read as an oversight: the grid is a cell instrument,
 * so "useful" means more than one column with at least one hit in it; the roll is a
 * note instrument with no columns of its own to be empty, so "useful" means more
 * than one note. Applying the grid's predicate to the roll would count a
 * single-note roll spanning 16 steps as structured.
 */
function hasStructure(m: StepGridModel & PianoRollModel, key: 'step' | 'roll'): boolean {
  if (key === 'roll') return (m.notes?.length ?? 0) > 1
  const hits = m.lanes.reduce((n, l) => n + l.cells.filter(Boolean).length, 0)
  return m.steps > 1 && hits >= 1
}

const shapeKey = (m: StepGridModel & PianoRollModel, key: 'step' | 'roll'): string =>
  key === 'roll'
    ? `${m.steps}/${m.bars ?? 1}/${m.notes?.length ?? 0}`
    : `${m.steps}/${m.bars ?? 1}/${m.lanes.length}`

/**
 * The pattern's TRUE cycle period, probed from the engine — the independent answer
 * the `unstable-period` label is checked against.
 *
 * Probed to 48 cycles for a cap search to 24, so a period is only believed when at
 * least a doubling of it repeated ([[PV229]]: under-windowing returns a clean,
 * plausible, wrong number). 0 means aperiodic within that window, which is a
 * different fact from "past the cap" and is counted separately.
 */
function truePeriod(m: string): number {
  const key = (c: number): string => {
    try {
      const haps = (
        reifyMini(m) as {
          queryArc(
            a: number,
            b: number,
          ): { whole?: { begin: { valueOf(): number } }; value: unknown; hasOnset?: () => boolean }[]
        }
      ).queryArc(c, c + 1)
      return JSON.stringify(
        haps
          .filter((h) => (h.hasOnset?.() ?? false) && h.whole)
          .map((h) => [
            Math.round((h.whole!.begin.valueOf() - c) * 720720),
            JSON.stringify(h.value),
          ])
          .sort(),
      )
    } catch {
      return 'ERR'
    }
  }
  const keys = Array.from({ length: 48 }, (_, c) => key(c))
  for (let p = 1; p <= 24; p++) {
    let ok = true
    for (let c = p; c < keys.length; c++)
      if (keys[c] !== keys[c % p]) {
        ok = false
        break
      }
    if (ok) return p
  }
  return 0
}

interface Surface {
  key: 'step' | 'roll'
  core: (m: string) => ParseResult<StepGridModel | PianoRollModel>
  derived: (
    m: string,
    fallback: { ok: false; reason: string },
  ) => ParseResult<StepGridModel | PianoRollModel>
  edit: EditSurface
}

const SURFACES: Surface[] = [
  { key: 'step', core: parseStepGridCore, derived: projectStepGridDerived, edit: GRID_SURFACE },
  { key: 'roll', core: parsePianoRollCore, derived: projectPianoRollDerived, edit: ROLL_SURFACE },
]

function census(s: Surface): Ask[] {
  const out: Ask[] = []
  for (const mini of minis) {
    const core = s.core(mini)
    if (!core.ok) continue // the core does NOT serve this — that is writer-reach's population
    const coreModel = core.model as StepGridModel & PianoRollModel

    // THE INCUMBENT, MEASURED. Held to the same probe as the challenger, because
    // "the core serves it" is a parse claim and this census is about reach.
    const coreProbe = probeEdit(mini, coreModel, s.edit).verdict
    const shape = shapeOf(mini)
    const arrayValue = playsArrayValue(mini)
    const coreStructured = hasStructure(coreModel, s.key)

    const derived = s.derived(mini, NO_CORE_REFUSAL)
    if (!derived.ok) {
      out.push({
        mini,
        surface: s.key,
        outcome: 'no-view',
        // The `??` is DEFENSIVE — 0 rows over 1217 asks. `refused` returns the
        // fallback verbatim (gate-less) for `not-a-pattern`, which is reachable in
        // principle: the core parses syntactically and never reifies, so a mini it
        // accepts but `reifyMini` rejects would land here. The corpus contains none.
        gate: derived.gate ?? '(no gate — did not reify)',
        coreProbe,
        shape,
        arrayValue,
        coreStructured,
      })
      continue
    }
    const dm = derived.model as StepGridModel & PianoRollModel
    const writer: Writer = dm.leafSource ? 'leaf' : 'element'
    const structured = hasStructure(dm, s.key)
    const sameShape = shapeKey(dm, s.key) === shapeKey(coreModel, s.key)
    const probe = probeEdit(mini, dm, s.edit)
    out.push({
      mini,
      surface: s.key,
      outcome:
        probe.verdict === 'ok' ? 'transfers' : probe.verdict === 'corrupt' ? 'view-corrupts' : 'no-probe',
      writer,
      noProbe: probe.verdict === 'no-probe' ? probe.why : undefined,
      coreProbe,
      structured,
      sameShape,
      shape,
      arrayValue,
      coreStructured,
    })
  }
  return out
}

const tallyBy = <K extends string>(rows: Ask[], f: (a: Ask) => K | undefined): Map<K, number> => {
  const m = new Map<K, number>()
  for (const r of rows) {
    const k = f(r)
    if (k === undefined) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

const show = (m: Map<string, number>, pad = 5): string[] =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `     ${String(v).padStart(pad)}  ${k}`)

function report(name: string, rows: Ask[]): void {
  const n = rows.length
  const by = (o: Outcome) => rows.filter((r) => r.outcome === o)
  const transfers = by('transfers')
  const noView = by('no-view')
  const corrupt = by('view-corrupts')
  const noProbe = by('no-probe')
  const untransferable = [...noView, ...corrupt]
  const pct = (a: number) => ((100 * a) / n).toFixed(1)

  console.log(`\n===== WRITER CENSUS: ${name} — asks the syntactic core serves =====`)
  console.log(`  core-served asks                 ${n}   (distinct minis ${new Set(rows.map((r) => r.mini)).size})`)
  console.log(`  -- the INCUMBENT, put through the same probe --`)
  console.log(...show(tallyBy(rows, (r) => `core edit ${r.coreProbe}`)))
  console.log(`  -- the COUNTERFACTUAL: core deleted, who serves and does the edit hold --`)
  console.log(`  transfers (view + edit survives) ${transfers.length}  (${pct(transfers.length)}%)`)
  console.log(`      by derived writer`)
  console.log(...show(tallyBy(transfers, (r) => r.writer)))
  console.log(`      of these, view has STRUCTURE  ${transfers.filter((r) => r.structured).length}`)
  console.log(`      of these, SAME shape as core  ${transfers.filter((r) => r.sameShape).length}`)
  console.log(`  UNTRANSFERABLE                   ${untransferable.length}  (${pct(untransferable.length)}%)`)
  console.log(`      no derived writer opens it    ${noView.length}`)
  console.log(...show(tallyBy(noView, (r) => `gate: ${r.gate}`)))
  console.log(`      opens but the edit CORRUPTS   ${corrupt.length}`)
  console.log(...show(tallyBy(corrupt, (r) => `writer: ${r.writer}`)))
  console.log(`  UNVERIFIED (no clean probe)      ${noProbe.length}  (${pct(noProbe.length)}%)`)
  console.log(...show(tallyBy(noProbe, (r) => `why: ${r.noProbe}`)))
  console.log(`  -- the untransferable set BY MECHANISM (the mini's own shape, not the label) --`)
  console.log(...show(tallyBy(untransferable, (r) => r.shape)))
  console.log(`  -- and for contrast, the TRANSFERRED set by the same mechanism axis --`)
  console.log(...show(tallyBy(transfers, (r) => r.shape)))

  // THE SPLIT THAT DECIDES WHETHER THIS IS A FIX OR A BOUND. An ask that fails only
  // because the projection cannot NAME a `word:index` value is a hole in one
  // function (#1019); an ask that fails because several onsets share one source
  // atom is the bijection ([[PV218]]) and no amount of patching moves it.
  const fixable = untransferable.filter((r) => r.arrayValue)
  const structural = untransferable.filter((r) => !r.arrayValue)
  console.log(`  -- the untransferable set SPLIT BY WHETHER IT IS A HOLE OR A BOUND --`)
  console.log(`      word:index array value (a naming hole, #1019)  ${fixable.length}`)
  console.log(`      everything else (candidate structural bound)   ${structural.length}`)
  console.log(...show(tallyBy(structural, (r) => `${r.shape}  /  gate ${r.gate}`)))
  // AND WHETHER THE VIEW BEING LOST IS WORTH KEEPING. A one-cell view of an
  // instrument name is a CORRECT model and a useless surface ([[P338]] clause 2),
  // and counting it as a blocker for deleting the core is the same error as
  // counting it as reach.
  // A TRANSFER THAT CHANGES THE VIEW IS NOT A CLEAN TRANSFER. Reach moved, the
  // verdict did not, and the user sees a different grid — the silent re-routing
  // [[PK58]] exists to catch. Enumerated, because at this size it can be read.
  const reshaped = transfers.filter((r) => !r.sameShape)
  if (reshaped.length) {
    console.log(`  -- transfers whose VIEW SHAPE differs from the core's (${reshaped.length}) --`)
    reshaped.forEach((r) => console.log(`     ${r.writer}  ${JSON.stringify(r.mini).slice(0, 80)}`))
  }
  console.log(`  -- of the untransferable, what the core's OWN view is --`)
  console.log(`      core view has STRUCTURE     ${untransferable.filter((r) => r.coreStructured).length}`)
  console.log(`      core edit VERIFIED ok       ${untransferable.filter((r) => r.coreProbe === 'ok').length}`)
  console.log(
    `      structural AND structured AND core-edit-verified  ${
      structural.filter((r) => r.coreStructured && r.coreProbe === 'ok').length
    }   <-- the set that actually blocks deleting the core`,
  )
}

describe('writer census — how much of the syntactic core transfers to the derived projections', () => {
  const grid = census(SURFACES[0])
  const roll = census(SURFACES[1])

  it('counts every core-served ask, and enumerates the untransferable with a mechanism', () => {
    report('step grid', grid)
    report('piano roll', roll)

    const all = [...grid, ...roll]
    const untransferable = all.filter(
      (r) => r.outcome === 'no-view' || r.outcome === 'view-corrupts',
    )
    console.log(
      [
        `\n===== BOTH SURFACES =====`,
        `  core-served asks      ${all.length}   over ${new Set(all.map((r) => r.mini)).size} distinct minis`,
        `  transfers             ${all.filter((r) => r.outcome === 'transfers').length}`,
        `  UNTRANSFERABLE        ${untransferable.length}   over ${new Set(untransferable.map((r) => r.mini)).size} distinct minis`,
        `  unverified            ${all.filter((r) => r.outcome === 'no-probe').length}`,
      ].join('\n'),
    )

    // Dump the enumeration so it can be hand-read and quoted per entry. The
    // deliverable of this phase is the NAMED residual, not the count — a count
    // without a classification is the error the previous phase corrected.
    fs.writeFileSync(
      path.join(corpusDir, 'WRITER-CENSUS.json'),
      JSON.stringify(
        {
          note: 'Generated by writer-census.test.ts (#1009). One row per surface-ask the syntactic core serves.',
          coreServed: { grid: grid.length, roll: roll.length },
          rows: all,
        },
        null,
        2,
      ) + '\n',
    )

    // THE DENOMINATOR IS PINNED TO writer-reach's COMPLEMENT. That gate sweeps the
    // asks the core REFUSES (697 grid / 1086 roll of 1500); this one sweeps the
    // asks it SERVES. If these two stop summing to the corpus, one of them is
    // asking a different question and neither number is readable.
    expect(grid.length).toBe(1500 - 697)
    expect(roll.length).toBe(1500 - 1086)

    // A BAND, NOT A FLOOR. This is a measurement, so a move in EITHER direction is
    // a finding and should turn this red rather than pass quietly upward.
    const why = ' — a MOVE, not a regression: re-read WRITER-CENSUS.md and update it and this number together, stating which mechanism moved'
    expect(all.filter((r) => r.outcome === 'transfers').length, 'transfers' + why).toBe(1058)
    expect(untransferable.length, 'untransferable' + why).toBe(57)
    expect(all.filter((r) => r.outcome === 'no-probe').length, 'unverified' + why).toBe(102)

    // THE GAIN THAT COUNTS, PINNED SEPARATELY FROM RAW REACH. #1019 moved 93 asks
    // from "no derived view at all" to a verified transfer — but only 32 of them
    // have more than one cell. The other 61 are a single atom: a CORRECT model of a
    // bare instrument name and a useless surface ([[P338]] clause 2). Quoting 93 as
    // the product gain would repeat the error this census exists to stop, so the
    // structured count is pinned beside the total and is the one to quote.
    expect(all.filter((r) => r.outcome === 'transfers' && r.structured).length, 'structured transfers' + why).toBe(641)

    // NOTHING CORRUPTS. Both derived writers refuse rather than mis-write over this
    // whole population, which is what makes the untransferable set readable as an
    // ADMISSION result and not a fidelity one. If this ever becomes non-zero the
    // census's headline changes meaning entirely: a view that opens and corrupts is
    // worse than one that never opened.
    expect(all.filter((r) => r.outcome === 'view-corrupts')).toEqual([])

    // THE SPLIT IS THE DELIVERABLE, AND #1019 HAS NOW LANDED ON IT. It was 101
    // naming hole / 50 candidate structural; naming the `:`-variant took the first
    // column to 7 and left the second EXACTLY where it was. That the structural
    // column did not move is the load-bearing half of this assertion: a fix that
    // also moved it would mean the two classes were never independent, and the
    // whole hole-versus-bound split would need re-deriving.
    //
    // The 7 that remain play an array value AND have a second, real blocker (six
    // `,`-stacks with no leaf anchor, one past the period cap) — so they are
    // structural residual that happens to contain a `:`, not naming failures.
    expect(untransferable.filter((r) => r.arrayValue).length).toBe(7)
    expect(untransferable.filter((r) => !r.arrayValue).length).toBe(50)

    // THE NUMBER P6 IS SCOPED AGAINST, and it is a CONJUNCTION. "46 have a
    // structured core view" and "41 have a verified core edit" are different
    // filters over the same 50, and quoting either alone overstates the blocker
    // set. The set that actually blocks deleting the core is both at once.
    const structural = untransferable.filter((r) => !r.arrayValue)
    expect(structural.filter((r) => r.coreStructured).length).toBe(46)
    expect(structural.filter((r) => r.coreProbe === 'ok').length).toBe(41)
    expect(structural.filter((r) => r.coreStructured && r.coreProbe === 'ok').length).toBe(40)
  }, 900_000)

  /**
   * MECHANISM, NOT LABEL. The refusal label has overstated the opportunity every
   * time it has been counted, so each claim about WHY an ask is untransferable is
   * asserted here against something other than the label — the engine's own period
   * for the first, a rewrite experiment with a control arm for the second.
   *
   * These live in the committed gate rather than in a probe that gets deleted,
   * because they are the evidence for this phase's conclusion. A future change that
   * quietly breaks the mechanism should fail a test, not survive until someone
   * re-derives it.
   */
  describe('the untransferable set, by verified mechanism', () => {
    const structural = [...grid, ...roll].filter(
      (r) => (r.outcome === 'no-view' || r.outcome === 'view-corrupts') && !r.arrayValue,
    )

    it('every unstable-period ask really does have a period past its surface cap', () => {
      // the shipped caps: LEAF_PROJECT_BARS = { grid: 12, roll: 4 }
      const CAP = { step: 12, roll: 4 } as const
      const rows = structural.filter((r) => r.gate === 'unstable-period')
      expect(rows.length).toBe(33)

      const withinCap: string[] = []
      let past = 0
      let aperiodic = 0
      let rollBlockedByItsOwnCap = 0
      for (const r of rows) {
        const p = truePeriod(r.mini)
        if (p === 0) aperiodic++
        else if (p > CAP[r.surface]) {
          past++
          // The finding that gates the epic's deletion phase (#1020): the ROLL's cap
          // of 4 — not the grid's 12 — is what stops these. Measured, not argued.
          if (r.surface === 'roll' && p <= 12) rollBlockedByItsOwnCap++
        } else withinCap.push(`${r.surface} period=${p} ${r.mini}`)
      }
      console.log(
        `\n  unstable-period: ${past} past the cap, ${aperiodic} aperiodic, ` +
          `${rollBlockedByItsOwnCap} roll asks with period in (4, 12] — cleared by the grid's existing cap`,
      )
      // THE MUST-NOT: an ask refused for the period cap whose period is WITHIN the
      // cap would mean the gate is misattributing, and the whole mechanism claim
      // (and #1020 with it) would be wrong.
      expect(withinCap, withinCap.join('\n')).toEqual([])
      expect(past).toBe(31)
      expect(aperiodic).toBe(2)
      expect(rollBlockedByItsOwnCap).toBe(20)
    }, 900_000)

    it('naming a `:`-variant is the exact INVERSE of krill lowering it, and the whole tail is load-bearing', () => {
      // THE MECHANISM, ASSERTED AFTER THE FIX. Before #1019 the evidence was a
      // rewrite experiment — turn `word:index` into `word_index`, watch the verdict
      // flip. That experiment cannot outlive the fix, because the rows it filtered
      // are no longer refused. So the claim it stood for is asserted directly:
      // joining krill's array value on `:` reconstructs the token it was lowered
      // FROM, which is what makes the token safe to write back verbatim.
      //
      // GROUNDED, not inferred: `tail` is the only op that builds an array value and
      // it ACCRETES (`@strudel/mini/mini.mjs:50-52` —
      // `Array.isArray(a) ? [...a, b] : [a, b]`).
      const played = (src: string): unknown[] => {
        try {
          return (src === '' ? [] : (reifyMini(src) as { queryArc(a: number, b: number): { value: unknown }[] }).queryArc(0, 1))
        } catch {
          return []
        }
      }
      let checked = 0
      let headWouldBeWrong = 0
      const wrong: string[] = []
      for (const m of minis) {
        for (const h of played(m)) {
          const v = (h as { value: unknown }).value
          if (!Array.isArray(v)) continue
          const token = tailToken(v)
          if (token === null) {
            wrong.push(`unnameable array value in ${JSON.stringify(m)}: ${JSON.stringify(v)}`)
            continue
          }
          checked++
          // Re-reify the reconstructed token ON ITS OWN and require the SAME value
          // back. This is the round trip the write-back depends on.
          const back = played(token).map((x) => (x as { value: unknown }).value)
          if (back.length !== 1 || JSON.stringify(back[0]) !== JSON.stringify(v)) {
            wrong.push(`${JSON.stringify(m)}: ${JSON.stringify(v)} named ${JSON.stringify(token)} re-plays ${JSON.stringify(back)}`)
          }
          // THE RED TEST, run as arithmetic rather than by breaking the source: a
          // `v[0] + ':' + v[1]` naming — the shape the reference notes described,
          // and the one I would have written from memory — silently drops the tail.
          if (v.length > 2) headWouldBeWrong++
        }
      }
      console.log(`\n  ':'-variant naming: ${checked} array values round-tripped, ${wrong.length} wrong; head-only naming would corrupt ${headWouldBeWrong}`)
      expect(wrong.slice(0, 5), wrong.slice(0, 5).join('\n')).toEqual([])
      // The corpus must actually EXERCISE this, or the assertion above is vacuous.
      expect(checked).toBeGreaterThan(300)
      // And the join must be doing real work: if this is ever 0, the corpus stopped
      // covering 3-member variants (`sd:0:0.5`) and the round trip above would pass
      // for a head-only naming too — the assertion would still be green and would
      // no longer be evidence for anything.
      expect(headWouldBeWrong).toBeGreaterThan(0)
    }, 900_000)

    it('the 7 remaining array-value asks are held by a SECOND blocker, not by naming', () => {
      // The counterpart to the test above, and the reason the residual can still be
      // called structural: every untransferable ask that still plays a `:`-variant
      // must be stopped by a gate that has nothing to do with naming. If one ever
      // shows up refused for want of note content again, the naming regressed.
      const rows = [...grid, ...roll].filter(
        (r) => (r.outcome === 'no-view' || r.outcome === 'view-corrupts') && r.arrayValue,
      )
      console.log(
        `\n  array-value asks still untransferable (${rows.length}):\n` +
          rows.map((r) => `     ${r.surface}  ${r.gate}  ${JSON.stringify(r.mini).slice(0, 70)}`).join('\n'),
      )
      expect(rows.length).toBe(7)
      expect(rows.filter((r) => r.gate === 'no-note-content')).toEqual([])
      // six `,`-stacks with no leaf anchor, one past the period cap — both are the
      // SAME bounds the non-array residual is made of, which is what makes these
      // structural residual that happens to contain a `:` rather than naming misses.
      expect(rows.filter((r) => r.gate === 'no-leaf-anchor').length).toBe(6)
      expect(rows.filter((r) => r.gate === 'unstable-period').length).toBe(1)
    }, 900_000)

    it('the census population IS the population the shipped path serves via the core', () => {
      // THE OTHER SIDE OF THE BOUNDARY. Every number in this file rests on "the asks
      // this census sweeps are exactly the asks the core serves in production", and
      // that rests in turn on `parseStepGrid` handing back the core's own result
      // whenever the core succeeds. That is one line of `parse.ts` — and reading a
      // line is inference. Verify it against the real entry point instead.
      const mismatches: string[] = []
      let checked = 0
      for (const s of [
        { k: 'grid', core: parseStepGridCore, full: parseStepGrid },
        { k: 'roll', core: parsePianoRollCore, full: parsePianoRoll },
      ]) {
        for (const mini of minis) {
          const core = s.core(mini)
          if (!core.ok) continue
          checked++
          const full = s.full(mini)
          if (!full.ok) {
            mismatches.push(`${s.k}: shipped path REFUSED a core-served ask: ${mini}`)
            continue
          }
          const fm = full.model as StepGridModel & PianoRollModel
          // a projection answered where the core should have — the census would then
          // be measuring a counterfactual against the wrong incumbent
          if (fm.leafSource) mismatches.push(`${s.k}: leaf writer answered a core-served ask: ${mini}`)
          else if (JSON.stringify(fm) !== JSON.stringify(core.model))
            mismatches.push(`${s.k}: shipped model differs from the core's: ${mini}`)
        }
      }
      console.log(`\n  shipped path vs core over ${checked} core-served asks: ${mismatches.length} mismatches`)
      expect(mismatches, mismatches.slice(0, 5).join('\n')).toEqual([])
      expect(checked).toBe(1217)
    }, 900_000)

    it('RED TEST: the census distinguishes the two writers — it is not measuring one twice', () => {
      // The census's whole content is that the core's model and the derived model
      // can disagree. If `probeEdit` gave the same verdict for both on every ask,
      // the counterfactual would be vacuous and every number above would be an
      // elaborate restatement of the incumbent. Require the DISAGREEMENT.
      let disagree = 0
      for (const s of SURFACES) {
        for (const mini of minis) {
          const core = s.core(mini)
          if (!core.ok) continue
          const derived = s.derived(mini, NO_CORE_REFUSAL)
          const coreV = probeEdit(mini, core.model as StepGridModel & PianoRollModel, s.edit).verdict
          const derV = derived.ok
            ? probeEdit(mini, derived.model as StepGridModel & PianoRollModel, s.edit).verdict
            : 'no-view'
          if (coreV !== derV) disagree++
        }
      }
      console.log(`\n  asks where the two writers' probes DISAGREE: ${disagree}`)
      // THE THRESHOLD MOVED WITH #1019, AND DOWNWARD IS THE EXPECTED DIRECTION.
      // It was >100 when 101 asks were untransferable purely because the derived
      // projection could not name a `:`-variant — much of that "disagreement" was
      // the naming hole, not a real difference between the writers. Naming it
      // removed 93 of those disagreements and the figure fell to 63.
      //
      // The test's PURPOSE is unchanged and still met: the two writers must not be
      // the same measurement twice. 63 genuine disagreements over 1217 asks is that
      // proof, and the bound is re-pinned rather than deleted so a future change
      // that collapses the counterfactual entirely still turns this red.
      expect(disagree).toBeGreaterThan(50)
    }, 900_000)
  })
})
