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

export { Writeback, formatNumber, normalizeEdits } from './writeback'
export type { WriteSource, OffsetEdit } from './writeback'
