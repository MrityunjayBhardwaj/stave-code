/**
 * meterMath.ts — the pure level-meter maths: RMS from a time-domain buffer plus
 * the meter ballistics (instant attack, slow release on the bar; a held, slowly
 * falling peak).
 *
 * Pure number/array math — no React, no audio nodes, no DOM — so it unit-tests
 * directly and the RAF loop in `useTrackMeters` is left to do only I/O (read the
 * analyser, paint the bar). This is the `feedback_editor_idb_test_split`
 * discipline: separate the logic that has a right answer from the I/O that needs
 * a browser.
 *
 * The output is a linear-amplitude pair `{ rms, peak }` in 0..~1. The strip maps
 * each onto a bar fraction with the SAME `faderTaper` the fader uses, so the
 * meter and the fader share one dB scale (design §6.2).
 *
 * Two instant-level sources feed the same ballistics:
 *  - `levelFromActiveHaps` — the per-track level from a track's OWN haps
 *    (`gain × velocity`), read by id off `queryable.trackSchedulers`. This is
 *    what the strip meters use: it is genuinely per-track and needs NO audio
 *    routing change (the per-track analysers all tap the shared orbit-1 bus
 *    unless a track is `.viz`/`.orbit`-isolated, so they'd only ever show the
 *    master mix — observed, not inferred). It reflects the `.gain` the fader
 *    writes, so the fader and meter form one coherent loop.
 *  - `rmsFromTimeDomain` — the RMS of an analyser's audio buffer, for a future
 *    master/output meter (S5, GR6) where the summed mix IS the wanted signal.
 */

/** A meter's running state, advanced one analyser frame at a time. */
export interface MeterState {
  /** the smoothed bar level (linear amplitude, instant up / slow down) */
  rms: number
  /** the held peak (linear amplitude) */
  peak: number
  /** ms left on the current peak hold before it starts falling */
  peakHoldMs: number
}

/** Tunable ballistics — standard VU-ish defaults (design §6.2). */
export interface MeterBallistics {
  /** bar release time constant: larger = slower fall back down */
  releaseMs: number
  /** how long the peak tick holds before it falls */
  peakHoldMs: number
  /** peak fall time: ms for the peak to travel a full 0..1 once it releases */
  peakFallMs: number
}

export const DEFAULT_BALLISTICS: MeterBallistics = {
  releaseMs: 300,
  peakHoldMs: 1500,
  peakFallMs: 1000,
}

export const ZERO_METER: MeterState = { rms: 0, peak: 0, peakHoldMs: 0 }

/**
 * RMS amplitude (0..~1) of a byte time-domain buffer. `getByteTimeDomainData`
 * centres silence at 128; we recentre to −1..1 and take the root-mean-square,
 * which is the perceptual loudness of the window (a single bright sample can't
 * spike it the way a peak detector would — that's what the peak tick is for).
 */
export function rmsFromTimeDomain(bytes: Uint8Array): number {
  const n = bytes.length
  if (n === 0) return 0
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const v = (bytes[i] - 128) / 128
    sumSq += v * v
  }
  return Math.sqrt(sumSq / n)
}

/** the minimum a hap needs for a level reading — its window and its loudness. */
export interface MeterHap {
  /** cycle the note starts on */
  begin: number
  /** cycle the note ends on */
  end: number
  /** the note's `.gain` (linear; may exceed 1 with makeup) */
  gain: number
  /** the note's velocity (0..1) */
  velocity: number
}

/**
 * The instantaneous level of a track at cycle `now`, from its own haps: the
 * loudest `gain × velocity` among the haps whose `[begin, end)` window covers
 * `now`. No active hap → 0 (the bar then releases via the ballistics). This is
 * per-track by construction — the haps come from one track's scheduler — and is
 * the level the strip's fader controls (`.gain`).
 */
export function levelFromActiveHaps(haps: MeterHap[], now: number, eps = 1e-4): number {
  let level = 0
  for (const h of haps) {
    // `eps` only on the onset side: a note whose `begin` lands on `now` (or a
    // hair after, by float error) is sounding; one whose `end` is `now` is done.
    if (h.begin <= now + eps && h.end > now) {
      const e = (h.gain ?? 1) * (h.velocity ?? 1)
      if (e > level) level = e
    }
  }
  return level
}

/**
 * Advance a meter by one frame. The bar attacks instantly (a louder reading
 * jumps straight up) and releases on a single-pole exponential toward the
 * current reading (a quieter reading eases down over `releaseMs`). The peak
 * latches the loudest reading, holds it for `peakHoldMs`, then falls linearly
 * over `peakFallMs` — never below the live bar.
 *
 * Pure: `(prev, instant, dtMs) → next`. `dtMs` is the wall-clock gap since the
 * last frame, so the ballistics are frame-rate independent.
 */
export function advanceMeter(
  prev: MeterState,
  instant: number,
  dtMs: number,
  b: MeterBallistics = DEFAULT_BALLISTICS,
): MeterState {
  const live = instant > 0 ? instant : 0
  const dt = dtMs > 0 ? dtMs : 0

  // Bar: instant up, exponential down.
  let rms: number
  if (live >= prev.rms) {
    rms = live
  } else {
    const k = b.releaseMs > 0 ? Math.exp(-dt / b.releaseMs) : 0
    rms = live + (prev.rms - live) * k
  }

  // Peak: latch + hold + linear fall, clamped to the live bar.
  let peak = prev.peak
  let peakHoldMs = prev.peakHoldMs
  if (live >= prev.peak) {
    peak = live
    peakHoldMs = b.peakHoldMs
  } else if (peakHoldMs > 0) {
    peakHoldMs = Math.max(0, peakHoldMs - dt)
  } else {
    const fall = b.peakFallMs > 0 ? dt / b.peakFallMs : 1
    peak = Math.max(live, prev.peak - fall)
  }

  return { rms, peak, peakHoldMs }
}
