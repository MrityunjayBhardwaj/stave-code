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

import type { LiveCodingEngine } from '../../engine/LiveCodingEngine'
import { BufferedScheduler } from '../../engine/BufferedScheduler'
import { workspaceAudioBus } from '../WorkspaceAudioBus'
import type {
  AudioPayload,
  LiveCodingRuntime as LiveCodingRuntimeInterface,
} from '../types'

/**
 * Parse `setcps(numerator/denominator)` (or `setcps(value)`) out of the
 * given source code and convert to BPM. Returns `undefined` if no
 * `setcps` line is present or the expression is unparseable.
 *
 * Strudel's `setcps` takes cycles-per-second; the conventional Strudel
 * preset uses `setcps(120/240)` to mean "120 BPM at 4 beats per cycle"
 * (240 = 60 seconds × 4). The conversion BPM = cps × 60 / beatsPerCycle
 * collapses to BPM = (numerator / denominator) × 60 for the standard
 * 4-beat cycle, which is what the legacy `StrudelEditor.tsx:111-115`
 * extraction does. The runtime mirrors that exact logic so the BPM
 * display in the new chrome matches the old one byte-for-byte.
 *
 * Lives at module scope (not as a method) so the function is pure +
 * trivially testable + has zero `this`-binding gotchas.
 */
export function extractBpmFromCode(code: string): number | undefined {
  // Match setcps(num/denom) — the canonical Strudel form. Allows whitespace
  // around tokens. Numerator and denominator are decimal numbers.
  const fractionMatch = code.match(
    /setcps\s*\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/,
  )
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1])
    const denominator = parseFloat(fractionMatch[2])
    if (denominator > 0 && Number.isFinite(numerator)) {
      return Math.round((numerator / denominator) * 60)
    }
  }
  // Fall back to setcps(N) — interpret as cps × 60.
  const scalarMatch = code.match(/setcps\s*\(\s*([\d.]+)\s*\)/)
  if (scalarMatch) {
    const cps = parseFloat(scalarMatch[1])
    if (Number.isFinite(cps)) {
      return Math.round(cps * 60)
    }
  }
  return undefined
}

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
export class LiveCodingRuntime implements LiveCodingRuntimeInterface {
  readonly engine: LiveCodingEngine
  readonly fileId: string

  private readonly getFileContent: () => string
  private bufferedSchedulerRef: BufferedScheduler | null = null
  private isInitialized = false
  private isDisposed = false
  private currentBpm: number | undefined = undefined
  private isPlayingState = false

  private readonly errorListeners = new Set<(err: Error) => void>()
  private readonly playingChangedListeners = new Set<(playing: boolean) => void>()

  constructor(
    fileId: string,
    engine: LiveCodingEngine,
    getFileContent: () => string,
  ) {
    this.fileId = fileId
    this.engine = engine
    this.getFileContent = getFileContent

    // Wire the engine's runtime error handler into our own error listeners
    // so audio scheduling errors (sound-not-found etc.) surface through the
    // same channel as evaluate errors. The engine fires this from inside
    // its scheduler callback, so the listener may run on a non-React tick.
    engine.setRuntimeErrorHandler((err) => {
      this.fireOnError(err)
    })
  }

  async init(): Promise<void> {
    if (this.isInitialized) return
    if (this.isDisposed) {
      throw new Error('LiveCodingRuntime: cannot init after dispose')
    }
    await this.engine.init()
    this.isInitialized = true
  }

