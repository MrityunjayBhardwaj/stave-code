/**
 * demoSignalSource — a muted, looping signal feed for viz PREVIEWS (#838).
 *
 * A viz-library card renders its real viz LIVE on hover, but nothing is playing
 * (and we produce no sound), so an audio-reactive shader would read near-black —
 * the master analyser is silent, no haps fire. This module synthesizes the SAME
 * `SignalFrame`s a running engine would, from the DEFAULT DRUM PATTERN we already
 * use for baking thumbnails — `s("bd*4, ~ sd, hh*8")`:
 *
 *   - kick  (`bd`) on every quarter        → 0, ¼, ½, ¾ of the cycle
 *   - snare (`sd`) on the second half      → ½              (`~ sd`)
 *   - hat   (`hh`) eight per cycle          → 0, ⅛, ¼, … , ⅞ (`hh*8`)
 *
 * Each onset emits a `bump` keyed by the Strudel sound name (`bd`/`sd`/`hh`), so
 * the worker `SignalBus` lights `uKick`/`uSnare`/`uHat` and decays them itself
 * (aliasMap `uKick → bd`). For spectrum-reading shaders (Prism's `iChannel0` →
 * `uBass/uMid/uTreble/uRms`) we also synthesize a master magnitude spectrum whose
 * low/mid/high bands pulse with the kick/snare/hat envelopes. No audio graph, no
 * scheduler, no DOM — a pure clock-in → frame-out function, unit-testable as
 * plain objects, and byte-deterministic for a given time.
 *
 * The consumer is `WorkerVizRenderer`: when a demo source is set it supersedes the
 * live `MainSignalSampler` in the frame pump (see `setDemoSource`). The frame
 * shape is exactly `signalFrame.ts`'s, so the worker path is unchanged.
 */

import {
  MASTER_KEY,
  type SignalFrame,
  type AnalyserBytes,
  type BumpSummary,
  type ActiveEventSummary,
} from './worker/signalFrame'

/** A clock-driven frame provider. `next(nowMs)` returns the frame for the given
 *  monotonic time (`performance.now()`-style ms); it is STATEFUL (tracks the
 *  previous time to detect onsets crossed since the last frame + a rising seq). */
export interface SignalFrameSource {
  next(nowMs: number): SignalFrame
}

/** One synthesized drum voice: the Strudel `s` name (→ aliasMap envelope), its
 *  onsets as cycle fractions [0,1), and the spectral band it energizes. */
interface DemoVoice {
  readonly s: string
  readonly onsets: readonly number[]
  /** Envelope decay time-constant in cycles (smaller = snappier). */
  readonly tau: number
}

const range = (n: number, step: number): number[] =>
  Array.from({ length: n }, (_, i) => i * step)

/** The three voices of `s("bd*4, ~ sd, hh*8")`, as cycle-fraction onsets. */
export const DRUM_DEMO_VOICES: readonly DemoVoice[] = [
  { s: 'bd', onsets: range(4, 1 / 4), tau: 0.12 }, // kick — every quarter
  { s: 'sd', onsets: [1 / 2], tau: 0.16 }, // snare — `~ sd`, second half
  { s: 'hh', onsets: range(8, 1 / 8), tau: 0.05 }, // hat  — eight per cycle
]

/** Spectrum layout: bins per band (low=bass, mid, high=treble). 64 bins total
 *  (fftSize 128) is plenty for a 64px preview and keeps the frame small. */
const BIN_COUNT = 64
const FFT_SIZE = BIN_COUNT * 2
const LOW_END = Math.floor(BIN_COUNT * 0.18) // bass bins: kick
const MID_END = Math.floor(BIN_COUNT * 0.55) // mid bins: snare body

export interface DrumDemoOptions {
  /** Seconds per cycle of the loop. Default 3.33s ≈ 72 BPM — a relaxed preview
   *  pace (60% of the earlier 120 BPM / 2s, which itself replaced a frantic
   *  ~240 BPM / 1s). One bar = 4 kicks / 8 hats per cycle. */
  readonly cycleSeconds?: number
}

/** Retriggering exponential envelope: level of the most-recent onset at `pos`,
 *  wrapping across the cycle boundary so a hit near the end still decays into the
 *  next loop. Returns 0..1. */
