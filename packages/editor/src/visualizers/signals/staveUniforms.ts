/**
 * buildStaveUniforms — construct the single live `sig` namespace a p5 sketch
 * reads (`sig.kick…sig.tom`, `sig.keyVelocity`, `sig.rms…sig.treble`, `sig.fft`/
 * `sig.wave`, and the callable `sig('bd')` / `sig.track('$0')`) from a (pure)
 * `SignalBus`.
 *
 * #351 — ONE namespace. Both the bare per-drum scalars and the structured
 * lookups now hang off a single callable `sig` object: `sig.kick` (a number),
 * `sig.fft` (an array), `sig('bd')` (a per-sound reading). The old split surface
 * (bare `uKick…` getters + a separate `u(...)` accessor) is gone — `sig` IS the
 * accessor and it carries the scalars too. GLSL keeps flat `uKick` uniforms (the
 * `u`=uniform prefix is honest in a shader); JS speaks `sig`.
 *
 * EXTRACTED from `P5VizRenderer`'s constructor (Phase B / B-3) so the MAIN
 * renderer and the WORKER renderer build IDENTICAL uniforms from their respective
 * buses. Single source of truth → a new bus signal can't be exposed on one side
 * and forgotten on the other (the PV54 additive-tag-floor obligation, applied to
 * the uniform surface). The ONLY thing that differs between main and worker is the
 * per-frame `onTick` (see below), which is injected — everything else is pure.
 *
 * The p5 D-01 SHAPE (vs hydra's thunks): `sig.kick` is a live GETTER NUMBER and
 * `sig('bd')` returns the bus reading directly (carrying the spread DSP fields),
 * so a sketch reads `sig('bd').rms` / `sig('bd').fft[i]` as live numbers/arrays.
 * Every getter re-reads the bus fresh per access — frame-fresh through the draw's
 * `with (staveUniforms)`, never compile-captured (U2).
 *
 * `__tick` (non-enumerable) fires ONCE per draw frame:
 *   - MAIN: `onTick` runs profiler beats + `bus.tick(); refreshActive(now);
 *     readAudio()` (the renderer owns the bus, so the draw drives it).
 *   - WORKER: `onTick` is OMITTED → a no-op. The `WorkerBusFeed.applyFrame` ALREADY
 *     ran tick→refreshActive→readAudio once per frame (PK22); a second tick in the
 *     draw would DOUBLE-DECAY the envelope. So the worker draw reads an
 *     already-ticked bus. (B-3 cadence resolution: main rAF drives sample 1:1,
 *     worker applyFrame()s + redraw()s once per frame → no drift.)
 */

import type { SignalBus } from './SignalBus'
import type {
  StaveUniforms,
  SigAccessor,
  P5SignalReading,
} from '../p5Compiler'
import { getVizConfig } from '../vizConfig'

/**
 * Build the live uniform object from a bus.
 *
 * @param bus    the per-renderer (pure) SignalBus the getters read live.
 * @param onTick optional per-frame hook (MAIN: profiler + bus drive). OMIT in the
 *               worker — the feed drives the bus, so `__tick` becomes a no-op.
 */
export function buildStaveUniforms(
  bus: SignalBus,
  onTick?: () => void,
): StaveUniforms {
  // The single `sig` namespace (#351). Callable (D-03) — p5 shape returns live
  // NUMBERS (NOT thunks), read fresh on each access. `sig('bd')` / `sig.track(id)`
  // return the bus reading directly — it already carries the DSP fields
  // (`rms`/`bass`/`mid`/`treble` numbers + `fft`/`wave` arrays) spread from
  // `SignalReading`. The per-drum scalars + master DSP + LOD hang off the SAME
  // object, so one `with (staveUniforms)` exposes everything as `sig.*`.
  const sig = ((sound: string): P5SignalReading => bus.sound(sound)) as SigAccessor
  sig.track = (id: string): P5SignalReading => bus.track(id)
  // `tracks`/`sounds` getter-backed so they reflect live bus state every read.
  Object.defineProperty(sig, 'tracks', { get: () => bus.tracks, enumerable: true })
  Object.defineProperty(sig, 'sounds', { get: () => bus.sounds, enumerable: true })
  // Per-drum envelopes (were bare `uKick…uTom`) — live getter numbers, each
  // re-reads the bus fresh per access (frame-fresh through the draw, U2).
  const env = (key: string): PropertyDescriptor => ({
    get: () => bus.envValue(key),
    enumerable: true,
  })
  Object.defineProperty(sig, 'kick', env('uKick'))
  Object.defineProperty(sig, 'snare', env('uSnare'))
  Object.defineProperty(sig, 'hat', env('uHat'))
  Object.defineProperty(sig, 'openHat', env('uOpenHat'))
  Object.defineProperty(sig, 'clap', env('uClap'))
  Object.defineProperty(sig, 'rim', env('uRim'))
  Object.defineProperty(sig, 'tom', env('uTom'))
  // `sig.keyVelocity` is NOT a sound alias — the active event's velocity globally
  // (max over every sound seen this frame; 0 when nothing is active).
  Object.defineProperty(sig, 'keyVelocity', {
    get: () => {
      let max = 0
      for (const s of bus.sounds) {
        const v = bus.sound(s).velocity
        if (v > max) max = v
      }
      return max
    },
    enumerable: true,
  })
  // Master-mix DSP on `sig` itself (live getter numbers / arrays — each re-reads
  // `bus.master()` fresh, frame-fresh through the draw, never compile-captured).
  Object.defineProperty(sig, 'rms', { get: () => bus.master().rms, enumerable: true })
  Object.defineProperty(sig, 'bass', { get: () => bus.master().bass, enumerable: true })
  Object.defineProperty(sig, 'mid', { get: () => bus.master().mid, enumerable: true })
  Object.defineProperty(sig, 'treble', { get: () => bus.master().treble, enumerable: true })
  Object.defineProperty(sig, 'fft', { get: () => bus.master().fft, enumerable: true })
  Object.defineProperty(sig, 'wave', { get: () => bus.master().wave, enumerable: true })
  // Quality / LOD multiplier (#269) — NOT a bus signal but a live config read, so
  // a sketch reads the user's current "performance mode" per frame (worker: the
  // marshalled singleton, fed by the config channel). Mesh sketches scale segment
  // count by this; fill sketches ride render-resolution instead (#232).
  Object.defineProperty(sig, 'density', { get: () => getVizConfig().density, enumerable: true })

  // The uniform object exposes the single `sig` namespace bare via `with`.
  // `__tick` is a non-enumerable per-frame hook.
  const uniforms = { sig } as StaveUniforms

  // `__tick` non-enumerable so a `with (staveUniforms)` / for-in doesn't surface
  // it as a sketch identifier; the draw wrapper calls it explicitly once/frame.
  Object.defineProperty(uniforms, '__tick', {
    value: onTick ?? ((): void => {}),
    enumerable: false,
  })

  return uniforms
}
