/**
 * op-admissibility.test.ts — AN ENABLED CONTROL AND A WORKING ONE ARE THE SAME CLAIM.
 *
 * ── THE GAP THIS FILLS ────────────────────────────────────────────────────────
 * Every model op carries a `can<Op>` predicate that the panel uses to enable its
 * control. Those predicates used to REASON ABOUT THE MODEL — "every odd column is
 * empty", "the gains are neutral", "the bars stay integral" — and from that predict
 * whether the writer would accept the result. That is a second oracle for the writer's
 * admissibility ([[PV192]]), and nothing in the suite compared the two.
 *
 * It broke at #1010 P4c. The printer began preserving a note's length, which the grid can
 * spell only as a whole number of columns ≥ 1, and every COARSENING op scales a length
 * below that. Measured against the writer as it stood at `studio_v0.2.0`: ÷2 went from
 * **0 declines to 24 of the 24 units that offer it** — the control present and doing
 * nothing — and quantize-down and resize-spread-down went the same way. Every existing
 * gate stayed green, because each op's own A/B compared that op to ITSELF ([[PK64]]) and
 * writability is one layer downstream of all of them.
 *
 * ── THE INVARIANT ─────────────────────────────────────────────────────────────
 * For every op and every unit: **if the control is enabled, the op's result must be
 * writable.** Stated over the real corpus, asked of the real writer, per op. This is the
 * op-boundary twin of the read boundary's prove-before-offer (`parse.ts:1638` — "the
 * writer must reproduce the user's bytes before we offer the view at all") and of
 * `leafViewUsable` ("Asked of the REAL writer … so the check cannot drift from what an
 * actual click does"). The ops were the one boundary that still predicted.
 *
 * A dead control is ranked WORSE than a missing one by this project's own precedent —
 * `leafViewUsable`: "the result is a grid where nothing the user clicks moves. That reads
 * as broken, which is worse than the honest code-only refusal it replaces."
 *
 * ── THIS GATE IS PROVEN ABLE TO FIRE ──────────────────────────────────────────
 * The `enabledButIdentity` arm was verified by putting the defect back: with `slotState`
 * returning `'quantize'` unconditionally (how it shipped before P4c), this reports
 * **483 grid + 123 roll** disagreements — dead "Slots" buttons — and goes red. That is an
 * order of magnitude more than the 24 dead ÷2 buttons, because the Slots control was
 * enabled for EVERY non-lossless single-bar target. A gate whose zero has never been shown
 * to be reachable certifies nothing ([[P353]]), and this one's zero was reachable in the
 * most embarrassing way: the first cut of this file passed no `enabled` predicate for the
 * Slots control at all, so it read 0 while the largest dead-control population in the
 * codebase sat untouched right next to it.
 *
 * ── WHY NOT CLAMP THE LENGTH INSTEAD, AND KEEP ÷2 WORKING ─────────────────────
 * Because `SequencerGrid.tsx` never reads `duration`. Clamping a coarsened length up to
 * one column keeps the op available and changes every note's length invisibly (1/8 → 1/4),
 * and #1026 already ruled on precisely that: a view that cannot show duration still must
 * not change it, because "edits locally / no silent data loss" is a property of the
 * DOCUMENT, not of the panel. An op the user asked for is not a licence to alter an axis
 * the view cannot show them.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStepGrid, parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import {
  serializeStepGrid,
  serializePianoRoll,
} from '../../../editor/src/visualEdit/notation/serialize'
import {
  RESOLUTION_PRESETS,
  canDoubleStepGrid,
  canHalveStepGrid,
  canDoublePianoRoll,
  canHalvePianoRoll,
  canScaleStepGridTo,
  canScalePianoRollTo,
  scaleStepGrid,
  scalePianoRoll,
  scaleStepGridTo,
  scalePianoRollTo,
  quantizeStepGridTo,
  quantizePianoRollTo,
  stepSlotState,
  rollSlotState,
  freeZoneScale,
  type SlotState,
} from '../../../editor/src/visualEdit/notation/resolution'
import { documentSteps } from '../../../editor/src/visualEdit/notation/viewResolution'
import { resizeGrid, resizeRoll } from '../../../editor/src/visualEdit/notation/resize'
import type {
  PianoRollModel,
  StepGridModel,
} from '../../../editor/src/visualEdit/notation/model'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/** an op under test: apply it, and say whether the control would be enabled */
interface Op<M> {
  name: string
  /** the op's result — the SAME reference when it does not apply */
  apply: (m: M) => M
  /**
   * What the panel asks to enable the control; omitted when identity IS the signal.
   *
   * ⚠ TAKES THE MINI AS WELL AS THE MODEL, and that is not a convenience (#1059).
   * The Slots control's real predicate is `stepSlotState(model, target, canDrawView)`
   * and `canDrawView` is a PARSE of the mini at a candidate scale — it cannot be
   * derived from the model. Without it this gate evaluated the control with the free
   * zone switched off, i.e. it asserted the PRE-#1057 control while the panel
   * rendered the post-#1057 one. Same function, different arity, opposite verdict on
   * every free-zone target.
   */
  enabled?: (m: M, mini: string) => boolean
  /**
   * DOES THE CONTROL ACTUALLY ROUTE TO THIS OP HERE? Default: always.
   *
   * `enabled` asks "is the button pressable"; this asks the prior question, "is
   * THIS the op the press would run". They came apart at #1057. `scaleToSlots`
   * branches — a free-zone target calls `setViewScale` and returns, everything else
   * calls `quantize<Op>To` — so on a free-zone target the Slots control is pressable
   * AND `quantizeStepGridTo` is not the op behind it.
   *
   * Without this distinction the pairing below compares a control against an op it
   * does not drive and reports a mismatch on every free-zone target (3006 grid /
   * 1245 roll, measured). That is not a dead control; it is the gate asking the
   * wrong question. Skipping the pair is the honest answer, not widening `enabled`
   * to make the arithmetic come out.
   */
  drives?: (m: M, mini: string) => boolean
}

