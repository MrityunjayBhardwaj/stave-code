/**
 * vizGovernor — a GLOBAL GPU-budget governor for worker viz (the fix for the
 * "heavy GLSL viz make the editor scroll jank" bug, diagnosed 2026-06-09).
 *
 * ── Why this exists ──
 * Each `WorkerVizRenderer` already self-paces to ITS OWN worker draw rate via
 * backpressure (`MAX_FRAMES_IN_FLIGHT`, #261 / PV80). But N viz each pacing
 * INDEPENDENTLY still SUM to total GPU saturation: 5 heavy raymarchers (4 inline
 * `.viz()` + 1 backdrop) at quality HIGH × Retina DPR drove the COMPOSITOR to
 * ~95% dropped frames — and because the editor's scroll composites on the SAME
 * GPU, the whole UI dropped to ~6fps. The diagnosis proved this is GPU-bound, NOT
 * main-thread (the main thread was 74% IDLE during the stutter): the missing
 * piece is GLOBAL coordination of the TOTAL viz frame budget across the shared GPU.
 *
 * ── What it does ──
 * Two levers, both main-thread-only (it gates the produce loop; the existing
 * backpressure transitively paces the worker — so NO worker-protocol change):
 *
 *   1. ADAPTIVE FRAME-RATE — when the measured rAF cadence degrades (the GPU
 *      can't keep up), raise a per-viz minimum gap so each viz produces fewer
 *      frames/sec. Catches even a SINGLE heavy viz.
 *   2. CONCURRENCY CAP — round-robin which viz may produce on each animation
 *      frame, so N heavy viz don't all hit the GPU on the same frame. Spreads
 *      the load AND reduces each viz's rate by 1/period in one mechanism.
 *   3. RESOLUTION DROP — under SUSTAINED stress, shrink each viz's render
 *      backing store (the `WorkerVizRenderer` scales the `w,h` it posts in the
 *      worker `resize`; CSS size is unchanged → the smaller buffer is stretched
 *      to fill, aspect-preserved, PV76). This is the FILL-bound lever: a heavy
 *      raymarcher's cost is per-pixel, so halving the resolution ≈ quarters the
 *      fragment work — what the fps-throttle alone can't reach (it measured a
 *      ~80% compositor-drop tail at ocean-class N=5). It scales `w,h` rather than
 *      `dpr` because the GLSL + hydra worker `resizeKind` IGNORE dpr (they size
 *      the backing store to CSS px directly) — exactly the heavy GPU-bound kinds.
 *      Quantized to coarse steps so the (relatively expensive) backing-store
 *      reallocation fires only at thresholds, not every frame.
 *
 * All three scale with a `stress` signal (0 = smooth, 1 = badly janking) derived
 * from the actual rAF inter-frame interval — an ABSOLUTE floor, not variance (PV83b).
 *
 * ── Transparency guarantee ──
 * At `stress === 0` (the smooth common case — 1–2 light viz) the governor is a
 * total NO-OP: `mayProduce` always returns true and the per-viz gap is 0. So it
 * cannot regress the worker-reactivity gate (PV75) or any existing behaviour; it
 * only engages once frames are ACTUALLY dropping. Disable entirely with
 * `localStorage['stave.viz.governor'] = '0'` (A/B + escape hatch).
 *
 * REF: WorkerVizRenderer.start() produce loop (the single gate site), #261
 *      backpressure (PV80), PV83 (absolute-floor drop detection), the 2026-06-09
 *      scroll-jank diagnosis (viz-scroll-jank-ocean.spec.ts: 94.8% compositor drop).
 */

import { perf } from '../perf/profiler'
import { isVizGovernorEnabled } from './vizFlags'

// ── Tunables ──────────────────────────────────────────────────────────────
/** rAF interval at/below which we consider the frame healthy (≈50fps). Below
 *  this the editor still feels smooth; above it stress starts to ramp. */
const HEALTHY_MS = 20
/** rAF interval at/above which stress is maxed (≈22fps — clearly janky). */
const JANK_MS = 45
/** Hardest per-viz throttle: at stress 1 each viz is gapped to ≥ this fps. */
const MIN_FPS = 10
/** EMA smoothing for the interval estimate (higher = more reactive). */
const EMA_ALPHA = 0.25
/** Stress eases DOWN by at most this per frame (slow release = anti-oscillation);
 *  it jumps UP instantly to the target (react to jank fast). */
