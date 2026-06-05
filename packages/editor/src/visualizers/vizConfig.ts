/**
 * Central configuration for the Stave visualization system.
 *
 * All tunable hyperparameters live here instead of being scattered across
 * renderers, sketches, and layout code. Import `VIZ_CONFIG` (or call
 * `createVizConfig()` with overrides) to read values at runtime.
 */

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface VizConfig {
  // ── Resolver ──────────────────────────────────────────────────────────
  /**
   * Renderer used when `.viz("mode")` has no explicit `:renderer` suffix.
   *
   * When a user writes `.viz("pianoroll")` and both `"pianoroll"` (p5) and
   * `"pianoroll:hydra"` exist, the resolver tries an exact match first.
   * If the exact bare id isn't registered, it appends `":${defaultRenderer}"`
   * and retries before falling back to the first prefix match.
   *
   * Set to `'p5'` for lightweight 2D canvas visuals (lower GPU),
   * or `'hydra'` for WebGL shader-based visuals (richer but heavier).
   */
  defaultRenderer: string

  /**
   * Phase B / B-3 feature flag (epic #228). When `true` AND the browser is
   * worker-capable (OffscreenCanvas + transferControlToOffscreen + a registered
   * worker factory), p5 vizzes render in an OffscreenCanvas Web Worker
   * (`WorkerVizRenderer`), moving `draw()` off the main thread so it stops
   * starving the audio scheduler. When `false` (DEFAULT until the matrix gate is
   * green), every p5 viz renders on the main thread (`P5VizRenderer`) — today's
   * behaviour, unchanged. The main-thread renderer is ALWAYS the fallback when a
   * browser can't offload, regardless of this flag.
   */
  workerRenderer: boolean

  // ── Worker renderer pacing / resolution (#261 follow-up) ───────────────
  /**
   * Frame-rate cap for worker-rendered viz (frames/sec). The main sampler rAF
   * fires at the display rate (e.g. 120fps on ProMotion); a music viz gains
   * nothing above ~60fps, so producing every display frame just doubles the
   * blit/composite/sample work for no perceptual benefit. The `WorkerVizRenderer`
   * production loop skips frames to hold at most this rate (composed with the
   * #261 in-flight backpressure). 0 / non-positive = uncapped (display rate).
   */
  maxFps: number

  /**
   * Cap on the device-pixel-ratio worker viz render + present at. The presenting
   * canvas backing store is `cssSize × dpr` and is composited every frame — cost
   * scales with dpr². The worker p5 sketch already renders at 1× (the worker DOM
   * shim reports `devicePixelRatio = 1`), so presenting into a 2× canvas upscales
   * a 1× image for nothing. Capping at 1 makes present match render (quality-
   * neutral, ~4× cheaper composite on a 2× display); raise toward 2 for crisper
   * viz at higher composite cost. Effective dpr = `min(devicePixelRatio, maxDpr)`.
   */
  maxDpr: number

  // ── Inline View Zones ─────────────────────────────────────────────────
  /** Height in pixels of each inline viz zone rendered below a pattern block. */
  inlineZoneHeight: number

  // ── Audio Analysis ────────────────────────────────────────────────────
  /**
   * FFT window size for the Web Audio AnalyserNode.
   * Must be a power of 2 between 32 and 32768.
   * Larger = better frequency resolution, worse time resolution.
   * 2048 is a good balance for music visualization.
   */
  fftSize: number

  /**
   * Smoothing factor for the AnalyserNode (0.0–1.0).
   * 0 = no smoothing (jittery), 1 = fully smoothed (sluggish).
   * 0.8 gives responsive-but-stable frequency data.
   */
  smoothingTimeConstant: number

  // ── Hydra Renderer ────────────────────────────────────────────────────
  /**
   * Number of frequency bins Hydra's audio object uses.
   * Hydra's `a.fft[]` array will have this many entries, each
   * representing average energy in an equal-width frequency band.
   * 4 bins = bass / low-mid / high-mid / treble.
   */
  hydraAudioBins: number

  /**
   * Whether hydra-synth runs its own requestAnimationFrame loop.
   * true  = Hydra renders every frame (default, smoothest).
   * false = caller must tick Hydra manually (advanced use).
   */
  hydraAutoLoop: boolean

  // ── Pianoroll ─────────────────────────────────────────────────────────
  /** Total seconds visible in the pianoroll rolling window. */
  pianorollWindowSeconds: number

  /** Number of pattern cycles visible in the pianoroll. */
  pianorollCycles: number

  /** Playhead position as a 0..1 fraction of the canvas width. */
  pianorollPlayhead: number

  /** Lowest MIDI note shown on the pianoroll Y-axis. */
  pianorollMidiMin: number

  /** Highest MIDI note shown on the pianoroll Y-axis. */
  pianorollMidiMax: number

  // ── Scope / FScope ────────────────────────────────────────────────────
  /** Seconds visible in the event-driven scope fallback mode. */
  scopeWindowSeconds: number

  /** Vertical amplitude scale for scope/fscope waveforms (0..1). */
  scopeAmplitudeScale: number

  /** Waveform baseline position as a fraction of canvas height (0=top, 1=bottom). */
  scopeBaseline: number

  // ── Spectrum ──────────────────────────────────────────────────────────
  /** Minimum dB floor for spectrum normalization. */
  spectrumMinDb: number

  /** Maximum dB ceiling for spectrum normalization. */
  spectrumMaxDb: number

  /** Scroll speed in pixels per frame for waterfall spectrum. */
  spectrumScrollSpeed: number

  // ── Colors ────────────────────────────────────────────────────────────
  /** Shared background color for all p5 sketch canvases. */
  backgroundColor: string

  /** Primary accent color for waveforms, bars, and inactive notes. */
  accentColor: string

  /** Color for actively playing notes / highlights. */
  activeColor: string

  /** Playhead line color (semi-transparent works best). */
  playheadColor: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_VIZ_CONFIG: Readonly<VizConfig> = {
  // Resolver
  defaultRenderer: 'p5',

  // Phase B / B-3 — OffscreenCanvas-worker rendering. ON: the matrix gate is GREEN
  // (#245 — trig/s holds 8.4 regardless of viz load, was collapsing to 2.9; main
  // longtasks 0, was up to 251ms). The main-thread P5VizRenderer stays the
  // automatic fallback when a browser can't offload (no OffscreenCanvas /
  // transferControlToOffscreen / worker factory). Opt OUT per project via
  // localStorage['stave.viz.worker'] = '0'.
  workerRenderer: true,

  // Worker pacing / resolution (#261 follow-up). 60fps is the perceptual ceiling
  // for music viz; maxDpr 1 makes the presenting canvas match the worker's actual
  // 1× render (quality-neutral, ~4× cheaper composite on retina than the prior
  // upscale-to-2× behaviour). Both are zero-rewrite levers against the blit/
  // composite wall measured for multi-instance inline viz.
  maxFps: 60,
  maxDpr: 1,

  // Inline view zones
  inlineZoneHeight: 150,

  // Audio analysis
  fftSize: 2048,
  smoothingTimeConstant: 0.8,

  // Hydra
  hydraAudioBins: 4,
  hydraAutoLoop: true,

  // Pianoroll
  pianorollWindowSeconds: 6,
  pianorollCycles: 4,
  pianorollPlayhead: 0.5,
  pianorollMidiMin: 24,
  pianorollMidiMax: 96,

  // Scope / FScope
  scopeWindowSeconds: 4,
  scopeAmplitudeScale: 0.25,
  scopeBaseline: 0.75,

  // Spectrum
  spectrumMinDb: -80,
  spectrumMaxDb: 0,
  spectrumScrollSpeed: 2,

  // Colors
  backgroundColor: '#090912',
  accentColor: '#75baff',
  activeColor: '#FFCA28',
  playheadColor: 'rgba(255,255,255,0.5)',
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a VizConfig by merging overrides onto defaults.
 *
 * ```ts
 * const config = createVizConfig({ defaultRenderer: 'hydra', hydraAudioBins: 8 })
 * ```
 */
export function createVizConfig(overrides?: Partial<VizConfig>): VizConfig {
  return { ...DEFAULT_VIZ_CONFIG, ...overrides }
}

// ---------------------------------------------------------------------------
// Singleton — used by all internal consumers. Override via setVizConfig().
// ---------------------------------------------------------------------------

let _active: VizConfig = { ...DEFAULT_VIZ_CONFIG }

/** Returns the active viz configuration. */
export function getVizConfig(): Readonly<VizConfig> {
  return _active
}

/**
 * Replaces the active viz configuration.
 * Call early (before any engine.init / editor mount) for consistent behavior.
 */
export function setVizConfig(config: Partial<VizConfig>): void {
  _active = { ...DEFAULT_VIZ_CONFIG, ...config }
}
