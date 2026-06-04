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
 * fallback, so a non-isolated/old browser (or the flag off) is never broken.
 *
 * Used by both `compilePreset` (user `.viz()` presets) and `DEFAULT_VIZ_DESCRIPTORS`
 * (the built-in picker) so BOTH paths get worker offload from one decision point.
 *
 * REF: vizConfig.workerRenderer, vizWorkerFactory, worker/capabilities, PHASE-B-PLAN §5 B-3.
 */

import type { VizRenderer } from '../types'
import { P5VizRenderer } from './P5VizRenderer'
import { WorkerVizRenderer } from './WorkerVizRenderer'
import { compileP5Code } from '../p5Compiler'
import { getVizConfig } from '../vizConfig'
import { getVizWorkerFactory } from '../vizWorkerFactory'
import { detectWorkerVizCapabilities } from '../worker/capabilities'

/** Build a p5 `VizRenderer` for this sketch — worker-offloaded when supported +
 *  enabled, else main-thread. `name` is the workspace path (error attribution). */
export function makeP5Renderer(code: string, name: string): VizRenderer {
  const useWorker =
    getVizConfig().workerRenderer &&
    getVizWorkerFactory() !== null &&
    detectWorkerVizCapabilities().transport !== 'main-thread'

  return useWorker
    ? new WorkerVizRenderer('p5', code, name)
    : new P5VizRenderer(compileP5Code(code, name))
}
