/**
 * drawTimeline — pure canvas renderer for the Song timeline scene (#419, #422).
 *
 * Draws a `TimelineScene` against the shared content-space transform (PV116):
 * section bands, cycle gridlines, then per lane either the coarse onset DENSITY
 * (when a cycle is narrow — marks would smear sub-pixel) or readable MINI-NOTE
 * MARKS (when zoomed in). It draws in CSS pixels into the VISIBLE window only
 * (the host translates by `scrollLeft`), so the work is O(visible), not
 * O(whole song). DPR is the host's job: it scales the context before calling,
 * so this function never touches `devicePixelRatio` — which also keeps it pure
 * and testable against a recording mock context.
 *
 * Per-lane VERTICAL geometry comes from a `LaneLayout` (expand + bind, #422):
 * each lane has its own `top`/`height`, and an expanded ("accordion") lane
 * renders RICHER read-only detail — forced mini-note marks with full pitch
 * spread over the taller band, plus faint per-beat gridlines for rhythm
 * readability (design §4.5). Collapsed lanes are unchanged. The same layout
 * drives the host height, the DOM labels, and the hit-test, so nothing drifts.
 *
 * No React, no DOM, no canvas creation — just draw calls. The host
 * (`SongTimelineCanvas`) owns the surface, sizing, and dirty-flagged scheduling.
 */

import type { TimelineScene, SceneLane, SceneNote } from './timelineScene'
import { NO_VOICE } from './timelineScene'
import type { LaneLayout, SubRowBox } from './laneLayout'
import { BEATS_PER_BAR } from './songAxis'

/** The HORIZONTAL view transform + viewport, all in CSS pixels. Vertical
 *  geometry (per-lane top/height, total height) lives in the `LaneLayout`. */
export interface DrawTransform {
  /** Horizontal scroll offset (content px hidden to the left). */
  readonly scrollLeft: number
  /** Full content width = `viewportWidth * zoom`. */
  readonly contentWidth: number
  /** Visible canvas width (CSS px). */
  readonly viewportWidth: number
}

/** Resolved literal colors (canvas can't read CSS custom properties). */
export interface DrawTheme {
  readonly background: string
  readonly rowAlt: string
  readonly section: string
  readonly sectionAlt: string
  readonly gridline: string
  /** Fill behind a read-only clip segment (#386) — a subtle translucent band so
   *  the lane's note marks stay legible on top. */
  readonly clipFill: string
  /** Border at clip boundaries (left/right edges) — makes segments read as
   *  discrete clips (design §4.2). */
  readonly clipBorder: string
}

/** Below this per-cycle width, individual note marks would smear sub-pixel, so
 *  the lane falls back to coarse density blocks (design §4.2 readability). */
export const COARSEN_PX = 28

/** Minimum mark width (px) so a zero/near-zero-duration trigger still shows and
 *  stays clickable — mirrors the live view's `MIN_BLOCK_PX` (timeAxis.ts). */
export const MIN_MARK_W = 2

/** Note-bar height scales with its band — mirrors the live monitor's
 *  `leafBarHeight` (MusicalTimeline): the bar fills most of the band, reserving
 *  ~`BAR_PITCH_RESERVE`px for melodic pitch motion, floored so a tiny band still
 *  shows a mark. This is what makes resizing the timeline row-height setting grow
 *  the Song bars, just like it grows the live monitor's bars (#459). At the
 *  default row height the result is ~3px (unchanged); larger rows → taller bars. */
const BAR_PITCH_RESERVE = 12
const BAR_HEIGHT_MIN = 3
function barHeightForBand(bandHeight: number): number {
  return Math.max(BAR_HEIGHT_MIN, bandHeight - BAR_PITCH_RESERVE)
}

/** Minimum px between per-beat gridlines in an expanded lane — below this they
 *  crowd into a smear, so they're suppressed (rhythm grid only when legible). */
const BEAT_GRID_MIN_PX = 10

/**
 * Which rendering a lane uses at a given zoom. Pure + exported so the readability
 * switchover is unit-tested directly. A lane with no marks always draws density.
 * An EXPANDED lane with marks always draws marks (detail on demand overrides the
 * zoom coarsening — the user asked to see this lane's notes).
 */