/** the prover the panel uses — ask the parser at a candidate scale, never predict it */
const gridProver = (mini: string) => (scale: number) => parseStepGrid(mini, scale).ok
const rollProver = (mini: string) => (scale: number) => parsePianoRoll(mini, scale).ok

const GRID_OPS: Op<StepGridModel>[] = [
  { name: '×2', apply: (m) => scaleStepGrid(m, 'double'), enabled: canDoubleStepGrid },
  { name: '÷2', apply: (m) => scaleStepGrid(m, 'halve'), enabled: canHalveStepGrid },
  ...RESOLUTION_PRESETS.flatMap((t): Op<StepGridModel>[] => [
    {
      name: `scaleTo ${t}`,
      apply: (m) => scaleStepGridTo(m, t),
      enabled: (m) => canScaleStepGridTo(m, t),
    },
    {
      name: `slots ${t}`,
      apply: (m) => quantizeStepGridTo(m, t),
      // THE PREDICATE THE PANEL ACTUALLY USES. `SequencerGrid.tsx` drives the "Slots"
      // control from `stepSlotState` and runs `quantizeStepGridTo` on click, so this is
      // the pair a user can see disagree. The first cut of this gate passed no `enabled`
      // here and therefore could not see the one dead button that survived the phase —
      // a gate with a hole exactly where the UI lives ([[P352]]).
      // ASKED WITH THE PROVER, and restricted to the states that actually run this
      // op. Post-#1057 the panel branches: a `view` target sets the view scale and
      // never reaches `quantizeStepGridTo` at all, so pairing it with this `apply`
      // would compare a control against an op it does not drive.
      drives: (m, mini) => stepSlotState(m, t, gridProver(mini)) !== 'view',
      enabled: (m, mini) => {
        const s = stepSlotState(m, t, gridProver(mini))
        return s === 'lossless' || s === 'quantize'
      },
    },
    { name: `resize spread ${t}`, apply: (m) => resizeGrid(m, t, 'spread') },
    { name: `resize pad ${t}`, apply: (m) => resizeGrid(m, t, 'pad') },
  ]),
]

