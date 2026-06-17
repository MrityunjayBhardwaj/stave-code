import * as react_jsx_runtime from 'react/jsx-runtime';
import * as React from 'react';
import React__default, { RefObject, ReactNode } from 'react';
import * as p5 from 'p5';
import { V as VizQualityLevel } from './vizConfig-Dpw8jb9R.cjs';
export { D as DEFAULT_VIZ_CONFIG, a as DEFAULT_VIZ_QUALITY, b as VizConfig, c as VizQualitySettings, W as WorkerVizConfig, d as createVizConfig, e as deriveVizQuality, g as getVizConfig, s as setVizConfig, u as updateVizConfig } from './vizConfig-Dpw8jb9R.cjs';
import * as Monaco from 'monaco-editor';

/**
 * IREvent — the universal music event.
 *
 * Every engine compiles to this. Every consumer (viz, synth, highlighting) reads from this.
 * The IR event is a flat value object — no methods, no prototype, no engine references.
 *
 * Time domain: matches the producing PatternScheduler's now().
 *   - Strudel: cycle positions (0.0, 0.25, 1.0...)
 *   - BufferedScheduler: audioContext seconds (134.5, 135.0...)
 *   - Future engines: whatever their scheduler uses
 * Consumers always compare event.begin against scheduler.now() — same time domain.
 */
/** Source code location — character offset ranges in the original code. */
interface SourceLocation {
    start: number;
    end: number;
}
interface IREvent {
    /** Time position start (in scheduler's time domain) */
    begin: number;
    /** Time position end */
    end: number;
    /** Clipped end for active detection */
    endClipped: number;
    /** Note — MIDI number, note name string, or null */
    note: number | string | null;
    /** Frequency in Hz (derivable from note, pre-computed for performance) */
    freq: number | null;
    /** Instrument/sample name */
    s: string | null;
    /** Event kind */
    type?: 'synth' | 'sample';
    /** Gain 0-1 (default 1) */
    gain: number;
    /** Velocity 0-1 (default 1) */
    velocity: number;
    /** Display color */
    color: string | null;
    /** Source code ranges for highlighting */
    loc?: SourceLocation[];
    /** Stable content-addressed id of the IR node that produced this event.
     *  REQUIRED-by-convention for collect-produced events at the leaf arm
     *  (PV38 clause 1; assigned by collect.ts:assignNodeId at the Play leaf).
     *  Absent for hap-derived events with no IR-side match
     *  (PV37-aligned runtime-only path). */
    irNodeId?: string;
    /** Which track/loop produced this event. For events from a `$:`-wrapped
     *  Track that also has a `.p("name")` inner wrap, this is the INNER
     *  (`.p()`) name per collect.ts inner-wins semantics — what the user
     *  sees as the row label. Use `dollarPos` (below) when you need the
     *  STABLE slot identity that doesn't change when the user renames
     *  via `.p()`. */
    trackId?: string;
    /** Source-character offset of the OUTERMOST `$:`-wrapped Track that
     *  encloses this event. Anchored at the Track's `loc[0].start` per
     *  parseStrudel. Used as the timeline slot identity so `.p("name")`
     *  rename-in-place doesn't relocate the row (the OUTER Track's loc
     *  doesn't move when its body is restructured). Absent when no
     *  enclosing Track has a `loc` (hand-built IR fixtures, runtime-only
     *  events). Phase 20-12.1 follow-up. */
    dollarPos?: number;
    /** Index of the leaf voice (within its enclosing Track) that produced
     *  this event. Set by collect.ts when walking a voice-defining Stack
     *  (`userMethod ∈ {undefined, 'stack'}`). Sequential across nested
     *  voice-defining Stacks — nested Stack arms continue the parent's
     *  leaf counter (mirrors flattenLeafVoices' source-order traversal in
     *  irProjection.ts). Absent when the Track body is a single voice
     *  (no voice-defining Stack), or for hand-built IR that doesn't go
     *  through Track/Stack collect arms — chrome treats absence as "all
     *  events on leaf 0". Phase 20-12 sub-row partition support. */
    leafIndex?: number;
    /** Index of the time-sequence ARM (clip) that produced this event, within
     *  the OUTERMOST `Arrange` node (`arrange`/`cat`/`slowcat` combinator) of its
     *  track. Set by collect.ts's Arrange arm — mirrors `leafIndex`, but
     *  partitions a track HORIZONTALLY (which clip along the timeline) rather than
     *  vertically (which voice). For a NESTED combinator (an arm whose pattern is
     *  itself a combinator) the OUTER index wins — the inner combinator does NOT
     *  overwrite it (#451) — so the whole nested block reads as one outer clip and
     *  the song timeline binds the outer combinator. Absent for tracks with no
     *  arrangement combinator — the timeline treats a bare track as one implicit
     *  clip (design §5 option b). Together with the lane key it identifies a clip.
     *  Phase 5a (#386). */
    armIndex?: number;
    /** Engine-specific extended parameters */
    params?: Record<string, unknown>;
}

/**
 * IRPattern — the universal queryable music pattern.
 *
 * Any engine that can answer "what happens between time A and time B?"
 * implements this interface. Viz renderers, the DAW timeline, and
 * transforms all consume IRPattern.
 *
 * Time domain matches the producing engine's scheduler — consumers
 * compare query results against now() in the same domain.
 */

interface IRPattern {
    /** Current time position in the pattern's time domain. */
    now(): number;
    /** Query events overlapping the time range [begin, end). */
    query(begin: number, end: number): IREvent[];
}

/**
 * Pure transform functions on IREvent arrays.
 *
 * No classes, no state. Each function takes events in, returns events out.
 * Composable: transpose(filter(events, pred), 12)
 */

/**
 * Merge multiple patterns into one. Events from all sources appear
 * in the merged query result, sorted by begin time.
 *
 * CONSTRAINT: All patterns must use the same time domain (all cycles
 * or all audio-seconds). Merging across time domains is undefined.
 */
declare function merge(patterns: IRPattern[]): IRPattern;
/**
 * Transpose note values by a number of semitones.
 * String notes are left unchanged (no enharmonic spelling logic).
 */
declare function transpose(events: IREvent[], semitones: number): IREvent[];
/**
 * Scale time positions by a factor.
 * factor < 1 = compress (faster), factor > 1 = stretch (slower).
 */
declare function timestretch(events: IREvent[], factor: number): IREvent[];
/**
 * Filter events by predicate. Returns only events where pred returns true.
 */
declare function filter(events: IREvent[], pred: (e: IREvent) => boolean): IREvent[];
/**
 * Scale gain of all events by a factor.
 */
declare function scaleGain(events: IREvent[], factor: number): IREvent[];

/**
 * PatternIR — the free monad over musical effects.
 *
 * The universal structural representation of music patterns.
 * PatternIR is the tree — IREvent[] is the derived flattened denotation.
 * Both coexist: PatternIR for structure/editing, IREvent[] for rendering.
 *
 * Design decisions:
 * - Tagged union (not generic <A>) — no return values needed for Phase F interpreters
 * - No Bind node — Seq covers musical sequencing without data dependency
 * - Code node — opaque fallback for fragments the parser can't handle
 * - All nodes are plain objects — serializable, no methods
 */

/** One arm of an `Arrange` time-sequence node = one timeline clip. Phase 5a. */
interface ArrangeArm {
    /** Cycle weight — how many WHOLE cycles this arm spans (the `n` in
     *  `arrange([n, pat])`). `1` for every `cat`/`slowcat` arm. The arm occupies
     *  the cycle range `[Σweight_before, Σweight_before + weight)`; the whole
     *  node's period is `Σ weight`. */
    weight: number;
    /** The arm's pattern sub-IR. Plays at its natural rate within the arm's span
     *  (its internal cycle advances across the span — grounded). */
    pattern: PatternIR;
    /** Source range. For `arrange` arms this is the `[n, pat]` TUPLE range (so
     *  write-back can edit the weight `n`); for `cat`/`slowcat` arms it is the
     *  pattern-expression range. Optional only for hand-built fixtures. */
    loc?: SourceLocation[];
}
interface PlayParams {
    s?: string;
    gain?: number;
    velocity?: number;
    sustain?: number;
    release?: number;
    pan?: number;
    color?: string;
    [key: string]: unknown;
}
type PatternIR = {
    tag: 'Pure';
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
} | {
    tag: 'Seq';
    children: PatternIR[];
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
} | {
    tag: 'Stack';
    tracks: PatternIR[];
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
} | {
    tag: 'Play';
    note: string | number;
    duration: number;
    params: PlayParams;
    loc?: SourceLocation[];
    unresolvedChain?: string;
    chainOffset?: number;
} | {
    tag: 'Sleep';
    duration: number;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Choice';
    p: number;
    then: PatternIR;
    else_: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Every';
    n: number;
    body: PatternIR;
    default_?: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Cycle';
    items: PatternIR[];
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
} | {
    tag: 'When';
    gate: string;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'FX';
    name: string;
    params: Record<string, number | string>;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Ramp';
    param: string;
    from: number;
    to: number;
    cycles: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Fast';
    factor: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Slow';
    factor: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Elongate';
    factor: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Late';
    offset: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Degrade';
    p: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Chunk';
    n: number;
    transform: PatternIR;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Ply';
    n: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Pick';
    selector: PatternIR;
    lookup: PatternIR[];
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Struct';
    mask: string;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Swing';
    n: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Shuffle';
    n: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Scramble';
    n: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Chop';
    n: number;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Param';
    key: string;
    value: string | number | PatternIR;
    rawArgs: string;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Track';
    trackId: string;
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Loop';
    body: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
} | {
    tag: 'Code';
    code: string;
    lang: 'strudel';
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
    via?: {
        method: string;
        args: string;
        callSiteRange: [number, number];
        inner: PatternIR;
    } | {
        literal: true;
        raw: string;
    };
} | {
    tag: 'Signal';
    kind: 'sine' | 'cosine' | 'saw' | 'isaw' | 'tri' | 'square' | 'pulse' | 'perlin' | 'berlin' | 'time' | 'rand' | 'rand2' | 'brand' | 'sine2' | 'cosine2' | 'saw2' | 'isaw2' | 'tri2' | 'square2' | 'mousex' | 'mousey';
    args?: string;
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
} | {
    tag: 'Builder';
    kind: 'run' | 'irand' | 'binary' | 'binaryN' | 'binaryL' | 'binaryNL' | 'chord' | 'arrange';
    args: string;
    body?: PatternIR;
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
} | {
    tag: 'Arrange';
    mode: 'arrange' | 'cat' | 'slowcat';
    arms: ArrangeArm[];
    loc?: SourceLocation[];
    userMethod?: string;
    unresolvedChain?: string;
    chainOffset?: number;
};
/**
 * Optional metadata accepted by every non-rest-spread smart constructor
 * below. The smart constructor mirrors `IR.play`'s convention — only sets
 * each field when truthy, so test fixtures that build nodes without
 * metadata and assert via `toEqual({ tag: 'Fast', factor: 2, body: ... })`
 * keep working unchanged. CONTEXT D-07.
 *
 * Rest-spread constructors (`seq`, `stack`, `cycle`) CANNOT take a trailing
 * positional `meta?` parameter (TypeScript rejects positional-after-rest);
 * desugar / root sites that need metadata on those tags use literal
 * construction `{ tag: 'Stack', tracks, loc, userMethod }` directly.
 * RESEARCH §2 / §11 Q1.
 */
type TagMeta = {
    loc?: SourceLocation[];
    userMethod?: string;
};
/** Smart constructors — reduce boilerplate when building trees by hand. */
declare const IR: {
    readonly pure: (meta?: TagMeta) => PatternIR;
    readonly play: (note: string | number, duration?: number, params?: Partial<PlayParams>, loc?: SourceLocation[]) => PatternIR;
    readonly sleep: (duration: number, meta?: TagMeta) => PatternIR;
    readonly seq: (...children: PatternIR[]) => PatternIR;
    readonly stack: (...tracks: PatternIR[]) => PatternIR;
    readonly choice: (p: number, then: PatternIR, else_?: PatternIR, meta?: TagMeta) => PatternIR;
    readonly every: (n: number, body: PatternIR, default_?: PatternIR, meta?: TagMeta) => PatternIR;
    readonly cycle: (...items: PatternIR[]) => PatternIR;
    readonly when: (gate: string, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly fx: (name: string, params: Record<string, number | string>, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly param: (key: string, value: string | number | PatternIR, rawArgs: string, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly track: (trackId: string, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly ramp: (param: string, from: number, to: number, cycles: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly fast: (factor: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly slow: (factor: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly elongate: (factor: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly late: (offset: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly degrade: (p: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly chunk: (n: number, transform: PatternIR, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly ply: (n: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly pick: (selector: PatternIR, lookup: PatternIR[], meta?: TagMeta) => PatternIR;
    readonly struct: (mask: string, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly swing: (n: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly shuffle: (n: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly scramble: (n: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly chop: (n: number, body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly loop: (body: PatternIR, meta?: TagMeta) => PatternIR;
    readonly arrange: (mode: "arrange" | "cat" | "slowcat", arms: ArrangeArm[], meta?: TagMeta) => PatternIR;
    readonly code: (code: string, meta?: TagMeta) => PatternIR;
    readonly signal: (kind: (PatternIR & {
        tag: "Signal";
    })["kind"], args?: string, meta?: TagMeta) => PatternIR;
    readonly builder: (kind: (PatternIR & {
        tag: "Builder";
    })["kind"], args: string, body?: PatternIR, meta?: TagMeta) => PatternIR;
};

/**
 * collect — the "Execute" interpreter for PatternIR.
 *
 * Walks a PatternIR tree and produces IREvent[].
 * The flattening operation: evaluates the tree at a given time range and
 * returns concrete events with absolute time positions.
 *
 * Ownership: collect() CREATES IREvents. It is the sole producer.
 * Consumers (viz, DAW, highlighting) read the resulting array.
 */

interface CollectContext {
    /** Query window start (cycles) */
    begin: number;
    /** Query window end (cycles) */
    end: number;
    /** Current position within the query window */
    time: number;
    /** Current cycle number — used for Every, Cycle selection */
    cycle: number;
    /** Base duration for one "slot" in cycles (1 = full cycle) */
    duration: number;
    /** Accumulated speed factor (Fast multiplies, Slow divides) */
    speed: number;
    /** Inherited parameters from enclosing FX/Ramp nodes */
    params: Record<string, number | string>;
    /**
     * Phase 20-11 — populated by Track wrapper arm (β-1). Outer-then-inner
     * spread: nested Track sets ctx.trackId via simple override (last walk-
     * pass wins → outer wins → matches "last-typed-source-wins" because
     * parser places the LAST-chained .p() as the OUTERMOST wrapper).
     * Absent for hand-built IR without Track wrapper (test fixtures); that
     * case yields IREvent.trackId === undefined (omitted via conditional
     * spread in makeEvent — CONTEXT pre-mortem #6).
     */
    trackId?: string;
    /**
     * Phase 20-12.1 follow-up — source-position anchor of the OUTERMOST
     * `$:` Track enclosing this event. Set ONCE at the outer Track entry
     * (via `ctx.dollarPos ?? ir.loc?.[0]?.start` — outer-wins so inner
     * `.p()`-wrapped Tracks don't override). Threaded onto events so the
     * timeline can key rows by source position rather than by `.p()` name,
     * preserving slot identity across `.p()` renames.
     */
    dollarPos?: number;
    /**
     * Phase 20-12 — populated by voice-defining Stack arm. Each voice-row
     * inside a `$:` block (each `stack(...)` arg) gets a sequential leaf
     * index 0..N-1, threaded onto produced events for chrome sub-row
     * partitioning. RESET to undefined at Track entry so inner Tracks
     * start a fresh leaf counter. Nested voice-defining Stacks continue
     * the parent's counter (sequential numbering across recursion).
     */
    leafIndex?: number;
    /**
     * Phase 5a (#386) — set by the Arrange arm to the index of the active
     * time-sequence arm (clip) for the current cycle. Threaded onto produced
     * events so the timeline can attribute events to clips. Unlike leafIndex it
     * is NOT reset at Track entry — an Arrange typically IS the Track body, so
     * its arm index must reach the leaves below it.
     */
    armIndex?: number;
}
/**
 * Walk a PatternIR tree and return a flat array of IREvents.
 *
 * @param ir - the pattern tree to evaluate
 * @param partialCtx - optional context override (begin, end, cycle, etc.)
 */
declare function collect(ir: PatternIR, partialCtx?: Partial<CollectContext>): IREvent[];
/**
 * Collect events across N consecutive cycles. The single-cycle `collect`
 * emits events in [0, 1); for the timeline (which displays
 * `WINDOW_CYCLES` cycles) we want events filling [0, WINDOW_CYCLES).
 * Loops `collect()` once per cycle with `time = begin = c, end = c + 1`
 * and concatenates results — events from cycle `c` carry begin/end ∈
 * [c, c+1).
 *
 * Promoted from `__tests__/helpers/collectCycles.ts` (extracted in
 * Phase 19-03-08, used by parity tests). Production caller:
 * `StrudelEditorClient` populates `IRSnapshot.events` so the timeline's
 * cycle-1 column isn't empty for static viz patterns. Cross-cycle
 * variation (`<a b c>` alternation, `degrade`, `shuffle`) renders
 * its full per-cycle shape inside the visible window.
 *
 * Phase 20-12 chrome-fidelity fix.
 */
declare function collectCycles(ir: PatternIR, startCycle: number, endCycle: number): IREvent[];

/**
 * toStrudel — PatternIR → Strudel code string interpreter.
 *
 * Generates valid Strudel code from a PatternIR tree.
 * The generated code should be evaluatable by StrudelEngine.
 *
 * Design decision: Simple Seq nodes where all children are Play nodes
 * collapse into mini-notation ("c4 e4 g4") for idiomatic Strudel output.
 * Any Seq with non-Play children uses explicit method chains.
 */

/** Generate Strudel code from a PatternIR tree. */
declare function toStrudel(ir: PatternIR): string;

/**
 * songAnalysis — full-song analysis for the navigable timeline (#385).
 *
 * Re-expresses the reference editor's `analyze`/`attribute` capabilities on
 * top of our IR: query the evaluated pattern over a PROGRESSIVE horizon
 * (hint-seeded, doubling to a cap) in budget-bounded slices, accumulate
 * per-lane onset activity, detect the loop PERIOD from per-cycle fingerprints,
 * and partition the horizon into SECTIONS by active-lane signature.
 *
 * Design SoT: VISUAL-EDITING-AND-SCRUB-DESIGN.md §7.5. Runs off the in-memory
 * IR and NEVER calls `toStrudel` (no fidelity tax). Pure sub-functions operate
 * on already-collected `IREvent[]`; the async `analyzeSong` wrapper owns the
 * budgeted collection. Both the collector, the clock, and the yield primitive
 * are injectable so the slicing logic is deterministic under test.
 *
 * Attribution note: lanes key on `trackId ?? s ?? '$default'` — the SAME key
 * the timeline's `groupEventsByTrack` uses — so analysis lanes line up exactly
 * with rendered rows. `trackId`/`dollarPos` already carry IR-node provenance
 * (assigned by collect.ts), so this is reuse, not a parallel attribution path.
 *
 * Seek caveat (§7.4): patterns with RNG/state (`degrade`, `shuffle`, running
 * counters) have no clean loop — `detectPeriod` returns null and the horizon
 * falls back to the analyzed cap. Documented edge, not a bug.
 */

/**
 * Lane (row) key for an event. Mirrors `groupEventsByTrack`'s key so analysis
 * lanes and rendered timeline rows share identity.
 */
declare function laneKeyOf(ev: IREvent): string;
interface LaneActivity {
    readonly laneKey: string;
    /** `onsetsByCycle[c]` = count of event onsets with `floor(begin) === c`.
     *  Length === `horizonCycles`. */
    readonly onsetsByCycle: readonly number[];
}
interface SongSection {
    /** First cycle of the section (inclusive). */
    readonly startCycle: number;
    /** One past the last cycle (exclusive). */
    readonly endCycle: number;
    /** Lane keys active anywhere in the section, sorted for stable identity. */
    readonly laneKeys: readonly string[];
}
interface SongAnalysis {
    /** Detected loop period in cycles, or `null` if none within the horizon. */
    readonly periodCycles: number | null;
    /** Number of cycles actually analyzed. */
    readonly horizonCycles: number;
    /** Per-lane onset activity across the horizon, in first-seen lane order. */
    readonly lanes: readonly LaneActivity[];
    /** Contiguous sections partitioning `[0, horizonCycles)` by active-lane set. */
    readonly sections: readonly SongSection[];
    /** True when the progressive horizon reached the cap before a period was
     *  found (e.g. RNG/stateful patterns with no clean loop). */
    readonly reachedCap: boolean;
}
/**
 * Accumulate per-lane onset counts bucketed by integer cycle over
 * `[0, horizon)`. Lane order is first-seen (matching `groupEventsByTrack`).
 * Events whose `floor(begin)` lands outside `[0, horizon)` are ignored.
 */
declare function accumulateLanes(events: readonly IREvent[], horizon: number): LaneActivity[];
/**
 * Per-cycle fingerprint string — a sorted signature of every onset's
 * (lane, within-cycle offset, note) in that cycle. Two cycles with identical
 * fingerprints are musically identical, which is what period detection needs.
 * Within-cycle offset is quantised to 1e-6 to absorb float noise from the
 * rational→number conversion in collect.
 */
declare function cycleFingerprints(events: readonly IREvent[], horizon: number): string[];
/**
 * Smallest period `p` in `[1, floor(len/2)]` such that every cycle equals the
 * cycle `p` ahead of it — and at least two full repetitions exist (`len >= 2p`)
 * so a one-off prefix can't masquerade as a period. Returns `null` when no
 * such period exists within the analyzed length.
 */
declare function detectPeriod(fingerprints: readonly string[]): number | null;
/**
 * Partition `[0, horizon)` into contiguous sections, cutting wherever the set
 * of active lanes (lanes with ≥1 onset in that cycle) changes. Captures the
 * musical arc — intro/drop/breakdown emerge as the active-lane set thins and
 * thickens. Silent runs become their own (empty-lane) sections.
 */
declare function computeSections(lanes: readonly LaneActivity[], horizon: number): SongSection[];
/**
 * Compose the pure analysis: lanes + period + sections over `[0, horizon)`.
 * `reachedCap` is supplied by the caller (it's a property of the collection
 * loop, not of the events). Synchronous — used directly in unit tests.
 */
declare function analyzeEvents(events: readonly IREvent[], horizon: number, reachedCap?: boolean): SongAnalysis;
interface AnalyzeSongOptions {
    /** Initial horizon to collect before the first period check (default 8). */
    hintCycles?: number;
    /** Maximum horizon to grow to (default 256). */
    capCycles?: number;
    /** Cycles collected per slice before a budget check (default 4). */
    sliceCycles?: number;
    /** Wall-clock budget (ms) between yields to the event loop (default 10). */
    sliceBudgetMs?: number;
    /** Collector — defaults to `collectCycles(ir, …)`. Injected in tests. */
    collectFn?: (startCycle: number, endCycle: number) => IREvent[];
    /** Clock — defaults to `performance.now()`. Injected in tests. */
    now?: () => number;
    /** Yield to the event loop between budgeted slices. Default = macrotask. */
    yieldFn?: () => Promise<void>;
    /** Cooperative cancellation; checked between slices. */
    signal?: {
        readonly aborted: boolean;
    };
}
/**
 * Analyze the whole song off the in-memory IR. Collects a progressive horizon
 * (hint → doubling → cap) in budget-bounded slices, yielding to the event loop
 * whenever a slice exceeds `sliceBudgetMs`, and stops as soon as a loop period
 * is confirmed (or the cap is hit). Returns a `SongAnalysis` describing lanes,
 * period, and sections.
 *
 * `null` IR (or a collector returning nothing) yields an empty analysis.
 */
declare function analyzeSong(ir: PatternIR | null, opts?: AnalyzeSongOptions): Promise<SongAnalysis>;

/**
 * PatternIR JSON serialization.
 *
 * Serialize PatternIR trees to/from JSON.
 * Since PatternIR is already a tagged union of plain objects, round-trip is lossless.
 *
 * The JSON envelope adds a schema version for LLM consumption and versioning.
 */

declare const PATTERN_IR_SCHEMA_VERSION = "1.0";
/** Serialize a PatternIR tree to JSON. */
declare function patternToJSON(ir: PatternIR, pretty?: boolean): string;
/** Deserialize a PatternIR tree from JSON. Throws on invalid input. */
declare function patternFromJSON(json: string): PatternIR;

/**
 * parseMini — mini-notation string → PatternIR.
 *
 * Parses Strudel's mini-notation DSL (the string inside note("...") or s("...")).
 * Recursive descent parser that handles the Phase F subset plus the
 * Tier 2 mini-notation features (Phase 19-02):
 *   - Sequences: "c4 e4 g4"
 *   - Rests: "c4 ~ e4"
 *   - Cycles (alternation): "<c4 e4 g4>"
 *   - Sub-sequences: "[c4 e4] g4"
 *   - Repeat: "c4*2"
 *   - Sometimes: "c4?"
 *   - Slice (sample index): "bd:2"             — Tier 2
 *   - Elongation (step weight): "c4@2 e4"      — Tier 2
 *   - Euclidean: "bd(3,8)" / "bd(3,8,2)"        — Tier 2
 *   - Polymetric: "{c4 e4, bd hh sd}"          — Tier 2
 *
 * Tier 2 features lower into existing IR nodes — no new tags. Slice
 * lands in Play.params, elongation scales Play.duration, Euclidean
 * expands to a flat Seq via Bjorklund, polymetric becomes Stack.
 */

/**
 * Parse a mini-notation string. Returns Pure for empty input. Never throws.
 *
 * `baseOffset` — character offset of `input[0]` within the user's full
 * source code. Lets the parser attach `loc` to Play nodes so downstream
 * consumers (Inspector click-to-source, Monaco highlighting) can map
 * an event back to the exact span of code that produced it. Caller is
 * responsible for the offset; parseStrudel computes it from the
 * regex match index of the quoted-string content.
 */
declare function parseMini(input: string, isSample?: boolean, baseOffset?: number): PatternIR;

/**
 * parseStrudel — Strudel code string → PatternIR.
 *
 * Structural pattern matcher (not a full JS parser).
 * Handles the most common Strudel patterns by regex extraction.
 *
 * Strategy:
 * 1. Split code by $: lines → extract track blocks
 * 2. For each track: identify root function (note/s/stack)
 * 3. Parse mini-notation string argument
 * 4. Walk the method chain (.fast/.slow/.every/etc.)
 * 5. Combine tracks into Stack
 *
 * Unsupported fragments fall back to Code nodes (never throws).
 */

declare function classifyLiteralRhs(rhs: string): {
    tag: 'Code';
    code: string;
    lang: 'strudel';
    via: {
        literal: true;
        raw: string;
    };
} | null;
/** Parse a Strudel code string. Always returns a tree (Code node for unsupported). */
declare function parseStrudel(code: string, _opts?: {
    recogniseGeneralChainRoots?: boolean;
}): PatternIR;

/**
 * parseStrudel — staged pipeline.
 *
 * Surfaces the 4 internal stages of parseStrudel as named passes so
 * the IR Inspector can render each as a tab. End-to-end behavior at
 * FINAL is byte-identical to parseStrudel(code) (D-06 regression gate).
 *
 * Stage boundaries (CONTEXT D-02):
 *   RAW            — extractTracks: per-track Code lifts + offsets
 *   MINI-EXPANDED  — parseRoot per track; chains held as metadata
 *   CHAIN-APPLIED  — applyChain runs per track; metadata dropped
 *   FINAL          — identity today; reserved for future polish
 *
 * Pass<IR> contract: each stage runs PatternIR → PatternIR.
 * Seed input: callers wrap raw source `code: string` in IR.code(code)
 * before pass 0. Pass 0 (RAW) reads input.tag === 'Code' && input.code.
 *
 * Phase 19-07 (#79).
 */

/**
 * RAW — per-track Code lifts.
 *
 * 0 tracks → single Code node carrying `code.trim()` text + loc spanning
 *            from first non-WS char to end of source.
 * 1 track  → single Code node carrying that track's `expr` text + loc
 *            from extractTracks.
 * ≥2 tracks → outer Stack of per-track Code lifts; userMethod undefined
 *             (synthetic from RAW; projects to mini polymetric `{}` per
 *             RESEARCH §6 D-04 risk acceptance).
 *
 * PV25: every Code lift threads extractTracks's existing offset into its
 * loc.start; loc.end = offset + expr.length.
 */
declare function runRawStage(input: PatternIR): PatternIR;
/**
 * MINI-EXPANDED — parseRoot per track; chains held as metadata.
 *
 * Reads RAW's Code lifts (0/1-track single Code, or multi-track Stack
 * of Codes); produces parsed root IR per track with `unresolvedChain`
 * + `chainOffset` metadata stashed on each root for CHAIN-APPLIED to
 * consume.
 *
 * PV31 hot spot: root-level `stack(...)` literal-construction sets
 * userMethod === 'stack' inside parseRoot. We delegate to parseRoot
 * directly so this is preserved by construction.
 */
declare function runMiniExpandedStage(input: PatternIR): PatternIR;
/**
 * CHAIN-APPLIED — reads `unresolvedChain` + `chainOffset` metadata from
 * each track root; calls applyChain with the chainOffset as baseOffset
 * (PK12 dot-inclusive convention preserved); drops metadata from output.
 *
 * Per RESEARCH §6 D-05 alternative: PR-A ships the REAL implementation
 * here (not a no-op stub), tested as identity-equivalent-to-today's-
 * parseStrudel-output via T-05.c regression sentinel. PR-B's split is
 * about splitting FINAL out as a polish stage, not about replacing this
 * logic.
 *
 * D-06.c: output has NO orphan unresolvedChain/chainOffset on any node.
 */
declare function runChainAppliedStage(input: PatternIR): PatternIR;
/**
 * FINAL — identity today; reserved for future normalization passes
 * (per CONTEXT scope). Keeps the name `'Parsed'` at the STRUDEL_PASSES
 * call site for tab-persistence backward-compat (RESEARCH §3.2).
 */
declare function runFinalStage(input: PatternIR): PatternIR;

/**
 * A pass is a sync, pure IR→IR transform. Must not mutate `input`;
 * returning the same reference is allowed for identity passes.
 */
interface Pass<IR> {
    readonly name: string;
    run(input: IR): IR;
}
/**
 * Runs passes in order, returning one entry per pass with the IR
 * after that pass ran. There is no implicit input entry — callers
 * that want to surface the raw input wrap it in an identity pass.
 */
declare function runPasses<IR>(input: IR, passes: readonly Pass<IR>[]): {
    name: string;
    ir: IR;
}[];

/**
 * Propagation engine — ordered system execution over a component bag.
 *
 * Systems are pure functions that read from and write to a ComponentBag.
 * They run in stratum order (lower = earlier). No fixed-point, no cycles.
 * Full Datalog fixed-point deferred to Phase 19.
 */

interface ComponentBag {
    strudelCode?: string;
    sonicPiCode?: string;
    patternIR?: PatternIR;
    irEvents?: IREvent[];
}
interface System {
    name: string;
    /** Execution order. Lower stratum runs first. Within a stratum, order is deterministic. */
    stratum: number;
    inputs: (keyof ComponentBag)[];
    outputs: (keyof ComponentBag)[];
    run(bag: ComponentBag): ComponentBag;
}
/**
 * Run all systems in stratum order against the component bag.
 * Each system reads from the bag and returns an updated bag.
 * Systems with missing inputs are skipped.
 */
declare function propagate(bag: ComponentBag, systems: System[]): ComponentBag;
declare const StrudelParseSystem: System;
declare const IREventCollectSystem: System;

interface HapEvent {
    /** Full Strudel Hap object (optional for non-Strudel engines) */
    hap?: any;
    /** AudioContext.currentTime when note fires */
    audioTime: number;
    /** Duration in AudioContext seconds */
    audioDuration: number;
    /** Lookahead offset in ms (use for display timing delays) */
    scheduledAheadMs: number;
    /** Computed MIDI note number (null for unpitched percussion) */
    midiNote: number | null;
    /** Instrument/sample name from hap.value.s */
    s: string | null;
    /** From .color() in pattern */
    color: string | null;
    /** Source character ranges in the original code string */
    loc: Array<{
        start: number;
        end: number;
    }> | null;
    /**
     * Set when the hap's structural loc matches an IR-published node
     * (PV38 clause 2). Absent for runtime-only haps — same semantics as
     * IREvent.irNodeId. Populated by HapStream.emit when a lookup is
     * supplied (Phase 20-06).
     */
    irNodeId?: string;
}
type HapHandler$1 = (event: HapEvent) => void;
/**
 * Lightweight event bus fed by StrudelEngine's scheduler onTrigger.
 * All visualizers and the highlight system subscribe here.
 */
declare class HapStream {
    private handlers;
    on(handler: HapHandler$1): void;
    off(handler: HapHandler$1): void;
    /**
     * Called by the engine scheduler for each scheduled Hap.
     * Enriches the raw data and fans it out to all subscribers.
     *
     * Parameters match Strudel's onTrigger signature:
     *   (hap, deadline, duration, cps, t)
     *
     * Optional 6th positional `lookup` (Phase 20-06) — when supplied AND the
     * hap carries a structural loc, the published IR-side match is resolved
     * via `findMatchedEvent` and the matched event's `irNodeId` is populated
     * onto the fan-out HapEvent. PV38 clause 2 onTrigger half. Single-
     * strategy match (P50) — same helper as the queryArc-side enrichment in
     * `normalizeStrudelHap`.
     *
     * Phase 20-07 (T-α-2) — returns the enriched HapEvent so the engine's
     * wrappedOutput hit-check can read `event.irNodeId` in O(1) without
     * re-running findMatchedEvent (P50 — single-strategy match preserved).
     * Additive: 8 existing test callers + 1 production caller currently
     * ignore the void return; widening void → HapEvent does not break them.
     */
    emit(hap: any, deadline: number, duration: number, cps: number, audioCtxCurrentTime: number, lookup?: ReadonlyMap<string, IREvent[]>): HapEvent;
    /**
     * Emit a pre-constructed HapEvent directly.
     * Preferred API for non-Strudel engines that don't have raw hap objects.
     */
    emitEvent(event: HapEvent): void;
    dispose(): void;
}

/**
 * BreakpointStore — engine-attached registry of irNodeIds that should
 * pause the scheduler when a hap with that id fires (PK13 step 9).
 *
 * Single source of truth for both registration UIs:
 *  - Monaco gutter click → toggleSet([leaf-ids on that line])
 *  - Inspector chain-row click → toggleSet([leaf-ids in that subtree])
 *
 * Hit-check at StrudelEngine.wrappedOutput reads `has(irNodeId)` on every
 * fired hap; HOT PATH — keep API to O(1) Set ops only (P50 — D-03 forbids
 * predicate evaluation here).
 *
 * Per-engine scope (CONTEXT T9): one instance per StrudelEngine, disposed
 * with the engine. File-switch resets breakpoints — documented v1
 * behaviour. Future 20-07-follow-up adds localStorage hydrate via
 * `serialize()` / `hydrate()` methods. Do NOT add them now (Q6 — premature
 * solidification).
 *
 * Phase 20-07 (PV38, PK13 step 9, P50).
 */
type Listener$7 = () => void;
/**
 * Phase 20-07 (R-3) — per-id metadata held alongside the irNodeId.
 *
 * `lineHint` is the 1-based Monaco line number captured at registration
 * time. It exists so an orphaned breakpoint (id no longer in
 * snap.irNodeIdLookup, e.g. user edited the s-string) can still render a
 * muted glyph on its original line — letting the user clear it via
 * gutter-click. Without `lineHint`, an orphaned id registered via the
 * Inspector chain-row (no Monaco line context) is unreachable from the
 * gutter and persists silently in the store.
 *
 * Set when add/addSet is called from the gutter handler (β):
 *   lineHint = clicked line.
 * Set when add/addSet is called from the Inspector chain-row (γ):
 *   lineHint = matched IREvent's loc[0] resolved to a 1-based line via
 *   snap.irNodeIdsByLine reverse-lookup, OR undefined if unavailable.
 *
 * `undefined` is allowed: an orphan with no lineHint is documented as
 * "Inspector-side orphan; cleared via Inspector right-click in
 * 20-07-follow-up."
 */
interface BreakpointMeta {
    readonly lineHint?: number;
}
declare class BreakpointStore {
    private ids;
    private listeners;
    has(id: string): boolean;
    size(): number;
    /** Phase 20-07 (R-3) — read the optional lineHint for orphan rendering. */
    getMeta(id: string): BreakpointMeta | undefined;
    add(id: string, meta?: BreakpointMeta): void;
    remove(id: string): void;
    toggle(id: string, meta?: BreakpointMeta): void;
    /**
     * Add every id in `ids` to the store. Existing ids keep their meta —
     * `meta` is applied to NEWLY added ids only. This is the discipline that
     * lets a gutter-click set lineHint without clobbering a hint set by an
     * earlier Inspector registration (CONTEXT T5 / R-3).
     */
    addSet(ids: readonly string[], meta?: BreakpointMeta): void;
    removeSet(ids: readonly string[]): void;
    /**
     * Toggle a SET semantically: if every id is already present, remove all;
     * else add all (treating the set as one breakpoint). The "any missing →
     * add all" rule resolves the gutter-vs-Inspector desync case (CONTEXT
     * T5) — gutter click on a line where Inspector removed individual ids
     * re-adds the full set.
     *
     * `meta` is applied to ids being ADDED in this call only; ids already
     * present keep their existing meta (don't clobber a lineHint set by an
     * earlier registration path).
     */
    toggleSet(ids: readonly string[], meta?: BreakpointMeta): void;
    /** Read-only iteration — for orphan detection + UI rendering. */
    entries(): ReadonlyMap<string, BreakpointMeta>;
    /** Convenience: just the ids without metadata. */
    idSet(): ReadonlySet<string>;
    /**
     * Subscribe to mutate events. Returns a disposer mirroring
     * `LiveCodingRuntime.onPlayingChanged` (RESEARCH Q3 / S3).
     */
    subscribe(cb: Listener$7): () => void;
    dispose(): void;
    private fireChanged;
}

/**
 * p5 viz compiler — pure compilation logic with no renderer dependencies.
 *
 * Kept separate from `vizCompiler.ts` so that tests and tooling can
 * import the compile functions without pulling the full p5 /
 * gifenc / renderer stack through the module graph. (The same
 * isolation trick used by `namedVizBridge.ts` vs. `vizPresetBridge.ts`.)
 *
 * The descriptor wiring layer lives in `vizCompiler.ts` and calls
 * into here for the actual source-to-factory conversion.
 */

/** A per-sound or per-track reading as live NUMBERS (p5 D-01 shape — getters,
 *  NOT thunks; the renderer reads them directly inside `draw`). DSP scalars
 *  (`rms`/`bass`/`mid`/`treble`) are live numbers; DSP arrays (`fft`/`wave`)
 *  are live `number[]` indexed directly (`sig('bd').fft[i]`). All read fresh per
 *  access — the reading object is produced by a getter through `with`. */
interface P5SignalReading {
    env: number;
    velocity: number;
    note: number | string | null;
    color: string | null;
    /** Time-domain RMS, 0..1. */
    rms: number;
    /** Low-band magnitude, 0..1. */
    bass: number;
    /** Mid-band magnitude, 0..1. */
    mid: number;
    /** High-band magnitude, 0..1. */
    treble: number;
    /** Normalized magnitude spectrum, `number[]`. */
    fft: number[];
    /** Time-domain waveform -1..1, `number[]`. */
    wave: number[];
}
/** The single `sig` namespace (#351) — a callable carrying every Stave-injected
 *  viz signal. p5 shape (D-01): `sig('bd').env` is a NUMBER (live each read), not
 *  a thunk; the per-drum scalars (`sig.kick`…) and master DSP (`sig.rms`/`sig.fft`)
 *  are live getters on the SAME object. */
interface SigAccessor {
    (sound: string): P5SignalReading;
    /** Per-track reading, keyed on the scheduler key space (`$0`/`drums`). */
    track: (id: string) => P5SignalReading;
    /** Enumerate published track keys (scheduler key space). */
    tracks: string[];
    /** Enumerate distinct sounds seen through the envelope feed. */
    sounds: string[];
    kick: number;
    snare: number;
    hat: number;
    openHat: number;
    clap: number;
    rim: number;
    tom: number;
    /** Loudest active hit 0..1, global (was `uKeyVelocity`). */
    keyVelocity: number;
    /** Master-mix time-domain RMS, 0..1 (live getter). */
    rms: number;
    /** Master-mix low-band magnitude, 0..1 (live getter). */
    bass: number;
    /** Master-mix mid-band magnitude, 0..1 (live getter). */
    mid: number;
    /** Master-mix high-band magnitude, 0..1 (live getter). */
    treble: number;
    /** Live master-mix magnitude spectrum, `number[]`. */
    fft: number[];
    /** Live master-mix waveform -1..1, `number[]`. */
    wave: number[];
    /**
     * Quality / level-of-detail multiplier in `(0, 1]`, live (#269). `1` = full
     * detail (default); "performance mode" lowers it. A CPU-tessellation-bound
     * sketch (line meshes — the class a resolution drop does NOT help, #232)
     * should scale its segment / history COUNT by this, e.g.
     * `Math.max(2, Math.round(BASE_SEGMENTS * sig.density))`. Fill/fragment-bound
     * sketches gain nothing here and instead ride the render-resolution knob the
     * renderer applies composite-side. Reads `vizConfig.density` fresh each access
     * (worker: its marshalled singleton — the config-marshal channel feeds it). */
    density: number;
}
/**
 * Phase 21 / #351 — the live signal object handed to a p5 sketch as the THIRD
 * `new Function` arg. It exposes the single `sig` namespace (mirrored onto
 * `stave.sig`, D-02), resolved bare per-frame through the inner
 * `with (staveUniforms)`. The per-drum scalars / master DSP are getters ON `sig`
 * itself (`sig.kick`, `sig.fft`) — p5 D-01: live numbers, NOT thunks.
 *
 * `__tick` is a NON-enumerable hook the draw wrapper calls ONCE per frame
 * (`bus.tick(); bus.refreshActive(bus.now())`) — the decay tick fires exactly
 * once per draw (U2), NEVER inside a getter (a getter-tick double-ticks when a
 * sketch reads N signals → decay collapses to 0). Built by `P5VizRenderer`,
 * which owns the (pure) SignalBus; the compiler stays renderer-agnostic and
 * only consumes the shape.
 */
interface StaveUniforms {
    readonly sig: SigAccessor;
    /** Per-frame tick hook (non-enumerable). Optional so a sketch compiled
     *  without a bus (tests, demo mode) still runs — the wrapper null-checks. */
    __tick?: () => void;
    /**
     * Custom alias getters (Phase 21 aliases). A user-defined alias (e.g.
     * `kick → bd`) is injected at mount by `P5VizRenderer` as a live getter
     * (`Object.defineProperty(uniforms, name, { get: () => bus.envValue(name) })`)
     * for every merged-map name NOT already a built-in signal. The index
     * signature lets `uniforms[name]` typecheck under strict TS; reads resolve
     * per-frame through the inner `with (staveUniforms)` (full-lifecycle) and the
     * legacy `with (staveUniforms)` wrap (legacy draw-body). `__tick` is read via
     * the optional field above, never via this index (it's non-enumerable). */
    [customAlias: string]: any;
}

/** Real-time hap event stream for visualizers and highlighting. */
interface StreamingComponent {
    hapStream: HapStream;
}
/** Pattern query access -- scheduler for the combined pattern, per-track schedulers. */
interface QueryableComponent {
    scheduler: PatternScheduler | null;
    trackSchedulers: Map<string, PatternScheduler>;
}
/** Web Audio nodes for analysis-based visualizers (scope, spectrum). */
interface AudioComponent {
    analyser: AnalyserNode;
    audioCtx: AudioContext;
    /** Per-track AnalyserNodes for isolated inline viz. Keyed by track ID (e.g. "drums", "$0"). */
    trackAnalysers?: Map<string, AnalyserNode>;
}
/**
 * Free-form per-render viz options bag, sourced from a Strudel viz call's
 * argument — e.g. `.pianoroll({ labels: 1, vertical: 1 })`. Flows engine →
 * component bag → renderer → `stave.options` so sketches can honour the
 * official `@strudel/draw` option vocabulary. Structurally a
 * `VizOptions` (visualizers/types) — kept as a local record alias here to
 * avoid an engine→visualizers import cycle.
 */
type VizOptionsBag = Record<string, unknown>;
/** Per-track inline visualization requests with line placement info. */
interface InlineVizComponent {
    /**
     * Maps track ID (e.g. "$0", "d1") to viz placement info.
     * - vizId: descriptor ID (e.g. "pianoroll", "scope")
     * - afterLine: 1-indexed line number after which to place the view zone
     * - options: the viz call's argument (e.g. `{ labels: 1 }`), if any
     */
    vizRequests: Map<string, {
        vizId: string;
        afterLine: number;
        options?: VizOptionsBag;
    }>;
    /**
     * Optional per-track HapStreams for scoped inline viz.
     * When present, each inline zone subscribes to its track's stream only.
     * When absent, falls back to the global streaming component.
     */
    trackStreams?: Map<string, HapStream>;
    /**
     * Backdrop viz requested via a non-underscore Strudel viz method
     * (e.g. `.scope()`, `.pianoroll()`) during the last evaluate. The
     * non-underscore form is Strudel's "big"/fullscreen viz; Stave maps it
     * to the project backdrop. `vizId` is the resolved Stave renderer id
     * (e.g. "scope", "pianoroll"). Absent when no such method was called.
     */
    backdropRequest?: {
        vizId: string;
        options?: VizOptionsBag;
    };
}
/** Pattern IR derived from the last successful evaluate(). */
interface IRComponent {
    /** Algebraic structure of the pattern (free monad tree). */
    patternIR: PatternIR | null;
    /** Flattened event list derived from patternIR (for rendering). */
    irEvents: IREvent[];
}
/**
 * Component bag exposing engine capabilities.
 * Each slot is independently optional -- consumers MUST check existence before access.
 */
interface EngineComponents {
    streaming: StreamingComponent;
    queryable: QueryableComponent;
    audio: AudioComponent;
    inlineViz: InlineVizComponent;
    /** Pattern IR — present after successful evaluate() on engines that support parsing. */
    ir: IRComponent;
    /**
     * Per-render viz options for THIS zone's renderer — set by `viewZones` from
     * the inline request's `options` (or the backdrop request's), and read by
     * `P5VizRenderer` into `stave.options`. Per-zone, not a global engine slot.
     */
    options?: VizOptionsBag;
}
/**
 * Engine-agnostic interface for live-coding audio engines.
 *
 * Lifecycle contract: init() -> evaluate() -> play() -> stop() -> dispose()
 * - init() must complete before evaluate()
 * - evaluate() may be called multiple times (re-evaluation)
 * - play()/stop() toggle scheduling
 * - dispose() releases all resources
 *
 * The `components` getter returns a partial bag -- which slots are present
 * depends on the engine's state (e.g. audio only after init, queryable after evaluate).
 */
interface LiveCodingEngine {
    /** Initialize the engine (load modules, set up audio context). Must complete before evaluate(). */
    init(): Promise<void>;
    /** Evaluate user code. Returns error info if evaluation fails. */
    evaluate(code: string): Promise<{
        error?: Error;
    }>;
    /** Start the scheduler / begin playback. */
    play(): void;
    /** Stop the scheduler / pause playback. */
    stop(): void;
    /** Release all resources. Engine is unusable after this call. */
    dispose(): void;
    /** Current engine capabilities. Slots appear as data becomes available. */
    readonly components: Partial<EngineComponents>;
    /** Register a handler for runtime errors (fires during scheduling, not evaluation). */
    setRuntimeErrorHandler(handler: (err: Error) => void): void;
}

/**
 * PatternScheduler — backward-compatible alias for IRPattern.
 * New code should import IRPattern from '../ir' directly.
 */
type PatternScheduler = IRPattern;
/**
 * Bundled refs passed to every VizRenderer on mount.
 * @deprecated Use {@link EngineComponents} instead. VizRenderer.mount() now accepts
 * `Partial<EngineComponents>`. This type is retained for backward compatibility.
 */
interface VizRefs {
    hapStreamRef: RefObject<HapStream | null>;
    analyserRef: RefObject<AnalyserNode | null>;
    schedulerRef: RefObject<PatternScheduler | null>;
}
/** Renderer-agnostic visualization lifecycle. */
interface VizRenderer {
    mount(container: HTMLDivElement, components: Partial<EngineComponents>, size: {
        w: number;
        h: number;
    }, onError: (e: Error) => void): void;
    /** Refresh engine data refs (called each React render for live updates). */
    update(components: Partial<EngineComponents>): void;
    resize(w: number, h: number): void;
    pause(): void;
    resume(): void;
    destroy(): void;
}
/** A factory function returning a VizRenderer, or a VizRenderer instance directly. */
type VizRendererSource = (() => VizRenderer) | VizRenderer;
/**
 * Descriptor for a visualization mode in the VizPicker.
 *
 * `requires` lists the engine component slots this viz needs. Used by VizPicker
 * to disable unavailable visualizations. This is about engine data requirements,
 * NOT renderer capabilities (e.g. WebGL) — renderer caps are a separate concern.
 *
 * IDs follow the `"mode:renderer"` convention when multiple renderers offer the
 * same visual concept (e.g. `"pianoroll"` vs `"pianoroll:hydra"`). The bare
 * `"mode"` form is the default renderer for that concept.
 */
interface VizDescriptor {
    id: string;
    label: string;
    requires?: (keyof EngineComponents)[];
    /** Renderer technology name (e.g. 'p5', 'hydra', 'canvas2d'). Used for VizPicker grouping. */
    renderer?: string;
    /**
     * Intrinsic drawing-surface size (the aspect the sketch is authored for).
     * `viewZones` mounts the renderer at this size, so it sets the inline zone's
     * aspect ratio. Omitted → the generic `DEFAULT_NATIVE` (2:1). The pianoroll
     * sets a taller aspect so pitch lanes aren't squashed vs the time axis.
     */
    nativeSize?: {
        w: number;
        h: number;
    };
    factory: () => VizRenderer;
}
/**
 * Live container size handed to user sketches via `stave.width` /
 * `stave.height`. The ref is maintained by `P5VizRenderer` — its
 * `current` field is updated on mount (from the container's initial
 * clientRect) and on every `resize(w, h)` call. User sketches read
 * these values inside `setup()` so `createCanvas(stave.width,
 * stave.height)` always matches the preview pane, regardless of the
 * browser window size or p5's internal `windowWidth` / `windowHeight`
 * globals.
 */
interface ContainerSize {
    w: number;
    h: number;
}
/**
 * Free-form per-render options bag handed to a sketch via `stave.options`.
 * Populated from a Strudel viz call's argument, e.g. `.pianoroll({ labels: 1,
 * vertical: 1 })` — so a sketch can honour the official `@strudel/draw`
 * vocabulary. Empty `{}` when the viz was called with no argument.
 */
type VizOptions = Record<string, unknown>;
/**
 * Internal type alias for the existing p5 sketch factory signature.
 * Used only by P5VizRenderer — NOT exported from the package.
 *
 * `optionsRef` (5th, optional for back-compat) exposes the live per-render
 * options bag as `stave.options`; callers that don't wire it get `{}`.
 *
 * `staveUniformsRef` (6th, optional for back-compat — Phase 21) carries the
 * live named-signal uniform object (`uKick…`, `u(...)`) built by
 * `P5VizRenderer` from its per-renderer SignalBus. Callers that don't wire it
 * get an inert object (all signals 0). Type-only import to avoid a runtime
 * cycle with `p5Compiler`.
 */
type P5SketchFactory = (hapStreamRef: RefObject<HapStream | null>, analyserRef: RefObject<AnalyserNode | null>, schedulerRef: RefObject<PatternScheduler | null>, containerSizeRef: RefObject<ContainerSize>, optionsRef?: RefObject<VizOptions>, staveUniformsRef?: RefObject<StaveUniforms>) => (p: p5.default) => void;

type TierName = 'csound' | 'tidal' | 'midi' | 'osc' | 'serial' | 'gamepad' | 'motion' | 'mqtt';
type TierFlags = Record<TierName, boolean>;
/**
 * Read all 8 tier flags. Returns a fresh object each call; never null.
 * Unset / malformed keys read as `false` (schema-drift safe).
 */
declare function getTierFlags(): TierFlags;
/**
 * Set a single tier flag. Persists immediately; engine reads at next init().
 * β-3 settings modal calls this from its toggle handler.
 */
declare function setTierFlag(name: TierName, on: boolean): void;
/**
 * The canonical tier name list — exported so β-3's UI can enumerate
 * toggles without hard-coding the schema in two places.
 */
declare function listTiers(): readonly TierName[];

type HapHandler = (event: HapEvent) => void;
/**
 * Single source of truth for audio in Stave.
 * Wraps @strudel/webaudio (which wraps superdough) via webaudioRepl().
 *
 * API surface matches ARCHITECTURE.md.
 * One instance per page. Must be init()'d after a user gesture.
 */
declare class StrudelEngine implements LiveCodingEngine {
    private repl;
    private audioCtx;
    private analyserNode;
    private hapStream;
    private initialized;
    private evalResolve;
    private runtimeErrorHandler;
    private loadedSoundNames;
    private trackSchedulers;
    private vizRequests;
    private vizOptions;
    private backdropVizOptions;
    private backdropVizRequest;
    private audioController;
    private trackAnalysers;
    private trackOrbit;
    private lastEvaluatedCode;
    private lastPatternIR;
    private lastIREvents;
    private lastIRNodeLocLookup;
    private breakpointStore;
    private isPausedState;
    private pauseChangedListeners;
    private transportOffset;
    private tierFlags;
    private lastAliasResolutions;
    private soundMapRef;
    /** Read-only snapshot of the tier flags consumed at this engine's init(). */
    getTierFlagsSnapshot(): Readonly<TierFlags> | null;
    /**
     * #384 — set the transport seek offset (cycles). Does NOT re-evaluate by
     * itself: the runtime's `seekTo` calls this and then `play()`, whose
     * re-eval re-reads `transportOffset` and applies the `.late()` wrap at the
     * `.p` seam. Kept off the `LiveCodingEngine` interface (v1) and reached via
     * `(engine as any).setTransportOffset?.()` so non-Strudel engines no-op,
     * mirroring the pause/resume delegation convention.
     */
    setTransportOffset(offset: number): void;
    /** #384 — current transport offset (cycles). `0` when no seek is active. */
    getTransportOffset(): number;
    /**
     * Phase 20-14 β-2 — read-only snapshot of alias rewrites that have fired
     * during the current evaluate() window. Each entry is one hap rewrite;
     * the same `from → to` pair may appear multiple times if the rewrite
     * fired across multiple cycles.
     *
     * Lifecycle: reset to empty at `evaluate()` entry, appended to by
     * `wrappedOutput`, read by friendlyErrors at message-build time.
     */
    getLastAliasResolutions(): ReadonlyArray<{
        from: string;
        to: string;
    }>;
    init(): Promise<void>;
    evaluate(code: string): Promise<{
        error?: Error;
    }>;
    get components(): Partial<EngineComponents>;
    /**
     * Scans code for $: blocks and maps each track's viz request to the line
     * after the last line of that block. Mirrors the line-scanning logic in
     * viewZones.ts but returns structured data instead of creating DOM zones.
     */
    private buildVizRequestsWithLines;
    play(): void;
    stop(): void;
    /**
     * Phase 20-07 (DEC-AMENDED-1) — debugger pause. Calls
     * `scheduler.pause()` (NOT `.stop()`) — pause preserves cycle position
     * (cyclist.mjs:112-116), stop rewinds lastEnd to 0 (cyclist.mjs:117-122).
     * Idempotent: setPaused() guards against double-fire of listeners (T17).
     */
    pause(): void;
    /**
     * Phase 20-07 — debugger resume. Calls `scheduler.start()` which uses
     * the preserved lastEnd from pause (cyclist.mjs:101-111). Idempotent.
     */
    resume(): void;
    /** Current debugger pause state (true after a breakpoint hit). */
    getPaused(): boolean;
    /**
     * Subscribe to engine pause-state transitions. Mirrors the
     * subscriber-set pattern used by `LiveCodingRuntime.onPlayingChanged`
     * (RESEARCH Q3). Returns a disposer.
     */
    onPausedChanged(listener: (paused: boolean) => void): () => void;
    /**
     * Phase 20-07 — accessor onto the engine's BreakpointStore. The
     * runtime exposes this through its own `getBreakpointStore()` so the
     * editor's useBreakpoints hook (Wave β) and the Inspector (Wave γ)
     * share a single store.
     */
    getBreakpointStore(): BreakpointStore;
    /**
     * Internal — flip pause state and fan out to subscribers, with an
     * idempotence guard (T17): both Inspector + Monaco "Resume" surfaces
     * may fire setPaused(false) simultaneously; this short-circuits the
     * second call so listeners never see a redundant transition.
     */
    private setPaused;
    record(durationSeconds: number): Promise<Blob>;
    renderOffline(code: string, duration: number, sampleRate?: number): Promise<Blob>;
    renderStems(stems: Record<string, string>, duration: number, onProgress?: (stem: string, i: number, total: number) => void): Promise<Record<string, Blob>>;
    getAnalyser(): AnalyserNode;
    getAudioContext(): AudioContext;
    on(_event: 'hap', handler: HapHandler): void;
    off(_event: 'hap', handler: HapHandler): void;
    getHapStream(): HapStream;
    /**
     * Returns a thin PatternScheduler wrapper around the Strudel scheduler.
     * Only available after evaluate() succeeds (scheduler.pattern is set then).
     */
    getPatternScheduler(): PatternScheduler | null;
    /**
     * Returns per-track PatternSchedulers captured during the last evaluate() call.
     * Each $: block gets its own scheduler that queries its Pattern directly via queryArc.
     * Keys: anonymous "$:" → "$0", "$1"; named "d1:" → "d1".
     * Empty Map before first evaluate or after evaluate error.
     */
    getTrackSchedulers(): Map<string, PatternScheduler>;
    /**
     * Returns per-track viz requests captured during the last evaluate() call.
     * Maps track keys ("$0", "$1", "d1") to viz descriptor IDs ("pianoroll", "scope").
     * Only patterns that called .viz("name") in user code appear in this map.
     * Empty Map before first evaluate or if no patterns use .viz().
     */
    getVizRequests(): Map<string, string>;
    /** Register a handler for runtime audio errors (fires during scheduling, not evaluation). */
    setRuntimeErrorHandler(handler: (err: Error) => void): void;
    /** Returns all sound names registered after init() — useful for editor autocompletion. */
    getSoundNames(): string[];
    dispose(): void;
    /**
     * Query a pattern for its first non-silent hap within [0, lookahead) cycles
     * and return the orbit it uses. Default orbit is 1 (superdough's default).
     * Returns 1 for silent patterns — falls back to orbit 1 just like superdough.
     */
    private resolveOrbit;
    /**
     * Reconcile trackAnalysers against capturedPatterns.
     * - Creates analysers for new captureIds, tapped off their orbit's GainNode.
     * - Reuses analysers when (captureId, orbit) is unchanged.
     * - Rewires when a captureId's orbit changed (disconnect old, tap new).
     * - Removes+disconnects analysers for captureIds no longer present.
     *
     * Safe to call repeatedly. No-op if audioController isn't available yet.
     */
    private rebuildTrackAnalysers;
}

/**
 * Theme tokens applied to the WorkspaceShell root via inline CSS vars.
 *
 * Surface / text / border / accent tokens are NOT included here — they
 * come from globals.css's [data-stave-theme="dark|light"] selectors so
 * the editor chrome and the app chrome share one palette. Only
 * code-specific tokens (syntax colours, stem colours, font) live here.
 */
declare const DARK_THEME_TOKENS: Record<string, string>;
declare const LIGHT_THEME_TOKENS: Record<string, string>;
interface StrudelTheme {
    tokens: Record<string, string>;
}
declare function applyTheme(el: HTMLElement, theme: 'dark' | 'light' | StrudelTheme): void;

interface StrudelEditorProps {
    code?: string;
    defaultCode?: string;
    onChange?: (code: string) => void;
    autoPlay?: boolean;
    onPlay?: () => void;
    onStop?: () => void;
    onError?: (error: Error) => void;
    visualizer?: string;
    activeHighlight?: boolean;
    theme?: 'dark' | 'light' | StrudelTheme;
    showVizPicker?: boolean;
    vizDescriptors?: VizDescriptor[];
    height?: number | string;
    vizHeight?: number | string;
    showToolbar?: boolean;
    readOnly?: boolean;
    onExport?: (blob: Blob, stemName?: string) => Promise<string>;
    engineRef?: React__default.MutableRefObject<StrudelEngine | null>;
}
declare function StrudelEditor({ code: controlledCode, defaultCode, onChange, autoPlay, onPlay, onStop, onError, theme, height, vizHeight, showToolbar, showVizPicker, readOnly, activeHighlight, visualizer, vizDescriptors, onExport, engineRef: engineRefProp, }: StrudelEditorProps): react_jsx_runtime.JSX.Element;

interface LiveCodingEditorProps {
    engine: LiveCodingEngine;
    code?: string;
    defaultCode?: string;
    onChange?: (code: string) => void;
    autoPlay?: boolean;
    onPlay?: () => void;
    onStop?: () => void;
    onError?: (error: Error) => void;
    visualizer?: string;
    activeHighlight?: boolean;
    theme?: 'dark' | 'light' | StrudelTheme;
    showVizPicker?: boolean;
    vizDescriptors?: VizDescriptor[];
    height?: number | string;
    vizHeight?: number | string;
    showToolbar?: boolean;
    readOnly?: boolean;
    toolbarExtra?: React__default.ReactNode;
    onPostEvaluate?: (engine: LiveCodingEngine) => void;
    soundNames?: string[];
    bpm?: number;
    isExporting?: boolean;
    onExport?: () => void;
    engineRef?: React__default.MutableRefObject<LiveCodingEngine | null>;
    /** Monaco language ID (e.g. 'strudel', 'sonicpi'). Defaults to 'strudel'. */
    language?: string;
}
declare function LiveCodingEditor({ engine, code: controlledCode, defaultCode, onChange, autoPlay, onPlay, onStop, onError, theme, height, vizHeight: _vizHeight, showToolbar: _showToolbar, showVizPicker: _showVizPicker, readOnly: _readOnly, activeHighlight: _activeHighlight, visualizer: _visualizer, vizDescriptors: _vizDescriptors, toolbarExtra, onPostEvaluate, soundNames: _soundNames, bpm: bpmProp, isExporting: _isExportingProp, onExport: _onExportProp, engineRef: engineRefProp, language: _language, }: LiveCodingEditorProps): react_jsx_runtime.JSX.Element | null;

/**
 * Minimal LiveCodingEngine implementation using Web Audio directly.
 * Proves the engine protocol works for non-Strudel engines.
 *
 * Parses a simple format:
 *   note: c4 e4 g4    (space-separated note names)
 *   viz: scope         (optional inline viz request)
 *
 * Provides streaming + audio + inlineViz components. Does NOT provide queryable,
 * which validates that VizPicker correctly disables pianoroll/wordfall.
 */
declare class DemoEngine implements LiveCodingEngine {
    private audioCtx;
    private analyserNode;
    private hapStream;
    private oscillator;
    private gainNode;
    private initialized;
    private playing;
    private runtimeErrorHandler;
    private currentVizRequests;
    private schedulerInterval;
    private noteSequence;
    private noteIndex;
    private cyclePos;
    init(): Promise<void>;
    evaluate(code: string): Promise<{
        error?: Error;
    }>;
    play(): void;
    stop(): void;
    dispose(): void;
    setRuntimeErrorHandler(handler: (err: Error) => void): void;
    get components(): Partial<EngineComponents>;
    private noteToFreq;
}

/**
 * SonicPiEngine adapter — wraps the standalone sonicPiWeb engine
 * to conform to Stave's LiveCodingEngine interface.
 *
 * Responsibilities of the ADAPTER (not the engine):
 *  - SuperSonic CDN loading (bundler-proof dynamic import)
 *  - SoundEvent → HapEvent bridging (sonicPiWeb events → Stave events)
 *  - loc computation (engine provides srcLine, adapter computes char offsets)
 *  - Viz request capture (viz() injected here, not in the engine)
 *  - inlineViz component assembly (afterLine computed from code)
 *
 * The engine (sonicPiWeb) knows about music: play, sleep, sample.
 * The adapter knows about the editor: viz, components, highlighting.
 */

declare class SonicPiEngine implements LiveCodingEngine {
    private raw;
    private hapStream;
    private runtimeErrorHandler;
    private options;
    private vizRequests;
    /** Original code lines + char offsets — for computing loc from srcLine */
    private originalLines;
    private lineOffsets;
    /** Per-track HapStreams for scoped inline viz (keyed by live_loop name) */
    private trackStreams;
    constructor(options?: {
        schedAheadTime?: number;
    });
    init(): Promise<void>;
    evaluate(code: string): Promise<{
        error?: Error;
    }>;
    play(): void;
    stop(): void;
    dispose(): void;
    setRuntimeErrorHandler(handler: (err: Error) => void): void;
    get components(): Partial<EngineComponents>;
}

/**
 * NormalizedHap — backward-compatible alias for IREvent.
 *
 * All viz sketches import NormalizedHap. This re-exports from the IR module
 * so existing code keeps working. New code should import IREvent directly.
 */

/** @deprecated Use IREvent from '../ir' instead. */
type NormalizedHap = IREvent;
/**
 * Convert a raw Strudel hap into an IREvent (NormalizedHap).
 * Handles Fraction objects (Number() coercion), missing fields, and optional value bag.
 *
 * `trackId` is caller-supplied — Strudel haps don't carry it natively,
 * but per-track schedulers (`$:` blocks) know their id and pass it
 * through so downstream consumers (DAW view, transform debugger) can
 * attribute every event to a producer.
 *
 * `irNodeLocLookup` is caller-supplied — engine threads the published
 * snapshot's loc map so each hap can be enriched with its `irNodeId`
 * by structural match (PV38 clause 2). Both optional — additive widening.
 */
declare function normalizeStrudelHap(hap: any, trackId?: string, irNodeLocLookup?: ReadonlyMap<string, IREvent[]>): NormalizedHap;

/**
 * Engine-agnostic IRPattern built from a live HapStream.
 *
 * Accumulates HapEvents into a rolling buffer of IREvent[].
 * Any engine that provides streaming (HapStream) automatically gets
 * a synchronous queryable — no engine-specific code needed.
 */
declare class BufferedScheduler implements IRPattern {
    private buffer;
    private head;
    private audioCtx;
    private maxAge;
    private hapStream;
    private handler;
    /** Last event per instrument — for same-instrument overlap clipping */
    private lastByInstrument;
    constructor(hapStream: HapStream, audioCtx: AudioContext, maxAge?: number);
    now(): number;
    query(begin: number, end: number): IREvent[];
    clear(): void;
    dispose(): void;
}

/**
 * Pure TypeScript RIFF WAV encoder.
 * No dependencies — works in any browser or Node.js environment.
 * Encodes stereo Float32 PCM into a standard 16-bit WAV Blob.
 */
declare class WavEncoder {
    /**
     * Encode an AudioBuffer (e.g. from OfflineAudioContext) into a WAV Blob.
     */
    static encode(buffer: AudioBuffer): Blob;
    /**
     * Encode interleaved stereo chunks (e.g. from ScriptProcessorNode) into a WAV Blob.
     * Samples are clamped to [-1, 1] then converted to 16-bit signed integers.
     */
    static encodeChunks(chunksL: Float32Array[], chunksR: Float32Array[], sampleRate: number): Blob;
}

/**
 * Offline renderer — processes a Strudel pattern at CPU speed via OfflineAudioContext.
 * Completely isolated from the live AudioContext — safe to call while playing.
 *
 * Implementation: queries the pattern arc directly and renders each note using
 * native WebAudio oscillators. This avoids touching superdough's global context.
 *
 * LIMITATION: Only oscillator-based sounds work (sine, sawtooth, square, triangle).
 * Sample-based sounds (bd, sd, hh, etc.) are silently skipped because AudioWorklets
 * cannot be re-registered in a fresh OfflineAudioContext.
 */
declare class OfflineRenderer {
    static render(code: string, duration: number, sampleRate: number): Promise<Blob>;
}

/**
 * Real-time audio capture via ScriptProcessorNode.
 * Records exactly what the user hears — useful when live tweaks during playback
 * need to be captured rather than re-rendered.
 *
 * Note: ScriptProcessorNode is deprecated but remains the most reliable cross-browser
 * option for in-browser audio capture without MediaRecorder latency issues.
 */
declare class LiveRecorder {
    static capture(analyser: AnalyserNode, ctx: AudioContext, duration: number): Promise<Blob>;
}

/**
 * Convert a note name string or MIDI number to a MIDI note number.
 * Returns null if the input is unrecognized (e.g. percussion sample names).
 *
 * Examples: "c3" → 48, "eb4" → 63, "f#2" → 42, 60 → 60
 */
declare function noteToMidi(note: unknown): number | null;

/**
 * Adapter that wraps an existing p5 SketchFactory into the VizRenderer interface.
 * Each P5VizRenderer instance manages one p5 instance lifecycle.
 *
 * Bridges the component bag (Partial<EngineComponents>) to the individual ref
 * objects that P5SketchFactory expects. Refs are stored as instance fields so
 * update() can refresh them for live React rendering.
 *
 * `containerSizeRef` is maintained by the renderer and exposed to user
 * sketches via `stave.width` / `stave.height` (through the compiler).
 * It's initialized from the size passed to `mount()` and updated on
 * every `resize(w, h)` call, so a user's `createCanvas(stave.width,
 * stave.height)` always gets the live preview-pane dimensions — no
 * mismatches with `windowWidth` / `windowHeight` which track the
 * browser window rather than the container.
 */
declare class P5VizRenderer implements VizRenderer {
    private sketch;
    private instance;
    private hapStreamRef;
    private analyserRef;
    private schedulerRef;
    private containerSizeRef;
    private optionsRef;
    /**
     * Per-renderer named-signal bus (Phase 21). PURE (P12) — owned here, fed
     * UNCONDITIONALLY from the HapStream + scheduler (NOT analyser-gated; the bus
     * is IR-grounded and must stay live whenever a real analyser is published,
     * which is normal playback). Mirrors `HydraVizRenderer`'s bus discipline; the
     * only difference is the p5 SHAPE (D-01): bare `uKick` is a live GETTER
     * NUMBER here, not a `() => number` thunk.
     */
    private bus;
    /** Stable per-instance profiler key (`p5#N`) — frame/fps + bus timing (#228). */
    private readonly perfId;
    /**
     * The bus's HapStream `.env`-feed subscription. Kept as an instance ref so
     * `destroy()` can off it unconditionally (it is the bus's own subscription —
     * p5 has no analyser-fallback envelope, but keeping a named ref matches the
     * hydra teardown discipline and stays correct if a fallback is added later).
     */
    private busHapHandler;
    /** The HapStream the bus handler is subscribed to (for clean off()). */
    private boundHapStream;
    /**
     * The live named-signal uniform object handed to the sketch factory as the
     * 6th arg. Built ONCE in the constructor; its `uKick…` getters read the
     * stable `bus` live each access (U2 — frame-fresh through the inner
     * `with (staveUniforms)`). `update()` rebinds only the bus's scheduler refs
     * in place, so this SAME object's getters keep returning current values
     * without a re-compile.
     */
    private staveUniformsRef;
    constructor(sketch: P5SketchFactory);
    mount(container: HTMLDivElement, components: Partial<EngineComponents>, size: {
        w: number;
        h: number;
    }, onError: (e: Error) => void): void;
    update(components: Partial<EngineComponents>): void;
    resize(w: number, h: number): void;
    pause(): void;
    resume(): void;
    destroy(): void;
}

/**
 * Stave-specific bag exposed to `.hydra` sketches as the second
 * function argument. Mirrors the `stave` namespace convention
 * already used by p5 sketches (see `p5Compiler.ts`). Stays present
 * across re-evaluations — `HydraVizRenderer.update()` rebinds the
 * fields on the same object so long-lived closures inside the
 * user sketch observe live references, not stale snapshots.
 *
 * `scheduler` / `tracks` are `null` / empty when no pattern runtime
 * is publishing — sketches must optional-chain (consistent with the
 * demo-mode path in `compiledVizProvider`).
 */
interface HydraStaveBag {
    /** Combined pattern scheduler. Has `now()` and `query(begin, end)`. */
    scheduler: IRPattern | null;
    /** Per-track schedulers keyed by trackId (e.g. "$0", "drums"). */
    tracks: Map<string, IRPattern>;
    /**
     * Strudel-style pattern-to-hydra sugar. Returns a function Hydra can
     * call per frame:
     *
     *   osc(() => stave.H('drums')() * 10).out(o0)
     *
     * Equivalent Strudel idiom is `osc(H('drums')).out(o0)`. The outer
     * call picks the track; the inner call samples the track's current
     * event and reads `field` (default: `gain`). Returns `0` when no
     * event is active or the track doesn't exist — so sketches never
     * NaN a shader uniform even during silence.
     */
    H: (trackId: string, field?: keyof IREvent) => () => number;
    /**
     * The single `sig` namespace (#351). One callable carrying every Stave signal
     * as `() => number` thunks (so hydra calls them natively each frame), plus the
     * per-sound/per-track accessor and master DSP:
     *
     *   osc(() => stave.sig.kick() * 10).out(o0)        // per-drum envelope thunk
     *   osc(() => stave.sig('bd').env() * 10).out(o0)   // one sound
     *   shape(() => stave.sig('bd').fft[0] * 4).out(o0) // arrays index natively
     *   stave.sig.track('$0').color()
     *   osc(() => stave.sig.rms() * 10).out(o0)         // master scalar thunk
     *   shape(() => stave.sig.fft[2] * 6).out(o0)        // master spectrum array
     *
     * The per-drum scalars (`sig.kick`…`sig.tom`), global `sig.keyVelocity`, and
     * master DSP (`sig.rms`…`sig.treble`) are all `() => number` thunks ON `sig`.
     * `sig('bd')` / `sig.track('$0')` return per-reading thunks; `sig.fft`/`sig.wave`
     * are live arrays; `sig.tracks`/`sig.sounds` enumerate. The bus ticks ONCE per
     * rAF in `pumpAudio` (U2 — never inside a thunk); thunks are pure reads.
     */
    sig: HydraSigAccessor;
    [customAlias: string]: any;
}
/** A per-sound or per-track reading exposed as `() => value` thunks (D-01).
 *  DSP scalars (`rms`/`bass`/`mid`/`treble`) are thunks (same shape as `.env`);
 *  DSP arrays (`fft`/`wave`) are LIVE `number[]` so hydra indexes them natively
 *  (`() => u('bd').fft[i]`) — NOT thunk-of-number per element, NOT thunk-of-array. */
interface HydraSignalThunks {
    env: () => number;
    velocity: () => number;
    note: () => number | string | null;
    color: () => string | null;
    /** Time-domain RMS, 0..1 (thunk, re-reads the bus each call). */
    rms: () => number;
    /** Low-band magnitude, 0..1 (thunk). */
    bass: () => number;
    /** Mid-band magnitude, 0..1 (thunk). */
    mid: () => number;
    /** High-band magnitude, 0..1 (thunk). */
    treble: () => number;
    /** Live normalized magnitude spectrum, `number[]` (index natively). */
    fft: number[];
    /** Live time-domain waveform -1..1, `number[]` (index natively). */
    wave: number[];
}
/** The callable `u(...)` with attached `.track`/`.tracks`/`.sounds` props AND
 *  the MASTER-mix DSP feed (Slice 2): scalar thunks + live arrays. */
interface HydraSigAccessor {
    (sound: string): HydraSignalThunks;
    /** Per-track reading, keyed on the scheduler key space (`$0`/`drums`). */
    track: (id: string) => HydraSignalThunks;
    /** Enumerate published track keys (scheduler key space). */
    tracks: string[];
    /** Enumerate distinct sounds seen through the envelope feed. */
    sounds: string[];
    kick: () => number;
    snare: () => number;
    hat: () => number;
    openHat: () => number;
    clap: () => number;
    rim: () => number;
    tom: () => number;
    /** Active event velocity, global, 0..1 thunk (was `uKeyVelocity`). */
    keyVelocity: () => number;
    /** Master-mix time-domain RMS, 0..1 (thunk). */
    rms: () => number;
    /** Master-mix low-band magnitude, 0..1 (thunk). */
    bass: () => number;
    /** Master-mix mid-band magnitude, 0..1 (thunk). */
    mid: () => number;
    /** Master-mix high-band magnitude, 0..1 (thunk). */
    treble: () => number;
    /** Live master-mix magnitude spectrum, `number[]` (index natively). */
    fft: number[];
    /** Live master-mix waveform -1..1, `number[]` (index natively). */
    wave: number[];
}
type HydraPatternFn = (synth: any, stave: HydraStaveBag) => void;
/**
 * VizRenderer that uses hydra-synth for audio-reactive WebGL visuals.
 * Lazily loads hydra-synth on first mount to avoid bloating the main bundle.
 *
 * Audio source priority:
 *   1. AnalyserNode (real FFT) — always preferred when available.
 *   2. HapStream energy envelope (synthetic FFT from note events) —
 *      ONLY used as a fallback when no analyser is published. The
 *      envelope is only useful when there's no shared audio routing
 *      (e.g., a future runtime that emits hap events without exposing
 *      an analyser); in every current source — Strudel, the built-in
 *      examples, the (future) Sonic Pi runtime — an analyser is
 *      published and takes priority.
 *
 * The historical priority was (hapStream → envelope) → (analyser),
 * which broke audio reactivity for every built-in example source
 * because those sources published a HapStream that they never
 * actually emitted on. The renderer would lock onto the silent
 * envelope and ignore the working analyser, leaving s.a.fft[] at
 * all-zero forever and the shader visually unresponsive. Issue #7.
 *
 * Reads `hydraAudioBins` from the active VizConfig.
 *
 * ## Pause / loop ownership
 *
 * Hydra is constructed with `autoLoop: false` so the renderer (not
 * hydra) owns the animation loop. Our `pumpAudio` rAF callback both
 * polls the FFT data into `s.a.fft[]` AND calls `hydra.tick(time)` to
 * advance the shader by exactly one frame. This single-loop ownership
 * is what makes `pause()` actually pause:
 *   - With `autoLoop: true` (the old behavior), hydra's internal rAF
 *     keeps running independently. Setting our `paused` flag would
 *     stop FFT polling but hydra would keep rendering its last shader
 *     state, so the canvas never visibly froze. The user-visible
 *     symptom: the Stop button did nothing on hydra previews.
 *   - With `autoLoop: false`, cancelling our rAF in `pause()` halts
 *     the only path that ticks hydra. Resume re-arms the rAF and
 *     hydra picks up where it left off.
 *
 * The `hydraAutoLoop` config flag is no longer read — pause requires
 * us to own the loop. The flag is left in `vizConfig.ts` for now and
 * will be removed in a follow-up cleanup.
 */
declare class HydraVizRenderer implements VizRenderer {
    private pattern?;
    private hydra;
    private canvas;
    private analyser;
    private freqData;
    private rafId;
    private paused;
    private destroyed;
    private hapStream;
    private envelope;
    private hapHandler;
    private useEnvelope;
    /** Stable per-instance profiler key (`hydra#N`) — frame/fps + bus/draw timing (#228). */
    private readonly perfId;
    /**
     * Per-renderer named-signal bus (Phase 21). Generalizes `H()` /
     * `HapEnergyEnvelope`: per-sound `.env` (bump+decay) + per-track query
     * (`.velocity`/`.note`/`.color`). Fed UNCONDITIONALLY — NOT analyser-gated
     * like the envelope (BLOCK-1): the bus is IR-grounded and must stay live
     * whenever a real analyser is published (which is normal playback), or
     * `uKick` is dead in the headline use case.
     */
    private bus;
    /**
     * The bus's own HapStream subscription — SEPARATE from `hapHandler` (the
     * analyser-fallback envelope handler) so `destroy()` can off it
     * independently and unconditionally. The bus feed is never gated on
     * `useEnvelope`.
     */
    private busHapHandler;
    /**
     * Live `stave` bag handed to the user's sketch function. Built once
     * per mount; `update()` mutates its fields in place so sketches that
     * capture `scheduler` or `tracks` in a per-frame closure observe the
     * latest refs without needing a re-compile. This is the same
     * live-ref idiom the p5 sketch bag uses.
     *
     * `H` closes over `this.staveBag` (the object, not the current field
     * values) so each per-frame invocation reads the current scheduler
     * / tracks — survives `update()` re-assignments. No rebuild needed
     * when the pattern runtime swaps underneath.
     */
    private staveBag;
    constructor(pattern?: HydraPatternFn | undefined);
    mount(container: HTMLDivElement, components: Partial<EngineComponents>, size: {
        w: number;
        h: number;
    }, onError: (e: Error) => void): void;
    private initHydra;
    private defaultPattern;
    private pumpAudio;
    update(components: Partial<EngineComponents>): void;
    resize(w: number, h: number): void;
    pause(): void;
    resume(): void;
    destroy(): void;
}

/**
 * SignalBus — renderer-agnostic per-sound / per-track musical-signal bus.
 *
 * PURE module (P12): imports ONLY types + `noteToMidi`. NO p5 / hydra /
 * renderer import — anything that transitively imports the bus (every unit
 * test) must load in isolation. Renderers WRAP the shape (p5 getter-numbers,
 * hydra `() => number` thunks, D-01); the bus only knows numbers, maps, and
 * the alias constant.
 *
 * It generalizes two pre-existing per-renderer feeds:
 *   - `.env`  — `HapEnergyEnvelope`'s bump+decay (decay 0.92, clamp 0..1),
 *               but keyed `Map<sound, level>` on `e.s` ('bd'), NOT by MIDI bin.
 *   - instantaneous (`.velocity`/`.note`/`.color`) — `H()`'s query-at-now read
 *               (`scheduler.query(now, now + ε)`), ε = 0.001.
 *
 * ## Two key spaces (RESEARCH §5 — TRAP)
 * `track(id)` keys on the SCHEDULER key space — `trackSchedulers.get(id)` whose
 * keys are `$0`/`$1` (anonymous) or `d1`/`drums` (named). It does NOT key on
 * `IREvent.trackId` (which is `d1`/`d{N}` and DIFFERS from the scheduler key for
 * anonymous blocks). Keying on `IREvent.trackId` silently breaks anonymous-block
 * addressing.
 *
 * ## Per-field feed (RESEARCH §5 — TRAP)
 * `.env`      ← the envelope feed (`bump()` + `tick()` decay).
 * `.velocity` ← the SCHEDULER-query feed (active IREvent). `HapEvent` carries NO
 *               `velocity` — sourcing it from the envelope feed = silent ZERO.
 * `.note`     ← the scheduler-query feed (preserves the user's form, name|number).
 * `.color`    ← either feed (prefer the active IREvent; fall back to last bump).
 */

/** Minimal shape the `.env` feed consumes off a HapStream event.
 *  We deliberately type only the fields the bus reads (`s`, optional gain via
 *  `hap.value.gain`, optional color) so the bus does NOT import HapEvent and
 *  stays decoupled from the engine event class (P12 — structural typing). */
interface BusHapEvent {
    /** Instrument/sample name — the env-map key. */
    s: string | null;
    /** From `.color()` in the pattern (last-bumped fallback for `.color`). */
    color?: string | null;
    /** Full Strudel hap — gain is read from `hap?.value?.gain`. */
    hap?: any;
}
/** What an accessor returns for a single sound or track. */
interface SignalReading {
    /** Decayed envelope level 0..1 (envelope feed). */
    env: number;
    /** Active-event velocity 0..1 (scheduler feed — NOT the envelope). */
    velocity: number;
    /** Active-event note in the user's form (name|number|null — scheduler feed). */
    note: number | string | null;
    /** Display color (active event preferred, else last-bumped hap). */
    color: string | null;
    /** Time-domain RMS 0..1 from the resolved analyser. 0 if no analyser bound. */
    rms: number;
    /** Mean of the LOW third of `fft` (0..1). 0 if no analyser bound. */
    bass: number;
    /** Mean of the MID third of `fft` (0..1). 0 if no analyser bound. */
    mid: number;
    /** Mean of the HIGH third of `fft` (0..1). 0 if no analyser bound. */
    treble: number;
    /** Normalized magnitude spectrum, `FFT_BINS` buckets, each 0..1. `[]` if no
     *  analyser bound (never NaN). */
    fft: number[];
    /** Time-domain waveform normalized -1..1. `[]` if no analyser bound. */
    wave: number[];
}
/** Master/per-analyser DSP reading — the audio half of a `SignalReading`. */
interface AudioReading {
    rms: number;
    bass: number;
    mid: number;
    treble: number;
    fft: number[];
    wave: number[];
}
/** Structural shape the bus reads off a Web-Audio `AnalyserNode` (DOM type).
 *  Typed minimally so tests can feed a plain stub (P12 — structural typing,
 *  no DOM-lib dependency for the fake). */
interface BusAnalyser {
    /** Real `AnalyserNode` exposes `frequencyBinCount = fftSize / 2`. */
    frequencyBinCount: number;
    /** Fill `arr` with the current magnitude spectrum (0..255 per bin). */
    getByteFrequencyData(arr: Uint8Array): void;
    /** Fill `arr` with the current time-domain waveform (0..255, 128 = silence). */
    getByteTimeDomainData(arr: Uint8Array): void;
}
declare class SignalBus {
    /** Per-sound envelope levels (0..1), decayed each frame. Keyed on `e.s`. */
    private readonly envMap;
    /** Last-bumped color per sound — the `.color` fallback feed. */
    private readonly colorMap;
    private readonly decay;
    /** Active alias map (built-ins + any merged custom). NOT `readonly` — the
     *  renderer pushes the merged map in via `setAliases` at mount, mirroring the
     *  in-place rebind discipline of `bindScheduler`/`bindAnalysers`. The bus
     *  stays PURE (P12): it NEVER reads the editorRegistry settings surface — the
     *  renderer reads the impure settings and pushes the map down. */
    private aliasMap;
    /** Live refs — mutable so `bindScheduler()` rebinds in place
     *  (mirrors `HydraVizRenderer.update` live-ref discipline, `:369-371`). */
    private scheduler;
    private trackSchedulers;
    /** Per-frame snapshot of active events from the combined scheduler feed
     *  (set by `refreshActive`). The instantaneous feed for `sound()`. */
    private activeEvents;
    /** Per-frame snapshot of active events per track-key (scheduler key space). */
    private activeByTrack;
    /** Every distinct `e.s` ever bumped — backs `get sounds()`. */
    private readonly seenSounds;
    /** Live master analyser ref — mutable so `bindAnalysers()` rebinds in place
     *  (mirrors `bindScheduler`). Null in IR-only / demo mode. */
    private masterAnalyser;
    /** Per-track analyser refs, keyed the SAME as `trackSchedulers` (the SCHEDULER
     *  key space `$0`/`d1`, TRAP §5) — `trackAnalysers` is published with those
     *  keys by the engine (LiveCodingEngine.ts:25). */
    private trackAnalysers;
    /** Scratch byte buffers per analyser (freq + time), allocated/resized lazily
     *  keyed on analyser identity so a rebind to a new node re-allocates. */
    private readonly freqBufs;
    private readonly waveBufs;
    /** Per-frame derived DSP reading per analyser — filled by `readAudio()`,
     *  read by the accessors. Cleared each `readAudio()` so a now-unbound
     *  analyser stops reporting stale data. */
    private audioByAnalyser;
    constructor(aliasMap?: Record<string, string | string[]>);
    /** Store live scheduler refs (mutable rebind — mirror the renderer's
     *  in-place update discipline). Pass `null`/empty in demo mode. */
    bindScheduler(scheduler: IRPattern | null | undefined, trackSchedulers: Map<string, IRPattern> | null | undefined): void;
    /** Store live analyser refs (mutable rebind — mirror `bindScheduler`). The
     *  orbit is the shared reference: a sound resolves to its orbit, which has
     *  BOTH events (the scheduler feed) AND an analyser (this DSP feed). Pass
     *  `null`/empty in IR-only / demo mode → DSP fields degrade to 0/[]. */
    bindAnalysers(master?: BusAnalyser | null, trackAnalysers?: Map<string, BusAnalyser> | null): void;
    /** Replace the active alias map in place (mirror `bindScheduler`'s mutable
     *  rebind). The RENDERER builds the merged map — `{ ...ALIAS_MAP, ...custom }`
     *  with custom WINNING on collision — and pushes it here at mount. The bus
     *  stays PURE (P12): it does NOT import `getSignalAliases`; it only stores the
     *  numbers/maps it is handed. `envValue`/`resolveSounds` resolve ANY key
     *  through this map, so a freshly-set custom alias resolves with no other
     *  change. */
    setAliases(map: Record<string, string | string[]>): void;
    /** Bump the envelope for an event's sound. Mirrors `HapEnergyEnvelope.onHap`
     *  (`:67-82`): gain clamped 0..1, level = min(1, prev + gain). Keyed on
     *  `e.s` (NOT a MIDI bin). No-ops for an event with no sound name. */
    bump(e: BusHapEvent): void;
    /** Apply decay to every envelope entry. Call ONCE per frame, BEFORE
     *  `refreshActive` (mirror `HapEnergyEnvelope.tick`, `:85-89`). */
    tick(): void;
    /** Snapshot the active events at `now` from the combined scheduler and each
     *  per-track scheduler. Call ONCE per frame, AFTER `tick()`. The window is
     *  [now, now + ε) — the same tight window `H()` uses (`:175`). */
    refreshActive(now: number): void;
    /** Current scheduler time (mirror `H()`'s `sched.now()`), 0 in demo mode. */
    now(): number;
    /** Snapshot every bound analyser's spectrum + waveform for this frame. Call
     *  ONCE per frame, AFTER `refreshActive` — `audioFor()` resolves a sound to a
     *  trackKey via `activeByTrack`, which `refreshActive` populates (ordering is
     *  the T2 call-site's responsibility). Reads each analyser via
     *  `getByteFrequencyData` + `getByteTimeDomainData` (mirrors
     *  `HydraVizRenderer.pumpAudio:445-455`) and caches the derived
     *  `AudioReading`. An analyser that's no longer bound drops out of the cache. */
    readAudio(): void;
    /** Read one analyser into the per-frame cache (idempotent within a frame). */
    private readOne;
    /** Resolve a sound (or alias) → the analyser whose mix it lives in. Find the
     *  trackKey(s) in `activeByTrack` (SCHEDULER key space, TRAP §5 — NOT
     *  IREvent.trackId) whose active events include any resolved sound. EXACTLY
     *  one such track AND that track has a bound analyser → its isolated analyser.
     *  Otherwise (multi-track, none, or no per-track analyser) → the master
     *  analyser (the combined mix — still meaningful, never silent-zero-as-bug). */
    private audioFor;
    /** Cached DSP reading for an analyser (this frame), or the zero reading. */
    private audioReading;
    /** Master DSP reading (the combined-mix analyser). Surfaces `u.rms`/`u.fft`
     *  etc. — the T3 master accessor path. Zero reading if no master bound. */
    master(): AudioReading;
    /** Resolve an alias OR a raw sound name to a list of concrete sound names.
     *  `'uKick'` → `['bd']`, `'uTom'` → `['lt','mt','ht']`, `'bd'` → `['bd']`. */
    private resolveSounds;
    /** Decayed envelope level for a sound or alias. Array aliases (`uTom`)
     *  resolve as MAX over members. Demo-mode / never-fired → 0. */
    envValue(soundOrAlias: string): number;
    /** Find the first active IREvent (combined feed) whose `s` is in `sounds`. */
    private activeEventForSounds;
    /** Per-sound reading — merged across tracks via the combined active feed
     *  (D-03). `.env` from the envelope; `.velocity`/`.note` from the active
     *  IREvent (NOT the envelope — silent-zero trap §5); `.color` from the
     *  active IREvent, falling back to the last-bumped hap color. */
    sound(soundOrAlias: string): SignalReading;
    /** Last-bumped color over the resolved sounds (the `.color` fallback feed). */
    private colorFallback;
    /** Per-track reading, keyed on the SCHEDULER key space (TRAP §5 —
     *  `trackSchedulers.get(id)`, NOT IREvent.trackId). `.env` is the max env over
     *  the sounds this track fired this frame; `.velocity`/`.note`/`.color` come
     *  from the track's first active IREvent (scheduler feed). A `sound(s)`
     *  sub-accessor reads a specific sound within the track. Unknown id → zeros. */
    track(id: string): SignalReading & {
        sound: (s: string) => SignalReading;
    };
    /** Enumerate the published track keys — the SCHEDULER key space
     *  (`trackSchedulers.keys()`, §5), e.g. `['$0','$1']` or `['d1','drums']`. */
    get tracks(): string[];
    /** Enumerate distinct sounds ever bumped through the envelope feed. */
    get sounds(): string[];
    /** Normalize a note to a MIDI number (P93 — only when a NUMBER is explicitly
     *  requested; the raw `.note` preserves the user's name|number form). Returns
     *  null for percussion sample names / unrecognized input. */
    noteToMidi(note: number | string | null): number | null;
}

/**
 * SignalFrame — the serializable per-frame snapshot that crosses main → worker
 * so a worker-side `SignalBus` produces the same readings as the main-side bus
 * (Phase B / B-2, epic #228).
 *
 * The pure `SignalBus` (PV65/P12) ports into the worker unchanged, but its FEED
 * is main-thread-bound: `AnalyserNode` bytes (Web Audio), `scheduler.now()` /
 * `query()` (IRPattern closures), the hap stream. Each frame the MAIN thread
 * samples those into a `SignalFrame`; the worker reconstructs the bus's inputs
 * from it. This module owns ONLY the data shape + (de)serialization helpers —
 * pure, no DOM/worker, plain-object unit tests.
 *
 * What the bus actually reads (so we ship exactly that, no more):
 *   - analysers → `frequencyBinCount` + the freq/time byte arrays (deriveAudio
 *     runs in the WORKER on these bytes, keeping the DSP off main).
 *   - scheduler → `now()` + the active `IREvent`s for [now, now+ε) (combined and
 *     per-track, keyed in the SCHEDULER key space — SignalBus TRAP §5).
 *   - bump feed → per hap: `s`, `color`, `gain` (drives the envelope).
 *
 * Active events are summarised to the four fields the bus reads off an active
 * `IREvent` (`s`/`velocity`/`note`/`color` — SignalBus.sound/track), NOT the full
 * IREvent. That keeps the frame small and the transport string-set bounded.
 */
/** The fields the bus reads off an active scheduler event (see SignalBus). */
interface ActiveEventSummary {
    /** Instrument/sample name — env-map + audioFor key. */
    s: string | null;
    /** Active-event velocity 0..1 (scheduler feed). */
    velocity: number;
    /** Note in the user's form (name|number|null). */
    note: number | string | null;
    /** Display color. */
    color: string | null;
}
/** A hap replayed into the worker bus's envelope feed (`SignalBus.bump`). */
interface BumpSummary {
    /** Env-map key (`BusHapEvent.s`). */
    s: string | null;
    /** `.color()` value, if any. */
    color: string | null;
    /** Gain 0..1 — the bus reads it from `hap.value.gain` (default 1). */
    gain: number;
}
/** One analyser's raw bytes for this frame (the worker runs `deriveAudio`). */
interface AnalyserBytes {
    /** Bus/scheduler key: `'master'` for the combined mix, else the SCHEDULER key
     *  space track key (`'$0'`/`'d1'` — TRAP §5), matching `trackAnalysers`. */
    key: string;
    /** `AnalyserNode.frequencyBinCount` (= fftSize/2). */
    frequencyBinCount: number;
    /** Magnitude spectrum, one byte per bin (0..255). length === frequencyBinCount. */
    freq: Uint8Array;
    /**
     * Time-domain waveform, one byte per sample (0..255, 128 = silence).
     * B-3: length === `fftSize` (the FULL time-domain), not `frequencyBinCount` —
     * the bus only reads the first `frequencyBinCount` samples (so parity is
     * unchanged), but a raw `stave.analyser` sketch (e.g. synthterrain) calls
     * `getFloatTimeDomainData(new Float32Array(fftSize))` and needs all `fftSize`.
     * Falls back to `frequencyBinCount` length for callers that don't set fftSize.
     */
    time: Uint8Array;
    /**
     * `AnalyserNode.fftSize` (= 2 × frequencyBinCount). B-3 — lets the worker's
     * raw `stave.analyser` shim report the same `fftSize` a sketch reads. Optional
     * (additive): the bus ignores it; absent → `frequencyBinCount × 2`.
     */
    fftSize?: number;
    /** `AnalyserNode.minDecibels` (default -100). B-3 — lets the raw shim
     *  reconstruct `getFloatFrequencyData` (dB) from the magnitude bytes. */
    minDecibels?: number;
    /** `AnalyserNode.maxDecibels` (default -30). See {@link AnalyserBytes.minDecibels}. */
    maxDecibels?: number;
}
/**
 * One scheduler event marshalled for a RAW `stave.scheduler.query()` consumer
 * (B-3). The signal BUS reads only the four `ActiveEventSummary` fields, but a
 * raw sketch (synthterrain, scope, pianoroll…) reads the full hap shape over an
 * arbitrary window. We ship the top-level `IREvent` fields the built-in sketches
 * actually read — NOT `loc`/`irNodeId`/`dollarPos` (heavy, viz-irrelevant). The
 * worker scheduler shim hands these back as plain objects, so a sketch reads
 * `h.begin`/`h.note`/`h.gain` exactly as on main.
 */
interface RawHapSummary {
    begin: number;
    end: number;
    endClipped: number;
    note: number | string | null;
    freq: number | null;
    s: string | null;
    gain: number;
    velocity: number;
    color: string | null;
}
/**
 * The raw COMBINED-scheduler feed for `stave.scheduler` (B-3). The main sampler
 * queries one WIDE window each frame (covering every built-in sketch's window —
 * scope needs `now-4`, pianoroll/wordfall need `now+2`); the worker shim's
 * `query(a,b)` filters these events to the requested sub-window. Only the
 * combined scheduler is shipped (per-track raw query is not a built-in need).
 */
interface RawSchedulerFrame {
    /** `scheduler.now()` at sample (same value as `SignalFrame.now`). */
    now: number;
    /** Events in the shipped wide window, in query order. */
    events: RawHapSummary[];
}
/** The master analyser key — the combined-mix analyser (`SignalBus.master()`). */
declare const MASTER_KEY = "master";
/**
 * One frame of signal state, fully serializable (structured-clone / transferable).
 * The Uint8Arrays are the transferable payload; everything else is small JSON.
 */
interface SignalFrame {
    /** Monotonic frame counter — lets the worker drop a stale/duplicate frame. */
    seq: number;
    /** Scheduler time at sample (`SignalBus.now()` source). */
    now: number;
    /** Per-analyser bytes. `key === MASTER_KEY` is the master; others are tracks. */
    analysers: AnalyserBytes[];
    /** Combined active events for [now, now+ε) (`SignalBus.refreshActive`). */
    activeEvents: ActiveEventSummary[];
    /** Active events per track key (SCHEDULER key space — TRAP §5). */
    activeByTrack: Array<[string, ActiveEventSummary[]]>;
    /** Haps fired since the previous frame, in order (envelope `bump` feed). */
    bumps: BumpSummary[];
    /**
     * Wide-window combined-scheduler feed for raw `stave.scheduler` sketches (B-3).
     * Optional + additive: absent in B-2 frames and ignored by the signal bus
     * (which uses `activeEvents`/`activeByTrack`). The worker scheduler shim reads
     * it; absent → the shim returns no events.
     */
    rawScheduler?: RawSchedulerFrame;
}
/** Collect the transferable `ArrayBuffer`s in a frame (for postMessage transfer
 *  list). Returns the underlying buffers of every analyser byte array — passing
 *  these as transfer makes the postMessage zero-copy (no structured clone of the
 *  bytes). The frame is unusable on the sender after transfer (by design). */
declare function frameTransferables(frame: SignalFrame): ArrayBuffer[];
/** An empty frame — the worker's degraded state before the first real frame, and
 *  the main sampler's value when no analyser/scheduler/haps are bound (demo /
 *  IR-only mode). Mirrors the bus degrading absent inputs to 0/[] (never NaN). */
declare function emptyFrame(seq?: number): SignalFrame;

/**
 * FrameSampleCache — the per-rAF-tick memo that makes the shared frame pump a win
 * (PV72, #302). It collapses the work that N worker viz duplicate every frame when
 * they read the SAME live input object:
 *
 *   - ANALYSER READS — the expensive `getByteFrequencyData` (an FFT magnitude
 *     recompute + dB + byte quantize, O(fftSize)) on a SHARED master analyser runs
 *     ONCE per tick; each consumer gets its own TRANSFER-SAFE copy (a cheap slice),
 *     because `frameTransferables` detaches the buffer on postMessage (a single read
 *     could only be transferred to one worker). 1 FFT + k slices ≪ k FFTs.
 *   - SCHEDULER QUERIES — a `query(a,b)` over the SAME (scheduler, window) runs ONCE;
 *     the result is shared BY REFERENCE across consumers (each `.map`s it read-only,
 *     and postMessage structured-clones it per worker), so there is no per-consumer
 *     cost beyond the one query. Distinct schedulers (per-track binding,
 *     viewZones.ts:341) key separately → no false sharing.
 *
 * Constructed fresh by `vizFramePump` each tick and discarded after the tick — so it
 * can never serve a stale read across frames. Keyed by INPUT-OBJECT IDENTITY (not a
 * string key): two viz sharing the master analyser object hit the cache; two viz on
 * different track analysers don't (their data genuinely differs).
 *
 * Generic over the read/query implementations (injected by the caller) so this module
 * imports no sampler internals and stays DOM-free / plain-object testable.
 *
 * REF: PV72, signalSampler.ts (the injector), signalFrame.ts:frameTransferables (why
 *      copies are needed), viewZones.ts:341 (per-track binding → identity keys), #302.
 */

declare class FrameSampleCache {
    /** Raw read per analyser object (key-independent bytes). `null` = a zero-bin
     *  analyser already attempted (so we don't re-attempt). `.has()` distinguishes
     *  "not read yet" from "read → null". The stored arrays are NEVER transferred —
     *  only the per-call slices are — so they stay intact for the whole tick. */
    private readonly analyserReads;
    /** Query results per (scheduler object → `"a:b"` window). Shared by reference. */
    private readonly queries;
    /**
     * Read `an` at most once this tick; return a TRANSFER-SAFE copy stamped with
     * `key`. The first caller for a given analyser runs `read` (the FFT); later
     * callers (a shared master, or the same node read under both `'master'` and its
     * track key) get a fresh-buffer slice of the cached bytes — no second FFT.
     */
    readAnalyser(key: string, an: BusAnalyser, read: (a: BusAnalyser) => AnalyserBytes | null): AnalyserBytes | null;
    /**
     * Run `scheduler.query(a, b)` at most once this tick per (scheduler, window).
     * Returns the SHARED result array (callers must treat it read-only — they
     * `.map`/summarise it into their own frame). `run` is the actual query closure.
     */
    query<T>(scheduler: IRPattern, a: number, b: number, run: () => T[]): T[];
}

/**
 * vizFramePump — the single rAF clock + shared sampler for ALL worker viz (PV72,
 * #302). The MAIN-THREAD-side partner to `vizGovernor`: the governor coordinates the
 * TOTAL GPU frame budget (the GPU-bound heavy-viz case, P122); this pump collapses the
 * duplicated MAIN-THREAD per-frame SAMPLE work (the many-LIGHT-viz case).
 *
 * ── Why this exists ──
 * Before this, each `WorkerVizRenderer` ran its OWN `requestAnimationFrame` loop and
 * its OWN `MainSignalSampler.sample()`. With N worker viz the per-frame analyser
 * reads + scheduler queries ran N times — B-4 (#249) measured `viz.worker.sample`
 * ≈0.33ms per call, FLAT in N → the duplicated read is the only per-viz main cost
 * that scales. The frame is NOT shareable wholesale (the analyser buffers are
 * transfer-detached, and inline zones bind PER-TRACK so the scheduler/bumps/seq are
 * genuinely per-viz, viewZones.ts:341). So the pump shares the EXPENSIVE READ, not the
 * frame: one rAF, one `FrameSampleCache` per tick that dedups analyser reads +
 * shared-scheduler queries by input-object identity. Each renderer still builds its
 * OWN frame (own sampler/bumps/seq → byte-identical reactivity, PV75).
 *
 * ── What it owns ──
 *   - ONE `requestAnimationFrame` loop, alive only while ≥1 renderer is registered.
 *   - ONE `vizGovernor.observeFrame(ts)` per tick (was per-renderer; idempotent per
 *     ts, so this is equivalent — and now there's exactly one caller).
 *   - A fresh `FrameSampleCache` per tick, passed to every registered renderer.
 *
 * Each registered renderer (`PumpDriven`) keeps ALL its existing per-viz gates
 * (#261 backpressure, maxFps cap, `governor.mayProduce`, resolution lever, paused) —
 * the pump just calls `pumpTick(ts, cache)` instead of the renderer self-scheduling.
 * Registration is on the renderer's start (mount/resume); unregister on stop
 * (pause/destroy) — mirrors `vizGovernor.register`/`unregister` exactly so the two
 * stay in lockstep.
 *
 * The main-thread `P5VizRenderer` / `HydraVizRenderer` / `GLSLVizRenderer` fallback
 * paths are NOT driven here — they keep their own draw loops; only worker renderers
 * (whose sample work is the duplicated cost) join the pump.
 *
 * REF: PV72, vizGovernor.ts (the sibling cadence owner + observeFrame), PV80/#261
 *      (the per-viz backpressure this preserves), PK22 (1:1 cadence), frameSampleCache.ts,
 *      WorkerVizRenderer.pumpTick (the gate sequence), #302.
 */

/** A renderer the pump drives once per rAF tick. Implemented by `WorkerVizRenderer`. */
interface PumpDriven {
    /** Stable id for the registry (the renderer's `perfId`). */
    readonly perfId: string;
    /** Run this renderer's per-frame produce gates + sample(cache)+writeFrame. Called
     *  once per tick while registered. `cache` is the shared per-tick sampler memo
     *  (PV72) — `undefined` when the shared cache is disabled (A/B / escape hatch), in
     *  which case the renderer samples without dedup (every read runs locally). MUST
     *  NOT throw (the pump drives every renderer; one throw would skip the rest) — the
     *  renderer guards its own body. */
    pumpTick(ts: number, cache: FrameSampleCache | undefined): void;
}

/**
 * WorkerVizRenderer — a `VizRenderer` that runs the p5 sketch in an
 * OffscreenCanvas Web Worker, off the main thread (Phase B / B-3, epic #228).
 *
 * It is the MAIN-side counterpart to `hostP5Worker`:
 *   - `mount`   — create a `<canvas>`, `transferControlToOffscreen()`, spawn a
 *     worker (via the app-injected factory), post a `mount` with the sketch CODE
 *     STRING + transferred canvas, and start ONE main `requestAnimationFrame`
 *     loop that `sample()`s the live signal feed + `writeFrame()`s it to the
 *     worker. That rAF is the single clock — the worker draws exactly one frame
 *     per `writeFrame` (1:1 → cadence can't drift; PK22).
 *   - `update`  — rebind the sampler's live inputs (re-evaluate swaps analysers /
 *     scheduler / hap stream), mirroring P5VizRenderer.update.
 *   - `resize`  — forward the new size + DPR to the worker.
 *   - `pause`/`resume` — stop/start the sampling loop + tell the worker.
 *   - `destroy` — stop the loop, tell the worker to tear down, terminate it.
 *
 * The ONLY per-frame main-thread cost is `sample()` (read analyser bytes + ONE
 * wide scheduler query + now) + a transferable `postMessage` — the heavy
 * `draw()` is gone from main. That residual is what the matrix measures (PLAN §8).
 *
 * Falls back is NOT handled here: `makeRenderer` only constructs a
 * WorkerVizRenderer when a worker factory is registered AND the transport is
 * worker-capable; otherwise it builds a `P5VizRenderer`. If the factory is
 * somehow absent at mount, `mount` reports via `onError` so the host can recover.
 *
 * REF: hostP5Worker.ts, signalSampler.ts, signalTransport.ts, vizWorkerFactory.ts,
 *      P5VizRenderer.ts (the lifecycle + alias contract mirrored here), PK22.
 */

declare class WorkerVizRenderer implements VizRenderer, PumpDriven {
    private readonly kind;
    private readonly code;
    private readonly name;
    private worker;
    private writer;
    private readonly sampler;
    private running;
    /** Frames written but not yet acked by the worker (#261 backpressure). The
     *  sampler skips producing while this is at the cap so a slow worker can't be
     *  flooded into a stale backlog. Reset to 0 on (re)start so a resume can't be
     *  wedged by acks owed for frames written before a pause. */
    private inFlight;
    /** rAF timestamp of the last produced frame — the `vizConfig.maxFps` cap clock
     *  (#261). Reset on (re)start. */
    private lastProduceTs;
    /** Governor render-resolution scale currently applied to the backing store
     *  (lever 3, P122/PV91). 1 = full (the no-op common case). The tick re-posts a
     *  scaled `resize` only when `vizGovernor.resolutionScale()` crosses a quantized
     *  step, so the (relatively expensive) backing-store realloc fires rarely. */
    private govResScale;
    private size;
    private onError;
    /** Stable id — the `vizGovernor` round-robin key AND the `vizFramePump` registry
     *  key (public for the `PumpDriven` contract). */
    readonly perfId: string;
    private diagHandler;
    /** The presenting <canvas> this renderer appended (transferred to the worker).
     *  Tracked so destroy() removes it — else a fallback to the main-thread renderer
     *  would leave a dead, frozen canvas behind it (#247). */
    private canvasEl;
    /** Fired ONCE when the worker posts its first-frame `ready` (#247). The
     *  `FallbackVizRenderer` sets this to learn the worker is healthy. */
    private onReady;
    /** Unsubscribe from vizConfig changes — re-marshals the worker subset on a
     *  quality/LOD change (#269). Cleared in destroy() so a torn-down renderer
     *  doesn't post to a terminated worker. */
    private configUnsub;
    /** Whether this renderer drew its worker from the reuse POOL (#263 A). Decided
     *  at mount; on destroy a pooled worker is PARKED (kept warm) instead of
     *  terminated, so the next mount reuses the thread (no fresh allocation). */
    private pooled;
    /** Set once the worker reports its first `ready` frame. Only a HEALTHY worker
     *  is returned to the pool on destroy — a never-ready (broken/fallback) worker
     *  is terminated so it can't poison a future acquire. */
    private ready;
    /** Set when the worker reports it created a WebGL context (`glctx+`, #266) — so
     *  destroy() can decrement the `viz.glctx` gauge reliably (the worker's release
     *  happens after we've detached its listener, so we account it main-side). */
    private glAccounted;
    /** @param kind renderer kind (`'p5'` B-3 / `'hydra'` B-5 / `'glsl'` #281).
     *  @param code raw sketch source. @param name workspace path (error attribution). */
    constructor(kind: 'p5' | 'hydra' | 'glsl', code: string, name: string);
    /** Register a callback fired once when the worker reports its first successful
     *  frame (`ready`). Used by `FallbackVizRenderer` to end the startup probation;
     *  must be set BEFORE `mount`. */
    whenReady(cb: () => void): void;
    mount(container: HTMLDivElement, components: Partial<EngineComponents>, size: {
        w: number;
        h: number;
    }, onError: (e: Error) => void): void;
    update(components: Partial<EngineComponents>): void;
    resize(w: number, h: number): void;
    /** Post a `resize` sizing the worker backing store to the CSS size scaled by the
     *  governor's render-resolution lever (P122/PV91). At scale 1 (disabled/smooth)
     *  this is byte-identical to posting the raw CSS size — transparent. Under stress
     *  it shrinks the backing store (smaller buffer, CSS size unchanged → stretched to
     *  fill, aspect-preserved PV76); ¼ the fragment work at scale 0.5. We scale `w,h`,
     *  NOT `dpr`, because the GLSL + hydra worker `resizeKind` IGNORE dpr (size to CSS
     *  px directly) — and those are exactly the heavy GPU-bound kinds this targets. */
    private postBackingSize;
    pause(): void;
    resume(): void;
    destroy(): void;
    /** Bind the sampler's live inputs from the component bag (mirror P5VizRenderer:
     *  scheduler + per-track schedulers, master + per-track analysers, hap stream). */
    private bindSampler;
    /** Join the shared frame pump — the SINGLE rAF + shared sampler now drives this
     *  renderer's per-frame produce via `pumpTick` (PV72), instead of each renderer
     *  owning its own rAF. Still registers with the governor for the GPU-budget pool. */
    private start;
    /**
     * One produce step, called by `vizFramePump` once per rAF tick while registered
     * (PumpDriven). This is the EXACT gate sequence the old per-renderer rAF ran —
     * resolution lever → #261 backpressure → maxFps cap → governor concurrency gate
     * → sample+write — moved verbatim, with two differences: the pump owns the rAF
     * (no self-reschedule) and calls `vizGovernor.observeFrame` once for all viz (it
     * was idempotent per ts, so equivalent); and `sample(cache)` routes the analyser
     * read + scheduler query through the SHARED per-tick cache, so N viz on the same
     * input collapse N reads → 1 (the PV72 win). The frame is still per-viz (own
     * sampler/bumps/seq) → byte-identical reactivity (PV75). Guarded so a throw can't
     * stall the pump's other renderers (PumpDriven contract).
     */
    pumpTick(ts: number, cache: FrameSampleCache | undefined): void;
    private stop;
}

/**
 * Viz-worker factory DI seam (Phase B / B-3).
 *
 * The worker MUST be constructed where the bundler can statically see
 * `new Worker(new URL('./viz-worker.ts', import.meta.url))` — that's the APP
 * (Next/Turbopack), not this tsup-built package. So the editor stays
 * bundler-agnostic: the app registers a factory at startup, and
 * `WorkerVizRenderer` reads it here. When no factory is registered (e.g. a host
 * that hasn't wired the worker, or the flag is off), `makeRenderer` falls back to
 * the main-thread `P5VizRenderer`.
 *
 * REF: PHASE-B-PLAN §4 (transport/bundling), vizCompiler.makeRenderer.
 */
/** Constructs a fresh viz worker. The app provides
 *  `() => new Worker(new URL('./viz-worker.ts', import.meta.url), { type: 'module' })`. */
type VizWorkerFactory = () => Worker;
/** Register (or clear with `null`) the app's worker constructor. Idempotent. */
declare function setVizWorkerFactory(f: VizWorkerFactory | null): void;
/** The registered factory, or `null` if the host hasn't wired worker rendering. */
declare function getVizWorkerFactory(): VizWorkerFactory | null;

/**
 * vizFlags — the SINGLE SOURCE OF TRUTH for the `stave.viz.*` localStorage knobs.
 *
 * These are developer / rollback flags (NOT user settings): each one A/B-toggles a
 * worker-viz perf lever from the browser console without a code change, e.g.
 * `localStorage.setItem('stave.viz.p5direct', '0')` then re-evaluate. They were
 * previously read with bare inline `localStorage.getItem(...)` calls spread across 5
 * sites in 2 packages, each re-implementing its own try/catch + default/parse logic
 * with subtle variance (#327). This module centralises the keys + the parse semantics
 * so there is ONE place to look them up and ONE definition of each default.
 *
 * THREE flag shapes:
 *   - default-ON  → enabled unless the value is exactly '0'  (p5direct, governor, pump)
 *   - opt-IN      → enabled only when the value is exactly '1' (pool)
 *   - tri-state / numeric → '1'|'0'→bool|null, or a finite positive number  (worker,
 *     maxFps, maxDpr — read app-side, applied as vizConfig overrides)
 *
 * Every reader is try/catch-safe (private mode / no-DOM → the documented default).
 *
 * INVENTORY of all `stave.viz.*` keys (this module owns reading them):
 *   stave.viz.worker    tri   force the OffscreenCanvas-worker renderer on('1')/off('0')
 *   stave.viz.p5direct  dON   p5 renders direct into the display canvas (#325 Tier A)
 *   stave.viz.pool      optIn warm worker-pool reuse (#263)
 *   stave.viz.governor  dON   adaptive-perf governor (also the "Adaptive performance" UI)
 *   stave.viz.pump      dON   per-tick shared sampler cache (PV72 dedup)
 *   stave.viz.maxFps    num   frames/sec cap override (e.g. '60'/'30')
 *   stave.viz.maxDpr    num   presenting/render dpr cap override (e.g. '1'/'1.5')
 *
 * NON-viz `stave.*` keys are intentionally NOT here — they belong to their own domains
 * and are single-site, not duplicated: `stave.debugger.*`, `stave.file.*`, `stave.play`,
 * `stave.stop`, `stave.strudel.tier.*`, `stave.u.*`, `stave.uClap`.
 */
/** The canonical key strings — the inventory consumers import instead of literals. */
declare const VIZ_FLAG_KEYS: {
    readonly worker: "stave.viz.worker";
    readonly p5direct: "stave.viz.p5direct";
    readonly pool: "stave.viz.pool";
    readonly governor: "stave.viz.governor";
    readonly pump: "stave.viz.pump";
    readonly maxFps: "stave.viz.maxFps";
    readonly maxDpr: "stave.viz.maxDpr";
};
/** #325 Tier A — p5 renders direct into the transferred display canvas. DEFAULT ON;
 *  `stave.viz.p5direct='0'` forces the old blit path. */
declare function isP5DirectCanvasEnabled(): boolean;
/** Adaptive-perf governor (PV91). DEFAULT ON; `stave.viz.governor='0'` disables. */
declare function isVizGovernorEnabled(): boolean;
/** Per-tick shared sampler cache (PV72 dedup). DEFAULT ON; `stave.viz.pump='0'` runs
 *  the pump WITHOUT the shared cache (every viz samples per-viz). */
declare function isVizPumpSharedCacheEnabled(): boolean;
/** Warm worker-pool reuse (#263). OPT-IN while validated; `stave.viz.pool='1'` enables. */
declare function isVizWorkerPoolEnabled(): boolean;
/** Force the worker renderer on('1')/off('0'); null = no override (keep the
 *  `vizConfig.workerRenderer` default). Read app-side in `registerVizWorker`. */
declare function getVizWorkerOverride(): boolean | null;
/** frames/sec cap override (#261), or null for the config default. */
declare function getVizMaxFpsOverride(): number | null;
/** presenting/render dpr cap override (#261), or null for the config default. */
declare function getVizMaxDprOverride(): number | null;

/**
 * Hydra shader presets for audio-reactive visualization — `HydraPatternFn`
 * closures (the public `@stave/editor` API; re-exported from index.ts).
 *
 * These are now DERIVED from the canonical code STRINGS in `builtinHydraCode.ts`
 * (B-5 #252): the strings are the single source of truth so the built-in hydra
 * descriptors can compile in a worker (a closure can't cross to one). Deriving
 * the closures from the same strings keeps the public API AND avoids the
 * picker-vs-source divergence the p5 path hit (PV56/#184). `compileHydraCode`
 * returns a `HydraPatternFn` that runs the string via `new Function('s','stave')`
 * — `s` = the hydra synth, `s.a.fft[0..3]` = the master audio bins.
 */
/** Scrolling frequency bands — hydra's take on a pianoroll. */
declare const hydraPianoroll: HydraPatternFn;
/** Audio-reactive oscilloscope — smooth waveform with frequency modulation. */
declare const hydraScope: HydraPatternFn;
/** Kaleidoscope — mirrored fractal patterns driven by audio energy. */
declare const hydraKaleidoscope: HydraPatternFn;

/**
 * All built-in visualization modes.
 *
 * IDs follow the "mode:renderer" convention when multiple renderers offer
 * the same concept. Bare "mode" is the default renderer for that concept.
 *
 * The 7 p5 entries compile their factories from the bundled source code
 * strings — the SAME strings the workspace `preset/viz/*.p5` files carry.
 * Previously the picker mounted 7 hand-written TypeScript sketch classes
 * that had diverged from the preset code; per #184 (PV56) the picker and
 * the preset file share one code path.
 *
 * Each factory creates a NEW renderer instance per mount — never share
 * a single instance across multiple mounts.
 *
 * Consumers extend via spread:
 *   vizDescriptors={[...DEFAULT_VIZ_DESCRIPTORS, myCustomDescriptor]}
 */
declare const DEFAULT_VIZ_DESCRIPTORS: VizDescriptor[];

/**
 * Resolves a viz ID to a VizDescriptor using the "mode:renderer" convention.
 *
 * Resolution order:
 *   1. User-named viz registry — exact name match first, then a
 *      NORMALIZED match (case/space/hyphen/underscore insensitive) in the
 *      runtime `namedVizRegistry` (populated by saved viz presets). User
 *      intent wins over built-ins, so a user-saved preset named
 *      `"pianoroll"` shadows the built-in `"pianoroll:hydra"`. The
 *      normalized hop is what lets inline `.viz("pianoroll")` reach the
 *      bundled `"Piano Roll"` preset — the SAME preset the `.pianoroll()`
 *      backdrop renders — instead of falling through to the built-in
 *      sketch (P73 / PV56).
 *   2. Exact match on `descriptor.id`
 *      e.g. "pianoroll:hydra" → "pianoroll:hydra"
 *   3. Default renderer — append `":${defaultRenderer}"` from config and retry
 *      e.g. "pianoroll" + defaultRenderer="hydra" → "pianoroll:hydra"
 *   4. Prefix fallback — bare mode matches first descriptor whose id starts
 *      with `vizId + ":"` (catches renderer variants not matching the default)
 *
 * Returns undefined if no match is found.
 */
declare function resolveDescriptor(vizId: string, descriptors: VizDescriptor[]): VizDescriptor | undefined;

/**
 * groupLayout — pure functions for the 2D workspace group layout.
 *
 * The workspace shell arranges editor/preview groups into a two-level
 * grid: an outer horizontal row of **columns**, and each column is a
 * vertical stack of **cells** (groups). This shape gives the user four
 * drop targets per group (N/S/E/W) while staying simple enough to
 * render as a top-level horizontal `SplitPane` whose children are
 * either a leaf group or a nested vertical `SplitPane`.
 *
 * @remarks
 * ## Why a 2-level grid and not a full tree
 *
 * VS Code's layout engine is a full recursive tree — each node can be
 * a horizontal split OR vertical split OR leaf, nested arbitrarily
 * deep. That supports layouts like "split left, then split the left
 * column vertically, then split the top of that horizontally again."
 *
 * For Phase 10.2 we need N/S/E/W drops from any group but not the
 * arbitrary nesting. The 2-level model (columns of cells) covers the
 * common case:
 *
 *     ┌──────┬──────┬──────┐
 *     │      │  B   │      │
 *     │  A   ├──────┤  D   │
 *     │      │  C   │      │
 *     └──────┴──────┴──────┘
 *
 * Column 0 = [A], column 1 = [B, C], column 2 = [D].
 *
 * If a future phase needs recursive nesting, this module's external
 * API (insertGroup, removeGroup, findGroupCoords) stays mostly the
 * same — only the internal representation changes.
 *
 * ## Why pure functions in a separate module
 *
 * The shell's React reducer is already crowded with state updaters.
 * Keeping the layout arithmetic pure and module-level:
 *
 *   1. Lets tests exercise every transition without a React harness.
 *   2. Avoids stale-closure bugs inside setState callbacks — every
 *      function takes the full layout and returns a new one.
 *   3. Makes the invariant "no group id appears twice in the layout"
 *      checkable in one place.
 *
 * Every function returns a NEW array (never mutates input). The shell
 * passes the result straight to `setLayout`.
 */
/**
 * One column is a vertical stack of group ids. `[g1]` is a column with
 * one cell; `[g1, g2]` stacks g1 on top of g2. Empty columns are not
 * allowed — `removeGroup` collapses them away.
 */
type LayoutColumn = readonly string[];
/**
 * The shell's full 2-D layout: an ordered list of columns arranged
 * left-to-right at the horizontal level. An empty root layout (`[]`)
 * means "no groups at all" and the shell renders a drop-target
 * placeholder.
 */
type GroupLayout = readonly LayoutColumn[];

/**
 * Reload policy per CONTEXT D-07. Encoded as a string literal rather than
 * a boolean so the three states stay distinguishable at call sites:
 *
 *   - `'debounced'` — the common case for compile-heavy providers.
 *   - `'instant'` — for cheap previews (e.g., markdown HTML rendering).
 *   - `'manual'` — for providers that own their own trigger (e.g., a
 *     user-driven "Run" button inside the rendered output).
 *
 * Adding a new mode requires updating `PreviewView`'s reload dispatch
 * switch. The exhaustiveness check there (a `never`-typed default case)
 * catches missing branches at compile time.
 */
type PreviewReloadPolicy = 'debounced' | 'instant' | 'manual';
/**
 * The runtime context handed to `PreviewProvider.render()` on every
 * reload. Fields are reactive — they represent a snapshot of the preview
 * state at the moment `render` was called. The provider's returned React
 * tree may hold onto `ctx` in a closure, but subsequent renders will
 * receive fresh `ctx` objects; providers that care about "the latest"
 * should read from the newest render's ctx, not cache the original.
 */
interface PreviewContext {
    /**
     * The workspace file being previewed. Reactive via `useWorkspaceFile`
     * inside `PreviewView`. On every reload triggered by content change,
     * this field holds the newest content.
     */
    readonly file: WorkspaceFile;
    /**
     * The current bus payload for the tab's `sourceRef`, or `null` if no
     * publisher matches. Providers MUST handle the `null` case with demo-mode
     * fallback content (CONTEXT P7). `PreviewView` deliberately passes `null`
     * through rather than substituting a placeholder, so the provider can
     * render something meaningful even in the "no audio source" state.
     */
    readonly audioSource: AudioPayload | null;
    /**
     * `true` when the tab is hidden AND the provider opted out of background
     * rendering (`keepRunningWhenHidden === false`). Providers that receive
     * `hidden: true` should stop rendering expensive frames (e.g., pause
     * their RAF loop) but stay mounted — `PreviewView` will trigger one
     * catch-up reload when the tab becomes visible again.
     */
    readonly hidden: boolean;
    /**
     * `true` when the user has explicitly paused this preview via the
     * chrome's Stop button. Unlike `hidden` (which tracks visibility),
     * `paused` is a user-initiated command — the preview tab is still
     * visible, but the provider should halt its animation loop so the
     * canvas freezes on the current frame. Providers handle this by
     * calling `renderer.pause()` (which, for p5, maps to
     * `p5.noLoop()`) when `paused` goes `true` and `renderer.resume()`
     * when it goes `false`. Optional because not every consumer of
     * `PreviewContext` sits behind a pause-able chrome.
     */
    readonly paused?: boolean;
}
/**
 * The provider contract. Every extension module exports one or more
 * `PreviewProvider` values and the Task 06 registry keys them by
 * `extensions`. For Task 03 this interface is the stub — no concrete
 * providers ship yet.
 */
interface PreviewProvider {
    /**
     * File extensions this provider claims, WITHOUT the leading dot
     * (e.g., `['hydra']`, not `['.hydra']`). The registry (Task 06) maps
     * `WorkspaceFile.language` to the provider via this field.
     */
    readonly extensions: readonly string[];
    /**
     * Human-readable label used in diagnostic messages, dropdown tooltips,
     * and the source-selector chrome.
     */
    readonly label: string;
    /**
     * `true` if the provider's render output should keep running while the
     * tab is hidden; `false` if it should pause.
     *
     * Per CONTEXT D-03: pattern runtimes are implicitly always-on (their
     * chrome, not their render, is what users interact with). Viz previews
     * (`HYDRA_VIZ`, `P5_VIZ`) default to `false` — no point burning a GPU
     * frame on an invisible canvas. `PreviewView` uses this flag to decide
     * whether to freeze the reload debounce when its `hidden` prop flips.
     */
    readonly keepRunningWhenHidden: boolean;
    /**
     * Per CONTEXT D-07 — see `PreviewReloadPolicy` doc above.
     */
    readonly reload: PreviewReloadPolicy;
    /**
     * Debounce window in milliseconds. Required when `reload === 'debounced'`.
     * Ignored by the host in the other two modes.
     */
    readonly debounceMs?: number;
    /**
     * Render the provider's output given a snapshot of the preview context.
     * Called ONCE on mount, then AGAIN on every reload event. Every call
     * should return a fresh `ReactNode`; `PreviewView` reconciles the tree
     * via React's normal rendering path. Do not return the same node twice
     * expecting React to treat it as unchanged — snapshot identity lives in
     * the ctx fields, not in the return value.
     */
    render(ctx: PreviewContext): ReactNode;
    /**
     * Optional chrome rendered on the EDITOR tab for files this provider
     * claims. Gives viz files a discoverable action bar (Preview to Side,
     * Background toggle, Save, Hot-reload toggle) matching the transport
     * chrome pattern files get from their runtime provider.
     *
     * If omitted, the editor tab has no chrome for this file type.
     */
    renderEditorChrome?(ctx: PreviewEditorChromeContext): ReactNode;
}
/**
 * Context handed to `PreviewProvider.renderEditorChrome()`. Contains the
 * file being edited and action callbacks the chrome can invoke. The shell
 * wires these callbacks to the command registry and the viz preset bridge.
 */
interface PreviewEditorChromeContext {
    /** The workspace file this editor tab is bound to. */
    readonly file: WorkspaceFile;
    /**
     * Open the preview for this file in a sibling split group.
     *
     * Idempotent: if a preview tab for this file already exists anywhere
     * in the shell, the shell's handler returns early without opening a
     * second one. The chrome can call this safely on every click without
     * having to track preview state itself.
     *
     * The optional `sourceRef` argument pins the new preview tab to a
     * specific audio source when opening. The chrome's source dropdown
     * passes the user's selection through this parameter so the preview
     * subscribes to the chosen publisher (a pattern file, the sample
     * sound, or `'none'` for demo mode) from the moment it mounts —
     * avoiding the default-tracking fallback that would otherwise race
     * the user's pattern-start clicks.
     *
     * The preview tab is closed by its own ✕ button, NOT by a chrome
     * action. Clicking Stop on the chrome (when a preview is open)
     * calls `onTogglePausePreview` below to pause the render loop
     * instead of tearing down the tab.
     */
    readonly onOpenPreview: (sourceRef?: AudioSourceRef) => void;
    /**
     * Whether a preview tab for this file currently exists in any
     * group. Drives the chrome's primary-button label: closed →
     * "▶ Preview", open → "■ Stop" or "▶ Play" depending on
     * `previewPaused`. Maintained by the shell — embedders of
     * `PreviewView` directly (outside the shell) can omit this and
     * the chrome will fall back to always showing "▶ Preview".
     */
    readonly previewOpen?: boolean;
    /**
     * Whether the open preview is currently paused (user clicked
     * Stop). Only meaningful when `previewOpen === true`. When true,
     * the chrome shows "▶ Play" and clicking resumes; when false,
     * the chrome shows "■ Stop" and clicking pauses.
     */
    readonly previewPaused?: boolean;
    /**
     * Toggle the paused state of the open preview. The shell's
     * handler flips its internal `pausedPreviews` set, which
     * propagates through PreviewView → provider ctx → the compiled
     * viz mount, which calls `renderer.pause()` / `renderer.resume()`.
     * Only rendered as a button when `previewOpen === true`.
     */
    readonly onTogglePausePreview?: () => void;
    /**
     * Update the audio source of an already-open preview tab without
     * closing it. When the chrome's source dropdown changes AND a
     * preview is currently open, the chrome calls this with the new
     * ref; the shell finds the preview tab for this file and mutates
     * its `sourceRef` field in place. Task 2's sourceRef-in-React-key
     * trick remounts the sketch on the swap so `setup()` re-runs
     * with fresh injected refs.
     *
     * If the preview isn't open, the chrome falls back to updating
     * its own local selection state and waits for the user to click
     * Preview.
     */
    readonly onChangePreviewSource?: (ref: AudioSourceRef) => void;
    /** Toggle the background decoration (viz behind the editor). */
    readonly onToggleBackground: () => void;
    /**
     * Whether this chrome's file is the active group's pinned backdrop.
     * The VizEditorChrome uses it to render the Set/Clear BG button as
     * an active (on) or inactive (off) toggle — no round-trip through
     * the shell on every render. Optional for callers that don't track
     * backdrop state (the button still works via onToggleBackground;
     * the label just can't flip).
     */
    readonly isBackground?: boolean;
    /** Save the file back to its persistent store (VizPresetStore). */
    readonly onSave: () => void;
    /**
     * Whether hot-reload is currently enabled.
     *
     * Optional because Phase 10.2 ships a provider-level `reload` policy
     * (per-provider, not per-tab) so most chromes render this as a static
     * "live" indicator rather than a toggle. A per-tab toggle would
     * require threading state through `PreviewView.reload` — scoped to a
     * follow-up phase.
     */
    readonly hotReload?: boolean;
    /** Toggle hot-reload on/off. Optional — see `hotReload` above. */
    readonly onToggleHotReload?: () => void;
}

/**
 * aliasMap — built-in named-signal aliases for the SignalBus, plus the
 * engine-keyed model that lets one alias NAME carry per-engine sound lists.
 *
 * ## Why engine-keyed
 * The bus is engine-agnostic at the IR level (it keys on `IREvent.s`), but the
 * `s` VALUES are the one place engine-specificity leaks through: Strudel writes
 * `bd`/`sd`/`hh`; Sonic Pi writes sample symbols (`drum_heavy_kick`,
 * `drum_snare_hard`) and synth names (`prophet`, `beep`) — verified against the
 * Sonic Pi source (`synthinfo.rb` `@@grouped_samples` :9304+, `@@synth_infos`
 * :9609; every trigger resolves to a single `scsynth_name` string,
 * `sound.rb:160-181`). The key fact: in BOTH engines a sound's identity is a
 * single STRING (or a list) — the alias VALUE type never needs to be richer,
 * only the values differ per engine. So an alias absorbs the leak: the NAME
 * (`kick`) stays unified across engines, only the sound list is per-engine.
 *
 *   kick → { strudel: ['bd','kick9'], sonicpi: ['drum_heavy_kick'] }
 *
 * The active engine is resolved at MOUNT (`resolveAliasesForEngine`) down to the
 * flat `Record<name, string|string[]>` the bus already consumes — so the bus and
 * its `setAliases` contract are UNCHANGED; the engine dimension lives entirely in
 * storage + this resolver (PV12: the bus stays pure, never sees an engine).
 *
 * ## Array aliases
 * An alias may map to a SINGLE sound (`uKick → 'bd'`) or an ARRAY
 * (`uTom → ['lt','mt','ht']`); for array aliases the bus resolves the envelope
 * value as the MAX over members (any tom firing lights the alias).
 *
 * NOTE: `uKeyVelocity` is NOT a sound alias — it resolves to the active event's
 * `.velocity` (handled in the per-renderer bare-alias preamble, not here).
 */
/** The live-coding engine a viz sketch is currently driven by. Strudel is the
 *  only engine wired today; `sonicpi` is reserved for Sonic Pi Web (a thesis,
 *  not yet built — see `project_sonic_pi_web`). The union is open by intent:
 *  storage/sanitize keep ANY engine key with a valid value, so a future engine
 *  survives a round-trip through an older build. */
type VizEngine = 'strudel' | 'sonicpi';
/** A resolved alias value for one engine: a single sound name, or a list whose
 *  envelope reads as the MAX over members. */
type EngineAliasValue = string | string[];
/** One alias' per-engine sound lists. Partial: an alias may define a value for
 *  some engines and not others (e.g. a Strudel-only clap with no Sonic Pi
 *  equivalent → silently inert under Sonic Pi, never a crash). */
type EngineAliasMap = Partial<Record<VizEngine, EngineAliasValue>>;
/** The persisted custom-alias shape: alias name → per-engine sound lists. This
 *  is what lives in localStorage (`editorRegistry`); the flat per-engine view
 *  the bus consumes is derived from it via `resolveAliasesForEngine`. */
type StoredSignalAliases = Record<string, EngineAliasMap>;
/** The active viz engine. Strudel is the only live engine today; this is the
 *  single wire-point — when Sonic Pi Web lands, source the active engine from
 *  the running `LiveCodingEngine` at the renderer mount and pass it to
 *  `resolveAliasesForEngine`. */
declare const DEFAULT_VIZ_ENGINE: VizEngine;
/**
 * Built-in aliases, engine-keyed. Strudel values are the canonical Strudel
 * sound names; Sonic Pi values are sample symbols from the Sonic Pi source
 * (`synthinfo.rb` `@@grouped_samples`, the `:drum` group) so the built-in
 * signals work cross-engine the day Sonic Pi Web ships. Aliases with no
 * canonical Sonic Pi sample (`uClap`, `uRim`) intentionally omit the `sonicpi`
 * slot rather than guess — they stay Strudel-only until a user maps them.
 */
declare const BUILTIN_ALIASES: Record<string, EngineAliasMap>;
/**
 * Resolve built-ins + custom aliases into the flat `Record<name, value>` the bus
 * consumes for a single engine. Built-ins first, custom LAST so a user override
 * WINS on collision (mirrors the old `{ ...ALIAS_MAP, ...custom }` merge). An
 * alias with no value for `engine` is omitted (its bare name stays unbound under
 * that engine — honest, never a silent zero-as-bug). Pure: takes the stored
 * custom map as an arg, imports nothing impure (PV12).
 */
declare function resolveAliasesForEngine(custom: StoredSignalAliases, engine: VizEngine): Record<string, EngineAliasValue>;
/**
 * ALIAS_MAP — the built-in aliases flattened for the DEFAULT engine (Strudel).
 * Kept as a derived view for back-compat: the bus' default constructor and the
 * renderers' bare-name injection consume this flat shape. Equivalent to the
 * pre-engine-keyed constant (`uKick → 'bd'`, `uTom → ['lt','mt','ht']`).
 */
declare const ALIAS_MAP: Record<string, EngineAliasValue>;

/** Coarse hint for which editor a chunk can open. Panels still read the
 * structured fields below to decide what they can actually edit. */
type ChunkType = 'step' | 'roll' | 'knobs' | 'unknown';
interface ChainArg {
    /** source text of the argument expression, verbatim */
    raw: string;
    /** numeric value when the arg is a (possibly negated) number literal, else null */
    numeric: number | null;
    /** absolute doc offsets of the argument expression */
    range: [number, number];
}
interface ChainCall {
    name: string;
    args: ChainArg[];
    /**
     * For member calls: [dotOffset, callEnd] — replacing/deleting this range
     * removes the call. For the head call: the full call expression range.
     */
    range: [number, number];
}
interface ChunkInfo {
    /** the whole top-level statement (incl. any `$:` label) */
    statementRange: [number, number];
    /** the statement's exact source when detected — used to verify freshness */
    statementText: string;
    /** the pattern expression, excluding the `$:` label — append `.fx()` here */
    exprRange: [number, number];
    /** `$:` label name, or null */
    label: string | null;
    /** head function name, e.g. `s`, `note`, `stack` */
    headFn: string | null;
    /** contents of the head call's first string literal, quotes excluded */
    miniRange: [number, number] | null;
    miniString: string | null;
    /** calls in source order, head first */
    chain: ChainCall[];
    type: ChunkType;
}
/** Top-level statement nodes, or null when the doc doesn't parse
 * (mid-keystroke syntax error — the caller keeps the last good chunk). */
declare function parseTopLevel(doc: string): any[] | null;
/** Does the doc parse at all? Distinguishes "no statement here" from "broken doc". */
declare function docParses(doc: string): boolean;
/**
 * A chunk's ranges are only valid against the exact doc it was detected from.
 * Every write MUST check this first.
 */
declare function isChunkFresh(doc: string, chunk: ChunkInfo): boolean;
/**
 * The innermost editable chunk under `pos`, or null. Descends into combinator
 * arguments — a cursor on a track inside `stack(...)` binds THAT track, not the
 * whole `$: stack(...)` statement (#395). A top-level cursor is unchanged.
 */
declare function detectChunk(doc: string, pos: number): ChunkInfo | null;
/** Every editable chunk in the doc, in source order. */
declare function detectAllChunks(doc: string): ChunkInfo[];
/**
 * Best-guess primary editor for a chunk. Coarse — panels read `chain`/`mini`
 * directly to decide what they can edit. A pattern with a `note`/`n` head and
 * a mini string is roll-shaped; an `s`/`sound` head with a mini string is
 * grid-shaped; anything with a numeric chain literal can at least show knobs.
 */
declare function classifyChunk(info: ChunkInfo): ChunkType;

/**
 * writeback — chunk → document.
 *
 * The mutation half of the visual-editing spine. Visual panels read a
 * `ChunkInfo` (see `chunkDetect.ts`) to learn the doc offsets they may edit,
 * then route every edit through here so it is:
 *
 *  1. **Surgical** — only the named offset range changes; the rest of the
 *     statement (mini-notation quotes, spacing, indent) stays byte-identical.
 *     This is the whole reason write-back panels edit TEXT and not the IR:
 *     `toStrudel` is a whole-statement canonical regenerator that would
 *     reformat the leaf layer (design doc Appendix A).
 *  2. **Origin-tagged** — while a panel edit is applied, `currentSource` names
 *     it, so the host's `onDidChangeModelContent` listener can tell a panel
 *     edit (re-eval audio, keep panel model) from a typed edit (re-parse the
 *     panel model). Monaco's content-change event carries no source of its
 *     own, so the flag is set synchronously around the edit — the listener
 *     fires inside `pushEditOperations`, while the flag is up.
 *  3. **One undo step** — every call is a single `pushEditOperations`, so even
 *     a multi-cell drag (`replaceRanges`) is one Ctrl-Z.
 *
 * Range discipline: offsets come from a `ChunkInfo` and are valid ONLY against
 * the exact doc it was detected from. Use `applyFresh` (or call `isChunkFresh`
 * yourself) before every write — stale offsets corrupt unrelated code.
 *
 * The pure helpers (`formatNumber`, `normalizeEdits`) are string/number math
 * with no Monaco dependency, so they unit-test with plain assertions. The
 * `Writeback` class is the thin Monaco-bound shell, observed in the app.
 */

/**
 * Which panel originated an edit. The host content-change listener switches on
 * this to decide whether to re-parse its model (typed edit) or leave it
 * (panel-originated edit it already knows about).
 */
type WriteSource = 'knob' | 'seq' | 'roll' | 'arrange.weights' | 'arrange.structure' | 'transport';
/** A single replacement, addressed by absolute pre-edit doc offsets. */
interface OffsetEdit {
    /** absolute [start, end) offsets in the document as it was when detected */
    range: [number, number];
    /** replacement text ('' to delete) */
    text: string;
}
/**
 * Format a number for insertion as a source literal. Drag handlers produce
 * values like `0.30000000000000004` or `2.9999999`; emitting those verbatim
 * would corrupt the user's code with float noise. We round to `maxDecimals`
 * and strip trailing zeros, so `0.3`, `2`, `-1.5` come out clean.
 *
 * Pure — no Monaco.
 */
declare function formatNumber(v: number, maxDecimals?: number): string;
/**
 * Validate a batch of edits and return them sorted ascending by start offset.
 * Throws on any overlap — overlapping ranges in a single `pushEditOperations`
 * have undefined application order and would corrupt the doc. Zero-width edits
 * (inserts) are allowed and never count as overlapping a neighbour that starts
 * at the same offset only if texts don't both target it; we conservatively
 * reject ranges that share interior space.
 *
 * Pure — no Monaco.
 */
declare function normalizeEdits(edits: OffsetEdit[]): OffsetEdit[];
/**
 * Apply a batch of offset edits to a string and return the result. Pure mirror
 * of what `Writeback.apply` does to a Monaco model — used by callers that edit
 * plain text (arrangement round-trip / parity tests) and to preview an edit
 * before it touches the document. Edits are validated + sorted by
 * `normalizeEdits`, then spliced from the END so earlier offsets stay valid.
 *
 * Pure — no Monaco.
 */
declare function applyEdits(doc: string, edits: OffsetEdit[]): string;
/**
 * Monaco-bound edit sink. One per editor. Construct with the editor instance
 * and the `monaco` namespace (for `Range`). All edits go through `apply`, which
 * keeps the origin flag up across the synchronous content-change event.
 */
declare class Writeback {
    private readonly editor;
    private readonly monaco;
    private writingSource;
    /** true between beginGesture/endGesture — suppresses per-edit undo boundaries */
    private inGesture;
    constructor(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco);
    /**
     * Open a gesture: edits applied until `endGesture` coalesce into ONE undo
     * step. Used for a continuous knob drag or a multi-cell sweep so the whole
     * gesture is a single Ctrl-Z. Re-eval still fires per edit (live audio); only
     * the undo grouping is affected. Idempotent if already in a gesture.
     */
    beginGesture(): void;
    /** Close the gesture, sealing all its edits as one undo step. */
    endGesture(): void;
    /**
     * The source of the edit currently being applied, or null. The host's
     * `onDidChangeModelContent` listener reads this synchronously to attribute
     * the change. It is non-null ONLY for the duration of `apply`.
     */
    get currentSource(): WriteSource | null;
    /** Replace a single offset range. One undo step. */
    replaceRange(range: [number, number], text: string, source: WriteSource): void;
    /**
     * Replace several non-overlapping ranges as ONE edit — one undo step. Used
     * for multi-cell drags (toggle several steps, then a single Ctrl-Z reverts
     * the whole gesture).
     */
    replaceRanges(edits: OffsetEdit[], source: WriteSource): void;
    /** Insert text at an offset (zero-width edit). */
    insertAt(offset: number, text: string, source: WriteSource): void;
    /** Delete an offset range. */
    deleteRange(range: [number, number], source: WriteSource): void;
    /**
     * Freshness-guarded write. Re-reads the live model text and refuses the edit
     * if the chunk's statement no longer matches what it was detected from
     * (the doc changed under the panel). Returns true if applied, false if stale.
     * Prefer this over the raw methods on any path that can race a typed edit.
     */
    applyFresh(chunk: ChunkInfo, edits: OffsetEdit[], source: WriteSource): boolean;
    private apply;
}

/**
 * editorRegistry — tiny module-level map so callers outside the
 * editor package (shell, app, outline panel) can find the Monaco
 * editor instance that's currently rendering a given fileId. Used
 * for cross-file navigation features like "reveal at line".
 *
 * EditorView registers on mount and unregisters on unmount. Only the
 * ACTIVE editor for a fileId matters — if two groups show the same
 * file, the last mount wins, which matches the UX ("jump to this
 * symbol" lands wherever the editor is currently focused).
 */

/**
 * Reveal the given line in the editor for `fileId` and set the cursor
 * at column 1. Returns true if the editor was found. Line numbers are
 * 1-based.
 */
declare function revealLineInFile(fileId: string, line: number): boolean;
/**
 * Apply a batch of surgical offset edits to the model of `fileId`'s editor as
 * ONE undo step, tagged with `source`. Returns false (no-op) when the editor
 * isn't mounted, the monaco namespace hasn't been captured, there are no edits,
 * or `expectedDoc` is given and the live model text no longer matches it (the
 * offsets are stale — applying them would corrupt unrelated code). This is the
 * arrangement timeline's write-back seam: the canvas hands up the edits (built
 * by `visualEdit/arrange`), the registry routes them through the same surgical
 * `Writeback` the panels use, and the runtime's debounced re-eval picks the
 * change up (no explicit eval call needed). PV122 #2.
 */
declare function applyOffsetEditsToFile(fileId: string, edits: OffsetEdit[], source: WriteSource, expectedDoc?: string): boolean;
/** CSS variable that scales every chrome-level icon glyph (menu gear,
 *  activity bar, etc.). Applied to documentElement on mount and on
 *  every change. */
declare const UI_ICON_SIZE_VAR = "--ui-icon-size";
/** Separate CSS variable for the floating action buttons (edit / crop)
 *  attached to inline `.viz()` zones. They sit inside the canvas area
 *  and tend to need a tighter scale than the rest of the chrome —
 *  hence their own slider, independent of the main UI icon size. */
declare const INLINE_VIZ_ACTION_SIZE_VAR = "--inline-viz-action-size";
/** Get the current global editor font size (px). */
declare function getEditorFontSize(): number;
/** Get the current global minimap visibility flag. */
declare function getEditorMinimap(): boolean;
/** Set the font size (clamped 8–40) and apply to every open editor. */
declare function setEditorFontSize(size: number): void;
/** Bump font size by delta (positive / negative). */
declare function bumpEditorFontSize(delta: number): void;
/** Toggle minimap visibility across every open editor. */
declare function toggleEditorMinimap(): void;
declare function getEditorUiIconSize(): number;
declare function setEditorUiIconSize(size: number): void;
declare function onUiIconSizeChange(cb: (size: number) => void): () => void;
/** Apply the persisted icon size to the document root on first mount. */
declare function applyPersistedUiIconSize(): void;
declare function getInlineVizActionSize(): number;
declare function setInlineVizActionSize(size: number): void;
declare function onInlineVizActionSizeChange(cb: (size: number) => void): () => void;
declare function applyPersistedInlineVizActionSize(): void;
/** Current inline-viz render resolution (height in px). */
declare function getInlineVizResolution(): number;
/** Set the inline-viz render resolution (clamped 64–2048). Notifies listeners;
 *  takes effect on the next zone (re)mount / evaluate. */
declare function setInlineVizResolution(n: number): void;
declare function onInlineVizResolutionChange(cb: (n: number) => void): () => void;
/** Current viz quality level ("performance mode"). */
declare function getVizQuality(): VizQualityLevel;
/** Set the viz quality level — persists, applies resolution + density to their
 *  channels (the density marshals live to worker viz), and notifies listeners. */
declare function setVizQuality(level: VizQualityLevel): void;
declare function onVizQualityChange(cb: (level: VizQualityLevel) => void): () => void;
/** Restore the persisted quality's DENSITY into the vizConfig singleton on
 *  startup (call once at app init, like `applyPersistedInlineVizActionSize`).
 *
 *  Density ONLY — deliberately NOT resolution. Resolution is pull-model (read
 *  fresh from its own `stave:inlineVizResolution` setting when a zone mounts),
 *  and `setVizQuality` already writes that setting at set-time, so a chosen
 *  level's resolution persists through that channel. Re-applying resolution here
 *  would CLOBBER a user's standalone render-resolution override on every reload
 *  (it would force the default level's 512 whenever quality was never changed).
 *  Density, by contrast, lives in the in-memory vizConfig singleton that resets
 *  to default(1) per page load, so it's the only knob that needs restoring. */
declare function applyPersistedVizQuality(): void;
/** Whether off-screen inline viz are torn down (destroyed to reclaim memory)
 *  after the threshold. Default ON. */
declare function getInlineVizTeardownEnabled(): boolean;
/** Enable/disable off-screen inline-viz teardown. Notifies listeners; takes
 *  effect on the next zone (re)mount / evaluate. */
declare function setInlineVizTeardownEnabled(on: boolean): void;
declare function onInlineVizTeardownChange(cb: (on: boolean) => void): () => void;
/** Effective teardown delay in ms for a newly-mounted inline zone: the threshold
 *  when enabled, 0 (= never tear down) when disabled. Read at mount. An optional
 *  `stave:inlineVizTeardownMs` localStorage override tunes the delay (advanced /
 *  test churn harnesses) — clamped to ≥1000ms; absent → the 60s default. */
declare function getInlineVizTeardownMs(): number;
/** Whether the open Stave Inputs drawer paints live master signal values
 *  (#346). Default ON. */
declare function getVizInputsLiveValuesEnabled(): boolean;
/** Enable/disable live values in the Stave Inputs drawer. Notifies listeners so
 *  a mounted panel can start/stop its paint loop without a reload. */
declare function setVizInputsLiveValuesEnabled(on: boolean): void;
declare function onVizInputsLiveValuesChange(cb: (on: boolean) => void): () => void;
declare function getMusicalTimelineSubRowHeight(): number;
declare function setMusicalTimelineSubRowHeight(h: number): void;
declare function onMusicalTimelineSubRowHeightChange(cb: (h: number) => void): () => void;
/** CSS variable read by the shell's code-panel blur rule (see
 *  globals.css). 0 disables the blur entirely; higher values push
 *  more toward frosted-glass legibility. */
declare const BACKDROP_BLUR_VAR = "--stave-backdrop-blur";
declare function getEditorBackdropBlur(): number;
declare function setEditorBackdropBlur(size: number): void;
declare function applyPersistedBackdropBlur(): void;
declare function getBackdropOpacity(): number;
declare function setBackdropOpacity(o: number): void;
declare function onBackdropOpacityChange(cb: (o: number) => void): () => void;
/** The flat per-engine view the bus consumes and the settings UI edits. */
type SignalAliasMap = Record<string, string | string[]>;
/** The raw engine-keyed custom-alias map (sanitized + migrated). Source of
 *  truth for the renderer's `resolveAliasesForEngine` and any future
 *  multi-engine settings UI. */
declare function getStoredSignalAliases(): StoredSignalAliases;
/** Custom signal aliases for ONE engine (default: the active engine, Strudel),
 *  as the flat `name → value` view the settings UI edits. Built-ins are NOT
 *  included — custom map only. */
declare function getSignalAliases(engine?: VizEngine): SignalAliasMap;
/** Replace the custom aliases for ONE engine (default: active/Strudel) from the
 *  flat `name → value` view, persist, and notify. Surviving names KEEP their
 *  other engines' slots (editing the Strudel column never wipes a Sonic Pi one);
 *  names absent from `map` are removed. The values are sanitized so a bad caller
 *  can't poison storage. */
declare function setSignalAliases(map: SignalAliasMap, engine?: VizEngine): void;
/** Subscribe to alias-map changes (fires on every setSignalAliases). The
 *  callback receives the FLAT view for the engine that was set. Returns an
 *  unsubscribe. */
declare function onSignalAliasesChange(cb: (map: SignalAliasMap) => void): () => void;
type BackdropQuality = 'full' | 'half' | 'quarter';
declare function getBackdropQuality(): BackdropQuality;
declare function setBackdropQuality(q: BackdropQuality): void;
declare function onBackdropQualityChange(cb: (q: BackdropQuality) => void): () => void;
/** Resolution factor applied to the backdrop — render at factor×
 *  viewport size, CSS-stretch to fill. Lower = cheaper GPU. */
declare function backdropQualityFactor(q: BackdropQuality): number;
type EditorTheme = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';
type ThemeListener = (t: ResolvedTheme) => void;
declare function getEditorTheme(): EditorTheme;
declare function getResolvedTheme(): ResolvedTheme;
declare function setEditorTheme(theme: EditorTheme): void;
/** Cycle dark → light → system → dark. Used by the menu command. */
declare function cycleEditorTheme(): EditorTheme;
/** Subscribe to resolved theme changes. Fires when mode changes or when
 * 'system' preference flips. Returns an unsubscribe. */
declare function onThemeChange(fn: ThemeListener): () => void;
/** Seed DOM + monaco with the persisted theme. Call after mounting. */
declare function applyPersistedTheme(): void;
/** Whether the perf overlay/profiler is enabled (persisted preference, or the
 *  `__STAVE_PERF__` global force-on). */
declare function getPerfEnabled(): boolean;
/** Enable/disable the perf profiler + overlay. Persists, flips the profiler
 *  singleton's live flag, and notifies listeners (the overlay subscribes). */
declare function setPerfEnabled(on: boolean): void;
/** Toggle the perf overlay; returns the new state. */
declare function togglePerfEnabled(): boolean;
/** Subscribe to perf-enabled changes (fires on set/toggle). Returns an
 *  unsubscribe. */
declare function onPerfEnabledChange(cb: (on: boolean) => void): () => void;
/** Apply the persisted perf-enabled preference to the profiler. Call once at
 *  app start so a reload restores an enabled overlay. */
declare function applyPersistedPerfEnabled(): void;
/** Whether adaptive performance (the viz governor) is enabled (persisted; ON by default). */
declare function getAdaptivePerfEnabled(): boolean;
/** Enable/disable adaptive performance. Persists, flips the governor's live gate
 *  (disabling releases the levers immediately — full resolution, no throttle),
 *  and notifies listeners. */
declare function setAdaptivePerfEnabled(on: boolean): void;
/** Toggle adaptive performance; returns the new state. */
declare function toggleAdaptivePerfEnabled(): boolean;
/** Subscribe to adaptive-performance changes (fires on set/toggle). */
declare function onAdaptivePerfChange(cb: (on: boolean) => void): () => void;
/** Apply the persisted adaptive-performance preference to the governor. Call once
 *  at app start (like applyPersistedPerfEnabled) so the governor's live flag agrees
 *  with the stored preference regardless of module-load ordering. */
declare function applyPersistedAdaptivePerf(): void;

/**
 * Phase 10.2 — Workspace type vocabulary.
 *
 * This file is the single source of truth for workspace-level types. Each
 * task in Phase 10.2 appends its own type surface here:
 *
 * - Task 01 (this task): WorkspaceFile, WorkspaceLanguage.
 * - Task 02: AudioSourceRef, AudioPayload, WorkspaceAudioBus.
 * - Task 03: EditorViewProps, PreviewViewProps.
 * - Task 04: WorkspaceTab, WorkspaceGroup, WorkspaceLayout.
 * - Task 05: LiveCodingRuntime, LiveCodingRuntimeProvider, ChromeContext.
 * - Task 06: PreviewProvider, PreviewContext.
 *
 * Keep this file type-only. No runtime code, no imports that bring in React
 * or DOM APIs. The types must be consumable from unit tests that run in a
 * plain Node environment. Type-only imports (`import type ...`) are erased
 * at compile time and are safe to add when a downstream task needs to
 * reference engine-layer types from the workspace public surface.
 *
 * @remarks
 * Task 03 adds `EditorViewProps` and `PreviewViewProps`. These DO depend
 * on React types (`ReactNode`) but the imports are type-only and erased at
 * compile time, so the "no React runtime imports" rule is preserved. The
 * concrete `PreviewProvider` interface lives in its own file
 * (`PreviewProvider.ts`) because it contains more than a type — it's a
 * behavioral contract Task 06 will key a registry on.
 */

/**
 * The set of languages a WorkspaceFile may declare. This is an explicit
 * string-literal union rather than an open string so that the exhaustiveness
 * checker inside providers catches unhandled cases. New languages are added
 * here as new provider registries land (e.g., Phase 7+ may add `.tidal`).
 */
type WorkspaceLanguage = 'strudel' | 'sonicpi' | 'hydra' | 'p5js' | 'glsl' | 'markdown';
/**
 * A single editable file owned by the workspace. Instances are **immutable
 * snapshots**: `setContent` replaces the record in the store instead of
 * mutating the object in place. This is load-bearing for
 * `useSyncExternalStore` snapshot identity — consumers compare by reference,
 * so a new object on content change is what triggers their re-render, and
 * an unchanged reference on unrelated content changes is what prevents
 * spurious re-renders.
 *
 * @remarks
 * The `meta` bag is an escape hatch for per-file data that does not belong
 * in the store's public API (e.g., provider-specific viz preset ids in
 * Phase 10.2, cursor position in Phase 10.3). Treat it as opaque — callers
 * should namespace their keys to avoid collisions.
 */
interface WorkspaceFile {
    readonly id: string;
    readonly path: string;
    readonly content: string;
    readonly language: WorkspaceLanguage;
    readonly meta?: Readonly<Record<string, unknown>>;
}
/**
 * Selector that a preview consumer hands to `WorkspaceAudioBus.subscribe`
 * to declare which publisher's payload it wants to receive. Discriminated
 * union per CONTEXT D-02 / D-04 (preview tab source dropdown).
 *
 * - `{ kind: 'default' }` — follow whichever publisher is currently
 *   most-recent. Snaps to a new publisher when one starts; falls through
 *   to the next-most-recent when the current default unpublishes.
 * - `{ kind: 'file', fileId }` — pin to a specific publisher. Fires once
 *   on subscribe with the current payload (or `null` if that publisher is
 *   not currently registered), again when that publisher (un)publishes,
 *   and never for any other publisher's events.
 * - `{ kind: 'none' }` — explicit "no audio input." Subscribers fire once
 *   on subscribe with `null` and then never again. Used by viz tabs in
 *   demo mode (P7 fallback).
 */
type AudioSourceRef = {
    kind: 'default';
} | {
    kind: 'file';
    fileId: string;
} | {
    kind: 'none';
};
/**
 * The component bag that a `LiveCodingRuntime` publishes to the bus when its
 * pattern starts playing, and that every viz consumer subscribes to in order
 * to drive its renderer.
 *
 * The shape mirrors `Partial<EngineComponents>` from `LiveCodingEngine.ts`
 * with the slots flattened (no nested `streaming.hapStream` indirection) so
 * that consumers can destructure `{ hapStream, analyser, scheduler }` in one
 * line. The slots themselves are the SAME references the engine holds —
 * the bus owns no audio nodes (PV3, UV6: observation, not mutation).
 *
 * @remarks
 * ## Identity contract (D-01 — subscribe + re-mount)
 *
 * The bus delivers ONE callback per publisher identity change, not per
 * audio frame. Identity is determined by shallow comparison across
 * `hapStream`, `analyser`, `scheduler`, `inlineViz`, and `audio` — if a
 * runtime calls `publish(sameId, newPayload)` and every slot reference
 * matches the previous payload, subscribers do NOT re-fire. This keeps the
 * bus out of the per-frame FFT read path; consumers reach into
 * `payload.analyser` directly for that.
 *
 * ## Optionality
 *
 * Every slot is optional because not every engine populates every slot
 * (e.g., the demo engine has streaming + audio but no scheduler). Consumers
 * MUST guard each slot before use.
 */
interface AudioPayload {
    readonly hapStream?: StreamingComponent['hapStream'];
    readonly analyser?: AudioComponent['analyser'];
    readonly scheduler?: QueryableComponent['scheduler'];
    readonly inlineViz?: InlineVizComponent;
    readonly audio?: AudioComponent;
    /**
     * Full engine components in their original nested shape. Needed by
     * `addInlineViewZones` which reads `queryable.trackSchedulers`,
     * `audio.trackAnalysers`, `inlineViz.trackStreams`, etc. The flat
     * fields above are convenience accessors for simple consumers
     * (PreviewView source selector, popout bridge). Inline zones and
     * viz renderers must read from this field to get per-track data.
     */
    readonly engineComponents?: Partial<EngineComponents>;
    /**
     * Phase 20-07 — per-engine breakpoint registry. The Monaco gutter UI in
     * EditorView reads this to subscribe + render glyphs; the gutter click
     * handler calls `toggleSet` to register breakpoints. Absent for engines
     * that don't support the breakpoint protocol.
     */
    readonly breakpointStore?: BreakpointStore;
    /**
     * Phase 20-07 — invoked when the user clicks "Debugger: Resume" via the
     * Monaco command palette. Calls `runtime.resume()`. Absent for engines
     * without scheduler-pause support.
     */
    readonly onResume?: () => void;
}
/**
 * Description of a single registered publisher, returned from
 * `WorkspaceAudioBus.listSources()`. Always read on demand (e.g., on dropdown
 * open) — never cached in React state, since it can desync between renders
 * when publishers start/stop rapidly. The bus emits `onSourcesChanged` to
 * trigger re-renders, but the source data must be fetched fresh each time.
 *
 * - `sourceId` — the file id the publisher registered under.
 * - `label` — display label (currently equals `sourceId`; future Task 05 may
 *   pass through `WorkspaceFile.path` for prettier dropdown text).
 * - `playing` — `true` while the publisher has an active payload on the bus.
 *   Phase 10.2 only ever lists currently-publishing entries, so this is
 *   always `true`. Reserved for Phase 10.3+ when "stopped but recently
 *   active" entries may also be surfaced.
 */
interface AudioSourceListing {
    readonly sourceId: string;
    readonly label: string;
    readonly playing: boolean;
}
/**
 * The public surface of the workspace audio bus. The bus is implemented as a
 * module-level singleton in `WorkspaceAudioBus.ts` (per CONTEXT U1, matching
 * the `VizPresetStore` precedent); this interface exists for type-driven
 * consumers and for the eventual Phase 11 multi-shell refactor that may
 * introduce a class-per-shell variant.
 */
interface WorkspaceAudioBus {
    /**
     * Register or replace the payload for a given source id.
     *
     * Calling `publish(id, payload)` for a brand-new id appends `id` to the
     * end of the recency list (making it the new "most recent" publisher) and
     * fires every default-tracker plus every pinned subscriber on `id`.
     *
     * Calling `publish(id, payload)` for an existing id and a payload whose
     * shallow component slots match the previous payload is a **no-op** —
     * subscribers do NOT re-fire and the recency list is unchanged. This is
     * the D-01 identity guarantee that keeps the bus out of the FFT read
     * path. Calling with an existing id and DIFFERENT slot references
     * replaces the entry, leaves the recency position alone, and fires the
     * affected subscribers.
     */
    publish(sourceId: string, payload: AudioPayload): void;
    /**
     * Remove the payload for a given source id. Pinned subscribers on `id`
     * fire once with `null`; default-trackers fire once with whatever
     * publisher is now most-recent (or `null` if no publishers remain).
     * Calling on an unknown id is a no-op.
     */
    unpublish(sourceId: string): void;
    /**
     * Subscribe to the bus with a consumer-side selector. Returns an
     * unsubscribe function.
     *
     * **Synchronous initial fire** (krama lifecycle step 2): the callback is
     * invoked SYNC, before `subscribe` returns, with the current payload for
     * `ref` (or `null` if no publisher matches). This handles the popout
     * window race where the consumer mounts before the publisher.
     *
     * The unsubscribe function is idempotent — calling it multiple times has
     * the same effect as calling it once.
     */
    subscribe(ref: AudioSourceRef, cb: (payload: AudioPayload | null) => void): () => void;
    /**
     * Synchronously read the current payload for a ref without subscribing.
     * Returns `null` for `{ kind: 'none' }` or when no publisher matches.
     * Used by consumers that want to peek at the current state without
     * setting up a subscription (e.g., for one-shot rendering).
     */
    consume(ref: AudioSourceRef): AudioPayload | null;
    /**
     * List every currently-registered publisher. Always returns a fresh array.
     *
     * **MUST be read on demand** — never cached in React state. The bus emits
     * `onSourcesChanged` whenever the publisher set changes; that event is
     * the signal to re-read `listSources()`, not a snapshot to memoize. See
     * the pre-mortem in PLAN.md §10.2-02.
     */
    listSources(): AudioSourceListing[];
    /**
     * Register a callback that fires whenever the set of currently-registered
     * publishers changes (i.e., a `publish` for a new id, or an `unpublish`).
     * Re-publishing an existing id with the same shallow payload does NOT
     * trigger this. Returns an unsubscribe function.
     */
    onSourcesChanged(cb: () => void): () => void;
}
/**
 * A theme value accepted by every new workspace top-level component. Every
 * view owns its own theme application per CONTEXT PV6 — the shell does not
 * bubble the theme down through inline style inheritance because each
 * group in the shell's split layout is its own DOM root and CSS custom
 * properties do not cross React portal boundaries.
 *
 * Defaults to `'dark'` when the prop is omitted.
 */
type WorkspaceTheme = 'dark' | 'light' | StrudelTheme;
/**
 * Props accepted by `EditorView` — the Monaco-based editor for a single
 * workspace file. Task 03 ships the editor with a theme, a chrome slot for
 * Task 05 to inject runtime transport UI into, and an optional mount
 * callback so downstream tests and host components can capture the Monaco
 * editor instance.
 *
 * @remarks
 * ## What this does NOT include (yet)
 *
 * - `sourceRef` — Task 07 wires a bus subscription inside `EditorView` to
 *   drive `.viz()` inline view zones and highlighting; that subscription
 *   reads its own file's publisher via `{ kind: 'file', fileId }` (D-08)
 *   and does not need a prop, so no `sourceRef` is exposed here.
 * - Control over Monaco options (font size, minimap, etc.) — Task 03 hard
 *   codes the same option set the legacy `EditorGroup.tsx` used. Future
 *   phases can open this up if embedders need it.
 * - Task 07 added: bus subscription for inline zones + highlighting,
 *   `error` prop for diagnostics squiggles (S7).
 */
interface EditorViewProps {
    /**
     * The workspace file id this editor binds to. The hook
     * `useWorkspaceFile(fileId)` drives the Monaco `value` prop. If the file
     * is not yet registered (`undefined`), `EditorView` renders a loading
     * placeholder — the file may be seeded after the editor mounts.
     */
    readonly fileId: string;
    /**
     * Theme applied to the editor container via `applyTheme()` on mount
     * and on every theme change. Defaults to `'dark'`. PV6 — every view
     * owns its own theme application.
     */
    readonly theme?: WorkspaceTheme;
    /**
     * Chrome injected ABOVE the Monaco editor, inside the same DOM root.
     * Task 05 fills this slot with per-language runtime chrome (e.g.,
     * transport bar for pattern files). Task 03 accepts whatever the host
     * passes and renders it verbatim — no wrapping, no styling beyond the
     * flex container boundary.
     */
    readonly chromeSlot?: ReactNode;
    /**
     * Called after Monaco has mounted, with the editor instance and the
     * Monaco module reference. Downstream tasks (Task 07 — inline view
     * zones, highlighting) use this to attach behavior to the editor. The
     * `editor` and `monaco` types are intentionally `unknown` at this
     * layer — typed consumers cast at the call site.
     */
    readonly onMount?: (editor: unknown, monaco: unknown) => void;
    /**
     * Current runtime evaluation error, or `null` when no error is active.
     * The parent (compat shim or shell integration) manages the runtime's
     * `onError` subscription and passes the latest error through this prop.
     * When non-null, `EditorView` calls `setEvalError(monaco, model, error)`
     * to show a squiggle marker. When cleared to `null`, it calls
     * `clearEvalErrors(monaco, model)`. S7 — diagnostics driven by prop,
     * not by direct engine subscription inside EditorView.
     */
    readonly error?: Error | null;
    /**
     * Called when the user presses Ctrl+Enter (Cmd+Enter on Mac) inside the
     * Monaco editor. The parent (compat shim or shell integration) wires this
     * to `runtime.play()`. If omitted, the keybinding is not registered.
     */
    readonly onPlay?: () => void;
    /**
     * Called when the user presses Ctrl+. (Cmd+. on Mac) inside the Monaco
     * editor. The parent wires this to `runtime.stop()`. If omitted, the
     * keybinding is not registered.
     */
    readonly onStop?: () => void;
    /** Called when the user clicks the "edit" icon on an inline viz zone.
     *  Receives the viz name (e.g., "Piano Roll"). The host should navigate
     *  to the corresponding viz file. */
    readonly onEditViz?: (vizId: string) => void;
    /** Called when the user clicks the "crop" icon on an inline viz zone.
     *  Receives the viz name, preset id, and `trackKey` — the per-$:-block
     *  identifier (same key used for trackSchedulers / trackAnalysers /
     *  vizRequests). Required so the host can save the crop as a per-instance
     *  override rather than overwriting the shared VizPreset. */
    readonly onCropViz?: (vizId: string, presetId: string | null, trackKey: string) => void;
}
/**
 * Props accepted by `PreviewView` — the host for a `PreviewProvider`'s
 * rendered output. Task 03 ships the view as a controlled component: the
 * shell (Task 04) owns the `sourceRef` state and passes it down plus an
 * `onSourceRefChange` callback so the built-in source selector chrome can
 * drive tab-level state updates.
 *
 * @remarks
 * ## What this does NOT include (yet)
 *
 * - A provider registry lookup — Task 06 adds that. Task 03 accepts the
 *   `provider` directly as a prop so the view can be tested in isolation.
 * - A `theme` broadcaster that writes to the popout window — the popout
 *   integration lives inside `usePopoutPreview` (Task 07's scope).
 * - Error reporting for provider render failures — Task 06 adds an error
 *   boundary around `provider.render` when the concrete providers land.
 *   Task 03 trusts the provider to not throw.
 */
interface PreviewViewProps {
    /**
     * The workspace file id being previewed. The view subscribes to the
     * file via `useWorkspaceFile(fileId)` so provider reloads see fresh
     * content on every content change.
     */
    readonly fileId: string;
    /**
     * The provider that knows how to render this file type. Task 06 will
     * move provider selection inside a registry lookup keyed on
     * `file.language`; Task 03 accepts the provider directly for isolated
     * testing. Changing the provider prop mid-life of the view triggers a
     * fresh render; the view does not dispose the old provider (providers
     * are stateless value objects).
     */
    readonly provider: PreviewProvider;
    /**
     * Which publisher the view subscribes to on the bus. Owned by the
     * shell (Task 04); this view is controlled. `'default'` follows
     * most-recent, `{ kind: 'file' }` pins, `'none'` forces demo mode.
     */
    readonly sourceRef: AudioSourceRef;
    /**
     * Called when the user picks a different source from the built-in
     * selector chrome. The view does NOT hold its own `sourceRef` state —
     * it dispatches to this callback and waits for the controlled prop to
     * update. The shell (Task 04) wires this callback to its tab state.
     */
    readonly onSourceRefChange: (ref: AudioSourceRef) => void;
    /**
     * Theme applied to the view container via `applyTheme()` on mount and
     * on every theme change. Defaults to `'dark'`. PV6 — every view owns
     * its own theme application.
     */
    readonly theme?: WorkspaceTheme;
    /**
     * `true` when the tab is currently hidden (another tab is active in
     * this group, or the preview is background-layered under an editor).
     * The view checks `provider.keepRunningWhenHidden` to decide whether
     * to pause — if `false`, the view freezes its reload debounce AND
     * passes `hidden: true` to the provider's render context. On un-hide,
     * the view triggers one catch-up reload to pick up any content changes
     * that arrived while hidden.
     */
    readonly hidden?: boolean;
    /**
     * User-initiated pause state. When `true`, the view threads
     * `paused: true` into the provider render context so compiled
     * viz mounts can call `renderer.pause()` (p5.noLoop / hydra
     * stop) and freeze the canvas. Unlike `hidden`, this is an
     * explicit user action via the chrome's Stop button — the tab
     * stays visible but the animation loop halts. Click Play to
     * resume.
     */
    readonly paused?: boolean;
}
/**
 * A single tab inside the workspace shell. Tabs are the user-visible units
 * the shell renders; the shell dispatches rendering by `kind`:
 *
 *   - `kind: 'editor'` → `EditorView` bound to `fileId`.
 *   - `kind: 'preview'` → `PreviewView` bound to `fileId` with the tab's
 *     `sourceRef` pinned as a tab-level field (so the source dropdown
 *     inside `PreviewView` drives state up to the shell, which persists
 *     it per tab — two viz preview tabs of the same file can be pinned to
 *     different publishers).
 *
 * Each tab carries its own `id` separate from `fileId` because multiple
 * tabs can reference the same file (e.g., an editor tab AND a preview tab
 * for the same `pianoroll.hydra`, or two preview tabs pinned to different
 * sources). The shell uses `id` as the reconciliation key and drag-drop
 * identifier; `fileId` routes to the underlying file store.
 *
 * ## PV7 — no rendering-mode field on the tab
 *
 * The legacy `EditorGroup.tsx` carried a single state field that enumerated
 * four rendering modes (panel / inline / background / popout) and
 * entangled editor and preview concerns. The whole point of Phase 10.2 is
 * to dissolve that entanglement — a preview tab is a first-class tab,
 * dispatched by `kind`, not a rendering mode on top of an editor. Any
 * future "background decoration" support is shaped as a file id on
 * `WorkspaceGroupState.backgroundFileId` (promote-to-backdrop flow),
 * NOT as a mode on the tab itself.
 */
type WorkspaceTab = {
    readonly kind: 'editor';
    readonly id: string;
    readonly fileId: string;
    /**
     * Preview tabs render in italic and are replaced when another file
     * is opened in preview mode. Promoted to pinned (preview=false) on
     * double-click or on first edit. Matches VSCode's preview-tab UX.
     */
    readonly preview?: boolean;
} | {
    readonly kind: 'preview';
    readonly id: string;
    readonly fileId: string;
    readonly sourceRef: AudioSourceRef;
} | {
    /**
     * A read-only history viewer hosted in the main editor area — the
     * project commit store's Diff / time-travel View, moved out of the
     * cramped Version History side panel (#210). Carries everything the
     * HistoryDiffOverlay / HistoryViewOverlay components need to render.
     *
     * Reuses the preview-tab mechanism: opened as a single italic
     * `preview` slot that the next Diff/View replaces, promoted to a
     * pinned tab on double-click (same UX as opening a file in preview).
     * Never persisted — `tabPersistence` keeps only `editor` tabs, and a
     * commit can be pruned between sessions, so a stale history tab would
     * be a ghost.
     */
    readonly kind: 'history';
    readonly id: string;
    /** The file the viewer is focused on (drives the tab label + initial selection). */
    readonly fileId: string;
    readonly mode: 'diff' | 'view';
    /** The commit being diffed / viewed. */
    readonly commitId: string;
    /**
     * Diff mode only (#211): open the diff in "vs current" (commit ↔ live
     * working tree) by default, for the "Uncommitted Changes" section's
     * live ↔ HEAD diff. With `commitId` = HEAD, the original side is the
     * file's HEAD content and the modified side is its live content.
     */
    readonly vsCurrent?: boolean;
    /**
     * Diff mode only (#211): scope the file picker to these ids instead of
     * the commit's own changeset — so an uncommitted file that HEAD didn't
     * touch is still selectable (the dirty-set snapshot at open time).
     */
    readonly pickerFileIds?: readonly string[];
    /** Preview slot (italic, replaced by the next open). Promoted on double-click. */
    readonly preview?: boolean;
};
/**
 * A single tab group inside the shell. Groups are the unit the `SplitPane`
 * layout operates on — N groups render as N panes, each with its own tab
 * bar and active-tab content area.
 *
 * - `id` — stable group identifier; used as drag-drop target id and as the
 *   React reconciliation key.
 * - `tabs` — the ordered list of tabs hosted by this group. Order is
 *   preserved across drag-drop moves and splits. Empty groups are legal
 *   (the last tab was closed but the group remains) and render an empty
 *   state prompting the user to drop a tab.
 * - `activeTabId` — which tab is visible inside this group. `null` when
 *   the group is empty. Closing the active tab selects the next adjacent
 *   tab (previous if one exists, else first).
 * - `backgroundFileId` — id of the viz file pinned as this group's
 *   backdrop (promote-to-backdrop / `Cmd+K B`). Independent of
 *   `activeTabId` — the backdrop survives tab switches; the active
 *   editor renders on top. Absent when no backdrop is set. Field is
 *   the FILE id (not a tab id) so a single source of truth survives
 *   tab churn — tabs come and go, but the promoted file reference is
 *   durable.
 */
interface WorkspaceGroupState {
    readonly id: string;
    readonly tabs: readonly WorkspaceTab[];
    readonly activeTabId: string | null;
    readonly backgroundFileId?: string;
    /**
     * Per-pane backdrop opacity override (#350c). When set, this group's
     * backdrop renders at this opacity instead of the global
     * `getBackdropOpacity()` default. Absent → the global default applies.
     * Persisted user intent (survives reload), unlike the transient code
     * override — so it lives on the group snapshot.
     */
    readonly backdropOpacity?: number;
    /**
     * Per-pane backdrop quality override (#350c). When set, this group's
     * backdrop renders at this quality tier instead of the global
     * `getBackdropQuality()` default. Absent → the global default applies.
     */
    readonly backdropQuality?: BackdropQuality;
}
/**
 * Per-file runtime that wraps a `LiveCodingEngine`. Created by a
 * `LiveCodingRuntimeProvider.createEngine`-derived factory inside Task 09's
 * compat shims (and Task 10's app rewire). Owns the engine lifecycle for a
 * single workspace file id, publishes its component bag to the workspace
 * audio bus when playing, and unpublishes on stop / dispose.
 *
 * @remarks
 * ## What the runtime is, and is not
 *
 * - **Is** a strict passthrough wrapper around an engine plus the bus
 *   publish/unpublish wiring required to surface the engine's component
 *   bag to viz consumers and the EditorView (for inline view zones / S7).
 * - **Is** the elevation point for `BufferedScheduler` (S8) — when an
 *   engine ships streaming + audio without a native queryable, the
 *   runtime constructs a `BufferedScheduler` lazily on first `play()` and
 *   places it on the published payload's `scheduler` slot.
 * - **Is NOT** a place to install Pattern.prototype interception (PV2 / P2).
 *   All Strudel Pattern method wrappers are installed inside
 *   `StrudelEngine.evaluate()`'s setter trap and live nowhere else. The
 *   runtime never reads, writes, or proxies anything on `Pattern.prototype`.
 * - **Is NOT** a place to mutate `file.content` before evaluation (P1).
 *   The runtime passes the file content unchanged into `engine.evaluate`.
 *
 * ## Lifecycle (PK1 — STRICT)
 *
 * `play()` runs nine ordered steps with no React state writes interleaved
 * between `engine.evaluate()` resolving and `bus.publish()` firing:
 *
 *   1. `await engine.init()` if not already initialized.
 *   2. `await engine.evaluate(getFileContent())`.
 *   3. If `error` — fire `onError`, do not publish, do not call play.
 *   4. SYNCHRONOUSLY read `engine.components` (no awaits between here and
 *      step 7).
 *   5. Determine the queryable scheduler. Native if `components.queryable`,
 *      otherwise elevate via `BufferedScheduler` (S8).
 *   6. Build the `AudioPayload` with `hapStream`, `analyser`, `scheduler`,
 *      `inlineViz`, and the full `audio` slot.
 *   7. `workspaceAudioBus.publish(fileId, payload)` — subscribers fire SYNC.
 *   8. `engine.play()` — schedules audio.
 *   9. Fire `onPlayingChanged(true)`.
 *
 * The `publish` BEFORE `play` ordering matters: viz consumers and the
 * EditorView's inline-zone subscription must see the payload before the
 * first hap event fires. The `publish` AFTER `evaluate` ordering matters
 * even more: only after `evaluate` resolves does `engine.components`
 * contain the captured `inlineViz.vizRequests` for the current code.
 */
interface LiveCodingRuntime$1 {
    /** The wrapped engine. Owned by the runtime; never escapes. */
    readonly engine: LiveCodingEngine;
    /** Workspace file id this runtime publishes under on the audio bus. */
    readonly fileId: string;
    /**
     * Initialize the engine if it has not been initialized yet. Idempotent.
     * `play()` calls this internally; callers usually do not need to.
     */
    init(): Promise<void>;
    /**
     * Evaluate the current file content, publish the engine's component bag
     * to the bus under `fileId`, then start the engine. Returns the
     * evaluation error if any (also fires `onError` listeners). On error, the
     * payload is NOT published and `engine.play()` is NOT called.
     *
     * @returns `{ error: null }` on success; `{ error: Error }` if
     *   `engine.evaluate` returned an error or the runtime caught one
     *   bridging to the bus.
     */
    play(): Promise<{
        error: Error | null;
    }>;
    /**
     * Stop the engine and unpublish from the bus. Idempotent — calling
     * `stop()` twice is safe.
     */
    stop(): void;
    /**
     * Dispose the runtime — calls `stop()`, releases the
     * `BufferedScheduler` if one was elevated, and disposes the underlying
     * engine. After `dispose()`, the runtime is unusable.
     */
    dispose(): void;
    /**
     * Subscribe to runtime errors — fired by `play()` on evaluate failure
     * AND by the engine's runtime error handler (audio scheduling errors
     * after `play()` succeeded). Returns an idempotent unsubscribe function.
     * S7 — the EditorView subscribes to this for `setEvalError` markers,
     * the chrome subscribes for the error badge.
     */
    onError(cb: (err: Error) => void): () => void;
    /**
     * Subscribe to playing-state changes. Fires SYNC after `play()` succeeds
     * with `true`, after `stop()` with `false`. Returns an idempotent
     * unsubscribe function. The chrome subscribes to drive its
     * `isPlaying`-dependent rendering without prop-drilling.
     */
    onPlayingChanged(cb: (playing: boolean) => void): () => void;
    /**
     * Read the engine's current BPM, if extractable. The runtime parses
     * `setcps(...)` from the last evaluated code and converts to BPM
     * (Strudel) or returns `undefined` for engines that have no analogous
     * concept. Used by the chrome's BPM display (U8). Returns `undefined`
     * before the first successful `play()`.
     */
    getBpm(): number | undefined;
    /**
     * Current cycle position from the engine's pattern scheduler, or `null`
     * when the scheduler is unavailable (engine not initialized, transport
     * stopped, non-Strudel runtime). Used by the IR Inspector timeline
     * strip's tooltip to anchor each captured snapshot to musical time.
     * The tooltip falls back to wall-clock when this returns `null`.
     *
     * Phase 19-08 (#85). Mirrors `getBpm()` shape.
     */
    getCurrentCycle(): number | null;
    /**
     * Enable or disable live mode (auto-refresh). When enabled and the
     * runtime is playing, every file content change triggers a
     * debounced re-`play()` (which re-evaluates the current code) so
     * the audio stays in sync with the source as you type.
     *
     * No-op if the runtime was constructed without a `subscribeToFile`
     * function (the default in tests) — the flag is still set, but no
     * subscription is installed.
     */
    setAutoRefresh(enabled: boolean): void;
    /** Current live-mode flag. */
    isAutoRefreshEnabled(): boolean;
    /**
     * Subscribe to live-mode state changes. Fires after every
     * `setAutoRefresh` mutation with the new enabled value. Returns an
     * idempotent unsubscribe. Used by the chrome's live-mode toggle to
     * re-render without polling.
     */
    onAutoRefreshChanged(cb: (enabled: boolean) => void): () => void;
}
/**
 * Context object handed to `LiveCodingRuntimeProvider.renderChrome` on every
 * chrome render. The chrome is a React component (the provider's
 * `renderChrome` is itself a React functional component), so it can use
 * hooks to subscribe to `runtime.onError` / `runtime.onPlayingChanged` and
 * track its own `isPlaying` / `error` state — but for callers that already
 * have those values in scope (e.g., the compat shims that wire chrome from
 * outside the provider), passing them through the context avoids a second
 * subscription.
 *
 * Per CONTEXT D-07 + U8.
 */
interface ChromeContext {
    /** The living runtime instance. The chrome calls `runtime.play()` etc. */
    readonly runtime: LiveCodingRuntime$1;
    /** The workspace file the runtime serves. */
    readonly file: WorkspaceFile;
    /** Current playing state — sourced by the embedder. */
    readonly isPlaying: boolean;
    /** Current evaluation / runtime error, if any. */
    readonly error: Error | null;
    /**
     * Beats-per-minute display value. Built-in per U8 — the runtime extracts
     * BPM from the engine where available; the chrome only renders. May be
     * `undefined` if BPM is not yet known or is not applicable.
     */
    readonly bpm?: number;
    /** Play handler — usually `() => runtime.play()`. */
    onPlay(): void;
    /** Stop handler — usually `() => runtime.stop()`. */
    onStop(): void;
    /**
     * Optional embedder-injected extras (e.g., the export button surfaced by
     * the legacy `StrudelEditor` shim in Task 09). Rendered to the right of
     * the built-in transport controls. Per U8.
     */
    readonly chromeExtras?: ReactNode;
    /**
     * Current live-mode (autoRefresh) state for this runtime. When `true`,
     * the chrome renders the live toggle button in its active style. When
     * omitted, the chrome renders the toggle in its inactive style.
     *
     * Sourced by the embedder — the app layer typically mirrors
     * `runtime.isAutoRefreshEnabled()` into React state so changes re-render
     * the chrome. Provider chromes that subscribe to
     * `runtime.onAutoRefreshChanged` directly may ignore this field.
     */
    readonly autoRefresh?: boolean;
    /**
     * Toggle handler for live mode. When supplied, the chrome renders a
     * live-mode toggle button; when omitted, the button is hidden. This
     * lets embedders that don't want a live-mode button (tests, kiosk
     * displays) opt out cleanly.
     */
    readonly onToggleAutoRefresh?: () => void;
}
/**
 * Per-extension provider for executable file types. Owns engine creation
 * AND chrome rendering. Registered in the `liveCodingRuntimeRegistry` keyed
 * by extension. The shell never invokes a provider directly — Task 09's
 * compat shims and Task 10's app rewire instantiate runtimes from the
 * provider's `createEngine` and pass `renderChrome(ctx)` into
 * `WorkspaceShell.chromeForTab`.
 */
interface LiveCodingRuntimeProvider {
    /** Extensions this provider claims, including the leading dot. */
    readonly extensions: readonly string[];
    /** Workspace language id this provider corresponds to. */
    readonly language: WorkspaceLanguage;
    /** Factory for a fresh engine instance. The runtime owns disposal. */
    createEngine(): LiveCodingEngine;
    /**
     * Render the per-tab chrome for an editor of this language. Receives
     * the live runtime + state. Returns a `ReactNode` that the host
     * (Task 09 / Task 10) injects into `EditorView.chromeSlot`.
     */
    renderChrome(ctx: ChromeContext): ReactNode;
}
/**
 * Forward-compatible alias retained from Task 04. Resolves to the real
 * `LiveCodingRuntimeProvider` interface so any consumer that imported the
 * stub from the barrel keeps compiling without source changes.
 */
type LiveCodingRuntimeProviderStub = LiveCodingRuntimeProvider;
/**
 * Signature of the optional callback the shell uses to resolve per-tab
 * runtime chrome for editor-kind tabs. Task 05 will wire this through the
 * runtime provider registry so pattern-file editors receive a transport
 * bar. Task 04 accepts the callback as a prop and passes its return value
 * into `EditorView.chromeSlot`. Returning `undefined` (the default) means
 * "no chrome for this tab," which is the correct answer for viz / markdown
 * editors.
 */
type ChromeForTab = (tab: WorkspaceTab) => ReactNode | undefined;
/**
 * Props accepted by `WorkspaceShell`. The shell is uncontrolled — it
 * seeds group state from `initialTabs` on first mount and manages its own
 * layout state internally. Tab changes are broadcast via callbacks so
 * downstream host code (Task 08's command registry, Task 10's app page)
 * can observe without owning the state.
 *
 * @remarks
 * ## What the shell does NOT do (yet)
 *
 * - No `window.addEventListener('keydown', ...)` for Cmd+K V/B/W — Task
 *   08 adds that, using `onActiveTabChange` to know which tab the command
 *   should act on.
 * - No runtime provider instantiation — `runtimeProviders` is a typed
 *   slot for Task 05 / Task 07 to inject concrete providers. The shell
 *   never calls `createEngine`; it only passes the list to `chromeForTab`.
 * - No preview provider registry lookup — `previewProviders` is a slot
 *   for Task 06 to populate. Task 04 uses a single `previewProviderFor`
 *   callback to resolve the provider at render time so the shell is
 *   testable in isolation with a stub.
 * - No `Cmd+K B` background decoration rendering. The field is reserved
 *   on `WorkspaceGroupState.backgroundFileId` but Task 04 does not render
 *   anything based on it.
 */
interface WorkspaceShellProps {
    /**
     * Seed tabs for the shell on first mount. Splits into one initial group
     * holding every seed tab; the first tab becomes the active tab. The
     * shell does not re-read this prop after mount — changes to `initialTabs`
     * on re-render are ignored. Callers that need to add tabs later use
     * commands (Task 08) or the shell's imperative handle (future).
     */
    readonly initialTabs?: readonly WorkspaceTab[];
    /**
     * Theme applied to the shell root via `applyTheme()` on mount and on
     * every theme change. Defaults to `'dark'`. PV6 / P6 — every top-level
     * component owns its own theme application.
     */
    readonly theme?: WorkspaceTheme;
    /**
     * Explicit height for the shell root. Defaults to `'100%'` so the
     * shell fills whatever container the host mounts it in.
     */
    readonly height?: number | string;
    /**
     * Fires whenever the active tab changes — either because the user
     * clicked a different tab inside a group, or because the user
     * switched focus between groups. Task 08 listens so Cmd+K V/B/W can
     * dispatch against the currently-active tab.
     *
     * The callback fires with `null` when no tab is active (every group
     * is empty). Fires once on mount with the initial active tab (or
     * `null`) so late subscribers see the initial state.
     */
    /**
     * Persistence-friendly initial state. When provided, takes precedence
     * over `initialTabs` and seeds the shell's groups + 2-D pane layout +
     * active group id in one shot. Like `initialTabs` it is read exactly
     * once on mount.
     *
     * Issue #175 — lets the consumer hydrate from `tabPersistence` so the
     * user's pane splits + per-group tabs survive a refresh. If absent,
     * the shell falls back to the legacy single-group seed from
     * `initialTabs`.
     */
    readonly initialGroups?: ReadonlyMap<string, WorkspaceGroupState>;
    readonly initialLayout?: GroupLayout;
    readonly initialActiveGroupId?: string;
    /**
     * Fires reactively whenever the shell's groups / layout / activeGroupId
     * change — i.e. on tab open / close / reorder, group split / collapse,
     * active-tab change, active-group change, and `backgroundFileId`
     * transitions. The callback receives the full state snapshot in the
     * shape `tabPersistence.serializeShellState` expects, so the consumer
     * can pipe it straight through to localStorage / Yjs.
     *
     * Issue #175 — single sink for persistence. Does NOT fire on initial
     * mount (no-op write of just-hydrated state); only on subsequent
     * mutations.
     */
    readonly onGroupsChange?: (snapshot: {
        groups: ReadonlyMap<string, WorkspaceGroupState>;
        layout: GroupLayout;
        activeGroupId: string;
    }) => void;
    readonly onActiveTabChange?: (tab: WorkspaceTab | null) => void;
    /**
     * Fires when any group's `backgroundFileId` changes — either set
     * (pinned a file) or cleared (null). `groupId` identifies the
     * affected group. Used by the app to mirror backdrop state into
     * local React state (for the file-tree "Set ↔ Clear" label) and
     * to persist per-project. Fires once per real change; no initial-
     * state fire since an unset backdrop is the default.
     */
    readonly onBackgroundFileChange?: (groupId: string, fileId: string | null) => void;
    /**
     * Fires when the ACTIVE group's RESOLVED backdrop changes (#350a) — the code
     * override (`setBackgroundOverride`) if present, else the manual sticky. This
     * is "what is currently showing behind the active editor," for UI that must
     * reflect reality (the menubar bg indicator, the popover pinned-state). Unlike
     * `onBackgroundFileChange`, it is NOT a persistence signal — code overrides are
     * transient — so consumers must mirror it into UI state WITHOUT persisting.
     * Fires once per real change (ref-guarded); no per-eval churn for steady code.
     */
    readonly onActiveBackdropChange?: (fileId: string | null) => void;
    /**
     * #240 — open a viz file's preview in a pop-out browser window. The shell
     * forwards the Cmd+K W command (`workspace.openPreviewInWindow` →
     * `shell.openPopoutPreview(fileId)`) to this host callback; the app compiles
     * a descriptor + subscribes the audio bus and drives `usePopoutPreview`.
     * Optional: when the host omits it, Cmd+K W is a no-op (the command guards
     * on `shell.openPopoutPreview?.`).
     */
    readonly onOpenPopoutPreview?: (fileId: string) => void;
    /**
     * Crop region applied to the pinned backdrop — 0–1 fractional
     * `{x, y, w, h}`. Absent means render the full viz rect. The
     * shell's backdrop wrapper scales/positions its inner div so
     * only the cropped sub-rect fills the viewport, preserving the
     * quality-ladder transform math. Purely presentational; app
     * owns persistence via ProjectMeta.backgroundCrop.
     */
    readonly backgroundCrop?: {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
    } | null;
    /**
     * Fires when a tab is closed by the user. Runtime disposal hooks
     * (Task 05 / Task 07) plug in here to call `runtime.dispose()` on
     * the closed tab's pattern file. The callback receives the tab that
     * was just removed; the tab has already been dropped from the group
     * state by the time this fires.
     *
     * CONTEXT U3 — closing a pattern file's last editor tab MUST dispose
     * its runtime. Task 04 exposes the seam; Task 05 fills it in.
     */
    readonly onTabClose?: (closingTab: WorkspaceTab) => void;
    /**
     * Runtime providers available to the shell. Forward-declared slot
     * type — Task 05 will replace `LiveCodingRuntimeProviderStub` with
     * the concrete `LiveCodingRuntimeProvider` interface. Task 04 accepts
     * the array and only hands it to `chromeForTab` (the shell itself
     * never instantiates engines).
     */
    readonly runtimeProviders?: readonly LiveCodingRuntimeProviderStub[];
    /**
     * Callback the shell uses to look up a preview provider for a given
     * preview tab. Task 06 will ship the registry that wires the default
     * implementation; Task 04 accepts the callback directly so tests can
     * pass a stub provider. Returning `undefined` means "no provider
     * available" — the shell renders a fallback message in the preview
     * tab's content area.
     */
    readonly previewProviderFor?: (tab: WorkspaceTab & {
        kind: 'preview';
    }) => PreviewProvider | undefined;
    /**
     * Callback for resolving per-tab runtime chrome (transport bar for
     * pattern files). Task 05 fills this in with a lookup into
     * `runtimeProviders`. Task 04 calls the callback for every editor tab
     * and passes the return value into `EditorView.chromeSlot`. Returns
     * `undefined` by default — viz / markdown editors have no chrome.
     */
    readonly chromeForTab?: ChromeForTab;
    /**
     * Callback for resolving per-tab editor extras (play/stop keybindings,
     * error prop). The compat shim (LiveCodingEditor) returns
     * `{ onPlay, onStop, error }` for pattern-file tabs; the shell passes
     * them through to `EditorView`. Returns `undefined` for tabs that don't
     * need extras (viz, markdown).
     */
    readonly editorExtrasForTab?: (tab: WorkspaceTab & {
        kind: 'editor';
    }) => {
        onPlay?: () => void;
        onStop?: () => void;
        error?: Error | null;
    } | undefined;
    /**
     * Host callback for "save this file" — fires when the user presses
     * Cmd+S / Ctrl+S anywhere in the shell, or clicks the Save button on
     * the preview-provider's editor chrome (viz files). The shell owns the
     * keybinding + chrome wiring; the host owns what "save" actually means
     * for a given file type (e.g., `flushToPreset` for viz files backed by
     * `VizPresetStore`).
     *
     * Fires with the currently-active editor tab. The shell does nothing
     * if the active tab is a preview tab or no tab is active.
     */
    readonly onSaveFile?: (tab: WorkspaceTab & {
        kind: 'editor';
    }) => void;
    /**
     * Fires when the user right-clicks on a tab's chrome. Receives the
     * tab, viewport coords of the click, and a minimal set of handles
     * the listener can call back to close tabs or reveal them in the
     * host app's sidebar. Host apps typically render a context menu
     * positioned at (x, y) and call the handles.
     */
    readonly onTabContextMenu?: (tab: WorkspaceTab, x: number, y: number) => void;
    /** Inline viz "edit" icon clicked — navigate to the viz file. */
    readonly onEditViz?: (vizId: string) => void;
    /** Inline viz "crop" icon clicked — open crop popup. `trackKey` scopes
     *  the crop to this specific zone instance; see onCropViz above for the
     *  per-instance rationale. */
    readonly onCropViz?: (vizId: string, presetId: string | null, trackKey: string) => void;
}

/**
 * A user-authored visualization saved to IndexedDB.
 * Compiled to a VizDescriptor at runtime for use with .viz("name").
 */
interface CropRegion {
    /** Fractional offset from left (0–1). */
    x: number;
    /** Fractional offset from top (0–1). */
    y: number;
    /** Fractional width (0–1). */
    w: number;
    /** Fractional height (0–1). */
    h: number;
}
interface VizPreset {
    id: string;
    name: string;
    renderer: 'hydra' | 'p5' | 'glsl';
    code: string;
    requires: (keyof EngineComponents)[];
    createdAt: number;
    updatedAt: number;
    /** Optional crop region for inline viz display. Fractional 0–1 coords
     *  relative to the full canvas. When set, the inline zone shows only
     *  this sub-region (scaled to fill). */
    cropRegion?: CropRegion;
    /** Native canvas dimensions the sketch renders at. If absent, the
     *  default (1200×600) is used. Set this when your sketch calls
     *  createCanvas(W, H) with specific values you want the inline viz
     *  to respect — the crop region is interpreted in these coords. */
    nativeSize?: {
        w: number;
        h: number;
    };
}
/**
 * Reserved prefix for app-bundled demo presets. User-created IDs cannot
 * start with this — guaranteed by `generateUniquePresetId`'s sanitizer
 * which strips leading underscores.
 */
declare const BUNDLED_PREFIX = "__bundled_";
/**
 * Sanitize a display name into an ID-safe slug:
 *   "My Aurora!"  →  "my_aurora"
 *   "  spaces  "  →  "spaces"
 *   ""            →  "untitled"
 */
declare function sanitizePresetName(name: string): string;
/**
 * Build the ID for an app-bundled preset:
 *   bundledPresetId('Piano Roll', 'p5')  →  '__bundled_piano_roll_p5__'
 *
 * Bundled IDs never collide with user IDs because user IDs follow the
 * `<name>_<renderer>_v<N>` format and never start with `__`.
 */
declare function bundledPresetId(name: string, renderer: 'hydra' | 'p5' | 'glsl'): string;
/** True if this id was generated by `bundledPresetId`. */
declare function isBundledPresetId(id: string): boolean;
/**
 * Generate a unique user preset ID in the format `<name>_<renderer>_v<N>`,
 * where N is the smallest positive integer such that the resulting id is
 * not present in `existingIds`.
 *
 * Examples (with no collisions):
 *   ('Piano Roll',  'p5',    [])  →  'piano_roll_p5_v1'
 *   ('Piano Roll',  'hydra', [])  →  'piano_roll_hydra_v1'
 *
 * With collisions:
 *   ('Piano Roll',  'p5',    ['piano_roll_p5_v1'])  →  'piano_roll_p5_v2'
 */
declare function generateUniquePresetId(name: string, renderer: 'hydra' | 'p5' | 'glsl', existingIds: Iterable<string>): string;
declare const VizPresetStore: {
    getAll(): Promise<VizPreset[]>;
    get(id: string): Promise<VizPreset | undefined>;
    put(preset: VizPreset): Promise<void>;
    delete(id: string): Promise<void>;
};

/**
 * vizLanguages — the single home for the viz `language` ↔ renderer `kind`
 * correspondence.
 *
 * ## Why this module exists
 *
 * A workspace file's `language` (`'p5js' | 'hydra' | 'glsl'`) maps to a
 * concrete renderer `kind` (`'p5' | 'hydra' | 'glsl'`), and the inverse.
 * Before this module that correspondence was duplicated as inline ternaries
 * and `language === 'p5js' || 'hydra'` allow-list filters across ~13 call
 * sites in the editor and app packages. Adding the GLSL renderer kind (#287)
 * meant threading `'glsl'` through every one of them — and the easily-missed
 * sites were the **filters**: a union-widen forces the type system to make you
 * add a ternary arm, but an allow-list filter compiles fine while silently
 * excluding the new kind, so the feature just no-ops (P118 / PV88 — the
 * named-viz registration filter and the backdrop filters dropped `'glsl'`
 * invisibly to tsc + unit tests; found only by live observation).
 *
 * Consolidating into one helper means:
 *   - the allow-list (`VIZ_LANGUAGES`) has ONE definition every filter calls,
 *     so a new kind can't be silently dropped by a forgotten filter, and
 *   - the maps are exhaustive `Record`s keyed by the renderer union, so a new
 *     renderer kind is a compile error until every arm is added — the next
 *     kind is a 1-line change, not a 13-site scavenger hunt.
 *
 * @see PV88 (the consolidation target), P118 (the silent-drop trap).
 */

/**
 * The concrete renderer kind a viz file compiles to. Mirror of
 * `VizPreset['renderer']` — kept as a named alias so call sites read
 * intent rather than reaching into the preset shape.
 */
type VizRendererKind = VizPreset['renderer'];
/**
 * The workspace languages that compile to a viz renderer — THE single
 * allow-list. Every "is this a viz file?" filter must derive from this
 * (via {@link isVizLanguage}) so a new viz language can never be silently
 * excluded by a forgotten filter site.
 *
 * `satisfies` (not `as`) keeps each entry checked against
 * `WorkspaceLanguage` while preserving the literal tuple type.
 */
declare const VIZ_LANGUAGES: readonly ["p5js", "hydra", "glsl"];
/** Narrowing of `WorkspaceLanguage` to the viz languages. */
type VizLanguage = (typeof VIZ_LANGUAGES)[number];
/** True when `lang` is a viz language (compiles to a renderer). */
declare function isVizLanguage(lang: WorkspaceLanguage): lang is VizLanguage;
/**
 * The renderer kind a workspace `language` compiles to, or `null` when the
 * language is not a viz language. Callers that have already established a
 * viz file (e.g. via {@link isVizLanguage}) typically fall back to `'p5'`.
 */
declare function rendererForLanguage(lang: WorkspaceLanguage): VizRendererKind | null;
/** The workspace language a renderer kind authors as. */
declare function languageForRenderer(renderer: VizRendererKind): WorkspaceLanguage;

/**
 * injectedGlobals — the single, authoritative catalogue of the Stave-injected
 * globals a viz sketch may read, per renderer kind (#309).
 *
 * This is the SOURCE OF TRUTH for two surfaces:
 *   - the read-only "Stave Inputs" reference block shown above the viz editor
 *     (ShaderToy-style — see {@link formatStaveInputs}); and
 *   - the Monaco hover provider that shows a token's doc + live master value
 *     (see {@link injectedGlobalByToken} + the `live` field).
 *
 * Keeping ONE list means the docs surfaced to authors cannot drift from what is
 * actually injected by the compilers/builders (`buildStaveUniforms` for p5,
 * `buildHydraStaveBag` for hydra, the `UNIFORMS` + `STAVE_TRACK_API` strings for
 * glsl). When a new bus signal is added to those builders, add it here too — the
 * same PV54 additive-floor obligation, applied to the doc surface (PV94).
 *
 * SCOPE (deliberate, issue #309): Stave-exclusive globals ONLY. The full p5 /
 * hydra built-in API is NOT listed — authors know p5/hydra; what they can't
 * discover is what STAVE injects on top.
 *
 * WORKER-SAFE: pure data + string formatting, no DOM / no renderer imports.
 */

/**
 * How the hover provider reads a token's LIVE value from the GLOBAL MASTER bus
 * (issue #309 — master-only, no per-instance focus). `null`/absent ⇒ no live
 * value (structural handle like `stave.scheduler`, or a per-instance/non-numeric
 * token) → hover shows the doc only.
 */
type LiveSpec = {
    kind: 'scalar';
    read: MasterScalar;
} | {
    kind: 'array';
    read: MasterArray;
} | {
    kind: 'time';
};
/** Master-mix scalar signals readable live (all 0..1). */
type MasterScalar = 'rms' | 'bass' | 'mid' | 'treble' | 'keyVelocity' | 'env:uKick' | 'env:uSnare' | 'env:uHat' | 'env:uOpenHat' | 'env:uClap' | 'env:uRim' | 'env:uTom';
/** Master-mix array signals readable live. */
type MasterArray = 'fft' | 'wave';
/**
 * One catalogued entry. `decl` is the human declaration line shown in the block
 * (kind-specific syntax); `comment` is the trailing `// ...`; `tokens` are the
 * individual identifiers the hover provider matches a hovered word against.
 */
interface InjectedGlobal {
    /** Declaration as it reads in the block, e.g. `uniform float iTime;`. */
    readonly decl: string;
    /** Trailing comment (no leading `//`). */
    readonly comment: string;
    /** Identifiers under this entry, for hover word-match. */
    readonly tokens: readonly string[];
    /**
     * Section the entry belongs to in the reference block. Entries are listed in
     * group order; {@link formatStaveInputs} emits a `// — <group> —` header when
     * the group changes. Makes the one-namespace rule visible at a glance
     * (every signal lives on `sig` — `sig.kick` a number, `sig.fft` an array).
     */
    readonly group: string;
    /** Live-value source on the master bus, when the token carries one. */
    readonly live?: Partial<Record<string, LiveSpec>>;
}
/** The catalogue of Stave-injected globals for a renderer kind (issue #309). */
declare function injectedGlobals(kind: VizRendererKind): readonly InjectedGlobal[];
/**
 * Render the read-only "Stave Inputs" reference block — a ShaderToy-style aligned
 * `decl // comment` list. Comments are padded to a common column so the block
 * reads like ShaderToy's "Shader Inputs". Multi-line decls (hydra) align each
 * continuation line's comment too.
 */
declare function formatStaveInputs(kind: VizRendererKind): string;
/**
 * Look up the catalogue entry + the specific token a hovered WORD matches, for a
 * renderer kind. Returns `null` when the word is not a Stave-injected token.
 * (A bare word like `uKick` / `iTime` / `rms` is matched against every entry's
 * `tokens`; the first match wins — token sets are disjoint within a kind.)
 */
declare function injectedGlobalByToken(kind: VizRendererKind, word: string): {
    entry: InjectedGlobal;
    token: string;
    live: LiveSpec | null;
} | null;

/**
 * namedVizRegistry — runtime map of user-chosen viz names → descriptors.
 *
 * Lets users reference their own viz files from inline patterns by the
 * `VizPreset.name` they chose, alongside the built-in descriptors:
 *
 *     $: note("c e g").viz("Piano Roll")   // user-named preset
 *     $: note("c e g").viz("pianoroll")    // built-in descriptor
 *
 * @remarks
 * ## How it plugs into the resolver
 *
 * `resolveDescriptor` checks this registry first (exact-name match),
 * then falls through to the passed-in descriptor list (`DEFAULT_VIZ_
 * DESCRIPTORS` or any embedder override) and runs its existing
 * "append default renderer" / "prefix" fallbacks. Names registered
 * here shadow built-ins — if a user saves a preset literally called
 * `"pianoroll"`, their version wins inside `.viz("pianoroll")`.
 * That's the right default: user intent is closer to what the user
 * controls than what ships in the library.
 *
 * ## Who writes to the registry
 *
 * `vizPresetBridge.seedFromPreset` and `flushToPreset` compile the
 * preset via `compilePreset()` and call `registerNamedViz(preset.name,
 * descriptor)` — so every viz file the user opens or saves is
 * automatically available to inline `.viz("name")` without any manual
 * registration step.
 *
 * If the user renames a preset (future save-as UI), the old name is
 * unregistered and the new name is registered in the same transaction.
 * Until that UI lands, a preset rename is a no-op at the registry
 * level; the stale name keeps working until page reload. Acceptable
 * for Phase 10.2 MVP — there's no rename UI yet.
 *
 * ## Change notifications
 *
 * `onNamedVizChanged` lets consumers subscribe to register/unregister
 * events. Phase 10.2 doesn't wire this to anything, but it's in place
 * so a future Monaco completion provider can invalidate its suggestion
 * cache when the registry mutates.
 */

type Listener$6 = () => void;
/**
 * Register a descriptor under a user-chosen name. Idempotent — calling
 * twice with the same name + descriptor is a no-op and does not fire
 * listeners. Calling with a new descriptor for an existing name
 * replaces the entry (and fires listeners) so saves can update a
 * previously-registered viz in place.
 */
declare function registerNamedViz(name: string, descriptor: VizDescriptor): void;
/**
 * Unregister a name. Idempotent — unknown names are silent no-ops.
 * Fires listeners only when an entry is actually removed.
 */
declare function unregisterNamedViz(name: string): void;
/**
 * Look up a descriptor by name. Returns `undefined` if the name is not
 * registered. The resolver falls through to the built-in descriptor
 * list in that case.
 */
declare function getNamedViz(name: string): VizDescriptor | undefined;
/**
 * List every registered name in insertion order. Used by tests and by
 * a future Monaco completion provider that wants to surface every
 * user-defined viz name inside `.viz("...")` autocomplete.
 */
declare function listNamedVizNames(): string[];
/**
 * List every (name, descriptor) pair. Mostly useful for debugging and
 * for tests that want to assert the full registry contents.
 */
declare function listNamedVizEntries(): Array<[string, VizDescriptor]>;
/**
 * Subscribe to registry changes. Fires on any register/unregister
 * transition. Returns an idempotent unsubscribe function. Does not
 * fire synchronously on subscription — subscribers receive only
 * future changes.
 */
declare function onNamedVizChanged(cb: Listener$6): () => void;

/**
 * Worker-viz capability detection — the degrade-path scaffold for Phase B.
 *
 * Phase B moves viz `draw()` off the main thread into an OffscreenCanvas worker
 * (epic #228). Whether that is possible — and *how* the per-frame signal data
 * reaches the worker — depends on browser capabilities that vary by environment:
 *
 *   - `Worker` + `OffscreenCanvas` + `HTMLCanvasElement.transferControlToOffscreen`
 *     → worker rendering is possible at all.
 *   - `crossOriginIsolated` + `SharedArrayBuffer`
 *     → the zero-copy SAB signal transport is available (the measured optimization,
 *       gated behind the COOP/COEP header — see B-1 #239 / Q2 #237).
 *
 * B-1 (#239) confirmed by observation that the live COOP=same-origin +
 * COEP=credentialless header yields `crossOriginIsolated === true` (and that a
 * `window.open` popup inherits it). This module turns that runtime truth into a
 * single capability snapshot + a sensible default transport choice, so B-2/B-3
 * can pick SAB vs postMessage vs main-thread without re-probing globals ad hoc.
 *
 * Pure + environment-injectable → plain unit tests (no IDB/DOM — see the editor
 * "split pure logic from I/O" rule). The live app passes nothing and reads
 * `globalThis`.
 */
/**
 * How per-frame viz signal data crosses to the renderer.
 *
 * - `'sab'`         — worker render + zero-copy SharedArrayBuffer transport
 *                     (requires cross-origin isolation; the primary path).
 * - `'postmessage'` — worker render + transferable-ArrayBuffer postMessage
 *                     transport (no isolation needed; the required fallback for
 *                     non-isolated browsers, e.g. Safari).
 * - `'main-thread'` — no worker offload possible; render on the main thread with
 *                     today's `P5VizRenderer` / `HydraVizRenderer`.
 */
type VizTransport = 'sab' | 'postmessage' | 'main-thread';
interface WorkerVizCapabilities {
    /** COOP/COEP cross-origin isolation is active (gates SharedArrayBuffer). */
    crossOriginIsolated: boolean;
    /** `OffscreenCanvas` constructor exists. */
    hasOffscreenCanvas: boolean;
    /** `SharedArrayBuffer` constructor exists (still needs isolation to be useful). */
    hasSharedArrayBuffer: boolean;
    /** `HTMLCanvasElement.prototype.transferControlToOffscreen` exists. */
    canTransferControl: boolean;
    /** `Worker` constructor exists. */
    hasWorker: boolean;
    /** Worker rendering is possible at all (worker + offscreen + transfer). */
    canUseWorker: boolean;
    /** The default transport given these capabilities (see {@link VizTransport}). */
    transport: VizTransport;
}
/**
 * The subset of the global environment this module reads. Injectable so the
 * selection logic can be unit-tested across capability matrices without touching
 * the real `globalThis`.
 */
interface CapabilityEnv {
    crossOriginIsolated?: boolean;
    OffscreenCanvas?: unknown;
    SharedArrayBuffer?: unknown;
    Worker?: unknown;
    /** Stand-in for `HTMLCanvasElement` — we only probe for the transfer method. */
    HTMLCanvasElement?: {
        prototype?: {
            transferControlToOffscreen?: unknown;
        };
    };
}
/**
 * Derive worker-viz capabilities + the default transport from an environment.
 *
 * Transport policy (capability-derived, deliberately separate from any
 * load/quality policy B-6 may add):
 *   1. Can't offload (no worker / offscreen / transferControl) → `'main-thread'`.
 *   2. Isolated + SharedArrayBuffer                            → `'sab'`.
 *   3. Worker-capable but not isolated                         → `'postmessage'`.
 *
 * Note: PHASE-B-PLAN §4's conservative line ("fallback to main if
 * !crossOriginIsolated") collapses cases 2+3; the plan's transport section +
 * decision §1 are the refined intent — worker rendering works without isolation,
 * only SAB needs it, so a non-isolated browser still offloads via postMessage.
 * This function encodes the refined three-tier truth; a consumer that wants the
 * conservative behaviour can treat anything but `'sab'` as main-thread.
 */
declare function detectWorkerVizCapabilities(env?: CapabilityEnv): WorkerVizCapabilities;

/**
 * MainSignalSampler — samples the main-thread signal feed into a `SignalFrame`
 * each frame (Phase B / B-2). It is the MAIN-side half of the marshalling: it
 * does the work that is main-thread-bound (read `AnalyserNode` bytes, query the
 * scheduler, collect haps) so a worker `SignalBus` can run off those values.
 *
 * It mirrors exactly what `SignalBus` does on main today (P5VizRenderer __tick):
 *   - `now = scheduler.now()`
 *   - active events = `scheduler.query(now, now + ε)` (combined + per-track)
 *   - analyser bytes = `getByte{Frequency,TimeDomain}Data` per bound analyser
 *   - bumps = the haps that fired since the previous `sample()`
 *
 * No DOM/worker — it consumes the same structural types the bus does
 * (`BusAnalyser`, `IRPattern`, `HapStream`), so it unit-tests with plain stubs.
 */

/** The live inputs the sampler reads — the main-thread feed. All optional: any
 *  absent input degrades to the bus's zero (empty arrays / no events). */
interface SamplerInputs {
    /** Combined scheduler (`now()` + `query()`). */
    scheduler?: IRPattern | null;
    /** Per-track schedulers, SCHEDULER key space (`$0`/`d1` — TRAP §5). */
    trackSchedulers?: Map<string, IRPattern> | null;
    /** Master/combined-mix analyser. */
    masterAnalyser?: BusAnalyser | null;
    /** Per-track analysers, keyed the SAME as `trackSchedulers`. */
    trackAnalysers?: Map<string, BusAnalyser> | null;
}
/** Minimal HapStream surface the sampler subscribes to (structural — the bus
 *  uses the same `.on`/`.off` guard discipline). */
interface HapSubscribable {
    on(handler: (e: HapEvent) => void): void;
    off(handler: (e: HapEvent) => void): void;
}
declare class MainSignalSampler {
    private inputs;
    private seq;
    /** Haps accumulated since the last `sample()` (the envelope feed). */
    private pendingBumps;
    private boundStream;
    private readonly hapHandler;
    /** Rebind the live inputs (mirror the renderer's in-place rebind on
     *  re-evaluate). Pass `null`/absent for demo / IR-only mode. */
    bind(inputs: SamplerInputs): void;
    /** (Re)subscribe to a HapStream for the envelope feed. Off the old, on the new
     *  — so the bump feed survives a re-evaluate that swaps the stream (mirror
     *  P5VizRenderer.update). A partial stream (no `.on`) degrades to no feed. */
    bindHapStream(stream: HapSubscribable | null): void;
    /**
     * Produce one frame from the current inputs + the haps since the last call.
     * Drains the pending bumps (so each hap ships exactly once).
     *
     * `cache` (the shared frame pump, PV72) deduplicates the EXPENSIVE per-frame
     * work across every viz sampling in the same rAF tick: the analyser FFT read and
     * the scheduler query run ONCE per shared input object, not once per viz. It is
     * keyed by input-object IDENTITY, so two viz on DIFFERENT tracks (distinct
     * scheduler/analyser, viewZones.ts:341) don't false-share. Absent (unit tests /
     * pre-pump path) → every read runs locally, byte-identical to before.
     */
    sample(cache?: FrameSampleCache): SignalFrame;
    /** Unsubscribe + reset (renderer destroy). */
    dispose(): void;
    /** The next seq an `emptyFrame` should carry (test/demo helper). */
    emptyFrame(): SignalFrame;
}

/**
 * WorkerBusFeed — drives a (pure) `SignalBus` from `SignalFrame`s on the WORKER
 * side (Phase B / B-2). The worker bus is the SAME `SignalBus` class as on main;
 * this feed reconstructs the bus's three inputs from a transported frame and runs
 * the per-frame sequence, so `bus` yields the same readings as a main-fed bus.
 *
 * No DOM, no worker API, no transport — pure object plumbing over `SignalBus`'s
 * public seams. Lives equally happily in a unit test (parity gate) or the real
 * `viz-worker` (B-3).
 *
 *   analysers → byte-backed `BusAnalyser` stubs whose identity is STABLE across
 *               frames (keyed by analyser key) so `SignalBus`'s per-analyser
 *               scratch-buffer cache (WeakMap on the stub) keeps hitting.
 *   scheduler → a minimal `IRPattern` stub `{ now, query }` returning the frame's
 *               `now` + active events (the bus only calls those two — IRPattern.ts).
 *   bumps     → replayed into `bus.bump()` (the envelope feed).
 *
 * Per-frame order (the worker frame contract): replay bumps → `tick()` →
 * `refreshActive(now)` → `readAudio()`. `readAudio` MUST follow `refreshActive`
 * (SignalBus Slice-2 ordering — `audioFor` resolves a sound→track via the active
 * map). The reference main-bus in the parity gate is driven the same way.
 */

declare class WorkerBusFeed {
    readonly bus: SignalBus;
    /** Stable analyser stubs by key (`'master'` + track keys). */
    private readonly analysers;
    private lastSeq;
    constructor(aliasMap?: Record<string, string | string[]>);
    /** Push the merged alias map (the renderer reads impure settings on main and
     *  ships the map; the worker bus stays pure — mirrors P5VizRenderer). */
    setAliases(map: Record<string, string | string[]>): void;
    /**
     * Apply one frame: rebuild the bus's inputs from `frame`, replay bumps, then
     * run the per-frame sequence. Idempotent on a duplicate/stale `seq` (no-op) so
     * a dropped or repeated transport frame can't double-decay the envelope.
     * Returns `true` if the frame advanced state, `false` if skipped as stale.
     */
    applyFrame(frame: SignalFrame): boolean;
}

/**
 * SignalTransport — how a `SignalFrame` crosses main → worker each frame
 * (Phase B / B-2). Two interchangeable implementations behind one interface so
 * B-3 can render against the de-risked transport and B-4 can swap in SAB as the
 * measured optimization without touching the renderer:
 *
 *   - postMessage-transferable (THIS file) — the de-risked default + the required
 *     fallback for non-isolated browsers (Safari). Zero-copy for the analyser
 *     bytes via `transfer`; the small JSON envelope is structured-cloned.
 *   - SAB (B-2b) — zero-copy ring + double-buffer, gated on `crossOriginIsolated`.
 *
 * Structural over the channel (no `lib.dom` `Worker`/`Transferable` dependency —
 * the bus stays DOM-free, P12): a `FrameChannel` is anything with
 * postMessage/addEventListener, i.e. a `Worker` on main or `self`/`MessagePort`
 * in the worker.
 */

/** The minimal channel surface a postMessage transport needs (structural — a
 *  `Worker` on main, `self`/`MessagePort` on the worker). */
interface FrameChannel {
    postMessage(message: unknown, transfer: ArrayBuffer[]): void;
    addEventListener(type: 'message', handler: (ev: {
        data: unknown;
    }) => void): void;
    removeEventListener(type: 'message', handler: (ev: {
        data: unknown;
    }) => void): void;
}
/** MAIN side — ships frames into the worker. */
interface SignalTransportWriter {
    /** Send one frame. The analyser byte buffers are TRANSFERRED (zero-copy), so
     *  the frame is unusable on the sender afterwards (the sampler mints fresh
     *  arrays each frame — safe). */
    writeFrame(frame: SignalFrame): void;
    dispose(): void;
}
/** WORKER side — delivers frames to a consumer (e.g. `WorkerBusFeed.applyFrame`). */
interface SignalTransportReader {
    /** Register the per-frame consumer. Replaces any previous one. */
    onFrame(cb: (frame: SignalFrame) => void): void;
    dispose(): void;
}
/** Build the MAIN-side writer over a channel (the `Worker`). */
declare function createPostMessageWriter(channel: Pick<FrameChannel, 'postMessage'>): SignalTransportWriter;
/** Build the WORKER-side reader over a channel (`self`/`MessagePort`). Ignores
 *  non-frame messages (B-3 control messages share the channel). */
declare function createPostMessageReader(channel: Pick<FrameChannel, 'addEventListener' | 'removeEventListener'>): SignalTransportReader;

interface VizPanelProps {
    vizHeight?: number | string;
    hapStream: HapStream | null;
    analyser: AnalyserNode | null;
    scheduler: PatternScheduler | null;
    source: VizRendererSource;
}
declare function VizPanel({ vizHeight, hapStream, analyser, scheduler, source }: VizPanelProps): react_jsx_runtime.JSX.Element;

interface VizPickerProps {
    descriptors: VizDescriptor[];
    activeId: string;
    onIdChange: (id: string) => void;
    showVizPicker?: boolean;
    /** When provided, descriptors whose requires[] aren't met are disabled. */
    availableComponents?: (keyof EngineComponents)[];
}
declare function VizPicker({ descriptors, activeId, onIdChange, showVizPicker, availableComponents }: VizPickerProps): react_jsx_runtime.JSX.Element | null;

interface VizDropdownProps {
    descriptors: VizDescriptor[];
    activeId: string;
    onIdChange: (id: string) => void;
    onNewViz?: () => void;
    availableComponents?: (keyof EngineComponents)[];
}
/**
 * Grouped dropdown picker for viz modes — replaces the icon button bar.
 * Groups descriptors by renderer field. Custom presets marked with ★.
 */
declare function VizDropdown({ descriptors, activeId, onIdChange, onNewViz, availableComponents, }: VizDropdownProps): react_jsx_runtime.JSX.Element;

interface VizEditorProps {
    components: Partial<EngineComponents>;
    hapStream: HapStream | null;
    analyser: AnalyserNode | null;
    scheduler: PatternScheduler | null;
    onPresetSaved?: (preset: VizPreset) => void;
    height?: number | string;
    previewHeight?: number | string;
    /** Theme applied to the container — defaults to 'dark'. */
    theme?: 'dark' | 'light' | StrudelTheme;
}
declare function VizEditor({ components: _components, hapStream: _hapStream, analyser: _analyser, scheduler: _scheduler, onPresetSaved, height, previewHeight: _previewHeight, theme, }: VizEditorProps): react_jsx_runtime.JSX.Element | null;

/**
 * Compiles user-authored viz code into a VizDescriptor.
 *
 * Hydra code: evaluated in a function scope with the hydra synth
 *   object as `s` and a `stave` namespace mirroring the p5 convention:
 *     - `stave.scheduler` — IRPattern | null (combined pattern scheduler)
 *     - `stave.tracks`    — Map<trackId, IRPattern> (per-track)
 *   Sketches that reference only `s` keep working — the `stave` arg
 *   is additive. Uses `new Function()`.
 *
 * p5 code: evaluated as a full p5 sketch script. Users write real
 *   `function preload/setup/draw` declarations and access injected
 *   Stave-specific inputs via a single `stave` namespace global:
 *     - `stave.scheduler`  — PatternScheduler | null
 *     - `stave.analyser`   — AnalyserNode | null
 *     - `stave.hapStream`  — HapStream | null
 *   Legacy draw-body snippets (no `function draw` declaration) are
 *   auto-wrapped for backwards compatibility.
 */
declare function compilePreset(preset: VizPreset): VizDescriptor;

/**
 * Shared imperative utility for the PICKER (`useVizRenderer`/`VizPanel`), BACKDROP
 * (`compiledVizProvider`) and CROP preview (`CropPopup`) seams: resolves a
 * VizRenderer, runs the shared per-mount lifecycle (mount + visibility pausing) via
 * `attachVizLifecycle`, and ADDS a ResizeObserver (this seam's container is sized
 * by CSS/layout, so a generic ResizeObserver is the right resize trigger here).
 *
 * NOT the inline `.viz()` path — `viewZones.ts` does its OWN mount (Monaco-layout
 * reflow, teardown-wrap, crop, decorations) and calls `attachVizLifecycle`
 * DIRECTLY. The single shared choke point for the mount+visibility concern-class
 * is `attachVizLifecycle`, NOT this function (P107: don't claim callers you don't
 * have — `viewZones` is not one).
 *
 * Returns the renderer instance and a disconnect function that tears down BOTH the
 * ResizeObserver and the visibility registration.
 */
declare function mountVizRenderer(container: HTMLDivElement, source: VizRendererSource, components: Partial<EngineComponents>, size: {
    w: number;
    h: number;
}, onError: (e: Error) => void): {
    renderer: VizRenderer;
    disconnect: () => void;
};

interface PopoutPreviewProps {
    descriptor: VizDescriptor | null;
    hapStream: HapStream | null;
    analyser: AnalyserNode | null;
    scheduler: PatternScheduler | null;
    onClose: () => void;
    theme?: 'dark' | 'light';
}
/**
 * Opens a pop-out browser window with the viz canvas.
 * Audio data is pumped via postMessage since the pop-out window
 * doesn't share the AudioContext.
 */
declare function usePopoutPreview({ descriptor, hapStream, analyser, scheduler, onClose, theme, }: PopoutPreviewProps): {
    cleanup: () => void;
};

/**
 * profiler — a zero-cost-when-disabled runtime performance profiler.
 *
 * WHY (issue #228): we want to optimize viz smoothness / main-thread budget /
 * scheduler latency, but had NO instrumentation — optimizing on inference, not
 * observation. This module measures the real per-frame cost so the next
 * optimization is chosen from data (OBSERVE before optimize).
 *
 * ## What it measures
 *   - SECTIONS: named timed spans (`p5.bus`, `hydra.draw`, …) → ring-buffer of
 *     the last N durations with count / mean / p50 / p95 / p99 / max / last.
 *   - FRAMES: per-instance inter-frame interval → fps + dropped-frame count
 *     (a frame > 2× the running median interval counts as a drop).
 *   - COUNTERS: monotone or live counts (`viz.p5` live instances,
 *     `audio.triggers` cumulative) — rate is derived in the snapshot.
 *   - LONGTASKS: `PerformanceObserver({entryTypes:['longtask']})` — main-thread
 *     blocks > 50ms the platform reports, which is exactly scheduler-vs-viz
 *     contention.
 *
 * ## Cost when disabled
 * Every hot-path method early-returns on `!this._enabled` BEFORE any allocation
 * or `performance.now()` call — the cost is one boolean branch. `enabled` is a
 * field read, not a getter, so it's a plain load. Instrumentation can therefore
 * live on the per-frame path unconditionally.
 *
 * ## Purity boundary
 * The SignalBus stays PURE (P12 / PV65) — it does NOT import this module.
 * Renderers (which already import settings/p5/hydra) call the profiler and wrap
 * the bus calls. The profiler itself imports nothing app-specific.
 *
 * ## Enabling
 *   - `globalThis.__STAVE_PERF__ === true` at module load (e2e / automation), OR
 *   - `Profiler.setEnabled(true)` at runtime (the overlay toggle / a setting).
 * When in a browser, `window.__stavePerf` exposes snapshot/reset/setEnabled so a
 * Playwright run can flip it on, drive a patch, and read the numbers.
 */
/** Aggregated stats for one section over its ring buffer. */
interface SectionStats {
    /** Total samples recorded since reset (NOT capped at RING). */
    count: number;
    /** Mean of the retained ring (ms). */
    mean: number;
    /** Median of the retained ring (ms). */
    p50: number;
    /** 95th percentile of the retained ring (ms). */
    p95: number;
    /** 99th percentile of the retained ring (ms). */
    p99: number;
    /** Max of the retained ring (ms). */
    max: number;
    /** Most recent sample (ms). */
    last: number;
}
/** Per-instance frame stats. */
interface FrameStats {
    /** Frames recorded since reset. */
    count: number;
    /** Frames/sec from the median inter-frame interval (0 if < 2 frames). */
    fps: number;
    /** Median inter-frame interval (ms). */
    p50: number;
    /** 95th-percentile inter-frame interval (ms) — the stutter tail. */
    p95: number;
    /** Frames whose interval exceeded DROP_FACTOR × running median (VARIANCE). */
    drops: number;
    /** Frames whose interval exceeded SLOW_FRAME_MS (<30fps) — the ABSOLUTE floor.
     *  Catches a uniformly-slow cadence that `drops` misses (every frame equally
     *  slow ⇒ 0 drops but many slowFrames). */
    slowFrames: number;
}
/** A full point-in-time read of the profiler. */
interface PerfSnapshot {
    enabled: boolean;
    /** ms since the profiler was first enabled / last reset. */
    uptimeMs: number;
    sections: Record<string, SectionStats>;
    frames: Record<string, FrameStats>;
    /** Cumulative counters since reset (e.g. `audio.triggers`) — rate = value/uptime. */
    counters: Record<string, number>;
    /** Live gauges — current state (e.g. `viz.p5` mounted instances). NOT cleared
     *  by reset(), because they represent what's live NOW, not accumulated samples. */
    gauges: Record<string, number>;
    longtasks: {
        count: number;
        totalMs: number;
        maxMs: number;
    };
}
declare class Profiler {
    /** Plain field (not a getter) so the hot-path branch is a bare load. */
    private _enabled;
    private startTs;
    private readonly sections;
    private readonly frames;
    private readonly counters;
    /** Live gauges (current-state counts) — survive reset(), unlike counters. */
    private readonly gauges;
    /** Open spans for begin()/end() keyed by label — last-write-wins (a label
     *  isn't expected to nest with itself within a frame). */
    private readonly open;
    private longtaskCount;
    private longtaskTotalMs;
    private longtaskMaxMs;
    private ltObserver;
    get enabled(): boolean;
    /** Turn profiling on/off. Enabling (re)starts the longtask observer and
     *  stamps the uptime origin; disabling tears the observer down so a disabled
     *  profiler has no live platform hook. Idempotent. */
    setEnabled(on: boolean): void;
    private startLongtaskObserver;
    /** Record a section duration directly (ms). Cheap no-op when disabled. */
    record(name: string, ms: number): void;
    /** Open a span. Pair with `end(name)`. No-op when disabled. */
    begin(name: string): void;
    /** Close a span opened by `begin(name)` and record its duration. No-op when
     *  disabled or when no matching open span exists. */
    end(name: string): void;
    /** Time a synchronous function and record it under `name`. Returns the fn's
     *  result. When disabled, calls the fn with no timing overhead. The fn runs
     *  even if disabled (it's the real work, not just measurement). */
    time<T>(name: string, fn: () => T): T;
    /** Record a rendered frame for an instance (e.g. `'p5#3'`). No-op when
     *  disabled. */
    frame(instanceId: string): void;
    /** Forget an instance's frame history (on renderer destroy) so a dead viz
     *  doesn't linger in the snapshot. No-op when disabled. */
    dropFrames(instanceId: string): void;
    /** Add to a CUMULATIVE counter (reset() clears it; rate = value/uptime). */
    inc(name: string, by?: number): void;
    dec(name: string, by?: number): void;
    /** Adjust a LIVE GAUGE (current-state count, e.g. mounted viz instances).
     *  Gauges survive reset() — they reflect what's live now, not samples.
     *  Use +1 on mount, -1 on destroy. */
    gauge(name: string, delta: number): void;
    snapshot(): PerfSnapshot;
    /** Clear all samples/counters but keep the enabled state + observer. Use to
     *  start a clean measurement window (e.g. before driving a heavy patch). */
    reset(): void;
}
/** The process-wide profiler singleton. Import and call directly:
 *  `perf.frame('hydra#1')`, `perf.time('hydra.draw', () => hydra.tick())`. */
declare const perf: Profiler;

interface SplitPaneProps {
    direction: 'horizontal' | 'vertical';
    children: React__default.ReactNode[];
    /** Initial sizes as percentages (must sum to 100). Defaults to equal splits. */
    initialSizes?: number[];
    /** Minimum size in pixels for each pane. */
    minSize?: number;
}
/**
 * Zero-dependency resizable split pane. Supports N children with
 * draggable dividers between each pair.
 */
declare function SplitPane({ direction, children, initialSizes, minSize, }: SplitPaneProps): react_jsx_runtime.JSX.Element;

/**
 * Bundled p5 viz source code — single source of truth.
 *
 * These strings power both:
 *   - `DEFAULT_VIZ_DESCRIPTORS` (the viz picker / demo / standalone
 *     embedders), compiled via `compileP5Code`.
 *   - The bundled `preset/viz/*.p5` workspace files seeded by the app
 *     template, which re-export these constants for backwards-compat.
 *
 * Until #184 (PR retiring the 7 TS sketch classes that previously powered
 * the picker), the picker rendered a different — richer or poorer — copy
 * of each viz than what users edited in the preset file. PV56 demands the
 * picker code path === the preset file code path; this module is that path.
 */
declare const PIANOROLL_P5_CODE = "// Stave p5 viz \u2014 Piano Roll\n// stave.scheduler, stave.analyser, stave.hapStream, stave.options are injected\n// globals. Fold-by-pitch lanes: each distinct pitch (or unpitched sound) gets\n// its own lane, sorted low\u2192high, so notes never overlap and the melodic\n// contour reads as a staircase. Notes scroll across a 4-cycle window; the\n// playhead sits at the half mark.\n//\n// Honours a subset of @strudel/draw's .pianoroll(options) vocabulary via\n// stave.options \u2014 defaults (no options) reproduce Stave's classic look:\n//   cycles, playhead, vertical, labels, flipTime, flipValues, fold,\n//   minMidi, maxMidi, autorange, fill, fillActive, strokeActive,\n//   active, inactive, background, playheadColor.\n\n// Drum/percussion sound-name prefixes for color classification.\nconst DRUM_PREFIXES = ['bd', 'sd', 'hh', 'rim', 'cp', 'cy', 'lt', 'mt', 'ht', 'oh', 'cl']\n\nfunction isDrum(s) {\n  return DRUM_PREFIXES.some(p => s === p || (s.startsWith(p) && /\\d/.test(s[p.length] || '')))\n}\n\n// Note NAME \u2192 MIDI. Returns null for unparseable names (octaveless or\n// sample names) \u2014 the caller folds those onto string lanes instead.\nfunction noteToMidi(n) {\n  if (typeof n === 'number') return Math.round(n)\n  if (typeof n !== 'string') return null\n  const m = n.toLowerCase().match(/^([a-g])(b|#)?(-?\\d+)$/)\n  if (!m) return null\n  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1]]\n  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0\n  return (parseInt(m[3]) + 1) * 12 + base + acc\n}\n\n// Fold-grouping key: a MIDI number for pitched haps, a \"_sound\" string for\n// unpitched ones. Priority mirrors how Strudel fills a hap (freq is\n// pre-computed from note, so note(\"c e g\") resolves via freq, never NaN).\nfunction valueOf(h) {\n  if (typeof h.freq === 'number') return Math.round(12 * Math.log2(h.freq / 440) + 69)\n  if (typeof h.note === 'number') return h.note\n  if (typeof h.note === 'string') {\n    const mi = noteToMidi(h.note)\n    return mi !== null ? mi : '_' + h.note\n  }\n  if (h.s) return '_' + h.s\n  return 0\n}\n\n// Default label text for a hap (note name, else sound[:n]).\nfunction labelOf(h) {\n  if (typeof h.note === 'string') return h.note\n  if (typeof h.note === 'number') return String(h.note)\n  if (h.s) return h.s + (h.n != null ? ':' + h.n : '')\n  return ''\n}\n\nfunction parseHex(hex) {\n  const s = String(hex).replace('#', '')\n  if (s.length === 6) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]\n  if (s.length === 3) return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)]\n  return null\n}\n\n// Explicit hap color wins; else classify by sound family.\nfunction colorOf(h) {\n  if (h.color) { const c = parseHex(h.color); if (c) return c }\n  const s = h.s || ''\n  if (isDrum(s)) return [249, 115, 22]        // drums  \u2014 orange\n  if (s.startsWith('bass')) return [6, 182, 212]   // bass  \u2014 cyan\n  if (s.startsWith('pad')) return [16, 185, 129]   // pad   \u2014 green\n  return [139, 92, 246]                        // melody \u2014 purple\n}\n\nconst num = (v, d) => (typeof v === 'number' && !isNaN(v) ? v : d)\n\nfunction setup() {\n  createCanvas(stave.width, stave.height)\n  noStroke()\n}\n\nfunction draw() {\n  const W = width, H = height\n  const O = (stave.options && typeof stave.options === 'object') ? stave.options : {}\n\n  // \u2500\u2500 options (defaults match @strudel/draw's pianoroll). fold defaults ON\n  // (strudel.cc's real default, __pianoroll fold=1): distinct pitches pack into\n  // CONTIGUOUS adjacent lanes \u2014 no empty rows between non-adjacent semitones.\n  // The landscape note look comes from the wide/short native surface (#214),\n  // NOT from fold:0. fold:0 (opt-in) spaces notes by absolute MIDI, which shows\n  // gaps at the missing semitones (use with autorange for a tight range). \u2500\u2500\n  const CYCLES = num(O.cycles, 4)\n  const PLAYHEAD = num(O.playhead, 0.5)\n  const vertical = !!O.vertical\n  const labels = !!O.labels\n  const flipTime = !!O.flipTime\n  const flipValues = !!O.flipValues\n  const useFold = O.fold == null ? true : !!O.fold\n  const autorange = !!O.autorange\n  const inactiveFilled = O.fill == null ? true : !!O.fill\n  const activeFilled = O.fillActive == null ? true : !!O.fillActive   // Stave default: filled glow\n  const activeStroked = O.strokeActive == null ? true : !!O.strokeActive\n  const activeOverride = typeof O.active === 'string' ? parseHex(O.active) : null\n  const inactiveOverride = typeof O.inactive === 'string' ? parseHex(O.inactive) : null\n  const bg = typeof O.background === 'string' ? parseHex(O.background) : null\n  const playheadCol = typeof O.playheadColor === 'string' ? parseHex(O.playheadColor) : null\n\n  if (bg) background(bg[0], bg[1], bg[2]); else clear()\n\n  const sched = stave.scheduler\n  if (!sched) return\n  let now\n  try { now = sched.now() } catch (e) { return }\n\n  const from = now - CYCLES * PLAYHEAD\n  const to = now + CYCLES * (1 - PLAYHEAD)\n  const ext = to - from\n  let haps\n  try { haps = sched.query(from, to) } catch (e) { haps = [] }\n\n  // Distinct values (for fold lanes / autorange), sorted low\u2192high.\n  const seen = new Set(), vals = []\n  for (const h of haps) { const v = valueOf(h); if (!seen.has(v)) { seen.add(v); vals.push(v) } }\n  vals.sort((a, b) => {\n    if (typeof a === 'number' && typeof b === 'number') return a - b\n    if (typeof a === 'number') return -1\n    if (typeof b === 'number') return 1\n    return String(a).localeCompare(String(b))\n  })\n\n  // Value-axis slotting: fold (one slot per distinct value) OR absolute MIDI\n  // range (minMidi..maxMidi, optionally autoranged from the numeric values).\n  const numericVals = vals.filter(v => typeof v === 'number')\n  let minMidi = num(O.minMidi, 10), maxMidi = num(O.maxMidi, 90)\n  if (autorange && numericVals.length) { minMidi = Math.min(...numericVals); maxMidi = Math.max(...numericVals) }\n  const foldCount = Math.max(1, vals.length)\n  const absExtent = Math.max(1, maxMidi - minMidi + 1)\n  const slotCount = useFold ? foldCount : absExtent\n\n  // slotFromTop: 0 = top of the value axis (high pitch up).\n  const slotFromTop = (h) => {\n    const v = valueOf(h)\n    let s\n    if (useFold) { const lane = vals.indexOf(v); s = lane < 0 ? -1 : foldCount - 1 - lane }\n    else if (typeof v === 'number') s = maxMidi - v\n    else s = absExtent - 1 // unpitched sounds sit at the bottom in absolute mode\n    if (s < 0 || s >= slotCount) return -1\n    return flipValues ? slotCount - 1 - s : s\n  }\n\n  const timeAxis = vertical ? H : W\n  const valueAxis = vertical ? W : H\n  const barSize = valueAxis / slotCount\n\n  noStroke()\n  for (const h of haps) {\n    const sft = slotFromTop(h)\n    if (sft < 0) continue\n    let tp = (h.begin - from) / ext            // 0..1 along the time axis\n    if (flipTime) tp = 1 - tp\n    const tPx = tp * timeAxis\n    const durPx = Math.max(2, ((h.end - h.begin) / ext) * timeAxis)\n    const vPx = (sft / slotCount) * valueAxis\n    const endC = h.endClipped != null ? h.endClipped : h.end\n    const active = h.begin <= now && endC > now\n    const gain = Math.min(1, Math.max(0.1, h.gain == null ? 1 : h.gain))\n    const vel = Math.min(1, Math.max(0.1, h.velocity == null ? 1 : h.velocity))\n    const alpha = gain * vel\n    let col = colorOf(h)\n    if (active && activeOverride) col = activeOverride\n    else if (!active && inactiveOverride) col = inactiveOverride\n    const [r, g, b] = col\n\n    // rect coords \u2014 horizontal: time\u2192x, value\u2192y; vertical: time\u2192y, value\u2192x.\n    const rx = vertical ? vPx : tPx - (flipTime ? durPx : 0)\n    const ry = vertical ? tPx - (flipTime ? 0 : durPx) : vPx\n    const rw = vertical ? barSize : durPx\n    const rh = vertical ? durPx : barSize\n\n    if (active) {\n      if (activeFilled) {\n        // Brightened toward white unless an explicit active color was given.\n        if (activeOverride) fill(r, g, b, alpha * 255)\n        else fill(min(255, r + 60), min(255, g + 60), min(255, b + 60), alpha * 255)\n        rect(rx, ry + 1, rw - 2, rh - 2)\n      }\n      if (activeStroked) {\n        noFill(); stroke(255, 255, 255, 220); strokeWeight(1)\n        rect(rx, ry + 1, rw - 2, rh - 2); noStroke()\n      }\n    } else if (inactiveFilled) {\n      fill(r, g, b, alpha * 180)\n      rect(rx, ry + 1, rw - 2, rh - 2)\n    }\n\n    if (labels) {\n      const txt = labelOf(h)\n      if (txt) {\n        const fs = Math.min(14, Math.max(7, rh * 0.7))\n        noStroke(); fill(active ? 255 : 230); textSize(fs); textAlign(LEFT, TOP)\n        text(txt, rx + 2, ry + 1)\n      }\n    }\n  }\n\n  // Playhead line at the PLAYHEAD mark of the time axis.\n  const phc = playheadCol || [255, 255, 255]\n  stroke(phc[0], phc[1], phc[2], 128); strokeWeight(1)\n  if (vertical) line(0, PLAYHEAD * H, W, PLAYHEAD * H)\n  else line(PLAYHEAD * W, 0, PLAYHEAD * W, H)\n  noStroke()\n}";
declare const SCOPE_P5_CODE = "// Stave p5 viz \u2014 Scope (oscilloscope / event pulses)\n// PERF: one reused buffer (re-alloc only on size change) \u2014 never allocate per draw().\nlet _wave = null\nfunction setup() {\n  createCanvas(stave.width, stave.height)\n  noFill()\n}\nfunction draw() {\n  clear()\n  stroke(40, 50, 70); strokeWeight(0.5)\n  line(0, height * 0.5, width, height * 0.5)\n  if (stave.analyser) {\n    const buf = stave.analyser.frequencyBinCount\n    if (!_wave || _wave.length !== buf) _wave = new Float32Array(buf)\n    const data = _wave\n    stave.analyser.getFloatTimeDomainData(data)\n    let trig = 0\n    for (let i = 1; i < buf; i++) { if (data[i-1] > 0 && data[i] <= 0) { trig = i; break } }\n    stroke('#75baff'); strokeWeight(2); beginShape()\n    for (let i = trig; i < buf; i++) vertex((i - trig) * width / (buf - trig), (0.5 - 0.25 * data[i]) * height)\n    endShape()\n  } else if (stave.scheduler) {\n    const now = stave.scheduler.now()\n    const haps = stave.scheduler.query(now - 4, now + 0.1)\n    noStroke()\n    for (const h of haps) {\n      const age = now - h.begin, decay = max(0, 1 - age / 4)\n      const x = ((h.begin - now + 4) / 4) * width\n      const w = max(3, ((h.end - h.begin) / 4) * width)\n      const pH = height * 0.6 * decay * (h.gain ?? 1)\n      fill(117, 186, 255, decay * 200)\n      rect(x, height * 0.5 - pH / 2, w, pH, 2)\n    }\n  }\n}";
declare const FSCOPE_P5_CODE = "// Stave p5 viz \u2014 Frequency Scope (FFT bars / note bars)\n// PERF: one reused buffer (re-alloc only on size change) \u2014 never allocate per draw().\nlet _freq = null\nfunction setup() {\n  createCanvas(stave.width, stave.height)\n  noStroke()\n}\n// Hz from a hap \u2014 Strudel leaves note as a NAME string and freq null until\n// superdough renders, so parse the note name to MIDI ourselves.\nfunction hapFreq(h) {\n  if (typeof h.freq === 'number') return h.freq\n  let n = h.note\n  if (typeof n === 'string') {\n    const m = n.toLowerCase().match(/^([a-g])(b|#)?(-?\\d+)$/)\n    if (!m) return null\n    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1]]\n    n = (parseInt(m[3]) + 1) * 12 + base + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0)\n  }\n  if (typeof n !== 'number') return null\n  return 440 * pow(2, (n - 69) / 12)\n}\nfunction draw() {\n  clear()\n  stroke(40, 50, 70); strokeWeight(0.5); noFill()\n  line(0, height * 0.75, width, height * 0.75); noStroke()\n  if (stave.analyser) {\n    const buf = stave.analyser.frequencyBinCount\n    if (!_freq || _freq.length !== buf) _freq = new Float32Array(buf)\n    const data = _freq\n    stave.analyser.getFloatFrequencyData(data)\n    fill('#75baff')\n    const sw = width / buf\n    for (let i = 0; i < buf; i++) {\n      const n = constrain((data[i] + 100) / 100, 0, 1), v = n * 0.25\n      rect(i * sw, (0.75 - v * 0.5) * height, max(sw, 1), v * height)\n    }\n  } else if (stave.scheduler) {\n    const now = stave.scheduler.now()\n    const haps = stave.scheduler.query(now - 0.2, now + 0.05)\n    const bins = new Float32Array(64)\n    for (const h of haps) {\n      const freq = hapFreq(h)\n      if (freq == null) continue\n      if (freq < 30) continue\n      const idx = constrain(floor(log(freq / 30) / log(4000 / 30) * 64), 0, 63)\n      bins[idx] = max(bins[idx], max(0, 1 - (now - h.begin) / 0.5) * (h.gain ?? 1))\n    }\n    const sw = width / 64\n    for (let i = 0; i < 64; i++) {\n      if (bins[i] <= 0) continue\n      const v = bins[i] * 0.25\n      fill(117, 186, 255, bins[i] * 220)\n      rect(i * sw, (0.75 - v * 0.5) * height, max(sw - 1, 1), v * height)\n    }\n  }\n}";
declare const SPECTRUM_P5_CODE = "// Stave p5 viz \u2014 Spectrum (scrolling waterfall)\n// The waterfall scrolls by reading back the PREVIOUS frame (getImageData \u2192\n// putImageData(-2,0)). That needs the drawing surface to PERSIST across frames \u2014\n// but in the worker the Tier-2 present transferToImageBitmap()s (and CLEARS) the\n// main canvas every frame, so reading the MAIN canvas back yields nothing (#306).\n// Own a persistent OffscreenCanvas buffer (_wf) instead: scroll it (cheap, one\n// column/frame), then blit it to the main canvas each frame. _wf is never\n// transferred, so history accumulates. OffscreenCanvas is native in the worker AND\n// on the main thread, so this renders identically on both (no p5.Graphics, whose\n// HTMLCanvasElement instanceof checks are undefined in the worker shim).\nlet _freq = null\nlet _wf = null, _wctx = null\nfunction _ensureBuf(w, h) {\n  if (_wf && _wf.width === w && _wf.height === h) return\n  const old = _wf\n  _wf = new OffscreenCanvas(max(1, w), max(1, h))\n  _wctx = _wf.getContext('2d')\n  if (old && _wctx) { try { _wctx.drawImage(old, 0, 0) } catch (e) {} }\n}\nfunction setup() {\n  createCanvas(stave.width, stave.height)\n  pixelDensity(1); noStroke()\n  _ensureBuf(width, height)\n}\n// Hz from a hap \u2014 Strudel leaves note as a NAME string and freq null until\n// superdough renders, so parse the note name to MIDI ourselves.\nfunction hapFreq(h) {\n  if (typeof h.freq === 'number') return h.freq\n  let n = h.note\n  if (typeof n === 'string') {\n    const m = n.toLowerCase().match(/^([a-g])(b|#)?(-?\\d+)$/)\n    if (!m) return null\n    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1]]\n    n = (parseInt(m[3]) + 1) * 12 + base + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0)\n  }\n  if (typeof n !== 'number') return null\n  return 440 * pow(2, (n - 69) / 12)\n}\nfunction draw() {\n  _ensureBuf(width, height)\n  const ctx = _wctx\n  if (!ctx) { clear(); return }\n  if (stave.analyser) {\n    const buf = stave.analyser.frequencyBinCount\n    if (!_freq || _freq.length !== buf) _freq = new Float32Array(buf)\n    const data = _freq\n    stave.analyser.getFloatFrequencyData(data)\n    const img = ctx.getImageData(0, 0, width, height)\n    ctx.clearRect(0, 0, width, height)\n    ctx.putImageData(img, -2, 0)\n    ctx.fillStyle = '#75baff'\n    for (let i = 0; i < buf; i++) {\n      const n = constrain((data[i] + 80) / 80, 0, 1)\n      if (n <= 0) continue\n      ctx.globalAlpha = n\n      const yEnd = (log(i + 1) / log(buf)) * height\n      const yStart = i > 0 ? (log(i) / log(buf)) * height : 0\n      ctx.fillRect(width - 2, height - yEnd, 2, max(2, yEnd - yStart))\n    }\n    ctx.globalAlpha = 1\n  } else if (stave.scheduler) {\n    const now = stave.scheduler.now()\n    const img = ctx.getImageData(0, 0, width, height)\n    ctx.clearRect(0, 0, width, height)\n    ctx.putImageData(img, -2, 0)\n    const haps = stave.scheduler.query(now - 0.3, now + 0.05)\n    for (const h of haps) {\n      const freq = hapFreq(h)\n      if (freq == null) continue\n      if (freq < 20) continue\n      const logPos = log(freq / 20) / log(4000 / 20)\n      const y = height - logPos * height\n      const alpha = max(0.1, 1 - (now - h.begin) / 0.5) * (h.gain ?? 1)\n      ctx.fillStyle = h.color ?? '#75baff'\n      ctx.globalAlpha = alpha\n      ctx.fillRect(width - 2, y - 2, 2, max(4, height * 0.03))\n    }\n    ctx.globalAlpha = 1\n  } else { ctx.clearRect(0, 0, width, height) }\n  // Present the persistent buffer to the main canvas (which the worker clears\n  // every frame via transferToImageBitmap). drawImage accepts an OffscreenCanvas\n  // source on both the worker and the main-thread 2D context.\n  clear()\n  drawingContext.drawImage(_wf, 0, 0)\n}";
declare const SPIRAL_P5_CODE = "// Stave p5 viz \u2014 Spiral\nfunction setup() {\n  createCanvas(300, 200)\n  pixelDensity(window.devicePixelRatio || 1)\n  noFill()\n}\nfunction xySpiral(rot, margin, cx, cy, rotate) {\n  const a = ((rot + rotate) * 360 - 90) * PI / 180\n  return [cx + cos(a) * margin * rot, cy + sin(a) * margin * rot]\n}\nfunction draw() {\n  clear()\n  if (!stave.scheduler) return\n  const now = stave.scheduler.now()\n  const haps = stave.scheduler.query(now - 2, now + 1)\n  const cx = width / 2, cy = height / 2\n  const sz = min(width, height) * 0.38, mg = sz / 3\n  for (const h of haps) {\n    const active = h.begin <= now && h.end > now\n    const from = h.begin - now + 3, to = h.end - now + 3 - 0.005\n    const op = max(0, 1 - abs((h.begin - now) / 2))\n    const c = color(h.color ?? (active ? '#75baff' : '#8a919966'))\n    c.setAlpha(op * 255)\n    stroke(c); strokeWeight(mg / 2); strokeCap(ROUND)\n    beginShape()\n    for (let a = from; a <= to; a += 1/60) {\n      const [x, y] = xySpiral(a, mg, cx, cy, now)\n      vertex(x, y)\n    }\n    endShape()\n  }\n  stroke(255); strokeWeight(mg / 2)\n  beginShape()\n  for (let a = 2.98; a <= 3; a += 1/60) {\n    const [x, y] = xySpiral(a, mg, cx, cy, now)\n    vertex(x, y)\n  }\n  endShape()\n}";
declare const PITCHWHEEL_P5_CODE = "// Stave p5 viz \u2014 Pitchwheel\nconst ROOT_FREQ = 440 * pow(2, (36 - 69) / 12)\nfunction setup() {\n  createCanvas(300, 200)\n  pixelDensity(window.devicePixelRatio || 1)\n}\nfunction freq2angle(f) { return 0.5 - (log(f / ROOT_FREQ) / log(2) % 1) }\nfunction circPos(cx, cy, r, a) {\n  const rad = a * TWO_PI\n  return [sin(rad) * r + cx, cos(rad) * r + cy]\n}\n// Hz from a hap. Strudel leaves note as a NAME string and freq null until\n// superdough renders, so parse the note name to MIDI ourselves (h.freq is null\n// here \u2014 relying on it leaves every note stuck at the default pitch).\nfunction hapFreq(h) {\n  if (typeof h.freq === 'number') return h.freq\n  let n = h.note\n  if (typeof n === 'string') {\n    const m = n.toLowerCase().match(/^([a-g])(b|#)?(-?\\d+)$/)\n    if (!m) return null\n    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1]]\n    n = (parseInt(m[3]) + 1) * 12 + base + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0)\n  }\n  if (typeof n !== 'number') return null\n  return 440 * pow(2, (n - 69) / 12)\n}\nfunction draw() {\n  clear()\n  if (!stave.scheduler) return\n  const now = stave.scheduler.now()\n  let haps = stave.scheduler.query(now - 0.01, now + 0.01)\n  haps = haps.filter(h => h.begin <= now && h.end > now)\n  const sz = min(width, height), r = sz / 2 - 12\n  const cx = width / 2, cy = height / 2\n  noStroke(); fill(117, 186, 255, 64)\n  for (let i = 0; i < 12; i++) {\n    const a = freq2angle(ROOT_FREQ * pow(2, i / 12))\n    const [x, y] = circPos(cx, cy, r, a)\n    circle(x, y, 7)\n  }\n  noFill(); stroke(117, 186, 255, 48); strokeWeight(1)\n  circle(cx, cy, r * 2)\n  for (const h of haps) {\n    const freq = hapFreq(h)\n    if (freq == null) continue\n    const a = freq2angle(freq)\n    const [x, y] = circPos(cx, cy, r, a)\n    const c = h.color ?? '#75baff'\n    stroke(c); strokeWeight(2)\n    line(cx, cy, x, y)\n    fill(c); noStroke()\n    circle(x, y, 12)\n  }\n}";
declare const WORDFALL_P5_CODE = "// Stave p5 viz \u2014 Wordfall (vertical pianoroll with labels)\nfunction setup() {\n  createCanvas(stave.width, stave.height)\n  pixelDensity(window.devicePixelRatio || 1)\n}\nfunction draw() {\n  clear()\n  if (!stave.scheduler) return\n  const now = stave.scheduler.now()\n  const CYCLES = 4, PH = 0.5\n  const haps = stave.scheduler.query(now - CYCLES * PH, now + CYCLES * (1 - PH))\n  const vals = [...new Set(haps.map(h => h.note ?? h.s ?? 0))].sort()\n  if (!vals.length) return\n  const bw = width / vals.length\n  for (const h of haps) {\n    const active = h.begin <= now && h.end > now\n    const dur = h.end - h.begin\n    const yOff = h.begin - now\n    const y = height * PH - (yOff / CYCLES) * height\n    const dH = (dur / CYCLES) * height\n    const v = h.note ?? h.s ?? 0\n    const x = vals.indexOf(v) * bw\n    noStroke()\n    if (active) fill(255)\n    else { const c = color(h.color ?? '#75baff'); c.setAlpha(160); fill(c) }\n    rect(x + 1, y + 1, bw - 2, dH - 2)\n    if (dH > 10 && bw > 16) {\n      const label = h.note != null ? String(h.note) : (h.s ?? '')\n      textSize(min(bw * 0.55, dH * 0.7, 11))\n      textAlign(LEFT, TOP); fill(active ? 0 : 255); noStroke()\n      text(label, x + 3, y + 3)\n    }\n  }\n  stroke(255, 255, 255, 128); strokeWeight(1)\n  line(0, height * PH, width, height * PH)\n}";
declare const SIGNALS_SPECTRUM_P5_CODE = "// Stave p5 viz \u2014 Signals (Spectrum)\n// Showcases the named musical-signal bus. Try it over:  s(\"bd*4 hh*8\")\n//\n// Every signal lives on the 'sig' namespace in p5 \u2014 LIVE NUMBERS / ARRAYS,\n// refreshed every draw():\n//\n//   sig('bd')      \u2014 the 'bd' (kick) sound's live signals (a SignalReading).\n//   sig('bd').fft  \u2014 that sound's spectrum: a number[] of 32 buckets, each 0..1\n//                    (real audio off the kick's OWN analyser/orbit). [] if muted.\n//   sig('bd').rms  \u2014 that sound's loudness 0..1. .bass/.mid/.treble also exist.\n//   sig.kick       \u2014 the kick ENVELOPE, 0..1, bumped on each hit, decaying ~0.92\n//                    per frame. sig.snare / sig.hat / sig.clap / sig.tom \u2026 are siblings.\n//   sig.fft        \u2014 the MASTER mix spectrum (combined audio), same shape.\n//\n// In hydra these same names are () => number THUNKS \u2014 see \"Signals (Bands)\".\n\nfunction setup() {\n  createCanvas(stave.width, stave.height)\n  noStroke()\n}\n\nfunction draw() {\n  clear()\n\n  // \u2500\u2500 Spectrum bars from the kick's own audio: sig('bd').fft is a number[] \u2500\u2500\u2500\u2500\n  // Each bucket is 0..1. We fall back to the master mix (sig.fft) so the demo\n  // still moves before any 'bd' has fired its analyser.\n  const spectrum = (sig('bd').fft.length ? sig('bd').fft : sig.fft) || []\n  const bw = width / Math.max(1, spectrum.length)\n  for (let i = 0; i < spectrum.length; i++) {\n    const v = spectrum[i]            // 0..1 magnitude for this band\n    const h = v * height\n    fill(117, 186, 255, 180 + v * 75)\n    rect(i * bw, height - h, bw - 1, h)\n  }\n\n  // \u2500\u2500 A circle pulsed by sig.kick (a live NUMBER 0..1 in p5) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  // sig.kick bumps to ~1 on each kick hit and decays each frame, so the circle\n  // punches outward on the beat. (hydra would call it: sig.kick().)\n  const base = min(width, height) * 0.18\n  const r = base + sig.kick * base * 1.6\n  noFill()\n  stroke(255, 255, 255, 120 + sig.kick * 135)\n  strokeWeight(2 + sig.kick * 4)\n  circle(width / 2, height / 2, r * 2)\n\n  // Inner dot brightens with overall loudness (master RMS, a number in p5).\n  noStroke()\n  fill(255, 255, 255, 60 + sig.rms * 195)\n  circle(width / 2, height / 2, base * 0.5)\n}";
declare const SIGNALS_BACKDROP_P5_CODE = "// Stave p5 viz \u2014 Signals (Backdrop)\n// One color band per code block (track). Showcases the per-track side of the\n// bus: sig.tracks enumerates the live track keys, and sig.track(id).color is the\n// color that block declared in the music via .color() (e.g. in Strudel:\n//   $: s(\"bd*4\").color(\"#f97316\")\n//   $: s(\"hh*8\").color(\"#06b6d4\")\n// ). Each band's brightness follows that track's loudness (rms).\n\nfunction setup() {\n  createCanvas(stave.width, stave.height)\n  noStroke()\n}\n\n// Parse a \"#rrggbb\" / \"#rgb\" hap color into [r,g,b]; null if unparseable.\nfunction parseHex(hex) {\n  const s = String(hex).replace('#', '')\n  if (s.length === 6) return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)]\n  if (s.length === 3) return [parseInt(s[0]+s[0],16), parseInt(s[1]+s[1],16), parseInt(s[2]+s[2],16)]\n  return null\n}\n\nfunction draw() {\n  clear()\n\n  // sig.tracks \u2014 the live track keys ('$0','$1',\u2026 anonymous, or 'd1','drums'\u2026).\n  const tracks = sig.tracks || []\n  if (!tracks.length) {\n    fill(120); textAlign(CENTER, CENTER); textSize(13)\n    text('play a multi-block pattern\u2026', width / 2, height / 2)\n    return\n  }\n\n  const bandH = height / tracks.length\n  for (let i = 0; i < tracks.length; i++) {\n    const id = tracks[i]\n    const reading = sig.track(id)          // this track's live SignalReading\n    // .color \u2014 the color this block set with .color() in the music. p5: a value\n    // (string|null). Fall back to a neutral blue if the block set none.\n    const rgb = parseHex(reading.color) || [117, 186, 255]\n    // .rms \u2014 this track's loudness 0..1 (own analyser; 0 if silent). Drives the\n    // band's brightness so the active block lights up.\n    const lvl = reading.rms\n    fill(rgb[0], rgb[1], rgb[2], 60 + lvl * 195)\n    rect(0, i * bandH, width, bandH)\n  }\n}";

/**
 * WorkspaceShell — Phase 10.2 Task 04.
 *
 * Generic tab/group/split container. Holds any tab kind (editor or
 * preview), supports drag-drop between groups for either kind, and
 * dispatches rendering by `tab.kind` without knowing the file type. Owns
 * nothing about engines, runtime state, or keyboard shortcuts — those are
 * injected by Task 05 (`runtimeProviders` + `chromeForTab`), resolved by
 * Task 06 (`previewProviderFor`), and added by Task 08 (Cmd+K V/B/W
 * window listeners).
 *
 * @remarks
 * ## Relationship to the legacy `EditorGroup.tsx`
 *
 * The old `packages/editor/src/visualizers/editor/EditorGroup.tsx` bundled
 * tab bar + Monaco + preview layout with four rendering modes (panel,
 * inline, background, popout) encoded as a single state field on the
 * group. This file replaces the tab bar / group chrome / drag-drop logic
 * with a **lifted** implementation — not an import, not a delegation.
 * The old group stays on disk until Task 09 deletes it; until then it
 * owns zero dependencies on this shell, and this shell owns zero
 * dependencies on it. Lifting (rather than delegating) is the
 * non-negotiable constraint because the old group's rendering-mode field
 * is exactly what Phase 10.2 exists to dissolve — importing from it
 * would pull that field back in through the type system.
 *
 * The PV7 acceptance test in `WorkspaceShell.test.tsx` greps this file's
 * source for the legacy mode-field identifier and fails if any occurrence
 * is found. The string stays out of this file intentionally.
 *
 * ## Group state shape
 *
 * The shell owns a `Map<groupId, WorkspaceGroupState>` plus an ordered
 * `groupOrder: string[]` that records the left-to-right layout. Using a
 * Map (rather than an object keyed by id) is a deliberate choice: it
 * makes the ordering explicit via `groupOrder`, keeps lookups O(1) on
 * group id, and prevents the "key collision with builtin prototype"
 * class of bugs that plain-object stores suffer. The two fields are
 * always updated together inside a single `setGroups`/`setGroupOrder`
 * transaction so they can't desync.
 *
 * ## Tab dispatch (PV7)
 *
 * Inside `renderGroup()`, the active tab is looked up and dispatched on
 * `tab.kind` via an exhaustiveness-checked `switch`:
 *
 *   - `'editor'` → `<EditorView .../>`
 *   - `'preview'` → `<PreviewView .../>`
 *   - default → `assertNever(tab)` — a `never`-typed call that makes
 *     TypeScript fail the compile if a new tab kind is added without
 *     a branch here.
 *
 * The `chromeSlot` for the editor comes from `props.chromeForTab?.(tab)`
 * — Task 05 wires it to runtime chrome via the runtime provider registry.
 * Task 04 calls the callback if supplied and passes `undefined` otherwise
 * (viz / markdown editors have no chrome).
 *
 * ## Drag-drop logic (lifted from EditorGroup, sanitized for PV7)
 *
 * HTML5 drag-drop with a custom MIME type `application/workspace-tab`.
 * Payload is `{ sourceGroupId, tabId }` JSON-encoded into the dataTransfer.
 * On drop, the shell:
 *
 *   1. Reads the payload from `dataTransfer.getData`.
 *   2. Finds the source group + tab.
 *   3. Removes the tab from the source group.
 *   4. Appends the tab to the target group's tab list.
 *   5. Marks the target group's active tab = the dropped tab.
 *   6. Fires `onActiveTabChange` if the active tab changed.
 *
 * The source group may become empty after the drop — that's legal. The
 * shell does not auto-collapse empty groups (the user might be about to
 * drop something else into it); the explicit "close group" button handles
 * removal.
 *
 * ## Group split
 *
 * `splitGroup(groupId)` inserts a new empty group immediately after the
 * given group in `groupOrder`. The new group has a freshly generated id
 * and no tabs. `SplitPane`'s size reconciliation handles the new pane
 * sizing.
 *
 * ## Close group
 *
 * `closeGroup(groupId)` merges the closing group's tabs into the next
 * adjacent group (previous if this is the last one). If the shell has
 * only one group, close-group is disabled (the user must close individual
 * tabs instead). The merged tabs append to the neighbor's tab list and
 * the active tab in the neighbor stays unchanged.
 *
 * ## Active tab tracking
 *
 * Each group has its own `activeTabId`. The shell also tracks a single
 * `activeGroupId` — the group the user last interacted with — so that
 * `getActiveTab()` can return the one "shell-wide active tab." Clicking
 * a tab in a different group updates both `activeGroupId` and the group's
 * `activeTabId`; `onActiveTabChange` fires with the resolved tab.
 *
 * ## Theme ownership (PV6 / PK6)
 *
 * `applyTheme(shellRootRef.current, theme)` runs in a `useEffect` keyed
 * on `[theme]`. This is belt-and-suspenders: child `EditorView` /
 * `PreviewView` roots also apply their own theme, so the shell chrome
 * (tab bars, group dividers, split handles) has a themed ancestor even
 * when child views mount late.
 */

/**
 * Imperative handle exposed via `ref` on `WorkspaceShell`.
 *
 * Lets parent components programmatically control tab state without
 * going through the `initialTabs` prop (which is read once on mount).
 * Used by the PM Phase 2.5+ file tree to open/focus a file's tab when
 * the user clicks it in the sidebar.
 */
interface WorkspaceShellHandle {
    /**
     * Open or focus the editor tab for the given file id. If a tab with
     * `kind: 'editor'` and matching `fileId` already exists (in any group),
     * focuses it. Otherwise creates a new editor tab in the currently active
     * group and focuses it. No-op if already focused.
     *
     * When `options.preview` is true, the tab is marked preview — a single
     * preview slot per group is reused across successive preview opens,
     * matching VSCode's single-click-to-preview behaviour. Promotion to a
     * pinned tab happens on double-click or the first content edit.
     */
    openOrFocusFile(fileId: string, options?: {
        preview?: boolean;
    }): void;
    /**
     * Open a read-only history viewer (Diff or time-travel View) as a tab in
     * the main editor area (#210). Reuses a single italic preview slot per
     * the active group: a subsequent call replaces that slot's content
     * instead of stacking tabs; double-clicking the tab promotes it to a
     * pinned tab (same UX as opening a file in preview). Replaces the old
     * cramped sidebar overlay.
     */
    openHistoryTab(req: {
        mode: 'diff' | 'view';
        commitId: string;
        fileId: string;
        /** Diff: open in "vs current" (live ↔ commit) by default (#211). */
        vsCurrent?: boolean;
        /** Diff: file-picker scope override (the dirty set) (#211). */
        pickerFileIds?: readonly string[];
    }): void;
    /**
     * Promote the given tab out of preview mode — it becomes pinned and
     * stops being eligible for replacement by the next preview open. No-op
     * if the tab doesn't exist or was already pinned.
     */
    promoteTab(tabId: string): void;
    /**
     * Close every tab (editor + preview) that targets the given file id,
     * in any group. Used when a file is deleted from the sidebar so its
     * orphan tabs vanish without remounting the shell. No-op if no tabs
     * reference the file.
     */
    closeTabsForFile(fileId: string): void;
    /**
     * Close every tab in the tab's group EXCEPT the given tab. No-op if
     * the tab doesn't exist.
     */
    closeOtherTabs(tabId: string): void;
    /** Close every tab in the tab's group. */
    closeAllTabsInGroup(tabId: string): void;
    /**
     * Split the currently active group by inserting a new empty group in
     * the given direction (east = right, south = below). Focus stays on
     * the original group; the new group is a drop target for dragged
     * tabs. No-op if there is no active group.
     */
    splitActiveGroup(direction?: 'east' | 'south'): void;
    /**
     * Pin a FILE as the backdrop for a group. Pass `null` to clear.
     * `groupId` defaults to the active group. The pinned file's preview
     * renders behind the active editor and survives tab switches.
     * Called by the file-tree context menu and by `Cmd+K B`.
     */
    setBackgroundFile(fileId: string | null, groupId?: string): void;
    /**
     * Set the TRANSIENT code-override backdrop for a group (#350a). Pass `null`
     * to drop the override so the manual sticky (`setBackgroundFile`) shows again.
     * `groupId` defaults to the active group. Unlike `setBackgroundFile`, this is
     * NOT persisted and does NOT fire `onBackgroundFileChange` — it's the active
     * program's per-eval `.scope()` / `.viz({ backdrop })` declaration, which
     * OVERLAYS the sticky and clears back to it when the code stops declaring one.
     */
    setBackgroundOverride(fileId: string | null, groupId?: string): void;
    /**
     * Read the current backdrop fileId for a group (default: active
     * group). Returns `undefined` when no backdrop is pinned. Useful for
     * UI that needs to render a "Clear" vs "Set" label without
     * subscribing to every shell state change.
     */
    getBackgroundFileId(groupId?: string): string | undefined;
    /**
     * Set/clear a group's per-pane backdrop opacity (#350c). `null` drops the
     * override so the global default applies. `groupId` defaults to the active
     * group. Persisted (survives reload) — it's user intent, not transient
     * code state.
     */
    setBackdropOpacity(opacity: number | null, groupId?: string): void;
    /** Set/clear a group's per-pane backdrop quality (#350c). `null` → global default. */
    setBackdropQuality(quality: BackdropQuality | null, groupId?: string): void;
    /**
     * Read a group's RESOLVED backdrop settings (#350c) — the per-pane override
     * if set, else the global default. `groupId` defaults to the active group.
     * Lets the popover seed its controls without subscribing to shell state.
     */
    getBackdropSettings(groupId?: string): {
        opacity: number;
        quality: BackdropQuality;
    };
}
declare const WorkspaceShell: React__default.ForwardRefExoticComponent<WorkspaceShellProps & React__default.RefAttributes<WorkspaceShellHandle>>;

/**
 * EditorView — Phase 10.2 Tasks 03 + 07.
 *
 * Pure Monaco editor view bound to a single workspace file, extended with
 * bus-driven inline view zones, active highlighting, and error diagnostics.
 *
 * ## Task 03 (base)
 *
 * Monaco mount, theme application (PV6/PK6), chrome slot injection, and
 * file store binding via `useWorkspaceFile`.
 *
 * ## Task 07 (wiring)
 *
 * Three bus-driven features layered on top of the Task 03 base:
 *
 * 1. **Inline view zones (D-08):** Subscribes to `workspaceAudioBus` with
 *    `{ kind: 'file', fileId }` — its OWN file's runtime, never `'default'`.
 *    On non-null payload with `inlineViz.vizRequests.size > 0`, calls
 *    `addInlineViewZones(editor, payload, descriptors)`. On null (runtime
 *    stopped) calls `pause()`, NOT `cleanup()` (PK3). On file content
 *    change calls `cleanup()` (zone line numbers stale).
 *
 * 2. **Active highlighting (S5):** Reads `payload.hapStream` from the same
 *    bus subscription and feeds it to `useHighlighting(editor, hapStream)`.
 *    Clears when payload goes null.
 *
 * 3. **Eval error diagnostics (S7):** Accepts an `error?: Error | null` prop.
 *    When error transitions from null to Error, calls `setEvalError`. When
 *    it transitions to null, calls `clearEvalErrors`. The parent (compat
 *    shim or shell integration) manages the runtime's `onError` subscription.
 */

declare function EditorView({ fileId, theme, chromeSlot, onMount, error, onPlay, onStop, onEditViz, onCropViz, }: EditorViewProps): React__default.ReactElement;

interface ErrorBoundaryProps {
    children: React__default.ReactNode;
    fallback?: (error: Error, reset: () => void) => React__default.ReactNode;
    onError?: (error: Error, info: React__default.ErrorInfo) => void;
    /**
     * When this key changes, the boundary resets. Use the tab id so
     * switching tabs (or reloading a file) clears a prior crash state.
     */
    resetKey?: string | number;
}
interface ErrorBoundaryState {
    error: Error | null;
}
/**
 * Narrow React error boundary. Wraps editor/preview subtrees so a throw
 * inside Monaco (e.g. `Illegal value for lineNumber` from a bad stack
 * trace — hetvabhasa P37) tears down only the crashing pane, not the
 * surrounding shell (status bar, activity bar, Console panel).
 */
declare class ErrorBoundary extends React__default.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState;
    static getDerivedStateFromError(error: Error): ErrorBoundaryState;
    componentDidCatch(error: Error, info: React__default.ErrorInfo): void;
    componentDidUpdate(prev: ErrorBoundaryProps): void;
    private reset;
    render(): React__default.ReactNode;
}

/**
 * PreviewView — Phase 10.2 Task 03.
 *
 * Hosts a `PreviewProvider`'s rendered output for a single workspace file.
 * Owns:
 *
 *   1. Theme application on its DOM root (PV6 / PK6).
 *   2. Bus subscription via `props.sourceRef`, stored as local state.
 *   3. React-key-driven re-mount of the provider output on publisher
 *      identity change (CONTEXT D-01 — subscribe + re-mount).
 *   4. Hot-reload debounce per `provider.reload` / `provider.debounceMs`
 *      (CONTEXT D-07).
 *   5. Hidden-tab pause semantics (CONTEXT D-03) — `keepRunningWhenHidden`
 *      providers keep getting renders; others freeze the debounce and
 *      see `hidden: true` in their context; un-hiding triggers one
 *      catch-up reload so content changes that arrived while hidden are
 *      not lost.
 *   6. Source selector chrome (audio source dropdown).
 *
 * Does NOT own:
 *
 *   - Provider creation or registry lookup (Task 06).
 *   - Popout window bridging (existing `usePopoutPreview` handles that).
 *   - Error boundaries around `provider.render` (Task 06 adds them when
 *     the concrete providers ship and can throw meaningfully).
 *   - Tab-level `sourceRef` state (shell owns it in Task 04; this view is
 *     controlled).
 *
 * @remarks
 * ## Why re-mount on publisher identity change (D-01)
 *
 * A viz renderer typically captures the `AnalyserNode` on mount and reads
 * from it per frame. If the publisher changes while the renderer is
 * alive, the renderer is still holding the OLD analyser node reference
 * even after we update state with the new payload. The cleanest way to
 * force a fresh `analyser` capture is to unmount-and-remount the
 * renderer. We do this with a React `key` that includes the current
 * publisher's source id (or `'none'` when null). When the id changes,
 * React tears down the subtree and mounts a fresh one — the provider's
 * `render` is called again with the new `audioSource`, and any effects
 * inside its returned tree capture the new analyser on their own mount.
 *
 * The pre-mortem in PLAN.md §10.2-03 flags this as the most likely
 * secondary failure. The test case `switching sources re-mounts the
 * provider output` guards against regressions.
 *
 * ## Reload policy dispatch (D-07)
 *
 * Three modes:
 *   - `'instant'` — every file content change increments the reload
 *     counter synchronously. No timers.
 *   - `'debounced'` — a timer is (re)started on every content change.
 *     When it fires, the reload counter increments. Rapid typing
 *     collapses into a single reload after `debounceMs` of quiescence.
 *   - `'manual'` — file content changes do nothing. The provider is on
 *     its own to re-render (e.g., by keeping internal state).
 *
 * The reload counter is used as part of the React `key` on the provider
 * output, so every increment forces a full unmount/remount. This matches
 * the publisher-identity re-mount pattern — one mechanism, two triggers.
 *
 * ## Hidden-tab pause (D-03)
 *
 * `provider.keepRunningWhenHidden === false` means "do not burn frames
 * on an invisible canvas." When `props.hidden === true` AND the provider
 * opted out of background running, we:
 *
 *   1. Pass `hidden: true` to the provider's `render` context — the
 *      provider's returned component can check this and pause its RAF
 *      loop.
 *   2. Skip the reload counter bump on content change (the debounce
 *      timer is still cleared on every change, it just never fires
 *      a visible reload).
 *   3. On un-hide, trigger ONE reload to pick up any content changes
 *      that arrived during the hidden period. The `catchUpNeededRef`
 *      tracks whether any content changes were missed.
 *
 * Providers with `keepRunningWhenHidden === true` never see `hidden:
 * true` — the host always passes `false` for them, so the provider's
 * behavior is unchanged regardless of `props.hidden`.
 *
 * ## Demo mode (P7)
 *
 * When `sourceRef.kind === 'none'` OR the bus has no matching publisher,
 * `audioSource` is `null`. PreviewView deliberately DOES NOT render a
 * "no data" placeholder — the provider is responsible for demo-mode
 * fallback content (per CONTEXT P7). PreviewView DOES show a small badge
 * in the chrome area so the user understands why the canvas looks
 * different.
 *
 * ## Source selector chrome
 *
 * Reads `workspaceAudioBus.listSources()` on EVERY open of the selector
 * (not cached in state) per CONTEXT pre-mortem #6 — stale cached
 * entries would desync from actual publishers as they start/stop. A
 * simple `<select>` element serves as the minimal chrome for Task 03;
 * Task 04 / Task 05 may dress it up further.
 */

declare function PreviewView({ fileId, provider, sourceRef, onSourceRefChange, theme, hidden, paused, }: PreviewViewProps): React__default.ReactElement;

/**
 * WorkspaceFile store — Yjs-backed (PM Phase 1).
 *
 * Replaces the Phase 10.2 in-memory Map with a Yjs Y.Doc backing.
 * The public API is IDENTICAL to the original:
 *
 *   createWorkspaceFile, getFile, setContent, subscribe
 *
 * plus a new `seedWorkspaceFile` for persistence-aware create-or-load.
 *
 * ## How persistence works
 *
 * Each file is a Y.Map inside the doc's top-level "files" Y.Map.
 * Content is stored as Y.Text (ready for Phase 3 multiplayer).
 * A cached `WorkspaceFile` snapshot is maintained per file for
 * reference-stability (required by useSyncExternalStore).
 *
 * Two init modes:
 * - Real app: call `initProjectDoc(id)` (async, IDB-backed) BEFORE
 *   mounting components. Files loaded from IDB are available after.
 * - Tests: no init needed — the store lazy-inits an in-memory Y.Doc
 *   on first access via `ensureDoc()`.
 *
 * ## Snapshot identity contract (unchanged from Phase 10.2)
 *
 * `getFile(id) === getFile(id)` — unless content changed in between.
 * Achieved by caching snapshots and only rebuilding on Y.Text changes.
 */

type Subscriber = () => void;
/**
 * Create a new WorkspaceFile. Always overwrites if the file already exists.
 * Safe to call multiple times for the same id.
 *
 * For persistence-aware "create only if not in IDB" semantics, use
 * `seedWorkspaceFile` instead (LiveCodingEditor uses that).
 */
declare function createWorkspaceFile(id: string, path: string, content: string, language: WorkspaceLanguage, meta?: Record<string, unknown>): WorkspaceFile;
/**
 * Persistence-aware create-or-load. If the file already exists in the
 * Y.Doc (loaded from IDB), returns the persisted version without
 * overwriting. If the file does not exist, creates it with the given
 * seed content.
 *
 * Use this from components that seed files on mount (LiveCodingEditor,
 * WorkspaceShell) to avoid overwriting persisted user work on refresh.
 */
declare function seedWorkspaceFile(id: string, path: string, content: string, language: WorkspaceLanguage, meta?: Record<string, unknown>): WorkspaceFile;
/**
 * Return the current snapshot for a file id, or `undefined` if the id
 * is not registered. Reference-stable across calls.
 */
declare function getFile(id: string): WorkspaceFile | undefined;
/**
 * Replace the content of a file. Writing to an unknown id is a no-op.
 */
declare function setContent(id: string, newContent: string): void;
/**
 * Register a subscriber for a specific file id. Returns unsubscribe fn.
 */
declare function subscribe(id: string, cb: Subscriber): () => void;
/**
 * Register a subscriber for file-list-level changes (file added, deleted,
 * or renamed). Fires after the change is committed to the Y.Doc.
 */
declare function subscribeToFileList(cb: Subscriber): () => void;
/**
 * Return all workspace files as a list. Snapshots are reference-stable
 * so this return value is suitable for useSyncExternalStore.
 */
declare function listWorkspaceFiles(): WorkspaceFile[];
/**
 * Delete a file from the Y.Doc. No-op if the id doesn't exist.
 */
declare function deleteWorkspaceFile(id: string): void;
/**
 * Rename a file's path. The file id stays the same — only the path field
 * is updated. This is how files move between folders (e.g., "foo.strudel"
 * → "sketches/foo.strudel"). No-op if the id doesn't exist.
 */
declare function renameWorkspaceFile(id: string, newPath: string): void;
/**
 * Return the explicit file-id order for a folder, or an empty array if
 * none is set (callers should fall back to alphabetical). The root is
 * addressed as the empty string `""`.
 */
declare function getFolderOrder(folderPath: string): string[];
/**
 * Replace the ordered file-id list for a folder. Missing file ids are
 * ignored at render time (tree builder filters to files that actually
 * belong to the folder). Empty array clears the explicit order.
 */
declare function setFolderOrder(folderPath: string, orderedIds: string[]): void;
/**
 * Subscribe to folder-order changes (both files and subfolders).
 * Fires after any reorder commits.
 */
declare function subscribeToFolderOrder(cb: Subscriber): () => void;
/**
 * Return the explicit subfolder-name order for a parent folder, or an
 * empty array if none is set. Names are relative (immediate children),
 * not full paths. Root = "".
 */
declare function getSubfolderOrder(parentPath: string): string[];
/**
 * Replace the ordered subfolder-name list for a parent folder. Names
 * that no longer correspond to a real subfolder are filtered out at
 * render time.
 */
declare function setSubfolderOrder(parentPath: string, orderedNames: string[]): void;
/**
 * Return the explicit mixed child order for a folder, or an empty array
 * if none is set. Each entry is `"d:folderName"` or `"f:fileId"`. When
 * present, this overrides the separate fileOrder + subfolderOrder for
 * rendering purposes — items appear in exactly this order (folders and
 * files interleaved).
 */
declare function getChildOrder(parentPath: string): string[];
/**
 * Replace the mixed child order for a folder. Entries are `"d:name"` for
 * folders and `"f:id"` for files. Empty array clears (reverts to
 * folders-first fallback).
 */
declare function setChildOrder(parentPath: string, entries: string[]): void;
declare function getZoneCropOverride(fileId: string, trackKey: string): {
    x: number;
    y: number;
    w: number;
    h: number;
} | undefined;
/**
 * Set the crop override for one (fileId, trackKey) pair. Pass `null` to
 * remove the override (revert to preset default). Triggers subscribers.
 */
declare function setZoneCropOverride(fileId: string, trackKey: string, cropRegion: {
    x: number;
    y: number;
    w: number;
    h: number;
} | null, vizId?: string, contentHash?: string): void;
declare function getZoneHeightOverride(fileId: string, trackKey: string): number | undefined;
declare function setZoneHeightOverride(fileId: string, trackKey: string, heightPx: number | null, contentHash?: string): void;
/**
 * Prune stale zone overrides. Called on every evaluate — removes overrides
 * whose trackKey is no longer in the current `vizRequests` or whose vizId
 * has changed (crop picked for one viz's aspect is meaningless for another).
 *
 * `currentViz` maps trackKey → vizId for every $: block with a .viz() in
 * the latest evaluate result (same Map shape as `inlineViz.vizRequests`
 * but values are just the vizId string, not the full {vizId, afterLine}).
 */
declare function pruneZoneOverrides(fileId: string, currentViz: Map<string, {
    vizId: string;
    contentHash?: string;
}>): void;
/**
 * Subscribe to ANY zone-override change within a file. Fires after each
 * committed mutation.
 */
declare function subscribeToZoneOverrides(fileId: string, cb: Subscriber): () => void;
/**
 * Phase 20-12 D-01/D-02 — per-track UI metadata persisted in the file's PM
 * Yjs doc. Mirrors ZoneOverride shape; one record per trackId.
 *  - `color`: user-picked from TRACK_PALETTE_32 (overrides paletteForTrack auto)
 *  - `collapsed`: chevron state (default = expanded; users notice collapse by absence)
 */
interface TrackMeta {
    color?: string;
    collapsed?: boolean;
}
declare function getTrackMeta(fileId: string, trackId: string): TrackMeta;
/**
 * Set per-track metadata. Merge-patch semantics: the partial shallow-merges
 * onto the existing record. When BOTH fields end up undefined the key is
 * deleted (cleanup keeps the Y.Map small for files where the user toggles
 * back to default state).
 */
declare function setTrackMeta(fileId: string, trackId: string, partial: Partial<TrackMeta>): void;
/**
 * Subscribe to ANY trackMeta change within a file. Fires after each committed
 * mutation. Returns an unsubscribe.
 *
 * Uses the read-only `getTrackMetaMap` for observer wiring — `subscribe` is
 * called from React `useEffect` AND `useSyncExternalStore.subscribe`, both
 * of which can race with first render. If the map doesn't exist yet, the
 * subscriber is still registered; when `setTrackMeta` later creates the
 * map, the observer wires at that point and back-fires to all existing
 * subscribers via the trackMetaSubscribers set.
 */
declare function subscribeToTrackMeta(fileId: string, cb: Subscriber): () => void;
declare function resetFileStore(): void;

/**
 * useTrackMeta — Phase 20-12 α-3.
 *
 * React hook surfacing per-track UI metadata (custom palette swatch + chevron
 * collapsed state) from the per-file PM Yjs doc. Mirrors useWorkspaceFile's
 * useSyncExternalStore pattern (useWorkspaceFile.ts:39-64).
 *
 * Backed by `subscribeToTrackMeta` + `getTrackMeta` + `setTrackMeta` (added
 * in α-2). The hook is the React-side surface β chrome will mount against.
 *
 * @remarks
 * - `fileId` source: chrome derives this from `IRSnapshot.source` (the
 *   workspace file path). When undefined (no snapshot yet, or snapshot from
 *   a non-file source) the hook returns the empty default and the setter
 *   no-ops — RESEARCH §A.6.
 *
 * - The store's `getTrackMeta` already returns a shared frozen sentinel for
 *   absent records (WorkspaceFile.ts EMPTY_TRACK_META) AND the exact stored
 *   reference when present, so `getSnapshot` is ref-stable without further
 *   handling here. Allocating `{}` per call would trip StrictMode tearing.
 *
 * - `set` is `useCallback`-memoised on `(fileId, trackId)` so dependents
 *   (e.g. effects, child memo blockers) get a stable reference across renders
 *   while fileId/trackId remain unchanged. feedback_useeffect_per_render_dep.md.
 */

interface UseTrackMetaResult {
    meta: TrackMeta;
    set: (partial: Partial<TrackMeta>) => void;
}
declare function useTrackMeta(fileId: string | undefined, trackId: string): UseTrackMetaResult;

/**
 * projectDoc — PM Phase 1 (local persistence).
 *
 * Manages the active Yjs document that backs the WorkspaceFile store.
 * Each project is a single Y.Doc persisted to IndexedDB via y-indexeddb.
 *
 * Two init paths:
 * - `initProjectDoc(id)` — async, wires y-indexeddb, awaits IDB sync.
 *   Used by the real app. Files loaded from IDB are available after resolve.
 * - `initProjectDocSync()` — sync, in-memory only, no IDB.
 *   Used by tests and as a lazy fallback if no explicit init was called.
 *
 * The store (WorkspaceFile.ts) calls `ensureDoc()` which lazy-inits
 * in-memory if no explicit init happened — making tests work without
 * any async ceremony while the real app gets persistence.
 */

/**
 * Async init with IndexedDB persistence. Resolves after IDB sync
 * completes — all persisted files are in the Y.Doc when this returns.
 *
 * Must be called BEFORE any createWorkspaceFile / seedWorkspaceFile
 * calls to avoid the seed-vs-persisted race condition.
 */
declare function initProjectDoc(projectId: string): Promise<void>;
/**
 * Sync init without persistence. Used by tests and as a lazy fallback.
 * The Y.Doc lives only in memory — lost on refresh.
 */
declare function initProjectDocSync(): void;
/** Whether the doc has finished loading from IDB (always true for sync init). */
declare function isDocReady(): boolean;
/** Returns the active project id, or null if none initialized. */
declare function getActiveProjectId(): string | null;
/**
 * Switch to a different project. Destroys the current doc + provider,
 * creates a new Y.Doc for the target project, and awaits IDB sync.
 *
 * Callers MUST also call resetFileStore() (from WorkspaceFile.ts) to
 * clear cached snapshots and re-wire observers before any store reads.
 * initProjectDoc already handles the doc-level cleanup; this function
 * is a convenience alias that also updates the active project id.
 */
declare function switchProject(projectId: string): Promise<void>;
/**
 * Subscribe to ANY update on the active Y.Doc (file content typing,
 * structural file-list changes, folder-order changes, etc). Used by
 * the app's auto-snapshot debouncer. Returns an unsubscribe function.
 *
 * Note: the subscription is bound to whatever Y.Doc is active at
 * registration time. Callers should re-register when the project
 * switches (the old doc gets destroyed).
 */
declare function subscribeToDocUpdate(cb: () => void, options?: {
    localOnly?: boolean;
}): () => void;

/**
 * Run `fn` inside a single structural transaction so every store
 * mutation it triggers (rename + folder-order updates, etc.) collapses
 * into ONE undo stack item instead of fanning into N items. Nested
 * transacts piggyback on the outer one — callers just call the
 * existing store functions as usual.
 */
declare function withStructBatch<T>(fn: () => T): T;
type Listener$5 = () => void;
/** Call when the active project Y.Doc changes so the undo stack rebuilds. */
declare function resetUndoManager(): void;
declare function undo(): boolean;
declare function redo(): boolean;
declare function canUndo(): boolean;
declare function canRedo(): boolean;
declare function subscribeToUndoState(cb: Listener$5): () => void;

/**
 * SnapshotStore — PM Phase 4 (version history, MVP).
 *
 * IDB-backed store for project Y.Doc snapshots. One shared database
 * keyed by `${projectId}:${snapshotId}` — each value is a serialized
 * Y.Doc update (Uint8Array) captured via Y.encodeStateAsUpdate.
 *
 * MVP scope: manual save only, no auto-snapshot. Restore replaces the
 * current doc state by constructing a fresh Y.Doc from the snapshot
 * bytes and transferring its file-map contents into the active doc.
 */
interface SnapshotMeta {
    readonly id: string;
    readonly projectId: string;
    readonly label: string;
    readonly createdAt: number;
    readonly kind?: 'manual' | 'auto';
}
/**
 * Marker prefix for labels of snapshots created by the auto-snapshot
 * debouncer. Matching by this prefix lets the UI distinguish them
 * from manual saves without a separate schema field on older rows.
 */
declare const AUTO_SNAPSHOT_PREFIX = "Auto \u2014 ";
declare function saveSnapshot(projectId: string, label: string, kind?: 'manual' | 'auto'): Promise<SnapshotMeta>;
/**
 * List all snapshots for a project, newest first. Bytes are omitted —
 * callers must call `loadSnapshot` to fetch the payload.
 */
declare function listSnapshots(projectId: string): Promise<SnapshotMeta[]>;
/**
 * Delete a snapshot by id. No-op if the id doesn't exist.
 */
declare function deleteSnapshot(id: string): Promise<void>;
/**
 * Restore a snapshot into the currently active Y.Doc. The snapshot's
 * file set REPLACES the current file set. Implementation: rehydrate a
 * temporary Y.Doc from bytes, then in one transaction on the active
 * doc (a) delete all existing files and (b) recreate each file from
 * the snapshot.
 *
 * Callers must refresh UI state via `resetFileStore()` after this
 * returns so cached snapshots re-sync with the new doc contents.
 */
declare function restoreSnapshot(id: string): Promise<void>;

/**
 * historyGraph — PURE commit-graph logic for the project file-history store
 * (Phase F, #196).
 *
 * No IndexedDB, no Y.Doc, no Date.now/randomUUID. Every mutating function is
 * pure: it takes a `ProjectHistory`, plus any externally-generated `id` /
 * `createdAt`, and returns a NEW `ProjectHistory`. This keeps the graph logic
 * fully unit-testable with plain objects (the project does not fake IndexedDB
 * in vitest — IDB I/O lives in `historyStore.ts` and is verified by
 * observation; the driver that supplies ids/timestamps lives in
 * `historyDriver.ts`).
 *
 * Model: git-style. Commits store ONLY the files that changed vs their parent
 * (full content per changed file — NOT Yjs deltas, so reconstruction is a
 * parent back-walk with no replay chain). `fileIndex` maps each file to the
 * commits that wrote it, for O(1)-ish per-file history. The current branch's
 * HEAD is the runtime authority.
 *
 * See `.planning/phase-F-history/PLAN.md` and RESEARCH.md for the locked
 * decisions (cadence, retention, commit form).
 */

type CommitKind = 'seed' | 'auto' | 'manual' | 'fork';
/**
 * Per-file structural metadata needed to RECREATE a file on restore (path,
 * language, opaque meta bag). Stored at the history level (latest-wins) rather
 * than per-commit: commits carry only changed CONTENT (for clean diffing), but
 * restoring a deleted file needs its identity. Renames are rare; v1 uses the
 * latest known meta (historical-path restore is a later refinement).
 */
interface FileMeta {
    readonly path: string;
    readonly language: WorkspaceLanguage;
    readonly meta?: Readonly<Record<string, unknown>>;
}
interface OrderSnapshot {
    /** folderPath → ordered child file ids */
    readonly fileOrder: Record<string, readonly string[]>;
    /** parentPath → ordered subfolder names */
    readonly subfolderOrder: Record<string, readonly string[]>;
}
interface Commit {
    readonly id: string;
    /** null only for a seed commit (a branch root). */
    readonly parent: string | null;
    /** the branch this commit was created on. */
    readonly branch: string;
    readonly kind: CommitKind;
    readonly createdAt: number;
    /** present on manual commits (Phase I) and the seed ('Initial'). */
    readonly label?: string;
    /** ONLY files changed vs parent. fileId → full content. */
    readonly files: Readonly<Record<string, string>>;
    /** structural order as of this commit (whole-project restore needs it). */
    readonly order?: OrderSnapshot;
    /**
     * Set by retention pruning: this commit fell outside its display tier but
     * holds the nearest-writer copy of a file some retained commit still reads,
     * so it is kept on the STORAGE chain (back-walk traverses it) but HIDDEN
     * from the display lineage (`listCommits`/`fileHistory` skip it). This is
     * what lets only-changed-files pruning stay correct without a squash pass.
     * See historyRetention.ts + PV61.
     */
    readonly pinned?: boolean;
}
interface BranchRef {
    readonly head: string;
    readonly createdAt: number;
    /** commit this branch forked from; null for the root branch. */
    readonly createdFrom: string | null;
}
interface ProjectHistory {
    readonly projectId: string;
    readonly commits: Readonly<Record<string, Commit>>;
    readonly branches: Readonly<Record<string, BranchRef>>;
    readonly currentBranch: string;
    /** fileId → commit ids that wrote it, oldest-first. */
    readonly fileIndex: Readonly<Record<string, readonly string[]>>;
    /** fileId → latest structural metadata (for restore-recreate). */
    readonly fileMeta: Readonly<Record<string, FileMeta>>;
}
declare function getCommit(h: ProjectHistory, commitId: string): Commit | undefined;
declare function getCurrentBranch(h: ProjectHistory): string;
/**
 * Content of `fileId` as of `commitId` — the nearest writer at-or-before the
 * commit, found by walking parent links. Returns null if the file did not
 * exist at/before that commit. No replay chain.
 */
declare function getFileContentAt(h: ProjectHistory, fileId: string, commitId: string): string | null;
/**
 * Display lineage of a branch (HEAD → root via parent links), newest-first.
 * Skips `pinned` commits — they exist only to hold content for the back-walk
 * (see Commit.pinned), not for display.
 */
declare function listCommits(h: ProjectHistory, branch?: string): Commit[];
declare function listBranches(h: ProjectHistory): Array<{
    name: string;
} & BranchRef>;
/**
 * Commits that wrote `fileId`, newest-first (fileIndex projection). Skips
 * `pinned` commits for display consistency with `listCommits`.
 */
declare function fileHistory(h: ProjectHistory, fileId: string): Commit[];

/**
 * historyService — stateful orchestration for the project commit store
 * (Phase F, #196, Task 6). Combines the pure graph, the workspace bridge, and
 * IDB persistence behind a small imperative API the driver (cadence) and the
 * app (eval trigger, History panel, branch UI) call.
 *
 * Holds the active project's `ProjectHistory` in memory (mirrors projectDoc's
 * single-active-doc model). All ids/timestamps are generated HERE (crypto /
 * Date) and handed to the pure graph, keeping the graph deterministic.
 */

type Listener$4 = () => void;
/** Subscribe to history changes (commit/restore/branch/switch/active-file). Returns unsubscribe. */
declare function subscribeToHistory(cb: Listener$4): () => void;
/** The app sets this on tab focus so File-scope history targets the right file. */
declare function setActiveHistoryFile(fileId: string | null): void;
declare function getActiveHistoryFile(): string | null;
/** Focus the History panel on one file's history (null = project graph). */
declare function setFileHistoryTarget(fileId: string | null): void;
declare function getFileHistoryTarget(): string | null;
/** The in-memory active history (null before init). For UI reads. */
declare function getCurrentHistory(): ProjectHistory | null;
/**
 * Load (or, on first run, seed from the live workspace) the project's history.
 * Migration per RESEARCH Q3: legacy byte-snapshots are ignored — the live
 * workspace IS the newest state, so seed commit c0 from it.
 */
declare function initHistory(projectId: string): Promise<ProjectHistory>;
/** Drop the in-memory state (project switch / teardown) and notify. */
declare function resetHistoryState(): void;
interface CommitWorkspaceOpts {
    /** apply the significance floor (idle path); false for eval/manual/restore. */
    readonly gate?: boolean;
    readonly label?: string;
    /**
     * Commit even when nothing changed since HEAD (label-only anchor). Used by
     * manual checkpoints (#199) so a user can name the current exact state; the
     * auto/eval paths leave this off and keep their no-op-when-unchanged return.
     */
    readonly allowEmpty?: boolean;
    /**
     * Selective-file commit (#211, Tier 1.2 — the index-free analogue of git
     * staging): commit ONLY these file ids, leaving the rest of the working
     * changes uncommitted (captured by a later auto/eval commit). Filters the
     * computed diff to the subset before the empty-check. Absent = today's full
     * working-tree snapshot (auto/eval/restore stay byte-identical).
     */
    readonly only?: ReadonlySet<string>;
}
/**
 * Capture the current workspace state as a commit on the current branch.
 * Returns the new commit id, or null if nothing changed (or the change was
 * below the significance floor when gated). Auto-commits trigger pruning.
 */
/** Locked: capture the workspace as a commit. See {@link commitWorkspace}. */
declare function commitWorkspace(kind: CommitKind, opts?: CommitWorkspaceOpts): Promise<string | null>;
/**
 * Restore the whole project to `commitId`'s state, then record the restore as
 * a new commit on the current branch (non-destructive — the prior state stays
 * in history).
 */
declare function restoreProject(commitId: string): Promise<void>;
/**
 * Restore a single file to its content at `commitId` (or delete it if it did
 * not exist then), then record a new commit. The Phase B (#191) primitive.
 */
declare function restoreFileToCommit(fileId: string, commitId: string): Promise<string | null>;
/**
 * Restore a file to its seed (commit 0) content — the universal "reset to
 * default" (#191): "revert to default" === restore to the seed commit. No-op
 * (null) if there's no active history or no seed. Computes the seed id INSIDE
 * the lock so a project switch can't cross the read/restore boundary.
 */
declare function revertFileToSeed(fileId: string): Promise<string | null>;
/**
 * True if `fileId`'s live workspace content differs from current-branch HEAD.
 * A synchronous read (no mutation/persist → no lock needed) for the Phase D
 * file-tree badge and File-scope restore-button gating (#193). False when
 * there's no history or no HEAD yet.
 */
declare function isFileModifiedSinceHead(fileId: string): boolean;
/**
 * The set of file ids whose live content differs from current-branch HEAD —
 * the whole dirty set in ONE pass (one workspace read + one `changedFiles`),
 * for the file-tree badge (#193). Prefer this over calling
 * `isFileModifiedSinceHead` per file, which re-reads the workspace each call
 * (O(N²) over the tree). Empty when there's no history or no HEAD.
 */
declare function getModifiedFileIdsSinceHead(): ReadonlySet<string>;
/** Create a branch at `fromCommit` (does not switch to it). */
declare function createBranchAt(name: string, fromCommit: string): Promise<void>;
/**
 * Switch the current branch and re-sync the workspace to that branch's HEAD
 * (the new runtime authority).
 */
declare function switchToBranch(name: string): Promise<void>;

/**
 * historyDriver — auto-commit cadence for the project commit store (Phase F,
 * #196, Task 6). Replaces the 60s full-doc auto-snapshot effect that lived in
 * StaveApp (StaveApp.tsx:368-400). Extracted into the editor package so the
 * cadence is wired in one testable place rather than a React effect.
 *
 * Triggers (RESEARCH §1):
 *  - idle: 5s after the last LOCAL doc mutation, significance-gated.
 *  - unload: visibilitychange→hidden / pagehide, significance-gated (narrows
 *    the lost-debounce-window on reload).
 *  - per-eval: NOT here — `onEvaluateSuccess` lives on the runtime instance in
 *    the app, which calls commitWorkspace('auto', {gate:false}) directly.
 *
 * `initHistory(projectId)` must have run before starting the driver.
 */
/**
 * Wire the idle + unload auto-commit triggers. Returns a teardown function.
 * Each fire is significance-gated (idle/unload commit only meaningful change).
 */
declare function startHistoryDriver(): () => void;

/**
 * HistoryPanel — the project commit graph (Version History side panel).
 *
 * A VS Code / GitLens-style source-control graph: PROJECT-level commit history
 * (no per-file mode — that's a separate "File History" action on a file). Each
 * commit row has a branch-lane graph gutter, a kind badge + label + time, and
 * hover-revealed icon actions (Restore / Fork / View). Expanding a commit lists
 * the files it changed; clicking a file opens its diff.
 *
 * Reads the service singleton + re-renders on subscribeToHistory.
 */

/** Request to open a read-only history viewer in the main editor area (#210). */
interface OpenHistoryTabRequest {
    readonly mode: 'diff' | 'view';
    readonly commitId: string;
    readonly fileId: string;
    /** Diff: open in "vs current" (live ↔ commit) by default — the uncommitted diff (#211). */
    readonly vsCurrent?: boolean;
    /** Diff: file-picker scope override (the dirty set) so a file HEAD didn't touch is selectable (#211). */
    readonly pickerFileIds?: readonly string[];
}
interface HistoryPanelProps {
    /**
     * Open a Diff / time-travel View as a tab in the main editor area
     * (wired by the app to `shellRef.openHistoryTab`). Diff/View no longer
     * render as a cramped in-panel overlay (#210).
     */
    readonly onOpenHistoryTab?: (req: OpenHistoryTabRequest) => void;
}
declare function HistoryPanel({ onOpenHistoryTab }?: HistoryPanelProps): React.ReactElement;

type Listener$3 = () => void;
/**
 * Enter time-travel: the runtime reflects `commitId`'s snapshot (read-only).
 * `files` is the whole-project snapshot at that commit (Decision C). Calling
 * again with a different commit swaps the view in place.
 */
declare function enterRuntimeView(commitId: string, files: Record<string, string>): void;
/** Exit time-travel: restore HEAD authority. No-op when not viewing. */
declare function exitRuntimeView(): void;
/**
 * Viewed content for a file, or `null` when not viewing OR the file did not
 * exist at the checked-out commit. Callers fall back to live content on null.
 */
declare function getViewedContent(fileId: string): string | null;
declare function isViewing(): boolean;
declare function getViewedCommit(): string | null;
/** All file ids present in the current view (empty array when not viewing). */
declare function getViewedFileIds(): string[];
/** Subscribe to enter/exit/swap. Returns an unsubscribe fn. */
declare function subscribeToRuntimeView(cb: Listener$3): () => void;

/**
 * ProjectRegistry — PM Phase 2.
 *
 * IDB-backed metadata store for the project list. Each project's actual
 * content lives in a separate y-indexeddb database (one Y.Doc per project).
 * This store only holds the lightweight metadata needed to populate the
 * sidebar without loading any Y.Doc.
 *
 * Follows the same raw IndexedDB pattern as VizPresetStore.
 */
interface ProjectMeta {
    readonly id: string;
    readonly name: string;
    readonly createdAt: number;
    readonly lastOpenedAt: number;
    /**
     * Per-project crop region for the pinned backdrop. All values 0–1
     * fractional of the viz's full viewport. Absent when the backdrop
     * should render full-rect (default). Kept on project metadata (not in
     * the Y.Doc) because the crop is a per-user view preference rather than
     * authored content — shouldn't sync across collaborators when
     * multi-user arrives. (The backdrop *file* is no longer stored here:
     * #347 made it per-tab in StrudelEditorClient, and #371 retired the
     * old project-global `backgroundFileId` slot.)
     */
    readonly backgroundCrop?: {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
    };
}
/** List all projects, sorted by lastOpenedAt descending (most recent first). */
declare function listProjects(): Promise<ProjectMeta[]>;
/** Get a single project by id, or undefined if not found. */
declare function getProject(id: string): Promise<ProjectMeta | undefined>;
/** Get the most recently opened project, or undefined if none exist. */
declare function getLastOpenedProject(): Promise<ProjectMeta | undefined>;
/** Create a new project and return its metadata. */
declare function createProject(name: string): Promise<ProjectMeta>;
/** Update the lastOpenedAt timestamp. Call when opening a project. */
declare function touchProject(id: string): Promise<void>;
/**
 * Save or clear the backdrop crop region. `null` removes the field
 * (backdrop renders full-rect). No-op when the project doesn't
 * exist or has no backdrop file pinned.
 */
declare function setProjectBackgroundCrop(id: string, crop: {
    x: number;
    y: number;
    w: number;
    h: number;
} | null): Promise<void>;
/** Rename a project. */
declare function renameProject(id: string, name: string): Promise<void>;
/**
 * Delete a project's metadata. Also deletes the y-indexeddb database
 * for the project's Y.Doc content.
 */
declare function deleteProject(id: string): Promise<void>;
/**
 * Duplicate a project. Creates a new metadata entry with a new id.
 * NOTE: does NOT duplicate the Y.Doc content — that requires loading
 * the source doc and creating a snapshot. For PM Phase 2, duplicate
 * creates an empty project with the same name + " (copy)". Full
 * content duplication is a Phase 3+ feature.
 */
declare function duplicateProject(id: string): Promise<ProjectMeta | undefined>;

/**
 * sampleSound — test audio source for viz development.
 *
 * A self-contained sawtooth oscillator with an LFO-modulated pitch that
 * feeds an `AnalyserNode`, plus a virtual `PatternScheduler` that
 * returns a repeating 4-note arpeggio synced to the LFO period. The
 * payload is published to the `workspaceAudioBus` under the fixed
 * source id `__sample__` so the user can pick "Sample sound" in a viz
 * tab's source dropdown and see both FFT-reactive shaders AND
 * scheduler-driven sketches (like the default pianoroll) react to a
 * predictable source without needing to play a real pattern first.
 *
 * @remarks
 * ## Design
 *
 * The sample sound is a **singleton** — one shared `AudioContext`,
 * oscillator graph, `AnalyserNode`, and virtual `PatternScheduler`.
 * Multiple viz previews pinning to `__sample__` all see the same FFT
 * data AND the same scheduler, which is what you want for "test the
 * viz with a known-stable audio source."
 *
 * ## Why an LFO-modulated sawtooth, specifically
 *
 * A pure sine at one frequency produces a single FFT spike that
 * doesn't move — the viz looks dead. A sawtooth produces a rich
 * harmonic series (multiple bins lit up), and modulating its frequency
 * with a slow LFO makes those bins shift over time. The result is a
 * visibly animated FFT without needing a complex score.
 *
 * ## Why a 4-note arpeggio for the virtual scheduler
 *
 * The pianoroll default (PIANOROLL_P5_CODE) polls
 * `stave.scheduler.query()` every frame and draws rectangles for the
 * returned events. Without a scheduler payload, the pianoroll shows
 * only the analyser spectrum — no notes. A minimal virtual pattern
 * lets users see their sketch respond to "pattern-like" data while
 * testing.
 *
 * The pattern is a 4-note A-minor arpeggio (A3, C4, E4, G4) with
 * each note holding for 0.5 seconds, cycling every 2 seconds — the
 * same period as the LFO sweep, so the visible note changes
 * roughly coincide with the audible pitch drift.
 *
 * ## Audibility
 *
 * The output routes to `ctx.destination` with a low gain (0.05) so the
 * user can actually HEAR the test audio. Most viz developers want to
 * hear what they're visualizing — muting it would require the user to
 * trust that audio is "there" purely on visual evidence. Setting a
 * low gain keeps it audible without being annoying.
 *
 * ## Lifecycle (user-driven)
 *
 *   - `start()` — lazy-initializes the AudioContext, oscillator graph,
 *     analyser, and scheduler on first call. No-op if already playing.
 *     Must be called from a user gesture (click handler) per browser
 *     autoplay policy.
 *   - `stop()` — disconnects nodes, unpublishes from the bus, closes
 *     the context. Called when the user selects a different source.
 *   - `isPlaying()` — query for UI state.
 *
 * ## Bus payload shape
 *
 * Publishes an `AudioPayload` with:
 *   - `analyser` — live FFT data from the oscillator
 *   - `audio: { analyser, audioCtx }` — nested component shape for
 *     consumers that read from `payload.audio`
 *   - `scheduler` — virtual `PatternScheduler` returning the arpeggio
 *   - `hapStream` — a fresh empty `HapStream`. The sample sound does
 *     NOT emit hap events in the current revision — event-driven
 *     sketches that subscribe via `hapStream.on()` see nothing. The
 *     field is populated for payload-shape completeness only.
 *
 * ## Identity guard interaction (D-01)
 *
 * The bus's identity guard (`payloadsEquivalent` in `WorkspaceAudioBus`)
 * treats same-ref publishes as no-ops. We publish ONCE on `start()`
 * with a stable payload — the live FFT data updates happen inside the
 * analyser node, not via re-publishing. The scheduler's `now()` reads
 * `ctx.currentTime` per call, so consumers get fresh time every frame
 * without needing a re-publish either.
 */

/** Fixed source id the sample sound publishes under on the workspace bus. */
declare const SAMPLE_SOUND_SOURCE_ID = "__sample__";
/** Human-readable label for the audio source dropdown. */
declare const SAMPLE_SOUND_LABEL = "Sample sound (test audio)";
/**
 * Start the sample sound. Lazy-initializes the AudioContext, oscillator
 * graph, and analyser on first call. Publishes a payload to the bus
 * under `SAMPLE_SOUND_SOURCE_ID` so any preview pinned to that id sees
 * live FFT data immediately. Safe to call multiple times — second and
 * later calls are no-ops.
 *
 * MUST be called from inside a user gesture handler. Browsers reject
 * `new AudioContext()` outside of click/touch/keydown handlers under
 * the autoplay policy, so tests and UI code should only invoke this
 * in response to a button press.
 */
declare function startSampleSound(): void;
/**
 * Stop the sample sound. Disconnects the oscillator graph, unpublishes
 * from the bus, and closes the AudioContext. No-op if not running.
 * Consumers pinned to `__sample__` receive `null` on their next bus
 * callback and fall back to demo mode.
 */
declare function stopSampleSound(): void;
/** Query whether the sample sound is currently running. */
declare function isSampleSoundPlaying(): boolean;

/**
 * useWorkspaceFile — Phase 10.2 Task 01.
 *
 * React hook surfacing a `WorkspaceFile` snapshot + its writer from the
 * module-level store. Backed by `useSyncExternalStore` (React 18+) for
 * correct concurrent-mode semantics with zero extra deps.
 *
 * @remarks
 * The `getSnapshot` returned to React is `() => getFile(id)`. Because the
 * store replaces entries instead of mutating them (see WorkspaceFile.ts
 * "Snapshot identity contract"), the reference returned by `getFile` is
 * stable across unrelated changes. React's tearing-detection will not
 * throw, and components that subscribe to a different file id will not
 * re-render when this file changes.
 *
 * The `setContent` callback is bound to the current `id` via `useCallback`
 * so that consumers can pass it as a dep without defeating memoization.
 */

/**
 * The return shape of `useWorkspaceFile`. `file` is `undefined` until a
 * file is registered with `createWorkspaceFile(id, …)` for this id, to let
 * consumers render a loading/fallback state without requiring eager
 * registration.
 */
interface UseWorkspaceFileResult {
    file: WorkspaceFile | undefined;
    setContent: (content: string) => void;
}
declare function useWorkspaceFile(id: string): UseWorkspaceFileResult;

/**
 * WorkspaceAudioBus — Phase 10.2 Task 02.
 *
 * Multi-publisher, consumer-routed audio bus. Pattern runtimes (Strudel,
 * SonicPi, future engines) `publish` their `engine.components` bag under
 * their `WorkspaceFile.id`; viz consumers (HYDRA_VIZ, P5_VIZ, popout
 * windows) `subscribe` with an `AudioSourceRef` selector — `'default'`
 * (follow most recent), `{ kind: 'file', fileId }` (pin), or `'none'`
 * (demo mode). Per CONTEXT D-02 / D-04 / U1.
 *
 * @remarks
 * ## Why a singleton (per CONTEXT U1)
 *
 * The bus is a module-level constant export, mirroring the `VizPresetStore`
 * precedent in `visualizers/vizPreset.ts`. Every `import` resolves to the
 * same instance, no class-per-shell. Multi-shell support (one bus per
 * `WorkspaceShell` instance) is deferred to Phase 11 if it ever arrives —
 * the `WorkspaceAudioBus` interface in `types.ts` documents the contract
 * abstractly so a class-based variant can be slotted in without churning
 * consumers.
 *
 * ## Why a recency LIST, not a single "current default"
 *
 * The pre-mortem (PLAN.md §10.2-02 secondary failure) calls out the easy
 * mistake: tracking the default as a single slot. Then this happens —
 *
 * 1. A publishes → default = A.
 * 2. B publishes → default = B (more recent).
 * 3. B unpublishes → default = null. **Wrong.** A is still publishing.
 *
 * The fix is to keep the recency as an ORDERED ARRAY: push on publish,
 * splice on unpublish. The "current default" is always
 * `recency[recency.length - 1]`, and `null` only when the list is empty.
 * This file's `recency` and `defaultPayload()` implement that contract.
 *
 * ## Why identity equality, not deep equality
 *
 * D-01 specifies "subscribe + re-mount" — the bus delivers ONE callback per
 * publisher identity change, not per audio frame. If the runtime pushes a
 * new payload object every audio tick, deep-equal would walk a non-trivial
 * graph and re-fire spuriously when sub-objects change for unrelated
 * reasons. Instead, we shallow-compare the public component slots
 * (`hapStream`, `analyser`, `scheduler`, `inlineViz`, `audio`). If every
 * slot reference matches, the publish is a no-op — same engine, same
 * audio nodes, no observable change. This keeps the bus out of the
 * per-frame FFT read path; consumers reach into `payload.analyser`
 * directly for that.
 *
 * ## What the bus does NOT own
 *
 * The bus stores `AudioPayload` records that hold REFERENCES to live
 * `AnalyserNode` / `HapStream` / `PatternScheduler` instances created
 * inside engines. The bus never creates, copies, or routes audio. PV3
 * (orbits) and UV6 (observation without mutation) are respected by
 * reference-passing — no audio routing changes happen here.
 *
 * ## Test isolation
 *
 * `__resetWorkspaceAudioBusForTests()` clears every internal collection.
 * Same pattern as `__resetWorkspaceFilesForTests()` from Task 01. Tests
 * call this in `beforeEach`.
 */

/**
 * The workspace audio bus singleton. Imported as a const, never
 * instantiated. Mirrors the `VizPresetStore` const-export precedent in
 * `visualizers/vizPreset.ts`. Multi-shell support is deferred to Phase 11
 * (per CONTEXT U1) and would replace this with a class-per-shell behind
 * the same `WorkspaceAudioBus` interface.
 */
declare const workspaceAudioBus: WorkspaceAudioBus;

/**
 * LiveCodingRuntime — Phase 10.2 Task 05.
 *
 * Per-file runtime that wraps a `LiveCodingEngine` with the workspace audio
 * bus publish/unpublish lifecycle. One runtime per workspace file id; the
 * runtime owns the engine, owns any elevated `BufferedScheduler`, and is
 * responsible for keeping the bus's view of "this file is playing" in sync
 * with the engine's actual state.
 *
 * @remarks
 * ## Why this lives in `workspace/runtime/` and not `engine/`
 *
 * The engine layer (`packages/editor/src/engine/`) defines the
 * `LiveCodingEngine` interface and ships concrete engines (`StrudelEngine`,
 * `SonicPiEngine`, `DemoEngine`). It knows nothing about the workspace,
 * the audio bus, or react. The runtime is the bridge: it lives in the
 * workspace layer because it depends on `workspaceAudioBus`, `WorkspaceFile`
 * snapshot identity, and the workspace concept of a "file id" — but it
 * never reaches into engine internals. The boundary is one-way: workspace
 * imports from engine, never the other way.
 *
 * ## What this file MUST NOT do (PV1, PV2, P1, P2)
 *
 * - It MUST NOT touch `Pattern.prototype`. All Strudel Pattern method
 *   wrappers are installed inside `StrudelEngine.evaluate()`'s `.p` setter
 *   trap. Re-installing them here would either no-op (if installed before
 *   `injectPatternMethods`, which the engine calls during `evaluate`) or
 *   silently break the engine's own wrappers (if installed after, which
 *   would race the engine's restoration in its `finally` block).
 *
 *   This restriction is enforced by a source-grep test in
 *   `__tests__/strudelRuntime.test.tsx` — the assertion fails if any of
 *   `Pattern.prototype` shows up in any runtime/ source file.
 *
 * - It MUST NOT mutate `file.content` before passing to `engine.evaluate`.
 *   Strudel's transpiler reifies string arguments (P1) — the EXACT string
 *   the engine sees is load-bearing. Any "preview validation" or
 *   "sanitization" in this layer breaks `.viz()` reification, mini-notation
 *   parsing, and `setcps()` extraction in unpredictable ways.
 *
 * - It MUST NOT install its own `.viz()` interceptor. The engine already
 *   captures viz requests in `engine.components.inlineViz.vizRequests` after
 *   `evaluate()` resolves; the runtime forwards the captured map through
 *   the bus payload's `inlineViz` slot. Task 07's EditorView reads from
 *   there to materialize Monaco view zones.
 *
 * ## Lifecycle (PK1)
 *
 * The `play()` method is the only nontrivial sequence in this file. The
 * nine-step lifecycle is documented in `LiveCodingRuntime` interface
 * JSDoc in `types.ts`. The two ordering constraints worth restating here:
 *
 *   - **`evaluate` MUST resolve before `engine.components` is read.** The
 *     engine populates `inlineViz.vizRequests` and `queryable.scheduler`
 *     during `evaluate`. Reading `components` mid-`evaluate` returns a
 *     half-baked bag.
 *   - **`bus.publish` MUST happen before `engine.play`.** Subscribers (viz
 *     consumers, the EditorView's inline-zone effect) need the payload in
 *     hand BEFORE the first hap event fires. If we published after
 *     `engine.play()`, the first cycle of audio events would land in a
 *     subscriber that hasn't been wired to a HapStream yet.
 *
 * Between step 4 (`evaluate` resolves) and step 7 (`bus.publish`), there
 * must be no `await`. A microtask boundary at that point would let another
 * `play()` invocation interleave its own evaluate and corrupt the
 * components view we're about to publish. Steps 5 and 6 are pure object
 * construction and synchronous BufferedScheduler instantiation; both are
 * safe.
 *
 * ## BufferedScheduler elevation (S8)
 *
 * Sonic Pi (and any future engine that ships streaming + audio without a
 * native queryable) does not provide a `PatternScheduler` in
 * `engine.components.queryable`. The runtime detects this on every play
 * and lazily constructs a `BufferedScheduler` wrapping the engine's
 * `HapStream` and `AudioContext`. The elevated scheduler is held on
 * `bufferedSchedulerRef` so `dispose()` can release it. On engines that
 * DO ship a native queryable, the elevated ref stays `null` and the
 * native scheduler is forwarded directly through the payload.
 *
 * ## Error semantics (S7)
 *
 * Two error sources flow through the runtime:
 *
 *   1. **Evaluate errors** — `engine.evaluate(code)` returns
 *      `{ error: Error }`. The runtime fires `onError` listeners and
 *      returns the error from `play()`. The bus is NOT touched (no
 *      publish, no unpublish-on-error).
 *   2. **Runtime audio errors** — the engine's
 *      `setRuntimeErrorHandler(cb)` fires AFTER `play()` succeeded, when
 *      a scheduled event hits a sound-not-found or similar runtime
 *      condition. The runtime forwards these to its own `onError`
 *      listeners as well. Audio keeps playing — these are not fatal,
 *      just visible diagnostics.
 *
 * The chrome subscribes to `onError` for the toolbar error badge; Task 07's
 * EditorView subscribes for Monaco squiggle markers via `setEvalError`.
 * Both consume the same event source, no two-way coupling.
 */

/**
 * Subscribe-to-file function shape. Callers supply one if they want the
 * runtime's live mode (`setAutoRefresh(true)`) to actually do anything —
 * otherwise live mode is a no-op (useful in tests that don't want to
 * stand up a full `WorkspaceFile` store).
 *
 * The callback fires on EVERY content change for the runtime's file id,
 * including changes that originate from `play()`'s own `evaluate` call
 * (which does not write back, so this is fine in practice). The returned
 * disposer is called by the runtime when it tears down the subscription.
 */
type SubscribeToRuntimeFile = (cb: () => void) => () => void;
/**
 * Constructor argument shape. Kept as a positional triple rather than an
 * options object because the contract is small and stable: a runtime is
 * defined entirely by its file id, the engine it wraps, and the function
 * that returns the file's current content at evaluate time.
 *
 * @param fileId - The workspace file id this runtime publishes under.
 *   Used both as the bus key and as the address for `dispose()` cleanup.
 * @param engine - The engine instance this runtime wraps. The runtime
 *   takes ownership; the caller MUST NOT dispose this engine independently.
 * @param getFileContent - Closure that returns the current file content
 *   at the moment `play()` is called. Passing a closure (rather than a
 *   string) lets the runtime stay decoupled from `useWorkspaceFile` /
 *   the workspace store — tests can pass a static string, the live
 *   compat shim can pass `() => getFile(fileId)?.content ?? ''`. This
 *   keeps the runtime testable in a plain Node environment.
 */
declare class LiveCodingRuntime implements LiveCodingRuntime$1 {
    readonly engine: LiveCodingEngine;
    readonly fileId: string;
    private readonly getFileContent;
    private readonly subscribeToFile;
    private bufferedSchedulerRef;
    private isInitialized;
    private isDisposed;
    private currentBpm;
    private isPlayingState;
    private readonly errorListeners;
    private readonly playingChangedListeners;
    private readonly evaluateSuccessListeners;
    /**
     * Unregister callback from the playback coordinator. Called in
     * `dispose()` to remove this runtime from the registry so its
     * stop callback can't be invoked after the runtime has been torn
     * down. Set in the constructor so every instance participates in
     * single-source playback coordination from birth.
     */
    private unregisterFromPlaybackCoordinator;
    private autoRefreshEnabled;
    private autoRefreshUnsub;
    private autoRefreshTimeout;
    private readonly autoRefreshChangedListeners;
    constructor(fileId: string, engine: LiveCodingEngine, getFileContent: () => string, subscribeToFile?: SubscribeToRuntimeFile | null);
    init(): Promise<void>;
    /**
     * The nine-step play lifecycle (PK1). See class JSDoc above.
     *
     * Returns the evaluate error if any (also fires `onError` listeners).
     * The bus is left untouched on error — no publish, no unpublish.
     */
    play(): Promise<{
        error: Error | null;
    }>;
    /** Whether this runtime is currently playing (for the time-travel re-eval, #204). */
    getIsPlaying(): boolean;
    stop(): void;
    dispose(): void;
    /**
     * Enable or disable live mode for this runtime.
     *
     * When enabled AND the runtime is currently playing AND a
     * `subscribeToFile` function was provided at construction time, the
     * runtime installs a subscription on the workspace file that
     * debounce-triggers `play()` (which re-evaluates the current content)
     * on every content change.
     *
     * When disabled or stopped, the subscription is torn down and any
     * pending debounce timeout is cleared — so toggling OFF mid-burst is
     * immediate, not "finish the pending re-play first."
     *
     * Idempotent — calling with the already-set value is a no-op and does
     * not fire the `onAutoRefreshChanged` listeners. Never throws; disposed
     * runtimes silently ignore the call.
     */
    setAutoRefresh(enabled: boolean): void;
    /** Current live-mode state. */
    isAutoRefreshEnabled(): boolean;
    /**
     * Subscribe to live-mode state changes. Fires after `setAutoRefresh`
     * mutations, with the new enabled value. Returns an idempotent
     * unsubscribe. Used by the chrome to re-render the live-mode toggle
     * without having to poll.
     */
    onAutoRefreshChanged(cb: (enabled: boolean) => void): () => void;
    /**
     * Install or tear down the file-content subscription so that its
     * presence matches `(autoRefreshEnabled && isPlayingState &&
     * subscribeToFile !== null)`. Called from `setAutoRefresh`, `play`,
     * `stop`, and `dispose`.
     *
     * Installing the subscription is idempotent — calling reconcile while
     * already subscribed is a no-op. Tearing down is likewise idempotent.
     */
    private reconcileAutoRefresh;
    /**
     * Debounced re-evaluate trigger. Called by the file subscription
     * callback on every content change. Cancels any pending timeout and
     * schedules a new one; when it fires, checks the invariants once more
     * (dispose/stop/toggle-off may have happened mid-debounce) and calls
     * `play()` to re-evaluate and re-schedule.
     */
    private onLiveModeContentChanged;
    private fireAutoRefreshChanged;
    onError(cb: (err: Error) => void): () => void;
    onPlayingChanged(cb: (playing: boolean) => void): () => void;
    onEvaluateSuccess(cb: () => void): () => void;
    getBpm(): number | undefined;
    /**
     * Current cycle position from the engine's pattern scheduler, or `null`
     * when the scheduler is unavailable (engine not initialized, transport
     * stopped, non-Strudel runtime). The IR Inspector timeline strip's
     * per-tick tooltip falls back to wall-clock when this returns `null`.
     *
     * Phase 19-08 (#85). RESEARCH §2.
     */
    getCurrentCycle(): number | null;
    /**
     * #384 — raw scheduler clock, ungated by `isPlayingState`. The seek math
     * needs the live wall-clock cycle at the instant the user clicks. Returns
     * `null` only when the engine exposes no scheduler. Used by
     * `seekTo`/`getSongPosition`.
     */
    private rawSchedulerNow;
    /**
     * #384 — seek the transport to song-cycle `targetCycle`. Sets the engine's
     * transport offset to `now - targetCycle` (so `songPosition` becomes
     * `targetCycle`) and re-evaluates via `play()` — the existing hot-swap
     * path — which re-applies the `.late(offset)` wrap at the engine's `.p`
     * seam. No-op on engines without `setTransportOffset` (non-Strudel) or
     * before the scheduler exists.
     *
     * AUDIO NOTE: the audible jump is not observable in the test harness — the
     * clock + no-error are; the audio half needs a manual check (design §10).
     */
    seekTo(targetCycle: number): Promise<{
        error: Error | null;
    }>;
    /**
     * #384 — current SONG position in cycles: `scheduler.now() - transportOffset`.
     * The full-song timeline playhead reads this (vs `getCurrentCycle`'s raw
     * window clock). Gated on `isPlayingState` like `getCurrentCycle` so the
     * playhead clears on stop. `null` on non-Strudel engines / when stopped.
     */
    getSongPosition(): number | null;
    /**
     * Engine-owned HapStream, or `null` when the engine doesn't expose one
     * (non-Strudel runtimes / not yet initialized). Mirrors `getCurrentCycle`'s
     * shape — read-through accessor over the engine's components.
     *
     * Phase 20-06 — consumed by MusicalTimeline (closure-bound accessor pattern
     * via StrudelEditorClient → StaveApp's `getHapStreamRef`) so the timeline
     * can subscribe to live hap dispatch and glow rows on real fires
     * (PV38 / PK13 step 8 — musician half).
     */
    getHapStream(): HapStream | null;
    /**
     * Backdrop viz requested by a non-underscore Strudel viz method
     * (e.g. `.scope()`, `.pianoroll()`) during the last evaluate, or `null`.
     * Read-through accessor over the engine's components, mirroring
     * `getHapStream`. Consumed by StrudelEditorClient → StaveApp, which maps
     * the resolved renderer id to a project viz file and pins it as the
     * backdrop (the "set bg" UI then auto-updates from `backgroundFileId`).
     */
    getBackdropVizRequest(): string | null;
    /** Phase 20-07 — explicit user-driven pause. Engine pauses scheduler. */
    pause(): void;
    /** Phase 20-07 — resume after pause (or breakpoint hit). */
    resume(): void;
    /** Phase 20-07 — current debugger pause state (false on engines without pause). */
    getPaused(): boolean;
    /**
     * Phase 20-07 — subscribe to engine pause-state transitions. Returns a
     * disposer. No-op disposer when the engine doesn't implement
     * onPausedChanged (non-Strudel runtimes).
     */
    onPausedChanged(listener: (paused: boolean) => void): () => void;
    /**
     * Phase 20-07 — accessor onto the engine's BreakpointStore. Returns
     * null when the engine doesn't expose one (non-Strudel runtimes / not
     * yet initialized). Mirrors `getHapStream`'s shape.
     */
    getBreakpointStore(): BreakpointStore | null;
    private fireOnError;
    private firePlayingChanged;
    private fireEvaluateSuccess;
}

/**
 * Live coding runtime provider registry — Phase 10.2 Task 05.
 *
 * Module-level Map keyed by file extension. Provider registration is
 * idempotent on extension; calling `registerRuntimeProvider(p)` for an
 * extension that already has a provider replaces the previous entry. This
 * matches the `VizPresetStore` precedent (the singleton store pattern Phase
 * 10.2 follows for every workspace registry — see `WorkspaceAudioBus.ts`'s
 * "Why a singleton" remark for the rationale).
 *
 * @remarks
 * ## Extension keying convention
 *
 * Keys include the leading dot (`.strudel`, `.sonicpi`). Mirrors how Node
 * and most editors talk about file extensions, and avoids the "is `.foo`
 * or `foo` the canonical form?" ambiguity that bites multi-language
 * routers. The lookup helpers normalize on input — callers can pass either
 * `.strudel` or `strudel` and get the same provider back.
 *
 * Each provider may claim multiple extensions (its `extensions` array).
 * `registerRuntimeProvider` registers under every claimed extension. If
 * another provider had previously registered any of those extensions, the
 * later call wins for those keys (a provider that claims `.foo` and `.bar`
 * after a previous provider claimed only `.bar` will overwrite `.bar` and
 * coexist with the previous one on `.foo`).
 *
 * ## Why also key by language
 *
 * Tab dispatch knows the file's language (`WorkspaceFile.language`), not
 * its extension. The two are 1:1 in 10.2 but the indirection lets future
 * languages with multiple extensions (e.g., `.tidal` + `.tidalcycles` →
 * `tidal`) avoid extension-leak through the chrome-resolution path. The
 * registry keeps a parallel `Map<language, provider>` so language-keyed
 * lookups stay O(1).
 *
 * ## Test isolation
 *
 * `resetRuntimeRegistryForTests()` clears the maps. Same pattern as
 * `__resetWorkspaceAudioBusForTests` — tests in `__tests__/` call this in
 * `beforeEach` to avoid cross-test leakage when one test registers a
 * provider another test doesn't expect.
 */

/**
 * Register a provider under every extension it claims AND its language id.
 * Calling for the same extension twice replaces the previous provider for
 * THAT extension only — other extensions are unaffected. This is the
 * "registration is idempotent on key" semantics every workspace registry
 * uses.
 */
declare function registerRuntimeProvider(provider: LiveCodingRuntimeProvider): void;
/**
 * Look up a provider by file extension. Accepts either dotted (`.strudel`)
 * or undotted (`strudel`) form. Returns `undefined` if no provider is
 * registered for the extension.
 */
declare function getRuntimeProviderForExtension(extension: string): LiveCodingRuntimeProvider | undefined;
/**
 * Look up a provider by workspace language id (e.g., `'strudel'`,
 * `'sonicpi'`). The shell's per-tab chrome resolution uses this — the tab
 * carries a language string (via `WorkspaceFile.language`), not an
 * extension. Returns `undefined` if no provider is registered for the
 * language.
 */
declare function getRuntimeProviderForLanguage(language: string): LiveCodingRuntimeProvider | undefined;
/**
 * The full registry as a read-only Map keyed by extension. Used by Task 09
 * (compat shims) and Task 10 (app rewire) when wiring `chromeForTab` —
 * those callers iterate the registry to discover the set of pattern-file
 * languages currently registered. The map is intentionally immutable from
 * the caller's perspective: mutation goes through `registerRuntimeProvider`
 * so both maps stay in sync.
 */
declare const liveCodingRuntimeRegistry: ReadonlyMap<string, LiveCodingRuntimeProvider>;

/**
 * STRUDEL_RUNTIME — Phase 10.2 Task 05.
 *
 * The `LiveCodingRuntimeProvider` for `.strudel` files. Wraps `StrudelEngine`
 * (untouched), declares its extension/language, and renders the per-tab
 * transport chrome (`▶ ⏹ BPM error chromeExtras`).
 *
 * @remarks
 * ## Pattern.prototype hands-off (PV1, PV2, P1, P2)
 *
 * This file does NOT touch `Pattern.prototype`. All Strudel Pattern method
 * interception lives inside `StrudelEngine.evaluate()`'s setter trap. The
 * runtime is a thin wrapper around `engine.play()` / `engine.stop()` /
 * `engine.evaluate()` plus bus publish/unpublish — nothing more.
 *
 * The constraint is enforced by a source-grep test in
 * `__tests__/strudelRuntime.test.tsx` — the assertion fails if any of
 * `Pattern.prototype` shows up in this file or `LiveCodingRuntime.ts`.
 * The grep is the canary for the most likely failure mode (P2): a future
 * maintainer reading "the runtime owns chrome AND engine wrapping" and
 * deciding to "own" the viz interceptor here too.
 *
 * ## Chrome rendering
 *
 * `renderChrome(ctx)` returns a small React component (`StrudelChrome`)
 * that renders the transport bar. The component is a function call, not a
 * class, so each invocation produces a fresh element with its own
 * lifecycle — the embedder mounts it inside the EditorView's `chromeSlot`
 * via Task 09's wiring.
 *
 * The component intentionally does NOT subscribe to `runtime.onError` or
 * `runtime.onPlayingChanged` itself — it reads from `ctx` directly. The
 * embedder (Task 09's compat shim) holds the subscription state and
 * passes the latest values through `ChromeContext`. This keeps the
 * provider stateless and lets the same chrome render in environments
 * (Task 09's `StrudelEditor` shim) where the embedder already has those
 * values from elsewhere (e.g., its own `useState`).
 *
 * The visual style mirrors the legacy `Toolbar.tsx` look so the
 * cutover is byte-comparable in screenshots. Inline styles only — no
 * import from `Toolbar.tsx` because the legacy toolbar bundles an export
 * button into its surface, and Phase 10.2 routes the export button
 * through `chromeExtras` instead (per U8). Reusing the legacy component
 * would force the export button into the chrome at the wrong layer.
 */

declare const STRUDEL_RUNTIME: LiveCodingRuntimeProvider;

/**
 * SONICPI_RUNTIME — Phase 10.2 Task 05.
 *
 * The `LiveCodingRuntimeProvider` for `.sonicpi` files. Wraps `SonicPiEngine`
 * (the adapter at `engine/sonicpi/adapter.ts`, which itself wraps the
 * standalone `sonicPiWeb` engine via a CDN-loaded SuperSonic backend).
 *
 * @remarks
 * ## Pattern.prototype hands-off (PV1, PV2, P1, P2)
 *
 * Sonic Pi has its own viz capture path inside `engine/sonicpi/adapter.ts`
 * (`parseVizRequests` / `stripVizCalls`). Like the Strudel runtime, this
 * file does NOT touch any prototype, does NOT install viz interceptors,
 * does NOT mutate `file.content` before evaluation. The runtime is a
 * passthrough.
 *
 * ## BufferedScheduler elevation (S8)
 *
 * Sonic Pi's adapter exposes streaming + audio in `engine.components` but
 * does NOT populate `queryable`. The `LiveCodingRuntime.play()` lifecycle
 * detects this and lazily constructs a `BufferedScheduler` wrapping the
 * adapter's `HapStream` and the underlying `AudioContext`. Inline view
 * zones for `.sonicpi` files use that elevated scheduler. The wiring is
 * automatic — this runtime provider does not need to opt in.
 *
 * ## Chrome rendering
 *
 * Same `▶ ⏹ BPM error chromeExtras` shape as `STRUDEL_RUNTIME`. BPM
 * extraction relies on the same `setcps()` regex inside
 * `LiveCodingRuntime`, which Sonic Pi files do not typically use — the
 * runtime returns `undefined` for `getBpm()` on Sonic Pi code, and the
 * chrome silently omits the BPM display. A future Sonic Pi BPM source
 * (e.g., `use_bpm 120` extraction) is a follow-up task; the chrome's
 * conditional rendering already handles `bpm === undefined` correctly.
 */

declare const SONICPI_RUNTIME: LiveCodingRuntimeProvider;

/**
 * Preview provider registry — Phase 10.2 Task 06.
 *
 * Module-level Map keyed by file extension. Mirrors the runtime provider
 * registry in `workspace/runtime/registry.ts` line-for-line — same
 * extension-normalization rules, same language parallel map, same test-only
 * reset helper. The duplication is deliberate: the two registries serve
 * different concerns (runtime = executable languages, preview = visual
 * output) and keeping them in lockstep at the API level makes callers (Task
 * 09's compat shims, Task 10's app rewire) symmetric across the two.
 *
 * @remarks
 * ## Extension keying convention
 *
 * Keys include the leading dot (`.hydra`, `.p5`). Mirrors how Node and
 * most editors talk about file extensions. The lookup helpers normalize
 * on input — callers can pass either `.hydra` or `hydra` and get the
 * same provider back.
 *
 * Each provider may claim multiple extensions (its `extensions` array).
 * `registerPreviewProvider` registers under every claimed extension. If
 * another provider had previously registered any of those extensions, the
 * later call wins for those keys.
 *
 * ## Why also key by language
 *
 * Tab dispatch knows the file's language (`WorkspaceFile.language`), not
 * its extension. The two are 1:1 in 10.2 (hydra↔hydra, p5↔p5js) but the
 * indirection lets future languages with multiple extensions avoid
 * extension-leak through the preview-resolution path. The registry keeps
 * a parallel `Map<language, provider>` so language-keyed lookups stay
 * O(1).
 *
 * Languages recognized by the 10.2 built-in providers:
 *   - `'hydra'` → HYDRA_VIZ
 *   - `'p5js'` → P5_VIZ
 *
 * ## MARKDOWN_HTML is NOT registered here
 *
 * Per CONTEXT U7, the markdown provider is deferred to Phase 10.3. The
 * slot for `.md` in the registry is intentionally open — when no provider
 * matches a preview request, `PreviewView`'s caller (Task 09/10) shows the
 * "No preview provider registered" fallback. Don't add a markdown stub
 * here "just in case"; the gap IS the spec.
 *
 * ## Test isolation
 *
 * `resetPreviewRegistryForTests()` clears the maps. Matches the runtime
 * registry's `resetRuntimeRegistryForTests`. Tests call this in
 * `beforeEach` to avoid cross-test leakage when one test registers a
 * provider another test doesn't expect.
 */

/**
 * Register a preview provider under every extension it claims AND every
 * mapped language id. Calling for the same extension twice replaces the
 * previous provider for THAT extension only — other extensions are
 * unaffected. Same "registration is idempotent on key" semantics as the
 * runtime registry.
 */
declare function registerPreviewProvider(provider: PreviewProvider): void;
/**
 * Look up a provider by file extension. Accepts either dotted (`.hydra`)
 * or undotted (`hydra`) form. Returns `undefined` if no provider is
 * registered for the extension.
 */
declare function getPreviewProviderForExtension(extension: string): PreviewProvider | undefined;
/**
 * Look up a provider by workspace language id (e.g., `'hydra'`, `'p5js'`).
 * The shell's per-tab preview resolution uses this — the tab carries a
 * language string (via `WorkspaceFile.language`), not an extension.
 * Returns `undefined` if no provider is registered for the language.
 */
declare function getPreviewProviderForLanguage(language: string): PreviewProvider | undefined;
/**
 * The full registry as a read-only Map keyed by extension. Used by Task 09
 * (compat shims) and Task 10 (app rewire) when enumerating providers at
 * startup. The map is intentionally immutable from the caller's
 * perspective: mutation goes through `registerPreviewProvider` so both
 * maps stay in sync.
 */
declare const previewProviderRegistry: ReadonlyMap<string, PreviewProvider>;

/**
 * HYDRA_VIZ — Phase 10.2 Task 06 preview provider for `.hydra` files.
 *
 * Thin adapter on top of `createCompiledVizProvider`. The shared helper
 * owns the compile-on-reload + mount-on-mount mechanics; this file just
 * declares the HYDRA identity:
 *
 *   - extensions: `.hydra`
 *   - label:       `'Hydra Visualization'`
 *   - renderer:    `'hydra'` (fed to `compilePreset`)
 *
 * Inherits D-03 (`keepRunningWhenHidden: false`) and D-07 (`reload:
 * 'debounced'`, `debounceMs: 300`) from the helper. Demo-mode fallback
 * (P7) is handled by `HydraVizRenderer`'s internal fallback chain — see
 * `compiledVizProvider.tsx` for the full rationale.
 *
 * @remarks
 * The entire body is one function call because hydra and p5 share the
 * reload lifecycle. A future format with different reload semantics
 * (e.g., GLSL with a "recompile only on save" button) would NOT use this
 * path — it would call the registry directly with its own render
 * function.
 */
declare const HYDRA_VIZ: PreviewProvider;

/**
 * P5_VIZ — Phase 10.2 Task 06 preview provider for `.p5` files.
 *
 * Thin adapter on top of `createCompiledVizProvider`. See
 * `hydraViz.tsx` for the rationale — the two providers are mirror images
 * of each other, and all the machinery lives in the shared helper.
 *
 *   - extensions: `.p5`
 *   - label:       `'p5 Visualization'`
 *   - renderer:    `'p5'` (fed to `compilePreset`)
 *
 * Demo-mode fallback (P7) works via the bundled p5 template's
 * `scheduler?.now() ?? 0` / `scheduler?.query(...) ?? []` optional-chaining
 * paths — when `ctx.audioSource` is null, the empty component bag means
 * `scheduler` is `null` and the user code hits its else branches
 * naturally. No provider-level overlay needed.
 */
declare const P5_VIZ: PreviewProvider;

/**
 * GLSL_VIZ — preview provider for `.glsl` files (issue #287).
 *
 * Thin adapter on top of `createCompiledVizProvider`, the mirror image of
 * `p5Viz.tsx` / `hydraViz.tsx` — all the machinery (compile-on-reload, the
 * stable-descriptor memo, the editor chrome) lives in the shared helper. This
 * is the editor surface for the GLSL renderer (issue #281): a `.glsl` file's
 * source is a ShaderToy `mainImage` or raw `void main()`, fed straight to
 * `compilePreset` → `makeGLSLRenderer`.
 *
 *   - extensions: `.glsl`
 *   - label:       `'GLSL Visualization'`
 *   - renderer:    `'glsl'` (fed to `compilePreset`)
 *
 * Demo-mode (no attached pattern) works the same as p5/hydra: with an empty
 * component bag the shader still animates off `iTime` and simply reads a silent
 * `iChannel0` / zero `u*` uniforms — no provider-level overlay needed.
 */
declare const GLSL_VIZ: PreviewProvider;

/**
 * vizPresetBridge — Phase 10.2 Task 06.
 *
 * Two small functions that bridge between the persisted `VizPresetStore`
 * (IndexedDB, Phase 10.1 artifact) and the in-memory `WorkspaceFile` store
 * (Phase 10.2 editing layer). Per CONTEXT S6: the two stores are NOT
 * continuously synced — they're bridged explicitly at tab-creation time
 * and at save-time, and nothing in between.
 *
 *   - `seedFromPreset(preset)` — read a preset and create a WorkspaceFile
 *     with the preset's code. Called by Task 09's viz editor compat shim
 *     on tab open, and by Task 10's app startup sequence when restoring
 *     the open-tab set.
 *
 *   - `flushToPreset(fileId, presetId)` — read the current file content
 *     from the workspace store and write it back to the preset store via
 *     `VizPresetStore.put`. Called by Task 09 when the user hits Ctrl+S
 *     inside a viz editor tab.
 *
 * @remarks
 * ## Why a dedicated bridge module
 *
 * Phase 10.1's `VizEditor.tsx` loads presets directly into its own tab
 * state (`VizEditor.tsx:136-148` today). Post-refactor, that coupling
 * dies — the editor doesn't know about `VizPresetStore`, and the
 * provider doesn't know about the file store beyond its `ctx.file`
 * snapshot. Something has to stitch the two sides at the bookends of a
 * file's lifetime. That something is this file.
 *
 * Both functions are pure data utilities — no React, no UI, no bus
 * subscription. Task 09 (the editor compat shim) mounts them into the
 * Ctrl+S keyboard handler. Task 10 (the app rewire) calls them on
 * startup. This file itself never renders anything.
 *
 * ## Language mapping
 *
 * `VizPreset.renderer` is either `'hydra'` or `'p5'`. `WorkspaceLanguage`
 * is either `'hydra'` or `'p5js'` (the extra `js` comes from the Monaco
 * language id that the p5 editor uses for syntax highlighting, which is
 * `p5js` not `p5`). We map at the boundary — callers don't need to know
 * the quirk.
 *
 * ## File id generation
 *
 * `seedFromPreset` returns the workspace file id so callers can track
 * which file belongs to which preset. The id is derived from the preset
 * id with a `viz:` prefix to avoid collisions with pattern file ids
 * (which use their extension as a hint) and with the bundled-preset
 * prefix. This keeps the two-store bridge visible at a glance in
 * debugging output — `viz:__bundled_piano_roll_hydra__` immediately
 * tells you "this workspace file was seeded from the piano-roll bundled
 * preset."
 *
 * Re-seeding the same preset is safe: `createWorkspaceFile` overwrites
 * the existing entry and notifies subscribers, so the editor view
 * picks up the fresh content on the next render.
 *
 * The `presetId` is stashed in `WorkspaceFile.meta.presetId` as a
 * back-reference so tests and future callers can read it without
 * having to re-parse the file id. The `meta` bag is the documented
 * escape hatch for per-file metadata that doesn't belong on the
 * store's public API.
 */

/**
 * Workspace file id derivation from a preset id. Namespaced with `viz:`
 * so that file ids are self-describing in debug output.
 */
declare function workspaceFileIdForPreset(presetId: string): string;
/**
 * Seed a `WorkspaceFile` from a `VizPreset`. The file id is derived from
 * the preset id; path is `${preset.name}.${preset.renderer}`; content is
 * the preset code; language is mapped via `languageForPresetRenderer`;
 * `meta.presetId` is set as a back-reference.
 *
 * Returns the workspace file id so callers can push it into a tab
 * descriptor without recomputing it.
 *
 * @remarks
 * ## Why this function is synchronous
 *
 * The caller passes a `VizPreset` object directly — the IndexedDB read
 * happens at the caller's layer (`VizPresetStore.getAll()` at app
 * startup, or `VizPresetStore.get(id)` for a specific preset). Keeping
 * the seed itself synchronous lets the Task 09 compat shim call it
 * inside a React `useEffect` without an async dance, and lets tests
 * exercise it without touching IndexedDB.
 *
 * The async variant — `seedFromPresetId(id)` — is a one-liner on top
 * of this function; see below.
 */
declare function seedFromPreset(preset: VizPreset): string;
/**
 * Async convenience: fetch a preset by id from the IndexedDB-backed
 * `VizPresetStore`, then seed a workspace file from it. Returns the
 * workspace file id, or `undefined` if the preset does not exist.
 *
 * This is the path Task 10 calls on app startup when it needs to hydrate
 * the open-tab set from persisted ids. Tests that want to avoid
 * IndexedDB should use the synchronous `seedFromPreset(preset)` form
 * with an in-memory preset object.
 */
declare function seedFromPresetId(presetId: string): Promise<string | undefined>;
/**
 * Read the current content of a workspace file and write it back to the
 * viz preset store. Caller supplies both the file id (identifying which
 * workspace file to flush) and the preset id (identifying which preset
 * entry to overwrite) — these are usually the same up to the `viz:`
 * prefix, but keeping them separate lets a future "save-as" flow write
 * to a different preset id from the file's origin.
 *
 * Returns a promise that resolves once the IndexedDB write completes.
 * On unknown file id the function is a no-op and resolves immediately —
 * the user hitting Ctrl+S on a dead tab should not throw.
 *
 * Updates `updatedAt` to the current time. `createdAt` and `id` are
 * preserved from the existing preset entry to keep persistence stable
 * across saves. If the preset does not yet exist in the store (e.g.,
 * first save of a brand-new file), the preset is created with
 * `createdAt` set to `updatedAt`.
 *
 * @remarks
 * ## Why the caller supplies the preset id
 *
 * `WorkspaceFile.meta.presetId` stores the back-reference (see
 * `seedFromPreset`), but meta is opaque typed (`Record<string,
 * unknown>`) so callers have to read it themselves. Requiring the
 * preset id as an explicit argument removes that bookkeeping from this
 * function and keeps the signature type-safe.
 */
declare function flushToPreset(fileId: string, presetId: string): Promise<void>;
/**
 * Read-only helper: given a workspace file, return the preset id it was
 * seeded from (if any). Useful for tests and for Task 09 when it needs
 * to know whether a tab is backed by a persisted preset.
 */
declare function getPresetIdForFile(file: WorkspaceFile): string | undefined;

/**
 * namedVizBridge — compile + register helpers for viz presets.
 *
 * This is the higher-level wrapper that `vizPresetBridge` deliberately
 * avoids being. It imports `compilePreset` (which transitively loads
 * the p5 / hydra renderer stack), so any test or module that wants to
 * stay decoupled from the renderer pack should import from
 * `vizPresetBridge` instead.
 *
 * @remarks
 * ## Why a separate file
 *
 * The plain `vizPresetBridge` is a pure data utility — tests exercise
 * it without mocking the renderer chain. Adding `compilePreset` to its
 * imports broke unit tests by transitively pulling in p5 (which imports
 * gifenc, which fails in vitest's ESM loader). Keeping the compile +
 * register combo in a sibling file that only the app layer / compat
 * shims import preserves the test isolation while still giving
 * consumers a one-line API for "make this preset resolvable by name."
 */

/**
 * Compile a preset into a `VizDescriptor` and register it in the
 * `namedVizRegistry` under `preset.name`. Subsequent inline lookups
 * via `resolveDescriptor` (e.g., `.viz("my-preset")`) will resolve to
 * this compiled descriptor.
 *
 * On compile error, unregisters any stale entry for the same name and
 * returns `false`. Returns `true` on successful registration.
 *
 * Callers:
 *   - App layer `StrudelEditorClient` — after seeding bundled presets
 *     and after saving via Ctrl+S, so the user's inline references
 *     keep working across code edits.
 *   - `VizEditor` compat shim — after `seedFromPreset` loads
 *     persisted presets from `VizPresetStore`.
 *
 * Idempotent for same-preset calls: registering the same descriptor
 * twice is a no-op. Registering a DIFFERENT descriptor for the same
 * name replaces the entry (so saves pick up fresh code).
 *
 * `name` defaults to `preset.name` but can be overridden to register
 * under a renderer-qualified key (e.g. `"scope:hydra"`) when two presets
 * share a basename — see the `mode:renderer` convention in
 * `resolveDescriptor`. This keeps the bare mode name reserved for the
 * default renderer instead of last-write-wins between p5 and hydra.
 */
declare function registerPresetAsNamedViz(preset: VizPreset, name?: string): boolean;

/**
 * Shared event store for every runtime's info / warn / error messages.
 *
 * Goal: one stream of structured log entries that multiple UI surfaces
 * subscribe to — toast on new errors, status-bar LED counting new
 * entries since last opened, Monaco inline markers on the offending
 * file, and a dedicated Console panel with history + filters. Each
 * runtime (Strudel, Sonic Pi, p5.js, Hydra) emits through the same
 * `emitLog` entry point so downstream consumers don't need per-runtime
 * special-casing.
 *
 * The store keeps a bounded history (MAX_HISTORY most recent entries).
 * Listeners are fired synchronously on emit so UI surfaces can update
 * in the same microtask as the runtime error handler.
 */
type LogLevel = 'info' | 'warn' | 'error';
type RuntimeId = 'strudel' | 'sonicpi' | 'p5' | 'hydra' | 'glsl'
/** Stave-itself errors (engine init, host-side failures). */
 | 'stave';
/**
 * "Did you mean X?" hint produced by the friendly-error formatter from
 * a fuzzy match against the runtime's `DocsIndex`. Carried on the log
 * entry so every UI surface (toast, console row, Monaco marker) can
 * render it the same way.
 */
interface LogSuggestion {
    /** Canonical symbol name (e.g. `noise`). */
    name: string;
    /** In-app docs page for the suggested symbol. */
    docsUrl: string;
    /** One-line example if the DocsIndex carried one. */
    example?: string;
    /** First-sentence description if present. */
    description?: string;
}
interface LogEntry {
    /** Monotonic-ish unique id — used as React key, preserved through history. */
    id: string;
    /** Epoch ms when the entry was emitted. */
    ts: number;
    level: LogLevel;
    runtime: RuntimeId;
    /** Workspace file path this entry originated from, if known. */
    source?: string;
    /** 1-indexed line number inside `source`, if known. */
    line?: number;
    column?: number;
    message: string;
    suggestion?: LogSuggestion;
    /** Raw error stack for the "expand stack" fold. */
    stack?: string;
}
type LogListener = (entry: LogEntry | null, history: readonly LogEntry[]) => void;
/**
 * Signal that a `(runtime, source)` pair has just evaluated cleanly.
 * Live-mode filters use the marker timestamp to hide any log entry
 * emitted BEFORE it — "old errors the user has since fixed".
 */
interface FixedMarker {
    runtime: RuntimeId;
    /** Workspace file path (or omitted → runtime-wide fix). */
    source?: string;
    /** Epoch ms when the fix happened. */
    ts: number;
}
type FixedListener = (marker: FixedMarker, markers: ReadonlyMap<string, number>) => void;
/**
 * Emit a log entry. Returns the full entry (with generated id + ts) so
 * callers can hold a reference for later deduplication or jumping. A
 * `null` listener signal is reserved for `clearLog` / reset — emitLog
 * always passes the emitted entry.
 */
declare function emitLog(partial: Omit<LogEntry, 'id' | 'ts'>): LogEntry;
/**
 * Subscribe to every future log entry. Returns an unsubscribe. Does
 * NOT replay history — consumers that need it should call
 * `getLogHistory()` on mount.
 */
declare function subscribeLog(fn: LogListener): () => void;
/**
 * Read the current history in chronological order. Safe to mutate the
 * returned array; we give back a frozen slice of the internal buffer.
 */
declare function getLogHistory(): readonly LogEntry[];
/**
 * Empty the history and fire a `null` notification so subscribers can
 * reset their local state (clear marker maps, zero the LED counter).
 */
declare function clearLog(): void;
/**
 * Record that `(runtime, source)` just evaluated cleanly. Non-destructive:
 * history is preserved. Consumers (the Console panel's Live mode) use
 * the marker timestamp to hide entries emitted before the fix. Called
 * from the runtime's `onEvaluateSuccess` bridge.
 */
declare function emitFixed(input: {
    runtime: RuntimeId;
    source?: string;
}): FixedMarker;
/**
 * Subscribe to fix events. Does NOT replay existing markers — call
 * `getFixedMarkers()` on mount if a starting snapshot is needed.
 */
declare function subscribeFixed(fn: FixedListener): () => void;
/** Read the current fix-marker table. Key format: `${runtime}:${source|*}`. */
declare function getFixedMarkers(): ReadonlyMap<string, number>;
/** Key helper exported for consumers that need to build the same key. */
declare function makeFixedKey(runtime: RuntimeId, source: string | undefined): string;

/**
 * Bridge engineLog → Monaco inline markers.
 *
 * Every log entry that carries `source` + `line` places a squiggle on
 * the matching file's Monaco model. `emitFixed` clears all log-driven
 * squiggles for that `(runtime, source)` pair — so a clean re-eval
 * immediately retires the prior error's marker, matching Live mode's
 * Console-panel behaviour at the inline surface.
 *
 * Owner namespace: `stave-log`. Deliberately different from the
 * `stave` owner used by `setEvalError` (driven by EditorView's `error`
 * prop for Strudel/Sonic Pi's existing in-prop error pipeline), so the
 * two paths don't clobber each other when they agree on a line — the
 * user just sees the line highlighted, Monaco merges same-owner lists
 * but shows different-owner markers stacked.
 *
 * The bridge is a module-level subscriber that installs once. Call
 * `installEngineLogMarkers()` from shell init; subsequent calls are
 * no-ops. Unsubscribes are not exposed — the bridge's lifetime matches
 * the process.
 */
/** Wire the bridge. Idempotent. */
declare function installEngineLogMarkers(): void;

/**
 * Global error floor — the structural safety net under every
 * per-runtime bridge.
 *
 * The observe-then-patch pattern (fix the Strudel path, then p5, then
 * Hydra, then the factory swallow, then the p5 `hitCriticalError`
 * halt…) happens because each runtime has its own wrapping and its
 * own error-eating paths. Bridging each one catches errors we already
 * know about; it doesn't stop the next unknown swallow.
 *
 * This module installs two listeners on `window` that catch whatever
 * escapes any bridge:
 *
 *   - `error`              — every uncaught synchronous throw.
 *   - `unhandledrejection` — every rejected promise with no handler.
 *
 * Both forward into `emitLog` so the Console panel, toast,
 * status-bar chip, and Monaco squiggle (when a line + source is
 * known) surface the error. The bridges remain useful — they
 * enrich the message with friendly hints, attribute the right
 * source, and translate wrapper line offsets — but they are no
 * longer the ONLY way an error becomes visible. If we miss a
 * runtime-specific hint, the user still sees a raw entry.
 *
 * Dedupe: the underlying `emitLog` already collapses consecutive
 * identical entries, so a tight per-frame flood from a draw-loop
 * throw becomes one Console row + one counting toast.
 */
/**
 * Attach the global listeners. Idempotent; safe to call on every
 * editor mount. No-op on non-browser environments so SSR / test
 * graphs don't trip.
 */
declare function installGlobalErrorCatch(): void;

/**
 * IR Inspector store — the latest parsed-and-collected snapshot from
 * the most recent successful Strudel eval. Subscribed by the IR
 * Inspector panel; emitted by `StrudelEditorClient`'s eval hook.
 *
 * Why a tiny purpose-built store instead of reusing engineLog: the
 * payload is structurally different (a tree + an event array, not a
 * sequence of log lines) and the UI semantics are different too —
 * Console keeps history, Inspector keeps only the latest.
 */

interface IRSnapshot {
    /** Epoch ms when the snapshot was captured. */
    ts: number;
    /** Workspace file path the source came from, if known. */
    source?: string;
    /** Runtime that produced this snapshot — only Strudel for v0. */
    runtime: RuntimeId;
    /** The raw user code that was parsed. */
    code: string;
    /** Per-pass IR snapshots, in execution order. IR-shaped only — collected events live in `events`. */
    passes: readonly {
        readonly name: string;
        readonly ir: PatternIR;
    }[];
    /** Alias of `passes[passes.length - 1].ir`. Publishers MUST keep these in sync. */
    ir: PatternIR;
    /** Collected events for one cycle window starting at t=0. */
    events: IREvent[];
    /** Lookup: irNodeId → IREvent. PV38 clause 1.
     *  Built at publish time by enrichWithLookups; ReadonlyMap enforces
     *  PV33 (snapshot immutability post-publish). */
    irNodeIdLookup: ReadonlyMap<string, IREvent>;
    /** Lookup: `${loc[0].start}:${loc[0].end}` → IREvent[]. Used by
     *  engine-side hap matching (normalizeStrudelHap); haps don't carry
     *  the hash, only the loc. ReadonlyMap enforces PV33. */
    irNodeLocLookup: ReadonlyMap<string, IREvent[]>;
    /** Lookup: 1-based Monaco line number → leaf irNodeIds whose
     *  loc[0] starts on that line. PV38 phase-20-07 use; built once
     *  at publish time by enrichWithLookups; ReadonlyMap enforces PV33.
     *  Empty map when no events carry both irNodeId and loc. Used by
     *  Monaco gutter click → leaf-set resolver for breakpoint
     *  registration (Phase 20-07). PV37 alignment: events without
     *  irNodeId never appear in this index. */
    irNodeIdsByLine: ReadonlyMap<number, readonly string[]>;
}
/** Input shape for publishIRSnapshot — caller does not construct lookups;
 *  the publisher enriches via enrichWithLookups. Type-system enforces
 *  this contract (Trap 9 mitigation — caller cannot bypass the publisher). */
type IRSnapshotInput = Omit<IRSnapshot, 'irNodeIdLookup' | 'irNodeLocLookup' | 'irNodeIdsByLine'>;
type Listener$2 = (snap: IRSnapshot | null) => void;
/**
 * Publish a snapshot. Two parallel side-effects fire on every publish
 * (PK9 step 8 — order independent, both must run):
 *  1. captureSnapshot fan-out — pushes into the timeline ring buffer
 *     (timelineCapture.ts) so past evals can be scrubbed.
 *  2. listener fan-out — single-slot consumers (the IR Inspector
 *     panel's live subscribe) re-render with the new snapshot.
 *
 * The optional `meta` parameter carries cycle position (read by the
 * publisher from `runtime.getCurrentCycle()`) onto the capture entry.
 * Existing callers pass no `meta` and continue to compile; capture
 * defaults `cycleCount` to `null` in that case.
 */
declare function publishIRSnapshot(snap: IRSnapshotInput, meta?: {
    cycleCount?: number | null;
}): void;
declare function clearIRSnapshot(): void;
declare function getIRSnapshot(): IRSnapshot | null;
declare function subscribeIRSnapshot(fn: Listener$2): () => void;

/**
 * BottomPanel — reusable bottom-drawer component for the editor surface.
 *
 * Mounted by `WorkspaceShell` below the groups area. Hosts a tab bar
 * with one active tab + a body. Tab content is contributed externally
 * via `bottomPanelRegistry` (DA-05); PR-A seeds a placeholder
 * "Timeline" tab so the surface is reviewable before PR-B fills it.
 *
 * Closed-state pixel cost: ~29px (28px header + 1px top border). When
 * zero tabs are registered the component returns `null` (true zero
 * shift — Trap 2). Default open=false so existing users see only the
 * 29px header strip until they expand the drawer.
 *
 * Persistence: height + open + activeTabId hydrate from localStorage in
 * `useState` initializers (Trap 7 — no first-paint flicker). Writes
 * happen in commit-time effects + a pagehide flush for the height.
 *
 * Audience: musician (PV35). Vocabulary lock (PV32 / D-06): the only
 * strings PR-A introduces are "Hide panel" / "Show panel" /
 * "Bottom panel" / "Bottom panel tabs" / "Resize bottom panel". Tab
 * titles are sourced from the registry (PR-A's seed uses "Timeline").
 *
 * Phase 20-01 PR-A.
 */

declare function BottomPanel(): React.ReactElement | null;

/**
 * bottomPanelRegistry — module-level singleton registry of tabs that the
 * BottomPanel component renders.
 *
 * Mirrors the activity-bar panel registry shape at
 * `packages/app/src/panels/registry.ts` (DA-05). Idempotent register
 * (re-registering by id REPLACES the existing entry) so a re-mount /
 * hot-reload doesn't double-up tabs.
 *
 * `listBottomPanelTabs()` returns a FRESH array on every call (PV34) so
 * React subscribers using `useMemo([])` or shallow-prop comparison don't
 * go stale on register/unregister.
 *
 * `__resetBottomPanelRegistryForTest` is intentionally NOT exported from
 * the top-level barrel — it's test-internal. Tests import directly from
 * this module path. (Trap 9 — vitest test isolation.)
 *
 * Phase 20-01 PR-A.
 */

interface BottomPanelTab {
    readonly id: string;
    /** User-facing tab title. Vocabulary discipline (PV32 / PV35) is the
     *  responsibility of the registering caller — the registry stores
     *  whatever string it's given. */
    readonly title: string;
    /** Optional codicon name without the `codicon-` prefix. */
    readonly icon?: string;
    /**
     * Tab body. Either a ReactNode rendered directly, or a function that
     * returns one (function form lets a future tab defer expensive mount
     * until first activation). PR-A always uses the ReactNode form.
     */
    readonly content: React.ReactNode | (() => React.ReactNode);
}
type Listener$1 = () => void;
/**
 * Register a tab. Idempotent — re-registering by `id` REPLACES the
 * existing entry (matches activity-bar `registerPanel` semantics, lets
 * PR-B re-register `'musical-timeline'` to swap the placeholder for the
 * real component without an explicit unregister).
 *
 * Returns an unsubscribe function that removes the tab IF it's still the
 * registered one (a later replace is the new owner).
 */
declare function registerBottomPanelTab(tab: BottomPanelTab): () => void;
/** Remove a tab by id. No-op if the id isn't registered. */
declare function unregisterBottomPanelTab(id: string): void;
/**
 * Fresh array of all registered tabs (insertion order). PV34 — never
 * cache between renders without subscribing.
 */
declare function listBottomPanelTabs(): readonly BottomPanelTab[];
/** Direct lookup by id. */
declare function getBottomPanelTab(id: string): BottomPanelTab | undefined;
/**
 * Subscribe to register / unregister / replace events. Listener fires
 * with no arguments — consumers re-read `listBottomPanelTabs()`.
 */
declare function subscribeToBottomPanelTabs(cb: Listener$1): () => void;

/**
 * currentCycle — a tiny accessor registry for the live transport cycle.
 *
 * The visual-editing panels are seeded inside the editor package and have no
 * direct line to the per-file runtime that owns the scheduler clock (that lives
 * in the app's StrudelEditorClient). The app already computes a "current cycle"
 * accessor for the MusicalTimeline; it registers the same accessor here so the
 * bottom-panel grids (Sequencer / Piano Roll) can read the playing cycle and
 * highlight the active step — independent of which bottom-panel tab is open
 * (so they can't rely on the Timeline's own rAF, which pauses when another tab
 * is active).
 *
 * Mirrors the active-editor registry shape: one process-wide accessor, set by
 * the app, read by the panels. Returns null when nothing is playing or no
 * accessor is registered.
 */
type CycleAccessor = () => number | null;
/** App registers the live-cycle accessor (or null to clear). */
declare function setCurrentCycleAccessor(fn: CycleAccessor | null): void;
/** Current transport cycle, or null when not playing / no accessor. */
declare function readCurrentCycle(): number | null;

/** The literal combinator name — round-trip identity (PV122 #3). */
type ArrangeMode = 'arrange' | 'cat' | 'slowcat';
/** Per-arm source ranges within a detected combinator call. One arm = one clip. */
interface ArrangeArmRange {
    /**
     * Absolute `[start, end)` of the weight number literal — present for
     * `arrange` arms (the `n` in `[n, pat]`), `null` for `cat`/`slowcat` arms
     * (whose weight is an implicit `1`, with no literal to edit).
     */
    weightRange: [number, number] | null;
    /** Absolute `[start, end)` of the arm's pattern expression. */
    patternRange: [number, number];
    /**
     * Absolute `[start, end)` of the WHOLE arm: the `[n, pat]` array for
     * `arrange`, else identical to `patternRange`. This is the unit a
     * reorder/remove/insert op moves.
     */
    armRange: [number, number];
}
/** A detected `arrange(...)`/`cat(...)`/`slowcat(...)` call and its arms. */
interface ArrangeCall {
    mode: ArrangeMode;
    /** Absolute `[start, end)` of the whole `mode(...)` call expression. */
    callRange: [number, number];
    /** Absolute `[start, end)` of the callee identifier (`arrange`/`cat`/…). */
    calleeRange: [number, number];
    /** Absolute `[start, end)` of the argument region between `(` and `)`. */
    argsRange: [number, number];
    /** Arms in source order; clip order is arm order (PV122 #1). */
    arms: ArrangeArmRange[];
}
/**
 * The innermost `arrange|cat|slowcat(...)` call whose range contains `pos`, or
 * null. "Innermost" so a cursor on a clip inside a nested combinator binds THAT
 * combinator (mirrors `chunkDetect.innermostChainUnder`, #395). `pos` is
 * typically `Arrange.arms[i].loc[0].start` — the anchor the IR already carries.
 */
declare function detectArrangeAt(doc: string, pos: number): ArrangeCall | null;
/** Every combinator call in the doc, in source order. For tests / sweeps. */
declare function detectAllArrangeCalls(doc: string): ArrangeCall[];
/**
 * The bare PATTERN expression of the top-level track statement containing `pos`,
 * when that track is NOT already a combinator (so there is no `arrange`/`cat` to
 * reorder). Returns the expression's absolute `[start, end)` — the range §2.1
 * `wrapBare` wraps to INTRODUCE a combinator when a steady pattern is first
 * placed in time (the "move-on-a-bare-track" case).
 *
 * Returns null when: the doc doesn't parse; `pos` isn't inside a top-level
 * expression statement; or that statement already contains a combinator (then
 * `detectArrangeAt` owns the edit). A `$:`/label prefix and any trailing
 * statements are excluded — we return the EXPRESSION range only, so a wrap edits
 * just the pattern and leaves the rest of the line byte-identical.
 */
declare function detectBarePattern(doc: string, pos: number): {
    patternRange: [number, number];
} | null;

/**
 * arrange/serialize — structural ops on a detected combinator call.
 *
 * Each op is PURE: it takes an `ArrangeCall` (from `arrange/parse`) + the live
 * doc text and returns `OffsetEdit[]` addressed by pre-edit absolute offsets —
 * the exact shape `writeback.replaceRanges` consumes. We edit TEXT, not the IR:
 * `toStrudel` is a whole-statement canonical regenerator that would reformat
 * the leaf layer, so (like `notation/serialize`) we never call it. That is also
 * why #434 (toStrudel mislabels fastcat/Seq as `cat()`) does NOT block this —
 * no op here re-emits through `toStrudel`.
 *
 * Byte-fidelity: `setWeight` on an `arrange` arm changes ONLY the weight digits;
 * the structural ops (reorder/insert/remove/wrap) keep each arm's pattern text
 * verbatim and touch only the combinator scaffolding (callee name, brackets,
 * separators). Inter-arm separators normalise to `, ` on a reorder — that IS
 * the targeted region.
 *
 * No Monaco, no runtime IR import (P172).
 */

/**
 * Set arm `i`'s cycle weight to `weight`.
 *
 *  - On an `arrange` node: replace ONLY the weight literal — byte-minimal.
 *  - On a `cat`/`slowcat` node: weight 1 is a no-op (their implicit weight).
 *    A weight ≠ 1 PROMOTES the node to `arrange` (PV122 #3 — `cat` can't
 *    express weights): rename the callee and wrap every arm `pat` → `[w, pat]`
 *    (the target arm gets `weight`, the rest get `1`), keeping each pattern's
 *    bytes verbatim.
 */
declare function setWeight(doc: string, call: ArrangeCall, i: number, weight: number): OffsetEdit[];
/**
 * Move arm `from` to index `to`. Rebuilds the argument list in the new order,
 * each arm's text verbatim, joined by `, `. (Clip order = arm order, PV122 #1.)
 */
declare function reorderArm(doc: string, call: ArrangeCall, from: number, to: number): OffsetEdit[];
/**
 * Insert `armSource` as a new arm at index `at` (clamped to `[0, arms.length]`).
 * The caller supplies a well-formed arm: a `[n, pat]` tuple for an `arrange`
 * node, a bare pattern for `cat`/`slowcat`.
 */
declare function insertArm(doc: string, call: ArrangeCall, at: number, armSource: string): OffsetEdit[];
/**
 * Remove arm `i`, taking one adjacent `, ` separator with it. Refuses to empty
 * the combinator — a lane must keep ≥ 1 clip (PV122 #5); removing a sole arm is
 * a delete-the-whole-track op handled elsewhere, so this returns no edits.
 */
declare function removeArm(doc: string, call: ArrangeCall, i: number): OffsetEdit[];
/**
 * §2.1 "introduce the combinator". A bare steady pattern has no `arrange` to
 * edit; the first time it is placed in time it must be WRAPPED:
 *   `pattern`  →  `arrange([leadingWeight, silence], [patternWeight, pattern])`
 * `patternRange` is the bare pattern's absolute `[start, end)` (e.g. a chunk's
 * `exprRange`). The pattern's bytes are preserved verbatim between the inserts.
 */
declare function wrapBare(patternRange: [number, number], leadingWeight: number, patternWeight: number): OffsetEdit[];
/**
 * Split arm `i` at a whole-cycle boundary: `[n, pat]` → `[n₁, pat], [n₂, pat]`
 * (same pattern verbatim in both halves), where `n₁ = firstWeight` and
 * `n₂ = n − firstWeight`. Both halves must be ≥ 1 whole cycle, so this only
 * applies to an `arrange` arm whose weight is ≥ 2; `firstWeight` is clamped to
 * `[1, n−1]`. Returns no edits for a `cat`/`slowcat` arm (implicit weight 1 —
 * a single cycle can't be sliced into two whole cycles) or a weight-1 arm.
 */
declare function splitArm(doc: string, call: ArrangeCall, i: number, firstWeight: number): OffsetEdit[];

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
interface StepGridModel {
    /** total columns across all bars */
    steps: number;
    /** cycles the pattern spans via `<...>` alternation; absent = a single cycle */
    bars?: number;
    /**
     * Lanes in presentation order. `sound` is the whole token incl. any
     * `:variant` (e.g. `bd:3`). `part` is the top-level `,`-stack the lane was
     * written in (absent = 0) — purely syntactic, kept so a hand-written stack
     * round-trips as the user wrote it instead of being flattened.
     */
    lanes: StepLane[];
    /**
     * Per-COLUMN velocity, length `steps`, indexed by serialized column (NOT by
     * lane — a stacked `[bd,sn]` column shares one gain). `1` is neutral; a model
     * with every gain at `1` (or `gains` absent) emits no `.gain`. Read from /
     * written to a parallel `.gain("v1 v2 …")` mini aligned to the columns the
     * grid serializes (rest columns serialize as `~`). Only single-part,
     * single-bar grids carry gain in the first cut; richer shapes leave any
     * existing `.gain` untouched (see `serializeStepGain`).
     */
    gains?: number[];
    /**
     * Set when a `.gain("…")` string was present on read-back but did NOT align
     * to the grid columns (wrong length, a broadcast `.gain("0.8")`, an `@`/`*`
     * we didn't write). The grid then leaves that `.gain` byte-identical and the
     * velocity drag is disabled — we never delete a gain we didn't author.
     */
    gainForeign?: boolean;
}
interface StepLane {
    sound: string;
    part?: number;
    cells: boolean[];
}
/** A single note in the piano roll. */
interface RollNote {
    /** note token, e.g. `c3`, `eb4` */
    pitch: string;
    /** column index where the note begins */
    start: number;
    /** length in columns (1 = one step; emitted as `@n` elongation) */
    duration: number;
    /**
     * Per-note velocity. `1` (or absent) is neutral and emits no `.gain`. Chord
     * members sharing a `start` share one gain (like duration); on read-back the
     * group's gain is applied to all its members. Written to a parallel
     * `.gain("…")` mini that mirrors the note sequence's group/`@n`/rest
     * structure. Only single-bar rolls carry gain in the first cut.
     */
    gain?: number;
}
/** Pitched (melodic) grid: notes placed on a pitch × time grid. */
interface PianoRollModel {
    /** total columns across all bars */
    steps: number;
    /** cycles the pattern spans via `<...>` alternation; absent = a single cycle */
    bars?: number;
    notes: RollNote[];
    /** see `StepGridModel.gainForeign` — a `.gain` we read but don't manage. */
    gainForeign?: boolean;
}
/**
 * Parse outcome. `ok: false` is a first-class result, not an exception — every
 * panel checks it on open and disables itself (code-only) when the pattern is
 * outside the editable subset.
 */
type ParseResult<M> = {
    ok: true;
    model: M;
} | {
    ok: false;
    reason: string;
};

/**
 * Mini-notation (strict editable subset) → notation models.
 *
 * Self-contained tokenizer rather than `@strudel/mini` or Stave's `parseMini`:
 * the full parser builds an IR that only round-trips through `toStrudel`'s
 * canonical regenerator (the very reformatting text-writeback exists to
 * avoid), and it accepts idioms the visual grids can't represent. A narrow
 * tokenizer that rejects everything outside the subset is exactly what the
 * round-trip guarantee needs.
 *
 * Supported: flat sequences of atoms (`bd`, `bd:3`, `c3`), rests (`~`),
 * `[bd,hh]` simultaneous stacks, `[hh hh]` sub-sequences (expanded onto a
 * uniform finer grid), `@n` elongation (roll), a whole-string `<...>`
 * alternation with one slot per bar, and top-level `,` stacks (grid only,
 * parts preserved). Everything else → `{ ok: false }`.
 */

declare function parseStepGrid(mini: string): ParseResult<StepGridModel>;
declare function parsePianoRoll(mini: string): ParseResult<PianoRollModel>;

/**
 * Notation models → mini-notation. The round-trip law (golden-tested):
 *   serialize(parse(s).model) === s   for canonical strings
 *   parse(serialize(m)).model ≡ m
 *
 * Canonical form: single-space separated, lanes in first-appearance order,
 * multi-bar patterns as a whole-string `<...>` alternation (one slot per bar),
 * `,`-stack parts in ascending part order. Serializing a model the subset
 * can't express (overlapping roll notes, a note straddling a bar line) returns
 * null and the panel keeps the document untouched.
 */

declare function serializeStepGrid(model: StepGridModel): string;
declare function serializePianoRoll(model: PianoRollModel): string | null;

/**
 * Note-token ↔ MIDI helpers for the piano roll's vertical axis.
 *
 * Numeric convention matches the engine's `noteToMidi` (`c3 = 48`,
 * `eb4 = 63`). Accidentals accept Strudel's three spellings on read — `#`,
 * `b`, and `s` (`cs3`) — and emit `#` on write. Conversion only feeds row
 * placement and newly-created notes; the round-trip itself stores the token
 * verbatim, so emission style never threatens fidelity for existing notes.
 */
/** `c3` / `c#3` / `cs3` / `eb4` → MIDI number, or null if not a note token. */
declare function pitchToMidi(token: string): number | null;
/** MIDI number → canonical note token (sharps as `#`). Inverse of pitchToMidi. */
declare function midiToPitch(midi: number): string;
/** Is this MIDI pitch a black key (for striping the roll's pitch rows)? */
declare function isBlackKey(midi: number): boolean;

/**
 * Insert a note into a roll, resolving overlaps so the result stays a flat,
 * tileable sequence (what the serializer requires). DAW-style resolution:
 *  - a group already at `start` → the note joins the chord, adopting its
 *    duration (chord members share one);
 *  - an earlier note sustaining across `start` → it trims to end at `start`;
 *  - the next group (or the grid end) caps the new note's duration.
 */

declare function placeNote(model: PianoRollModel, pitch: string, start: number, duration: number): PianoRollModel;

/**
 * Step-count changes. A flat mini string spans one cycle, so step count is the
 * note value (8 steps → 8th notes, 16 → 16ths):
 *
 *  - "spread" (default): preserve musical time — 8→16 moves a hit at step i to
 *    step 2i, so it sounds identical at finer resolution; shrinking quantizes
 *    hits onto the coarser grid (any hit in a bucket keeps the bucket on).
 *  - "pad": preserve step indices — append/truncate at the end, stretching or
 *    compressing the groove (hardware "pattern length" semantics).
 *
 * Multi-bar (`<...>`) patterns don't resize — their column resolution is fixed
 * by the bar groups — so both functions return the model unchanged.
 */

type ResizeMode = 'spread' | 'pad';
declare function resizeGrid(model: StepGridModel, nextSteps: number, mode: ResizeMode): StepGridModel;
declare function resizeRoll(model: PianoRollModel, nextSteps: number, mode: ResizeMode): PianoRollModel;

/**
 * VisualEditStandby — the empty state every write-back panel shows when there
 * is nothing editable to bind to (no pattern under the cursor, or the pattern
 * is outside the panel's editable subset).
 *
 * This is a first-class state, not a placeholder: the design's conservatism
 * rule (§4, §6) says a panel that can't safely round-trip a pattern stays in
 * standby rather than guess. The scaffold seeds all three tabs with it; each
 * panel swaps in its live UI when a compatible chunk is in focus, and falls
 * back here otherwise.
 *
 * Vocabulary discipline (PV32 / D-06): musician-facing copy only, no IR jargon.
 */

interface VisualEditStandbyProps {
    /** the panel id, used for a stable test hook */
    panel: string;
    /** one-line musician-facing hint, e.g. "Click a pattern to edit its knobs." */
    hint: string;
    /** optional codicon name (without the `codicon-` prefix) for the glyph */
    icon?: string;
}
declare function VisualEditStandby({ panel, hint, icon, }: VisualEditStandbyProps): React.ReactElement;

/**
 * Mixer — the first write-back visual editor (#381).
 *
 * Finds the Strudel statement under the cursor (via `useActiveChunk`) and
 * renders a Knob for every numeric argument in its method chain (`.gain(0.6)`
 * → a "gain" knob at 0.6). Dragging a knob writes a surgical text edit of just
 * that literal through the tagged `Writeback` — the mini-notation and the rest
 * of the statement stay byte-identical, and the whole drag is one undo step.
 * Audio updates through the existing live-mode re-eval.
 *
 * Shows a standby state when the cursor isn't in a chunk with editable knobs
 * (the conservatism rule).
 */

declare function Mixer(): React.ReactElement;

/**
 * Sequencer — drum/step grid (#382, per-column velocity #409).
 *
 * Parses the mini-notation of the `s(...)` / `sound(...)` statement under the
 * cursor into a `StepGridModel` and renders lanes × steps. Toggling a cell
 * re-serializes the model and writes it back over the mini-notation range
 * (`'seq'`); a drag paints multiple cells as ONE undo step. Anything outside
 * the editable grid subset (`{}`, `/`, …) → standby, code-only — the
 * conservatism rule.
 *
 * Velocity: an ON cell shows its level as a bottom-anchored fill; dragging it
 * vertically sets the column's gain (DAW velocity-lane behaviour — drag down to
 * soften). The level is written to a parallel `.gain("…")` mini aligned to the
 * serialized columns; when every column returns to neutral the `.gain` is
 * removed. Gain is single-part / single-bar only; richer shapes keep toggling
 * but the `.gain` is left untouched.
 *
 * The model lives in component state, not derived per-render from the chunk, so
 * a lane the user clears completely keeps its row. The model is reseeded only
 * on EXTERNAL edits — see `useGridModel`.
 */

declare function SequencerGrid(): React.ReactElement;

/**
 * Piano Roll — note grid (#383, drag-move + range stability from #391).
 *
 * Parses the mini-notation of the `note(...)` / `n(...)` statement under the
 * cursor into a `PianoRollModel` and renders pitch rows × step columns.
 * Interactions:
 *   - click an empty cell → place a note (one step; overlaps resolved);
 *   - click a note → remove it;
 *   - drag a note → move it in pitch + time (duration preserved), one undo;
 *   - drag a note's right-edge handle → resize its duration (`@n`), one undo.
 * Each edit re-serializes and writes back over the mini range (`'roll'`); a
 * serialization the subset can't express (e.g. a move that would overlap) is
 * dropped, leaving the document untouched — the conservatism rule.
 *
 * The visible pitch range is sticky within a binding: it expands to fit notes
 * but never shrinks when notes are removed, and resets only when the cursor
 * moves to a different statement (#391) — so editing doesn't make rows jump.
 */

declare function PianoRollGrid(): React.ReactElement;

/**
 * Pattern — the single adaptive visual-editing panel (#398).
 *
 * One tab that follows the cursor instead of three the musician has to choose
 * between. The chain head decides which grid editor the focused pattern needs
 * (`patternKind`): a drum pattern (`s`/`sound`) gets the Sequencer step grid, a
 * melody (`note`/`n`) gets the Piano Roll, and anything else shows a standby
 * hint. The Mixer is pinned on the right for whatever is focused — it edits the
 * numeric chain args of any pattern, so it stays constant across the switch.
 *
 * This is pure composition: SequencerGrid / PianoRollGrid / Mixer keep their
 * own binding, write-back and standby behaviour unchanged. Each binds the
 * active chunk independently through useActiveChunk, so they all converge on
 * the same pattern under the cursor; this panel only picks which grid mounts.
 *
 * There is no "both grids at once" case — a chunk is drum XOR melody, and the
 * cursor→chunk binding resolves exactly one chain.
 */

declare function PatternPanel(): React.ReactElement;

/**
 * patternKind — the single discriminator that decides which grid editor a
 * chunk belongs to. The chain head function is mutually exclusive: `s`/`sound`
 * make a drum/step pattern (Sequencer), `note`/`n` make a melodic pattern
 * (Piano Roll). A chunk is exactly one of these or neither — never both — so
 * the adaptive Pattern panel can pick one grid from this alone.
 *
 * One home so the Sequencer, Piano Roll, and the Pattern panel that switches
 * between them can't drift on what counts as drum vs melody (PV108 spirit).
 */

/** the sequencer only edits sound/sample patterns; notes go to the Piano Roll */
declare function isStepChunk(chunk: ChunkInfo): boolean;
/** the piano roll only edits melodic patterns */
declare function isRollChunk(chunk: ChunkInfo): boolean;
type PatternKind = 'step' | 'roll' | null;
/** which grid editor (if any) the chunk under the cursor maps to */
declare function patternKind(chunk: ChunkInfo | null): PatternKind;

/**
 * Per-method knob ranges for the Mixer (S4).
 *
 * Each numeric chain argument becomes a knob; the method name picks a sensible
 * range and step (gain 0..1, speed −2..2, lpf log 20..20k, …). Unknown methods
 * fall back to a range derived from the current value so any numeric literal is
 * still draggable — the user can always type an exact value in code.
 *
 * Pure — no Monaco, no React.
 */
interface KnobRange {
    min: number;
    max: number;
    step: number;
    /** 'log' methods (filter cutoffs) map the slider position logarithmically */
    scale: 'linear' | 'log';
}
/**
 * The knob range for a method given the literal's current value. Known methods
 * use the override table; unknown methods get a range that comfortably
 * contains the current value so the knob is still usable.
 */
declare function knobRangeFor(method: string, value: number): KnobRange;

/**
 * Knob — a draggable dial over a single numeric value.
 *
 * Vertical drag (or up/down arrows) changes the value across its range; the
 * Mixer maps each change to a surgical text edit of the underlying literal.
 * Accessible as a `slider` (aria-valuemin/max/now) so it's keyboard-usable and
 * Playwright-observable.
 *
 * Reports `onChange(value)` live during a drag and brackets the gesture with
 * `onGestureStart` / `onGestureEnd` so the Mixer can coalesce the whole drag
 * into one undo step.
 */

interface KnobProps {
    label: string;
    value: number;
    range: KnobRange;
    onChange: (value: number) => void;
    onGestureStart?: () => void;
    onGestureEnd?: () => void;
}
declare function Knob({ label, value, range, onChange, onGestureStart, onGestureEnd, }: KnobProps): React.ReactElement;

/**
 * Single source of truth for the visual-editing bottom-panel tab.
 *
 * The scaffold seeds this as a standby tab alongside "Timeline"; the live
 * Pattern panel re-registers the id (idempotent replace) with its UI. Keeping
 * id/title/hint/icon here means the seed and the real panel agree on identity
 * and musician-facing copy without duplication.
 *
 * Since #398 there is ONE adaptive visual-editing tab — "Pattern" — that
 * switches between the Sequencer and Piano Roll grids and pins the Mixer. The
 * title carries NO IR jargon (PV32 / D-06): "Pattern" is what a musician calls
 * the thing they're shaping (and Strudel's own vocabulary).
 */
interface VisualEditTabDef {
    readonly id: string;
    readonly title: string;
    /** musician-facing standby hint shown before a pattern is bound */
    readonly hint: string;
    /** codicon name (without the `codicon-` prefix) */
    readonly icon: string;
}
/** the single adaptive visual-editing tab (#398) */
declare const PATTERN_TAB_ID = "pattern";
/**
 * Inner panel ids — no longer separate tabs (#398), but kept as the stable
 * `data-bottom-panel-tab` identity each grid/mixer renders inside the Pattern
 * panel, and as the standby test hook.
 */
declare const SEQUENCER_TAB_ID = "sequencer";
declare const MIXER_TAB_ID = "mixer";
declare const PIANO_ROLL_TAB_ID = "piano-roll";
declare const VISUAL_EDIT_TABS: readonly VisualEditTabDef[];

/**
 * persistence — SSR-safe localStorage helpers for BottomPanel state +
 * the `clampHeight` pure function shared with `useDragResize`.
 *
 * All readers MUST be safe to call from a `useState` initializer
 * (DA-06 + Trap 7). That means: no DOM access without the
 * `typeof window !== 'undefined'` guard, no throws on Safari private
 * mode (where `localStorage.getItem` raises), and a sensible default
 * return on every error path.
 *
 * Constants are exported so Playwright assertions (T-10) and component
 * tests (T-07) can reference the canonical key names.
 *
 * Phase 20-01 PR-A.
 */
declare const BOTTOM_PANEL_HEIGHT_KEY = "stave:bottomPanel.height";
declare const BOTTOM_PANEL_OPEN_KEY = "stave:bottomPanel.open";
declare const BOTTOM_PANEL_ACTIVE_TAB_KEY = "stave:bottomPanel.activeTabId";
declare const BOTTOM_PANEL_HEIGHT_MIN = 80;
declare const BOTTOM_PANEL_HEIGHT_MAX = 600;
declare const BOTTOM_PANEL_HEIGHT_DEFAULT = 240;
/**
 * Read the persisted open state. Default is `false` (closed) — the
 * drawer is opt-in for existing users (Trap 2 — closed-state pixel
 * cost is documented and bounded).
 */
declare function readPersistedOpen(): boolean;
/**
 * Read the persisted active tab id. Returns `null` when missing — the
 * caller decides the fallback (typically the first registered tab).
 * Empty string is treated as null.
 */
declare function readPersistedActiveTabId(): string | null;

/**
 * tabPersistence — SSR-safe localStorage helpers for the WorkspaceShell's
 * full layout snapshot (groups + tabs + per-group active + 2-D pane
 * layout + active group).
 *
 * Mirrors the shape and discipline of `bottomPanel/persistence.ts`:
 *   - Readers MUST be safe to call from a `useState` initializer (no DOM
 *     access without the `typeof window !== 'undefined'` guard, no throws
 *     on Safari private mode where `localStorage.getItem` raises).
 *   - Constants are exported so Playwright assertions can reference the
 *     canonical key names.
 *   - Pure helpers for everything not localStorage-bound, so the shell
 *     and tests can exercise validation without a real storage layer.
 *
 * @remarks
 * ## Scope (issue #175)
 *
 * Persist the full shell state per project — every group's tab set +
 * order, each group's active tab id, the 2-D pane layout (split groups),
 * the active group id, and per-group `backgroundFileId`. On reload, the
 * shell hydrates from this snapshot; on every shell-state change, the
 * snapshot is rewritten.
 *
 * **What's NOT persisted (deliberate):**
 *   - **Preview tabs.** Preview tabs are transient by design (VSCode
 *     parity — open another file in preview mode and the preview slot
 *     replaces). Persisting them would resurrect "stale ghosts" the user
 *     never explicitly pinned. They're filtered out at serialize-time;
 *     editor tabs go through verbatim.
 *   - **Drag/hover/scroll UI state.** Per-frame state isn't a preference.
 *
 * ## Validation on read
 *
 * Persisted state can drift from reality between sessions: a tab's
 * `fileId` may have been deleted in the file tree; a group id in the
 * layout may have been removed; the schema may have changed. The reader
 * validates against the current workspace file list and returns
 * `null` when nothing usable remains (caller falls back to
 * `buildDefaultSnapshot`). This keeps the "if persistence is bad, give
 * the user a sane fresh state" path obvious instead of crashing the
 * shell on a stale fileId.
 *
 * ## Versioning
 *
 * Persisted blobs carry a `version` field so future schema changes can
 * either migrate or fall back without throwing. v1 is the current shape.
 * Mismatched versions return `null` — the user loses tab state once, the
 * shell rebuilds the default, and forward writes use the new version.
 *
 * ## Key shape
 *
 *     stave:workspace:${projectId}:state
 *
 * Project-scoped via `projectId`. The active project is the unit of
 * persistence — switching projects remounts the editor (StaveApp keys by
 * `activeProject.id`) so the shell sees a fresh hydration each time.
 */

/**
 * Canonical localStorage key prefix. Per-project keys append `:${projectId}:state`.
 * Exported so Playwright/integration tests can clear or inspect persisted
 * state without hard-coding the format.
 */
declare const SHELL_STATE_KEY_PREFIX = "stave:workspace:";
/** Schema version of the persisted snapshot. Bump on breaking changes. */
declare const SHELL_STATE_VERSION = 1;
/** Build the full localStorage key for a project. */
declare function shellStateKeyFor(projectId: string): string;
/**
 * The shape stored in localStorage. JSON-friendly — readonly markers
 * from the source types are dropped because JSON has no concept of
 * "mutable vs not."
 */
interface PersistedShellState {
    readonly version: typeof SHELL_STATE_VERSION;
    readonly groups: Record<string, PersistedGroup>;
    /** 2-D pane layout: columns × cells, each cell is a group id. */
    readonly layout: readonly (readonly string[])[];
    readonly activeGroupId: string;
}
interface PersistedGroup {
    readonly id: string;
    /** Editor tabs only. Preview tabs are dropped at write-time. */
    readonly tabs: readonly PersistedEditorTab[];
    readonly activeTabId: string | null;
    readonly backgroundFileId?: string;
    /** Per-pane backdrop opacity override (#350c). Absent → global default. */
    readonly backdropOpacity?: number;
    /** Per-pane backdrop quality override (#350c). Absent → global default. */
    readonly backdropQuality?: BackdropQuality;
}
interface PersistedEditorTab {
    readonly kind: 'editor';
    readonly id: string;
    readonly fileId: string;
    /** Optional in V1 — preview-state-for-an-editor-tab survives across reloads
     *  because it's part of the user's working set, not the transient preview slot. */
    readonly preview?: boolean;
}
/**
 * Snapshot the shell hands to `saveShellState` — same shape the shell's
 * internal state holds. Slimmer than `PersistedShellState` because it
 * uses `Map` and the source `WorkspaceTab` union (with preview tabs the
 * serializer filters out).
 */
interface ShellSnapshot {
    readonly groups: ReadonlyMap<string, WorkspaceGroupState>;
    readonly layout: GroupLayout;
    readonly activeGroupId: string;
}
/**
 * Read the persisted shell state for this project, validate it against
 * the live workspace file list, and return the cleaned snapshot — or
 * `null` if there is no usable state (no key, malformed JSON, schema
 * mismatch, or no live tabs remained after validation).
 *
 * `validFileIds` is consulted at validation time to prune tabs whose
 * underlying file no longer exists.
 *
 * Safe to call from a `useState` initializer (no DOM, no throws).
 */
declare function loadShellState(projectId: string, validFileIds: ReadonlySet<string>): PersistedShellState | null;
/**
 * Pure validator — exported so unit tests can drive arbitrary inputs
 * without touching localStorage.
 *
 * Validation rules:
 *   - Schema version must match.
 *   - Tabs whose `fileId` is not in `validFileIds` are dropped.
 *   - A group's `activeTabId` is reassigned to the first remaining tab
 *     (or null) if the persisted active was pruned.
 *   - A group's `backgroundFileId` is dropped if no longer valid.
 *   - Layout cells referencing groups that no longer exist are removed;
 *     columns that become empty are collapsed.
 *   - If `activeGroupId` is not in the cleaned layout, falls back to the
 *     first group in reading order.
 *   - Returns `null` if the cleaned layout has no groups left — the
 *     caller should rebuild the default in that case.
 *
 * Empty groups (group exists, all tabs pruned) are KEPT — the shell
 * treats empty groups as legal and renders a drop-target placeholder.
 */
declare function validatePersistedState(input: unknown, validFileIds: ReadonlySet<string>): PersistedShellState | null;
/**
 * Serialize the shell's live state into the persisted form, dropping
 * preview tabs (they're transient by design — see header).
 *
 * Pure — exported so tests can exercise the round-trip without
 * localStorage.
 */
declare function serializeShellState(snapshot: ShellSnapshot): PersistedShellState;
/**
 * Write the snapshot to localStorage for this project. SSR-safe and
 * swallows quota/private-mode errors — a failed write degrades to "no
 * persistence this session," not a crash.
 */
declare function saveShellState(projectId: string, snapshot: ShellSnapshot): void;
/**
 * Remove the persisted entry for a project. Used by tests and by
 * "Reset workspace" flows.
 */
declare function clearShellState(projectId: string): void;
/**
 * Build a sane default snapshot for first-launch: a single group with at
 * most one tab — the Strudel pattern file when it exists in the workspace
 * (the natural starting point), otherwise an empty group with a drop-
 * target placeholder.
 *
 * Pure — exported so the caller can use it as the fallback when
 * `loadShellState` returns `null`.
 *
 * Why ONE tab and not zero: the user lands inside an editable Strudel
 * file out of the gate. Zero tabs would force a sidebar click before
 * anything is editable.
 */
declare function buildDefaultSnapshot(newGroupId: string, defaultFileId: string | null): ShellSnapshot;
/**
 * Inverse of `serializeShellState` — used by callers that load a
 * persisted snapshot and want to feed it back into the shell's
 * state shape (Map + GroupLayout + activeGroupId).
 */
declare function hydrateSnapshot(persisted: PersistedShellState): ShellSnapshot;

/**
 * timelineCapture — fixed-size FIFO ring buffer of IRSnapshot captures.
 *
 * Fed by publishIRSnapshot's capture fan-out (irInspector.ts) on every
 * successful eval. Default capacity 30 entries; configurable via
 * setCaptureCapacity (the chrome trace-length input persists capacity in
 * localStorage — entry storage itself is in-memory per CONTEXT D-06).
 *
 * Pin-by-reference contract: UI consumers hold the snapshot reference in
 * React state. FIFO eviction does NOT invalidate the held reference (JS
 * GC keeps it alive as long as the React state holds it). Trap #5
 * mitigation per RESEARCH §7.
 *
 * Defensive immutability: Object.freeze(snap) + Object.freeze(snap.passes)
 * applied at push time (RESEARCH §7 trap #1 mitigation). Shallow only
 * — the IR tree itself is NOT deep-frozen due to recursion cost on
 * large trees.
 *
 * Phase 19-08 (#85). PR-A.
 */

/**
 * Single entry in the capture buffer. `cycleCount` is captured from
 * `runtime.getCurrentCycle()` at publish time and lives on the entry
 * (not on `IRSnapshot`) so PV27's per-snapshot alias contract stays
 * untouched and snapshots remain wire-shaped.
 */
type TimelineCaptureEntry = Readonly<{
    snapshot: IRSnapshot;
    ts: number;
    cycleCount: number | null;
}>;
type Listener = () => void;
/**
 * Push a snapshot into the buffer. Defensive freeze at the snapshot
 * top-level + passes array prevents future code paths from mutating
 * captured state. FIFO eviction drops the oldest entry when capacity
 * is exceeded.
 */
declare function captureSnapshot(snap: IRSnapshot, meta?: {
    ts?: number;
    cycleCount?: number | null;
}): void;
/** Read-only view of the current buffer. Most recent entry is last. */
declare function getCaptureBuffer(): readonly TimelineCaptureEntry[];
/**
 * Subscribe to buffer changes (push, clear, capacity clamp). Listener
 * fires with no arguments — consumers re-read `getCaptureBuffer()`.
 */
declare function subscribeCapture(l: Listener): () => void;
/** Empty the buffer; notify subscribers. */
declare function clearCapture(): void;
/** Current configured capacity (default 30). */
declare function getCaptureCapacity(): number;
/**
 * Set capacity. Clamps existing entries from the oldest if the new
 * capacity is smaller. No-op for non-finite or sub-1 values.
 */
declare function setCaptureCapacity(n: number): void;

/**
 * Shared shape for every runtime's hover/completion documentation index.
 *
 * The goal is one schema across Strudel, Sonic Pi, p5.js, Hydra, and any
 * future runtime, so hover + completion providers are factory-built from
 * the same index — not hand-rolled per runtime.
 */
type DocKind = 'function' | 'method' | 'variable' | 'constant' | 'keyword' | 'synth' | 'sample' | 'fx';
/**
 * A curated friendly-error hint attached to a `RuntimeDoc` (per-symbol)
 * or to `DocsIndex.globalMistakes` (catch-alls). Consulted by
 * `formatFriendlyError` before the Levenshtein fallback.
 *
 * Three detector kinds, ordered by specificity:
 *   - `message` — regex / substring tested against the error's message.
 *   - `code`    — regex / substring tested against a window of user
 *                 source around the throw (caller passes `codeContext`).
 *   - `identifier` — old-name / cross-runtime alias for the
 *                    misspelling-fallback path.
 *
 * `match` accepts a string for forward-compat with JSON-shipped indexes
 * (regex literals don't survive JSON.stringify). Strings are treated as
 * the source of a `RegExp` with the `i` flag.
 */
interface CommonMistake {
    detect: {
        kind: 'message';
        match: string | RegExp;
    } | {
        kind: 'code';
        match: string | RegExp;
    } | {
        kind: 'identifier';
        alias: string;
    };
    /** Friendly one-liner. Renders in place of the raw error. */
    hint: string;
    /** Optional inline example, rendered below the hint. */
    example?: string;
    /**
     * Confidence weight for ranking. Default 1. Bump for runtimes where
     * the curated hint is clearly better than the algorithmic suggestion.
     */
    weight?: number;
}
interface RuntimeDoc {
    /** Callable form, e.g. `note(pattern: string)` or `.fast(n)` */
    signature: string;
    /** Prose description (Markdown allowed). */
    description: string;
    /** Short inline example, shown verbatim. */
    example?: string;
    /** Classification — drives the Monaco completion icon. */
    kind?: DocKind;
    /** Return description, e.g. `Pattern` or `void`. */
    returns?: string;
    /** Topic / category for filtering (e.g. `transform`, `shape`). */
    category?: string;
    /** Permalink into the upstream reference. */
    sourceUrl?: string;
    /**
     * Friendly-error hints scoped to this symbol. Consulted when the user
     * names this symbol but uses it wrong (right name, wrong arg shape /
     * idiom). See `CommonMistake`.
     */
    commonMistakes?: CommonMistake[];
}
interface DocsIndex {
    /** Monaco language id. */
    runtime: string;
    /** Identifier → doc entry. Identifier is the bare name, no `.` prefix. */
    docs: Record<string, RuntimeDoc>;
    /** Optional alias → canonical name map (e.g. `bg` → `background`). */
    aliases?: Record<string, string>;
    /**
     * Catch-alls that don't belong to a specific symbol — runtime-wide
     * gotchas, "you forgot to call play()", scheduler-not-set-up.
     * Matched after per-symbol `commonMistakes`, before the fuzzy fallback.
     */
    globalMistakes?: CommonMistake[];
    /** Provenance for sync scripts and staleness checks. */
    meta?: {
        version?: string;
        fetchedAt?: string;
        source?: string;
        /**
         * Fallback URL for the hover "Reference →" link when an entry has no
         * `sourceUrl` of its own. Useful for runtimes whose docs don't carry
         * stable per-function permalinks (e.g. Strudel).
         */
        docsBaseUrl?: string;
    };
}

/**
 * Turns a raw runtime error into a user-friendly `LogEntry` body.
 *
 * Inspired by p5.js's Friendly Error System (FES). We have a structural
 * advantage — every runtime ships its `DocsIndex` (the same one hover /
 * completion consume), so fuzzy-matching a misspelled identifier back
 * to a real symbol with its docs URL is a lookup, not a hard-coded
 * dictionary.
 *
 * Scope today:
 *   - Extract the offending identifier from a ReferenceError.
 *   - Fuzzy-match it (Levenshtein) against DocsIndex keys.
 *   - Format a friendly message + suggestion record.
 *
 * Not in scope yet:
 *   - Parsing TypeError arg-type mismatches (needs real signature parsing).
 *   - Parsing Sonic Pi's Ruby error format (different error surface).
 *   - Cross-runtime suggestions (*"stack is a Strudel fn; you're in Hydra"*).
 */

interface FriendlyErrorParts {
    /** Short sentence surfacing in toast + console row + Monaco marker. */
    message: string;
    /** Populated when we found a confident fuzzy match in DocsIndex. */
    suggestion?: LogSuggestion;
    /** Underlying stack, copied through so the Console panel can fold it. */
    stack?: string;
    /**
     * 1-based source line parsed from a V8 / Firefox / Safari stack
     * trace when one was present. Feeds the engineLog → Monaco marker
     * bridge — entries without a line get no inline squiggle.
     */
    line?: number;
    /** 1-based column, paired with `line`. */
    column?: number;
}
/**
 * Parse the first user-code line/column out of an error's stack.
 *
 * We only trust frames that clearly originate from a runtime eval
 * path — `<anonymous>` for `new Function` / direct eval, or an
 * explicit `eval at` chain. Matching any `:LINE:COL` pair we see
 * would false-positive on bundled paths (e.g. a stack containing
 * `.../@stave/editor/dist/index.js:1234:56`) and hand back a line
 * number that has nothing to do with the user's file — the
 * downstream marker then clamps to full-document range and the user
 * sees the whole sketch underlined.
 *
 * Returns `null` when the stack only contains compiled-bundle or
 * framework frames. Caller should treat that as "line unknown" and
 * skip the inline marker rather than painting the whole file.
 */
declare function parseStackLocation(err: unknown): {
    line: number;
    column: number;
} | null;
/**
 * Levenshtein edit distance. Small implementation — fine for runs of up
 * to a few thousand words, which is the order of magnitude of the
 * combined DocsIndex keys (~935).
 */
declare function levenshtein(a: string, b: string): number;
interface FuzzyMatch {
    name: string;
    distance: number;
}
/**
 * Return the closest identifiers to `word` from a corpus, sorted by
 * distance. `maxDistance` filters out anything beyond the threshold;
 * defaults to `Math.max(2, ceil(word.length / 3))` — generous for short
 * words, stricter for long ones. `limit` caps the returned list.
 */
declare function fuzzyMatch(word: string, corpus: readonly string[], options?: {
    maxDistance?: number;
    limit?: number;
}): FuzzyMatch[];
/**
 * Extract the undefined identifier from a ReferenceError's message.
 * Returns `null` when the error isn't a reference-miss we recognise.
 */
declare function extractReferenceIdentifier(err: unknown): string | null;
interface FormatOptions {
    /** DocsIndex for the runtime the code was running in. */
    index?: DocsIndex;
    /** Override the base URL pattern used for suggestion.docsUrl. */
    docsUrlFor?: (runtime: RuntimeId, name: string) => string;
    /**
     * A window of user source code around the throw — typically the line
     * the error happened on plus a couple of neighbours. Used by
     * `CommonMistake` detectors of `kind: 'code'` to recognise wrong-shape
     * idioms (`chord(C)` vs `chord("C")`) without needing a full parse.
     * Caller is free to omit it; `kind: 'code'` detectors simply won't fire.
     */
    codeContext?: string;
    /**
     * Phase 20-14 β-5 — bare-name sound alias context. Distinct from the
     * doc-level `detect.alias` CommonMistake field (which is per-doc fuzzy
     * suggestion); this is the runtime alias-resolution layer that
     * `wrappedOutput` operates.
     *
     * - `resolutions`: ordered list of alias rewrites that fired during the
     *   current evaluate() window. Populated from
     *   `StrudelEngine.getLastAliasResolutions()`. The friendly-error path
     *   appends `(tried alias "kick" → "bd")` to the message when populated
     *   on the same error window.
     * - `lookupAlias`: project-injected resolver (today, `resolveAlias` from
     *   `./aliases`). The miss path uses this to distinguish "the alias
     *   map has no entry for `xyz`" from "we tried `xyz → target` but
     *   `target` is not loaded either."
     */
    aliasContext?: {
        resolutions?: ReadonlyArray<{
            from: string;
            to: string;
        }>;
        lookupAlias?: (rawS: string) => string | undefined;
    };
}
/**
 * Build the alias-resolution suffix appended to "sound not found" friendly
 * errors. Returns an empty string when there's nothing to say. Exported
 * for unit testing — pure function over the inputs.
 */
declare function buildAliasSuffix(missingName: string | null, ctx: FormatOptions['aliasContext']): string;
/**
 * Build a FriendlyErrorParts from a raw thrown value. When `index` is
 * provided and the error is a ReferenceError, attempts a fuzzy-match
 * against the index and attaches the best suggestion.
 */
declare function formatFriendlyError(err: unknown, runtime: RuntimeId, options?: FormatOptions): FriendlyErrorParts;

/**
 * Bare-name to canonical-name aliases. Frozen so callers can't mutate the
 * shared table — the alias surface is a contract reviewed via PR, not a
 * runtime knob.
 */
declare const SOUND_ALIASES: Readonly<Record<string, string>>;
/**
 * Look up a bare name against `SOUND_ALIASES`. Returns the canonical name
 * if there is a curated alias, otherwise `undefined`. Lowercases the input
 * to match superdough's own lookup (`soundMap.get()[s.toLowerCase()]`).
 *
 * The caller (`wrappedOutput` in StrudelEngine) must ALSO verify the name
 * is not in the live `soundMap` before substituting — see header.
 */
declare function resolveAlias(rawS: string): string | undefined;

/**
 * p5.js hover + completion — sourced from the official p5.js reference
 * (YUIDoc build, vendored to `data/p5.json` via
 * `scripts/fetch-docs/p5.mjs`).
 *
 * Re-sync with upstream:
 *   node packages/editor/scripts/fetch-docs/p5.mjs
 *
 * The transform trims descriptions to one sentence and picks the shortest
 * real call-site line from each method's examples, so the vendored JSON
 * stays under 200 KB.
 */

declare const P5_DOCS_INDEX: DocsIndex;

/**
 * Hydra hover + completion — sourced from the hydra-synth function list
 * (`glsl-functions.js` vendored as `data/hydra.json` via
 * `scripts/fetch-docs/hydra.mjs`) plus a small hand-curated set of
 * runtime-only globals (output buffers, `hush`, `time`, etc.) that don't
 * live in the GLSL list.
 *
 * Re-sync with upstream:
 *   node packages/editor/scripts/fetch-docs/hydra.mjs
 */

declare const HYDRA_DOCS_INDEX: DocsIndex;

/**
 * Sonic Pi hover + completion — assembled from the upstream sonic-pi repo:
 *   - Language functions scraped from `app/server/ruby/lib/sonicpi/lang/*.rb`
 *     via the `doc name:` metadata blocks.
 *   - Synth symbols from `etc/doc/cheatsheets/synths.md`.
 *   - FX symbols from `etc/doc/cheatsheets/fx.md`.
 *
 * Re-sync with upstream:
 *   node packages/editor/scripts/fetch-docs/sonicpi.mjs
 *
 * Monaco's `getWordAtPosition` stops at `:`, so `:dull_bell` resolves to
 * the bare `dull_bell` identifier — which the docs index stores under
 * that bare key. One lookup covers both forms.
 */

declare const SONICPI_DOCS_INDEX: DocsIndex;

declare const STRUDEL_DOCS_INDEX: DocsIndex;

export { ALIAS_MAP, AUTO_SNAPSHOT_PREFIX, type ActiveEventSummary, type AnalyserBytes, type AnalyzeSongOptions, type ArrangeArmRange, type ArrangeCall, type ArrangeMode, type AudioPayload, type AudioReading, type AudioSourceRef, BACKDROP_BLUR_VAR, BOTTOM_PANEL_ACTIVE_TAB_KEY, BOTTOM_PANEL_HEIGHT_DEFAULT, BOTTOM_PANEL_HEIGHT_KEY, BOTTOM_PANEL_HEIGHT_MAX, BOTTOM_PANEL_HEIGHT_MIN, BOTTOM_PANEL_OPEN_KEY, BUILTIN_ALIASES, BUNDLED_PREFIX, type BackdropQuality, BottomPanel, type BottomPanelTab, type BranchRef, type BreakpointMeta, BreakpointStore, BufferedScheduler, type BumpSummary, type BusAnalyser, type BusHapEvent, type CapabilityEnv, type ChainArg, type ChainCall, type ChromeContext, type ChromeForTab, type ChunkInfo, type ChunkType, type CollectContext, type Commit, type CommitKind, type ComponentBag, type CropRegion, DARK_THEME_TOKENS, DEFAULT_VIZ_DESCRIPTORS, DEFAULT_VIZ_ENGINE, DemoEngine, type DocKind, type DocsIndex, type EditorTheme, EditorView, type EngineAliasMap, type EngineAliasValue, type EngineComponents, ErrorBoundary, type ErrorBoundaryProps, FSCOPE_P5_CODE, type FixedMarker, type FormatOptions, type FrameChannel, type FrameStats, type FriendlyErrorParts, type FuzzyMatch, GLSL_VIZ, HYDRA_DOCS_INDEX, HYDRA_VIZ, type HapEvent, HapStream, HistoryPanel, type HistoryPanelProps, type HydraPatternFn, HydraVizRenderer, INLINE_VIZ_ACTION_SIZE_VAR, IR, type IRComponent, type IREvent, IREventCollectSystem, type IRPattern, type IRSnapshot, type InjectedGlobal, Knob, LIGHT_THEME_TOKENS, type LaneActivity, LiveCodingEditor, type LiveCodingEditorProps, type LiveCodingEngine, LiveCodingRuntime, type LiveCodingRuntime$1 as LiveCodingRuntimeInterface, type LiveCodingRuntimeProvider, LiveRecorder, type LiveSpec, type LogEntry, type LogLevel, type LogSuggestion, MASTER_KEY, MIXER_TAB_ID, MainSignalSampler, type MasterArray, type MasterScalar, Mixer, type NormalizedHap, OfflineRenderer, type OffsetEdit, type OpenHistoryTabRequest, P5VizRenderer, P5_DOCS_INDEX, P5_VIZ, PATTERN_IR_SCHEMA_VERSION, PATTERN_TAB_ID, PIANOROLL_P5_CODE, PIANO_ROLL_TAB_ID, PITCHWHEEL_P5_CODE, type ParseResult, type Pass, type PatternIR, type PatternKind, PatternPanel, type PatternScheduler, type PerfSnapshot, type PersistedEditorTab, type PersistedGroup, type PersistedShellState, PianoRollGrid, type PianoRollModel, type PlayParams, type PreviewContext, type PreviewProvider, PreviewView, type ProjectHistory, type ProjectMeta, type ResizeMode, type ResolvedTheme, type RollNote, type RuntimeDoc, type RuntimeId, SAMPLE_SOUND_LABEL, SAMPLE_SOUND_SOURCE_ID, SCOPE_P5_CODE, SEQUENCER_TAB_ID, SHELL_STATE_KEY_PREFIX, SHELL_STATE_VERSION, SIGNALS_BACKDROP_P5_CODE, SIGNALS_SPECTRUM_P5_CODE, SONICPI_DOCS_INDEX, SONICPI_RUNTIME, SOUND_ALIASES, SPECTRUM_P5_CODE, SPIRAL_P5_CODE, STRUDEL_DOCS_INDEX, STRUDEL_RUNTIME, type SamplerInputs, type SectionStats, SequencerGrid, type ShellSnapshot, type SignalAliasMap, SignalBus, type SignalFrame, type SignalReading, type SignalTransportReader, type SignalTransportWriter, type SnapshotMeta, type SongAnalysis, type SongSection, SonicPiEngine, type SourceLocation, SplitPane, type StepGridModel, type StepLane, type StoredSignalAliases, StrudelEditor, type StrudelEditorProps, StrudelEngine, StrudelParseSystem, type StrudelTheme, type System, type TierFlags, type TierName, type TimelineCaptureEntry, type TrackMeta, UI_ICON_SIZE_VAR, type UseTrackMetaResult, type UseWorkspaceFileResult, VISUAL_EDIT_TABS, VIZ_FLAG_KEYS, VIZ_LANGUAGES, VisualEditStandby, type VisualEditStandbyProps, type VisualEditTabDef, type VizDescriptor, VizDropdown, VizEditor, type VizEditorProps, type VizEngine, type VizLanguage, VizPanel, VizPicker, type VizPreset, VizPresetStore, VizQualityLevel, type VizRefs, type VizRenderer, type VizRendererKind, type VizRendererSource, type VizTransport, type VizWorkerFactory, WORDFALL_P5_CODE, WavEncoder, WorkerBusFeed, type WorkerVizCapabilities, WorkerVizRenderer, type WorkspaceAudioBus, type WorkspaceFile, type WorkspaceGroupState, type WorkspaceLanguage, WorkspaceShell, type WorkspaceShellHandle, type WorkspaceShellProps, type WorkspaceTab, type WriteSource, Writeback, accumulateLanes, analyzeEvents, analyzeSong, applyEdits, applyOffsetEditsToFile, applyPersistedAdaptivePerf, applyPersistedBackdropBlur, applyPersistedInlineVizActionSize, applyPersistedPerfEnabled, applyPersistedTheme, applyPersistedUiIconSize, applyPersistedVizQuality, applyTheme, backdropQualityFactor, buildAliasSuffix, buildDefaultSnapshot, bumpEditorFontSize, bundledPresetId, canRedo, canUndo, captureSnapshot, classifyChunk, classifyLiteralRhs, clearCapture, clearIRSnapshot, clearLog, clearShellState, collect, collectCycles, commitWorkspace, compilePreset, computeSections, createBranchAt, createPostMessageReader, createPostMessageWriter, createProject, createWorkspaceFile, cycleEditorTheme, cycleFingerprints, deleteProject, deleteSnapshot, deleteWorkspaceFile, detectAllArrangeCalls, detectAllChunks, detectArrangeAt, detectBarePattern, detectChunk, detectPeriod, detectWorkerVizCapabilities, docParses, duplicateProject, emitFixed, emitLog, emptyFrame, enterRuntimeView, exitRuntimeView, extractReferenceIdentifier, fileHistory, filter, flushToPreset, formatFriendlyError, formatNumber, formatStaveInputs, frameTransferables, fuzzyMatch, generateUniquePresetId, getActiveHistoryFile, getActiveProjectId, getAdaptivePerfEnabled, getBackdropOpacity, getBackdropQuality, getBottomPanelTab, getCaptureBuffer, getCaptureCapacity, getChildOrder, getCommit, getCurrentBranch, getCurrentHistory, getEditorBackdropBlur, getEditorFontSize, getEditorMinimap, getEditorTheme, getEditorUiIconSize, getFile, getFileContentAt, getFileHistoryTarget, getFixedMarkers, getFolderOrder, getIRSnapshot, getInlineVizActionSize, getInlineVizResolution, getInlineVizTeardownEnabled, getInlineVizTeardownMs, getLastOpenedProject, getLogHistory, getModifiedFileIdsSinceHead, getMusicalTimelineSubRowHeight, getNamedViz, getPerfEnabled, getPresetIdForFile, getPreviewProviderForExtension, getPreviewProviderForLanguage, getProject, getResolvedTheme, getRuntimeProviderForExtension, getRuntimeProviderForLanguage, getSignalAliases, getStoredSignalAliases, getSubfolderOrder, getTierFlags, getTrackMeta, getViewedCommit, getViewedContent, getViewedFileIds, getVizInputsLiveValuesEnabled, getVizMaxDprOverride, getVizMaxFpsOverride, getVizQuality, getVizWorkerFactory, getVizWorkerOverride, getZoneCropOverride, getZoneHeightOverride, hydraKaleidoscope, hydraPianoroll, hydraScope, hydrateSnapshot, initHistory, initProjectDoc, initProjectDocSync, injectedGlobalByToken, injectedGlobals, insertArm, installEngineLogMarkers, installGlobalErrorCatch, isBlackKey, isBundledPresetId, isChunkFresh, isDocReady, isFileModifiedSinceHead, isP5DirectCanvasEnabled, isRollChunk, isSampleSoundPlaying, isStepChunk, isViewing, isVizGovernorEnabled, isVizLanguage, isVizPumpSharedCacheEnabled, isVizWorkerPoolEnabled, knobRangeFor, laneKeyOf, languageForRenderer, levenshtein, listBottomPanelTabs, listBranches, listCommits, listNamedVizEntries, listNamedVizNames, listProjects, listSnapshots, listTiers, listWorkspaceFiles, liveCodingRuntimeRegistry, loadShellState, makeFixedKey, merge, midiToPitch, mountVizRenderer, normalizeEdits, normalizeStrudelHap, noteToMidi, onAdaptivePerfChange, onBackdropOpacityChange, onBackdropQualityChange, onInlineVizActionSizeChange, onInlineVizResolutionChange, onInlineVizTeardownChange, onMusicalTimelineSubRowHeightChange, onNamedVizChanged, onPerfEnabledChange, onSignalAliasesChange, onThemeChange, onUiIconSizeChange, onVizInputsLiveValuesChange, onVizQualityChange, parseMini, parsePianoRoll, parseStackLocation, parseStepGrid, parseStrudel, parseTopLevel, patternFromJSON, patternKind, patternToJSON, perf, pitchToMidi, placeNote, previewProviderRegistry, propagate, pruneZoneOverrides, publishIRSnapshot, readCurrentCycle, readPersistedActiveTabId, readPersistedOpen, redo, registerBottomPanelTab, registerNamedViz, registerPresetAsNamedViz, registerPreviewProvider, registerRuntimeProvider, removeArm, renameProject, renameWorkspaceFile, rendererForLanguage, reorderArm, resetFileStore, resetHistoryState, resetUndoManager, resizeGrid, resizeRoll, resolveAlias, resolveAliasesForEngine, resolveDescriptor, restoreFileToCommit, restoreProject, restoreSnapshot, revealLineInFile, revertFileToSeed, runChainAppliedStage, runFinalStage, runMiniExpandedStage, runPasses, runRawStage, sanitizePresetName, saveShellState, saveSnapshot, scaleGain, seedFromPreset, seedFromPresetId, seedWorkspaceFile, serializePianoRoll, serializeShellState, serializeStepGrid, setActiveHistoryFile, setAdaptivePerfEnabled, setBackdropOpacity, setBackdropQuality, setCaptureCapacity, setChildOrder, setContent, setCurrentCycleAccessor, setEditorBackdropBlur, setEditorFontSize, setEditorTheme, setEditorUiIconSize, setFileHistoryTarget, setFolderOrder, setInlineVizActionSize, setInlineVizResolution, setInlineVizTeardownEnabled, setMusicalTimelineSubRowHeight, setPerfEnabled, setProjectBackgroundCrop, setSignalAliases, setSubfolderOrder, setTierFlag, setTrackMeta, setVizInputsLiveValuesEnabled, setVizQuality, setVizWorkerFactory, setWeight, setZoneCropOverride, setZoneHeightOverride, shellStateKeyFor, splitArm, startHistoryDriver, startSampleSound, stopSampleSound, subscribeCapture, subscribeFixed, subscribeIRSnapshot, subscribeLog, subscribeToBottomPanelTabs, subscribeToDocUpdate, subscribeToFileList, subscribeToFolderOrder, subscribeToHistory, subscribeToRuntimeView, subscribeToTrackMeta, subscribeToUndoState, subscribe as subscribeToWorkspaceFile, subscribeToZoneOverrides, switchProject, switchToBranch, timestretch, toStrudel, toggleAdaptivePerfEnabled, toggleEditorMinimap, togglePerfEnabled, touchProject, transpose, undo, unregisterBottomPanelTab, unregisterNamedViz, usePopoutPreview, useTrackMeta, useWorkspaceFile, validatePersistedState, withStructBatch, workspaceAudioBus, workspaceFileIdForPreset, wrapBare };
