/**
 * resolution.ts — pure ×2 / ÷2 grid-resolution transforms (#479).
 *
 * A flat Strudel sequence conflates LENGTH and RESOLUTION: the token count IS
 * the number of equal cycle subdivisions, so `s("bd ~ sn ~ bd")` is exactly 5
 * slots and appending a token re-times every event (grounded with real haps in
 * #479). The only RATIO-PRESERVING way to change the slot count — the standard
 * step-sequencer "Rate / resolution" control (Logic, Elektron) decoupled from
 * length — is an integer resolution change:
 *
 *   ×2  each slot splits into two; every hit keeps its position, the new
 *       in-between slots are empty (editable). `bd ~ sn` → `bd ~ ~ ~ sn ~`.
 *   ÷2  the inverse, and LOSSLESS only when every odd column is empty (a step
 *       grid) / every note starts and lasts an even number of columns (a roll).
 *       Otherwise it would drop or shorten notes, so it's disabled (the `canHalve*`
 *       predicates) — an honest control, never a silent corruption.
 *
 * Verified against real `@strudel` haps (#479): the doubled model serializes to
 * onsets byte-identical to the source — `bd ~ sn ~ bd` and its ×2 both query to
 * `[0, 0.4, 0.8]`; `note("c3 e3 g3")` and `note("c3@2 e3@2 g3@2")` both to
 * `[0, ⅓, ⅔]`. Roll notes scale duration too (a held `@n` keeps its time span).
 *
 * Pure (no React, no DOM), in the `notation/` model-op family alongside
 * `lane.ts` / `place.ts` / `resize.ts`: a transform returns the SAME model
 * reference when it can't apply, so `useGridModel.mutate` skips the write and
 * the document is left untouched.
 */
import { cellOn, clampLane, isCellOn, scaleCell } from './model'
import type { PianoRollModel, RollNote, StepCell, StepGridModel } from './model'
import { ifGridSpellable, ifRollSpellable } from './serialize'
import { MAX_VIEW_STEPS, documentSteps, type ViewScale } from './viewResolution'

/** which way the resolution control scales the grid */
export type ResolutionDir = 'double' | 'halve'

/**
 * Cap on the doubled column count. A flat grid past this is unwieldy to edit and
 * the serialized mini grows linearly, so `canDouble*` stops here rather than let
 * repeated ×2 run away. 256 columns = a 16-bar 1/16 grid, well beyond the grids'
 * editable range.
 */
export const MAX_RESOLUTION_STEPS = 256

/** columns per bar (≥1); 1 when single-cycle. Used to keep `<...>` bars integral. */
function perBar(steps: number, bars?: number): number {
  return bars && bars > 0 ? steps / bars : steps
}

/* ── step grid ─────────────────────────────────────────────────── */

/**
 * ── STRUCTURE vs SPELLABILITY ──────────────────────────────────────────────────
 * The `structurallyCan*` predicates below are the op's own arithmetic: is there an
 * integer grid to scale onto, and does ÷2 drop information. They are PRIVATE, because
 * they are only half of "can this op apply". The other half — can the writer SPELL the
 * result — is asked of the real writer by `ifGridSpellable`, and the exported `can*`
 * predicates are derived from the composed op so that the two can never disagree.
 * See `ifGridSpellable` in `serialize.ts` for why the prediction had to stop (#1010 P4c).
 */
function structurallyCanDouble(model: StepGridModel): boolean {
  return model.steps >= 1 && model.steps * 2 <= MAX_RESOLUTION_STEPS
}

/**
 * ÷2 drops no information only when nothing lives on the odd columns: every lane's
 * odd cells are empty AND every odd per-column gain is neutral. Multi-bar grids
 * also need an even columns-per-bar so each `<...>` slot stays integral.
 */
