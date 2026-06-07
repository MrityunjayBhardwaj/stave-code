/**
 * Central configuration for the Stave visualization system.
 *
 * All tunable hyperparameters live here instead of being scattered across
 * renderers, sketches, and layout code. Import `VIZ_CONFIG` (or call
 * `createVizConfig()` with overrides) to read values at runtime.
 */
interface VizConfig {
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
    defaultRenderer: string;
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
    workerRenderer: boolean;
    /**
     * Frame-rate cap for worker-rendered viz (frames/sec). The main sampler rAF
     * fires at the display rate (e.g. 120fps on ProMotion); a music viz gains
     * nothing above ~60fps, so producing every display frame just doubles the
     * blit/composite/sample work for no perceptual benefit. The `WorkerVizRenderer`
     * production loop skips frames to hold at most this rate (composed with the
     * #261 in-flight backpressure). 0 / non-positive = uncapped (display rate).
     */
    maxFps: number;
    /**
     * Cap on the device-pixel-ratio worker viz render + present at. The presenting
     * canvas backing store is `cssSize × dpr` and is composited every frame — cost
     * scales with dpr². The worker p5 sketch already renders at 1× (the worker DOM
     * shim reports `devicePixelRatio = 1`), so presenting into a 2× canvas upscales
     * a 1× image for nothing. Capping at 1 makes present match render (quality-
     * neutral, ~4× cheaper composite on a 2× display); raise toward 2 for crisper
     * viz at higher composite cost. Effective dpr = `min(devicePixelRatio, maxDpr)`.
     */
    maxDpr: number;
    /**
     * Sketch-facing level-of-detail multiplier in `(0, 1]`. `1` = full detail
     * (default). Lower values ask the SKETCH to DECIMATE its per-frame work —
     * primarily segment / history COUNT for CPU-tessellation-bound line meshes,
     * the class a resolution drop does NOT help (#232: canvas 600→150px at
     * constant segments = no change). Exposed to sketches as `u.density`
     * (staveUniforms) so a heavy sketch can scale its geometry, and marshalled
     * into the worker via the config channel (the worker reads its OWN vizConfig
     * singleton — P105 / #253). Fill/fragment-bound sketches (hydra, shaders,
     * large filled regions) gain nothing from `density` and instead ride the
     * resolution/dpr knobs the renderer applies composite-side; that is how a
     * single "performance mode" helps both sketch classes (#232).
     */
    density: number;
    /** Height in pixels of each inline viz zone rendered below a pattern block. */
    inlineZoneHeight: number;
    /**
     * FFT window size for the Web Audio AnalyserNode.
     * Must be a power of 2 between 32 and 32768.
     * Larger = better frequency resolution, worse time resolution.
     * 2048 is a good balance for music visualization.
     */
    fftSize: number;
    /**
     * Smoothing factor for the AnalyserNode (0.0–1.0).
     * 0 = no smoothing (jittery), 1 = fully smoothed (sluggish).
     * 0.8 gives responsive-but-stable frequency data.
     */
    smoothingTimeConstant: number;
    /**
     * Number of frequency bins Hydra's audio object uses.
     * Hydra's `a.fft[]` array will have this many entries, each
     * representing average energy in an equal-width frequency band.
     * 4 bins = bass / low-mid / high-mid / treble.
     */
    hydraAudioBins: number;
    /**
     * Whether hydra-synth runs its own requestAnimationFrame loop.
     * true  = Hydra renders every frame (default, smoothest).
     * false = caller must tick Hydra manually (advanced use).
     */
    hydraAutoLoop: boolean;
    /** Total seconds visible in the pianoroll rolling window. */
    pianorollWindowSeconds: number;
    /** Number of pattern cycles visible in the pianoroll. */
    pianorollCycles: number;
    /** Playhead position as a 0..1 fraction of the canvas width. */
    pianorollPlayhead: number;
    /** Lowest MIDI note shown on the pianoroll Y-axis. */
    pianorollMidiMin: number;
    /** Highest MIDI note shown on the pianoroll Y-axis. */
    pianorollMidiMax: number;
    /** Seconds visible in the event-driven scope fallback mode. */
    scopeWindowSeconds: number;
    /** Vertical amplitude scale for scope/fscope waveforms (0..1). */
    scopeAmplitudeScale: number;
    /** Waveform baseline position as a fraction of canvas height (0=top, 1=bottom). */
    scopeBaseline: number;
    /** Minimum dB floor for spectrum normalization. */
    spectrumMinDb: number;
    /** Maximum dB ceiling for spectrum normalization. */
    spectrumMaxDb: number;
    /** Scroll speed in pixels per frame for waterfall spectrum. */
    spectrumScrollSpeed: number;
    /** Shared background color for all p5 sketch canvases. */
    backgroundColor: string;
    /** Primary accent color for waveforms, bars, and inactive notes. */
    accentColor: string;
    /** Color for actively playing notes / highlights. */
    activeColor: string;
    /** Playhead line color (semi-transparent works best). */
    playheadColor: string;
}
declare const DEFAULT_VIZ_CONFIG: Readonly<VizConfig>;
/**
 * Creates a VizConfig by merging overrides onto defaults.
 *
 * ```ts
 * const config = createVizConfig({ defaultRenderer: 'hydra', hydraAudioBins: 8 })
 * ```
 */
