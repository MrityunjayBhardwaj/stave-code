/**
 * writer-reach.test.ts — the committed FLOOR on how much of the real-world corpus
 * the behaviour projection makes EDITABLE, not merely parseable.
 *
 * PARSE-reach (edit-coverage.spec.ts) counts units whose SYNTAX we model. This
 * gate counts WRITER-reach: units the syntactic model REFUSES, that the inherited
 * projection (#922 grid / #924 roll) opens by showing what they PLAY, AND that
 * survive an edit — the write-back re-emits a pattern the ENGINE plays as intended.
 * The two diverge by roughly 40%: a pattern can parse-open and still corrupt on the
 * first click (the #904 class), so "can be viewed" is not "can be edited".
 *
 * WHAT IS MEASURED, through the REAL shipped code — never an inline re-implementation
 * of the projection, which would be a second oracle that can only agree with itself:
 *   refused   — `parse{StepGrid,PianoRoll}Core` says .ok = false (the denominator)
 *   projected — `parse{StepGrid,PianoRoll}` (core → projection fallback) says .ok
 *   editOk    — a modeled edit round-trips: the serialized document, RE-QUERIED
 *               through the real engine, plays exactly the edited note set
 *
 * THE ORACLE is the engine on BOTH sides: expected = what the original pattern plays
 * MINUS the deleted note; got = what the edited document plays. Never a re-parsed
 * column grid — `[~ 1@2]` and `[~ ~ 1@4]` are the same music at two resolutions, and
 * a column compare would false-flag a faithful re-spelling.
 *
 * The compare is per each view's OWN editable axes. The ROLL models duration (`@n`),
 * so its probe is duration-aware — the full (onset, duration, atom) multiset, so a
 * lost `@n` is caught even when the onset count is unchanged. The GRID is an ONSET
 * instrument — elongation is explicitly outside its subset (the core refuses `@n`),
 * so a nested `[hh ~]!16` shows sixteen faithful onsets and its per-cell duration is
 * not the grid's to preserve; its probe compares (onset, atom).
 *
 * THE ASSERTION is a FLOOR, not a snapshot: editOk must not fall below the reach
 * observed when this gate was written. A grammar/subset change that quietly closes
 * units the projection used to open turns this red. The per-reason breakdown is
 * printed as diagnostics — it says WHICH refusals the projection is buying back.
 *
 * DISTRIBUTION, not a hand-picked window: the full committed mini-corpus (1500 real
 * harvested units), both surfaces, is swept.
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
} from '../../../editor/src/visualEdit/notation/parse'
import {
  serializeStepGrid,
  serializePianoRoll,
} from '../../../editor/src/visualEdit/notation/serialize'
import type {
  ParseResult,
  PianoRollModel,
  StepGridModel,
} from '../../../editor/src/visualEdit/notation/model'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/**
 * The reach FLOOR — the writer-reach observed when this gate was written, over the
 * committed corpus. editOk must never fall below it; a projection that closes units
 * it used to open turns this red. Raise it (never lower it silently) when a genuine
 * reach gain is shipped and re-observed.
 */
const FLOOR_STEP = 80
const FLOOR_ROLL = 24

/* ── the engine oracle: what a mini PLAYS in cycle 0 (onset, duration, atom) ── */

const HRES = 720720
type Note = { pos: number; dur: number; atom: string }
/**
 * The equivalence key, per the surface's OWN editable contract — mirroring what
 * the shipped projection reads back, never a stricter oracle of our own:
 *
 *  - ROLL (`durAware`): a duration-carrying MULTISET of (onset, dur, atom). The
 *    roll has `@n`, so a dropped elongation must show; its projection is
 *    overlap-free by construction, so a multiset is exact.
 *  - GRID: an onset SET of (onset, atom). A cell grid holds a hit or not — it
 *    cannot hold two identical hits at one instant, so `hh(<3,7>,16)` (which
 *    superimposes euclid(3) and euclid(7), doubling some hits) collapses to one
 *    per column, exactly as `gridOnsets` dedupes. Duration is not the grid's axis.
 */
const sig = (rows: Note[], durAware: boolean): string => {
  const keys = rows.map((r) =>
    durAware ? `${Math.round(r.pos * HRES)}|${Math.round(r.dur * HRES)}|${r.atom}` : `${Math.round(r.pos * HRES)}|${r.atom}`,
  )
  return JSON.stringify((durAware ? keys : [...new Set(keys)]).sort())
}