function structurallyCanHalve(model: StepGridModel): boolean {
  if (model.steps < 2 || model.steps % 2 !== 0) return false
  if ((model.bars ?? 1) > 1 && perBar(model.steps, model.bars) % 2 !== 0) return false
  const oddCellEmpty = model.lanes.every((lane) =>
    lane.cells.every((cell, i) => i % 2 === 0 || !isCellOn(cell)),
  )
  if (!oddCellEmpty) return false
  if (model.gains) {
    if (!model.gains.every((g, i) => i % 2 === 0 || g === 1)) return false
  }
  return true
}

/**
 * Scale a step grid's resolution. `double` splits each column in two (odd columns
 * inserted empty / neutral); `halve` merges pairs back, keeping the even column.
 * Returns the model unchanged when the direction can't apply (so `mutate` skips) —
 * which now includes "the writer cannot spell the result", not only the arithmetic.
 */
export function scaleStepGrid(model: StepGridModel, dir: ResolutionDir): StepGridModel {
  if (dir === 'double') {
    if (!structurallyCanDouble(model)) return model
    return ifGridSpellable(model, {
      ...model,
      steps: model.steps * 2,
      lanes: model.lanes.map((lane) => ({
        ...lane,
        cells: lane.cells.flatMap((cell): StepCell[] => [scaleCell(cell, 2), false]),
      })),
      ...(model.gains ? { gains: model.gains.flatMap((g) => [g, 1]) } : {}),
    })
  }
  if (!structurallyCanHalve(model)) return model
  return ifGridSpellable(model, {
    ...model,
    steps: model.steps / 2,
    lanes: model.lanes.map((lane) => ({
      ...lane,
      cells: lane.cells.filter((_, i) => i % 2 === 0).map((cell) => scaleCell(cell, 0.5)),
    })),
    ...(model.gains ? { gains: model.gains.filter((_, i) => i % 2 === 0) } : {}),
  })
}

/**
 * Can the control offer ×2 / ÷2 at all — asked of the composed op, so an enabled
 * control and a working one are the same statement. `canScaleStepGridTo` has always
 * been spelled this way; these two used to predict instead, and a prediction is what
 * left the ÷2 button present and dead on every unit that offered it.
 */
export function canDoubleStepGrid(model: StepGridModel): boolean {
  return scaleStepGrid(model, 'double') !== model
}
export function canHalveStepGrid(model: StepGridModel): boolean {
  return scaleStepGrid(model, 'halve') !== model
}

/* ── piano roll ────────────────────────────────────────────────── */

/** the roll's own arithmetic — private, for the same reason the grid's is (see above) */
function structurallyCanDoubleRoll(model: PianoRollModel): boolean {
  return model.steps >= 1 && model.steps * 2 <= MAX_RESOLUTION_STEPS
}

/**
 * ÷2 drops nothing only when every note sits on an even column AND spans an even
 * number of columns (so halving keeps integer start/duration). Multi-bar rolls also
 * need an even columns-per-bar.
 *
 * This one has always been written as a question about what the NOTATION can carry —
 * `RollNote.duration` counts whole steps, so an odd `@n` has no halved spelling
 * ([[PV240]]'s admissibility corollary). That is the same question `ifRollSpellable`
 * asks, arrived at by hand; keeping both costs nothing and the derived predicate below
 * is what guarantees they agree.
 */
function structurallyCanHalveRoll(model: PianoRollModel): boolean {
  if (model.steps < 2 || model.steps % 2 !== 0) return false
  if ((model.bars ?? 1) > 1 && perBar(model.steps, model.bars) % 2 !== 0) return false
  return model.notes.every((n) => n.start % 2 === 0 && n.duration % 2 === 0)
}

export function canDoublePianoRoll(model: PianoRollModel): boolean {
  return scalePianoRoll(model, 'double') !== model
}
export function canHalvePianoRoll(model: PianoRollModel): boolean {
  return scalePianoRoll(model, 'halve') !== model
}

/**
 * Scale a piano roll's resolution. Every note's start AND duration scale with the
 * grid, so a note keeps its time span (a held `@n` doubles to `@2n`) and onsets
 * are preserved (#479, hap-verified). Returns the model unchanged when the
 * direction can't apply.
 */
