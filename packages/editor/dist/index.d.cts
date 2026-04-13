import * as react_jsx_runtime from 'react/jsx-runtime';
import React, { RefObject, ReactNode } from 'react';
import * as p5 from 'p5';
import p5__default from 'p5';

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
    /** Which track/loop produced this event */
    trackId?: string;
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
} | {
    tag: 'Seq';
    children: PatternIR[];
} | {
    tag: 'Stack';
    tracks: PatternIR[];
} | {
    tag: 'Play';
    note: string | number;
    duration: number;
    params: PlayParams;
} | {
    tag: 'Sleep';
    duration: number;
} | {
    tag: 'Choice';
    p: number;
    then: PatternIR;
    else_: PatternIR;
} | {
    tag: 'Every';
    n: number;
    body: PatternIR;
    default_?: PatternIR;
} | {
    tag: 'Cycle';
    items: PatternIR[];
} | {
    tag: 'When';
    gate: string;
    body: PatternIR;
} | {
    tag: 'FX';
    name: string;
    params: Record<string, number | string>;
    body: PatternIR;
} | {
    tag: 'Ramp';
    param: string;
    from: number;
    to: number;
    cycles: number;
    body: PatternIR;
} | {
    tag: 'Fast';
    factor: number;
    body: PatternIR;
} | {
    tag: 'Slow';
    factor: number;
    body: PatternIR;
} | {
    tag: 'Loop';
    body: PatternIR;
} | {
    tag: 'Code';
    code: string;
    lang: 'strudel';
};
/** Smart constructors — reduce boilerplate when building trees by hand. */
declare const IR: {
    readonly pure: () => PatternIR;
    readonly play: (note: string | number, duration?: number, params?: Partial<PlayParams>) => PatternIR;
    readonly sleep: (duration: number) => PatternIR;
    readonly seq: (...children: PatternIR[]) => PatternIR;
    readonly stack: (...tracks: PatternIR[]) => PatternIR;
    readonly choice: (p: number, then: PatternIR, else_?: PatternIR) => PatternIR;
    readonly every: (n: number, body: PatternIR, default_?: PatternIR) => PatternIR;
    readonly cycle: (...items: PatternIR[]) => PatternIR;
    readonly when: (gate: string, body: PatternIR) => PatternIR;
    readonly fx: (name: string, params: Record<string, number | string>, body: PatternIR) => PatternIR;
    readonly ramp: (param: string, from: number, to: number, cycles: number, body: PatternIR) => PatternIR;
    readonly fast: (factor: number, body: PatternIR) => PatternIR;
    readonly slow: (factor: number, body: PatternIR) => PatternIR;
    readonly loop: (body: PatternIR) => PatternIR;
    readonly code: (code: string) => PatternIR;
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
}
/**
 * Walk a PatternIR tree and return a flat array of IREvents.
 *
 * @param ir - the pattern tree to evaluate
 * @param partialCtx - optional context override (begin, end, cycle, etc.)
 */
declare function collect(ir: PatternIR, partialCtx?: Partial<CollectContext>): IREvent[];

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
 * Recursive descent parser that handles the Phase F subset:
 *   - Sequences: "c4 e4 g4"
 *   - Rests: "c4 ~ e4"
 *   - Cycles (alternation): "<c4 e4 g4>"
 *   - Sub-sequences: "[c4 e4] g4"
 *   - Repeat: "c4*2"
 *   - Sometimes: "c4?"
 *
 * Not in scope (Phase 19): polymetric {}, Euclidean a(3,8), slice a:2, elongation @
 */

/** Parse a mini-notation string. Returns Pure for empty input. Never throws. */
declare function parseMini(input: string, isSample?: boolean): PatternIR;

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

