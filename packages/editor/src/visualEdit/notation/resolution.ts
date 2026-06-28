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
import type { PianoRollModel, RollNote, StepGridModel } from './model'

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
  const lanes = model.lanes.map((lane) => {
    const cells = Array<boolean>(target).fill(false)
    lane.cells.forEach((on, c) => {
      if (on) cells[bucket(c, from, target)] = true
    })
    return { ...lane, cells }
  })
  let gains: number[] | undefined
  if (model.gains) {
    gains = Array<number>(target).fill(1)
    const filled = new Set<number>()
    for (let c = 0; c < from; c++) {
      if (!model.lanes.some((l) => l.cells[c])) continue // only audible columns carry gain
      const b = bucket(c, from, target)
      const g = model.gains[c] ?? 1
      gains[b] = filled.has(b) ? Math.max(gains[b], g) : g
      filled.add(b)
    }
  }
  return { ...model, steps: target, lanes, ...(gains ? { gains } : {}) }
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
 * serializes (no silent drop). Single-bar only (multi-bar keeps the lossless ×2
 * path). Returns the model unchanged for current/invalid/multi-bar.
 */
export function quantizePianoRollTo(model: PianoRollModel, target: number): PianoRollModel {
  if (target < 1 || target > MAX_RESOLUTION_STEPS || target === model.steps) return model
  if ((model.bars ?? 1) > 1) return scalePianoRollTo(model, target)
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
  return { ...model, steps: target, notes }
}

/** how setting the grid to `target` slots behaves, for the control's label/state */
export type SlotState = 'active' | 'lossless' | 'quantize' | 'disabled'

function slotState(steps: number, bars: number | undefined, lossless: boolean, target: number): SlotState {
  if (target === steps) return 'active'
  if (lossless) return 'lossless'
  if ((bars ?? 1) > 1) return 'disabled' // multi-bar can't quantize off the bar grid yet
  return 'quantize'
}

export function stepSlotState(model: StepGridModel, target: number): SlotState {
  return slotState(model.steps, model.bars, canScaleStepGridTo(model, target), target)
}
export function rollSlotState(model: PianoRollModel, target: number): SlotState {
  return slotState(model.steps, model.bars, canScalePianoRollTo(model, target), target)
}
