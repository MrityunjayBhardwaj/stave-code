/**
 * MainSignalSampler — samples the main-thread signal feed into a `SignalFrame`
 * each frame (Phase B / B-2). It is the MAIN-side half of the marshalling: it
 * does the work that is main-thread-bound (read `AnalyserNode` bytes, query the
 * scheduler, collect haps) so a worker `SignalBus` can run off those values.
 *
 * It mirrors exactly what `SignalBus` does on main today (P5VizRenderer __tick):
 *   - `now = scheduler.now()`
 *   - active events = `scheduler.query(now, now + ε)` (combined + per-track)
 *   - analyser bytes = `getByte{Frequency,TimeDomain}Data` per bound analyser
 *   - bumps = the haps that fired since the previous `sample()`
 *
 * No DOM/worker — it consumes the same structural types the bus does
 * (`BusAnalyser`, `IRPattern`, `HapStream`), so it unit-tests with plain stubs.
 */

import type { BusAnalyser } from '../signals/SignalBus'
import type { IRPattern } from '../../ir/IRPattern'
import type { HapEvent } from '../../engine/HapStream'
import {
  MASTER_KEY,
  emptyFrame,
  type SignalFrame,
  type ActiveEventSummary,
  type BumpSummary,
  type AnalyserBytes,
} from './signalFrame'

/** ε window for the query-at-now read — identical to `SignalBus.refreshActive`
 *  (`EPSILON = 0.001`). Kept in sync deliberately: the sampler stands in for the
 *  bus's own query, so the window must match or the worker sees a different slice. */
const EPSILON = 0.001

/** The live inputs the sampler reads — the main-thread feed. All optional: any
 *  absent input degrades to the bus's zero (empty arrays / no events). */
export interface SamplerInputs {
  /** Combined scheduler (`now()` + `query()`). */
  scheduler?: IRPattern | null
  /** Per-track schedulers, SCHEDULER key space (`$0`/`d1` — TRAP §5). */
  trackSchedulers?: Map<string, IRPattern> | null
  /** Master/combined-mix analyser. */
  masterAnalyser?: BusAnalyser | null
  /** Per-track analysers, keyed the SAME as `trackSchedulers`. */
  trackAnalysers?: Map<string, BusAnalyser> | null
}

/** Minimal HapStream surface the sampler subscribes to (structural — the bus
 *  uses the same `.on`/`.off` guard discipline). */
interface HapSubscribable {
  on(handler: (e: HapEvent) => void): void
  off(handler: (e: HapEvent) => void): void
}

function summariseEvent(e: {
  s: string | null
  velocity: number
  note: number | string | null
  color: string | null
}): ActiveEventSummary {
  return { s: e.s, velocity: e.velocity, note: e.note, color: e.color }
}

/** Read one analyser's bytes into a fresh `AnalyserBytes` (fresh arrays so they
 *  can be transferred). Returns null for a zero-bin analyser (never ships empty
 *  buffers the worker would divide by). */
function readAnalyserBytes(key: string, an: BusAnalyser): AnalyserBytes | null {
  const n = an.frequencyBinCount | 0
  if (n <= 0) return null
  const freq = new Uint8Array(n)
  const time = new Uint8Array(n)
  an.getByteFrequencyData(freq)
  an.getByteTimeDomainData(time)
  return { key, frequencyBinCount: n, freq, time }
}

export class MainSignalSampler {
  private inputs: SamplerInputs = {}
  private seq = 0
  /** Haps accumulated since the last `sample()` (the envelope feed). */
  private pendingBumps: BumpSummary[] = []
  private boundStream: HapSubscribable | null = null
  private readonly hapHandler = (e: HapEvent): void => {
    // Mirror SignalBus.bump's reads: s, color, gain (raw — the bus clamps).
    this.pendingBumps.push({
      s: e.s ?? null,
      color: e.color ?? null,
      gain: (e.hap?.value?.gain as number | undefined) ?? 1,
    })
  }

  /** Rebind the live inputs (mirror the renderer's in-place rebind on
   *  re-evaluate). Pass `null`/absent for demo / IR-only mode. */
  bind(inputs: SamplerInputs): void {
    this.inputs = inputs
  }

  /** (Re)subscribe to a HapStream for the envelope feed. Off the old, on the new
   *  — so the bump feed survives a re-evaluate that swaps the stream (mirror
   *  P5VizRenderer.update). A partial stream (no `.on`) degrades to no feed. */
  bindHapStream(stream: HapSubscribable | null): void {
    if (stream === this.boundStream) return
    if (this.boundStream && typeof this.boundStream.off === 'function') {
      this.boundStream.off(this.hapHandler)
    }
    this.boundStream = null
    this.pendingBumps = []
    if (stream && typeof stream.on === 'function') {
      stream.on(this.hapHandler)
      this.boundStream = stream
    }
  }

  /** Produce one frame from the current inputs + the haps since the last call.
   *  Drains the pending bumps (so each hap ships exactly once). */
  sample(): SignalFrame {
    const { scheduler, trackSchedulers, masterAnalyser, trackAnalysers } =
      this.inputs
    const seq = ++this.seq
    const now = scheduler ? scheduler.now() : 0
    const begin = now
    const end = now + EPSILON

    const activeEvents: ActiveEventSummary[] = scheduler
      ? scheduler.query(begin, end).map(summariseEvent)
      : []

    const activeByTrack: Array<[string, ActiveEventSummary[]]> = []
    if (trackSchedulers) {
      for (const [key, sched] of trackSchedulers) {
        activeByTrack.push([key, sched.query(begin, end).map(summariseEvent)])
      }
    }

    const analysers: AnalyserBytes[] = []
    if (masterAnalyser) {
      const b = readAnalyserBytes(MASTER_KEY, masterAnalyser)
      if (b) analysers.push(b)
    }
    if (trackAnalysers) {
      for (const [key, an] of trackAnalysers) {
        const b = readAnalyserBytes(key, an)
        if (b) analysers.push(b)
      }
    }

    const bumps = this.pendingBumps
    this.pendingBumps = []

    return { seq, now, analysers, activeEvents, activeByTrack, bumps }
  }

  /** Unsubscribe + reset (renderer destroy). */
  dispose(): void {
    if (this.boundStream && typeof this.boundStream.off === 'function') {
      this.boundStream.off(this.hapHandler)
    }
    this.boundStream = null
    this.pendingBumps = []
    this.inputs = {}
  }

  /** The next seq an `emptyFrame` should carry (test/demo helper). */
  emptyFrame(): SignalFrame {
    return emptyFrame(++this.seq)
  }
}