function voiceEnvelope(pos: number, voice: DemoVoice): number {
  let best = 0
  for (const onset of voice.onsets) {
    // Time since this onset, measured forward within the wrapped cycle.
    const dt = (pos - onset + 1) % 1
    const level = Math.exp(-dt / voice.tau)
    if (level > best) best = level
  }
  return best
}

/**
 * Create the drum-pattern demo signal source. Stateful over time (tracks the
 * previous `nowMs` to emit a bump exactly once when an onset is crossed).
 */
export function createDrumDemoSignalSource(opts: DrumDemoOptions = {}): SignalFrameSource {
  const cycleSeconds = opts.cycleSeconds ?? 3.33
  let seq = 0
  let prevPos: number | null = null

  return {
    next(nowMs: number): SignalFrame {
      const posRaw = (nowMs / 1000 / cycleSeconds) % 1
      const pos = ((posRaw % 1) + 1) % 1 // guard negative/NaN → [0,1)

      // Bumps: any onset crossed since the previous frame fires once. On the
      // first frame (no prev) we don't back-fire history — envelopes below still
      // render a lit spectrum so the very first frame isn't black.
      const bumps: BumpSummary[] = []
      const activeEvents: ActiveEventSummary[] = []
      for (const voice of DRUM_DEMO_VOICES) {
        const env = voiceEnvelope(pos, voice)
        if (env > 0.5) {
          // Voice is "active" (recently hit) — feeds uVelocity / bus.sound().
          activeEvents.push({ s: voice.s, velocity: env, note: null, color: null })
        }
        if (prevPos !== null && crossedOnset(prevPos, pos, voice.onsets)) {
          bumps.push({ s: voice.s, color: null, gain: 1 })
        }
      }

      const freq = synthesizeSpectrum(pos)
      const time = new Uint8Array(FFT_SIZE).fill(128) // silent waveform baseline
      const analyser: AnalyserBytes = {
        key: MASTER_KEY,
        frequencyBinCount: BIN_COUNT,
        freq,
        time,
        fftSize: FFT_SIZE,
      }

      prevPos = pos
      return {
        seq: seq++,
        now: nowMs / 1000,
        analysers: [analyser],
        activeEvents,
        activeByTrack: [],
        bumps,
        rawScheduler: { now: nowMs / 1000, events: [] },
      }
    },
  }
}

/** True if any onset lies in the wrapped interval (prev, cur]. Handles the cycle
 *  wrap (prev near 1, cur near 0) so no hit is dropped or double-fired. */
function crossedOnset(prev: number, cur: number, onsets: readonly number[]): boolean {
  for (const onset of onsets) {
    if (prev <= cur) {
      if (onset > prev && onset <= cur) return true
    } else {
      // wrapped past 1 → onset is in (prev,1] ∪ [0,cur]
      if (onset > prev || onset <= cur) return true
    }
  }
  return false
}

/** Build a master magnitude spectrum for `pos`: bass band tracks the kick, mid
 *  the snare, treble the hat — so `deriveAudio`'s bass/mid/treble (and Prism's
 *  `iChannel0`) pulse with the beat. Bytes 0..255. */
function synthesizeSpectrum(pos: number): Uint8Array {
  const [kick, snare, hat] = DRUM_DEMO_VOICES
  const kickEnv = voiceEnvelope(pos, kick)
  const snareEnv = voiceEnvelope(pos, snare)
  const hatEnv = voiceEnvelope(pos, hat)

  const freq = new Uint8Array(BIN_COUNT)
  for (let i = 0; i < BIN_COUNT; i++) {
    let level: number
    if (i < LOW_END) {
      // Bass: kick-driven, brightest at the lowest bins.
      const rolloff = 1 - i / LOW_END
      level = kickEnv * rolloff
    } else if (i < MID_END) {
      // Mid: snare body + a little kick spill.
      level = snareEnv * 0.9 + kickEnv * 0.15
    } else {
      // Treble: hat-driven, plus snare sizzle.
      level = hatEnv * 0.8 + snareEnv * 0.25
    }
    // Small noise floor so the spectrum is never a dead zero (reads as "signal").
    const v = Math.min(1, level) * 235 + 8
    freq[i] = Math.round(v)
  }
  return freq
}