const ROLL_OPS: Op<PianoRollModel>[] = [
  { name: '×2', apply: (m) => scalePianoRoll(m, 'double'), enabled: canDoublePianoRoll },
  { name: '÷2', apply: (m) => scalePianoRoll(m, 'halve'), enabled: canHalvePianoRoll },
  ...RESOLUTION_PRESETS.flatMap((t): Op<PianoRollModel>[] => [
    {
      name: `scaleTo ${t}`,
      apply: (m) => scalePianoRollTo(m, t),
      enabled: (m) => canScalePianoRollTo(m, t),
    },
    {
      name: `slots ${t}`,
      apply: (m) => quantizePianoRollTo(m, t),
      drives: (m, mini) => rollSlotState(m, t, rollProver(mini)) !== 'view',
      enabled: (m, mini) => {
        const s = rollSlotState(m, t, rollProver(mini))
        return s === 'lossless' || s === 'quantize'
      },
    },
    { name: `resize spread ${t}`, apply: (m) => resizeRoll(m, t, 'spread') },
    { name: `resize pad ${t}`, apply: (m) => resizeRoll(m, t, 'pad') },
  ]),
]

interface Tally {
  applied: number
  dead: number
  enabledButIdentity: number
}

function sweep<M>(
  ops: Op<M>[],
  parse: (m: string) => { ok: boolean; model?: M },
  write: (m: M) => string | null,
): { byOp: Map<string, Tally>; views: number; deadExamples: string[] } {
  const byOp = new Map<string, Tally>()
  const deadExamples: string[] = []
  let views = 0
  for (const mini of minis) {
    const r = parse(mini)
    if (!r.ok || !r.model) continue
    const model = r.model
    views++
    for (const op of ops) {
      const t = byOp.get(op.name) ?? { applied: 0, dead: 0, enabledButIdentity: 0 }
      // the control does not route here — pairing it with this op would compare a
      // button against an op it never runs
      if (op.drives && !op.drives(model, mini)) {
        byOp.set(op.name, t)
        continue
      }
      const next = op.apply(model)
      if (next !== model) {
        t.applied++
        // THE INVARIANT: an op that applied must have produced writable notation.
        if (write(next) === null) {
          t.dead++
          if (deadExamples.length < 12) deadExamples.push(`${op.name}  ${JSON.stringify(mini)}`)
        }
      }
      // …and the control's enabled-ness must agree with whether the op applies, or the
      // panel offers a button that is a no-op (the other half of the same defect).
      if (op.enabled && op.enabled(model, mini) !== (next !== model)) t.enabledButIdentity++
      byOp.set(op.name, t)
    }
  }
  return { byOp, views, deadExamples }
}

function report<M>(
  label: string,
  ops: Op<M>[],
  parse: (m: string) => { ok: boolean; model?: M },
  write: (m: M) => string | null,
): void {
  const { byOp, views, deadExamples } = sweep(ops, parse, write)
  const dead = [...byOp.values()].reduce((a, t) => a + t.dead, 0)
  const mismatch = [...byOp.values()].reduce((a, t) => a + t.enabledButIdentity, 0)
  const applied = [...byOp.values()].reduce((a, t) => a + t.applied, 0)
  console.log(
    [
      `\n===== OP ADMISSIBILITY: ${label} =====`,
      `  units with a view                ${views}`,
      `  op applications that CHANGED it  ${applied}`,
      `  ...whose result is UNWRITABLE    ${dead}`,
      `  can<Op> disagreeing with apply   ${mismatch}`,
      `  per op (applied / unwritable):`,
      ...[...byOp]
        .filter(([, t]) => t.applied > 0 || t.dead > 0)
        .map(([n, t]) => `     ${n.padEnd(20)} ${String(t.applied).padStart(5)} / ${t.dead}`),
    ].join('\n'),
  )
  for (const e of deadExamples) console.log(`     DEAD  ${e}`)
  expect(
    dead,
    'an op that applied produced notation the writer cannot spell — that is a control the user can press to no effect',
  ).toBe(0)
  expect(
    mismatch,
    'can<Op> disagrees with whether the op actually applies — the predicate is a second oracle again',
  ).toBe(0)
  // POPULATION, pinned, so a path that stops projecting cannot shrink the denominator
  // and turn this gate green over less material ([[P343]]).
  expect(applied, 'the sweep must actually exercise ops').toBeGreaterThan(1000)
}

