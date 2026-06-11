/**
 * profiler — a zero-cost-when-disabled runtime performance profiler.
 *
 * WHY (issue #228): we want to optimize viz smoothness / main-thread budget /
 * scheduler latency, but had NO instrumentation — optimizing on inference, not
 * observation. This module measures the real per-frame cost so the next
 * optimization is chosen from data (OBSERVE before optimize).
 *
 * ## What it measures
 *   - SECTIONS: named timed spans (`p5.bus`, `hydra.draw`, …) → ring-buffer of
 *     the last N durations with count / mean / p50 / p95 / p99 / max / last.
 *   - FRAMES: per-instance inter-frame interval → fps + dropped-frame count
 *     (a frame > 2× the running median interval counts as a drop).
 *   - COUNTERS: monotone or live counts (`viz.p5` live instances,
 *     `audio.triggers` cumulative) — rate is derived in the snapshot.
 *   - LONGTASKS: `PerformanceObserver({entryTypes:['longtask']})` — main-thread
 *     blocks > 50ms the platform reports, which is exactly scheduler-vs-viz
 *     contention.
 *
 * ## Cost when disabled
 * Every hot-path method early-returns on `!this._enabled` BEFORE any allocation
 * or `performance.now()` call — the cost is one boolean branch. `enabled` is a
 * field read, not a getter, so it's a plain load. Instrumentation can therefore
 * live on the per-frame path unconditionally.
 *
 * ## Purity boundary
 * The SignalBus stays PURE (P12 / PV65) — it does NOT import this module.
 * Renderers (which already import settings/p5/hydra) call the profiler and wrap
 * the bus calls. The profiler itself imports nothing app-specific.
 *
 * ## Enabling
 *   - `globalThis.__STAVE_PERF__ === true` at module load (e2e / automation), OR
 *   - `Profiler.setEnabled(true)` at runtime (the overlay toggle / a setting).
 * When in a browser, `window.__stavePerf` exposes snapshot/reset/setEnabled so a
 * Playwright run can flip it on, drive a patch, and read the numbers.
 */

/** How many recent samples each section/frame ring buffer retains. ~4s at
 *  60fps — enough for stable p95/p99 without unbounded growth. */
const RING = 240

/** A frame longer than this multiple of the running median interval counts as a
 *  dropped frame (a stutter), not just a slow-but-steady cadence. */
const DROP_FACTOR = 2

/** Absolute slow-frame threshold (ms): a frame interval above this is below 30fps.
 *  `drops` only catches VARIANCE (a frame ≫ the running median), so a uniformly
 *  slow cadence — every frame ~97ms (≈10fps) — reads ZERO drops because nothing
 *  exceeds 2× its own median. `slowFrames` is the absolute floor that catches
 *  that "steadily bad" case (the #230 / PV80 blind spot). 1000/30 ≈ 33.34ms. */
const SLOW_FRAME_MS = 1000 / 30

/** Monotonic time source. `performance.now()` where available (sub-ms, immune to
 *  wall-clock changes), else a 0 stub so a non-DOM import (unit collect) is safe. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0
}

/** Aggregated stats for one section over its ring buffer. */
export interface SectionStats {
  /** Total samples recorded since reset (NOT capped at RING). */
  count: number
  /** Mean of the retained ring (ms). */
  mean: number
  /** Median of the retained ring (ms). */
  p50: number
  /** 95th percentile of the retained ring (ms). */
  p95: number
  /** 99th percentile of the retained ring (ms). */
  p99: number
  /** Max of the retained ring (ms). */
  max: number
  /** Most recent sample (ms). */
  last: number
}

/** Per-instance frame stats. */
export interface FrameStats {
  /** Frames recorded since reset. */
  count: number
  /** Frames/sec from the median inter-frame interval (0 if < 2 frames). */
  fps: number
  /** Median inter-frame interval (ms). */
  p50: number
  /** 95th-percentile inter-frame interval (ms) — the stutter tail. */
  p95: number
  /** Frames whose interval exceeded DROP_FACTOR × running median (VARIANCE). */
  drops: number
  /** Frames whose interval exceeded SLOW_FRAME_MS (<30fps) — the ABSOLUTE floor.
   *  Catches a uniformly-slow cadence that `drops` misses (every frame equally
   *  slow ⇒ 0 drops but many slowFrames). */
  slowFrames: number
}

/** A full point-in-time read of the profiler. */
export interface PerfSnapshot {
  enabled: boolean
  /** ms since the profiler was first enabled / last reset. */
  uptimeMs: number
  sections: Record<string, SectionStats>
  frames: Record<string, FrameStats>
  /** Cumulative counters since reset (e.g. `audio.triggers`) — rate = value/uptime. */
  counters: Record<string, number>
  /** Live gauges — current state (e.g. `viz.p5` mounted instances). NOT cleared
   *  by reset(), because they represent what's live NOW, not accumulated samples. */
  gauges: Record<string, number>
  longtasks: { count: number; totalMs: number; maxMs: number }
}

