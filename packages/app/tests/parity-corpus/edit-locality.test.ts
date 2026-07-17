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
 *
 * `,`-stacks are covered by editing a lane of the LAST part, which makes the
 * prefix an entire neighbouring VOICE. That case is here because the first
 * version of this file skipped stacks — krill reports a stack as one top-level
 * node rather than a sequence, so they fell out of the probe silently — and a
 * real bug lived in exactly that hole: painting a cell into `bd sd, hh*4`
 * destroyed the `hh*4` next door. A gate that does not cover a shape is not
 * evidence about that shape, and its green says nothing.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as krillParse } from '@strudel/mini/krill-parser.js'

// Deep source path, not the `@stave/editor` barrel (same convention as
// round-trip.test.ts:57 — the barrel drags gifenc/CJS into the ESM resolver).
import { parseStepGrid, parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import {
  serializeStepGrid,
  serializePianoRoll,
} from '../../../editor/src/visualEdit/notation/serialize'
import type {
  PianoRollModel,
  RollNote,
  StepGridModel,
} from '../../../editor/src/visualEdit/notation/model'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)

interface KEl {
  location_?: { start?: { offset?: number } }
}
interface KPat {
  type_?: string
  arguments_?: { alignment?: string }
  source_?: unknown
}

/**
 * What this probe edits, and the byte offset everything before which must
 * survive it. Offsets are into the QUOTED string krill was handed, so they carry
 * a +1.
 *
 *   - `element` — the LAST top-level element of a flat sequence, or the last BAR
 *     of a whole-string `<…>` alternation. `end` bounds it, so the caller can
 *     ask what that one element produces by parsing it alone.
 *   - `part` — the LAST `,`-part. Everything before it is another part's, which
 *     is the sharpest version of this law: parts are independent voices and an
 *     edit to one has no business touching another. (krill puts no `location_`
 *     on child patterns, only on their elements — so the boundary comes from the
 *     last part's first element, still the authority's answer and not a
 *     comma-scanner of ours.)
 */
type Target =
  | { kind: 'element'; start: number; end: number; part: 0 }
  | { kind: 'part'; start: number; part: number }

/** `<a b c>` → the fastcat of bars inside it, or null if that isn't this shape */
function alternationBars(root: KPat): KEl[] | null {
  const children = root.source_
  if (!Array.isArray(children) || children.length !== 1) return null
  const inner = (children[0] as { source_?: KPat })?.source_
  if (inner?.type_ !== 'pattern' || inner.arguments_?.alignment !== 'polymeter_slowcat') return null
  const seq = inner.source_
  if (!Array.isArray(seq) || seq.length !== 1) return null
  const els = (seq[0] as KPat)?.source_
  return Array.isArray(els) && els.length > 1 ? (els as KEl[]) : null
}

const span = (el: KEl): { start: number; end: number } | null => {
  const s = el?.location_?.start?.offset
  const e = el?.location_?.end?.offset
  return typeof s === 'number' && typeof e === 'number' ? { start: s - 1, end: e - 1 } : null
}

/**
 * Returns null when there is nothing to prove — a lone element with no
 * neighbour to preserve.
 */
