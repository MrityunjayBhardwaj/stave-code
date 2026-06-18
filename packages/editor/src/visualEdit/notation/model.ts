/**
 * Notation models — the structured shapes the Sequencer and Piano Roll panels
 * own, parsed from and serialized back to mini-notation.
 *
 * These are deliberately a STRICT SUBSET of Strudel mini-notation: only the
 * idioms that survive a lossless text round-trip live here. `*n` speed, `!n`
 * replicate, and euclid `(k,n[,rot])` are accepted as input sugar — expanded
 * onto the grid and serialized back in expanded form (so they round-trip as
 * the expansion, not the source token). Anything richer (`{}` polymeter, `/`
 * slow, `?` degrade, deep nesting) parses to `{ ok: false }` and the panel
 * falls back to code-only editing rather than guess and corrupt the source.
 * This is the conservatism the whole text-writeback substrate depends on
 * (design doc §4, §5.3).
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
  /**
   * Per-COLUMN velocity, length `steps`, indexed by serialized column (NOT by
   * lane — a stacked `[bd,sn]` column shares one gain). `1` is neutral; a model
   * with every gain at `1` (or `gains` absent) emits no `.gain`. Read from /
   * written to a parallel `.gain("v1 v2 …")` mini aligned to the columns the
   * grid serializes (rest columns serialize as `~`). Only single-part,
   * single-bar grids carry gain in the first cut; richer shapes leave any
   * existing `.gain` untouched (see `serializeStepGain`).
   */
  gains?: number[]
  /**
   * Set when a `.gain("…")` string was present on read-back but did NOT align
   * to the grid columns (wrong length, a broadcast `.gain("0.8")`, an `@`/`*`
   * we didn't write). The grid then leaves that `.gain` byte-identical and the
   * velocity drag is disabled — we never delete a gain we didn't author.
   */
  gainForeign?: boolean
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
  /**
   * Per-note velocity. `1` (or absent) is neutral and emits no `.gain`. Chord
   * members sharing a `start` share one gain (like duration); on read-back the
   * group's gain is applied to all its members. Written to a parallel
   * `.gain("…")` mini that mirrors the note sequence's group/`@n`/rest
   * structure. Only single-bar rolls carry gain in the first cut.
   */
  gain?: number
}

/** Pitched (melodic) grid: notes placed on a pitch × time grid. */
export interface PianoRollModel {
  /** total columns across all bars */
  steps: number
  /** cycles the pattern spans via `<...>` alternation; absent = a single cycle */
  bars?: number
  notes: RollNote[]
  /** see `StepGridModel.gainForeign` — a `.gain` we read but don't manage. */
  gainForeign?: boolean
  /**
   * The pitch tokens are bare integers (`note("60 62")` MIDI, `n("0 1 2")`
   * degrees) rather than note names (#469). Row math is the same (the number
   * IS the row), but new/dragged notes must emit numbers, not `c4`, so the
   * pattern round-trips. A pattern mixes one convention or the other, never
   * both (mixed is rejected at parse).
   */
  numeric?: boolean
}

/**
 * Parse outcome. `ok: false` is a first-class result, not an exception — every
 * panel checks it on open and disables itself (code-only) when the pattern is
 * outside the editable subset.
 */
export type ParseResult<M> = { ok: true; model: M } | { ok: false; reason: string }

/**
 * What a model's velocity wants done to the pattern's `.gain` method. A single
 * `.gain` carries the level at two granularities — a SCALAR `.gain(0.4)` (a
 * uniform track level, the Mixer-knob form) or a per-column STRING
 * `.gain("0.4 0.2 …")`. They can't coexist (Strudel's `.gain` overrides, last
 * wins), so velocity expands the scalar to a string on edit and collapses back
 * when the columns are uniform again. Discriminated so the binding layer can
 * coordinate the second write-back range unambiguously:
 *   - `write` — upsert `.gain(value)`; `quoted` picks the form: `false` →
 *      `.gain(0.4)` (collapsed/scalar), `true` → `.gain("0.4 0.2 …")` (per
 *      column). Replaces an existing managed arg in place, else inserts after
 *      the expression;
 *   - `clear` — every level neutral (1) → remove our `.gain` (no `.gain(1)` /
 *      `.gain("1 1 …")`);
 *   - `skip` — gain is out of scope (multi-bar, `,`-stack, or a `.gain` we
 *      don't manage, e.g. a signal arg) → leave it byte-identical.
 */
export type GainWrite =
  | { kind: 'write'; value: string; quoted: boolean }
  | { kind: 'clear' }
  | { kind: 'skip' }

/**
 * The `.gain` argument read off a chunk's chain, normalized for the velocity
 * layer: `numeric` for a scalar `.gain(0.4)` (a uniform base), `mini` for a
 * string `.gain("…")`, `foreign` when a `.gain` is present in a form we don't
 * manage (a signal/identifier arg) and must leave untouched. All null/false =
 * no `.gain`.
 */
export interface ChunkGain {
  mini: string | null
  numeric: number | null
  foreign: boolean
}