export function laneRenderMode(
  pxPerCycle: number,
  hasNotes: boolean,
  expanded = false,
): 'density' | 'marks' {
  if (!hasNotes || !Number.isFinite(pxPerCycle)) return 'density'
  if (expanded) return 'marks'
  return pxPerCycle >= COARSEN_PX ? 'marks' : 'density'
}

/** Draw the whole scene into `ctx` (already DPR-scaled, in CSS px). */
export function drawTimeline(
  ctx: CanvasRenderingContext2D,
  scene: TimelineScene,
  transform: DrawTransform,
  theme: DrawTheme,
  layout: LaneLayout,
): void {
  const { scrollLeft, contentWidth, viewportWidth } = transform
  const height = layout.totalHeight
  ctx.clearRect(0, 0, viewportWidth, height)
  const dc = scene.displayCycles
  if (dc <= 0 || contentWidth <= 0 || viewportWidth <= 0) return

  const pxPerCycle = contentWidth / dc
  const toScreenX = (cycle: number): number => (cycle / dc) * contentWidth - scrollLeft
  // Visible cycle window — clamp the per-lane loops to what's on screen.
  const firstCycle = Math.max(0, Math.floor(scrollLeft / pxPerCycle))
  const lastCycle = Math.min(dc, Math.ceil((scrollLeft + viewportWidth) / pxPerCycle))

  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, viewportWidth, height)

  // Section bands (full height, behind lanes).
  scene.sections.forEach((s, i) => {
    const x0 = toScreenX(s.startCycle)
    const x1 = toScreenX(s.endCycle)
    if (x1 <= 0 || x0 >= viewportWidth) return
    const left = Math.max(0, x0)
    const width = Math.min(viewportWidth, x1) - left
    if (width <= 0) return
    ctx.fillStyle = i % 2 === 0 ? theme.section : theme.sectionAlt
    ctx.fillRect(left, 0, width, height)
  })

  // Cycle gridlines, coarsened so they never crowd below ~6px apart.
  let gridStep = 1
  while (gridStep * pxPerCycle < 6) gridStep *= 2
  ctx.fillStyle = theme.gridline
  for (let c = Math.ceil(firstCycle / gridStep) * gridStep; c <= lastCycle; c += gridStep) {
    const x = toScreenX(c)
    if (x < 0 || x > viewportWidth) continue
    ctx.fillRect(x, 0, 1, height)
  }

  // Lanes — each at its own top/height from the layout.
  scene.lanes.forEach((lane, idx) => {
    const box = layout.boxes[idx]
    if (!box || box.height <= 0) return
    const { top, height: rowHeight, expanded } = box
    if (idx % 2 === 1) {
      ctx.fillStyle = theme.rowAlt
      ctx.fillRect(0, top, viewportWidth, rowHeight)
    }
    // Read-only clip segments (#386) — behind the note marks. A bare track has
    // one implicit clip (no visible seams); an arrangement track shows a rect
    // per arm with bordered edges.
    drawClips(ctx, lane, top, rowHeight, viewportWidth, theme, toScreenX)
    const mode = laneRenderMode(pxPerCycle, lane.notes.length > 0, expanded)
    if (expanded) {
      drawBeatGrid(ctx, top, rowHeight, pxPerCycle, firstCycle, lastCycle, viewportWidth, theme, toScreenX)
    }
    if (mode === 'density') {
      drawDensity(ctx, lane, top, rowHeight, pxPerCycle, scene.peakDensity, firstCycle, lastCycle, toScreenX)
    } else if (box.subRows) {
      // Expanded multi-voice lane (#424): each voice draws in its own sub-band —
      // a melodic voice keeps its pitch-Y spread, a percussive voice a flat
      // baseline PER VOICE, so a drum stack's bd/sd/hh no longer overlap.
      drawVoiceMarks(ctx, lane, box.subRows, pxPerCycle, viewportWidth, firstCycle, lastCycle, toScreenX)
    } else {
      drawMarks(ctx, lane, top, rowHeight, expanded, pxPerCycle, viewportWidth, firstCycle, lastCycle, toScreenX)
    }
  })
}

