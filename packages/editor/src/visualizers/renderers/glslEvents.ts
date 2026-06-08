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
import type { GLSLEvents } from './glslCore'

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
