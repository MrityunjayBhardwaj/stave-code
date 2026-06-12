/**
 * makeGLSLRenderer — the GLSL renderer factory that chooses, per mount, between
 * the OffscreenCanvas-worker renderer and the main-thread renderer (issue #281).
 * The symmetric analog of `makeHydraRenderer` / `makeP5Renderer`.
 *
 * Worker rendering is selected on the SAME condition (`shouldUseWorkerRenderer`):
 * flag on + worker factory registered + browser can offload. When selected it's
 * wrapped in a `FallbackVizRenderer` so a worker that fails to start (e.g. a
 * shader that won't compile in the worker GL) degrades to the proven main-thread
 * `GLSLVizRenderer` (#247). Otherwise — old/non-isolated browser or flag off —
 * the main-thread renderer runs.
 *
 * GLSL is the Tier-1, ZERO-library reference: a `.glsl` sketch is a plain
 * transferable string (the wrapped fragment source), so it crosses to the worker
 * with no closure-serialization problem (unlike built-in hydra closures), and the
 * worker renders DIRECT into the transferred OffscreenCanvas with no blit (PV73).
 *
 * REF: makeHydraRenderer (the analog), FallbackVizRenderer (#247), hostVizWorker
 *      (kind 'glsl'), GLSLVizRenderer (the main-thread target), glslCore.
 */

import type { VizRenderer } from '../types'
import { GLSLVizRenderer } from './GLSLVizRenderer'
import { WorkerVizRenderer } from './WorkerVizRenderer'
import { FallbackVizRenderer } from './FallbackVizRenderer'
import { shouldUseWorkerRenderer } from './makeP5Renderer'

/** Build a GLSL `VizRenderer` for a `.glsl` sketch — worker-offloaded (with
 *  main-thread fallback) when supported + enabled, else main-thread. `name` is the
 *  workspace path (error attribution). */
export function makeGLSLRenderer(code: string, name: string): VizRenderer {
  return shouldUseWorkerRenderer()
    ? new FallbackVizRenderer(
        () => new WorkerVizRenderer('glsl', code, name),
        () => new GLSLVizRenderer(code, name),
      )
    : new GLSLVizRenderer(code, name)
}