describe('op admissibility — an enabled control produces writable notation', () => {
  it('step grid: every op, over the real-world corpus', () => {
    report('step grid', GRID_OPS, parseStepGrid, serializeStepGrid)
  })

  it('piano roll: every op, over the real-world corpus', () => {
    report('piano roll', ROLL_OPS, parsePianoRoll, serializePianoRoll)
  })

  it('×2 IS ALWAYS UNDOABLE — ÷2 applies to every ×2 result', () => {
    // THE NUMBER THAT MAKES THE TRADE HONEST. Gating ÷2 on spellability takes it from 24
    // of 966 source-parsed corpus grids to 0: a grid whose notes are exactly one column
    // long cannot be halved without doubling every note's length, and the panel cannot
    // show that. Read alone, "÷2 available on 0 units" says the control is dead.
    //
    // It is not, and this is the distinction. A note is one column long because the SOURCE
    // wrote it that way; after ×2 it is two columns long, so ÷2 halves it back to one and
    // the result is spellable. So ÷2 is unavailable exactly where it would lengthen a note,
    // and available exactly where it would not — which is the whole interactive case:
    // double, change your mind, undo. Asserted over the corpus rather than argued from the
    // one hand-written acceptance case in `resolution.test.ts`.
    let doubled = 0
    let undoable = 0
    const stuck: string[] = []
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok) continue
      const up = scaleStepGrid(r.model, 'double')
      if (up === r.model) continue
      doubled++
      const back = scaleStepGrid(up, 'halve')
      if (back !== up && serializeStepGrid(back) !== null) undoable++
      else if (stuck.length < 10) stuck.push(JSON.stringify(mini))
    }
    console.log(`\n  ×2 applied to ${doubled} units; ÷2 undoes ${undoable} of them`)
    for (const s of stuck) console.log(`     STUCK  ${s}`)
    expect(doubled, 'the sweep must actually double something').toBeGreaterThan(800)
    expect(undoable, 'a ×2 the user cannot undo is a trap the old dead button at least avoided').toBe(
      doubled,
    )
  })

  it('CONTROL: the sweep can SEE an unwritable result', () => {
    // [[P353]] — a gate whose zero has never been shown to be reachable certifies nothing.
    // An op that deliberately produces a length the grid cannot spell must be caught by
    // exactly the check above, on real corpus material.
    const bad: Op<StepGridModel> = {
      name: 'BROKEN halve (no spellability gate)',
      apply: (m) => ({
        ...m,
        steps: m.steps,
        // half a column long: representable in the model, unspellable in the notation
        lanes: m.lanes.map((l) => ({
          ...l,
          cells: l.cells.map((c) => (c && typeof c === 'object' ? { duration: 0.5 } : c)),
        })),
      }),
    }
    let applied = 0
    let caught = 0
    let escapedLeaf = 0
    let escapedOther = 0
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok) continue
      // The corruption has to BE a corruption. A rests-only grid (`~`) has no ON cell, so
      // rewriting every duration changes nothing and it serializes fine — and counting it
      // as an escape is the control arm itself being built wrong, which is the failure
      // this project has already been bitten by twice ([[P353]]). It cost one unit of
      // false signal here before the escape was read rather than assumed.
      if (!r.model.lanes.some((l) => l.cells.some((c) => c && typeof c === 'object'))) continue
      const next = bad.apply(r.model)
      if (next === r.model) continue
      applied++
      if (serializeStepGrid(next) === null) caught++
      else if (r.model.leafSource) escapedLeaf++
      else escapedOther++
    }
    console.log(
      `\n  CONTROL: ${caught}/${applied} sub-column lengths caught` +
        `  (escaped: ${escapedLeaf} leaf-anchored, ${escapedOther} other)`,
    )
    expect(applied, 'the control arm must actually run').toBeGreaterThan(100)
    expect(caught, 'the check must fire on real corpus material, in bulk').toBeGreaterThan(800)
    // THE ESCAPES ARE ACCOUNTED FOR, not waved through. A leaf-anchored grid is written by
    // BYTE SURGERY at each note's own span (`spliceByLeaf`) — it replaces the atom's text
    // and never spells a length at all, so a bogus duration is invisible to it. That is
    // correct rather than a hole: the length it does not write is the length it cannot
    // corrupt. What must NOT escape is anything on a path that DOES spell lengths, so
    // that residue is pinned at zero separately from the bulk count.
    expect(
      escapedOther,
      'a non-leaf grid wrote a sub-column length instead of declining — the printer spells lengths on this path',
    ).toBe(0)
  })
})

