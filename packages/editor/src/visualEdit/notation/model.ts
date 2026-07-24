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
 * A leaf atom's OWN source span — `[start, end)` into the inner mini string.
 *
 * Read from a hap's `context.locations` (Strudel's `mini()` calls `.withLoc` per
 * atom), never computed here: a nested atom carries its own token span, not its
 * container's, so `s("a [b c]")` gives the `c` hap the span of `c` and never of
 * `[b c]` (#987).
 */
export interface LeafSpan {
  start: number
  end: number
}

/** one atom sounding in a column, paired with the source leaf it was read from */
export interface LeafAnchor {
  atom: string
  span: LeafSpan
}

/**
 * The source of a LEAF-ANCHORED projection (#986) — the third write-back shape,
 * and the only one that never re-emits notation.
 *
 * `source`/`altSource` pair the view with the source's TOP-LEVEL elements, so an
 * edited element is re-spelled from the cell model (`reemitRegion`). That re-emit
 * is a mini-notation printer of our own, and it can only spell flat or one-level
 * output — which is why anything with internal structure (`[a [b c]]`, `<a b>*4`)
 * round-trips wrong and is refused.
 *
 * A leaf anchor pairs the view with the ATOM instead: an edit replaces that one
 * note's bytes and every other byte — brackets, spaces, operators, unedited notes
 * — is copied verbatim. Nothing about the grammar is authored, so the writer
 * cannot invent syntax; what it cannot express (a note where no leaf exists) it
 * REFUSES. See `spliceByLeaf`.
 */
export interface LeafSource {
  /** the inner mini string the spans index into, byte-for-byte */
  src: string
  /**
   * Per model column, the atoms sounding there and each one's own leaf span.
   *
   * Its LENGTH is also the layout these anchors were read against — the width
   * `anchorsDescribe` (`serialize.ts`) requires the model to still have before
   * either leaf writer may write. See `RollLeafSource.steps` for why.
   */
  cols: LeafAnchor[][]
}

/**
 * One played note, paired with the source leaf its PITCH was read from.
 *
 * The roll's analogue of `LeafAnchor`, and deliberately not the same shape: a grid
 * column holds a set of atoms, while a roll note is positioned AND held, so an
 * anchor has to carry where it starts and how long it lasts as well as what it
 * plays. Both are still the same fact — "these bytes are this note's own".
 */
export interface RollLeafAnchor {
  /** the note as the model carries it — names case-folded, numerics stringified */
  pitch: string
  /** the model column the note starts at, absolute across bars */
  start: number
  /** length in columns */
  duration: number
  /** the PITCH token's own `[start, end)` in `src` — never the `@n` hold (see below) */
  span: LeafSpan
}

/**
 * The source of a leaf-anchored ROLL projection (#986 P1b) — `LeafSource` for the
 * pitched surface.
 *
 * Anchored per NOTE rather than per column, because a note is what the roll edits.
 * A chord contributes one anchor per member, each with its own disjoint leaf, so a
 * member can be cleared without touching the others.
 *
 * DURATION IS NOT WRITABLE HERE, and that is a fact about Strudel, not a shortcut:
 * a held note's hap carries ONLY its pitch leaf in `context.locations` — the `@n`
 * never appears as a location of its own (observed by driving `reifyMini` on
 * `c3@2`, `[c3 e3]@2`, `c3 e3@2 g3`, `0@2 2`: every one reports a single location,
 * the pitch). So there is no span through which a duration could be spliced, and
 * writing one would mean AUTHORING `@n` syntax — exactly the modelling this whole
 * mechanism exists to delete. A resized or moved note is therefore REFUSED by the
 * writer, never approximated. See `spliceRollByLeaf`.
 */
export interface RollLeafSource {
  /** the inner mini string the spans index into, byte-for-byte */
  src: string
  /** one per played note, in play order */
  anchors: RollLeafAnchor[]
  /**
   * The column count these anchors were read against — the roll's equivalent of
   * the grid's `cols.length`, and a REQUIRED guard rather than bookkeeping.
   *
   * Anchors are PROVENANCE: they describe where each note's bytes live in a
   * source laid out one particular way. A restructure (`resizeRoll`) re-lays the
   * grid while carrying the model's other fields through, so the anchors survive
   * describing a layout that no longer exists. Widening leaves every note's start
   * and length intact, which passes the writer's per-note check and would write
   * the ORIGINAL source back, silently discarding the resize. Narrowing is worse:
   * the notes that fell outside the new width look to the writer exactly like
   * notes the user DELETED, and it would splice `~` over them — data loss from a
   * gesture that edited nothing.
   *
   * So the check belongs at the WIDTH, the thing a restructure changes, not at
   * the item — and in ONE place: `anchorsDescribe` (`serialize.ts`), which both
   * leaf writers call ([[P329]], #990).
   */
  steps: number
}

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
  /**
   * Set by the LEAF-anchored projection (#986) for patterns whose notation no
   * element re-emit can reproduce. Takes precedence over both of the above and
   * is TERMINAL: a leaf grid is never rebuilt from its cells, because rebuilding
   * is exactly what would destroy the notation it was opened to preserve — an
   * edit it cannot express as a byte replacement is refused instead.
   */
  leafSource?: LeafSource
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
  /**
   * Set by the LEAF-anchored projection (#986 P1b) for patterns whose notation no
   * element re-emit can reproduce — the roll's half of `StepGridModel.leafSource`,
   * and TERMINAL for the same reason: a leaf roll is never rebuilt from its notes,
   * because rebuilding is what would destroy the notation it was opened to
   * preserve. An edit it cannot express as a byte replacement is refused instead.
   */
  leafSource?: RollLeafSource
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
 * WHY a view declined a pattern — the gate that actually stopped it (#990).
 *
 * Three writers stack behind one parse call (syntactic core → element projection
 * → leaf projection), and before this the `reason` string was whichever one
 * declined FIRST — almost always the core, describing a subsystem that often had
 * nothing to do with why the unit was unavailable. Measured over 1500 real units,
 * every pattern reporting "nested groups are beyond the editable subset" was in
 * fact stopped by a wrong-surface value or an unstable period; not one was stopped
 * by anything to do with nesting. A gate names the real cause.
 *
 * These are not a new list of features. Each is one face of the single editability
 * invariant — a played onset is editable iff it maps to a unique disjoint source
 * span, in a view that stays true:
 *   - `wrong-surface`      the values belong to the OTHER view (a drum pattern
 *                          asked of the piano roll, a number asked of the grid).
 *                          Not an editability failure — a routing fact.
 *   - `no-note-content`    nothing placeable sounds at all: a params/signal value,
 *                          a zero-length hap, silence, or a query that threw.
 *   - `unstable-period`    what it plays does not repeat inside the projection's
 *                          bar window, so any view of it stops being true.
 *   - `mixed-pitch-domain` numeric and named pitches in one pattern (roll only).
 *   - `irrational-onset`   an onset/duration/boundary that lands on no column.
 *   - `resolution`         the columns needed exceed the step ceiling.
 *   - `element-tiling`     the source's top-level elements do not tile the played
 *                          columns — the element writer's half of the bijection.
 *   - `no-leaf-anchor`     a played note has no source token of its own, or two
 *                          notes claim overlapping bytes — the leaf writer's half.
 *   - `edit-unsafe`        the write-back probe and the engine disagreed.
 *   - `view-unusable`      the view opens but no single edit is expressible.
 *   - `not-a-pattern`      it does not reify at all; the core's own syntax
 *                          message is the better answer and is kept.
 */
export type Gate =
  | 'wrong-surface'
  | 'no-note-content'
  | 'unstable-period'
  | 'mixed-pitch-domain'
  | 'irrational-onset'
  | 'resolution'
  | 'element-tiling'
  | 'no-leaf-anchor'
  | 'edit-unsafe'
  | 'view-unusable'
  | 'not-a-pattern'

/**
 * Parse outcome. `ok: false` is a first-class result, not an exception — every
 * panel checks it on open and disables itself (code-only) when the pattern is
 * outside the editable subset.
 *
 * `gate` is present whenever a projection ran and declined — the machine-readable
 * half of `reason`, so a measurement buckets by cause instead of by string match.
 * Absent when the refusal is the syntactic core's own (nothing reified).
 */
export type ParseResult<M> =
  | { ok: true; model: M }
  | { ok: false; reason: string; gate?: Gate }

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
