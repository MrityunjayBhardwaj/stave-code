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
export {
  registerNamedViz,
  unregisterNamedViz,
  getNamedViz,
  listNamedVizNames,
  listNamedVizEntries,
  onNamedVizChanged,
} from './visualizers/namedVizRegistry'
export type { VizConfig } from './visualizers/vizConfig'
export { DEFAULT_VIZ_CONFIG, createVizConfig, getVizConfig, setVizConfig } from './visualizers/vizConfig'

// Visualizers — components
export { VizPanel } from './visualizers/VizPanel'
export { VizPicker } from './visualizers/VizPicker'
export { VizDropdown } from './visualizers/VizDropdown'
export { VizEditor } from './visualizers/VizEditor'
export type { VizEditorProps } from './visualizers/VizEditor'

// Visualizers — preset system
export type { VizPreset, CropRegion } from './visualizers/vizPreset'
export {
  VizPresetStore,
  BUNDLED_PREFIX,
  sanitizePresetName,
  bundledPresetId,
  isBundledPresetId,
  generateUniquePresetId,
} from './visualizers/vizPreset'
export { compilePreset } from './visualizers/vizCompiler'
export { mountVizRenderer } from './visualizers/mountVizRenderer'

// Visualizers — editor internals (advanced use)
export { SplitPane } from './visualizers/editor/SplitPane'
// EditorGroup deleted in Phase 10.2 Task 09 — replaced by WorkspaceShell.
// VizTab, PreviewMode, EditorGroupState removed — replaced by WorkspaceTab / WorkspaceGroupState.

// Visualizers — individual sketches (for advanced use: manual P5VizRenderer wrapping)
export { PianorollSketch } from './visualizers/sketches/PianorollSketch'
export { ScopeSketch } from './visualizers/sketches/ScopeSketch'
export { SpectrumSketch } from './visualizers/sketches/SpectrumSketch'
export { SpiralSketch } from './visualizers/sketches/SpiralSketch'
export { PitchwheelSketch } from './visualizers/sketches/PitchwheelSketch'

// ---------------------------------------------------------------------------
// Phase 10.2 — Workspace primitives (Tasks 01–08)
// ---------------------------------------------------------------------------

// WorkspaceShell + views
export { WorkspaceShell } from './workspace/WorkspaceShell'
export type { WorkspaceShellHandle } from './workspace/WorkspaceShell'
export { EditorView } from './workspace/EditorView'
export { ErrorBoundary } from './workspace/ErrorBoundary'
export type { ErrorBoundaryProps } from './workspace/ErrorBoundary'
export { PreviewView } from './workspace/PreviewView'

// WorkspaceFile store + hook
export type { WorkspaceFile, WorkspaceLanguage } from './workspace/types'
export {
  createWorkspaceFile,
  seedWorkspaceFile,
  getFile,
  setContent,
  subscribe as subscribeToWorkspaceFile,
  resetFileStore,
  listWorkspaceFiles,
  subscribeToFileList,
  deleteWorkspaceFile,
  renameWorkspaceFile,
  getFolderOrder,
  setFolderOrder,
  subscribeToFolderOrder,
  getSubfolderOrder,
  setSubfolderOrder,
  getChildOrder,
  setChildOrder,
  getZoneCropOverride,
  setZoneCropOverride,
  getZoneHeightOverride,
  setZoneHeightOverride,
  pruneZoneOverrides,
  subscribeToZoneOverrides,
} from './workspace/WorkspaceFile'
export { initProjectDoc, initProjectDocSync, switchProject, getActiveProjectId, isDocReady, subscribeToDocUpdate } from './workspace/projectDoc'
export {
  undo,
  redo,
  canUndo,
  canRedo,
  subscribeToUndoState,
  resetUndoManager,
  withStructBatch,
} from './workspace/undoManager'
export {
  revealLineInFile,
  getEditorFontSize,
  getEditorMinimap,
  setEditorFontSize,
  bumpEditorFontSize,
  toggleEditorMinimap,
  getEditorUiIconSize,
  setEditorUiIconSize,
  onUiIconSizeChange,
  applyPersistedUiIconSize,
  UI_ICON_SIZE_VAR,
  getInlineVizActionSize,
  setInlineVizActionSize,
  onInlineVizActionSizeChange,
  applyPersistedInlineVizActionSize,
  INLINE_VIZ_ACTION_SIZE_VAR,
  getEditorBackdropBlur,
  setEditorBackdropBlur,
  applyPersistedBackdropBlur,
  BACKDROP_BLUR_VAR,
  getBackdropQuality,
  setBackdropQuality,
  onBackdropQualityChange,
  backdropQualityFactor,
  type BackdropQuality,
  getBackdropOpacity,
  setBackdropOpacity,
  onBackdropOpacityChange,
  getEditorTheme,
  getResolvedTheme,
  setEditorTheme,
  cycleEditorTheme,
  onThemeChange,
  applyPersistedTheme,
} from './workspace/editorRegistry'
export type { EditorTheme, ResolvedTheme } from './workspace/editorRegistry'
export {
  saveSnapshot,
  listSnapshots,
  deleteSnapshot,
  restoreSnapshot,
  AUTO_SNAPSHOT_PREFIX,
} from './workspace/snapshotStore'
export type { SnapshotMeta } from './workspace/snapshotStore'
export {
  listProjects,
  getProject,
  getLastOpenedProject,
  createProject,
  touchProject,
  renameProject,
  deleteProject,
  duplicateProject,
  setProjectBackgroundFileId,
  setProjectBackgroundCrop,
  type ProjectMeta,
} from './workspace/projectRegistry'

