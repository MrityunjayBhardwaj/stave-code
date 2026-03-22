// Main component
export { StrudelEditor } from './StrudelEditor'
export type { StrudelEditorProps } from './StrudelEditor'

// Engine
export { StrudelEngine } from './engine/StrudelEngine'
export { HapStream } from './engine/HapStream'
export type { HapEvent } from './engine/HapStream'
export { WavEncoder } from './engine/WavEncoder'
export { OfflineRenderer } from './engine/OfflineRenderer'
export { LiveRecorder } from './engine/LiveRecorder'
export { noteToMidi } from './engine/noteToMidi'

// Theme
export type { StrudelTheme } from './theme/tokens'
export { DARK_THEME_TOKENS, LIGHT_THEME_TOKENS, applyTheme } from './theme/tokens'

// Visualizers — new VizRenderer interface family
export type { VizRenderer, VizRefs, VizRendererSource, VizDescriptor, PatternScheduler } from './visualizers/types'
export { P5VizRenderer } from './visualizers/renderers/P5VizRenderer'
export { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'

// Visualizers — components
export { VizPanel } from './visualizers/VizPanel'
export { VizPicker } from './visualizers/VizPicker'

// Visualizers — individual sketches (for advanced use: manual P5VizRenderer wrapping)
export { PianorollSketch } from './visualizers/sketches/PianorollSketch'
export { ScopeSketch } from './visualizers/sketches/ScopeSketch'
export { SpectrumSketch } from './visualizers/sketches/SpectrumSketch'
export { SpiralSketch } from './visualizers/sketches/SpiralSketch'
export { PitchwheelSketch } from './visualizers/sketches/PitchwheelSketch'
