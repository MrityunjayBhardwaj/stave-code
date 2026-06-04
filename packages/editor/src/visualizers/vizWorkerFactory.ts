/**
 * Viz-worker factory DI seam (Phase B / B-3).
 *
 * The worker MUST be constructed where the bundler can statically see
 * `new Worker(new URL('./viz-worker.ts', import.meta.url))` — that's the APP
 * (Next/Turbopack), not this tsup-built package. So the editor stays
 * bundler-agnostic: the app registers a factory at startup, and
 * `WorkerVizRenderer` reads it here. When no factory is registered (e.g. a host
 * that hasn't wired the worker, or the flag is off), `makeRenderer` falls back to
 * the main-thread `P5VizRenderer`.
 *
 * REF: PHASE-B-PLAN §4 (transport/bundling), vizCompiler.makeRenderer.
 */

/** Constructs a fresh viz worker. The app provides
 *  `() => new Worker(new URL('./viz-worker.ts', import.meta.url), { type: 'module' })`. */
export type VizWorkerFactory = () => Worker

let factory: VizWorkerFactory | null = null

/** Register (or clear with `null`) the app's worker constructor. Idempotent. */
export function setVizWorkerFactory(f: VizWorkerFactory | null): void {
  factory = f
}

/** The registered factory, or `null` if the host hasn't wired worker rendering. */
export function getVizWorkerFactory(): VizWorkerFactory | null {
  return factory
}
