// IR types — the universal music representation
export type { IREvent, SourceLocation } from './IREvent'
export type { IRPattern } from './IRPattern'

// Transforms — pure functions on IR events/patterns
export { merge, transpose, timestretch, filter, scaleGain } from './transforms'

// PatternIR — free monad over musical effects
export type { PatternIR, PlayParams } from './PatternIR'
export { IR } from './PatternIR'

// Serializer
export { toStrudel } from './toStrudel'

// Structural walk (#945/#974) — lane anchors from source structure alone, no onsets. The
// "keep" half of the collect split: the timeline joins queryArc haps to these lanes by
// source-span containment, and the walk survives mid-edit code where evaluate() throws.
export { structuralWalk, aggregateLaneItems, walkLeafItems } from './structuralWalk'
export type { LaneSkeleton, LaneItem } from './structuralWalk'
// Node identity — content-addressed irNodeIds for IR nodes (a structural
// property, not a behavioural one). `buildNodeLocIndex` is the eval-path
// loc→irNodeId lookup the engine feeds to `normalizeStrudelHap`, replacing the
// collect-derived one (#975/#982).
export { buildNodeLocIndex, fnv1a, assignNodeId } from './nodeIdentity'

// Full-song analysis (#385) — progressive-horizon period/section/lane analysis
export {
  analyzeSong,
  analyzeEvents,
  accumulateLanes,
  cycleFingerprints,
  detectPeriod,
  computeSections,
  laneKeyOf,
} from './songAnalysis'
export type {
  SongAnalysis,
  LaneActivity,
  SongSection,
  AnalyzeSongOptions,
} from './songAnalysis'

// Event identity (#1102) — exported so the NEXT consumer asking "are these two
// events the same sound" finds the one answer instead of curating its own field
// list, which is exactly how the period bug got in.
export { eventValueKey } from './eventValueKey'

// Serialization
export { patternToJSON, patternFromJSON, PATTERN_IR_SCHEMA_VERSION } from './serialize'

// Parsers
export { parseMini } from './parseMini'
export { parseStrudel, classifyLiteralRhs } from './parseStrudel'

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