/**
 * ── THE FREE / WRITES AXIS (#1059) ────────────────────────────────────────────
 *
 * The sweep above pairs a control's enabled-ness with whether its op APPLIES. That
 * was the whole question while every enabled target wrote. It is no longer: since
 * #1057 the Slots control has two zones, and the promise the user is given differs
 * between them. So the axis this adds is not "does it apply" but "does it WRITE":
 *
 *   - a FREE-ZONE target must NEVER write — it is satisfied by drawing alone, and
 *     the panel routes it to `setViewScale` without reaching the writer at all;
 *   - a WRITES-ZONE target must ALWAYS write — otherwise it is the dead control
 *     this file exists to catch, wearing the one label that promises an edit.
 *
 * ⚠ EVERY STATE HERE IS ASKED WITH THE PROVER. Without it `slotState` skips the free
 * zone entirely and answers as the pre-#1057 control did, which would make the free
 * half of this axis unobservable — it would report zero free offers and pass.
 *
 * ⚠ THE TARGETS INCLUDE THE RELATIVE ONES. #1059 reshaped the picker to ÷2 / ×2
 * against the DRAWN count, so a gate that swept only `RESOLUTION_PRESETS` would be
 * measuring a vocabulary the control no longer offers — the same shape of hole as
 * the missing `enabled` predicate that let 483 dead buttons through.
 */
/**
 * ⚠ COUNTS AND EXAMPLES ARE SEPARATE FIELDS ON PURPOSE. The example lists are capped
 * so a red gate prints something readable; if the report derived its totals from
 * `examples.length` it would print the CAP and call it the population — a detector
 * that finds N defects and reports 8. The counts are unbounded; only the naming is
 * capped ([[P428]]).
 */
interface ZoneTally {
  free: number
  writes: number
  freeUndrawableN: number
  writesInertN: number
  writesUnspellableN: number
  freeUndrawable: string[]
  writesInert: string[]
  writesUnspellable: string[]
}

