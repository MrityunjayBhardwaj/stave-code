import type { HydraPatternFn } from './HydraVizRenderer'

/**
 * Hydra shader presets for audio-reactive visualization.
 * Each preset is a function that receives the Hydra synth object
 * and sets up a shader pipeline. Audio bins (a.fft[0..3]) are
 * pumped from the engine's AnalyserNode by HydraVizRenderer.
 */

/** Scrolling frequency bands — Hydra's take on a pianoroll. */
export const hydraPianoroll: HydraPatternFn = (s) => {
  // Bass band — wide horizontal stripes, scrolling left
  s.osc(() => 10 + s.a.fft[0] * 50, -0.3, 0)
    .thresh(() => 0.3 + s.a.fft[0] * 0.5, 0.1)
    .color(0.46, 0.71, 1.0) // Stave accent blue
    .add(
      // Mid band — narrower stripes, scrolling right
      s.osc(() => 20 + s.a.fft[1] * 40, 0.2, 0)
        .rotate(Math.PI / 2)
        .thresh(() => 0.4 + s.a.fft[1] * 0.4, 0.08)
        .color(1.0, 0.79, 0.16), // Stave active yellow
      () => s.a.fft[1] * 0.8
    )
    .add(
      // High band — fine texture, subtle shimmer
      s.osc(() => 40 + s.a.fft[2] * 60, 0.1, 0)
        .thresh(() => 0.6 + s.a.fft[2] * 0.3, 0.05)
        .color(0.54, 0.36, 0.96), // purple accent
      () => s.a.fft[2] * 0.5
    )
    .modulate(s.noise(2, () => s.a.fft[3] * 0.4), () => s.a.fft[0] * 0.015)
    .scrollX(() => s.a.fft[0] * 0.02)
    .out()
}

/** Audio-reactive oscilloscope — smooth waveform with frequency modulation. */
export const hydraScope: HydraPatternFn = (s) => {
  s.osc(() => 20 + s.a.fft[0] * 80, 0.1, 0)
    .color(0.2, 0.8, 1.0)
    .rotate(() => s.a.fft[1] * 0.5)
    .modulate(s.osc(3, 0, 0), () => s.a.fft[2] * 0.1)
    .diff(s.osc(2, 0.1, 0).rotate(0.5))
    .out()
}

/** Kaleidoscope — mirrored fractal patterns driven by audio energy. */
export const hydraKaleidoscope: HydraPatternFn = (s) => {
  s.osc(6, 0.1, () => s.a.fft[0] * 3)
    .kaleid(() => 3 + Math.floor(s.a.fft[1] * 8))
    .color(
      () => 0.5 + s.a.fft[0] * 0.5,
      () => 0.3 + s.a.fft[1] * 0.7,
      () => 0.8 + s.a.fft[2] * 0.2
    )
    .rotate(() => s.a.fft[3] * 3.14)
    .modulate(s.noise(3), () => s.a.fft[0] * 0.05)
    .out()
}
