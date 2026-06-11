/**
 * Built-in hydra sketches as CODE STRINGS (Phase B / B-5 follow-up #252) — the
 * SINGLE source of truth for the built-in hydra presets, mirroring how the p5
 * built-ins live as `*_P5_CODE` strings in `builtinP5Code.ts`.
 *
 * Why strings (not the closures they replace): a `HydraPatternFn` closure can't
 * cross to a Web Worker, so the built-in hydra descriptors used to be pinned to
 * the main thread — and a heavy hydra backdrop on the main thread WRECKS the
 * editor UI frame rate even though it doesn't starve audio (hydra is GPU-bound;
 * measured: hydra-4 main-thread = 24fps / 75ms frames / 15 longtasks, vs worker =
 * 120fps / 9ms / 0 — see PV69 addendum). As strings they compile in-worker via
 * `compileHydraCode`, so `makeHydraRenderer` offloads them like the user `.hydra`
 * path. The public `hydraPresets.ts` closures are now DERIVED from these strings
 * (one source of truth → no divergence, the PV56/#184 lesson).
 *
 * Each runs as `new Function('s', 'stave', code)` — `s` = the hydra synth,
 * `s.a.fft[]` = the master-mix bins. Audio-reactive thunks (`() => …`) are
 * evaluated by hydra per frame.
 *
 * REF: builtinP5Code.ts (the p5 analog), hydraCompiler.compileHydraCode,
 *      makeHydraRenderer, PV69 (the UI-jank contention axis), PV73, #252.
 */

/** The default hydra sketch (was `HydraVizRenderer.defaultPattern`). */
export const HYDRA_DEFAULT_CODE = `s.osc(10, 0.1, () => s.a.fft[0] * 4)
  .color(1.0, 0.5, () => s.a.fft[1] * 2)
  .rotate(() => s.a.fft[2] * 6.28)
  .modulate(s.noise(3, () => s.a.fft[3] * 0.5), 0.02)
  .out()`

/** Scrolling frequency bands — hydra's take on a pianoroll. */
export const HYDRA_PIANOROLL_CODE = `s.osc(() => 10 + s.a.fft[0] * 50, -0.3, 0)
  .thresh(() => 0.3 + s.a.fft[0] * 0.5, 0.1)
  .color(0.46, 0.71, 1.0)
  .add(
    s.osc(() => 20 + s.a.fft[1] * 40, 0.2, 0)
      .rotate(Math.PI / 2)
      .thresh(() => 0.4 + s.a.fft[1] * 0.4, 0.08)
      .color(1.0, 0.79, 0.16),
    () => s.a.fft[1] * 0.8
  )
  .add(
    s.osc(() => 40 + s.a.fft[2] * 60, 0.1, 0)
      .thresh(() => 0.6 + s.a.fft[2] * 0.3, 0.05)
      .color(0.54, 0.36, 0.96),
    () => s.a.fft[2] * 0.5
  )
  .modulate(s.noise(2, () => s.a.fft[3] * 0.4), () => s.a.fft[0] * 0.015)
  .scrollX(() => s.a.fft[0] * 0.02)
  .out()`

/** Audio-reactive oscilloscope — smooth waveform with frequency modulation. */
export const HYDRA_SCOPE_CODE = `s.osc(() => 20 + s.a.fft[0] * 80, 0.1, 0)
  .color(0.2, 0.8, 1.0)
  .rotate(() => s.a.fft[1] * 0.5)
  .modulate(s.osc(3, 0, 0), () => s.a.fft[2] * 0.1)
  .diff(s.osc(2, 0.1, 0).rotate(0.5))
  .out()`

/** Kaleidoscope — mirrored fractal patterns driven by audio energy. */
export const HYDRA_KALEID_CODE = `s.osc(6, 0.1, () => s.a.fft[0] * 3)
  .kaleid(() => 3 + Math.floor(s.a.fft[1] * 8))
  .color(
    () => 0.5 + s.a.fft[0] * 0.5,
    () => 0.3 + s.a.fft[1] * 0.7,
    () => 0.8 + s.a.fft[2] * 0.2
  )
  .rotate(() => s.a.fft[3] * 3.14)
  .modulate(s.noise(3), () => s.a.fft[0] * 0.05)
  .out()`
