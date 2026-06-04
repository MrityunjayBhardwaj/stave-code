/**
 * SignalFrame — the serializable per-frame snapshot that crosses main → worker
 * so a worker-side `SignalBus` produces the same readings as the main-side bus
 * (Phase B / B-2, epic #228).
 *
 * The pure `SignalBus` (PV65/P12) ports into the worker unchanged, but its FEED
 * is main-thread-bound: `AnalyserNode` bytes (Web Audio), `scheduler.now()` /
 * `query()` (IRPattern closures), the hap stream. Each frame the MAIN thread
 * samples those into a `SignalFrame`; the worker reconstructs the bus's inputs
 * from it. This module owns ONLY the data shape + (de)serialization helpers —
 * pure, no DOM/worker, plain-object unit tests.
 *
 * What the bus actually reads (so we ship exactly that, no more):
 *   - analysers → `frequencyBinCount` + the freq/time byte arrays (deriveAudio
 *     runs in the WORKER on these bytes, keeping the DSP off main).
 *   - scheduler → `now()` + the active `IREvent`s for [now, now+ε) (combined and
 *     per-track, keyed in the SCHEDULER key space — SignalBus TRAP §5).
 *   - bump feed → per hap: `s`, `color`, `gain` (drives the envelope).
 *
 * Active events are summarised to the four fields the bus reads off an active
 * `IREvent` (`s`/`velocity`/`note`/`color` — SignalBus.sound/track), NOT the full
 * IREvent. That keeps the frame small and the transport string-set bounded.
 */

/** The fields the bus reads off an active scheduler event (see SignalBus). */
export interface ActiveEventSummary {
  /** Instrument/sample name — env-map + audioFor key. */
  s: string | null
  /** Active-event velocity 0..1 (scheduler feed). */
  velocity: number
  /** Note in the user's form (name|number|null). */
  note: number | string | null
  /** Display color. */
  color: string | null
}

/** A hap replayed into the worker bus's envelope feed (`SignalBus.bump`). */
export interface BumpSummary {
  /** Env-map key (`BusHapEvent.s`). */
  s: string | null
  /** `.color()` value, if any. */
  color: string | null
  /** Gain 0..1 — the bus reads it from `hap.value.gain` (default 1). */
  gain: number
}

/** One analyser's raw bytes for this frame (the worker runs `deriveAudio`). */
export interface AnalyserBytes {
  /** Bus/scheduler key: `'master'` for the combined mix, else the SCHEDULER key
   *  space track key (`'$0'`/`'d1'` — TRAP §5), matching `trackAnalysers`. */
  key: string
  /** `AnalyserNode.frequencyBinCount` (= fftSize/2). */
  frequencyBinCount: number
  /** Magnitude spectrum, one byte per bin (0..255). length === frequencyBinCount. */
  freq: Uint8Array
  /** Time-domain waveform, one byte per bin (0..255, 128 = silence). */
  time: Uint8Array
}

/** The master analyser key — the combined-mix analyser (`SignalBus.master()`). */
export const MASTER_KEY = 'master'

/**
 * One frame of signal state, fully serializable (structured-clone / transferable).
 * The Uint8Arrays are the transferable payload; everything else is small JSON.
 */
export interface SignalFrame {
  /** Monotonic frame counter — lets the worker drop a stale/duplicate frame. */
  seq: number
  /** Scheduler time at sample (`SignalBus.now()` source). */
  now: number
  /** Per-analyser bytes. `key === MASTER_KEY` is the master; others are tracks. */
  analysers: AnalyserBytes[]
  /** Combined active events for [now, now+ε) (`SignalBus.refreshActive`). */
  activeEvents: ActiveEventSummary[]
  /** Active events per track key (SCHEDULER key space — TRAP §5). */
  activeByTrack: Array<[string, ActiveEventSummary[]]>
  /** Haps fired since the previous frame, in order (envelope `bump` feed). */
  bumps: BumpSummary[]
}

/** Collect the transferable `ArrayBuffer`s in a frame (for postMessage transfer
 *  list). Returns the underlying buffers of every analyser byte array — passing
 *  these as transfer makes the postMessage zero-copy (no structured clone of the
 *  bytes). The frame is unusable on the sender after transfer (by design). */
export function frameTransferables(frame: SignalFrame): ArrayBuffer[] {
  const out: ArrayBuffer[] = []
  for (const a of frame.analysers) {
    // Transfer only a plain, whole-buffer ArrayBuffer: a SharedArrayBuffer is
    // NOT transferable (it's shared, not moved), and a subarray view (byteOffset
    // ≠ 0 / partial) would transfer the wrong/whole backing. `instanceof
    // ArrayBuffer` both excludes SAB and narrows the ArrayBufferLike type.
    const fb = a.freq.buffer
    if (fb instanceof ArrayBuffer && a.freq.byteOffset === 0 && fb.byteLength === a.freq.byteLength) {
      out.push(fb)
    }
    const tb = a.time.buffer
    if (tb instanceof ArrayBuffer && a.time.byteOffset === 0 && tb.byteLength === a.time.byteLength) {
      out.push(tb)
    }
  }
  return out
}

/** An empty frame — the worker's degraded state before the first real frame, and
 *  the main sampler's value when no analyser/scheduler/haps are bound (demo /
 *  IR-only mode). Mirrors the bus degrading absent inputs to 0/[] (never NaN). */
export function emptyFrame(seq = 0): SignalFrame {
  return {
    seq,
    now: 0,
    analysers: [],
    activeEvents: [],
    activeByTrack: [],
    bumps: [],
  }
}
