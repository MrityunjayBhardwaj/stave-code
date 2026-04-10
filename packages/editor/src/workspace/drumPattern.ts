/**
 * drumPattern — prebaked example audio source (scheduler-only).
 *
 * A canonical 4-beat / 2-second drum pattern that viz tabs can
 * query without needing to write a pattern file. Unlike `sampleSound`,
 * this source has NO audio graph — it publishes only a scheduler +
 * empty hapStream to the workspace bus. Sketches driven by
 * `stave.scheduler.query()` see a rich multi-track beat pattern; sketches
 * that expect audio (`stave.analyser`) will see `null` and should
 * fall through to their demo/empty state.
 *
 * This is the "advanced example" the source dropdown exposes for
 * viz developers who want to test rhythmic visualizations (beat
 * flashers, step sequencers, drum-grid displays) against a stable
 * source. Cheaper to stand up than a real pattern runtime, more
 * interesting than the single-voice A-minor arpeggio in
 * `sampleSound`.
 *
 * ## Pattern structure
 *
 *   Bar length: 2 seconds (matches sampleSound's cycle so examples
 *   align if you compare schedulers side-by-side).
 *
 *   Four "tracks" identified by the `s` field on each event:
 *
 *     - `bd` (MIDI 36, C2) — kick on every quarter: 0, 0.5, 1, 1.5
 *     - `sd` (MIDI 38, D2) — snare on the backbeat: 0.5, 1.5
 *     - `hh` (MIDI 42, F#2) — closed hat on 8ths:
 *                             0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75
 *     - `oh` (MIDI 46, A#2) — open hat on the "and" of 4: 1.75
 *
 *   Every note holds for 0.1 seconds (short percussive hit). The
 *   `trackId` is set to the drum voice name so viz filtering by
 *   track works naturally.
 *
 * ## Why scheduler-only (no audio)
 *
 * Building a polyphonic drum synth would 4x the code size of this
 * file for a feature that's meant to be a quick test source. Users
 * who want audio in their viz testing can pick the built-in
 * `sampleSound` source, which does have an audible signal. This
 * module is for sketches that query pattern events — the data, not
 * the sound.
 */

import { workspaceAudioBus } from './WorkspaceAudioBus'
import type { AudioPayload } from './types'
import type { PatternScheduler } from '../visualizers/types'
import type { IREvent } from '../ir/IREvent'
import { HapStream } from '../engine/HapStream'

/** Fixed source id. */
export const DRUM_PATTERN_SOURCE_ID = '__example_drums__'

/** Human-readable label for the audio source dropdown. */
export const DRUM_PATTERN_LABEL = 'Example: drum pattern'

const BAR_SECONDS = 2
const HIT_DURATION = 0.1

interface DrumHit {
  s: 'bd' | 'sd' | 'hh' | 'oh'
  midi: number
  beatOffsets: readonly number[]
}

/**
 * The prebaked drum pattern. One entry per drum voice; each entry
 * lists the within-bar offsets (in seconds) at which that voice
 * fires. The scheduler expands this into `IREvent[]` on every
 * query() call so the viz sees consistent events regardless of
 * how far apart successive queries are.
 */
const DRUM_PATTERN: readonly DrumHit[] = [
  { s: 'bd', midi: 36, beatOffsets: [0, 0.5, 1, 1.5] },
  { s: 'sd', midi: 38, beatOffsets: [0.5, 1.5] },
  {
    s: 'hh',
    midi: 42,
    beatOffsets: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75],
  },
  { s: 'oh', midi: 46, beatOffsets: [1.75] },
]

/**
 * Virtual `PatternScheduler` implementation for the drum pattern
 * example. `now()` forwards the real `AudioContext.currentTime` if
 * the source has been started; otherwise a monotonic fallback from
 * `performance.now()` keeps the pattern advancing even for tests
 * or headless contexts.
 *
 * Exported for unit testing — takes any object with a
 * `currentTime: number` field so tests don't need a real
 * `AudioContext`.
 */
export class DrumPatternScheduler implements PatternScheduler {
  constructor(private readonly ctx: { currentTime: number }) {}

  now(): number {
    return this.ctx.currentTime
  }

  query(begin: number, end: number): IREvent[] {
    if (end <= begin) return []
    const events: IREvent[] = []
    const firstBar = Math.floor(begin / BAR_SECONDS)
    const lastBar = Math.floor(end / BAR_SECONDS)

    for (let bar = firstBar; bar <= lastBar; bar++) {
      const barStart = bar * BAR_SECONDS
      for (const hit of DRUM_PATTERN) {
        for (const offset of hit.beatOffsets) {
          const noteBegin = barStart + offset
          const noteEnd = noteBegin + HIT_DURATION
          if (noteEnd <= begin || noteBegin >= end) continue
          events.push({
            begin: noteBegin,
            end: noteEnd,
            endClipped: noteEnd,
            note: hit.midi,
            freq: 440 * Math.pow(2, (hit.midi - 69) / 12),
            s: hit.s,
            type: 'sample',
            gain: 1,
            velocity: 1,
            color: null,
            trackId: hit.s,
          })
        }
      }
    }
    return events
  }
}

interface DrumPatternState {
  ctx: AudioContext
  scheduler: DrumPatternScheduler
  hapStream: HapStream
}

let state: DrumPatternState | null = null

/**
 * Start the drum pattern source. Lazy-initializes an AudioContext
 * just to get a stable `currentTime` for the scheduler — no audio
 * graph is built, so the context stays idle. Must be called from a
 * user gesture (click handler) per browser autoplay policy, same
 * as `sampleSound`.
 *
 * Safe to call multiple times — second and later calls are no-ops.
 */
export function startDrumPattern(): void {
  if (state) return
  const ctx = new AudioContext()
  const scheduler = new DrumPatternScheduler(ctx)
  const hapStream = new HapStream()
  state = { ctx, scheduler, hapStream }
  const payload: AudioPayload = {
    scheduler,
    hapStream,
  }
  workspaceAudioBus.publish(DRUM_PATTERN_SOURCE_ID, payload)
}

/**
 * Stop the drum pattern source. Unpublishes from the bus, disposes
 * the hap stream, closes the AudioContext. No-op if not running.
 */
export function stopDrumPattern(): void {
  if (!state) return
  state.hapStream.dispose()
  workspaceAudioBus.unpublish(DRUM_PATTERN_SOURCE_ID)
  try {
    void state.ctx.close()
  } catch {
    // close() rejects if already closed — non-fatal.
  }
  state = null
}

/** Query whether the drum pattern source is currently running. */
export function isDrumPatternPlaying(): boolean {
  return state !== null
}