/** Parse a Strudel code string. Always returns a tree (Code node for unsupported). */
declare function parseStrudel(code: string): PatternIR;

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
     */
    emit(hap: any, deadline: number, duration: number, cps: number, audioCtxCurrentTime: number): void;
    /**
     * Emit a pre-constructed HapEvent directly.
     * Preferred API for non-Strudel engines that don't have raw hap objects.
     */
    emitEvent(event: HapEvent): void;
    dispose(): void;
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
/** Per-track inline visualization requests with line placement info. */
interface InlineVizComponent {
    /**
     * Maps track ID (e.g. "$0", "d1") to viz placement info.
     * - vizId: descriptor ID (e.g. "pianoroll", "scope")
     * - afterLine: 1-indexed line number after which to place the view zone
     */
    vizRequests: Map<string, {
        vizId: string;
        afterLine: number;
    }>;
    /**
     * Optional per-track HapStreams for scoped inline viz.
     * When present, each inline zone subscribes to its track's stream only.
     * When absent, falls back to the global streaming component.
     */
    trackStreams?: Map<string, HapStream>;
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
 * Internal type alias for the existing p5 sketch factory signature.
 * Used only by P5VizRenderer — NOT exported from the package.
 */
type P5SketchFactory = (hapStreamRef: RefObject<HapStream | null>, analyserRef: RefObject<AnalyserNode | null>, schedulerRef: RefObject<PatternScheduler | null>, containerSizeRef: RefObject<ContainerSize>) => (p: p5.default) => void;

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
    private audioController;
    private lastEvaluatedCode;
    private lastPatternIR;
    private lastIREvents;
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
}

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
    engineRef?: React.MutableRefObject<StrudelEngine | null>;
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
    toolbarExtra?: React.ReactNode;
    onPostEvaluate?: (engine: LiveCodingEngine) => void;
    soundNames?: string[];
    bpm?: number;
    isExporting?: boolean;
    onExport?: () => void;
    engineRef?: React.MutableRefObject<LiveCodingEngine | null>;
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
 */
declare function normalizeStrudelHap(hap: any): NormalizedHap;

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

type HydraPatternFn = (synth: any) => void;
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
 * Hydra shader presets for audio-reactive visualization.
 * Each preset is a function that receives the Hydra synth object
 * and sets up a shader pipeline. Audio bins (a.fft[0..3]) are
 * pumped from the engine's AnalyserNode by HydraVizRenderer.
 */
/** Scrolling frequency bands — Hydra's take on a pianoroll. */
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
 * Each factory creates a NEW renderer instance per mount —
 * never share a single instance across multiple mounts.
 *
 * Consumers extend via spread:
 *   vizDescriptors={[...DEFAULT_VIZ_DESCRIPTORS, myCustomDescriptor]}
 */
declare const DEFAULT_VIZ_DESCRIPTORS: VizDescriptor[];

/**
 * Resolves a viz ID to a VizDescriptor using the "mode:renderer" convention.
 *
 * Resolution order:
 *   1. User-named viz registry — exact name match in the runtime
 *      `namedVizRegistry` (populated by saved viz presets). User intent
 *      wins over built-ins, so a user-saved preset named `"pianoroll"`
 *      shadows the built-in `"pianoroll:hydra"` for their inline usage.
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

type Listener$1 = () => void;
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
declare function onNamedVizChanged(cb: Listener$1): () => void;

/**
 * Central configuration for the Stave visualization system.
 *
 * All tunable hyperparameters live here instead of being scattered across
 * renderers, sketches, and layout code. Import `VIZ_CONFIG` (or call
 * `createVizConfig()` with overrides) to read values at runtime.
 */
