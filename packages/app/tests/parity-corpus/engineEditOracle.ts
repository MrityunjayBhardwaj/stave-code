/**
 * engineEditOracle.ts — THE ONE definition of "a modelled edit survived".
 *
 * Extracted from `writer-reach.test.ts` (#1009) because a second consumer now
 * needs it: the writer census asks the SAME question of a different writer, and
 * two copies of an edit oracle are two oracles that can only agree with
 * themselves ([[PV192]]). The extraction is verdict-neutral by construction —
 * `writer-reach` calls this and must still read exactly 131 / 73 with no losses.
 *
 * WHAT IT MEASURES, and it is deliberately narrow: delete ONE cleanly-singleton
 * note through the REAL writer, then re-query the emitted document through the
 * REAL engine, and require every bar to play the original minus that note.
 *
 * THE ORACLE IS THE ENGINE ON BOTH SIDES. `want` is what the original mini plays;
 * `got` is what the edited document plays. Never a re-parsed column grid —
 * `[~ 1@2]` and `[~ ~ 1@4]` are the same music at two resolutions and a column
 * compare would false-flag a faithful re-spelling ([[P301]]).
 *
 * "NO CLEAN PROBE" IS ITS OWN VERDICT, NOT A FAILURE. A fully-chorded pattern, a
 * non-integer per-bar width, or a writer that declines the delete are all
 * UNVERIFIED — neither reach nor a loss ([[PK59]] step 5). The census reports that
 * bucket separately and names which of the four reasons applied, because folding
 * it into either side is how an unproven unit becomes a proven one.
 */
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import {
  serializeStepGrid,
  serializePianoRoll,
} from '../../../editor/src/visualEdit/notation/serialize'
import type { PianoRollModel, StepGridModel } from '../../../editor/src/visualEdit/notation/model'

export const HRES = 720720

export type Note = { pos: number; dur: number; atom: string }

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
export const sig = (rows: Note[], durAware: boolean): string => {
  const keys = rows.map((r) =>
    durAware
      ? `${Math.round(r.pos * HRES)}|${Math.round(r.dur * HRES)}|${r.atom}`
      : `${Math.round(r.pos * HRES)}|${r.atom}`,
  )
  return JSON.stringify((durAware ? keys : [...new Set(keys)]).sort())
}

