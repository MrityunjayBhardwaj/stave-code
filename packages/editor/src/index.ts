// Pattern IR — universal music representation
export type { IREvent, SourceLocation, IRPattern } from './ir'
export { merge, transpose, timestretch, filter, scaleGain } from './ir'
export type { PatternIR, PlayParams, CollectContext, ComponentBag, System } from './ir'
export { IR, collect, collectCycles, toStrudel, patternToJSON, patternFromJSON, PATTERN_IR_SCHEMA_VERSION } from './ir'
export { parseMini, parseStrudel, classifyLiteralRhs, propagate, StrudelParseSystem, IREventCollectSystem } from './ir'

// Phase 19-07 (#79) — parser stage helpers. PK10 propagation: re-exported
// from the top-level barrel so the app can `import { runRawStage, ... }
// from "@stave/editor"`. Phase 19-02 hit this exact bug — runPasses was
// added to the sub-barrel only and was missing from dist/index.cjs.
export { runRawStage, runMiniExpandedStage, runChainAppliedStage, runFinalStage } from './ir'

// Pass runner — runtime-neutral IR→IR transform machinery
export type { Pass } from './ir'
export { runPasses } from './ir'

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
// Phase 20-07 (PK13 step 9) — scheduler-level breakpoint registry.
export { BreakpointStore } from './engine/BreakpointStore'
export type { BreakpointMeta } from './engine/BreakpointStore'
// Phase 20-14 α-5 — tier flag schema (8 boolean flags). β-3 reads listTiers()
// + getTierFlags() to build the settings UI; β-4 reads getTierFlags() at
// engine init to gate `enableWebMidi()`.
export { getTierFlags, setTierFlag, listTiers } from './engine/tierFlags'
export type { TierFlags, TierName } from './engine/tierFlags'
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

// Bundled p5 viz source — single source of truth for the picker AND the
// `preset/viz/*.p5` workspace files. See `builtinP5Code.ts` for context.
export {
  PIANOROLL_P5_CODE,
  WORDFALL_P5_CODE,
  SCOPE_P5_CODE,
  FSCOPE_P5_CODE,
  SPECTRUM_P5_CODE,
  SPIRAL_P5_CODE,
  PITCHWHEEL_P5_CODE,
} from './visualizers/builtinP5Code'

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
  // Phase 20-12 α-2 — per-track UI metadata (color override + collapsed)
  getTrackMeta,
  setTrackMeta,
  subscribeToTrackMeta,
} from './workspace/WorkspaceFile'
export type { TrackMeta } from './workspace/WorkspaceFile'
// Phase 20-12 α-3 — React hook for trackMeta
export { useTrackMeta } from './workspace/useTrackMeta'
export type { UseTrackMetaResult } from './workspace/useTrackMeta'
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
  getMusicalTimelineSubRowHeight,
  setMusicalTimelineSubRowHeight,
  onMusicalTimelineSubRowHeightChange,
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
// Project commit store (file-history milestone, Phase F #196)
export {
  initHistory,
  resetHistoryState,
  commitWorkspace,
  restoreProject,
  restoreFileToCommit,
  revertFileToSeed,
  isFileModifiedSinceHead,
  getModifiedFileIdsSinceHead,
  createBranchAt,
  switchToBranch,
  getCurrentHistory,
  subscribeToHistory,
  setActiveHistoryFile,
  getActiveHistoryFile,
  setFileHistoryTarget,
  getFileHistoryTarget,
} from './workspace/history/historyService'
export { startHistoryDriver } from './workspace/history/historyDriver'
export { HistoryPanel } from './workspace/history/HistoryPanel'
export type { HistoryPanelProps, OpenHistoryTabRequest } from './workspace/history/HistoryPanel'
export {
  listCommits,
  listBranches,
  fileHistory,
  getFileContentAt,
  getCommit,
  getCurrentBranch,
  type Commit,
  type CommitKind,
  type BranchRef,
  type ProjectHistory,
} from './workspace/history/historyGraph'
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

