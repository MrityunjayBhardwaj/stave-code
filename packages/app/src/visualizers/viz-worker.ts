/**
 * viz-worker — the app's OffscreenCanvas viz Worker entry (Phase B / B-3, #245).
 *
 * Bundled by Next/Turbopack via `new Worker(new URL('./viz-worker.ts',
 * import.meta.url))` in `registerVizWorker.ts`. It is intentionally a two-line
 * shell: ALL the worker logic (DOM shim, p5 compile, bus feed, raw shims, draw
 * loop) lives in the bundler-agnostic `hostP5Worker` from the worker-safe
 * `@stave/editor/worker` subpath bundle. Keeping the entry here (in the app) is
 * what lets Next see the worker + bundle p5 into the worker chunk; the editor
 * (tsup) stays bundler-agnostic.
 */
import { hostP5Worker } from '@stave/editor/worker'

// `self` is the DedicatedWorkerGlobalScope (has addEventListener + postMessage).
hostP5Worker(self as unknown as Parameters<typeof hostP5Worker>[0])
