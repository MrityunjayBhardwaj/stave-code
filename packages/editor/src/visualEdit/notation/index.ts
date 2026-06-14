/**
 * Notation — mini-notation ↔ grid/roll models for the write-back panels.
 * The round-trip-faithful core the Sequencer and Piano Roll sit on.
 */
export type {
  StepGridModel,
  StepLane,
  PianoRollModel,
  RollNote,
  ParseResult,
} from './model'
export { parseStepGrid, parsePianoRoll } from './parse'
export { serializeStepGrid, serializePianoRoll } from './serialize'
export { pitchToMidi, midiToPitch, isBlackKey } from './pitch'
export { placeNote } from './place'
export { resizeGrid, resizeRoll, type ResizeMode } from './resize'