interface VizConfig {
    /**
     * Renderer used when `.viz("mode")` has no explicit `:renderer` suffix.
     *
     * When a user writes `.viz("pianoroll")` and both `"pianoroll"` (p5) and
     * `"pianoroll:hydra"` exist, the resolver tries an exact match first.
     * If the exact bare id isn't registered, it appends `":${defaultRenderer}"`
     * and retries before falling back to the first prefix match.
     *
     * Set to `'p5'` for lightweight 2D canvas visuals (lower GPU),
     * or `'hydra'` for WebGL shader-based visuals (richer but heavier).
     */
    defaultRenderer: string;
    /** Height in pixels of each inline viz zone rendered below a pattern block. */
    inlineZoneHeight: number;
    /**
     * FFT window size for the Web Audio AnalyserNode.
     * Must be a power of 2 between 32 and 32768.
     * Larger = better frequency resolution, worse time resolution.
     * 2048 is a good balance for music visualization.
     */
    fftSize: number;
    /**
     * Smoothing factor for the AnalyserNode (0.0–1.0).
     * 0 = no smoothing (jittery), 1 = fully smoothed (sluggish).
     * 0.8 gives responsive-but-stable frequency data.
     */
    smoothingTimeConstant: number;
    /**
     * Number of frequency bins Hydra's audio object uses.
     * Hydra's `a.fft[]` array will have this many entries, each
     * representing average energy in an equal-width frequency band.
     * 4 bins = bass / low-mid / high-mid / treble.
     */
    hydraAudioBins: number;
    /**
     * Whether hydra-synth runs its own requestAnimationFrame loop.
     * true  = Hydra renders every frame (default, smoothest).
     * false = caller must tick Hydra manually (advanced use).
     */
    hydraAutoLoop: boolean;
    /** Total seconds visible in the pianoroll rolling window. */
    pianorollWindowSeconds: number;
    /** Number of pattern cycles visible in the pianoroll. */
    pianorollCycles: number;
    /** Playhead position as a 0..1 fraction of the canvas width. */
    pianorollPlayhead: number;
    /** Lowest MIDI note shown on the pianoroll Y-axis. */
    pianorollMidiMin: number;
    /** Highest MIDI note shown on the pianoroll Y-axis. */
    pianorollMidiMax: number;
    /** Seconds visible in the event-driven scope fallback mode. */
    scopeWindowSeconds: number;
    /** Vertical amplitude scale for scope/fscope waveforms (0..1). */
    scopeAmplitudeScale: number;
    /** Waveform baseline position as a fraction of canvas height (0=top, 1=bottom). */
    scopeBaseline: number;
    /** Minimum dB floor for spectrum normalization. */
    spectrumMinDb: number;
    /** Maximum dB ceiling for spectrum normalization. */
    spectrumMaxDb: number;
    /** Scroll speed in pixels per frame for waterfall spectrum. */
    spectrumScrollSpeed: number;
    /** Shared background color for all p5 sketch canvases. */
    backgroundColor: string;
    /** Primary accent color for waveforms, bars, and inactive notes. */
    accentColor: string;
    /** Color for actively playing notes / highlights. */
    activeColor: string;
    /** Playhead line color (semi-transparent works best). */
    playheadColor: string;
}
declare const DEFAULT_VIZ_CONFIG: Readonly<VizConfig>;
/**
 * Creates a VizConfig by merging overrides onto defaults.
 *
 * ```ts
 * const config = createVizConfig({ defaultRenderer: 'hydra', hydraAudioBins: 8 })
 * ```
 */
declare function createVizConfig(overrides?: Partial<VizConfig>): VizConfig;
/** Returns the active viz configuration. */
declare function getVizConfig(): Readonly<VizConfig>;
/**
 * Replaces the active viz configuration.
 * Call early (before any engine.init / editor mount) for consistent behavior.
 */
declare function setVizConfig(config: Partial<VizConfig>): void;

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

/**
 * A user-authored visualization saved to IndexedDB.
 * Compiled to a VizDescriptor at runtime for use with .viz("name").
 */
