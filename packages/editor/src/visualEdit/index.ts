/**
 * Visual-editing spine — public surface.
 *
 * The shared, durable layer the musician-facing write-back panels
 * (Mixer / Sequencer / Piano Roll / Arrangement) sit on:
 *  - `chunkDetect` — cursor → editable pieces of the statement (pure).
 *  - `writeback` — surgical, origin-tagged, single-undo Monaco edits.
 *  - `notation` — mini-notation ↔ grid/roll models (round-trip-faithful).
 *
 * Panels live in `@stave/app` (alongside MusicalTimeline) and import from
 * here via `@stave/editor`.
 */
export {
  detectChunk,
  detectAllChunks,
  parseTopLevel,
  docParses,
  isChunkFresh,
  classifyChunk,
} from './chunkDetect'
export type { ChunkInfo, ChainCall, ChainArg, ChunkType } from './chunkDetect'

export { Writeback, formatNumber, normalizeEdits, applyEdits } from './writeback'
export type { WriteSource, OffsetEdit } from './writeback'

export {
  detectArrangeAt,
  detectAllArrangeCalls,
  setWeight,
  reorderArm,
  insertArm,
  removeArm,
  wrapBare,
} from './arrange'
export type { ArrangeCall, ArrangeArmRange, ArrangeMode } from './arrange'

export {
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
} from './notation'
export type {
  StepGridModel,
  StepLane,
  PianoRollModel,
  RollNote,
  ParseResult,
  ResizeMode,
} from './notation'

export { VisualEditStandby } from './panels/VisualEditStandby'
export type { VisualEditStandbyProps } from './panels/VisualEditStandby'
export { Mixer } from './panels/Mixer'
export { SequencerGrid } from './panels/SequencerGrid'
export { PianoRollGrid } from './panels/PianoRollGrid'
export { PatternPanel } from './panels/PatternPanel'
export { patternKind, isStepChunk, isRollChunk } from './panels/patternKind'
export type { PatternKind } from './panels/patternKind'
export { useActiveChunk } from './panels/useActiveChunk'
export type { ActiveChunk } from './panels/useActiveChunk'
export { useGridModel } from './panels/useGridModel'
export type { GridModel, GridModelOptions } from './panels/useGridModel'
export { Knob } from './panels/Knob'
export type { KnobProps } from './panels/Knob'
export { knobRangeFor } from './panels/knobRanges'
export type { KnobRange } from './panels/knobRanges'
export {
  VISUAL_EDIT_TABS,
  PATTERN_TAB_ID,
  SEQUENCER_TAB_ID,
  MIXER_TAB_ID,
  PIANO_ROLL_TAB_ID,
} from './panels/tabs'
export type { VisualEditTabDef } from './panels/tabs'