// Phase 20-01 PR-A — bottom-drawer infrastructure.
// PK10 propagation: the registry + component + types must be exported
// from the top-level barrel so @stave/app and PR-B can import them.
// `__resetBottomPanelRegistryForTest` is intentionally NOT exported —
// test-internal; tests import from the module path directly. Verified
// by grep on packages/editor/dist/index.cjs.
export { BottomPanel } from './workspace/bottomPanel/BottomPanel'
export type { BottomPanelTab } from './workspace/bottomPanel/bottomPanelRegistry'
export {
  registerBottomPanelTab,
  unregisterBottomPanelTab,
  listBottomPanelTabs,
  getBottomPanelTab,
  subscribeToBottomPanelTabs,
} from './workspace/bottomPanel/bottomPanelRegistry'
export {
  BOTTOM_PANEL_HEIGHT_KEY,
  BOTTOM_PANEL_OPEN_KEY,
  BOTTOM_PANEL_ACTIVE_TAB_KEY,
  BOTTOM_PANEL_HEIGHT_MIN,
  BOTTOM_PANEL_HEIGHT_MAX,
  BOTTOM_PANEL_HEIGHT_DEFAULT,
  // Phase 20-01 PR-B (DB-08) — readers exposed so @stave/app's
  // MusicalTimeline can sample drawer-open + active-tab state via
  // localStorage on every rAF tick (rAF is gated downstream so the
  // O(1) reads are cheap). Mirrors the readers used by BottomPanel
  // internally; no new state coupling.
  readPersistedOpen,
  readPersistedActiveTabId,
} from './workspace/bottomPanel/persistence'

// Issue #175 — full workspace-shell state persistence (groups + tabs +
// pane layout + active group), per-project, via localStorage. The app
// hydrates on mount and the shell's `onGroupsChange` sink writes back
// on every mutation. Pure helpers (serialize/validate/hydrate/default)
// are exported alongside the storage helpers so the app can compose
// without round-tripping through localStorage in tests.
export {
  SHELL_STATE_KEY_PREFIX,
  SHELL_STATE_VERSION,
  shellStateKeyFor,
  loadShellState,
  saveShellState,
  clearShellState,
  validatePersistedState,
  serializeShellState,
  buildDefaultSnapshot,
  hydrateSnapshot,
} from './workspace/tabPersistence'
export type {
  PersistedShellState,
  PersistedGroup,
  PersistedEditorTab,
  ShellSnapshot,
} from './workspace/tabPersistence'

// Phase 19-08 — IR Inspector streaming timeline capture buffer.
// Fed by every publishIRSnapshot fan-out (PK9 step 8); consumed by the
// app-side IRInspectorTimeline strip (PR-B). __resetCaptureForTest is
// intentionally NOT exported — test-internal; tests import from the
// module path directly.
export type { TimelineCaptureEntry } from './engine/timelineCapture'
export {
  captureSnapshot,
  getCaptureBuffer,
  subscribeCapture,
  clearCapture,
  getCaptureCapacity,
  setCaptureCapacity,
} from './engine/timelineCapture'
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
  buildAliasSuffix,
} from './engine/friendlyErrors'

// Phase 20-14 β-1 — bare-name sound alias resolver. The app's friendly-
// error builder reads this on the miss path so it can distinguish "alias
// map: no entry" from "alias map: target not loaded."
export { resolveAlias, SOUND_ALIASES } from './engine/aliases'

// DocsIndex exports so the app can pass runtime indexes into the friendly
// error formatter without reaching through internal paths.
export type { DocsIndex, RuntimeDoc, DocKind } from './monaco/docs/types'
export { P5_DOCS_INDEX } from './monaco/docs/p5'
export { HYDRA_DOCS_INDEX } from './monaco/docs/hydra'
export { SONICPI_DOCS_INDEX } from './monaco/docs/sonicpi'
export { STRUDEL_DOCS_INDEX } from './monaco/strudelDocs'
