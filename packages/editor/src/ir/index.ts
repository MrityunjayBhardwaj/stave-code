// IR types — the universal music representation
export type { IREvent, SourceLocation } from './IREvent'
export type { IRPattern } from './IRPattern'

// Transforms — pure functions on IR events/patterns
export { merge, transpose, timestretch, filter, scaleGain } from './transforms'
