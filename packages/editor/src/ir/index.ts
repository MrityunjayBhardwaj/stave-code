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

// Propagation engine
export { propagate, StrudelParseSystem, IREventCollectSystem } from './propagation'
export type { ComponentBag, System } from './propagation'
