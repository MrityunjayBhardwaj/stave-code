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
import { setVizWorkerFactory, getVizConfig, setVizConfig } from '@stave/editor'

/** localStorage key that force-enables worker rendering while the `workerRenderer`
 *  config flag still defaults OFF — the switch for B-3 observation + the matrix
 *  gate, without a code change. Set `localStorage['stave.viz.worker'] = '1'`. Once
 *  the matrix is green the config DEFAULT flips to true and this override stays as
 *  an opt-OUT (`'0'`). */
const WORKER_VIZ_LS_KEY = 'stave.viz.worker'

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
  try {
    const v = localStorage.getItem(WORKER_VIZ_LS_KEY)
    if (v === '1' || v === '0') {
      setVizConfig({ ...getVizConfig(), workerRenderer: v === '1' })
    }
  } catch {
    /* localStorage may be unavailable (private mode) — ignore */
  }
}