/** A ring buffer of numbers with percentile/mean stats. Fixed capacity; oldest
 *  evicted on overflow. Percentiles sort a COPY (the hot path only pushes). */
class Ring {
  private readonly buf: number[] = []
  private head = 0
  /** Total pushed since reset (uncapped) — distinct from retained length. */
  total = 0

  push(v: number): void {
    if (this.buf.length < RING) this.buf.push(v)
    else this.buf[this.head] = v
    this.head = (this.head + 1) % RING
    this.total++
  }

  get last(): number {
    if (this.buf.length === 0) return 0
    const i = (this.head - 1 + RING) % RING
    return this.buf[i] ?? 0
  }

  /** Sorted copy of the retained samples (ascending). */
  private sorted(): number[] {
    return this.buf.slice().sort((a, b) => a - b)
  }

  stats(): SectionStats {
    const n = this.buf.length
    if (n === 0) {
      return { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0, last: 0 }
    }
    const s = this.sorted()
    let sum = 0
    for (const v of this.buf) sum += v
    return {
      count: this.total,
      mean: sum / n,
      p50: percentile(s, 0.5),
      p95: percentile(s, 0.95),
      p99: percentile(s, 0.99),
      max: s[n - 1],
      last: this.last,
    }
  }

  /** Median over the retained samples (for the drop-detection threshold). */
  median(): number {
    if (this.buf.length === 0) return 0
    return percentile(this.sorted(), 0.5)
  }
}

/** Nearest-rank percentile over an ASCENDING-sorted array. `q` in [0,1]. */
function percentile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length
  if (n === 0) return 0
  if (n === 1) return sortedAsc[0]
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))
  return sortedAsc[idx]
}

/** Per-instance frame tracker: timestamps each frame, derives interval stats. */
class FrameTracker {
  private readonly intervals = new Ring()
  private lastTs: number | null = null
  private dropCount = 0
  private slowCount = 0
  private frameCount = 0

  tick(ts: number): void {
    this.frameCount++
    if (this.lastTs != null) {
      const dt = ts - this.lastTs
      // Drop check uses the median BEFORE pushing this sample, so a single
      // huge frame doesn't move its own threshold.
      const med = this.intervals.median()
      if (med > 0 && dt > med * DROP_FACTOR) this.dropCount++
      // Absolute slow-frame check is median-independent — a uniformly slow
      // cadence trips this even though it never trips the variance-based drop.
      if (dt > SLOW_FRAME_MS) this.slowCount++
      this.intervals.push(dt)
    }
    this.lastTs = ts
  }

  stats(): FrameStats {
    const s = this.intervals.stats()
    return {
      count: this.frameCount,
      fps: s.p50 > 0 ? 1000 / s.p50 : 0,
      p50: s.p50,
      p95: s.p95,
      drops: this.dropCount,
      slowFrames: this.slowCount,
    }
  }
}

class Profiler {
  /** Plain field (not a getter) so the hot-path branch is a bare load. */
  private _enabled = false
  private startTs = 0
  private readonly sections = new Map<string, Ring>()
  private readonly frames = new Map<string, FrameTracker>()
  private readonly counters = new Map<string, number>()
  /** Live gauges (current-state counts) — survive reset(), unlike counters. */
  private readonly gauges = new Map<string, number>()
  /** Open spans for begin()/end() keyed by label — last-write-wins (a label
   *  isn't expected to nest with itself within a frame). */
  private readonly open = new Map<string, number>()
  private longtaskCount = 0
  private longtaskTotalMs = 0
  private longtaskMaxMs = 0
  private ltObserver: PerformanceObserver | null = null

  get enabled(): boolean {
    return this._enabled
  }

  /** Turn profiling on/off. Enabling (re)starts the longtask observer and
   *  stamps the uptime origin; disabling tears the observer down so a disabled
   *  profiler has no live platform hook. Idempotent. */
  setEnabled(on: boolean): void {
    if (on === this._enabled) return
    this._enabled = on
    if (on) {
      this.startTs = nowMs()
      this.startLongtaskObserver()
    } else {
      this.ltObserver?.disconnect()
      this.ltObserver = null
    }
  }

