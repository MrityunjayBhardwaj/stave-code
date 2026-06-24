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
import type { PianoRollModel, StepGridModel } from './model'

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

export function canDoubleStepGrid(model: StepGridModel): boolean {
  return model.steps >= 1 && model.steps * 2 <= MAX_RESOLUTION_STEPS
}

/**
 * ÷2 is lossless only when no information lives on the odd columns: every lane's
 * odd cells are empty AND every odd per-column gain is neutral. Multi-bar grids
 * also need an even columns-per-bar so each `<...>` slot stays integral.
 */
export function canHalveStepGrid(model: StepGridModel): boolean {
  if (model.steps < 2 || model.steps % 2 !== 0) return false
  if ((model.bars ?? 1) > 1 && perBar(model.steps, model.bars) % 2 !== 0) return false
  const oddCellEmpty = model.lanes.every((lane) =>
    lane.cells.every((on, i) => i % 2 === 0 || !on),
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
 * Returns the model unchanged when the direction can't apply (so `mutate` skips).
 */
export function scaleStepGrid(model: StepGridModel, dir: ResolutionDir): StepGridModel {
  if (dir === 'double') {
    if (!canDoubleStepGrid(model)) return model
    return {
      ...model,
      steps: model.steps * 2,
      lanes: model.lanes.map((lane) => ({
        ...lane,
        cells: lane.cells.flatMap((on) => [on, false]),
      })),
      ...(model.gains ? { gains: model.gains.flatMap((g) => [g, 1]) } : {}),
    }
  }
  if (!canHalveStepGrid(model)) return model
  return {
    ...model,
    steps: model.steps / 2,
    lanes: model.lanes.map((lane) => ({
      ...lane,
      cells: lane.cells.filter((_, i) => i % 2 === 0),
    })),
    ...(model.gains ? { gains: model.gains.filter((_, i) => i % 2 === 0) } : {}),
  }
}

/* ── piano roll ────────────────────────────────────────────────── */

export function canDoublePianoRoll(model: PianoRollModel): boolean {
  return model.steps >= 1 && model.steps * 2 <= MAX_RESOLUTION_STEPS
}

/**
 * ÷2 is lossless only when every note sits on an even column AND spans an even
 * number of columns (so halving keeps integer start/duration and drops nothing).
 * Multi-bar rolls also need an even columns-per-bar.
 */
export function canHalvePianoRoll(model: PianoRollModel): boolean {
  if (model.steps < 2 || model.steps % 2 !== 0) return false
  if ((model.bars ?? 1) > 1 && perBar(model.steps, model.bars) % 2 !== 0) return false
  return model.notes.every((n) => n.start % 2 === 0 && n.duration % 2 === 0)
}

/**
 * Scale a piano roll's resolution. Every note's start AND duration scale with the
 * grid, so a note keeps its time span (a held `@n` doubles to `@2n`) and onsets
 * are preserved (#479, hap-verified). Returns the model unchanged when the
 * direction can't apply.
 */
export function scalePianoRoll(model: PianoRollModel, dir: ResolutionDir): PianoRollModel {
  if (dir === 'double') {
    if (!canDoublePianoRoll(model)) return model
    return {
      ...model,
      steps: model.steps * 2,
      notes: model.notes.map((n) => ({ ...n, start: n.start * 2, duration: n.duration * 2 })),
    }
  }
  if (!canHalvePianoRoll(model)) return model
  return {
    ...model,
    steps: model.steps / 2,
    notes: model.notes.map((n) => ({ ...n, start: n.start / 2, duration: n.duration / 2 })),
  }
}

/* ── absolute slot-count targets (the 4 / 8 / 16 / 32 control) ──── */

/**
 * The absolute slot counts the control offers. A target is reachable only when
 * it's a power-of-2 ratio of the current count (so it's pure ×2/÷2 — any other
 * ratio would re-time the pattern, the trap #479 rejects). A non-power-of-2 grid
 * (a triplet's 12, a 5-note melody) therefore shows every preset disabled until
 * real fixed-rate length editing (polymeter) lands — see the deferred follow-up.
 */
export const RESOLUTION_PRESETS = [4, 8, 16, 32] as const

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