declare function createVizConfig(overrides?: Partial<VizConfig>): VizConfig;
/**
 * Discrete viz quality level. The user picks one ("performance mode"); it maps
 * to the two knobs that scale per sketch class (`deriveVizQuality`).
 */
type VizQualityLevel = 'high' | 'balanced' | 'performance';
/** The default quality level — `balanced` reproduces today's behaviour exactly. */
declare const DEFAULT_VIZ_QUALITY: VizQualityLevel;
/** The two knobs a quality level scales. */
interface VizQualitySettings {
    /** Inline-viz render backing-store HEIGHT (px) — composite/fill cost (main-side). */
    resolution: number;
    /** Sketch LOD multiplier in `(0, 1]` — segment/history count (worker-side, `u.density`). */
    density: number;
}
/**
 * Map a quality level to the two knobs it scales.
 *
 * A single "performance mode" drops BOTH resolution AND density because the
 * WINNING lever differs by sketch class (#232): resolution helps fill/fragment/
 * hydra; density helps CPU-tessellation line meshes. Each sketch benefits from
 * whichever applies, and both move together with the level.
 *
 * `balanced` is the default and maps to today's values (resolution 512, density
 * 1) so existing projects render identically until the user opts into a level.
 * `resolution` mirrors the editorRegistry inline-viz-resolution presets.
 */
declare function deriveVizQuality(level: VizQualityLevel): VizQualitySettings;
/** Returns the active viz configuration. */
declare function getVizConfig(): Readonly<VizConfig>;
/**
 * Replaces the active viz configuration.
 * Call early (before any engine.init / editor mount) for consistent behavior.
 * Unspecified fields RESET to defaults (see `updateVizConfig` to merge instead).
 */
declare function setVizConfig(config: Partial<VizConfig>): void;
/**
 * MERGES a partial patch onto the ACTIVE config — unlike `setVizConfig`, which
 * resets unspecified fields to defaults. Used by the worker config-marshal
 * channel (#269): an incremental `{ density }` patch must NOT wipe a prior
 * `hydraAudioBins`. Notifies listeners so the marshal channel can re-ship.
 */
declare function updateVizConfig(patch: Partial<VizConfig>): void;
/**
 * The ONLY vizConfig fields the WORKER bundle reads. The worker has its own
 * `vizConfig` singleton (it's a separate bundle — P105) that otherwise stays at
 * `DEFAULT_VIZ_CONFIG`; these are marshalled across the thread boundary so the
 * worker sketch sees the user's effective settings:
 *   - `hydraAudioBins` — hydra fft bin count (hostP5Worker; closes #253)
 *   - `density`        — the `u.density` LOD multiplier (staveUniforms)
 * `maxFps`/`maxDpr` are deliberately EXCLUDED: the main `WorkerVizRenderer` paces
 * frame production and sizes the presenting canvas, so the worker never reads
 * them. Adding a key here is the one place to extend what crosses the boundary.
 */
declare const WORKER_VIZ_CONFIG_KEYS: readonly ["hydraAudioBins", "density"];
type WorkerVizConfig = Pick<VizConfig, (typeof WORKER_VIZ_CONFIG_KEYS)[number]>;

export { DEFAULT_VIZ_CONFIG as D, type VizQualityLevel as V, type WorkerVizConfig as W, DEFAULT_VIZ_QUALITY as a, type VizConfig as b, type VizQualitySettings as c, createVizConfig as d, deriveVizQuality as e, getVizConfig as g, setVizConfig as s, updateVizConfig as u };
