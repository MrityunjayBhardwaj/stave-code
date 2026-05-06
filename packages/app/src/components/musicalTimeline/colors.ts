/**
 * colors — track-color fallback derived from a stable hash of the
 * track id. Used when an event carries no explicit `color` field.
 *
 * Stable per id; "bd" always returns the same hue. No theme integration
 * for slice β — slice β is read-only and per-track color is decorative;
 * a future polish phase may wire the inline-viz palette in.
 *
 * Phase 20-01 PR-B (T-02, DB-05).
 */

/**
 * String → 0-359 hash. Cheap, deterministic, no crypto needed.
 * djb2-ish accumulator with a degree-of-spread mod 360 at the end.
 */
function hashHue(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i) // h * 33 + c
    h |= 0 // force int32 to keep numbers bounded
  }
  // |h| % 360 — branch on sign to avoid negative modulo surprises.
  const positive = h < 0 ? -h : h
  return positive % 360
}

/**
 * Track id → HSL color string. Fixed saturation + lightness so all
 * tracks share visual weight; only hue varies.
 */
export function trackColorFromHash(trackId: string): string {
  const hue = hashHue(trackId)
  return `hsl(${hue}, 60%, 55%)`
}
