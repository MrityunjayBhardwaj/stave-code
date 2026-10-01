/**
 * codeView — the one entry to the code↔view area (#1878, part of #1869).
 *
 * Everything that turns code into something a view draws, or a gesture back
 * into code, lives in this directory. This file is its only door: code outside
 * `codeView/` imports from here and from nowhere deeper.
 *
 * It starts as exactly the names the rest of the editor already used, so adding
 * it changes no behaviour. A name is added here when a view needs it; a view
 * never reaches past this file to get it.
 */

// ── read ── the finished models a view draws, and the facts read off the code
export {
  detectAllChunks,
  detectChunk,
  parseTopLevel,
  docParses,
  isChunkFresh,
  classifyChunk,
  collectChain,
  toArg,
} from './chunkDetect'
export type { ChunkInfo, ChainCall, ChainArg, ChunkType } from './chunkDetect'
export {
  merge,
  transpose,
  timestretch,
  filter,
  scaleGain,
  IR,
  toStrudel,
  patternToJSON,
  patternFromJSON,
  PATTERN_IR_SCHEMA_VERSION,
  structuralWalk,
  aggregateLaneItems,
  wholeWalkWindow,
  rootStackArms,
  armSourceSpan,
  analyzeSong,
  analyzeEvents,
  accumulateLanes,
  cycleFingerprints,
  detectPeriod,
  computeSections,
  laneKeyOf,
  analyzeWindow,
  accumulateLanesInWindow,
  computeSectionsInWindow,
  songExtent,
  signalDimensionsOf,
  parseMini,
  parseStrudel,
  classifyLiteralRhs,
  signalAutomations,
  signalCarryingParamKeys,
  signalTimeAt,
  shapeAlternatives,
  crossClassShapes,
  steppedAutomations,
  stepIndexAtCycle,
  stepValueEdit,
  fixedParameters,
  fixedToStepsEdit,
  stepCountEdit,
  previewRepeat,
  songPeriodOf,
  arrangedRepeatCycles,
  previewShapeSwap,
  parseStrudelStages,
  runPasses,
} from './ir'
export type {
  PlayParams,
  LaneSkeleton,
  LaneItem,
  WalkWindow,
  SongAnalysis,
  DisplaySpan,
  LaneActivity,
  SongSection,
  AnalyzeSongOptions,
  WindowAnalysis,
  AnalyzeWindowOptions,
  SignalDimensions,
  SongExtent,
  SignalAutomation,
  SignalKind,
  SignalSpans,
  UnboundedSignalKind,
  SteppedAutomation,
  SteppedStep,
  SectionWindow,
  TimeStep,
  TimeWarp,
  FixedParameter,
  StepCountEdit,
  LanePeriod,
  ShapeSwap,
  NamedStage,
  Pass,
} from './ir'
export type { IREvent, SourceLocation } from './ir/IREvent'
export type { IRPattern } from './ir/IRPattern'
export type { PatternIR } from './ir/PatternIR'
export { splitMuteMarker } from './ir/trackId'
export { resizeGrid, resizeRoll } from './notation'
export type { StepLane, ResizeMode } from './notation'
export { addLane, removeLane } from './notation/lane'
export {
  columnCount,
  columnOverlap,
  headColumn,
  rollContentRange,
  sequentialColumnGroups,
  tailColumn,
  isCellOn,
  laneCoverage,
} from './notation/model'
export type {
  StepGridModel,
  PianoRollModel,
  RollNote,
  ParseResult,
  ColumnOverlap,
  ChunkGain,
  GainWrite,
  AltSource,
  NotationSource,
} from './notation/model'
export { parseStepGrid, parsePianoRoll, applyRollGain, applyStepGain } from './notation/parse'
export { pitchToMidi, midiToPitch, isBlackKey, noteDisplayName, cLabel } from './notation/pitch'
export {
  rollSlotState,
  quantizePianoRollTo,
  freeZoneScale,
  collapsePianoRollToDocument,
  RESOLUTION_PRESETS,
  stepSlotState,
  stepResolutionEffect,
  quantizeStepGridTo,
  collapseStepGridToDocument,
} from './notation/resolution'
export type { GridResolutionEffect, SlotState } from './notation/resolution'
export { UNREFINED, documentSteps, absorbViewScale } from './notation/viewResolution'
export type { ViewScale } from './notation/viewResolution'

// ── ops ── model → model (or code → edits); offered exactly when the writer can write the result
export {
  detectArrangeAt,
  detectAllArrangeCalls,
  detectBarePattern,
  setWeight,
  reorderArm,
  insertArm,
  insertSilenceArm,
  renameSection as renameArrangeSection,
  countSectionArms as countArrangeSectionArms,
  removeArm,
  silenceArm,
  wrapBare,
  materializeBareDelete,
  materializeBareSplit,
  splitArm,
  setArmPattern,
  listSectionParts as listArrangeSectionParts,
} from './arrange'
export type { ArrangeCall, ArrangeArmRange, ArrangeMode } from './arrange'
export { appendEmptyBars, duplicateBar } from './notation/lengthen'
export type { LengthenResult } from './notation/lengthen'
export { drawnLayout, drawnAt, lcmOf } from './notation/perBar'
export {
  placeNote,
  moveNote,
  pasteNote,
  removeNote,
  resizableNotes,
  resizeNote,
  viewPlacesNotes,
  canResizeCell,
  canToggleCell,
  resizeCell,
  toggleCell,
} from './notation/place'
export {
  serializeStepGrid,
  serializePianoRoll,
  serializeRollGain,
  serializeStepGain,
} from './notation/serialize'
export {
  detectPickControlAt,
  detectAllPickControls,
  setWeight as pickSetWeight,
  splitArm as pickSplitArm,
  removeArm as pickRemoveArm,
  silenceArm as pickSilenceArm,
  reorderArm as pickReorderArm,
  insertArm as pickInsertArm,
  insertSilenceArm as pickInsertSilenceArm,
  duplicateArm as pickDuplicateArm,
  renameSection as pickRenameSection,
  countSectionArms as pickCountSectionArms,
  setArmHead as pickSetArmHead,
  listSectionParts as pickListSectionParts,
} from './pickControl'
export type { PickControl, PickControlArm, PickMethod, PickSectionEntry } from './pickControl'

// ── commit ── an op's edits, through the one writer
export { Writeback, formatNumber, normalizeEdits, applyEdits } from './writeback'
export type { WriteSource, OffsetEdit } from './writeback'