interface VizPreset {
    id: string;
    name: string;
    renderer: 'hydra' | 'p5';
    code: string;
    requires: (keyof EngineComponents)[];
    createdAt: number;
    updatedAt: number;
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
declare function bundledPresetId(name: string, renderer: 'hydra' | 'p5'): string;
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
declare function generateUniquePresetId(name: string, renderer: 'hydra' | 'p5', existingIds: Iterable<string>): string;
declare const VizPresetStore: {
    getAll(): Promise<VizPreset[]>;
    get(id: string): Promise<VizPreset | undefined>;
    put(preset: VizPreset): Promise<void>;
    delete(id: string): Promise<void>;
};

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
 *   object as the implicit `s` parameter. Uses `new Function()`.
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

interface SplitPaneProps {
    direction: 'horizontal' | 'vertical';
    children: React.ReactNode[];
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

declare function PianorollSketch(_hapStreamRef: RefObject<HapStream | null>, _analyserRef: RefObject<AnalyserNode | null>, schedulerRef: RefObject<PatternScheduler | null>): (p: p5__default) => void;

/**
 * Scope visualizer with dual data paths:
 * 1. AnalyserNode available → classic oscilloscope (time-domain waveform)
 * 2. PatternScheduler only → event pulse display (per-track activity)
 *
 * The fallback makes scope work for ANY engine via BufferedScheduler,
 * even without per-track audio routing.
 */

declare function ScopeSketch(_hapStreamRef: RefObject<HapStream | null>, analyserRef: RefObject<AnalyserNode | null>, schedulerRef: RefObject<PatternScheduler | null>): (p: p5__default) => void;

/**
 * Spectrum visualizer with dual data paths:
 * 1. AnalyserNode available → scrolling waterfall spectrogram (real audio FFT)
 * 2. PatternScheduler only → frequency bars from active note events (per-track)
 *
 * The fallback makes spectrum work for ANY engine via BufferedScheduler.
 */

declare function SpectrumSketch(_hapStreamRef: RefObject<HapStream | null>, analyserRef: RefObject<AnalyserNode | null>, schedulerRef: RefObject<PatternScheduler | null>): (p: p5__default) => void;

/**
 * Port of Strudel's spiral.mjs to p5.js.
 * Each hap is drawn as an arc segment on an Archimedean spiral.
 * Active haps use the accent color; past haps fade out.
 */

declare function SpiralSketch(_hapStreamRef: RefObject<HapStream | null>, _analyserRef: RefObject<AnalyserNode | null>, schedulerRef: RefObject<PatternScheduler | null>): (p: p5__default) => void;

/**
 * Port of Strudel's pitchwheel.mjs to p5.js.
 * Active notes are placed on a circle by frequency angle (mod octave).
 * Lines connect center to each note (flake mode).
 */

declare function PitchwheelSketch(_hapStreamRef: RefObject<HapStream | null>, _analyserRef: RefObject<AnalyserNode | null>, schedulerRef: RefObject<PatternScheduler | null>): (p: p5__default) => void;

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
type WorkspaceLanguage = 'strudel' | 'sonicpi' | 'hydra' | 'p5js' | 'markdown';
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
 * future "background decoration" support is shaped as a SECOND tab id
 * stored on `WorkspaceGroupState.backgroundTabId` (Task 08 wires that;
 * Task 04 reserves the slot), NOT as a mode on the tab itself.
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
 * - `backgroundTabId` — Task 08's reservation slot for the `Cmd+K B`
 *   background-decoration feature. Task 04 declares the field as optional
 *   for forward-compat so Task 08 can populate it without a shape change
 *   to this interface. Task 04 itself does NOT render anything based on
 *   this field.
 */
interface WorkspaceGroupState {
    readonly id: string;
    readonly tabs: readonly WorkspaceTab[];
    readonly activeTabId: string | null;
    readonly backgroundTabId?: string;
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
 *   on `WorkspaceGroupState.backgroundTabId` but Task 04 does not render
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
    readonly onActiveTabChange?: (tab: WorkspaceTab | null) => void;
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
}

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
}
declare const WorkspaceShell: React.ForwardRefExoticComponent<WorkspaceShellProps & React.RefAttributes<WorkspaceShellHandle>>;

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

declare function EditorView({ fileId, theme, chromeSlot, onMount, error, onPlay, onStop, }: EditorViewProps): React.ReactElement;

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

declare function PreviewView({ fileId, provider, sourceRef, onSourceRefChange, theme, hidden, paused, }: PreviewViewProps): React.ReactElement;

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
 * Reset the file store's caches and observers WITHOUT destroying the Y.Doc.
 * Used during project switching: after initProjectDoc loads a new Y.Doc,
 * call this to clear stale snapshots from the previous project and re-wire
 * observers for the new doc's files.
 */
declare function resetFileStore(): void;

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
type Listener = () => void;
/** Call when the active project Y.Doc changes so the undo stack rebuilds. */
declare function resetUndoManager(): void;
declare function undo(): boolean;
declare function redo(): boolean;
declare function canUndo(): boolean;
declare function canRedo(): boolean;
declare function subscribeToUndoState(cb: Listener): () => void;

/**
 * Reveal the given line in the editor for `fileId` and set the cursor
 * at column 1. Returns true if the editor was found. Line numbers are
 * 1-based.
 */
declare function revealLineInFile(fileId: string, line: number): boolean;
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
    getBpm(): number | undefined;
    private fireOnError;
    private firePlayingChanged;
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
 */
declare function registerPresetAsNamedViz(preset: VizPreset): boolean;

export { AUTO_SNAPSHOT_PREFIX, type AudioPayload, type AudioSourceRef, BUNDLED_PREFIX, BufferedScheduler, type ChromeContext, type ChromeForTab, type CollectContext, type ComponentBag, DARK_THEME_TOKENS, DEFAULT_VIZ_CONFIG, DEFAULT_VIZ_DESCRIPTORS, DemoEngine, EditorView, type EngineComponents, HYDRA_VIZ, type HapEvent, HapStream, type HydraPatternFn, HydraVizRenderer, IR, type IRComponent, type IREvent, IREventCollectSystem, type IRPattern, LIGHT_THEME_TOKENS, LiveCodingEditor, type LiveCodingEditorProps, type LiveCodingEngine, LiveCodingRuntime, type LiveCodingRuntime$1 as LiveCodingRuntimeInterface, type LiveCodingRuntimeProvider, LiveRecorder, type NormalizedHap, OfflineRenderer, P5VizRenderer, P5_VIZ, PATTERN_IR_SCHEMA_VERSION, type PatternIR, type PatternScheduler, PianorollSketch, PitchwheelSketch, type PlayParams, type PreviewContext, type PreviewProvider, PreviewView, type ProjectMeta, SAMPLE_SOUND_LABEL, SAMPLE_SOUND_SOURCE_ID, SONICPI_RUNTIME, STRUDEL_RUNTIME, ScopeSketch, type SnapshotMeta, SonicPiEngine, type SourceLocation, SpectrumSketch, SpiralSketch, SplitPane, StrudelEditor, type StrudelEditorProps, StrudelEngine, StrudelParseSystem, type StrudelTheme, type System, type UseWorkspaceFileResult, type VizConfig, type VizDescriptor, VizDropdown, VizEditor, type VizEditorProps, VizPanel, VizPicker, type VizPreset, VizPresetStore, type VizRefs, type VizRenderer, type VizRendererSource, WavEncoder, type WorkspaceAudioBus, type WorkspaceFile, type WorkspaceGroupState, type WorkspaceLanguage, WorkspaceShell, type WorkspaceShellHandle, type WorkspaceShellProps, type WorkspaceTab, applyTheme, bumpEditorFontSize, bundledPresetId, canRedo, canUndo, collect, compilePreset, createProject, createVizConfig, createWorkspaceFile, deleteProject, deleteSnapshot, deleteWorkspaceFile, duplicateProject, filter, flushToPreset, generateUniquePresetId, getActiveProjectId, getEditorFontSize, getEditorMinimap, getFile, getFolderOrder, getLastOpenedProject, getNamedViz, getPresetIdForFile, getPreviewProviderForExtension, getPreviewProviderForLanguage, getProject, getRuntimeProviderForExtension, getRuntimeProviderForLanguage, getSubfolderOrder, getVizConfig, hydraKaleidoscope, hydraPianoroll, hydraScope, initProjectDoc, initProjectDocSync, isBundledPresetId, isDocReady, isSampleSoundPlaying, listNamedVizEntries, listNamedVizNames, listProjects, listSnapshots, listWorkspaceFiles, liveCodingRuntimeRegistry, merge, normalizeStrudelHap, noteToMidi, onNamedVizChanged, parseMini, parseStrudel, patternFromJSON, patternToJSON, previewProviderRegistry, propagate, redo, registerNamedViz, registerPresetAsNamedViz, registerPreviewProvider, registerRuntimeProvider, renameProject, renameWorkspaceFile, resetFileStore, resetUndoManager, resolveDescriptor, restoreSnapshot, revealLineInFile, sanitizePresetName, saveSnapshot, scaleGain, seedFromPreset, seedFromPresetId, seedWorkspaceFile, setContent, setEditorFontSize, setFolderOrder, setSubfolderOrder, setVizConfig, startSampleSound, stopSampleSound, subscribeToDocUpdate, subscribeToFileList, subscribeToFolderOrder, subscribeToUndoState, subscribe as subscribeToWorkspaceFile, switchProject, timestretch, toStrudel, toggleEditorMinimap, touchProject, transpose, undo, unregisterNamedViz, useWorkspaceFile, withStructBatch, workspaceAudioBus, workspaceFileIdForPreset };