  /**
   * The nine-step play lifecycle (PK1). See class JSDoc above.
   *
   * Returns the evaluate error if any (also fires `onError` listeners).
   * The bus is left untouched on error — no publish, no unpublish.
   */
  async play(): Promise<{ error: Error | null }> {
    if (this.isDisposed) {
      const err = new Error('LiveCodingRuntime: cannot play after dispose')
      this.fireOnError(err)
      return { error: err }
    }

    // Step 1 — init if needed.
    try {
      if (!this.isInitialized) {
        await this.engine.init()
        this.isInitialized = true
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.fireOnError(error)
      return { error }
    }

    // Step 2 — evaluate the current file content (P1: pass through unchanged).
    const code = this.getFileContent()
    let evalResult: { error?: Error }
    try {
      evalResult = await this.engine.evaluate(code)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.fireOnError(error)
      return { error }
    }

    // Step 3 — error gate. Don't publish, don't play.
    if (evalResult.error) {
      this.fireOnError(evalResult.error)
      return { error: evalResult.error }
    }

    // Steps 4–6 — read components, elevate scheduler if needed, build payload.
    // SYNCHRONOUS section: no awaits between here and step 7.
    const components = this.engine.components
    const streaming = components.streaming
    const audio = components.audio
    const queryable = components.queryable
    const inlineViz = components.inlineViz

    // Step 5 — scheduler elevation (S8). If the engine ships a native
    // queryable, use it. Otherwise wrap streaming + audio in a
    // BufferedScheduler so consumers can query for inline zones / panel viz.
    let scheduler = queryable?.scheduler ?? null
    if (!scheduler && streaming && audio) {
      // Lazily construct (or reuse if a previous play already created one).
      // Reuse keeps the scheduler's rolling event buffer alive across
      // re-evaluate so inline zones don't lose their backlog mid-play.
      if (!this.bufferedSchedulerRef) {
        this.bufferedSchedulerRef = new BufferedScheduler(
          streaming.hapStream,
          audio.audioCtx,
        )
      }
      scheduler = this.bufferedSchedulerRef
    }

    // Step 6 — build the payload. Every slot is optional; consumers guard.
    // The `audio` slot is forwarded whole (not just the analyser) so the
    // EditorView can reach `audioCtx` for highlighting timing math.
    const payload: AudioPayload = {
      hapStream: streaming?.hapStream,
      analyser: audio?.analyser,
      scheduler: scheduler ?? undefined,
      inlineViz,
      audio,
    }

    // Step 7 — publish to the bus BEFORE play. Subscribers fire SYNC.
    workspaceAudioBus.publish(this.fileId, payload)

    // Step 8 — start the engine.
    try {
      this.engine.play()
    } catch (err) {
      // If play itself throws, unpublish so the bus doesn't show a phantom
      // running source. Then surface the error.
      workspaceAudioBus.unpublish(this.fileId)
      const error = err instanceof Error ? err : new Error(String(err))
      this.fireOnError(error)
      return { error }
    }

    // Step 9 — extract BPM, mark playing, fire listeners.
    this.currentBpm = extractBpmFromCode(code)
    this.isPlayingState = true
    this.firePlayingChanged(true)

    return { error: null }
  }

  stop(): void {
    if (this.isDisposed) return
    // Stopping is idempotent — calling twice should be a no-op, not throw.
    if (!this.isPlayingState) {
      // Even when not playing, the bus may still hold our entry from a
      // previous publish that wasn't followed by stop. Clear it to be safe.
      workspaceAudioBus.unpublish(this.fileId)
      return
    }
    try {
      this.engine.stop()
    } finally {
      // Always unpublish, even if engine.stop throws — leaving a phantom
      // entry on the bus is worse than swallowing a stop error.
      workspaceAudioBus.unpublish(this.fileId)
      this.isPlayingState = false
      this.firePlayingChanged(false)
    }
  }

  dispose(): void {
    if (this.isDisposed) return
    // Order matters: stop first (which unpublishes), then release the
    // elevated scheduler, then dispose the engine. Reversing would leak
    // a HapStream subscription on the BufferedScheduler if the engine
    // disposes its HapStream first.
    try {
      this.stop()
    } catch {
      // Swallow stop errors during dispose — we're tearing down anyway.
    }
    this.bufferedSchedulerRef?.dispose()
    this.bufferedSchedulerRef = null
    try {
      this.engine.dispose()
    } catch {
      // Same reason — best effort.
    }
    this.isDisposed = true
    this.errorListeners.clear()
    this.playingChangedListeners.clear()
  }

  onError(cb: (err: Error) => void): () => void {
    this.errorListeners.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      this.errorListeners.delete(cb)
    }
  }

  onPlayingChanged(cb: (playing: boolean) => void): () => void {
    this.playingChangedListeners.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      this.playingChangedListeners.delete(cb)
    }
  }

  getBpm(): number | undefined {
    return this.currentBpm
  }

  // -------------------------------------------------------------------------
  // Internal listener dispatchers — snapshot-then-iterate so a listener
  // that unsubscribes itself during the callback doesn't break the loop.
  // -------------------------------------------------------------------------

  private fireOnError(err: Error): void {
    if (this.errorListeners.size === 0) return
    const snapshot = Array.from(this.errorListeners)
    for (const cb of snapshot) {
      try {
        cb(err)
      } catch {
        // Listener exceptions never break the dispatch loop.
      }
    }
  }

  private firePlayingChanged(playing: boolean): void {
    if (this.playingChangedListeners.size === 0) return
    const snapshot = Array.from(this.playingChangedListeners)
    for (const cb of snapshot) {
      try {
        cb(playing)
      } catch {
        // Listener exceptions never break the dispatch loop.
      }
    }
  }
}
