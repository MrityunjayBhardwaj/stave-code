/**
 * songAxis — pixel ↔ cycle mapping for the full-song timeline (#385).
 *
 * The live window uses `timeAxis.ts` (a fixed 2-cycle wrap). The full-song
 * view instead spans `[0, displayCycles)` — the detected loop period, or the
 * analyzed horizon when no period was found (design §7.5). These helpers are
 * the seek math: the ruler click handler inverts `songCycleToX` to turn a
 * click-x into a target cycle for `runtime.seekTo` (relaxing DV-10 — the
 * playhead becomes drivable, a deliberate, logged veto revision).
 */

/**
 * Map a song cycle to an x-pixel within `[0, width]`. The cycle is clamped to
 * `[0, displayCycles]` first, so an out-of-range playhead pins to an edge
 * rather than drawing off-canvas. Degenerate inputs (width ≤ 0,
 * displayCycles ≤ 0, non-finite cycle) map to 0.
 */
export function songCycleToX(
  cycle: number | null | undefined,
  displayCycles: number,
  width: number,
): number {
  if (cycle == null || !Number.isFinite(cycle)) return 0
  if (width <= 0 || displayCycles <= 0) return 0
  const clamped = Math.max(0, Math.min(displayCycles, cycle))
  return (clamped / displayCycles) * width
}

/**
 * Inverse of `songCycleToX`: turn a click x-pixel into a target song cycle in
 * `[0, displayCycles)`. Clamps x to `[0, width]` so clicks on the ruler's edge
 * padding still resolve. Returns 0 for degenerate inputs.
 */
export function xToSongCycle(
  x: number,
  displayCycles: number,
  width: number,
): number {
  if (width <= 0 || displayCycles <= 0 || !Number.isFinite(x)) return 0
  const clampedX = Math.max(0, Math.min(width, x))
  const cycle = (clampedX / width) * displayCycles
  // Keep strictly below displayCycles so a click on the far edge seeks to the
  // last cycle of the loop, not one past it (which would wrap to 0 audibly).
  return Math.min(cycle, Math.max(0, displayCycles - 1e-6))
}

/**
 * Wrap a monotonically-increasing song position into the `[0, displayCycles)`
 * display range. The transport clock keeps advancing after a seek; the
 * full-song playhead shows the within-loop position.
 */
export function wrapSongPosition(
  songPosition: number | null | undefined,
  displayCycles: number,
): number | null {
  if (songPosition == null || !Number.isFinite(songPosition)) return null
  if (displayCycles <= 0) return null
  const wrapped = songPosition % displayCycles
  return wrapped < 0 ? wrapped + displayCycles : wrapped
}
