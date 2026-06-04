import type { VizDescriptor } from './types'
import { makeP5Renderer } from './renderers/makeP5Renderer'
import { makeHydraRenderer } from './renderers/makeHydraRenderer'
import {
  PIANOROLL_P5_CODE,
  WORDFALL_P5_CODE,
  SCOPE_P5_CODE,
  FSCOPE_P5_CODE,
  SPECTRUM_P5_CODE,
  SPIRAL_P5_CODE,
  PITCHWHEEL_P5_CODE,
} from './builtinP5Code'
import {
  HYDRA_DEFAULT_CODE,
  HYDRA_PIANOROLL_CODE,
  HYDRA_SCOPE_CODE,
  HYDRA_KALEID_CODE,
} from './renderers/builtinHydraCode'

/**
 * All built-in visualization modes.
 *
 * IDs follow the "mode:renderer" convention when multiple renderers offer
 * the same concept. Bare "mode" is the default renderer for that concept.
 *
 * The 7 p5 entries compile their factories from the bundled source code
 * strings — the SAME strings the workspace `preset/viz/*.p5` files carry.
 * Previously the picker mounted 7 hand-written TypeScript sketch classes
 * that had diverged from the preset code; per #184 (PV56) the picker and
 * the preset file share one code path.
 *
 * Each factory creates a NEW renderer instance per mount — never share
 * a single instance across multiple mounts.
 *
 * Consumers extend via spread:
 *   vizDescriptors={[...DEFAULT_VIZ_DESCRIPTORS, myCustomDescriptor]}
 */
export const DEFAULT_VIZ_DESCRIPTORS: VizDescriptor[] = [
  // p5 renderers (default for each mode) — compiled from bundled source.
  // B-3: `makeP5Renderer` offloads to an OffscreenCanvas worker when the flag is
  // on + the browser is capable, else the main-thread P5VizRenderer (fallback).
  { id: 'pianoroll',  label: 'Piano Roll',  renderer: 'p5', requires: ['streaming'], nativeSize: { w: 1200, h: 200 }, factory: () => makeP5Renderer(PIANOROLL_P5_CODE, 'pianoroll') },
  { id: 'wordfall',   label: 'Wordfall',    renderer: 'p5', requires: ['streaming'], factory: () => makeP5Renderer(WORDFALL_P5_CODE, 'wordfall') },
  { id: 'scope',      label: 'Scope',       renderer: 'p5', requires: ['streaming'], factory: () => makeP5Renderer(SCOPE_P5_CODE, 'scope') },
  { id: 'fscope',     label: 'FScope',      renderer: 'p5', requires: ['streaming'], factory: () => makeP5Renderer(FSCOPE_P5_CODE, 'fscope') },
  { id: 'spectrum',   label: 'Spectrum',    renderer: 'p5', requires: ['streaming'], factory: () => makeP5Renderer(SPECTRUM_P5_CODE, 'spectrum') },
  { id: 'spiral',     label: 'Spiral',      renderer: 'p5', requires: ['streaming'], factory: () => makeP5Renderer(SPIRAL_P5_CODE, 'spiral') },
  { id: 'pitchwheel', label: 'Pitchwheel',  renderer: 'p5', requires: ['streaming'], factory: () => makeP5Renderer(PITCHWHEEL_P5_CODE, 'pitchwheel') },

  // Hydra renderers (WebGL shader-based) — compiled from bundled code STRINGS
  // (#252) so `makeHydraRenderer` can offload them to an OffscreenCanvas worker
  // (a HydraPatternFn closure can't cross to a worker; on the main thread a heavy
  // hydra backdrop drops the editor to ~24fps — PV69 addendum). Main-thread
  // HydraVizRenderer remains the fallback (flag off / not isolated / worker fail).
  { id: 'hydra',              label: 'Hydra',              renderer: 'hydra', requires: ['audio'], factory: () => makeHydraRenderer(HYDRA_DEFAULT_CODE, 'hydra') },
  { id: 'pianoroll:hydra',    label: 'Piano Roll (Hydra)', renderer: 'hydra', requires: ['audio'], factory: () => makeHydraRenderer(HYDRA_PIANOROLL_CODE, 'pianoroll:hydra') },
  { id: 'scope:hydra',        label: 'Scope (Hydra)',      renderer: 'hydra', requires: ['audio'], factory: () => makeHydraRenderer(HYDRA_SCOPE_CODE, 'scope:hydra') },
  { id: 'kaleidoscope:hydra', label: 'Kaleidoscope',       renderer: 'hydra', requires: ['audio'], factory: () => makeHydraRenderer(HYDRA_KALEID_CODE, 'kaleidoscope:hydra') },
]