/** Read-only clip segments for one lane (#386). Each clip is a filled band
 *  (`clipFill`) with bordered left/right edges (`clipBorder`) so an arrangement
 *  reads as discrete movable segments (design §4.2). The single implicit clip of
 *  a bare track spans the whole lane → its edges sit at the song boundaries
 *  (effectively seamless). Pure: positions via the shared `toScreenX` (PV116).
 *  Drawn BEHIND marks so note content stays legible on top. */
function drawClips(
  ctx: CanvasRenderingContext2D,
  lane: SceneLane,
  top: number,
  rowHeight: number,
  viewportWidth: number,
  theme: DrawTheme,
  toScreenX: (cycle: number) => number,
): void {
  for (const clip of lane.clips) {
    const x0 = toScreenX(clip.startCycle)
    const x1 = toScreenX(clip.endCycle)
    if (x1 <= 0 || x0 >= viewportWidth) continue
    const left = Math.max(0, x0)
    const right = Math.min(viewportWidth, x1)
    const width = right - left
    if (width <= 0) continue
    ctx.fillStyle = theme.clipFill
    ctx.fillRect(left, top, width, rowHeight)
    // Vertical borders at the real (unclamped) clip edges only — so a clip
    // clipped off-screen doesn't draw a false edge at the viewport margin.
    ctx.fillStyle = theme.clipBorder
    if (x0 >= 0 && x0 <= viewportWidth) ctx.fillRect(x0, top, 1, rowHeight)
    if (x1 >= 0 && x1 <= viewportWidth) ctx.fillRect(x1 - 1, top, 1, rowHeight)
  }
}

/** Faint per-beat vertical guides inside an expanded lane (rhythm readability).
 *  Cycle boundaries are already drawn by the global gridlines; this adds the
 *  in-between beats (BEATS_PER_BAR subdivisions), suppressed when they'd crowd. */
function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  top: number,
  rowHeight: number,
  pxPerCycle: number,
  firstCycle: number,
  lastCycle: number,
  viewportWidth: number,
  theme: DrawTheme,
  toScreenX: (c: number) => number,
): void {
  if (pxPerCycle / BEATS_PER_BAR < BEAT_GRID_MIN_PX) return
  ctx.fillStyle = theme.gridline
  ctx.globalAlpha = 0.5
  for (let c = Math.floor(firstCycle); c < lastCycle; c++) {
    for (let b = 1; b < BEATS_PER_BAR; b++) {
      const x = toScreenX(c + b / BEATS_PER_BAR)
      if (x < 0 || x > viewportWidth) continue
      ctx.fillRect(x, top, 1, rowHeight)
    }
  }
  ctx.globalAlpha = 1
}

function drawDensity(
  ctx: CanvasRenderingContext2D,
  lane: SceneLane,
  top: number,
  rowHeight: number,
  pxPerCycle: number,
  peak: number,
  firstCycle: number,
  lastCycle: number,
  toScreenX: (c: number) => number,
): void {
  const padY = 4
  const gap = pxPerCycle > 3 ? 1 : 0
  const cellW = Math.max(1, pxPerCycle - gap)
  const cellH = Math.max(1, rowHeight - 2 * padY)
  const denom = peak > 0 ? peak : 1
  ctx.fillStyle = lane.color
  for (let c = firstCycle; c < lastCycle; c++) {
    const count = lane.density[c] ?? 0
    if (count <= 0) continue
    ctx.globalAlpha = 0.25 + 0.75 * Math.min(1, count / denom)
    ctx.fillRect(toScreenX(c), top + padY, cellW, cellH)
  }
  ctx.globalAlpha = 1
}

