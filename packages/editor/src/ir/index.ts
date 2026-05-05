// IR types — the universal music representation
export type { IREvent, SourceLocation } from './IREvent'
export type { IRPattern } from './IRPattern'

// Transforms — pure functions on IR events/patterns
export { merge, transpose, timestretch, filter, scaleGain } from './transforms'

// PatternIR — free monad over musical effects
export type { PatternIR, PlayParams } from './PatternIR'
export { IR } from './PatternIR'

// Interpreters
export { collect } from './collect'
export type { CollectContext } from './collect'
export { toStrudel } from './toStrudel'

// Serialization
export { patternToJSON, patternFromJSON, PATTERN_IR_SCHEMA_VERSION } from './serialize'

// Parsers
export { parseMini } from './parseMini'
export { parseStrudel } from './parseStrudel'

// Phase 19-07 (#79) — staged parser pipeline. Each stage helper runs
// PatternIR → PatternIR; STRUDEL_PASSES wires them as named passes so
// the IR Inspector renders one tab per stage. End-to-end FINAL output
// is byte-identical to parseStrudel(code).
export {
  runRawStage,
  runMiniExpandedStage,
  runChainAppliedStage,
  runFinalStage,
} from './parseStrudelStages'

// Pass runner — runtime-neutral IR→IR transform machinery
export type { Pass } from './passes'
export { runPasses } from './passes'

// Propagation engine
export { propagate, StrudelParseSystem, IREventCollectSystem } from './propagation'
export type { ComponentBag, System } from './propagation'