function lastElement(src: string): Target | null {
  let ast: KPat
  try {
    ast = krillParse('"' + src + '"') as KPat
  } catch {
    return null
  }
  if (ast?.type_ !== 'pattern') return null
  const align = ast.arguments_?.alignment
  const children = ast.source_
  if (!Array.isArray(children)) return null

  if (align === 'fastcat') {
    // A whole-string `<…>` is ONE top-level element, so the flat arm below sees
    // nothing to preserve and would drop every multi-bar pattern in the corpus.
    // Its bars are elements like any other, one level down, and they tile the
    // text inside the brackets — so the law applies there unchanged.
    const bars = alternationBars(ast)
    if (bars) {
      const s = span(bars[bars.length - 1])
      return s ? { kind: 'element', start: s.start, end: s.end, part: 0 } : null
    }
    if (children.length < 2) return null
    const s = span(children[children.length - 1] as KEl)
    return s ? { kind: 'element', start: s.start, end: s.end, part: 0 } : null
  }
  if (align === 'stack') {
    if (children.length < 2) return null
    const lastPart = children[children.length - 1] as KPat
    const els = lastPart?.source_
    if (!Array.isArray(els) || els.length === 0) return null
    const s = span(els[0] as KEl)
    return s ? { kind: 'part', start: s.start, part: children.length - 1 } : null
  }
  return null
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

/**
 * Flip the last column of a lane in the last element's own part, and see what
 * happened to everything written before it.
 */
function probe(mini: string): Violation | null {
  const src = mini.trim()
  const target = lastElement(src)
  if (target === null) return null
  const r = parseStepGrid(src)
  if (!r.ok) return null
  const model = r.model
  const laneIndex = model.lanes.findIndex((l) => (l.part ?? 0) === target.part)
  const lane = model.lanes[laneIndex]
  if (!lane || model.steps < 1) return null
  const last = model.steps - 1
  const edited = toggleCell(model, laneIndex, last, !lane.cells[last])
  let out: string | null
  try {
    out = serializeStepGrid(edited)
  } catch {
    return null
  }
  if (out === null) return null
  const prefix = src.slice(0, target.start)
  return out.startsWith(prefix) ? null : { mini: src, out, prefix }
}

/* ── the roll ──────────────────────────────────────────────────── */

/**
 * The Piano Roll's own edit: drag a note to a new pitch. Mirrors
 * `PianoRollGrid.tsx`'s pointer-up — `[...baseNotes, { pitch, start, duration }]`
 * — including that it builds a FRESH note rather than mutating one, which is
 * why the writer cannot identify notes by index and this probe cannot either.
 *
 * A drag is the right gesture here where the grid uses a cell flip: it touches
 * nothing but its own note. `placeNote` would have been the closer analogue and
 * is the wrong tool — it trims an earlier note that sustains across the target,
 * which changes an earlier element LEGITIMATELY, and a probe that called it
 * would report those as violations.
 */
function dragPitch(m: PianoRollModel, note: RollNote, pitch: string): PianoRollModel {
  return {
    ...m,
    notes: [
      ...m.notes.filter((n) => n !== note),
      { pitch, start: note.start, duration: note.duration },
    ],
  }
}

/** a pitch in the model's own convention (#469) that isn't already at `start` */
function freshPitch(m: PianoRollModel, start: number): string | null {
  const at = m.notes.filter((n) => n.start === start).map((n) => n.pitch)
  const cands = m.numeric ? ['0', '1', '2', '3', '4'] : ['c4', 'd4', 'e4', 'f4', 'g4']
  return cands.find((p) => !at.includes(p)) ?? null
}

/**
 * Why a roll mini isn't probed. Named rather than counted: an applicability
 * filter is a silent scope reduction, and the shape it drops is exactly where a
 * bug hides — so these get PRINTED, because `applicable: N` invites nobody to
 * ask "N of what?".
 */
const REJECTS = [
  'roll does not open it',
  'no neighbour to preserve (a lone element)',
  'the last element/bar sounds no note (a rest — the drag would land elsewhere)',
  'last part has no note identifiable in the model',
  'no fresh pitch available',
  'serializer returned null',
] as const
type Reject = (typeof REJECTS)[number]

/**
 * Drag one note inside the last element (flat) or the last part (a `,`-stack),
 * and see what happened to everything written before it.
 *
 * WHICH NOTE, and why it is sound to call it "the last element's":
 *   - element — the note with the greatest START. Elements own disjoint column
 *     ranges in time order, so if the last element sounds anything at all, the
 *     latest-starting note in the whole model is one of its own. Whether it
 *     sounds anything is answered by parsing that ONE element's bytes (krill
 *     gave us its span) and asking if it yields a note — never by our column
 *     accounting, which is the code under test.
 *
 *     "The note AT the last column" was the first cut and it was wrong: `c4*2 e4`
 *     is four columns, and `e4` starts at 2 and sustains to 4. It dropped 55
 *     minis for having no note at their last column, which is not a fact about
 *     them — it is `div` arithmetic leaking into the probe.
 *   - part — parse the last part's own source text (the slice from its first
 *     element) and map its notes onto the shared grid by the ratio of the two
 *     step counts. Arithmetic, not a second grammar.
 */
function rollProbe(mini: string): Violation | Reject | null {
  const src = mini.trim()
  const target = lastElement(src)
  if (target === null) return 'no neighbour to preserve (a lone element)'
  const r = parsePianoRoll(src)
  if (!r.ok) return 'roll does not open it'
  const model = r.model
  if (model.steps < 1 || model.notes.length === 0) return 'roll does not open it'

  let note: RollNote | undefined
  if (target.kind === 'element') {
    // does the last element/bar sound anything? ask its own bytes
    const tail = parsePianoRoll(src.slice(target.start, target.end).trim())
    if (!tail.ok || tail.model.notes.length === 0) {
      return 'the last element/bar sounds no note (a rest — the drag would land elsewhere)'
    }
    const latest = Math.max(...model.notes.map((n) => n.start))
    note = model.notes.find((n) => n.start === latest)
  } else {
    // the last part, standing alone — its notes in its OWN column space
    const tail = parsePianoRoll(src.slice(target.start).trim())
    if (!tail.ok || tail.model.steps < 1 || tail.model.notes.length === 0) {
      return 'last part has no note identifiable in the model'
    }
    const factor = model.steps / tail.model.steps
    if (!Number.isInteger(factor)) return 'last part has no note identifiable in the model'
    for (const n of tail.model.notes) {
      const found = model.notes.find((x) => x.pitch === n.pitch && x.start === n.start * factor)
      if (found) {
        note = found
        break
      }
    }
    if (!note) return 'last part has no note identifiable in the model'
  }
  if (!note) return 'last part has no note identifiable in the model'

  const pitch = freshPitch(model, note.start)
  if (pitch === null) return 'no fresh pitch available'
  let out: string | null
  try {
    out = serializePianoRoll(dragPitch(model, note, pitch))
  } catch {
    return 'serializer returned null'
  }
  if (out === null) return 'serializer returned null'
  const prefix = src.slice(0, target.start)
  return out.startsWith(prefix) ? null : { mini: src, out, prefix }
}

const isReject = (x: Violation | Reject | null): x is Reject =>
  typeof x === 'string' && (REJECTS as readonly string[]).includes(x)

const rollOutcomes = corpus.minis.map(({ mini }) => rollProbe(mini))
const rollRows = rollOutcomes.filter((v): v is Violation => v !== null && !isReject(v))

/**
 * What the filter THREW AWAY, itemised. The count of what a sweep accepted is
 * the one line anybody reads and the one that cannot confess anything: this
 * probe's ancestor reported `applicable: 248` while silently dropping all 63
 * `,`-stacks, and the bug it was written for was living in that hole.
 */
const rollRejects = REJECTS.map((r) => ({
  reason: r,
  n: rollOutcomes.filter((x) => x === r).length,
})).filter((x) => x.n > 0)

const rows = corpus.minis
  .map(({ mini }) => probe(mini))
  .filter((v): v is Violation => v !== null)

const applicable = corpus.minis.filter(({ mini }) => {
  const src = mini.trim()
  const t = lastElement(src)
  if (t === null) return false
  const r = parseStepGrid(src)
  return r.ok && r.model.lanes.some((l) => (l.part ?? 0) === t.part) && r.model.steps > 0
}).length

/* ── the roll ──────────────────────────────────────────────────── */

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

  /**
   * A `,`-part is an independent voice. Painting into one at a resolution its
   * own notation cannot hold means THAT part must be rewritten — and it means
   * nothing whatsoever for the voice beside it.
   *
   * `bd sd` is two columns against `hh*4`'s four, so the grid shows four and
   * column 1 is off `bd sd`'s own grid. Part 0 re-emits at the shared
   * resolution; `hh*4` is not part of that conversation.
   */
  it('grid: painting into one `,`-part does not rewrite the part beside it', () => {
    const r = parseStepGrid('bd sd, hh*4')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const edited = toggleCell(r.model, 0, 1, true) // lane 0 = bd (part 0)
    expect(serializeStepGrid(edited)).toBe('bd bd sd ~, hh*4')
  })

  /**
   * THE SAME LAW, THE OTHER VIEW. The roll's writer rebuilds the whole mini from
   * its model exactly as the grid's used to, so this is not a new property — it
   * is the property the grid already holds, asserted on the view that does not
   * hold it yet (#916).
   */
  it('roll: dragging a note leaves every earlier element byte-identical', () => {
    const report = rollRows
      .slice(0, 12)
      .map(
        (v) =>
          `  ${JSON.stringify(v.mini)}\n     ->   ${JSON.stringify(v.out)}\n     kept?  ${JSON.stringify(v.prefix)}`,
      )
      .join('\n')
    const dropped = rollRejects.map((r) => `     ${String(r.n).padStart(4)}  ${r.reason}`).join('\n')
    expect(
      rollRows.length,
      `${rollRows.length} of ${rollRows.length + rollOutcomes.filter((x) => x === null).length}` +
        ` probed minis lose notation OUTSIDE the edited element.\n${report}\n` +
        `\n   NOT probed, and why (the filter's rejects — read these, they are where the next bug hides):\n${dropped}`,
    ).toBe(0)
  })

  /**
   * The named case, next to the sweep for the same reason as the grid's: a sweep
   * tells you HOW MANY and a case tells you WHAT. `hh*2`'s roll analogue — an
   * element whose sugar the model cannot hold, sitting beside the edit.
   */
  it('roll: `c4*2 e4` keeps its `*2` when the drag lands on the `e4`', () => {
    const r = parsePianoRoll('c4*2 e4')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // `c4*2` makes this FOUR columns, so `e4` starts at 2 and sustains to 4 —
    // the last note, not a note at the last column.
    const latest = Math.max(...r.model.notes.map((n) => n.start))
    const last = r.model.notes.find((n) => n.start === latest)!
    expect(serializePianoRoll(dragPitch(r.model, last, 'g4'))).toBe('c4*2 g4')
  })

  /**
   * A `,`-stack in the roll is 12 real minis and every one is a chord (`0,2,4`).
   * They are here because the grid's stacks were EXCLUDED by the first version of
   * this file and a live bug was in that hole — a shape a gate cannot see is a
   * shape its green says nothing about. Dragging the last part's note must leave
   * the parts beside it exactly as the user typed them.
   */
  it('roll: dragging one `,`-part`s note does not rewrite the part beside it', () => {
    const r = parsePianoRoll('0,2,4')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const note = r.model.notes.find((n) => n.pitch === '4')!
    expect(serializePianoRoll(dragPitch(r.model, note, '5'))).toBe('0,2,5')
  })
})
