/**
 * registerVizWorker — register the app's Next-bundled viz-worker constructor with
 * the editor's DI seam (Phase B / B-3, #245).
 *
 * The editor can't construct the worker itself (its tsup bundle can't host
 * `new Worker(new URL(...))` for Next to bundle). So the app injects the factory:
 * `WorkerVizRenderer` calls `getVizWorkerFactory()` at mount. The
 * `new URL('./viz-worker.ts', import.meta.url)` pattern is detected STATICALLY by
 * Turbopack at build time (regardless of when the factory runs), emitting
 * viz-worker.ts + p5 as a worker chunk.
 *
 * Idempotent + SSR-safe — only registers in a browser with `Worker` available.
 */
import {
  setVizWorkerFactory,
  getVizConfig,
  setVizConfig,
  getVizWorkerOverride,
  getVizMaxFpsOverride,
  getVizMaxDprOverride,
} from '@stave/editor'

// The `stave.viz.{worker,maxFps,maxDpr}` localStorage overrides are read via the
// shared `vizFlags` readers (single source of truth, #327): `stave.viz.worker='1'|'0'`
// force-toggles the worker renderer; `maxFps`/`maxDpr` cap the #261 pacing/resolution
// levers. Absent → the vizConfig default is kept.

let registered = false

export function registerVizWorker(): void {
  if (registered) return
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return
  registered = true
  setVizWorkerFactory(
    () => new Worker(new URL('./viz-worker.ts', import.meta.url), { type: 'module' }),
  )
  // Apply the localStorage override (opt-in '1' / opt-out '0'); absent → leave the
  // config default. Merge over the live config so other runtime settings persist.
  const overrides: Partial<{ workerRenderer: boolean; maxFps: number; maxDpr: number }> = {}
  const workerOverride = getVizWorkerOverride()
  if (workerOverride !== null) overrides.workerRenderer = workerOverride
  const fps = getVizMaxFpsOverride()
  if (fps !== null) overrides.maxFps = fps
  const dpr = getVizMaxDprOverride()
  if (dpr !== null) overrides.maxDpr = dpr
  if (Object.keys(overrides).length > 0) {
    setVizConfig({ ...getVizConfig(), ...overrides })
  }

  installForceBrokenWorkerHook()
}

/**
 * E2E-only observation hook — swap the worker factory for one whose worker
 * ALWAYS fails before the first `ready` frame (it posts a `diag` error on mount).
 * `WorkerVizRenderer` forwards that to `onError`, and because it's pre-`ready`,
 * `FallbackVizRenderer` tears the worker down and mounts the main-thread renderer
 * with the real sketch (PK23). Lets a test OBSERVE the runtime fallback in the
 * real app, rather than only the unit-level trigger logic.
 *
 * Dead in production (statically-eliminated `NODE_ENV` guard) and gated on the
 * `__STAVE_E2E__` runtime flag — mirrors the other `__stave*` E2E hooks.
 */
function installForceBrokenWorkerHook(): void {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV === 'production') return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(window as any).__STAVE_E2E__) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__staveForceBrokenVizWorker = (): boolean => {
    const src =
      "self.onmessage=function(){self.postMessage({type:'diag',level:'error',message:'forced E2E worker failure (pre-ready)'})}"
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
    setVizWorkerFactory(() => new Worker(url))
    return true
  }
}
