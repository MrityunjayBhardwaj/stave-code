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
import { tailToken } from '../../../editor/src/visualEdit/notation/parse'
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
  // A `:`-variant is krill's ARRAY value (`["bd", 3]`), and it used to land in the
  // `object` branch below with no `.s`/`.note`/`.n` — so it returned null, which
  // `enginePlayedCycle` reads as "this whole mini is unreadable" and the probe then
  // reports `no-readable-haps` for a pattern that plays perfectly well (#1021).
  //
  // Named through the READERS' OWN rule rather than a local copy: a second
  // implementation of the same grammar question is exactly how the instrument
  // drifts from the thing it measures, and an oracle that is more permissive than
  // production is a divergence just as much as a stricter one. Joining rather than
  // taking the head is what keeps `bd:3` distinct from `bd:1`, so a write-back that
  // drops or changes the index is still caught as a corruption instead of matching.
  if (Array.isArray(v)) return tailToken(v)?.toLowerCase() ?? null
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
 * The onsets a mini plays in ONE given cycle, or null if it won't reify / has an atom
 * we can't name.
 *
 * POSITIONS ARE ABSOLUTE — cycle 2's downbeat is `pos = 2`, not `0`. This comment used
 * to say "normalised into [0,1)" and that was simply false; it went unnoticed because
 * the only caller that reads a position back out is `probeEdit`, which reads cycle 0,
 * where the two frames coincide. The first caller to read a LATER cycle (`liveness`,
 * #1020) trusted the comment, derived a column from an absolute position, and produced
 * a plausible corruption rate for views that are perfectly fine. Callers that need a
 * cycle-local offset must subtract the cycle themselves.
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
  /**
   * `steps / bars` is not a whole number, so there is no column to probe.
   *
   * DEFENSIVE — measured at **0 firings over both populations** (the 1217
   * core-served asks and the 2783 core-refused ones). Kept because the hazard is
   * real and silent if it ever occurs: `Math.round(pos * perBar)` on a fractional
   * `perBar` probes the WRONG column and the edit is then verified against a note
   * nobody deleted, which passes. A guard whose absence would be invisible is
   * exactly the one to keep after measuring that it does not fire.
   */
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
  return probeDeleteAt(mini, model, s, 0, pos)
}

/**
 * Delete the note this mini plays at `pos` within cycle `bar`, and require every bar
 * to come back as predicted.
 *
 * THE ONE delete-and-verify rule. `probeEdit` is this called at (bar 0, the first
 * cleanly-singleton onset); `liveness` is this called at EVERY singleton onset of
 * every bar. They ask different questions — "does one modelled edit survive" versus
 * "how much of this view responds" — and the answer to both is the same comparison,
 * so it is written once. A second copy would be a second oracle for the question this
 * file exists to define ([[PV192]]), and the census has already been bitten once by an
 * instrument that named things its own way ([[P347]]).
 *
 * `bar` is the model bar the delete targets and `pos` is the note's position in the
 * ABSOLUTE frame `enginePlayedCycle` reports — cycle 2's downbeat is `2`, not `0`. The
 * column is therefore `bar * perBar + round((pos - bar) * perBar)`: the cycle offset
 * has to come out before scaling and go back in as whole bars, because on a
 * bar-expanded model `steps` spans every bar. At `bar = 0` this is exactly
 * `round(pos * perBar)`, which is what `probeEdit` has always computed.
 */
export function probeDeleteAt(
  mini: string,
  model: StepGridModel & PianoRollModel,
  s: Surface,
  bar: number,
  pos: number,
): EditProbe {
  const bars = model.bars ?? 1
  const perBar = model.steps / bars
  if (!Number.isInteger(perBar)) return { verdict: 'no-probe', why: 'non-integer-per-bar' }
  const out = s.del(model, bar * perBar + Math.round((pos - bar) * perBar))
  if (out === null) return { verdict: 'no-probe', why: 'writer-declined' }

  for (let b = 0; b < bars; b++) {
    const want = enginePlayedCycle(mini, b)
    const got = enginePlayedCycle(out, b)
    if (want === null || got === null) return { verdict: 'corrupt', out }
    // the deleted note is gone from the bar it was deleted in; every other bar is
    // untouched. `pos` and `n.pos` are both absolute, so they compare directly.
    const expected =
      b === bar
        ? want.filter((n) => Math.round(n.pos * HRES) !== Math.round(pos * HRES))
        : want
    if (sig(got, s.durAware) !== sig(expected, s.durAware)) return { verdict: 'corrupt', out }
  }
  return { verdict: 'ok', out }
}

/**
 * How much of a view actually RESPONDS — the fraction of its cleanly-singleton notes
 * whose own delete round-trips, over every bar the model spans.
 *
 * `probeEdit` answers "is this view editable at all", which is one note. That is the
 * right question for a reach floor and the wrong one for "is this view worth showing":
 * the roll cap was left at 4 partly because the views a raise opened were only
 * **13–58% live** ([[PV222]]), and a one-note probe cannot see that. This is that
 * measurement, defined once so a sweep and a gate cannot disagree about it.
 *
 * Chorded positions are not probed and not counted — they are `probeEdit`'s
 * `fully-chorded`, unverified rather than dead — so `probed` is the honest
 * denominator and a view with none is reported as `null` rather than as 0%.
 *
 * `corrupt` IS REPORTED SEPARATELY, and it is the reason this is worth running at all
 * beyond the liveness number. `probeEdit` verifies ONE note per view; a note it never
 * probed can still mis-write, and that loss is invisible to every reach figure in the
 * project. A note that is merely declined is a dead cell — disappointing. A note that
 * corrupts is the view lying about the document, and the two must not share a bucket.
 */
export function liveness(
  mini: string,
  model: StepGridModel & PianoRollModel,
  s: Surface,
): { alive: number; probed: number; corrupt: number } | null {
  const bars = model.bars ?? 1
  const perBar = model.steps / bars
  if (!Number.isInteger(perBar)) return null
  let alive = 0
  let probed = 0
  let corrupt = 0
  for (let b = 0; b < bars; b++) {
    const played = enginePlayedCycle(mini, b)
    if (played === null) return null
    const counts = new Map<number, number>()
    for (const n of played) {
      const k = Math.round(n.pos * HRES)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    for (const [k, c] of counts) {
      if (c !== 1) continue // a chord — unverifiable, not dead
      probed++
      const v = probeDeleteAt(mini, model, s, b, k / HRES).verdict
      if (v === 'ok') alive++
      else if (v === 'corrupt') corrupt++
    }
  }
  return probed === 0 ? null : { alive, probed, corrupt }
}
