// Pattern IR — universal music representation
export type { IREvent, SourceLocation, IRPattern } from './ir'
export { merge, transpose, timestretch, filter, scaleGain } from './ir'
export type { PatternIR, PlayParams, CollectContext, ComponentBag, System } from './ir'
export { IR, collect, collectCycles, toStrudel, patternToJSON, patternFromJSON, PATTERN_IR_SCHEMA_VERSION } from './ir'
// Full-song analysis (#385)
export { analyzeSong, analyzeEvents, accumulateLanes, cycleFingerprints, detectPeriod, computeSections, laneKeyOf } from './ir'
export type { SongAnalysis, LaneActivity, SongSection, AnalyzeSongOptions } from './ir'
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
// Phase B / B-3 (#245) — OffscreenCanvas-worker p5 renderer + the DI seam the app
// uses to register its Next-bundled worker constructor.
export { WorkerVizRenderer } from './visualizers/renderers/WorkerVizRenderer'
export { setVizWorkerFactory, getVizWorkerFactory } from './visualizers/vizWorkerFactory'
export type { VizWorkerFactory } from './visualizers/vizWorkerFactory'
// #327 — the single source of truth for the `stave.viz.*` localStorage flags. The app
// (`registerVizWorker`) reads the worker/maxFps/maxDpr overrides through these.
export {
  VIZ_FLAG_KEYS,
  isP5DirectCanvasEnabled,
  isVizGovernorEnabled,
  isVizPumpSharedCacheEnabled,
  isVizWorkerPoolEnabled,
  getVizWorkerOverride,
  getVizMaxFpsOverride,
  getVizMaxDprOverride,
} from './visualizers/vizFlags'
export type { HydraPatternFn } from './visualizers/renderers/HydraVizRenderer'
export { hydraPianoroll, hydraScope, hydraKaleidoscope } from './visualizers/renderers/hydraPresets'
export { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'
export { resolveDescriptor } from './visualizers/resolveDescriptor'
// Stave-injected globals catalogue (#309) — the "Stave Inputs" reference block
// + hover doc/live source, single source of truth for the viz-editor surfaces.
export {
  injectedGlobals,
  formatStaveInputs,
  injectedGlobalByToken,
} from './visualizers/injectedGlobals'
export type {
  InjectedGlobal,
  LiveSpec,
  MasterScalar,
  MasterArray,
} from './visualizers/injectedGlobals'
export {
  registerNamedViz,
  unregisterNamedViz,
  getNamedViz,
  listNamedVizNames,
  listNamedVizEntries,
  onNamedVizChanged,
} from './visualizers/namedVizRegistry'
export type { VizConfig, VizQualityLevel, VizQualitySettings, WorkerVizConfig } from './visualizers/vizConfig'
export { DEFAULT_VIZ_CONFIG, DEFAULT_VIZ_QUALITY, createVizConfig, getVizConfig, setVizConfig, updateVizConfig, deriveVizQuality } from './visualizers/vizConfig'
// Phase B — worker-viz capability detection / transport degrade scaffold (B-1 #239)
export { detectWorkerVizCapabilities } from './visualizers/worker/capabilities'
export type { VizTransport, WorkerVizCapabilities, CapabilityEnv } from './visualizers/worker/capabilities'
// Phase B — signal-transport substrate (B-2 #242): main sampler, worker feed, transport
export { MainSignalSampler } from './visualizers/worker/signalSampler'
export type { SamplerInputs } from './visualizers/worker/signalSampler'
export { WorkerBusFeed } from './visualizers/worker/workerBusFeed'
export {
  createPostMessageWriter,
  createPostMessageReader,
} from './visualizers/worker/signalTransport'
export type {
  SignalTransportWriter,
  SignalTransportReader,
  FrameChannel,
} from './visualizers/worker/signalTransport'
export { MASTER_KEY, emptyFrame, frameTransferables } from './visualizers/worker/signalFrame'
export type {
  SignalFrame,
  AnalyserBytes,
  ActiveEventSummary,
  BumpSummary,
} from './visualizers/worker/signalFrame'

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
// #240 — viz pop-out: the hook drives a window.open() preview; the app host
// wires it through `WorkspaceShellProps.onOpenPopoutPreview` (Cmd+K W).
export { usePopoutPreview } from './visualizers/editor/PopoutPreview'

// Named signal bus — renderer-agnostic per-sound / per-track musical signals
// (Phase 21). PURE module (no p5/hydra import — P12); renderers wrap its shape
// (p5 getter-numbers, hydra thunks). Consumed by P5/Hydra renderers (T2/T3).
export { SignalBus } from './visualizers/signals/SignalBus'
export type {
  BusHapEvent,
  SignalReading,
  AudioReading,
  BusAnalyser,
} from './visualizers/signals/SignalBus'
export {
  ALIAS_MAP,
  BUILTIN_ALIASES,
  DEFAULT_VIZ_ENGINE,
  resolveAliasesForEngine,
} from './visualizers/signals/aliasMap'
export type {
  VizEngine,
  EngineAliasValue,
  EngineAliasMap,
  StoredSignalAliases,
} from './visualizers/signals/aliasMap'

// Performance profiler (issue #228) — zero-cost-when-disabled runtime profiler.
// Renderers/engine call `perf.*`; the overlay + automation read `perf.snapshot()`.
export { perf } from './perf/profiler'
export type {
  PerfSnapshot,
  SectionStats,
  FrameStats,
} from './perf/profiler'

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
  // Signal-bus example sketches (Phase 21) — living docs for the named bus.
  SIGNALS_SPECTRUM_P5_CODE,
  SIGNALS_BACKDROP_P5_CODE,
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
  revealOffsetInFile,
  applyOffsetEditsToFile,
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
  getInlineVizResolution,
  setInlineVizResolution,
  onInlineVizResolutionChange,
  getVizQuality,
  setVizQuality,
  onVizQualityChange,
  applyPersistedVizQuality,
  getInlineVizTeardownEnabled,
  setInlineVizTeardownEnabled,
  onInlineVizTeardownChange,
  getInlineVizTeardownMs,
  getVizInputsLiveValuesEnabled,
  setVizInputsLiveValuesEnabled,
  onVizInputsLiveValuesChange,
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
  getSignalAliases,
  getStoredSignalAliases,
  setSignalAliases,
  onSignalAliasesChange,
  getPerfEnabled,
  setPerfEnabled,
  togglePerfEnabled,
  onPerfEnabledChange,
  applyPersistedPerfEnabled,
  getAdaptivePerfEnabled,
  setAdaptivePerfEnabled,
  toggleAdaptivePerfEnabled,
  onAdaptivePerfChange,
  applyPersistedAdaptivePerf,
  getEditorTheme,
  getResolvedTheme,
  setEditorTheme,
  cycleEditorTheme,
  onThemeChange,
  applyPersistedTheme,
  registerReevalHandler,
  requestReeval,
  registerEvalSourceTransform,
  applyEvalSourceTransform,
  registerMasterGainHandler,
  applyMasterGain,
} from './workspace/editorRegistry'
export { getMasterGain, setMasterGain, useMasterGain } from './visualEdit/mixer/masterStore'
export type { EditorTheme, ResolvedTheme, SignalAliasMap } from './workspace/editorRegistry'
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
  enterRuntimeView,
  exitRuntimeView,
  getViewedContent,
  isViewing,
  getViewedCommit,
  getViewedFileIds,
  subscribeToRuntimeView,
} from './workspace/history/historyViewing'
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
  GLSL_VIZ,
  seedFromPreset,
  seedFromPresetId,
  flushToPreset,
  getPresetIdForFile,
  registerPresetAsNamedViz,
  workspaceFileIdForPreset,
} from './workspace/preview'
export {
  VIZ_LANGUAGES,
  isVizLanguage,
  rendererForLanguage,
  languageForRenderer,
} from './workspace/vizLanguages'
export type { VizRendererKind, VizLanguage } from './workspace/vizLanguages'

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

