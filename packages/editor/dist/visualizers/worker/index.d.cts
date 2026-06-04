/**
 * hostP5Worker — the bundler-AGNOSTIC worker host that runs a p5 sketch in a
 * `WorkerGlobalScope` and renders it to a transferred `OffscreenCanvas` (Phase B /
 * B-3, epic #228). The app's `viz-worker.ts` (bundled by Next via
 * `new Worker(new URL(...))`) is a two-line shell: `hostP5Worker(self)`.
 *
 * Lifecycle (one worker per renderer for B-3; pool arrives in B-6):
 *   1. `mount`  — install the DOM shim (PV70) BEFORE importing p5 (condition 1),
 *      compile the sketch from its CODE STRING (the SAME pure `compileP5Code` the
 *      main renderer uses — no fork), feed it shim-backed `stave.analyser` /
 *      `stave.scheduler` + a bus-backed `staveUniforms`, and start consuming
 *      `SignalFrame`s.
 *   2. per FRAME — `feed.applyFrame` (owns the ONE bus tick — PK22) + refresh the
 *      raw shims, then drive EXACTLY ONE p5 `redraw()` (1:1 with the main
 *      sampler's frame → cadence can't drift), then blit p5's render canvas onto
 *      the presenting canvas.
 *   3. `resize` / `pause` / `resume` / `destroy` — lifecycle control.
 *
 * RENDER-PRESENT: p5's own canvases stay worker-local throwaways (the shim mints a
 * fresh OffscreenCanvas per `createElement('canvas')` — condition 5); each redraw
 * we BLIT p5's render canvas → the transferred presenting canvas via a
 * `bitmaprenderer` context (`transferToImageBitmap` → `transferFromImageBitmap`,
 * zero-copy). This sidesteps the fragile "which createElement call is the on-screen
 * canvas" problem and keeps ALL p5 cost in the worker (the B-0 spike already proved
 * the WEBGL offscreen content reads back).
 *
 * CADENCE (PK22 resolution): the user setup is wrapped to call `noLoop()` right
 * after it runs, so p5 does NOT auto-loop; we drive one `redraw()` per received
 * frame. `staveUniforms.__tick` is a no-op in the worker (built without `onTick`) —
 * the feed already ticked the bus, so the draw reads an already-ticked bus.
 *
 * REF: PV70 (.anvi/vyapti.md), PK22 (.anvi/krama.md), dom-shim.ts, rawShims.ts,
 *      workerBusFeed.ts, signalTransport.ts, p5Compiler.ts (the shared compiler).
 */
/** The minimal worker-global surface the host needs (a `DedicatedWorkerGlobalScope`
 *  on the real worker; structural so it's testable). */
interface WorkerScope {
    addEventListener(type: 'message', handler: (ev: {
        data: unknown;
    }) => void): void;
    postMessage(message: unknown): void;
}
declare function hostP5Worker(scope: WorkerScope): void;

/**
 * Control-message protocol for the viz worker (B-3) — the lifecycle commands the
 * main `WorkerVizRenderer` posts to the worker `hostP5Worker`. These share the
 * worker's `postMessage` channel with the per-frame `SignalFrame`s; the two are
 * disambiguated structurally — control messages carry a `type: string`, signal
 * frames carry the `__staveSignalFrame` envelope tag and NO `type` (signalTransport.ts).
 * So each side ignores the other's messages by checking for `.type`.
 */
/** MAIN → WORKER: create the p5 instance against a transferred OffscreenCanvas. */
interface MountMessage {
    type: 'mount';
    /** Renderer kind — `'p5'` for B-3 (hydra arrives in B-5). */
    kind: 'p5';
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

export { type DestroyMessage, type MountMessage, type PauseMessage, type ResizeMessage, type ResumeMessage, type WorkerControlMessage, type WorkerDiagMessage, hostP5Worker };
