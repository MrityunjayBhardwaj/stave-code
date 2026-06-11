/**
 * glslEvents — read the named-signal bus into the GLSL event-uniform struct (#284).
 * This is the ONE place pattern events become shader uniforms; it's called once
 * per frame by BOTH the worker (`mountGLSL`, reading `feed.bus`) and the main
 * thread (`GLSLVizRenderer`, reading its own bus) — the SAME bus-read API that
 * `hydraStaveBag`/`buildStaveUniforms` use for hydra/p5 (so a kick is a kick in
 * every engine).
 *
 * The bus must be TICKED for this frame before calling (worker: `feed.applyFrame`;
 * main: `bus.tick()` + `refreshActive()` + `readAudio()`), exactly like the
 * hydra/p5 paths — this only READS.
 *
 * REF: glslCore.ts (GLSLEvents shape), hydraStaveBag.ts (the same bus reads),
 *      SignalBus.ts (envValue/master/sound/sounds), architecture/renderer-contract.
 */
import type { SignalBus } from '../signals/SignalBus'
import { type GLSLEvents, type GLSLTracks, MAX_GLSL_TRACKS, GLSL_TRACK_FIELDS } from './glslCore'

/** Snapshot the per-drum envelope levels + master DSP from `bus` as GLSL uniforms.
 *  `uVelocity` is the loudest active sound's velocity (a global "something hit"). */
export function readGLSLEvents(bus: SignalBus): GLSLEvents {
  const m = bus.master()
  let vel = 0
  for (const s of bus.sounds) {
    const v = bus.sound(s).velocity
    if (v > vel) vel = v
  }
  return {
    uKick: bus.envValue('uKick'),
    uSnare: bus.envValue('uSnare'),
    uHat: bus.envValue('uHat'),
    uOpenHat: bus.envValue('uOpenHat'),
    uClap: bus.envValue('uClap'),
    uRim: bus.envValue('uRim'),
    uTom: bus.envValue('uTom'),
    uVelocity: vel,
    uRms: m.rms,
    uBass: m.bass,
    uMid: m.mid,
    uTreble: m.treble,
  }
}

/**
 * Snapshot the PER-TRACK signals (#297) from `bus` for the GLSL `staveTrack(i)`
 * uniforms — the GLSL analog of p5/hydra's `u.track(id)` / `u.tracks`. Reads
 * `bus.tracks` (stable SCHEDULER-key-space order, capped at `MAX_GLSL_TRACKS`) and,
 * per track, `bus.track(key)`'s scalar half. Packed two-vec3-per-track so the core
 * sets two `vec3[]` uniforms: `a = (env, velocity, rms)`, `b = (bass, mid, treble)`.
 * Field order MUST match `GLSL_TRACK_FIELDS` + the `StaveTrack` struct.
 *
 * The bus must be TICKED for this frame before calling (same precondition as
 * `readGLSLEvents`) — this only READS. The same bus reads identically on the main
 * thread (`GLSLVizRenderer`) and in the worker (`mountGLSL`, off `WorkerBusFeed`),
 * so per-track GLSL reactivity is engine-path-agnostic.
 */
export function readGLSLTracks(bus: SignalBus): GLSLTracks {
  const keys = bus.tracks
  const count = Math.min(keys.length, MAX_GLSL_TRACKS)
  const a = new Float32Array(MAX_GLSL_TRACKS * 3)
  const b = new Float32Array(MAX_GLSL_TRACKS * 3)
  for (let i = 0; i < count; i++) {
    const t = bus.track(keys[i])
    // GLSL_TRACK_FIELDS is the single source of field order: 0..2 → vec3 `a`
    // (env/velocity/rms), 3..5 → vec3 `b` (bass/mid/treble), matching the
    // `StaveTrack` struct + the `uTrackA`/`uTrackB` uniforms.
    for (let f = 0; f < GLSL_TRACK_FIELDS.length; f++) {
      const value = t[GLSL_TRACK_FIELDS[f]]
      const target = f < 3 ? a : b
      target[i * 3 + (f % 3)] = value
    }
  }
  return { count, a, b }
}