export function scalePianoRoll(model: PianoRollModel, dir: ResolutionDir): PianoRollModel {
  if (dir === 'double') {
    if (!structurallyCanDoubleRoll(model)) return model
    return ifRollSpellable(model, {
      ...model,
      steps: model.steps * 2,
      notes: model.notes.map((n) => ({ ...n, start: n.start * 2, duration: n.duration * 2 })),
    })
  }
  if (!structurallyCanHalveRoll(model)) return model
  return ifRollSpellable(model, {
    ...model,
    steps: model.steps / 2,
    notes: model.notes.map((n) => ({ ...n, start: n.start / 2, duration: n.duration / 2 })),
  })
}

/* ── absolute slot-count targets (the 4 / 8 / 16 / 32 / 64 control) ── */

/**
 * The absolute slot counts the "Slots" control offers. Clicking one SETS the
 * grid to that column count. When the target is a power-of-2 ratio of the current
 * count it's a lossless ×2/÷2 (`scaleStepGridTo`/`scalePianoRollTo`); otherwise
 * the grid QUANTIZES — every note snaps to the nearest of the new slots and
 * notes that collide merge (`quantizeStepGridTo`/`quantizePianoRollTo`). So any
 * pattern can be coarsened to any preset (a 64-step choir → 16), at the cost of
 * timing for the non-lossless cases — the control marks which is which.
 */
export const RESOLUTION_PRESETS = [4, 8, 16, 32, 64] as const

/** is n a power of two (≥1)? */
function isPow2(n: number): boolean {
  return n >= 1 && Number.isInteger(n) && (n & (n - 1)) === 0
}

/**
 * Drive a grid to an absolute `target` column count by repeated ×2 / ÷2. Only a
 * power-of-2 ratio to the current count is reachable, and every halving on the
 * way down must be lossless (`scale` returns its input unchanged when it can't
 * halve / would exceed the cap → we abort to the ORIGINAL model). Returns the
 * model unchanged when the target isn't losslessly reachable, so the control
 * disables it and `mutate` skips the write.
 */
function scaleTo<M extends { steps: number }>(
  model: M,
  target: number,
  scale: (m: M, dir: ResolutionDir) => M,
): M {
  if (target < 1 || target === model.steps) return model
  const up = target > model.steps
  const ratio = up ? target / model.steps : model.steps / target
  if (!isPow2(ratio)) return model
  let cur = model
  while (cur.steps !== target) {
    const next = scale(cur, up ? 'double' : 'halve')
    if (next === cur) return model // a halving wasn't lossless (or hit the cap)
    cur = next
  }
  return cur
}

export function scaleStepGridTo(model: StepGridModel, target: number): StepGridModel {
  return scaleTo(model, target, scaleStepGrid)
}
export function scalePianoRollTo(model: PianoRollModel, target: number): PianoRollModel {
  return scaleTo(model, target, scalePianoRoll)
}

/** can the step grid losslessly reach exactly `target` columns? (false for the current count) */
export function canScaleStepGridTo(model: StepGridModel, target: number): boolean {
  return target !== model.steps && scaleStepGridTo(model, target) !== model
}
export function canScalePianoRollTo(model: PianoRollModel, target: number): boolean {
  return target !== model.steps && scalePianoRollTo(model, target) !== model
}

/* ── quantize-set: snap any pattern onto a target slot count ────── */

const clampInt = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** the bucket a source column `c` of `from` slots maps onto in `to` slots */
const bucket = (c: number, from: number, to: number): number =>
  clampInt(Math.round((c * to) / from), 0, to - 1)

/**
 * Set a step grid to exactly `target` columns by quantizing: each ON cell snaps
 * to the nearest target column, several hits in a column collapse to one (OR),
 * and a bucket's gain is the loudest source hit that lands in it. Lossless when
 * `target` is a power-of-2 ratio (identical to `scaleStepGridTo`); a quantize
 * otherwise. Single-bar only — a multi-bar `<...>` grid keeps the lossless path
 * (a target that isn't bar-aligned can't serialize). Returns the model unchanged
 * for the current count, an invalid target, or multi-bar.
 */
