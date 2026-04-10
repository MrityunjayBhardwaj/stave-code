/**
 * chordProgression — prebaked example audio source (scheduler-only).
 *
 * A classic I-vi-IV-V chord progression in C major that viz tabs
 * can query without needing to write a pattern file. Each chord is
 * held for 2 seconds, and each chord is exposed as three
 * simultaneous `IREvent`s (root, third, fifth) so polyphonic viz
 * (chord-wheel displays, harmony analyzers, voice-leading
 * visualizations) have real simultaneous notes to render.
 *
 * Like `drumPattern`, this source publishes ONLY a scheduler +
 * empty hapStream — no audio graph. It's meant to test
 * scheduler-driven viz against a harmonically rich source. Users
 * who want audio can pick the `sampleSound` source.
 *
 * ## Pattern structure
 *
 *   Cycle length: 8 seconds (4 chords × 2 seconds each).
 *
 *   Chord sequence (I-vi-IV-V in C major):
 *     - Cmaj  = C4, E4, G4   (60, 64, 67)  at [0s, 2s)
 *     - Amin  = A3, C4, E4   (57, 60, 64)  at [2s, 4s)
 *     - Fmaj  = F3, A3, C4   (53, 57, 60)  at [4s, 6s)
 *     - Gmaj  = G3, B3, D4   (55, 59, 62)  at [6s, 8s)
 *
 *   Each note holds for the full 2-second duration of its chord.
 *   The `s` field is set to `chord-<root>` (e.g., 'chord-C',
 *   'chord-Am', 'chord-F', 'chord-G') so sketches can label
 *   chord regions differently from drum hits. `trackId` groups
 *   all voices within a single chord by the root symbol.
 */

import { workspaceAudioBus } from './WorkspaceAudioBus'
import type { AudioPayload } from './types'
import type { PatternScheduler } from '../visualizers/types'
import type { IREvent } from '../ir/IREvent'
import { HapStream } from '../engine/HapStream'

/** Fixed source id. */
export const CHORD_PROGRESSION_SOURCE_ID = '__example_chords__'

/** Human-readable label for the audio source dropdown. */
export const CHORD_PROGRESSION_LABEL = 'Example: chord progression (I-vi-IV-V)'

const CHORD_DURATION = 2
const CYCLE_SECONDS = 8 // 4 chords × 2s

interface ChordDef {
  root: 'C' | 'Am' | 'F' | 'G'
  notes: readonly [number, number, number]
}

/**
 * The I-vi-IV-V progression in C major. Each chord entry lists
 * its three voices (root, third, fifth). The scheduler expands
 * these into `IREvent[]` with note onsets and ends anchored to
 * the chord's time window, and marks all three voices of a single
 * chord with the same `trackId` so consumers can group them.
 */
const CHORD_PROGRESSION: readonly ChordDef[] = [
  { root: 'C', notes: [60, 64, 67] },
  { root: 'Am', notes: [57, 60, 64] },
  { root: 'F', notes: [53, 57, 60] },
  { root: 'G', notes: [55, 59, 62] },
]

/**
 * Virtual `PatternScheduler` for the chord-progression example.
 * Exported for unit testing — accepts any `{ currentTime: number }`
 * stub in place of a real AudioContext.
 */
export class ChordProgressionScheduler implements PatternScheduler {
  constructor(private readonly ctx: { currentTime: number }) {}

  now(): number {
    return this.ctx.currentTime
  }

  query(begin: number, end: number): IREvent[] {
    if (end <= begin) return []
    const events: IREvent[] = []
    const firstCycle = Math.floor(begin / CYCLE_SECONDS)
    const lastCycle = Math.floor(end / CYCLE_SECONDS)

    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const cycleStart = cycle * CYCLE_SECONDS
      for (let i = 0; i < CHORD_PROGRESSION.length; i++) {
        const chord = CHORD_PROGRESSION[i]
        const chordBegin = cycleStart + i * CHORD_DURATION
        const chordEnd = chordBegin + CHORD_DURATION
        // Skip chords that don't overlap the query window.
        if (chordEnd <= begin || chordBegin >= end) continue
        for (const midi of chord.notes) {
          events.push({
            begin: chordBegin,
            end: chordEnd,
            endClipped: chordEnd,
            note: midi,
            freq: 440 * Math.pow(2, (midi - 69) / 12),
            s: `chord-${chord.root}`,
            type: 'synth',
            gain: 1,
            velocity: 1,
            color: null,
            trackId: `chord-${chord.root}`,
          })
        }
      }
    }
    return events
  }
}

interface ChordProgressionState {
  ctx: AudioContext
  scheduler: ChordProgressionScheduler
  hapStream: HapStream
}

let state: ChordProgressionState | null = null

/**
 * Start the chord progression source. Lazy-initializes an
 * AudioContext just for a stable `currentTime` — no audio graph is
 * built. Must be called from a user gesture per browser autoplay
 * policy. Safe to call multiple times.
 */
export function startChordProgression(): void {
  if (state) return
  const ctx = new AudioContext()
  const scheduler = new ChordProgressionScheduler(ctx)
  const hapStream = new HapStream()
  state = { ctx, scheduler, hapStream }
  const payload: AudioPayload = {
    scheduler,
    hapStream,
  }
  workspaceAudioBus.publish(CHORD_PROGRESSION_SOURCE_ID, payload)
}

/**
 * Stop the chord progression source. Unpublishes, disposes the
 * hap stream, closes the AudioContext. No-op if not running.
 */
export function stopChordProgression(): void {
  if (!state) return
  state.hapStream.dispose()
  workspaceAudioBus.unpublish(CHORD_PROGRESSION_SOURCE_ID)
  try {
    void state.ctx.close()
  } catch {
    // close() rejects if already closed — non-fatal.
  }
  state = null
}

/** Query whether the chord progression source is currently running. */
export function isChordProgressionPlaying(): boolean {
  return state !== null
}
