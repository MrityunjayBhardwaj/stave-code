import type { VizDescriptor } from './types'
import type { VizPreset } from './vizPreset'
import { HydraVizRenderer } from './renderers/HydraVizRenderer'
import { makeP5Renderer } from './renderers/makeP5Renderer'
import { compileP5Code, isFullLifecycleSketch } from './p5Compiler'
import { compileHydraCode } from './hydraCompiler'

// Re-export the pure compile functions so existing consumers that
// import from `./vizCompiler` keep working. The implementations live
// in `./p5Compiler` / `./hydraCompiler` to keep unit-test module
// graphs free of the transitive `p5` / `gifenc` dependency chain
// that comes in via `P5VizRenderer`.
export { compileP5Code, isFullLifecycleSketch, compileHydraCode }

/**
 * Compiles user-authored viz code into a VizDescriptor.
 *
 * Hydra code: evaluated in a function scope with the hydra synth
 *   object as `s` and a `stave` namespace mirroring the p5 convention:
 *     - `stave.scheduler` — IRPattern | null (combined pattern scheduler)
 *     - `stave.tracks`    — Map<trackId, IRPattern> (per-track)
 *   Sketches that reference only `s` keep working — the `stave` arg
 *   is additive. Uses `new Function()`.
 *
 * p5 code: evaluated as a full p5 sketch script. Users write real
 *   `function preload/setup/draw` declarations and access injected
 *   Stave-specific inputs via a single `stave` namespace global:
 *     - `stave.scheduler`  — PatternScheduler | null
 *     - `stave.analyser`   — AnalyserNode | null
 *     - `stave.hapStream`  — HapStream | null
 *   Legacy draw-body snippets (no `function draw` declaration) are
 *   auto-wrapped for backwards compatibility.
 */
export function compilePreset(preset: VizPreset): VizDescriptor {
  const { id, name, renderer, code, requires } = preset

  if (renderer === 'hydra') {
    return {
      id,
      label: name,
      renderer: 'hydra',
      requires,
      ...(preset.nativeSize ? { nativeSize: preset.nativeSize } : {}),
      factory: () => new HydraVizRenderer(compileHydraCode(code)),
    }
  }

  if (renderer === 'p5') {
    return {
      id,
      label: name,
      renderer: 'p5',
      requires,
      ...(preset.nativeSize ? { nativeSize: preset.nativeSize } : {}),
      // Pass `name` (the workspace path) as the source so the factory's
      // runtime-error catch can attribute the engineLog entry back to
      // the file. Without it, a top-level `new Mp()` typo surfaced on
      // the preview canvas but nowhere else — no Console row, no
      // Monaco squiggle.
      // B-3: `makeP5Renderer` returns a worker-offloaded renderer when the flag
      // is on + the browser is capable, else the main-thread P5VizRenderer.
      factory: () => makeP5Renderer(code, name),
    }
  }

  throw new Error(`Unknown renderer: ${renderer}`)
}