export function quantizeStepGridTo(model: StepGridModel, target: number): StepGridModel {
  if (target < 1 || target > MAX_RESOLUTION_STEPS || target === model.steps) return model
  if ((model.bars ?? 1) > 1) return scaleStepGridTo(model, target)
  const from = model.steps
  const addingSlots = target > from
  const lanes = model.lanes.map((lane) => {
    const cells = Array<StepCell>(target).fill(false)
    lane.cells.forEach((cell, c) => {
      if (!isCellOn(cell)) return
      const b = bucket(c, from, target)
      // SCALE FIRST, then merge. Coarsening scales every length by `target / from`;
      // merging takes the SHORTEST, so a merged note never sounds longer than one of
      // the notes it stands for (the choice `quantizePianoRollTo` makes for a chord).
      // Doing it the other way round rescales a value already scaled by an earlier
      // source cell in the same bucket — 1 and 1 columns became 0.25 instead of 0.5.
      // Refining keeps the COLUMN count instead (#607, the roll's rule): the onset is
      // preserved and the note simply no longer spans the widened gap.
      const scaled = addingSlots ? cell.duration : cell.duration * (target / from)
      const prev = cells[b]
      cells[b] = cellOn(isCellOn(prev) ? Math.min(prev.duration, scaled) : scaled)
    })
    return { ...lane, cells: clampLane(cells, target) }
  })
  let gains: number[] | undefined
  if (model.gains) {
    gains = Array<number>(target).fill(1)
    const filled = new Set<number>()
    for (let c = 0; c < from; c++) {
      if (!model.lanes.some((l) => isCellOn(l.cells[c]))) continue // only audible columns carry gain
      const b = bucket(c, from, target)
      const g = model.gains[c] ?? 1
      gains[b] = filled.has(b) ? Math.max(gains[b], g) : g
      filled.add(b)
    }
  }
  // Coarsening scales every length down, and below one column the grid has no
  // spelling for it — so the same admissibility rule as ×2/÷2 applies here.
  return ifGridSpellable(model, { ...model, steps: target, lanes, ...(gains ? { gains } : {}) })
}

/**
 * Set a piano roll to exactly `target` columns by quantizing. Each note's START
 * snaps proportionally onto the new grid (`bucket`), so the timing stays
 * relatively justified in both directions. The DURATION is CONSERVATIVE when
 * ADDING slots (#607): a note keeps its slot-count instead of stretching to fill
 * the finer grid, so a 1-slot note stays 1 slot and a held `@n` stays `@n` — the
 * onset is preserved, the note simply no longer spans the widened gap. When
 * REDUCING slots the duration scales DOWN proportionally so a coarser grid can't
 * push a note out of range. Notes that collide on a column merge (same pitch →
 * one; different pitches → a chord sharing the column's duration), and durations
 * are clamped so nothing overlaps or runs past the grid — the result always
 * serializes (no silent drop). A multi-bar `<…>` grid stays power-of-2 only;
 * ADDING slots there is conservative too (#607 — each start doubles, duration
 * kept), REDUCING keeps the lossless ×2 halve. Returns the model unchanged for
 * the current count or an unreachable target.
 */
