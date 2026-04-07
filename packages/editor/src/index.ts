// Pattern IR — universal music representation
export type { IREvent, SourceLocation, IRPattern } from './ir'
export { merge, transpose, timestretch, filter, scaleGain } from './ir'
export type { PatternIR, PlayParams, CollectContext, ComponentBag, System } from './ir'
export { IR, collect, toStrudel, patternToJSON, patternFromJSON, PATTERN_IR_SCHEMA_VERSION } from './ir'
export { parseMini, parseStrudel, propagate, StrudelParseSystem, IREventCollectSystem } from './ir'

// Main components
export { StrudelEditor } from './StrudelEditor'
export type { StrudelEditorProps } from './StrudelEditor'
export { LiveCodingEditor } from './LiveCodingEditor'
export type { LiveCodingEditorProps } from './LiveCodingEditor'

// Engine
export { StrudelEngine } from './engine/StrudelEngine'
export { DemoEngine } from './engine/DemoEngine'
export { SonicPiEngine } from './engine/sonicpi'
export type { LiveCodingEngine, EngineComponents, IRComponent } from './engine/LiveCodingEngine'
export { HapStream } from './engine/HapStream'
export type { HapEvent } from './engine/HapStream'
export type { NormalizedHap } from './engine/NormalizedHap'
export { normalizeStrudelHap } from './engine/NormalizedHap'
export { BufferedScheduler } from './engine/BufferedScheduler'
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
export { HydraVizRenderer } from './visualizers/renderers/HydraVizRenderer'
export type { HydraPatternFn } from './visualizers/renderers/HydraVizRenderer'
export { hydraPianoroll, hydraScope, hydraKaleidoscope } from './visualizers/renderers/hydraPresets'
export { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'
export { resolveDescriptor } from './visualizers/resolveDescriptor'
export type { VizConfig } from './visualizers/vizConfig'
export { DEFAULT_VIZ_CONFIG, createVizConfig, getVizConfig, setVizConfig } from './visualizers/vizConfig'

// Visualizers — components
export { VizPanel } from './visualizers/VizPanel'
export { VizPicker } from './visualizers/VizPicker'

// Visualizers — individual sketches (for advanced use: manual P5VizRenderer wrapping)
export { PianorollSketch } from './visualizers/sketches/PianorollSketch'
export { ScopeSketch } from './visualizers/sketches/ScopeSketch'
export { SpectrumSketch } from './visualizers/sketches/SpectrumSketch'
export { SpiralSketch } from './visualizers/sketches/SpiralSketch'
export { PitchwheelSketch } from './visualizers/sketches/PitchwheelSketch'
