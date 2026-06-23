/**
 * division — pure snap/quantize helpers for the Pattern grids (#432 Slice 2).
 *
 * A "division" is the musical grid the user snaps move/resize to (Logic's Snap
 * value): 1/4, 1/8, 1/16 and their triplets, plus `'grid'` = the pattern's own
 * native cell (no extra snapping — the default, byte-identical to pre-#432
 * behaviour).
 *
 * The grids work in integer step COLUMNS, so a division only snaps cleanly when
 * it divides the grid evenly: the snap interval in columns is
 * `stepsPerBar / notesPerBar`, and a division is REPRESENTABLE only when that's
 * a whole number ≥ 1. A 16-step bar snaps to 1/4 (interval 4), 1/8 (2), 1/16
 * (1) but NOT 1/8-triplet (16/12 = 1.33…) — triplets need a triplet grid
 * (e.g. 12 steps). Non-representable divisions are surfaced DISABLED in the
 * picker, never silently no-op'd (an honest control — pre-mortem #5).
 *
 * Time signature is assumed 4/4 (the grid model carries no metre): a bar is
 * 4 quarters / 8 eighths / 16 sixteenths / 12 eighth-triplets / 24
 * sixteenth-triplets. Documented limit for #432.
 *
 * Pure (no React, no DOM) so both the Piano Roll (snaps its move/resize) and the
 * Mixer (renders the picker, greys out non-representable options) share one
 * source of truth — one snap path, no drift.
 */

/** the snap grids the picker offers; `'grid'` = native cell (no extra snap) */
export type Division = 'grid' | '1/4' | '1/8' | '1/16' | '1/8T' | '1/16T'

/** one picker entry — `notesPerBar` is null for `'grid'` (means "no snap"). */
export interface DivisionOption {
  value: Division
  label: string
  /** how many of this note fit one 4/4 bar (null = native grid, no snap) */
  notesPerBar: number | null
}

export const DIVISIONS: DivisionOption[] = [
  { value: 'grid', label: 'Grid', notesPerBar: null },
  { value: '1/4', label: '1/4', notesPerBar: 4 },
  { value: '1/8', label: '1/8', notesPerBar: 8 },
  { value: '1/16', label: '1/16', notesPerBar: 16 },
  { value: '1/8T', label: '1/8 T', notesPerBar: 12 },
  { value: '1/16T', label: '1/16 T', notesPerBar: 24 },
]

export const DEFAULT_DIVISION: Division = 'grid'

/** columns per bar from a model's total `steps` across `bars` (≥1, defaults 1). */
export function stepsPerBar(steps: number, bars?: number): number {
  return bars && bars > 0 ? Math.round(steps / bars) : steps
}

/**
 * The snap interval in COLUMNS for `division` on a grid of `stepsPerBar`, or
 * `null` when the division doesn't apply — either `'grid'` (native cell) or a
 * value the grid can't represent (would need fractional columns). Callers treat
 * `null` as "don't snap" and the picker greys those options out.
 */
export function snapInterval(spb: number, division: Division): number | null {
  const opt = DIVISIONS.find((d) => d.value === division)
  if (!opt || opt.notesPerBar === null) return null // 'grid' → no extra snap
  if (spb <= 0) return null
  const interval = spb / opt.notesPerBar
  return Number.isInteger(interval) && interval >= 1 ? interval : null
}

/** Is `division` representable (snappable) on a `stepsPerBar` grid? */
export function isRepresentable(spb: number, division: Division): boolean {
  return division === 'grid' || snapInterval(spb, division) !== null
}

/**
 * Snap a column to the nearest division line. Identity when `interval` is null
 * (no snap) or 1 (the native cell — snapping would be a no-op anyway).
 */
export function snapColumn(col: number, interval: number | null): number {
  if (interval == null || interval <= 1) return col
  return Math.round(col / interval) * interval
}