export function quantizePianoRollTo(model: PianoRollModel, target: number): PianoRollModel {
  if (target < 1 || target > MAX_RESOLUTION_STEPS || target === model.steps) return model
  if ((model.bars ?? 1) > 1) {
    // Multi-bar `<…>`: only power-of-2 targets are offered (slotState disables
    // the rest — an off-bar count can't serialize). ADDING slots is conservative
    // like the single-bar path (#607): each note's start doubles (keeping the
    // columns-per-bar integral) but its DURATION is kept, so a 1-slot note stays
    // 1 slot. REDUCING keeps the lossless ×2 halve.
    if (target <= model.steps) return scalePianoRollTo(model, target)
    if (!isPow2(target / model.steps)) return model
    let cur = model
    while (cur.steps < target) {
      cur = { ...cur, steps: cur.steps * 2, notes: cur.notes.map((n) => ({ ...n, start: n.start * 2 })) }
    }
    // This branch KEEPS each duration while doubling the starts (#607), so a note can end
    // up spanning less of the widened grid than the next start allows — and on a multi-bar
    // `<…>` the result is not always spellable. Gated like every other op rather than
    // trusted: it was the one path in this file still returning unchecked (found by the
    // op-admissibility sweep, 52 unwritable results, all from here).
    return ifRollSpellable(model, cur)
  }
  const from = model.steps
  const addingSlots = target > from
  // 1. map each note onto the target grid: the START snaps proportionally; the
  //    DURATION keeps its slot-count when ADDING slots (conservative, #607 — no
  //    stretch) and scales down proportionally when REDUCING (stays in range).
  const q = model.notes
    .map((n) => ({
      pitch: n.pitch,
      start: bucket(n.start, from, target),
      duration: addingSlots
        ? Math.max(1, n.duration)
        : Math.max(1, Math.round((n.duration * target) / from)),
      gain: n.gain ?? 1,
    }))
    .sort((a, b) => a.start - b.start)
  // 2. group by start column, dropping a same-pitch collision (keep the first)
  const byCol = new Map<number, { pitch: string; duration: number; gain: number }[]>()
  for (const n of q) {
    const grp = byCol.get(n.start) ?? []
    if (grp.some((m) => m.pitch === n.pitch)) continue
    grp.push({ pitch: n.pitch, duration: n.duration, gain: n.gain })
    byCol.set(n.start, grp)
  }
  // 3. emit, clamping each group's shared duration to the next start (no overlap)
  const starts = [...byCol.keys()].sort((a, b) => a - b)
  const notes: RollNote[] = []
  starts.forEach((start, i) => {
    const limit = (i + 1 < starts.length ? starts[i + 1] : target) - start
    const grp = byCol.get(start)!
    const duration = clampInt(Math.min(...grp.map((m) => m.duration)), 1, limit)
    const gain = Math.max(...grp.map((m) => m.gain)) // a chord shares one gain
    for (const m of grp) notes.push({ pitch: m.pitch, start, duration, gain })
  })
  return ifRollSpellable(model, { ...model, steps: target, notes })
}

/* ── the free zone: a finer target is a VIEW change, not a rewrite (#1057) ── */

/**
 * THE FREE ZONE — where asking to look more closely must not rewrite your file.
 *
 * `bd ~ sn ~` + "Slots 16" used to write `bd ~ ~ ~ ~ ~ ~ ~ sn ~ ~ ~ ~ ~ ~ ~`. No note
 * was placed; the user expressed a VIEW preference and their document was rewritten.
 * #1052 settled the rule that fixes it: **refining is a view change, coarsening edits
 * your document.**
 *
 * A target is in the free zone when it is the document's own column count or a whole
 * multiple of it — because that is exactly when the same notation can be DRAWN at the
 * target without respelling anything. The returned value is the view scale that draws
 * it, so `target === documentSteps` yields `UNREFINED` and refining is reversible: the
 * user can always come back to the document's own resolution the same way they left it.
 *
 * ⚠ ASKED OF `documentSteps`, NEVER `model.steps`. `model.steps` is what is DRAWN, so at
 * scale 2 on a 4-column document it reads 8 — and a free zone keyed off it would call
 * "16" a ×2 refine when it is really ×4, i.e. the offer would depend on how closely the
 * user happened to be looking. Same hazard [[PV260]] names for the stored value.
 *
 * ⚠ ARITHMETIC ONLY — this says a view is REPRESENTABLE, never that the parser will
 * actually draw it. Four projections refuse a finer view (#1117), so an offer made on
 * this answer alone would ship exactly the dead buttons #1010 P4c had to repair: a
 * control whose enabled state was PREDICTED rather than asked. The composed offer lives
 * in `slotState` behind `canDrawView`, which is the same private-arithmetic /
 * ask-the-real-subsystem split `structurallyCan*` and `ifGridSpellable` already use
 * above — and the default is "no free zone", so a caller that cannot prove it never
 * offers it.
 *
 * Bounded by the VIEW ceiling rather than the document's: refining expands nothing in
 * the notation, so `MAX_STEPS` (a document-expansion guard) is the wrong question and
 * `MAX_VIEW_STEPS` is the right one — `viewResolution.ts` argues this at length.
 */
