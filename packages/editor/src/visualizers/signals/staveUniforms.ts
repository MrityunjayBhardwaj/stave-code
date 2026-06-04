/**
 * buildStaveUniforms — construct the live named-signal uniform object a p5 sketch
 * reads (`uKick…uTom`, `uKeyVelocity`, `uRms…uTreble`, the callable `u(...)`)
 * from a (pure) `SignalBus`.
 *
 * EXTRACTED from `P5VizRenderer`'s constructor (Phase B / B-3) so the MAIN
 * renderer and the WORKER renderer build IDENTICAL uniforms from their respective
 * buses. Single source of truth → a new bus signal can't be exposed on one side
 * and forgotten on the other (the PV54 additive-tag-floor obligation, applied to
 * the uniform surface). The ONLY thing that differs between main and worker is the
 * per-frame `onTick` (see below), which is injected — everything else is pure.
 *
 * The p5 D-01 SHAPE (vs hydra's thunks): bare `uKick` is a live GETTER NUMBER and
 * `u('bd')` returns the bus reading directly (carrying the spread DSP fields), so
 * a sketch reads `u('bd').rms` / `u('bd').fft[i]` as live numbers/arrays. Every
 * getter re-reads the bus fresh per access — frame-fresh through the draw's
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
  P5SignalAccessor,
  P5SignalReading,
} from '../p5Compiler'

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
  // The callable `u(...)` accessor (D-03) — p5 shape returns live NUMBERS
  // (NOT thunks), read fresh on each access. `u('bd')` / `u.track(id)` return the
  // bus reading directly — it already carries the DSP fields (`rms`/`bass`/`mid`/
  // `treble` numbers + `fft`/`wave` arrays) spread from `SignalReading`.
  const u = ((sound: string): P5SignalReading => bus.sound(sound)) as P5SignalAccessor
  u.track = (id: string): P5SignalReading => bus.track(id)
  // `tracks`/`sounds` getter-backed so they reflect live bus state every read.
  Object.defineProperty(u, 'tracks', { get: () => bus.tracks, enumerable: true })
  Object.defineProperty(u, 'sounds', { get: () => bus.sounds, enumerable: true })
  // Master-mix DSP on `u` itself (live getter numbers / arrays — each re-reads
  // `bus.master()` fresh, frame-fresh through the draw, never compile-captured).
  Object.defineProperty(u, 'rms', { get: () => bus.master().rms, enumerable: true })
  Object.defineProperty(u, 'bass', { get: () => bus.master().bass, enumerable: true })
  Object.defineProperty(u, 'mid', { get: () => bus.master().mid, enumerable: true })
  Object.defineProperty(u, 'treble', { get: () => bus.master().treble, enumerable: true })
  Object.defineProperty(u, 'fft', { get: () => bus.master().fft, enumerable: true })
  Object.defineProperty(u, 'wave', { get: () => bus.master().wave, enumerable: true })

  // The uniform object — bare `uKick…uTom` / `uKeyVelocity` are GETTERS
  // (D-01 p5 shape: live numbers). `__tick` is a non-enumerable per-frame hook.
  const uniforms = {
    get uKick(): number {
      return bus.envValue('uKick')
    },
    get uSnare(): number {
      return bus.envValue('uSnare')
    },
    get uHat(): number {
      return bus.envValue('uHat')
    },
    get uOpenHat(): number {
      return bus.envValue('uOpenHat')
    },
    get uClap(): number {
      return bus.envValue('uClap')
    },
    get uRim(): number {
      return bus.envValue('uRim')
    },
    get uTom(): number {
      return bus.envValue('uTom')
    },
    // `uKeyVelocity` is NOT a sound alias — the active event's velocity globally
    // (max over every sound seen this frame; 0 when nothing is active).
    get uKeyVelocity(): number {
      let max = 0
      for (const s of bus.sounds) {
        const v = bus.sound(s).velocity
        if (v > max) max = v
      }
      return max
    },
    // Master-mix DSP sugar (live getter numbers) — parity with `uKick`.
    get uRms(): number {
      return bus.master().rms
    },
    get uBass(): number {
      return bus.master().bass
    },
    get uMid(): number {
      return bus.master().mid
    },
    get uTreble(): number {
      return bus.master().treble
    },
    u,
  } as StaveUniforms

  // `__tick` non-enumerable so a `with (staveUniforms)` / for-in doesn't surface
  // it as a sketch identifier; the draw wrapper calls it explicitly once/frame.
  Object.defineProperty(uniforms, '__tick', {
    value: onTick ?? ((): void => {}),
    enumerable: false,
  })

  return uniforms
}
