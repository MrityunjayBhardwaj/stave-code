/**
 * Notation models — the structured shapes the Sequencer and Piano Roll panels
 * own, parsed from and serialized back to mini-notation.
 *
 * These are deliberately a STRICT SUBSET of Strudel mini-notation: `*n` speed,
 * `!n` replicate, and euclid `(k,n[,rot])` EXPAND onto the grid, because a grid
 * of cells is what these panels can draw. Anything richer (`{}` polymeter, `/`
 * slow, `?` degrade, deep nesting) parses to `{ ok: false }` and the panel falls
 * back to code-only editing rather than guess and corrupt the source. This is
 * the conservatism the whole text-writeback substrate depends on (design doc
 * §4, §5.3).
 *
 * THE EXPANSION IS A FACT ABOUT THE VIEW, NOT ABOUT THE USER'S FILE. It used to
 * be both: `*n` was documented as sugar that "serializes back as the expanded
 * sequence", so opening `bd hh*2 sd cp` and nudging any cell rewrote the line as
 * `bd bd hh hh sd ~ cp ~`. That cost a third of everything the grid could open
 * (#913), and a third of what the roll could open for the same reason (#916).
 * Both models now carry the spans they were read from and both writers put
 * unedited ones back verbatim, so the subset bounds what a panel can SHOW and
 * edit — never what survives being looked at.
 */

/**
 * One top-level element of the source, and the columns it produced.
 *
 * krill's element spans TILE the mini: concatenating them reconstructs the
 * input byte-for-byte, whitespace and all. Verified over the 1352 flat minis in
 * the real corpus (and all 380 the roll opens), and re-checked per parse — that
 * tiling is the whole basis for putting back exactly what we read.
 *
 * Where the whitespace LANDS inside a span is not something to have beliefs
 * about: `bd sd` spans as `"bd "` + `"sd"` (trailing) while `bd!3 sd` spans as
 * `"bd!3"` + `" sd"` (leading). So an untouched region is written back as its
 * whole `raw` span and no rule is needed; only a region we re-emit has to know
 * which side its padding sits on.
 *
 * `C` is what the element produced IN THE VIEW'S OWN TERMS — cells for the grid,
 * notes for the roll. The spans are the same fact about the source either way;
 * only the answer to "did the user change this?" is the view's.
 */
export interface SourceRegion<C> {
  /** the element's bytes exactly as written, whitespace included */
  raw: string
  /** `raw`'s padding, split out so a re-emit keeps the spacing around it */
  leading: string
  trailing: string
  /** `[from, to)` — the columns this element expanded to */
  from: number
  to: number
  /**
   * What the VIEW showed for these columns at parse time — the basis for "did
   * the user change this region?". Deliberately the model's own view rather
   * than the raw atoms: `[sd,sd]` is one lane to a grid that has one lane per
   * distinct sound, so comparing against the raw pair would report a change
   * nobody made and rewrite the region for nothing.
   */
  content: C
}

/**
 * Source for a `<...>` alternation used as a sequence ELEMENT (`bd <sd hh>`),
 * not around the whole cycle (#920). The model bar-expands — one alternative per
 * bar, so `bd <sd hh>` is a 2-bar grid — but the SOURCE stays a single cycle:
 * the elements the user actually wrote (`bd`, `<sd hh>`). Each region owns a
 * within-bar column span and remembers what it showed IN EACH BAR, so the writer
 * copies an unchanged element's bytes through verbatim and re-emits only the one
 * edited — as `<...>` when its bars now differ, plain when they agree, promoting
 * a static cell to an alternation when an edit makes it vary.
 *
 * Distinct from `source`: there a region's `[from,to)` are the model's own
 * columns; here they are SINGLE-CYCLE columns, gathered strided across `bars`.
 * A model carries `altSource` XOR `source`, never both.
 */
