/**
 * vizSignalProbe — a single, main-thread read-only tap on the GLOBAL MASTER
 * audio bus, for the viz-editor hover live values (#309).
 *
 * Design (issue #309): hover shows MASTER values only — no per-instance focus.
 * So this probe follows the `'default'` audio publisher (most-recent), binds its
 * master analyser to one `SignalBus`, feeds the envelope from the global hap
 * stream, and ticks once per rAF. The Monaco hover provider reads a value on
 * demand via {@link VizSignalProbe.read}.
 *
 * Ref-counted: `acquire()` starts the subscription + rAF on the first viz editor
 * that mounts (StaveInputsPanel), and `release()` stops it when the last one
 * unmounts — so there's no idle loop when no viz file is open.
 *
 * Scope of live values (v1): master DSP scalars (rms/bass/mid/treble), the
 * fft/wave arrays, and the per-drum envelopes (uKick…uTom). `keyVelocity` and
 * glsl `iTime` need the scheduler active-query / per-shader clock respectively →
 * doc-only for now (the probe returns `null`, hover degrades to the doc).
 */

import { SignalBus, type BusAnalyser, type AudioReading } from '../visualizers/signals/SignalBus'
import { ALIAS_MAP } from '../visualizers/signals/aliasMap'
import type { LiveSpec } from '../visualizers/injectedGlobals'
import { workspaceAudioBus } from './WorkspaceAudioBus'
import type { AudioPayload } from './types'
import type { HapStream, HapEvent } from '../engine/HapStream'

/**
 * Map a token's {@link LiveSpec} to a value read from a (ticked, bound) bus —
 * the pure core of the probe, extracted so it's unit-testable without the
 * rAF/subscription machinery. Returns `null` for specs the v1 master probe
 * doesn't serve (glsl `iTime`, `keyVelocity`).
 */
export function readMasterSignal(bus: SignalBus, spec: LiveSpec): number | number[] | null {
  if (spec.kind === 'time') return null // per-shader clock — not the master bus
  // Envelope decay is driven by the probe's per-frame tick(); DSP is snapshotted
  // FRESH here so the hover reflects the analyser at read-time. `readAudio()`
  // populates the per-frame cache `master()` reads from (without it, zeros).
  if (spec.kind === 'scalar' && spec.read.startsWith('env:')) {
    return bus.envValue(spec.read.slice(4)) // master envelope for the drum alias
  }
  if (spec.kind === 'scalar' && spec.read === 'keyVelocity') return null // doc-only in v1
  bus.readAudio()
  const m: AudioReading = bus.master()
  if (spec.kind === 'array') return spec.read === 'fft' ? m.fft : m.wave
  switch (spec.read) {
    case 'rms':
      return m.rms
    case 'bass':
      return m.bass
    case 'mid':
      return m.mid
    case 'treble':
      return m.treble
    default:
      return null
  }
}

class VizSignalProbe {
  private readonly bus = new SignalBus()
  private refs = 0
  private unsubBus: (() => void) | null = null
  private rafId: number | null = null
  private boundHap: HapStream | null = null
  private hapHandler: ((e: HapEvent) => void) | null = null
  /** True when a publisher with a master analyser is bound (something to read). */
  private bound = false

  constructor() {
    this.bus.setAliases(ALIAS_MAP)
  }

  /** Activate the probe; returns a release fn. First acquire starts it. */
  acquire(): () => void {
    this.refs += 1
    if (this.refs === 1) this.start()
    let released = false
    return () => {
      if (released) return
      released = true
      this.refs = Math.max(0, this.refs - 1)
      if (this.refs === 0) this.stop()
    }
  }

  /** Is a live audio source currently bound? (drives "show a number" vs doc-only) */
  get playing(): boolean {
    return this.bound
  }

  /**
   * Read a token's live value from the master bus, or `null` when there's no
   * source bound or the spec isn't supported in v1.
   */
  read(spec: LiveSpec): number | number[] | null {
    if (!this.bound) return null
    return readMasterSignal(this.bus, spec)
  }

  private start(): void {
    if (typeof requestAnimationFrame !== 'function') return // SSR / non-DOM
    this.unsubBus = workspaceAudioBus.subscribe({ kind: 'default' }, (p) => this.onPayload(p))
    const loop = (): void => {
      this.bus.tick()
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private stop(): void {
    this.unsubBus?.()
    this.unsubBus = null
    this.detachHap()
    if (this.rafId != null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    this.bound = false
  }

  private onPayload(p: AudioPayload | null): void {
    const analyser = (p?.audio?.analyser ?? p?.analyser ?? null) as BusAnalyser | null
    const trackAnalysers = (p?.audio?.trackAnalysers ?? null) as Map<string, BusAnalyser> | null
    this.bus.bindAnalysers(analyser, trackAnalysers)
    this.bound = !!analyser

    // Envelope feed — re-subscribe only when the hap stream itself swaps.
    const hap = p?.hapStream ?? null
    if (hap !== this.boundHap) {
      this.detachHap()
      if (hap && typeof hap.on === 'function') {
        const handler = (e: HapEvent): void => this.bus.bump(e)
        hap.on(handler)
        this.boundHap = hap
        this.hapHandler = handler
      }
    }
  }

  private detachHap(): void {
    if (this.boundHap && this.hapHandler && typeof this.boundHap.off === 'function') {
      this.boundHap.off(this.hapHandler)
    }
    this.boundHap = null
    this.hapHandler = null
  }
}

/** The shared probe instance — one master tap for the whole editor. */
export const vizSignalProbe = new VizSignalProbe()
