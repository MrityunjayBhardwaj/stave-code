/**
 * vizWorkerPool — a bounded pool of warm viz Web Workers (#263 part A).
 *
 * WHY (the memory fix B couldn't deliver): terminate-based teardown (part B) does
 * NOT return renderer RSS to the OS — terminating a worker leaves its pages
 * mapped, and a fresh worker spawned on the next mount allocates ANEW, so under
 * scroll churn RSS GROWS (observed +356MB/cycle, hetvabhasa P112). A pool fixes
 * this by REUSING the worker thread: on release we keep the thread + its imported
 * p5/hydra module warm (only its viz state + GL context are torn down, freeing a
 * context slot); on the next mount we hand that same warm worker a new
 * OffscreenCanvas + sketch (the worker host already supports re-mount —
 * hostP5Worker.ts: "Tear down a previous mount — a pooled/shared worker
 * re-mount"). No fresh thread/isolate allocation → RSS bounded across churn.
 *
 * transferControlToOffscreen is ONE-SHOT per <canvas> (PV77), so reuse is at the
 * WORKER-THREAD level: each mount transfers ITS zone's own canvas to the worker;
 * the worker drops the old OffscreenCanvas and binds the new one. We never migrate
 * a live context — we re-mount a parked (state-free) worker.
 *
 * Gated by `localStorage['stave.viz.pool'] === '1'` while it's validated (the
 * reclamation gate flips it on to A/B against the terminate path). Cap =
 * ~hardwareConcurrency − 2 parked workers; surplus on release is terminated.
 *
 * REF: WorkerVizRenderer (acquire on mount / release on destroy), hostP5Worker.ts
 *      (re-mount support), PV77, hetvabhasa P112, PHASE-B-PLAN.md §B.2 (B-6), #263.
 */
import { getVizWorkerFactory } from './vizWorkerFactory'

function poolCap(): number {
  const hc =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4
  return Math.max(2, hc - 2)
}

/** Whether the worker pool is active. Opt-in via localStorage while validated. */
export function isVizWorkerPoolEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('stave.viz.pool') === '1'
  } catch {
    return false
  }
}

/** Parked (warm, state-free) workers available for reuse. */
const parked: Worker[] = []

/**
 * A worker for a new viz mount: reuse a parked warm one if available, else spawn
 * a fresh one via the registered factory. Returns null only if no factory is
 * registered (caller falls back to its error path).
 */
export function acquireVizWorker(): Worker | null {
  const reused = parked.pop()
  if (reused) return reused
  const make = getVizWorkerFactory()
  return make ? make() : null
}

/**
 * Return a worker after its viz has been destroyed. The CALLER must already have
 * posted `{type:'destroy'}` (so the worker freed its p5/hydra instance + GL
 * context) and removed its own message listeners. We park it warm for reuse, or
 * terminate it if the pool is already at cap.
 */
export function releaseVizWorker(worker: Worker): void {
  if (parked.length < poolCap()) {
    parked.push(worker)
  } else {
    try {
      worker.terminate()
    } catch {
      /* ignore */
    }
  }
}

/** Number of warm workers currently parked (observation / tests). */
export function parkedVizWorkerCount(): number {
  return parked.length
}

/** Terminate + clear all parked workers (tests / teardown). */
export function drainVizWorkerPool(): void {
  for (const w of parked.splice(0)) {
    try {
      w.terminate()
    } catch {
      /* ignore */
    }
  }
}
