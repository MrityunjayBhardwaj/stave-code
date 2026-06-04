import type { HydraPatternFn } from './HydraVizRenderer'
import { compileHydraCode } from '../hydraCompiler'
import {
  HYDRA_PIANOROLL_CODE,
  HYDRA_SCOPE_CODE,
  HYDRA_KALEID_CODE,
} from './builtinHydraCode'

/**
 * Hydra shader presets for audio-reactive visualization — `HydraPatternFn`
 * closures (the public `@stave/editor` API; re-exported from index.ts).
 *
 * These are now DERIVED from the canonical code STRINGS in `builtinHydraCode.ts`
 * (B-5 #252): the strings are the single source of truth so the built-in hydra
 * descriptors can compile in a worker (a closure can't cross to one). Deriving
 * the closures from the same strings keeps the public API AND avoids the
 * picker-vs-source divergence the p5 path hit (PV56/#184). `compileHydraCode`
 * returns a `HydraPatternFn` that runs the string via `new Function('s','stave')`
 * — `s` = the hydra synth, `s.a.fft[0..3]` = the master audio bins.
 */

/** Scrolling frequency bands — hydra's take on a pianoroll. */
export const hydraPianoroll: HydraPatternFn = compileHydraCode(HYDRA_PIANOROLL_CODE)

/** Audio-reactive oscilloscope — smooth waveform with frequency modulation. */
export const hydraScope: HydraPatternFn = compileHydraCode(HYDRA_SCOPE_CODE)

/** Kaleidoscope — mirrored fractal patterns driven by audio energy. */
export const hydraKaleidoscope: HydraPatternFn = compileHydraCode(HYDRA_KALEID_CODE)