function zoneSweep<M extends { steps: number }>(
  parse: (m: string, k?: number) => { ok: boolean; model?: M },
  slot: (m: M, t: number, c: (k: number) => boolean) => SlotState,
  quantizeTo: (m: M, t: number) => M,
  write: (m: M) => string | null,
): ZoneTally {
  const t: ZoneTally = {
    free: 0,
    writes: 0,
    freeUndrawableN: 0,
    writesInertN: 0,
    writesUnspellableN: 0,
    freeUndrawable: [],
    writesInert: [],
    writesUnspellable: [],
  }
  for (const mini of minis) {
    const r = parse(mini)
    if (!r.ok || !r.model) continue
    const model = r.model
    const docSteps = documentSteps(model)
    const prover = (k: number): boolean => parse(mini, k).ok
    const relative = [model.steps * 2, ...(model.steps % 2 === 0 ? [model.steps / 2] : [])]
    for (const target of [...RESOLUTION_PRESETS, ...relative]) {
      const state = slot(model, target, prover)
      if (state === 'view') {
        t.free++
        // "never writes" is TRUE BY ROUTING — the panel sets the view scale and the
        // writer is not called. What can still be wrong is the OFFER: a target shown
        // as free that the parser will not actually draw is a button whose promise
        // fails on press. That is the checkable half, and it is asked of the parser.
        const scale = freeZoneScale(docSteps, target)
        if (scale === null || !parse(mini, scale).ok) {
          t.freeUndrawableN++
          if (t.freeUndrawable.length < 8) t.freeUndrawable.push(`${target}  ${JSON.stringify(mini)}`)
        }
        continue
      }
      if (state !== 'lossless' && state !== 'quantize') continue
      t.writes++
      const next = quantizeTo(model, target)
      if (next === model) {
        t.writesInertN++
        if (t.writesInert.length < 8) t.writesInert.push(`${target}  ${JSON.stringify(mini)}`)
        continue
      }
      if (write(next) === null) {
        t.writesUnspellableN++
        if (t.writesUnspellable.length < 8) {
          t.writesUnspellable.push(`${target}  ${JSON.stringify(mini)}`)
        }
      }
    }
  }
  return t
}

describe('#1059 — the Slots control has two zones, and they promise different things', () => {
  const check = (label: string, t: ZoneTally, minFree: number, minWrites: number): void => {
    console.log(
      [
        `\n===== SLOTS ZONES: ${label} =====`,
        `  free-zone offers                 ${t.free}`,
        `  writes-zone offers               ${t.writes}`,
        `  free but NOT drawable            ${t.freeUndrawableN}`,
        `  writes but INERT                 ${t.writesInertN}`,
        `  writes but UNSPELLABLE           ${t.writesUnspellableN}`,
        ...t.freeUndrawable.map((e) => `     FREE-UNDRAWABLE  ${e}`),
        ...t.writesInert.map((e) => `     WRITES-INERT     ${e}`),
        ...t.writesUnspellable.map((e) => `     WRITES-DEAD      ${e}`),
      ].join('\n'),
    )
    expect(
      t.freeUndrawable,
      'a target shown as FREE that the parser will not draw — the promise fails on press',
    ).toEqual([])
    expect(
      t.writesInert,
      'a target shown as WRITES that changes nothing — the dead control, wearing the label that promises an edit',
    ).toEqual([])
    expect(
      t.writesUnspellable,
      'a target shown as WRITES whose result the writer cannot spell',
    ).toEqual([])
    // POPULATIONS PINNED. A zone that stops being offered would otherwise turn this
    // gate green over nothing at all — the failure mode this file was written for.
    expect(t.free, `${label}: the free zone must be a real population`).toBeGreaterThan(minFree)
    expect(t.writes, `${label}: the writes zone must be a real population`).toBeGreaterThan(
      minWrites,
    )
  }

  it('step grid: free never writes, writes always writes', () => {
    check(
      'step grid',
      zoneSweep(parseStepGrid, stepSlotState, quantizeStepGridTo, serializeStepGrid),
      2000,
      100,
    )
  })

  it('piano roll: free never writes, writes always writes', () => {
    check(
      'piano roll',
      zoneSweep(parsePianoRoll, rollSlotState, quantizePianoRollTo, serializePianoRoll),
      900,
      100,
    )
  })
})
