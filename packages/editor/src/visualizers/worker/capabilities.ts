/**
 * Worker-viz capability detection — the degrade-path scaffold for Phase B.
 *
 * Phase B moves viz `draw()` off the main thread into an OffscreenCanvas worker
 * (epic #228). Whether that is possible — and *how* the per-frame signal data
 * reaches the worker — depends on browser capabilities that vary by environment:
 *
 *   - `Worker` + `OffscreenCanvas` + `HTMLCanvasElement.transferControlToOffscreen`
 *     → worker rendering is possible at all.
 *   - `crossOriginIsolated` + `SharedArrayBuffer`
 *     → the zero-copy SAB signal transport is available (the measured optimization,
 *       gated behind the COOP/COEP header — see B-1 #239 / Q2 #237).
 *
 * B-1 (#239) confirmed by observation that the live COOP=same-origin +
 * COEP=credentialless header yields `crossOriginIsolated === true` (and that a
 * `window.open` popup inherits it). This module turns that runtime truth into a
 * single capability snapshot + a sensible default transport choice, so B-2/B-3
 * can pick SAB vs postMessage vs main-thread without re-probing globals ad hoc.
 *
 * Pure + environment-injectable → plain unit tests (no IDB/DOM — see the editor
 * "split pure logic from I/O" rule). The live app passes nothing and reads
 * `globalThis`.
 */

/**
 * How per-frame viz signal data crosses to the renderer.
 *
 * - `'sab'`         — worker render + zero-copy SharedArrayBuffer transport
 *                     (requires cross-origin isolation; the primary path).
 * - `'postmessage'` — worker render + transferable-ArrayBuffer postMessage
 *                     transport (no isolation needed; the required fallback for
 *                     non-isolated browsers, e.g. Safari).
 * - `'main-thread'` — no worker offload possible; render on the main thread with
 *                     today's `P5VizRenderer` / `HydraVizRenderer`.
 */
export type VizTransport = 'sab' | 'postmessage' | 'main-thread'

export interface WorkerVizCapabilities {
  /** COOP/COEP cross-origin isolation is active (gates SharedArrayBuffer). */
  crossOriginIsolated: boolean
  /** `OffscreenCanvas` constructor exists. */
  hasOffscreenCanvas: boolean
  /** `SharedArrayBuffer` constructor exists (still needs isolation to be useful). */
  hasSharedArrayBuffer: boolean
  /** `HTMLCanvasElement.prototype.transferControlToOffscreen` exists. */
  canTransferControl: boolean
  /** `Worker` constructor exists. */
  hasWorker: boolean
  /** Worker rendering is possible at all (worker + offscreen + transfer). */
  canUseWorker: boolean
  /** The default transport given these capabilities (see {@link VizTransport}). */
  transport: VizTransport
}

/**
 * The subset of the global environment this module reads. Injectable so the
 * selection logic can be unit-tested across capability matrices without touching
 * the real `globalThis`.
 */
export interface CapabilityEnv {
  crossOriginIsolated?: boolean
  OffscreenCanvas?: unknown
  SharedArrayBuffer?: unknown
  Worker?: unknown
  /** Stand-in for `HTMLCanvasElement` — we only probe for the transfer method. */
  HTMLCanvasElement?: { prototype?: { transferControlToOffscreen?: unknown } }
}

function isFn(v: unknown): boolean {
  return typeof v === 'function'
}

/**
 * Derive worker-viz capabilities + the default transport from an environment.
 *
 * Transport policy (capability-derived, deliberately separate from any
 * load/quality policy B-6 may add):
 *   1. Can't offload (no worker / offscreen / transferControl) → `'main-thread'`.
 *   2. Isolated + SharedArrayBuffer                            → `'sab'`.
 *   3. Worker-capable but not isolated                         → `'postmessage'`.
 *
 * Note: PHASE-B-PLAN §4's conservative line ("fallback to main if
 * !crossOriginIsolated") collapses cases 2+3; the plan's transport section +
 * decision §1 are the refined intent — worker rendering works without isolation,
 * only SAB needs it, so a non-isolated browser still offloads via postMessage.
 * This function encodes the refined three-tier truth; a consumer that wants the
 * conservative behaviour can treat anything but `'sab'` as main-thread.
 */
export function detectWorkerVizCapabilities(
  env: CapabilityEnv = globalThis as CapabilityEnv
): WorkerVizCapabilities {
  const crossOriginIsolated = env.crossOriginIsolated === true
  const hasOffscreenCanvas = isFn(env.OffscreenCanvas)
  const hasSharedArrayBuffer = isFn(env.SharedArrayBuffer)
  const hasWorker = isFn(env.Worker)
  const canTransferControl = isFn(
    env.HTMLCanvasElement?.prototype?.transferControlToOffscreen
  )

  const canUseWorker = hasWorker && hasOffscreenCanvas && canTransferControl

  let transport: VizTransport
  if (!canUseWorker) {
    transport = 'main-thread'
  } else if (crossOriginIsolated && hasSharedArrayBuffer) {
    transport = 'sab'
  } else {
    transport = 'postmessage'
  }

  return {
    crossOriginIsolated,
    hasOffscreenCanvas,
    hasSharedArrayBuffer,
    canTransferControl,
    hasWorker,
    canUseWorker,
    transport,
  }
}
