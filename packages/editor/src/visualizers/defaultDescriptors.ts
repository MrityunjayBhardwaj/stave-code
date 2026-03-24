import type { VizDescriptor } from './types'
import { P5VizRenderer } from './renderers/P5VizRenderer'
import { PianorollSketch } from './sketches/PianorollSketch'
import { WordfallSketch } from './sketches/WordfallSketch'
import { ScopeSketch } from './sketches/ScopeSketch'
import { FscopeSketch } from './sketches/FscopeSketch'
import { SpectrumSketch } from './sketches/SpectrumSketch'
import { SpiralSketch } from './sketches/SpiralSketch'
import { PitchwheelSketch } from './sketches/PitchwheelSketch'

/**
 * All 7 built-in visualization modes wrapped in P5VizRenderer.
 * Each factory creates a NEW P5VizRenderer instance per mount —
 * never share a single instance across multiple mounts.
 *
 * Consumers extend via spread:
 *   vizDescriptors={[...DEFAULT_VIZ_DESCRIPTORS, myCustomDescriptor]}
 */
export const DEFAULT_VIZ_DESCRIPTORS: VizDescriptor[] = [
  { id: 'pianoroll',  label: 'Piano Roll', requires: ['streaming', 'queryable'], factory: () => new P5VizRenderer(PianorollSketch) },
  { id: 'wordfall',   label: 'Wordfall',   requires: ['streaming', 'queryable'], factory: () => new P5VizRenderer(WordfallSketch) },
  { id: 'scope',      label: 'Scope',      requires: ['audio'],                  factory: () => new P5VizRenderer(ScopeSketch) },
  { id: 'fscope',     label: 'FScope',     requires: ['audio'],                  factory: () => new P5VizRenderer(FscopeSketch) },
  { id: 'spectrum',   label: 'Spectrum',   requires: ['audio'],                  factory: () => new P5VizRenderer(SpectrumSketch) },
  { id: 'spiral',     label: 'Spiral',     requires: ['streaming'],              factory: () => new P5VizRenderer(SpiralSketch) },
  { id: 'pitchwheel', label: 'Pitchwheel', requires: ['streaming'],              factory: () => new P5VizRenderer(PitchwheelSketch) },
]