// Sample sound (test audio source for viz development)
export {
  startSampleSound,
  stopSampleSound,
  isSampleSoundPlaying,
  SAMPLE_SOUND_SOURCE_ID,
  SAMPLE_SOUND_LABEL,
} from './workspace/sampleSound'
export { useWorkspaceFile } from './workspace/useWorkspaceFile'
export type { UseWorkspaceFileResult } from './workspace/useWorkspaceFile'

// Audio bus
export { workspaceAudioBus } from './workspace/WorkspaceAudioBus'
export type { AudioSourceRef, AudioPayload, WorkspaceAudioBus } from './workspace/types'

// Runtime provider registry + built-ins
export { LiveCodingRuntime } from './workspace/runtime/LiveCodingRuntime'
export type {
  LiveCodingRuntime as LiveCodingRuntimeInterface,
  LiveCodingRuntimeProvider,
  ChromeContext,
} from './workspace/types'
export {
  liveCodingRuntimeRegistry,
  registerRuntimeProvider,
  getRuntimeProviderForExtension,
  getRuntimeProviderForLanguage,
  STRUDEL_RUNTIME,
  SONICPI_RUNTIME,
} from './workspace/runtime'

// Preview provider registry + built-ins
export type { PreviewProvider, PreviewContext } from './workspace/PreviewProvider'
export {
  previewProviderRegistry,
  registerPreviewProvider,
  getPreviewProviderForExtension,
  getPreviewProviderForLanguage,
  HYDRA_VIZ,
  P5_VIZ,
  seedFromPreset,
  seedFromPresetId,
  flushToPreset,
  getPresetIdForFile,
  registerPresetAsNamedViz,
  workspaceFileIdForPreset,
} from './workspace/preview'

// Shell types
export type {
  WorkspaceTab,
  WorkspaceGroupState,
  WorkspaceShellProps,
  ChromeForTab,
} from './workspace/types'

// Engine log + friendly-error plumbing
export type {
  LogLevel,
  RuntimeId,
  LogSuggestion,
  LogEntry,
  FixedMarker,
} from './engine/engineLog'
export {
  emitLog,
  subscribeLog,
  getLogHistory,
  clearLog,
  emitFixed,
  subscribeFixed,
  getFixedMarkers,
  makeFixedKey,
} from './engine/engineLog'
export { installEngineLogMarkers } from './workspace/engineLogMarkers'
export { installGlobalErrorCatch } from './engine/globalErrorCatch'

// IR Inspector — observation-only snapshot store for the Transform
// Graph debugger surface (v0). Single latest snapshot, not a history.
export type { IRSnapshot } from './engine/irInspector'
export {
  publishIRSnapshot,
  clearIRSnapshot,
  getIRSnapshot,
  subscribeIRSnapshot,
} from './engine/irInspector'
export type {
  FriendlyErrorParts,
  FuzzyMatch,
  FormatOptions,
} from './engine/friendlyErrors'
export {
  levenshtein,
  fuzzyMatch,
  extractReferenceIdentifier,
  formatFriendlyError,
  parseStackLocation,
} from './engine/friendlyErrors'

// DocsIndex exports so the app can pass runtime indexes into the friendly
// error formatter without reaching through internal paths.
export type { DocsIndex, RuntimeDoc, DocKind } from './monaco/docs/types'
export { P5_DOCS_INDEX } from './monaco/docs/p5'
export { HYDRA_DOCS_INDEX } from './monaco/docs/hydra'
export { SONICPI_DOCS_INDEX } from './monaco/docs/sonicpi'
export { STRUDEL_DOCS_INDEX } from './monaco/strudelDocs'