function drawMarks(
  ctx: CanvasRenderingContext2D,
  lane: SceneLane,
  top: number,
  rowHeight: number,
  expanded: boolean,
  pxPerCycle: number,
  viewportWidth: number,
  firstCycle: number,
  lastCycle: number,
  toScreenX: (c: number) => number,
): void {
  const padY = 3
  // Collapsed lane: the bar scales with the row height, so the timeline
  // row-height setting grows it like the live monitor (#459). An expanded
  // single-band lane keeps a thin mark so its pitch spread reads as a contour
  // over the much taller note-detail band, not one fat bar.
  const markH = expanded ? 4 : barHeightForBand(rowHeight - 2 * padY)
  placeMarks(
    ctx,
    lane.notes,
    lane.color,
    top + padY,
    Math.max(1, rowHeight - 2 * padY - markH),
    markH,
    lane.pitchMin,
    lane.pitchMax,
    pxPerCycle,
    viewportWidth,
    firstCycle,
    lastCycle,
    toScreenX,
  )
}

/**
 * Draw an expanded multi-voice lane (#424): one sub-band per voice. A melodic
 * voice gets its own pitch-Y spread (auto-fit to THAT voice's range); a
 * percussive voice gets a flat baseline centred in its band — one baseline per
 * voice, so a drum stack's bd/sd/hh sit on separate lines instead of overlapping.
 * Sub-row geometry comes straight from the shared `LaneLayout` (PV120), so the
 * marks line up with the gutter labels exactly.
 */
function drawVoiceMarks(
  ctx: CanvasRenderingContext2D,
  lane: SceneLane,
  subRows: readonly SubRowBox[],
  pxPerCycle: number,
  viewportWidth: number,
  firstCycle: number,
  lastCycle: number,
  toScreenX: (c: number) => number,
): void {
  const padY = 2
  const voiceByKey = new Map(lane.voices.map((v) => [v.key, v]))
  for (const sr of subRows) {
    const voice = voiceByKey.get(sr.voiceKey)
    const notes = lane.notes.filter((n) => (n.voice ?? NO_VOICE) === sr.voiceKey)
    // Per-voice bar scales with the sub-row height, so resizing the row-height
    // setting grows the sub-row bars just like the live monitor's (#459).
    const markH = barHeightForBand(sr.height - 2 * padY)
    placeMarks(
      ctx,
      notes,
      lane.color,
      sr.top + padY,
      Math.max(1, sr.height - 2 * padY - markH),
      markH,
      voice?.pitchMin ?? null,
      voice?.pitchMax ?? null,
      pxPerCycle,
      viewportWidth,
      firstCycle,
      lastCycle,
      toScreenX,
    )
  }
}

/**
 * Place a set of marks within one band `[bandTop, bandTop + bandH]`. Melodic
 * marks (pitch within a real `[pMin, pMax]` range) map pitch→Y (high pitch near
 * the top, DAW convention); percussive marks (no pitch, or a single-pitch voice
 * where `pMax === pMin`) sit on the band's centre baseline. Width is
 * DURATION-proportional (mirrors the live view's `eventToRect`), floored at
 * `MIN_MARK_W` so a zero-duration trigger still shows; the canvas clips marks
 * crossing the viewport edge. Shared by the single-band and per-voice paths so
 * both render identically.
 */
function placeMarks(
  ctx: CanvasRenderingContext2D,
  notes: readonly SceneNote[],
  color: string,
  bandTop: number,
  bandH: number,
  markH: number,
  pMin: number | null,
  pMax: number | null,
  pxPerCycle: number,
  viewportWidth: number,
  firstCycle: number,
  lastCycle: number,
  toScreenX: (c: number) => number,
): void {
  const hasPitch = pMin != null && pMax != null && pMax > pMin
  ctx.fillStyle = color
  for (const n of notes) {
    if (n.cycle < firstCycle || n.cycle >= lastCycle) continue
    const x = toScreenX(n.cycle)
    const markW = Math.max(MIN_MARK_W, (n.end - n.cycle) * pxPerCycle)
    if (x < -markW || x > viewportWidth) continue
    let y: number
    if (n.pitch != null && hasPitch) {
      const t = (n.pitch - pMin!) / (pMax! - pMin!)
      y = bandTop + (1 - t) * bandH // high pitch near the band top (DAW convention)
    } else {
      y = bandTop + bandH / 2
    }
    ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, Math.max(0, n.gain))
    ctx.fillRect(x, y, markW, markH)
  }
  ctx.globalAlpha = 1
}