// Live transport-cycle accessor registry (#391) — the app registers its
// current-cycle accessor here so the bottom-panel grids can highlight the
// playing step.
export { setCurrentCycleAccessor, readCurrentCycle } from './workspace/currentCycle'

// Live instrument registry (#514 / PV141 #6) — the app registers a reader over
// superdough's soundMap; the Mixer's instrument picker enumerates it live. The
// Kit picker (#515) enumerates drum banks from the tidal-drum-machines manifest.
export {
  setSoundCatalogAccessor,
  notifySoundCatalogChanged,
  groupSoundCatalog,
  setDrumKitAccessor,
  notifyDrumKitChanged,
  groupDrumKits,
  banksFromDrumMachineManifest,
  type SoundMapDict,
  type DrumMachineManifest,
} from './workspace/soundRegistry'

// Visual-editing spine (#379) — chunk detection + tagged writeback + notation.
// The durable layer the musician-facing write-back panels sit on; panels live
// in @stave/app and import these via @stave/editor.
export {
  detectChunk,
  detectAllChunks,
  parseTopLevel,
  docParses,
  isChunkFresh,
  classifyChunk,
  Writeback,
  formatNumber,
  normalizeEdits,
  applyEdits,
  detectArrangeAt,
  detectAllArrangeCalls,
  detectBarePattern,
  setWeight,
  reorderArm,
  insertArm,
  removeArm,
  silenceArm,
  wrapBare,
  materializeBareDelete,
  materializeBareSplit,
  splitArm,
  detectPickControlAt,
  detectAllPickControls,
  pickSetWeight,
  pickSplitArm,
  pickRemoveArm,
  pickReorderArm,
  pickInsertArm,
  pickDuplicateArm,
  parseStepGrid,
  parsePianoRoll,
  serializeStepGrid,
  serializePianoRoll,
  pitchToMidi,
  midiToPitch,
  isBlackKey,
  placeNote,
  resizeGrid,
  resizeRoll,
  VisualEditStandby,
  Mixer,
  SequencerGrid,
  PianoRollGrid,
  PatternPanel,
  patternKind,
  isStepChunk,
  isRollChunk,
  Knob,
  knobRangeFor,
  VISUAL_EDIT_TABS,
  PATTERN_TAB_ID,
  MIXER_CONSOLE_TAB_ID,
  SEQUENCER_TAB_ID,
  MIXER_TAB_ID,
  PIANO_ROLL_TAB_ID,
} from './visualEdit'
// Locate a runtime error (e.g. soundfont out-of-range, #567) back to the owning
// track's line by its instrument — the app's onError uses this when the error's
// stack is bundle-only.
export { statementOffsetForSource } from './visualEdit/mixer/stripModel'
// Track rename (#580, Phase C) — the pure label-rewrite primitive + its
// validator, so the app's Song Timeline can rename a lane (the Mixer uses them
// internally). `StripEdit` is the surgical {range,text} the caller applies.
export { renameEdit, isValidTrackLabel, type StripEdit } from './visualEdit/mixer/writeStrip'
export type {
  ChunkInfo,
  ChainCall,
  ChainArg,
  ChunkType,
  WriteSource,
  OffsetEdit,
  ArrangeCall,
  ArrangeArmRange,
  ArrangeMode,
  PickControl,
  PickControlArm,
  PickMethod,
  StepGridModel,
  StepLane,
  PianoRollModel,
  RollNote,
  ParseResult,
  ResizeMode,
  VisualEditStandbyProps,
  VisualEditTabDef,
  PatternKind,
} from './visualEdit'
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
