import type { VizDescriptor } from './types'
import { P5VizRenderer } from './renderers/P5VizRenderer'
import { HydraVizRenderer } from './renderers/HydraVizRenderer'
import { hydraPianoroll, hydraScope, hydraKaleidoscope } from './renderers/hydraPresets'
import { compileP5Code } from './p5Compiler'
import {
  PIANOROLL_P5_CODE,
  WORDFALL_P5_CODE,
  SCOPE_P5_CODE,
  FSCOPE_P5_CODE,
  SPECTRUM_P5_CODE,
  SPIRAL_P5_CODE,
  PITCHWHEEL_P5_CODE,
} from './builtinP5Code'

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
  { id: 'pianoroll',  label: 'Piano Roll',  renderer: 'p5', requires: ['streaming'], nativeSize: { w: 1200, h: 200 }, factory: () => new P5VizRenderer(compileP5Code(PIANOROLL_P5_CODE, 'pianoroll')) },
  { id: 'wordfall',   label: 'Wordfall',    renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(compileP5Code(WORDFALL_P5_CODE, 'wordfall')) },
  { id: 'scope',      label: 'Scope',       renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(compileP5Code(SCOPE_P5_CODE, 'scope')) },
  { id: 'fscope',     label: 'FScope',      renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(compileP5Code(FSCOPE_P5_CODE, 'fscope')) },
  { id: 'spectrum',   label: 'Spectrum',    renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(compileP5Code(SPECTRUM_P5_CODE, 'spectrum')) },
  { id: 'spiral',     label: 'Spiral',      renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(compileP5Code(SPIRAL_P5_CODE, 'spiral')) },
  { id: 'pitchwheel', label: 'Pitchwheel',  renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(compileP5Code(PITCHWHEEL_P5_CODE, 'pitchwheel')) },

  // Hydra renderers (WebGL shader-based)
  { id: 'hydra',              label: 'Hydra',              renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer() },
  { id: 'pianoroll:hydra',    label: 'Piano Roll (Hydra)', renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer(hydraPianoroll) },
  { id: 'scope:hydra',        label: 'Scope (Hydra)',      renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer(hydraScope) },
  { id: 'kaleidoscope:hydra', label: 'Kaleidoscope',       renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer(hydraKaleidoscope) },
]
