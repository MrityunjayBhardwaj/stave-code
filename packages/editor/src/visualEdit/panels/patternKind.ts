/**
 * patternKind — the single discriminator that decides which grid editor a
 * chunk belongs to. The chain head function is mutually exclusive: `s`/`sound`
 * make a drum/step pattern (Sequencer), `note`/`n` make a melodic pattern
 * (Piano Roll). A chunk is exactly one of these or neither — never both — so
 * the adaptive Pattern panel can pick one grid from this alone.
 *
 * One home so the Sequencer, Piano Roll, and the Pattern panel that switches
 * between them can't drift on what counts as drum vs melody (PV108 spirit).
 */
import type { ChunkInfo } from '../chunkDetect'

/** the sequencer only edits sound/sample patterns; notes go to the Piano Roll */
export function isStepChunk(chunk: ChunkInfo): boolean {
  return chunk.miniString !== null && (chunk.headFn === 's' || chunk.headFn === 'sound')
}

/** the piano roll only edits melodic patterns */
export function isRollChunk(chunk: ChunkInfo): boolean {
  return chunk.miniString !== null && (chunk.headFn === 'note' || chunk.headFn === 'n')
}

export type PatternKind = 'step' | 'roll' | null

/** which grid editor (if any) the chunk under the cursor maps to */
export function patternKind(chunk: ChunkInfo | null): PatternKind {
  if (!chunk) return null
  if (isStepChunk(chunk)) return 'step'
  if (isRollChunk(chunk)) return 'roll'
  return null
}