const STRESS_RAMP_DOWN = 0.012
/** A gap larger than this since the last observed frame = the loop was idle
 *  (paused / tab hidden); reset the EMA instead of spiking stress on resume. */
const IDLE_GAP_MS = 400
/** Hardest render-resolution downscale (lever 3): the backing store never shrinks
 *  below this fraction of CSS size. 0.5 = half-res (≈¼ the fragment work) — below
 *  that quality is unacceptable and the throttle + round-robin carry the rest. */
const RES_MIN_SCALE = 0.5
/** Stress below this leaves resolution at full (1.0). The fps-throttle handles
 *  mild jank cheaply; the resolution lever (an expensive backing-store realloc)
 *  only engages under SUSTAINED, higher stress. */
const RES_STRESS_ON = 0.5

// ── Pure helpers (exported for unit tests) ──────────────────────────────────

/** Map a smoothed rAF interval (ms) to a 0..1 stress level. */
export function computeStress(emaMs: number, healthy = HEALTHY_MS, jank = JANK_MS): number {
  if (emaMs <= healthy) return 0
  if (emaMs >= jank) return 1
  return (emaMs - healthy) / (jank - healthy)
}

/** Max viz allowed to PRODUCE on a single animation frame, given N active viz
 *  and the current stress. stress 0 → N (all); stress 1 → 1. */
export function maxPerFrame(n: number, stress: number): number {
  if (n <= 1) return 1
  return Math.max(1, Math.round(n * (1 - stress)))
}

/** Round-robin period: a viz produces once every `period` frames. stress 0 → 1
 *  (every frame); higher stress → larger period (lower rate + fewer concurrent). */
export function periodFor(n: number, stress: number): number {
  if (n <= 1) return 1
  return Math.max(1, Math.ceil(n / maxPerFrame(n, stress)))
}

/** Per-viz minimum gap (ms) between produced frames at the current stress. 0 when
 *  smooth (no extra throttle beyond the existing maxFps cap); up to 1000/MIN_FPS
 *  when fully stressed. This is what throttles a SINGLE heavy viz (period stays 1
 *  for n=1, so the gap is the only lever there). */
export function minGapMs(stress: number): number {
  if (stress <= 0) return 0
  return stress * (1000 / MIN_FPS)
}

/** Render-resolution scale (lever 3) for the current stress, in `[RES_MIN_SCALE, 1]`.
 *  Full (1) below `RES_STRESS_ON` (the cheap fps-throttle covers mild jank); above
 *  it, ramps DOWN to `RES_MIN_SCALE` at stress 1, QUANTIZED to 0.25 steps so the
 *  `WorkerVizRenderer` only reallocates the backing store at coarse thresholds
 *  (1.0 → 0.75 → 0.5) instead of every frame as stress micro-oscillates. */
export function resolutionScaleFor(stress: number): number {
  if (stress < RES_STRESS_ON) return 1
  const t = (stress - RES_STRESS_ON) / (1 - RES_STRESS_ON) // 0..1 across the active band
  const raw = 1 - t * (1 - RES_MIN_SCALE)
  return Math.max(RES_MIN_SCALE, Math.round(raw * 4) / 4) // quantize to 0.25 steps
}

// ── The governor singleton ──────────────────────────────────────────────────

class VizGovernor {
  private enabled = true
  /** Active (looping) renderer id → its stable round-robin offset. */
  private readonly registered = new Map<string, number>()
  private readonly lastProduce = new Map<string, number>()
  private nextOffset = 0

  private frameIndex = 0
  private lastObserveTs = 0
  private emaMs = HEALTHY_MS
  private stress = 0

  constructor() {
    // Escape hatch / A-B: localStorage['stave.viz.governor'] === '0' disables (vizFlags).
    this.enabled = isVizGovernorEnabled()
  }

  /** Register a renderer when its loop STARTS (resume/mount). Idempotent. */
  register(id: string): void {
    if (!this.registered.has(id)) this.registered.set(id, this.nextOffset++)
  }

  /** Unregister when the loop STOPS (pause/destroy). Resets stress when the last
   *  viz leaves so a fresh mount starts from a healthy baseline. */
  unregister(id: string): void {
    this.registered.delete(id)
    this.lastProduce.delete(id)
    if (this.registered.size === 0) {
      this.stress = 0
      this.emaMs = HEALTHY_MS
      this.lastObserveTs = 0
    }
  }

