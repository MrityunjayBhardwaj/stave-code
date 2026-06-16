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

// ── Zoom (#412) ────────────────────────────────────────────────────────────
//
// zoom = 1 fits the whole loop to the viewport (the existing fit-to-width
// default). zoom > 1 widens the content (`contentWidth = viewportWidth * zoom`)
// past the viewport, revealing a horizontal scrollbar. All the cycle↔pixel
// helpers above are width-agnostic, so the view simply passes `contentWidth`
// where it used to pass the raw viewport width.

/** Minimum zoom — fit the whole song to the viewport. */
export const MIN_ZOOM = 1
/** Maximum zoom — far enough to inspect individual cycles on a long song. */
export const MAX_ZOOM = 64
/** Multiplier per zoom-button press / wheel notch. */
export const ZOOM_STEP = 1.5

/** Clamp a zoom factor to `[MIN_ZOOM, MAX_ZOOM]`; non-finite → MIN_ZOOM. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

/** Content width at a given zoom (`viewportWidth * zoom`, never below the viewport). */
export function contentWidthFor(viewportWidth: number, zoom: number): number {
  if (viewportWidth <= 0) return 0
  return viewportWidth * Math.max(MIN_ZOOM, zoom)
}

/**
 * The new horizontal scroll offset after a zoom change that keeps the song
 * point currently under `cursorX` pinned beneath the cursor (cursor-centered
 * zoom). `cursorX` is viewport-relative (0 = left edge of the scroll area).
 * Result is clamped to the scrollable range `[0, contentWidth - viewportWidth]`.
 */
export function scrollLeftForZoom(params: {
  oldZoom: number
  newZoom: number
  scrollLeft: number
  cursorX: number
  viewportWidth: number
}): number {
  const { oldZoom, newZoom, scrollLeft, cursorX, viewportWidth } = params
  if (viewportWidth <= 0 || oldZoom <= 0 || newZoom <= 0) return 0
  const contentX = scrollLeft + cursorX // content-space x under the cursor pre-zoom
  const next = contentX * (newZoom / oldZoom) - cursorX
  const maxScroll = Math.max(0, viewportWidth * newZoom - viewportWidth)
  return Math.max(0, Math.min(maxScroll, next))
}

// ── Ruler ticks (#412) ───────────────────────────────────────────────────────

/** Beats per bar for the BARS ruler. Strudel has no fixed meter (one cycle is
 *  one bar), so beats are a display subdivision; 4 is the universal DAW default. */
export const BEATS_PER_BAR = 4

export interface RulerTick {
  /** Song cycle position (fractional for beat ticks). */
  readonly cycle: number
  /** Label text, or null for an unlabeled minor (beat) tick. */
  readonly label: string | null
  /** Major ticks sit on cycle/bar boundaries, draw taller, and carry a label. */
  readonly major: boolean
}

/**
 * Tick marks for the song ruler. `pxPerCycle` (= contentWidth / displayCycles)
 * drives density: majors stay ≥ ~40px apart by stepping in powers of two when
 * zoomed out, and beat subdivisions only appear once each beat clears ~14px.
 *
 * CYCLES mode → 0-indexed labels (matches Strudel cycle numbering and the cell
 *   tooltips); no beats. BARS mode → 1-indexed labels (DAW convention: bar 1 is
 *   the first bar) with beat ticks at multiples of 1/BEATS_PER_BAR.
 */
export function rulerTicks(
  displayCycles: number,
  pxPerCycle: number,
  mode: 'cycles' | 'bars',
): RulerTick[] {
  if (displayCycles <= 0 || !Number.isFinite(pxPerCycle) || pxPerCycle <= 0) return []
  const MIN_MAJOR_PX = 40
  const BEAT_MIN_PX = 14
  let step = 1
  while (step * pxPerCycle < MIN_MAJOR_PX) step *= 2
  const showBeats =
    mode === 'bars' && step === 1 && pxPerCycle / BEATS_PER_BAR >= BEAT_MIN_PX
  const ticks: RulerTick[] = []
  for (let c = 0; c < displayCycles; c += step) {
    ticks.push({ cycle: c, label: mode === 'bars' ? String(c + 1) : String(c), major: true })
    if (showBeats) {
      for (let b = 1; b < BEATS_PER_BAR; b++) {
        ticks.push({ cycle: c + b / BEATS_PER_BAR, label: null, major: false })
      }
    }
  }
  return ticks
}
