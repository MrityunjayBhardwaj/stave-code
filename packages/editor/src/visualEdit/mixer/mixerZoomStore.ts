/**
 * mixerZoomStore — the Mixer console's user zoom, GLOBAL and persisted (#759).
 *
 * The console renders every channel strip through CSS `zoom` (aspect-exact, and
 * — unlike `transform: scale` — it leaves the delta-based fader/pan drags
 * untouched; see the `zoom` prop doc on ChannelStrip). This store makes that a
 * live, user-controlled multiplier so the `[-] % [+]` bar can scale the whole
 * band. The applied face zoom is `CONSOLE_ZOOM × scale` — so `scale === 1`
 * (shown "100%") keeps the historical 1.5× look with no regression.
 *
 * Scope is GLOBAL, not per-file (unlike `expandStore`): zoom is a viewing
 * preference for the console surface, not document state — strip ids never enter
 * it, so there's nothing to isolate per file. One key, one number.
 *
 * Backed by a tiny external store + SSR-safe localStorage, mirroring
 * `expandStore`. The pure `clampMixerZoom` / `parseMixerZoom` boundaries are
 * unit-tested; the localStorage round-trip is covered by Playwright (jsdom's
 * localStorage stub is non-functional in the vitest env).
 */
import * as React from 'react'

const KEY = 'stave:mixer.zoom'

/** User scale shown as "100%". Applied face zoom is `CONSOLE_ZOOM × scale`. */
export const MIXER_ZOOM_DEFAULT = 1
export const MIXER_ZOOM_MIN = 0.5
export const MIXER_ZOOM_MAX = 2
/** additive per-click step (10%) — clean % readouts: 50, 60, … 100 … 200. */
export const MIXER_ZOOM_STEP = 0.1

/**
 * Clamp any candidate to `[MIN, MAX]`, snapping to 2 decimals so repeated
 * additive steps can't drift (1 + 0.1 + 0.1 → 1.2000000000000002). A non-finite
 * value (NaN, ±Infinity) degrades to the default rather than propagating — a
 * corrupt persisted value must never break the Mixer.
 */
export function clampMixerZoom(v: number): number {
  if (!Number.isFinite(v)) return MIXER_ZOOM_DEFAULT
  const clamped = Math.min(MIXER_ZOOM_MAX, Math.max(MIXER_ZOOM_MIN, v))
  return Math.round(clamped * 100) / 100
}

/**
 * Parse a persisted value into a scale. Pure (no I/O), so it unit-tests
 * directly: tolerates null/missing, non-JSON, and non-number blobs — anything
 * malformed degrades to the default rather than throwing.
 */
export function parseMixerZoom(raw: string | null): number {
  if (raw == null) return MIXER_ZOOM_DEFAULT
  try {
    const val: unknown = JSON.parse(raw)
    return typeof val === 'number' ? clampMixerZoom(val) : MIXER_ZOOM_DEFAULT
  } catch {
    return MIXER_ZOOM_DEFAULT
  }
}

/** SSR-safe Storage, or null (mirrors expandStore). */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    if (typeof window.localStorage?.getItem !== 'function') return null
    return window.localStorage
  } catch {
    return null
  }
}

// In-memory cache so `getSnapshot` is referentially stable (a number is a value
// type, so this is really a lazy-load latch: load from localStorage once, then
// serve the cached value until a set replaces it).
let cached: number | null = null
const listeners = new Set<() => void>()

function read(): number {
  if (cached == null) {
    const ls = safeLocalStorage()
    cached = ls ? parseMixerZoom(ls.getItem(KEY)) : MIXER_ZOOM_DEFAULT
  }
  return cached
}

function persist(v: number): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(KEY, JSON.stringify(v))
  } catch {
    /* quota / private mode — keep the in-memory value */
  }
}

/** Set the console zoom (clamped), persist, and notify subscribers. */
export function setMixerZoom(v: number): void {
  const next = clampMixerZoom(v)
  if (next === cached) return
  cached = next
  persist(next)
  listeners.forEach((l) => l())
}

/** Nudge the zoom by ±`MIXER_ZOOM_STEP` (clamped). */
export function nudgeMixerZoom(dir: 1 | -1): void {
  setMixerZoom(read() + dir * MIXER_ZOOM_STEP)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The console zoom + controls. Re-renders every subscriber (the toolbar readout
 * AND the strip band) when the zoom changes here or in another mounted copy.
 * `percent` is the user-facing readout; `zoomIn`/`zoomOut` bake in the step and
 * `canZoomIn`/`canZoomOut` gate the buttons at the clamp edges.
 */
export function useMixerZoom(): {
  zoom: number
  percent: number
  zoomIn: () => void
  zoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
} {
  const zoom = React.useSyncExternalStore(subscribe, read, () => MIXER_ZOOM_DEFAULT)
  return {
    zoom,
    percent: Math.round(zoom * 100),
    zoomIn: React.useCallback(() => nudgeMixerZoom(1), []),
    zoomOut: React.useCallback(() => nudgeMixerZoom(-1), []),
    canZoomIn: zoom < MIXER_ZOOM_MAX,
    canZoomOut: zoom > MIXER_ZOOM_MIN,
  }
}