/** the played atom, however the value carries it — a sound, a MIDI note, a degree */
export function atomOf(v: unknown): string | null {
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

/**
 * The onsets a mini plays in ONE given cycle, positions normalised into `[0,1)`,
 * or null if it won't reify / has an atom we can't name.
 *
 * A bar-expanded projection (#930) shows several cycles at once, so verifying an
 * edit against cycle 0 alone would miss a write-back that corrupts a LATER bar —
 * the exact silent multi-cycle loss the projection has to be trusted not to do.
 */
export function enginePlayedCycle(src: string, cyc: number): Note[] | null {
  let haps: Hap[]
  try {
    haps = (reifyMini(src) as { queryArc(a: number, b: number): Hap[] }).queryArc(cyc, cyc + 1)
  } catch {
    return null
  }
  const out: Note[] = []
  for (const h of haps) {
    const onset =
      h.hasOnset?.() ??
      (!!h.whole &&
        !!h.part &&
        Math.abs(h.whole.begin.valueOf() - h.part.begin.valueOf()) < 1e-9)
    if (!onset || !h.whole) continue
    const atom = atomOf(h.value)
    if (atom === null) return null
    out.push({
      pos: h.whole.begin.valueOf(),
      dur: h.whole.end.valueOf() - h.whole.begin.valueOf(),
      atom,
    })
  }
  return out
}

export const enginePlayed = (src: string): Note[] | null => enginePlayedCycle(src, 0)

/** an onset position that plays exactly ONE note — deleting the model element there removes exactly that hap */
export function singletonPos(base: Note[]): number | null {
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
export function deleteFromRoll(model: PianoRollModel, col: number): string | null {
  const here = model.notes.filter((n) => n.start === col)
  if (here.length !== 1) return null // chord / no note starts here — not our clean target
  const edited: PianoRollModel = { ...model, notes: model.notes.filter((n) => n !== here[0]) }
  return serializePianoRoll(edited)
}

/** clear the single lane on at model column `col`; null if not a clean single-lane target */
export function deleteFromGrid(model: StepGridModel, col: number): string | null {
  const on = model.lanes.filter((l) => l.cells[col])
  if (on.length !== 1) return null
  const edited: StepGridModel = {
    ...model,
    lanes: model.lanes.map((l) =>
      l === on[0] ? { ...l, cells: l.cells.map((c, j) => (j === col ? false : c)) } : l,
    ),
  }
  return serializeStepGrid(edited)
}

/* ── the probe ──────────────────────────────────────────────────────────────── */

/**
 * Why a model got no clean single-note delete probe. Each is UNVERIFIED, and each
 * is a different fact about the model — a census that reports one number for all
 * four cannot say whether a writer is untested or untestable.
 */
export type NoProbeReason =
  /** `steps / bars` is not a whole number, so there is no column to probe */
  | 'non-integer-per-bar'
  /** the mini plays nothing, or plays a value we cannot name */
  | 'no-readable-haps'
  /** every onset is a chord — no position plays exactly one note */
  | 'fully-chorded'
  /** the writer declined the delete (a safe no-op), which is not reach */
  | 'writer-declined'

export type EditProbe =
  | { verdict: 'ok'; out: string }
  | { verdict: 'corrupt'; out: string }
  | { verdict: 'no-probe'; why: NoProbeReason }

export interface Surface {
  key: 'step' | 'roll'
  /** the roll models `@n`, so a lost elongation must show; the grid is onset-only */
  durAware: boolean
  del: (model: StepGridModel & PianoRollModel, col: number) => string | null
}

export const GRID_SURFACE: Surface = {
  key: 'step',
  durAware: false, // an onset instrument — the grid has no duration axis
  del: (m, col) => deleteFromGrid(m, col),
}

export const ROLL_SURFACE: Surface = {
  key: 'roll',
  durAware: true, // `@n` elongation — duration is the roll's to preserve
  del: (m, col) => deleteFromRoll(m, col),
}

/**
 * Delete one cleanly-singleton note from `model` through the real writer and ask
 * the engine whether the emitted document plays the original minus that note, in
 * EVERY bar the model spans.
 *
 * `mini` is the source the model was read from; `model` is whichever writer's
 * model is under test. The two are passed separately on purpose: the census hands
 * in a DIFFERENT writer's model for the same mini, which is the whole
 * counterfactual.
 */
export function probeEdit(
  mini: string,
  model: StepGridModel & PianoRollModel,
  s: Surface,
): EditProbe {
  // Bar-expanded projections (#930) show `bars` cycles at once. `steps` then spans
  // every bar, so the probe column comes from the PER-BAR width, and the edit is
  // checked against every bar — a delete in bar 0 that quietly rewrites bar 1 is
  // the multi-cycle loss this gate exists to catch, and comparing cycle 0 alone
  // would call it a pass.
  const bars = model.bars ?? 1
  const perBar = model.steps / bars
  if (!Number.isInteger(perBar)) return { verdict: 'no-probe', why: 'non-integer-per-bar' }

  const base = enginePlayed(mini)
  if (base === null || base.length === 0) return { verdict: 'no-probe', why: 'no-readable-haps' }
  const pos = singletonPos(base)
  if (pos === null) return { verdict: 'no-probe', why: 'fully-chorded' }
  const out = s.del(model, Math.round(pos * perBar))
  if (out === null) return { verdict: 'no-probe', why: 'writer-declined' }

  for (let b = 0; b < bars; b++) {
    const want = enginePlayedCycle(mini, b)
    const got = enginePlayedCycle(out, b)
    if (want === null || got === null) return { verdict: 'corrupt', out }
    // the deleted note is gone from bar 0; every other bar is untouched
    const expected =
      b === 0
        ? want.filter((n) => Math.round(n.pos * HRES) !== Math.round(pos * HRES))
        : want
    if (sig(got, s.durAware) !== sig(expected, s.durAware)) return { verdict: 'corrupt', out }
  }
  return { verdict: 'ok', out }
}
