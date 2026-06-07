/**
 * hostVizWorker — the bundler-AGNOSTIC worker host that runs a viz sketch in a
 * `WorkerGlobalScope` and renders it to a transferred `OffscreenCanvas` (Phase B,
 * epic #228). Hosts BOTH renderer kinds, branching on `MountMessage.kind`:
 *   - `'p5'`    (B-3) — install the 6-part p5 DOM shim, compile via the shared
 *     `compileP5Code`, drive `redraw()` then BLIT p5's worker-local canvas onto the
 *     transferred presenting canvas (p5 makes its OWN canvases — Tier 2).
 *   - `'hydra'` (B-5) — install the 2-part hydra shim, `new Hydra({ canvas })` on
 *     the transferred canvas DIRECTLY (Tier 1: hydra accepts a canvas → no blit),
 *     feed `s.a.fft[]` from the frame's master bytes, drive `hydra.tick()`.
 *
 * The app's `viz-worker.ts` (bundled by Next via `new Worker(new URL(...))`) is a
 * two-line shell: `hostVizWorker(self)`. ONE worker hosts ONE kind (B-3/B-5; a
 * pool that reuses a worker across kinds is B-6) — so only one shim ever installs.
 *
 * SHARED per frame (both kinds) — `applyAndDraw`: `feed.applyFrame` owns the ONE
 * bus tick (PK22) + refresh the raw shims, then the kind-specific `draw()` runs
 * EXACTLY ONCE (1:1 with the main sampler's frame → cadence can't drift). After
 * the first successful draw the host posts a one-shot `ready` (B-5 / #247): the
 * main `FallbackVizRenderer` waits for it; a throw or timeout BEFORE it falls the
 * renderer back to the main thread (a worker that throws/hangs at startup = blank).
 *
 * CADENCE (PK22): the p5 setup is wrapped to `noLoop()` (we drive `redraw()`); the
 * hydra instance is `autoLoop:false` (we drive `tick()`). `staveUniforms.__tick`
 * is a no-op in the worker (built without `onTick`) — the feed already ticked.
 *
 * REF: PV70 (.anvi/vyapti.md), PK22 (.anvi/krama.md), dom-shim.ts, rawShims.ts,
 *      workerBusFeed.ts, signalTransport.ts, p5Compiler.ts, hydraCompiler.ts,
 *      hydraStaveBag.ts (the shared bag builder), HydraVizRenderer (main contract).
 */
/** The minimal worker-global surface the host needs (a `DedicatedWorkerGlobalScope`
 *  on the real worker; structural so it's testable). */
interface WorkerScope {
    addEventListener(type: 'message', handler: (ev: {
        data: unknown;
    }) => void): void;
    postMessage(message: unknown): void;
}
declare function hostVizWorker(scope: WorkerScope): void;
/** Back-compat alias — the app's worker entry historically called `hostP5Worker`.
 *  The host now serves both kinds; the name is retained so existing wiring (and
 *  the worker-safe `index.ts` export) keeps resolving. Prefer `hostVizWorker`. */
declare const hostP5Worker: typeof hostVizWorker;

/**
 * Control-message protocol for the viz worker (B-3) — the lifecycle commands the
 * main `WorkerVizRenderer` posts to the worker `hostP5Worker`. These share the
 * worker's `postMessage` channel with the per-frame `SignalFrame`s; the two are
 * disambiguated structurally — control messages carry a `type: string`, signal
 * frames carry the `__staveSignalFrame` envelope tag and NO `type` (signalTransport.ts).
 * So each side ignores the other's messages by checking for `.type`.
 */

/** MAIN → WORKER: create the renderer instance against a transferred OffscreenCanvas. */
interface MountMessage {
    type: 'mount';
    /** Renderer kind — `'p5'` (B-3) or `'hydra'` (B-5). The host installs the
     *  matching DOM shim + imports the matching library + drives the matching draw. */
    kind: 'p5' | 'hydra';
    /** The sketch source (a transferable string, compiled in-worker — PLAN §7.3). */
    code: string;
    /** Source label for error attribution (the workspace path). */
    name: string;
    /** The presenting surface, transferred via `transferControlToOffscreen`. */
    canvas: OffscreenCanvas;
    /** CSS size of the preview pane. */
    size: {
        w: number;
        h: number;
    };
    /** Device pixel ratio at mount (the worker sizes the backing store ×dpr). */
    dpr: number;
    /** Merged signal-alias map (built on main from impure settings — the worker
     *  bus stays pure, mirrors P5VizRenderer). */
    aliases?: Record<string, string | string[]>;
}
/** MAIN → WORKER: the preview pane resized / DPR changed. */
interface ResizeMessage {
    type: 'resize';
    w: number;
    h: number;
    dpr: number;
}
/** MAIN → WORKER: pause / resume the draw loop (off-screen, Phase C). */
interface PauseMessage {
    type: 'pause';
}
interface ResumeMessage {
    type: 'resume';
}
/** MAIN → WORKER: tear down the p5 instance + stop consuming frames. */
interface DestroyMessage {
    type: 'destroy';
}
type WorkerControlMessage = MountMessage | ResizeMessage | PauseMessage | ResumeMessage | DestroyMessage;
/** WORKER → MAIN: diagnostics (sketch compile/runtime error, first-frame ready).
 *  B-3 forwards worker errors to the main console; richer engineLog bridging is
 *  Phase B-7 (#230 profiler-in-worker). */
interface WorkerDiagMessage {
    type: 'diag';
    level: 'error' | 'info';
    message: string;
    /** Optional stack (first frames) for an error. */
    stack?: string;
}
/** WORKER → MAIN: the worker drew its FIRST frame successfully (B-5 / #247). One-
 *  shot liveness signal: `FallbackVizRenderer` waits for this to mark the worker
 *  healthy; an error or a mount timeout BEFORE it triggers the main-thread
 *  fallback (a worker that throws or hangs at startup = blank viz without this). */
interface WorkerReadyMessage {
    type: 'ready';
}

export { type DestroyMessage, type MountMessage, type PauseMessage, type ResizeMessage, type ResumeMessage, type WorkerControlMessage, type WorkerDiagMessage, type WorkerReadyMessage, hostP5Worker, hostVizWorker };