export function freeZoneScale(docSteps: number, target: number): ViewScale | null {
  if (!Number.isInteger(docSteps) || docSteps < 1) return null
  if (target < docSteps || target % docSteps !== 0) return null
  if (target > MAX_VIEW_STEPS) return null
  return target / docSteps
}

/**
 * how setting the grid to `target` slots behaves, for the control's label/state.
 *
 * `view` is the free zone (#1057): the click changes only how finely the panel DRAWS
 * the pattern and leaves the document byte-identical. Every other member still writes.
 */
export type SlotState = 'active' | 'view' | 'lossless' | 'quantize' | 'disabled'

/**
 * `applies` is the DECIDING input, and it is the op itself rather than a prediction of it.
 *
 * This used to return `'quantize'` for any single-bar, non-lossless target — i.e. it enabled
 * the control and left the op to sort it out. That was the same prediction the `can<Op>`
 * predicates were making, in the one place it reaches a user: after #1010 P4c a coarsening
 * quantize declines, so the "Slots" button stayed clickable and did nothing. The control's
 * state now comes from whether the op it would run actually applies.
 */
function slotState(
  steps: number,
  docSteps: number,
  bars: number | undefined,
  lossless: boolean,
  applies: boolean,
  target: number,
  canDrawView: ((scale: ViewScale) => boolean) | undefined,
): SlotState {
  // `steps` is what is DRAWN, so "the one I am already looking at" is the right
  // reading of `active` — at scale 2 on a 4-column document the user sees 8 columns
  // and 8 is the live preset.
  if (target === steps) return 'active'
  // THE FREE ZONE COMES FIRST, and that ordering is the whole phase: every branch
  // below this line writes to the document, so a target that can be satisfied by
  // looking more closely must be taken off the writing path before it reaches them.
  // Offered only when a caller can PROVE the view draws — see `freeZoneScale`.
  if (canDrawView) {
    const scale = freeZoneScale(docSteps, target)
    if (scale !== null && canDrawView(scale)) return 'view'
  }
  if (lossless) return 'lossless'
  // MULTI-BAR, STATED RATHER THAN INHERITED (#1057 asks for this explicitly): a
  // `<…>` grid still cannot quantize off the bar grid, so a non-multiple target is
  // disabled exactly as before. What DID change is that its refines no longer fall
  // to this branch at all — a whole multiple is a view change above, and multi-bar
  // patterns are the ones that gained most from that, having never had a refine.
  if ((bars ?? 1) > 1) return 'disabled'
  return applies ? 'quantize' : 'disabled'
}

/**
 * `canDrawView` is how the caller PROVES a finer view is really drawable — it is handed
 * a candidate scale and answers by asking the parser, not by predicting it. Omitting it
 * disables the free zone entirely, so every existing caller keeps today's behaviour
 * exactly and no offer is ever made on an unproven claim.
 */
export function stepSlotState(
  model: StepGridModel,
  target: number,
  canDrawView?: (scale: ViewScale) => boolean,
): SlotState {
  return slotState(
    model.steps,
    documentSteps(model),
    model.bars,
    canScaleStepGridTo(model, target),
    quantizeStepGridTo(model, target) !== model,
    target,
    canDrawView,
  )
}
export function rollSlotState(
  model: PianoRollModel,
  target: number,
  canDrawView?: (scale: ViewScale) => boolean,
): SlotState {
  return slotState(
    model.steps,
    documentSteps(model),
    model.bars,
    canScalePianoRollTo(model, target),
    quantizePianoRollTo(model, target) !== model,
    target,
    canDrawView,
  )
}