  private startLongtaskObserver(): void {
    if (this.ltObserver) return
    if (typeof PerformanceObserver === 'undefined') return
    try {
      this.ltObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longtaskCount++
          this.longtaskTotalMs += entry.duration
          if (entry.duration > this.longtaskMaxMs) this.longtaskMaxMs = entry.duration
        }
      })
      this.ltObserver.observe({ entryTypes: ['longtask'] })
    } catch {
      // longtask not supported (Firefox/Safari) — degrade silently; sections +
      // frames still work. Never throw from instrumentation.
      this.ltObserver = null
    }
  }

  // ── section timing ────────────────────────────────────────────────────────

  /** Record a section duration directly (ms). Cheap no-op when disabled. */
  record(name: string, ms: number): void {
    if (!this._enabled) return
    let ring = this.sections.get(name)
    if (!ring) {
      ring = new Ring()
      this.sections.set(name, ring)
    }
    ring.push(ms)
  }

  /** Open a span. Pair with `end(name)`. No-op when disabled. */
  begin(name: string): void {
    if (!this._enabled) return
    this.open.set(name, nowMs())
  }

  /** Close a span opened by `begin(name)` and record its duration. No-op when
   *  disabled or when no matching open span exists. */
  end(name: string): void {
    if (!this._enabled) return
    const t0 = this.open.get(name)
    if (t0 === undefined) return
    this.open.delete(name)
    this.record(name, nowMs() - t0)
  }

  /** Time a synchronous function and record it under `name`. Returns the fn's
   *  result. When disabled, calls the fn with no timing overhead. The fn runs
   *  even if disabled (it's the real work, not just measurement). */
  time<T>(name: string, fn: () => T): T {
    if (!this._enabled) return fn()
    const t0 = nowMs()
    try {
      return fn()
    } finally {
      this.record(name, nowMs() - t0)
    }
  }

  // ── frames ──────────────────────────────────────────────────────────────

  /** Record a rendered frame for an instance (e.g. `'p5#3'`). No-op when
   *  disabled. */
  frame(instanceId: string): void {
    if (!this._enabled) return
    let ft = this.frames.get(instanceId)
    if (!ft) {
      ft = new FrameTracker()
      this.frames.set(instanceId, ft)
    }
    ft.tick(nowMs())
  }

  /** Forget an instance's frame history (on renderer destroy) so a dead viz
   *  doesn't linger in the snapshot. No-op when disabled. */
  dropFrames(instanceId: string): void {
    if (!this._enabled) return
    this.frames.delete(instanceId)
  }

  // ── counters ──────────────────────────────────────────────────────────────

  /** Add to a CUMULATIVE counter (reset() clears it; rate = value/uptime). */
  inc(name: string, by = 1): void {
    if (!this._enabled) return
    this.counters.set(name, (this.counters.get(name) ?? 0) + by)
  }

  dec(name: string, by = 1): void {
    if (!this._enabled) return
    this.counters.set(name, (this.counters.get(name) ?? 0) - by)
  }

  /** Adjust a LIVE GAUGE (current-state count, e.g. mounted viz instances).
   *  Gauges survive reset() — they reflect what's live now, not samples.
   *  Use +1 on mount, -1 on destroy. */
  gauge(name: string, delta: number): void {
    if (!this._enabled) return
    this.gauges.set(name, (this.gauges.get(name) ?? 0) + delta)
  }

  // ── read / reset ────────────────────────────────────────────────────────

  snapshot(): PerfSnapshot {
    const sections: Record<string, SectionStats> = {}
    for (const [name, ring] of this.sections) sections[name] = ring.stats()
    const frames: Record<string, FrameStats> = {}
    for (const [id, ft] of this.frames) frames[id] = ft.stats()
    const counters: Record<string, number> = {}
    for (const [name, v] of this.counters) counters[name] = v
    const gauges: Record<string, number> = {}
    // Clamp ≥0 — a StrictMode construct→destroy (no mount) can dec a gauge below
    // its incs, and a profiler enabled AFTER a viz mounted misses the inc; neither
    // should surface a nonsensical negative live-count (#230 #3/#4). Cosmetic floor.
    for (const [name, v] of this.gauges) gauges[name] = Math.max(0, v)
    return {
      enabled: this._enabled,
      uptimeMs: this._enabled ? nowMs() - this.startTs : 0,
      sections,
      frames,
      counters,
      gauges,
      longtasks: {
        count: this.longtaskCount,
        totalMs: this.longtaskTotalMs,
        maxMs: this.longtaskMaxMs,
      },
    }
  }

  /** Clear all samples/counters but keep the enabled state + observer. Use to
   *  start a clean measurement window (e.g. before driving a heavy patch). */
  reset(): void {
    this.sections.clear()
    this.frames.clear()
    this.counters.clear()
    this.open.clear()
    this.longtaskCount = 0
    this.longtaskTotalMs = 0
    this.longtaskMaxMs = 0
    this.startTs = nowMs()
  }
}

/** The process-wide profiler singleton. Import and call directly:
 *  `perf.frame('hydra#1')`, `perf.time('hydra.draw', () => hydra.tick())`. */
export const perf = new Profiler()

// Auto-enable from a global set before load (e2e / automation) and expose a
// browser hook so a Playwright run can flip it on, drive a patch, and read
// numbers. Wrapped in try/catch — never let instrumentation break boot.
try {
  const g = globalThis as unknown as {
    __STAVE_PERF__?: boolean
    __stavePerf?: unknown
  }
  if (g.__STAVE_PERF__ === true) perf.setEnabled(true)
  g.__stavePerf = {
    snapshot: () => perf.snapshot(),
    reset: () => perf.reset(),
    setEnabled: (on: boolean) => perf.setEnabled(on),
  }
} catch {
  /* non-browser / locked global — fine */
}
