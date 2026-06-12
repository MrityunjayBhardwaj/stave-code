/**
 * vizFlags — the SINGLE SOURCE OF TRUTH for the `stave.viz.*` localStorage knobs.
 *
 * These are developer / rollback flags (NOT user settings): each one A/B-toggles a
 * worker-viz perf lever from the browser console without a code change, e.g.
 * `localStorage.setItem('stave.viz.p5direct', '0')` then re-evaluate. They were
 * previously read with bare inline `localStorage.getItem(...)` calls spread across 5
 * sites in 2 packages, each re-implementing its own try/catch + default/parse logic
 * with subtle variance (#327). This module centralises the keys + the parse semantics
 * so there is ONE place to look them up and ONE definition of each default.
 *
 * THREE flag shapes:
 *   - default-ON  → enabled unless the value is exactly '0'  (p5direct, governor, pump)
 *   - opt-IN      → enabled only when the value is exactly '1' (pool)
 *   - tri-state / numeric → '1'|'0'→bool|null, or a finite positive number  (worker,
 *     maxFps, maxDpr — read app-side, applied as vizConfig overrides)
 *
 * Every reader is try/catch-safe (private mode / no-DOM → the documented default).
 *
 * INVENTORY of all `stave.viz.*` keys (this module owns reading them):
 *   stave.viz.worker    tri   force the OffscreenCanvas-worker renderer on('1')/off('0')
 *   stave.viz.p5direct  dON   p5 renders direct into the display canvas (#325 Tier A)
 *   stave.viz.pool      optIn warm worker-pool reuse (#263)
 *   stave.viz.governor  dON   adaptive-perf governor (also the "Adaptive performance" UI)
 *   stave.viz.pump      dON   per-tick shared sampler cache (PV72 dedup)
 *   stave.viz.maxFps    num   frames/sec cap override (e.g. '60'/'30')
 *   stave.viz.maxDpr    num   presenting/render dpr cap override (e.g. '1'/'1.5')
 *
 * NON-viz `stave.*` keys are intentionally NOT here — they belong to their own domains
 * and are single-site, not duplicated: `stave.debugger.*`, `stave.file.*`, `stave.play`,
 * `stave.stop`, `stave.strudel.tier.*`, `stave.u.*`, `stave.uClap`.
 */

/** The canonical key strings — the inventory consumers import instead of literals. */
export const VIZ_FLAG_KEYS = {
  worker: 'stave.viz.worker',
  p5direct: 'stave.viz.p5direct',
  pool: 'stave.viz.pool',
  governor: 'stave.viz.governor',
  pump: 'stave.viz.pump',
  maxFps: 'stave.viz.maxFps',
  maxDpr: 'stave.viz.maxDpr',
} as const

/** Raw, exception-safe read — `null` when localStorage is absent (worker / private
 *  mode / SSR) or the key is unset. Every reader below funnels through this so the
 *  try/catch + no-DOM default lives in exactly one place. */
function read(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** default-ON flag: enabled unless the value is exactly '0'. Absent → enabled. */
function enabledByDefault(key: string): boolean {
  return read(key) !== '0'
}

/** opt-IN flag: enabled only when the value is exactly '1'. Absent → disabled. */
function optIn(key: string): boolean {
  return read(key) === '1'
}

/** tri-state override: '1'→true, '0'→false, anything else (incl. absent) → null
 *  (= "no override, keep the config default"). */
function triState(key: string): boolean | null {
  const v = read(key)
  return v === '1' ? true : v === '0' ? false : null
}

/** numeric override: a finite, strictly-positive number, else null (no override).
 *  Mirrors `Number(getItem)` + `isFinite && > 0` — note `Number(null) === 0` → null. */
function numFlag(key: string): number | null {
  const n = Number(read(key))
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── named readers (the public API; one per flag, semantics fixed here) ──────────

/** #325 Tier A — p5 renders direct into the transferred display canvas. DEFAULT ON;
 *  `stave.viz.p5direct='0'` forces the old blit path. */
export function isP5DirectCanvasEnabled(): boolean {
  return enabledByDefault(VIZ_FLAG_KEYS.p5direct)
}

/** Adaptive-perf governor (PV91). DEFAULT ON; `stave.viz.governor='0'` disables. */
export function isVizGovernorEnabled(): boolean {
  return enabledByDefault(VIZ_FLAG_KEYS.governor)
}

/** Per-tick shared sampler cache (PV72 dedup). DEFAULT ON; `stave.viz.pump='0'` runs
 *  the pump WITHOUT the shared cache (every viz samples per-viz). */
export function isVizPumpSharedCacheEnabled(): boolean {
  return enabledByDefault(VIZ_FLAG_KEYS.pump)
}

/** Warm worker-pool reuse (#263). OPT-IN while validated; `stave.viz.pool='1'` enables. */
export function isVizWorkerPoolEnabled(): boolean {
  return optIn(VIZ_FLAG_KEYS.pool)
}

/** Force the worker renderer on('1')/off('0'); null = no override (keep the
 *  `vizConfig.workerRenderer` default). Read app-side in `registerVizWorker`. */
export function getVizWorkerOverride(): boolean | null {
  return triState(VIZ_FLAG_KEYS.worker)
}

/** frames/sec cap override (#261), or null for the config default. */
export function getVizMaxFpsOverride(): number | null {
  return numFlag(VIZ_FLAG_KEYS.maxFps)
}

/** presenting/render dpr cap override (#261), or null for the config default. */
export function getVizMaxDprOverride(): number | null {
  return numFlag(VIZ_FLAG_KEYS.maxDpr)
}
