/**
 * colors — stem-aware track-color fallback (Phase 20-02 DV-04).
 *
 * The mockup's Variant A panel uses 4 stem-family colors derived
 * from the design tokens at artifacts/daw-level1-mockup.html:18-22:
 *   --stem-drums:  #f97316  (orange)
 *   --stem-bass:   #06b6d4  (cyan)
 *   --stem-pad:    #10b981  (green)
 *   --stem-melody: #a78bfa  (purple)
 *
 * Match precedence (DV-11): drums → bass → pad → melody. First match
 * wins. Fallback (no match) returns melody/purple — chosen so that an
 * unrecognized sample lands in the most-musical visual register
 * rather than a neutral gray.
 *
 * Match input: `event.s ?? trackId`. Sample name (when present)
 * outranks trackId because users author with `s("bd")` and the
 * trackId is often a synthetic dedupe of the sample.
 *
 * `evt.color` per-event override is honored at the call site (D-06
 * user-override) — `MusicalTimeline.tsx`'s
 * `evt.color ?? trackColorFromStem(...)` chain. This module owns
 * only the fallback.
 *
 * Phase 20-02 (T-02). Replaces the PR #92 hash-based fallback.
 */

/** Stem palette literals — copied verbatim from the mockup tokens. */
export const STEM_DRUMS = '#f97316'
export const STEM_BASS = '#06b6d4'
export const STEM_PAD = '#10b981'
export const STEM_MELODY = '#a78bfa'
export const STEM_FALLBACK = STEM_MELODY // DV-04 — fallback equals melody.

/**
 * Stem regex precedence (DV-11). Order matters — first match wins.
 * Each pattern is anchored with `^` so prefixes match without
 * accidentally hitting embedded substrings (e.g. `pre-bd` should
 * not match `bd`).
 */
const STEM_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Drums.
  [/^(?:bd|hh|sd|cp|hat|kick|snare|drum|perc|ride|crash|tom)/i, STEM_DRUMS],
  // Bass.
  [/^(?:bass|sub|808)/i,                                          STEM_BASS],
  // Pads.
  [/^(?:pad|pads)/i,                                               STEM_PAD],
  // Melody / lead / synth / piano / keys / guitar.
  [/^(?:lead|melody|synth|piano|keys|guitar)/i,                    STEM_MELODY],
] as const

/**
 * Map a track to its stem color.
 *
 * @param trackId  the row's stable track id (never null — '$default'
 *                 is the sentinel from groupEventsByTrack)
 * @param sample   optional first-seen sample name from the row's
 *                 events (`event.s`). Outranks `trackId` for matching.
 * @returns        a hex color string from the stem palette, or
 *                 STEM_FALLBACK if no pattern matches.
 */
export function trackColorFromStem(
  trackId: string,
  sample?: string,
): string {
  const candidate = sample ?? trackId
  for (const [pattern, color] of STEM_PATTERNS) {
    if (pattern.test(candidate)) return color
  }
  return STEM_FALLBACK
}
