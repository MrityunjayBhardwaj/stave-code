import type { HapStream } from './HapStream'
import type { PatternScheduler } from '../visualizers/types'
import type { PatternIR } from '../ir/PatternIR'
import type { IREvent } from '../ir/IREvent'

// ---------------------------------------------------------------------------
// Engine Component Bags
// ---------------------------------------------------------------------------

/** Real-time hap event stream for visualizers and highlighting. */
export interface StreamingComponent {
  hapStream: HapStream
}

/** Pattern query access -- scheduler for the combined pattern, per-track schedulers. */
export interface QueryableComponent {
  scheduler: PatternScheduler | null
  trackSchedulers: Map<string, PatternScheduler>
}

/** Web Audio nodes for analysis-based visualizers (scope, spectrum). */
export interface AudioComponent {
  analyser: AnalyserNode
  audioCtx: AudioContext
  /** Per-track AnalyserNodes for isolated inline viz. Keyed by track ID (e.g. "drums", "$0"). */
  trackAnalysers?: Map<string, AnalyserNode>
}

/** Per-track inline visualization requests with line placement info. */
export interface InlineVizComponent {
  /**
   * Maps track ID (e.g. "$0", "d1") to viz placement info.
   * - vizId: descriptor ID (e.g. "pianoroll", "scope")
   * - afterLine: 1-indexed line number after which to place the view zone
   */
  vizRequests: Map<string, { vizId: string; afterLine: number }>
  /**
   * Optional per-track HapStreams for scoped inline viz.
   * When present, each inline zone subscribes to its track's stream only.
   * When absent, falls back to the global streaming component.
   */
  trackStreams?: Map<string, HapStream>
}

/** Pattern IR derived from the last successful evaluate(). */
export interface IRComponent {
  /** Algebraic structure of the pattern (free monad tree). */
  patternIR: PatternIR | null
  /** Flattened event list derived from patternIR (for rendering). */
  irEvents: IREvent[]
}

/**
 * Component bag exposing engine capabilities.
 * Each slot is independently optional -- consumers MUST check existence before access.
 */
export interface EngineComponents {
  streaming: StreamingComponent
  queryable: QueryableComponent
  audio: AudioComponent
  inlineViz: InlineVizComponent
  /** Pattern IR — present after successful evaluate() on engines that support parsing. */
  ir: IRComponent
}

// ---------------------------------------------------------------------------
// LiveCodingEngine Interface
// ---------------------------------------------------------------------------

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
export interface LiveCodingEngine {
  /** Initialize the engine (load modules, set up audio context). Must complete before evaluate(). */
  init(): Promise<void>

  /** Evaluate user code. Returns error info if evaluation fails. */
  evaluate(code: string): Promise<{ error?: Error }>

  /** Start the scheduler / begin playback. */
  play(): void

  /** Stop the scheduler / pause playback. */
  stop(): void

  /** Release all resources. Engine is unusable after this call. */
  dispose(): void

  /** Current engine capabilities. Slots appear as data becomes available. */
  readonly components: Partial<EngineComponents>

  /** Register a handler for runtime errors (fires during scheduling, not evaluation). */
  setRuntimeErrorHandler(handler: (err: Error) => void): void
}
