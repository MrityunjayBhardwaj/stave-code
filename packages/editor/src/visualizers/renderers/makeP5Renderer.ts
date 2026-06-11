/**
 * makeP5Renderer — the p5 renderer factory that chooses, per mount, between the
 * OffscreenCanvas-worker renderer and the main-thread renderer (Phase B / B-3).
 *
 * Worker rendering is selected ONLY when ALL hold:
 *   1. the `workerRenderer` flag is on (`vizConfig`; OFF by default until the
 *      matrix gate is green),
 *   2. the app registered a worker factory (`setVizWorkerFactory` — see the DI
 *      seam; absent in non-app hosts / SSR),
 *   3. the browser can offload (`detectWorkerVizCapabilities().transport !==
 *      'main-thread'` — OffscreenCanvas + transferControlToOffscreen + Worker).
 * Otherwise the proven `P5VizRenderer` runs on the main thread — the ALWAYS
 * fallback, so a non-isolated/old browser (or the flag off) is never broken. When
 * the worker path IS selected it's wrapped in a `FallbackVizRenderer` so a worker
 * that fails to start degrades to the main-thread renderer at runtime too (#247).
 *
 * Used by both `compilePreset` (user `.viz()` presets) and `DEFAULT_VIZ_DESCRIPTORS`
 * (the built-in picker) so BOTH paths get worker offload from one decision point.
 *
 * REF: vizConfig.workerRenderer, vizWorkerFactory, worker/capabilities,
 *      FallbackVizRenderer (#247), PHASE-B-PLAN §5 B-3.
 */

import type { VizRenderer } from '../types'
import { P5VizRenderer } from './P5VizRenderer'
import { WorkerVizRenderer } from './WorkerVizRenderer'
import { FallbackVizRenderer } from './FallbackVizRenderer'
import { compileP5Code } from '../p5Compiler'
import { getVizConfig } from '../vizConfig'
import { getVizWorkerFactory } from '../vizWorkerFactory'
import { detectWorkerVizCapabilities } from '../worker/capabilities'

/** True when the OffscreenCanvas-worker path should be used: flag on + the app
 *  registered a worker factory + the browser can offload. Shared by the p5 and
 *  hydra factories so both make the SAME decision from one place. */
export function shouldUseWorkerRenderer(): boolean {
  return (
    getVizConfig().workerRenderer &&
    getVizWorkerFactory() !== null &&
    detectWorkerVizCapabilities().transport !== 'main-thread'
  )
}

/** Build a p5 `VizRenderer` for this sketch — worker-offloaded (with main-thread
 *  fallback) when supported + enabled, else main-thread. `name` is the workspace
 *  path (error attribution). */
export function makeP5Renderer(code: string, name: string): VizRenderer {
  return shouldUseWorkerRenderer()
    ? new FallbackVizRenderer(
        () => new WorkerVizRenderer('p5', code, name),
        () => new P5VizRenderer(compileP5Code(code, name)),
      )
    : new P5VizRenderer(compileP5Code(code, name))
}
