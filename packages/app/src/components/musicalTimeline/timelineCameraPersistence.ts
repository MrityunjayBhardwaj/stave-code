/**
 * Timeline camera persistence (#501/U4).
 *
 * The Song timeline's camera is two pieces of view state the user adjusts and
 * expects to survive a reload: the horizontal ZOOM multiplier (#412) and the
 * set of EXPANDED lanes (#422, the accordion note-detail rows). This module is
 * the pure localStorage IO for both — no React, no clamping, no validation of
 * meaning, so it stays trivially unit-testable.
 *
 * Scope = GLOBAL (one key, not per-project). The timeline tab is registered
 * once for the app's lifetime and never re-mounts on a project switch
 * (StaveApp DA-05), so a per-project key would need reactive re-hydration
 * through that single-registration boundary. Global degrades gracefully
 * instead: a restored zoom is a harmless viewport preference, and restored
 * expanded lane keys that don't exist in the new song are filtered out by the
 * layout (computeLaneLayout only expands lanes present in the scene). Per-
 * project isolation is a clean follow-up, not a correctness requirement here.
 *
 * Best-effort throughout: any storage failure (quota, privacy mode, SSR) falls
 * back to empty so the timeline still renders with its defaults.
 */

const STORAGE_KEY = 'stave:timelineCamera'

/** The persisted shape. `zoom` is the raw multiplier (the caller clamps it to
 *  the live MIN/MAX range on read); `expanded` is the lane-key list. */
export interface TimelineCamera {
  readonly zoom: number
  readonly expanded: readonly string[]
}

/**
 * Read the persisted camera, or `null` when nothing valid is stored. Returns a
 * sanitized object: `zoom` is a finite number or omitted, `expanded` is always
 * a string array (possibly empty). Never throws.
 */
export function loadTimelineCamera(): TimelineCamera | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TimelineCamera>
    const zoom =
      typeof parsed.zoom === 'number' && Number.isFinite(parsed.zoom)
        ? parsed.zoom
        : Number.NaN
    const expanded = Array.isArray(parsed.expanded)
      ? parsed.expanded.filter((k): k is string => typeof k === 'string')
      : []
    return { zoom, expanded }
  } catch {
    return null
  }
}

/**
 * Write the camera. Best-effort: swallows quota/privacy errors so a failed
 * persist never breaks the render path.
 */
export function saveTimelineCamera(camera: TimelineCamera): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ zoom: camera.zoom, expanded: [...camera.expanded] }),
    )
  } catch {
    /* best-effort persistence */
  }
}
