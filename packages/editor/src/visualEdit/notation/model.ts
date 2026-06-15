/**
 * Notation models — the structured shapes the Sequencer and Piano Roll panels
 * own, parsed from and serialized back to mini-notation.
 *
 * These are deliberately a STRICT SUBSET of Strudel mini-notation: only the
 * idioms that survive a lossless text round-trip live here. Anything richer
 * (`{}` polymeter, `*`/`/` speed, `!` replicate, `?` degrade, euclids, deep
 * nesting) parses to `{ ok: false }` and the panel falls back to code-only
 * editing rather than guess and corrupt the source. This is the conservatism
 * the whole text-writeback substrate depends on (design doc §4, §5.3).
 */

/** Drum/step grid: lanes (sounds) × steps (columns). */
export interface StepGridModel {
  /** total columns across all bars */
  steps: number
  /** cycles the pattern spans via `<...>` alternation; absent = a single cycle */
  bars?: number
  /**
   * Lanes in presentation order. `sound` is the whole token incl. any
   * `:variant` (e.g. `bd:3`). `part` is the top-level `,`-stack the lane was
   * written in (absent = 0) — purely syntactic, kept so a hand-written stack
   * round-trips as the user wrote it instead of being flattened.
   */
  lanes: StepLane[]
}

export interface StepLane {
  sound: string
  part?: number
  cells: boolean[]
}

/** A single note in the piano roll. */
export interface RollNote {
  /** note token, e.g. `c3`, `eb4` */
  pitch: string
  /** column index where the note begins */
  start: number
  /** length in columns (1 = one step; emitted as `@n` elongation) */
  duration: number
}

/** Pitched (melodic) grid: notes placed on a pitch × time grid. */
export interface PianoRollModel {
  /** total columns across all bars */
  steps: number
  /** cycles the pattern spans via `<...>` alternation; absent = a single cycle */
  bars?: number
  notes: RollNote[]
}

/**
 * Parse outcome. `ok: false` is a first-class result, not an exception — every
 * panel checks it on open and disables itself (code-only) when the pattern is
 * outside the editable subset.
 */
export type ParseResult<M> = { ok: true; model: M } | { ok: false; reason: string }