export interface AltRegion<C> {
  raw: string
  leading: string
  trailing: string
  /** `[from, to)` columns WITHIN one bar (single-cycle space) */
  from: number
  to: number
  /** what the view showed for this element in each of `bars` cycles, at parse */
  perBar: C[]
}
export interface AltSource<C> {
  /** columns per bar (one cycle) */
  perBar: number
  bars: number
  /** finest subdivision, so a re-emitted region splits on whole columns */
  div: number
  /** the single-cycle top-level elements, tiling the source in order */
  regions: AltRegion<C>[]
}

/** what a step grid shows for a span of columns: the sounds in each */
export type GridCells = string[][]

/**
 * One `,`-separated part of the source, and the columns it produced.
 *
 * A flat sequence and a `<…>` alternation are the one-part case; a `,`-stack
 * has several, each with its OWN resolution. `bd sd, hh*4` lays two columns
 * against four, and the grid shows both on the finer of the two — so a part's
 * regions are indexed in its own column space and `factor` maps them onto the
 * shared grid.
 */
export interface SourcePart<C> {
  /** the lane `part` index these regions describe */
  part: number
  /** columns per top-level step INSIDE this part */
  div: number
  /**
   * Shared-grid columns spanned by each of this part's own columns.
   *
   * Always 1 for the roll: `parseRollLanes` requires every part to report the
   * same step count and refuses the pattern otherwise, so a roll's parts share
   * one column space by construction. The grid is the view that stretches
   * (`bd sd, hh*4` lays two columns against four).
   */
  factor: number
  /** the bytes before this part's content — its `,` and padding — verbatim */
  before: string
  /** the bytes after it */
  after: string
  /** one entry per top-level element, in source order, tiling the part */
  regions: SourceRegion<C>[]
}

/**
 * The bytes a model was read from, in the pieces the writer puts back.
 *
 * Present only on a model parsed from source and not restructured since —
 * `resize` drops it, because a re-laid grid makes every region a lie. Absent on
 * models built from scratch, and then the writer rebuilds from the grid, which
 * is lossy and always was.
 */
export interface NotationSource<C> {
  /**
   * The wrapper the parts sit inside, written back around them verbatim: `<`
   * and `>` (with the user's padding) for a multi-bar alternation, empty for a
   * flat sequence. Kept as bytes rather than a flag so `< a b >` keeps its
   * spaces.
   */
  prefix: string
  suffix: string
  parts: SourcePart<C>[]
}

/** Drum/step grid: lanes (sounds) × steps (columns). */
export interface StepGridModel {
  /** total columns across all bars */
  steps: number
  /**
   * The source this model was read from, for span surgery on write (#913).
   * The writer re-emits ONLY the regions whose content the user actually
   * changed and copies every other region's bytes through untouched, so an
   * edit cannot destroy notation it never touched (`bd hh*2 sd cp`, nudge a
   * cell in the `bd`, and the `*2` survives). Absent → the writer rebuilds the
   * whole string from the grid, which is lossy and always was.
   */
  source?: NotationSource<GridCells>
  /**
   * Set when the alternation sits INSIDE the sequence (`bd <sd hh>`, #920) rather
   * than around the whole cycle. The writer uses this instead of `source`; the
   * two are mutually exclusive.
   */
  altSource?: AltSource<GridCells>
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
  /**
   * The source this model was read from, for span surgery on write (#916) —
   * the roll's half of what `StepGridModel.source` does for the grid. A region
   * owns columns `[from, to)` and the notes STARTING in that range are its own;
   * unchanged ones write their bytes back, so `C D` stays `C D` rather than
   * coming back lowercased for the crime of being looked at. Absent → the
   * writer rebuilds from the model, which is lossy and always was.
   */
  source?: NotationSource<RollNote[]>
  /**
   * Set when the alternation sits INSIDE the sequence (`0 <2 3> 5`, #920) rather
   * than around the whole cycle. The writer uses this instead of `source`; the
   * two are mutually exclusive.
   */
  altSource?: AltSource<RollNote[]>
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