/** the played atom, however the value carries it — a sound, a MIDI note, a degree */
function atomOf(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v.toLowerCase()
  if (typeof v === 'object') {
    const o = v as { s?: unknown; note?: unknown; n?: unknown }
    if (o.s !== undefined) return String(o.s).toLowerCase()
    if (o.note !== undefined) return String(o.note).toLowerCase()
    if (o.n !== undefined) return String(o.n)
  }
  return null
}

interface Hap {
  hasOnset?: () => boolean
  whole?: { begin: { valueOf(): number }; end: { valueOf(): number } }
  part?: { begin: { valueOf(): number } }
  value: unknown
}

/** the onset notes a mini plays in cycle 0, or null if it won't reify / has an atom we can't name */
function enginePlayed(src: string): Note[] | null {
  return enginePlayedCycle(src, 0)
}

/**
 * The onsets a mini plays in ONE given cycle, positions normalised into `[0,1)`.
 *
 * A bar-expanded projection (#930) shows several cycles at once, so verifying an
 * edit against cycle 0 alone would miss a write-back that corrupts a LATER bar —
 * the exact silent multi-cycle loss the projection has to be trusted not to do.
 */
function enginePlayedCycle(src: string, cyc: number): Note[] | null {
  let haps: Hap[]
  try {
    haps = (reifyMini(src) as { queryArc(a: number, b: number): Hap[] }).queryArc(cyc, cyc + 1)
  } catch {
    return null
  }
  const out: Note[] = []
  for (const h of haps) {
    const onset = h.hasOnset?.() ?? (!!h.whole && !!h.part && Math.abs(h.whole.begin.valueOf() - h.part.begin.valueOf()) < 1e-9)
    if (!onset || !h.whole) continue
    const atom = atomOf(h.value)
    if (atom === null) return null
    out.push({ pos: h.whole.begin.valueOf(), dur: h.whole.end.valueOf() - h.whole.begin.valueOf(), atom })
  }
  return out
}

/** an onset position that plays exactly ONE note — deleting the model element there removes exactly that hap */
function singletonPos(base: Note[]): number | null {
  const counts = new Map<number, number>()
  for (const n of base) counts.set(Math.round(n.pos * HRES), (counts.get(Math.round(n.pos * HRES)) ?? 0) + 1)
  for (const n of base) if (counts.get(Math.round(n.pos * HRES)) === 1) return n.pos
  return null
}

/* ── the modeled delete, per surface — the real UI edit through the real writer ── */

/**
 * Delete the single note sounding at model column `col`; null if not a clean
 * single-note target.
 *
 * The COLUMN is passed in rather than derived from a cycle-0 position, because on
 * a bar-expanded model `steps` spans every bar — `pos * steps` would stretch a
 * cycle-0 onset across the whole grid and probe the wrong column.
 */
function deleteFromRoll(model: PianoRollModel, col: number): string | null {
  const here = model.notes.filter((n) => n.start === col)
  if (here.length !== 1) return null // chord / no note starts here — not our clean target
  const edited: PianoRollModel = { ...model, notes: model.notes.filter((n) => n !== here[0]) }
  return serializePianoRoll(edited)
}

/** clear the single lane on at model column `col`; null if not a clean single-lane target */
function deleteFromGrid(model: StepGridModel, col: number): string | null {
  const on = model.lanes.filter((l) => l.cells[col])
  if (on.length !== 1) return null
  const edited: StepGridModel = {
    ...model,
    lanes: model.lanes.map((l) => (l === on[0] ? { ...l, cells: l.cells.map((c, j) => (j === col ? false : c)) } : l)),
  }
  return serializeStepGrid(edited)
}

/* ── the sweep ──────────────────────────────────────────────────────────────── */

interface Surface {
  key: 'step' | 'roll'
  durAware: boolean
  core: (m: string) => ParseResult<StepGridModel | PianoRollModel>
  full: (m: string) => ParseResult<StepGridModel | PianoRollModel>
  del: (model: StepGridModel & PianoRollModel, pos: number) => string | null
}

const SURFACES: Surface[] = [
  {
    key: 'step',
    durAware: false, // an onset instrument — the grid has no duration axis
    core: parseStepGridCore,
    full: parseStepGrid,
    del: (m, pos) => deleteFromGrid(m, pos),
  },
  {
    key: 'roll',
    durAware: true, // `@n` elongation — duration is the roll's to preserve
    core: parsePianoRollCore,
    full: parsePianoRoll,
    del: (m, pos) => deleteFromRoll(m, pos),
  },
]

