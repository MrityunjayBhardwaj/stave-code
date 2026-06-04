/**
 * Control-message protocol for the viz worker (B-3) — the lifecycle commands the
 * main `WorkerVizRenderer` posts to the worker `hostP5Worker`. These share the
 * worker's `postMessage` channel with the per-frame `SignalFrame`s; the two are
 * disambiguated structurally — control messages carry a `type: string`, signal
 * frames carry the `__staveSignalFrame` envelope tag and NO `type` (signalTransport.ts).
 * So each side ignores the other's messages by checking for `.type`.
 */

/** MAIN → WORKER: create the p5 instance against a transferred OffscreenCanvas. */
export interface MountMessage {
  type: 'mount'
  /** Renderer kind — `'p5'` for B-3 (hydra arrives in B-5). */
  kind: 'p5'
  /** The sketch source (a transferable string, compiled in-worker — PLAN §7.3). */
  code: string
  /** Source label for error attribution (the workspace path). */
  name: string
  /** The presenting surface, transferred via `transferControlToOffscreen`. */
  canvas: OffscreenCanvas
  /** CSS size of the preview pane. */
  size: { w: number; h: number }
  /** Device pixel ratio at mount (the worker sizes the backing store ×dpr). */
  dpr: number
  /** Merged signal-alias map (built on main from impure settings — the worker
   *  bus stays pure, mirrors P5VizRenderer). */
  aliases?: Record<string, string | string[]>
}

/** MAIN → WORKER: the preview pane resized / DPR changed. */
export interface ResizeMessage {
  type: 'resize'
  w: number
  h: number
  dpr: number
}

/** MAIN → WORKER: pause / resume the draw loop (off-screen, Phase C). */
export interface PauseMessage {
  type: 'pause'
}
export interface ResumeMessage {
  type: 'resume'
}

/** MAIN → WORKER: tear down the p5 instance + stop consuming frames. */
export interface DestroyMessage {
  type: 'destroy'
}

export type WorkerControlMessage =
  | MountMessage
  | ResizeMessage
  | PauseMessage
  | ResumeMessage
  | DestroyMessage

/** WORKER → MAIN: diagnostics (sketch compile/runtime error, first-frame ready).
 *  B-3 forwards worker errors to the main console; richer engineLog bridging is
 *  Phase B-7 (#230 profiler-in-worker). */
export interface WorkerDiagMessage {
  type: 'diag'
  level: 'error' | 'info'
  message: string
  /** Optional stack (first frames) for an error. */
  stack?: string
}

/** Structural guard — is this a control message (has a string `type`) rather than
 *  a `SignalFrame` envelope? */
export function isControlMessage(data: unknown): data is WorkerControlMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { type?: unknown }).type === 'string'
  )
}
