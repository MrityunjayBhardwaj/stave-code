/**
 * `@stave/editor/worker` — the worker-SAFE entry point (Phase B / B-3).
 *
 * A SEPARATE tsup bundle from the main `@stave/editor` index so a Web Worker
 * imports ONLY worker-safe modules (the p5 host, the bus feed, the shims, the
 * pure compiler) — NOT the editor's Monaco/React/yjs monolith. The app's
 * `viz-worker.ts` (bundled by Next via `new Worker(new URL(...))`) is a two-line
 * shell over `hostVizWorker`.
 *
 * Keep this surface minimal and DOM-light: anything imported here lands in the
 * worker bundle.
 */

export { hostVizWorker, hostP5Worker } from './hostP5Worker'
export type {
  WorkerControlMessage,
  MountMessage,
  ResizeMessage,
  PauseMessage,
  ResumeMessage,
  DestroyMessage,
  WorkerDiagMessage,
  WorkerReadyMessage,
} from './workerMessages'