interface Tally {
  refused: number
  projected: number
  editOk: number
  refusedReasons: Map<string, number>
  reachByReason: Map<string, number>
  losses: string[]
}
const blank = (): Tally => ({
  refused: 0,
  projected: 0,
  editOk: 0,
  refusedReasons: new Map(),
  reachByReason: new Map(),
  losses: [],
})

function sweep(s: Surface): Tally {
  const t = blank()
  for (const mini of minis) {
    const core = s.core(mini)
    if (core.ok) continue // the core writer's surface — tested elsewhere
    const reason = core.reason
    const r = s.full(mini)
    const m = r.ok ? (r.model as StepGridModel & PianoRollModel) : null
    t.refused++
    t.refusedReasons.set(reason, (t.refusedReasons.get(reason) ?? 0) + 1)
    if (m === null) continue // projection did not open it
    t.projected++

    // Bar-expanded projections (#930) show `bars` cycles at once. `steps` then spans
    // every bar, so the probe column comes from the PER-BAR width, and the edit is
    // checked against every bar — a delete in bar 0 that quietly rewrites bar 1 is
    // the multi-cycle loss this gate exists to catch, and comparing cycle 0 alone
    // would call it a pass.
    const bars = m.bars ?? 1
    const perBar = m.steps / bars
    if (!Number.isInteger(perBar)) continue

    // edit round-trip verified through the real engine on both sides
    const base = enginePlayed(mini)
    if (base === null || base.length === 0) continue
    const pos = singletonPos(base)
    if (pos === null) continue // fully chorded — no clean single-note delete probe
    const out = s.del(m, Math.round(pos * perBar))
    if (out === null) continue // the writer declined (a safe no-op) — not counted as reach
    let ok = true
    for (let b = 0; b < bars && ok; b++) {
      const want = enginePlayedCycle(mini, b)
      const got = enginePlayedCycle(out, b)
      if (want === null || got === null) {
        ok = false
        break
      }
      // the deleted note is gone from bar 0; every other bar is untouched
      const expected =
        b === 0
          ? want.filter((n) => Math.round(n.pos * HRES) !== Math.round(pos * HRES))
          : want
      ok = sig(got, s.durAware) === sig(expected, s.durAware)
    }
    if (ok) {
      t.editOk++
      t.reachByReason.set(reason, (t.reachByReason.get(reason) ?? 0) + 1)
    } else if (t.losses.length < 20) {
      t.losses.push(`${JSON.stringify(mini)}  edit→${JSON.stringify(out)}`)
    }
  }
  return t
}

function report(name: string, t: Tally, floor: number): void {
  console.log(`\n===== WRITER-REACH: ${name} (${minis.length} corpus units) =====`)
  console.log(`  refused by the syntactic model: ${t.refused}`)
  console.log(`  projected to an editable view:  ${t.projected}`)
  console.log(`  edit round-trips correctly:     ${t.editOk}   (floor ${floor})   <-- writer-reach`)
  console.log(`  -- refused-reason histogram (denominator) --`)
  for (const [k, v] of [...t.refusedReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`     ${String(v).padStart(3)}x  ${k}`)
  console.log(`  -- writer-reach bought back, by refused reason --`)
  for (const [k, v] of [...t.reachByReason.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`     +${String(v).padStart(2)}  ${k}`)
  if (t.losses.length) {
    console.log(`  -- LOSSES sample (${t.losses.length}) --`)
    t.losses.forEach((l) => console.log(`     ✗ ${l}`))
  }
}

describe('writer-reach — the projection makes real refused units editable, and edits survive', () => {
  const step = sweep(SURFACES[0])
  const roll = sweep(SURFACES[1])

  it('step grid: projection reach holds at or above the floor', () => {
    report('step grid (#922)', step, FLOOR_STEP)
    // every projected unit that got a clean probe must round-trip — no partial credit
    expect(step.losses, step.losses.join('\n')).toEqual([])
    expect(step.editOk, `step writer-reach ${step.editOk} fell below floor ${FLOOR_STEP}`).toBeGreaterThanOrEqual(FLOOR_STEP)
  })

  it('piano roll: projection reach holds at or above the floor', () => {
    report('piano roll (#924)', roll, FLOOR_ROLL)
    expect(roll.losses, roll.losses.join('\n')).toEqual([])
    expect(roll.editOk, `roll writer-reach ${roll.editOk} fell below floor ${FLOOR_ROLL}`).toBeGreaterThanOrEqual(FLOOR_ROLL)
  })
})
