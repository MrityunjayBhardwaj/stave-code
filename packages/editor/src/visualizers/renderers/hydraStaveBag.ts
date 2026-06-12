/**
 * buildHydraStaveBag — the pure `stave` bag a `.hydra` sketch reads, built from a
 * `SignalBus` (Phase B / B-5, epic #228). Extracted from `HydraVizRenderer`'s
 * constructor so BOTH the main-thread renderer AND the worker host
 * (`hostVizWorker`, kind `'hydra'`) build the identical bag from their bus — the
 * symmetric analog of `buildStaveUniforms(bus)` for p5. No fork.
 *
 * WORKER-SAFE: imports only the pure `SignalBus` + TYPE-ONLY names from
 * `HydraVizRenderer` (erased at compile time, so the DOM/storage-bound renderer
 * is NOT pulled into the worker bundle). Keep it that way — a value import from
 * `HydraVizRenderer` would drag `editorRegistry` (localStorage) into the worker.
 *
 * The bag's signal thunks read the bus LIVE each call (U2 — never captured), so
 * the SAME bus ticked once per frame (by `pumpAudio` on main, by
 * `WorkerBusFeed.applyFrame` in the worker — PK22) feeds every reader frame-fresh.
 * `scheduler`/`tracks` start null/empty: the caller binds them (main from
 * components, worker from the raw scheduler shim). Custom alias thunks
 * (`stave.<name>()`) are merged by the caller from impure settings (P12) — not here.
 *
 * REF: HydraVizRenderer (the bag types + the original construction it mirrors),
 *      SignalBus (the pure feed), staveUniforms.ts (the p5 analog), PK22.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SignalBus } from '../signals/SignalBus'
import type {
  HydraStaveBag,
  HydraSignalThunks,
  HydraSigAccessor,
} from './HydraVizRenderer'

/** Build the live `stave` bag for a hydra sketch from a (pure) `SignalBus`. The
 *  bus is ticked elsewhere once per frame; every thunk here is a pure read. */
export function buildHydraStaveBag(bus: SignalBus): HydraStaveBag {
  // Per-sound thunks — DSP scalars are `() => number`; `fft`/`wave` are live
  // getter-backed arrays so hydra indexes them natively (`() => u('bd').fft[i]`).
  const soundThunks = (sound: string): HydraSignalThunks => {
    const t = {
      env: () => bus.sound(sound).env,
      velocity: () => bus.sound(sound).velocity,
      note: () => bus.sound(sound).note,
      color: () => bus.sound(sound).color,
      rms: () => bus.sound(sound).rms,
      bass: () => bus.sound(sound).bass,
      mid: () => bus.sound(sound).mid,
      treble: () => bus.sound(sound).treble,
    } as HydraSignalThunks
    Object.defineProperty(t, 'fft', { get: () => bus.sound(sound).fft, enumerable: true })
    Object.defineProperty(t, 'wave', { get: () => bus.sound(sound).wave, enumerable: true })
    return t
  }
  // The single `sig` namespace (#351) — callable, carrying per-sound/per-track
  // readings AND the per-drum / master-DSP scalar thunks on the same object.
  const sig: HydraSigAccessor = ((sound: string): HydraSignalThunks =>
    soundThunks(sound)) as HydraSigAccessor
  sig.track = (id: string): HydraSignalThunks => {
    const t = {
      env: () => bus.track(id).env,
      velocity: () => bus.track(id).velocity,
      note: () => bus.track(id).note,
      color: () => bus.track(id).color,
      rms: () => bus.track(id).rms,
      bass: () => bus.track(id).bass,
      mid: () => bus.track(id).mid,
      treble: () => bus.track(id).treble,
    } as HydraSignalThunks
    Object.defineProperty(t, 'fft', { get: () => bus.track(id).fft, enumerable: true })
    Object.defineProperty(t, 'wave', { get: () => bus.track(id).wave, enumerable: true })
    return t
  }
  Object.defineProperty(sig, 'tracks', { get: () => bus.tracks, enumerable: true })
  Object.defineProperty(sig, 'sounds', { get: () => bus.sounds, enumerable: true })
  // Per-drum envelope thunks (were bag-level `uKick…uTom`).
  sig.kick = () => bus.envValue('uKick')
  sig.snare = () => bus.envValue('uSnare')
  sig.hat = () => bus.envValue('uHat')
  sig.openHat = () => bus.envValue('uOpenHat')
  sig.clap = () => bus.envValue('uClap')
  sig.rim = () => bus.envValue('uRim')
  sig.tom = () => bus.envValue('uTom')
  sig.keyVelocity = () => {
    let max = 0
    for (const s of bus.sounds) {
      const v = bus.sound(s).velocity
      if (v > max) max = v
    }
    return max
  }
  // Master-mix DSP thunks + live arrays.
  sig.rms = () => bus.master().rms
  sig.bass = () => bus.master().bass
  sig.mid = () => bus.master().mid
  sig.treble = () => bus.master().treble
  Object.defineProperty(sig, 'fft', { get: () => bus.master().fft, enumerable: true })
  Object.defineProperty(sig, 'wave', { get: () => bus.master().wave, enumerable: true })

  const bag: HydraStaveBag = {
    scheduler: null,
    tracks: new Map(),
    sig,
    H: (trackId, field = 'gain') => {
      return () => {
        const sched = bag.tracks.get(trackId) ?? bag.scheduler
        if (!sched) return 0
        const now = sched.now()
        // Tight window — one event at/just past `now` (see HydraVizRenderer.H).
        const events = sched.query(now, now + 0.001)
        const ev = events[0]
        if (!ev) return 0
        const raw = ev[field]
        return typeof raw === 'number' ? raw : 0
      }
    },
  }
  return bag
}