  /** Feed the cadence monitor — call once per rAF tick from EVERY active loop
   *  (idempotent per timestamp: only the first call for a new `ts` advances the
   *  frame + updates stress, so N renderers calling with the same ts is fine). */
  observeFrame(ts: number): void {
    if (!this.enabled || this.registered.size === 0) return
    if (this.lastObserveTs > 0 && ts > this.lastObserveTs) {
      const d = ts - this.lastObserveTs
      if (d > IDLE_GAP_MS) {
        this.emaMs = HEALTHY_MS // resumed from idle — don't spike stress
      } else {
        this.emaMs = this.emaMs * (1 - EMA_ALPHA) + d * EMA_ALPHA
      }
      const target = computeStress(this.emaMs)
      // Up instantly, down slowly (hysteresis → no rapid oscillation).
      this.stress = target > this.stress ? target : Math.max(target, this.stress - STRESS_RAMP_DOWN)
      this.frameIndex++
      perf.record('viz.governor.stress', Math.round(this.stress * 100))
    }
    if (ts > this.lastObserveTs) this.lastObserveTs = ts
  }

  /** Gate: may renderer `id` produce a frame at `ts`? Composed with (and called
   *  after) the renderer's own backpressure + maxFps checks. */
  mayProduce(id: string, ts: number): boolean {
    if (!this.enabled) return true
    const n = this.registered.size
    if (n === 0 || this.stress <= 0) return true // smooth → fully transparent

    // 1. Adaptive fps floor — throttles a single heavy viz AND caps each of many.
    const gap = minGapMs(this.stress)
    if (gap > 0) {
      const last = this.lastProduce.get(id) ?? 0
      if (last > 0 && ts - last < gap - 1) return false
    }
    // 2. Round-robin concurrency — spread N viz across frames (multi-viz only).
    if (n > 1) {
      const period = periodFor(n, this.stress)
      if (period > 1) {
        const offset = this.registered.get(id) ?? 0
        if ((this.frameIndex + offset) % period !== 0) return false
      }
    }
    this.lastProduce.set(id, ts)
    return true
  }

  /** Render-resolution scale (lever 3) the renderer should apply to its backing
   *  store at the current stress, in `[RES_MIN_SCALE, 1]`. 1 (full) when disabled
   *  or smooth — so a renderer multiplying its `resize` w,h by this is a total
   *  no-op in the common case (transparency, PV91). The `WorkerVizRenderer` reads
   *  this each rAF and re-posts a scaled `resize` only when the quantized step
   *  changes (the backing-store realloc is relatively expensive). */
  resolutionScale(): number {
    if (!this.enabled || this.stress <= 0) return 1
    return resolutionScaleFor(this.stress)
  }

  /** Observability / test hook. */
  state(): { enabled: boolean; n: number; stress: number; emaMs: number; frameIndex: number; resScale: number } {
    return { enabled: this.enabled, n: this.registered.size, stress: this.stress, emaMs: this.emaMs, frameIndex: this.frameIndex, resScale: this.resolutionScale() }
  }

  /** Live enable/disable (the "Adaptive performance" toggle, persisted via
   *  editorRegistry under the SAME `stave.viz.governor` key this reads at
   *  construction). Unlike `_setEnabledForTest` it KEEPS the registered renderers
   *  (live viz stay tracked) — it only flips the gate. Disabling resets stress so
   *  the levers release immediately: `mayProduce` returns true and
   *  `resolutionScale` returns 1, so each WorkerVizRenderer's next tick re-posts a
   *  full-resolution resize and stops being throttled. Re-enabling lets stress
   *  rebuild from the live rAF cadence via observeFrame. */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) {
      this.stress = 0
      this.emaMs = HEALTHY_MS
      this.lastObserveTs = 0
    }
  }

  /** Test helper — force enabled state (and reset) deterministically. */
  _setEnabledForTest(on: boolean): void {
    this.enabled = on
    this.registered.clear()
    this.lastProduce.clear()
    this.nextOffset = 0
    this.frameIndex = 0
    this.lastObserveTs = 0
    this.emaMs = HEALTHY_MS
    this.stress = 0
  }
}

export const vizGovernor = new VizGovernor()
