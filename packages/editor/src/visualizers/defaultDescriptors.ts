import type { VizDescriptor } from './types'
import { P5VizRenderer } from './renderers/P5VizRenderer'
import { HydraVizRenderer } from './renderers/HydraVizRenderer'
import { hydraPianoroll, hydraScope, hydraKaleidoscope } from './renderers/hydraPresets'
import { PianorollSketch } from './sketches/PianorollSketch'
import { WordfallSketch } from './sketches/WordfallSketch'
import { ScopeSketch } from './sketches/ScopeSketch'
import { FscopeSketch } from './sketches/FscopeSketch'
import { SpectrumSketch } from './sketches/SpectrumSketch'
import { SpiralSketch } from './sketches/SpiralSketch'
import { PitchwheelSketch } from './sketches/PitchwheelSketch'

/**
 * All built-in visualization modes.
 *
 * IDs follow the "mode:renderer" convention when multiple renderers offer
 * the same concept. Bare "mode" is the default renderer for that concept.
 *
 * Each factory creates a NEW renderer instance per mount —
 * never share a single instance across multiple mounts.
 *
 * Consumers extend via spread:
 *   vizDescriptors={[...DEFAULT_VIZ_DESCRIPTORS, myCustomDescriptor]}
 */
export const DEFAULT_VIZ_DESCRIPTORS: VizDescriptor[] = [
  // p5 renderers (default for each mode)
  { id: 'pianoroll',  label: 'Piano Roll',  renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(PianorollSketch) },
  { id: 'wordfall',   label: 'Wordfall',    renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(WordfallSketch) },
  { id: 'scope',      label: 'Scope',       renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(ScopeSketch) },
  { id: 'fscope',     label: 'FScope',      renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(FscopeSketch) },
  { id: 'spectrum',   label: 'Spectrum',    renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(SpectrumSketch) },
  { id: 'spiral',     label: 'Spiral',      renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(SpiralSketch) },
  { id: 'pitchwheel', label: 'Pitchwheel',  renderer: 'p5', requires: ['streaming'], factory: () => new P5VizRenderer(PitchwheelSketch) },

  // Hydra renderers (WebGL shader-based)
  { id: 'hydra',              label: 'Hydra',              renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer() },
  { id: 'pianoroll:hydra',    label: 'Piano Roll (Hydra)', renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer(hydraPianoroll) },
  { id: 'scope:hydra',        label: 'Scope (Hydra)',      renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer(hydraScope) },
  { id: 'kaleidoscope:hydra', label: 'Kaleidoscope',       renderer: 'hydra', requires: ['audio'], factory: () => new HydraVizRenderer(hydraKaleidoscope) },
]
