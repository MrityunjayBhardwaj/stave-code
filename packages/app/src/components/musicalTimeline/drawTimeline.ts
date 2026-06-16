/**
 * drawTimeline — pure canvas renderer for the Song timeline scene (#419).
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
 * No React, no DOM, no canvas creation — just draw calls. The host
 * (`SongTimelineCanvas`) owns the surface, sizing, and dirty-flagged scheduling.
 */

import type { TimelineScene } from './timelineScene'

/** The view transform + geometry the draw needs, all in CSS pixels. */
export interface DrawTransform {
  /** Horizontal scroll offset (content px hidden to the left). */
  readonly scrollLeft: number
  /** Full content width = `viewportWidth * zoom`. */
  readonly contentWidth: number
  /** Visible canvas width (CSS px). */
  readonly viewportWidth: number
  /** Per-lane row height (CSS px). */
  readonly rowHeight: number
  /** Total canvas height (CSS px) = `lanes.length * rowHeight`. */
  readonly height: number
}

/** Resolved literal colors (canvas can't read CSS custom properties). */
export interface DrawTheme {
  readonly background: string
  readonly rowAlt: string
  readonly section: string
  readonly sectionAlt: string
  readonly gridline: string
}

/** Below this per-cycle width, individual note marks would smear sub-pixel, so
 *  the lane falls back to coarse density blocks (design §4.2 readability). */
export const COARSEN_PX = 28

/**
 * Which rendering a lane uses at a given zoom. Pure + exported so the readability
 * switchover is unit-tested directly. A lane with no marks always draws density.
 */
export function laneRenderMode(pxPerCycle: number, hasNotes: boolean): 'density' | 'marks' {
  if (!hasNotes || !Number.isFinite(pxPerCycle)) return 'density'
  return pxPerCycle >= COARSEN_PX ? 'marks' : 'density'
}

/** Draw the whole scene into `ctx` (already DPR-scaled, in CSS px). */
export function drawTimeline(
  ctx: CanvasRenderingContext2D,
  scene: TimelineScene,
  transform: DrawTransform,
  theme: DrawTheme,
): void {
  const { scrollLeft, contentWidth, viewportWidth, rowHeight, height } = transform
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

  // Lanes.
  scene.lanes.forEach((lane, idx) => {
    const top = idx * rowHeight
    if (idx % 2 === 1) {
      ctx.fillStyle = theme.rowAlt
      ctx.fillRect(0, top, viewportWidth, rowHeight)
    }
    if (laneRenderMode(pxPerCycle, lane.notes.length > 0) === 'density') {
      drawDensity(ctx, lane, top, rowHeight, pxPerCycle, scene.peakDensity, firstCycle, lastCycle, toScreenX)
    } else {
      drawMarks(ctx, lane, top, rowHeight, pxPerCycle, viewportWidth, firstCycle, lastCycle, toScreenX)
    }
  })
}

function drawDensity(
  ctx: CanvasRenderingContext2D,
  lane: TimelineScene['lanes'][number],
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
  lane: TimelineScene['lanes'][number],
  top: number,
  rowHeight: number,
  pxPerCycle: number,
  viewportWidth: number,
  firstCycle: number,
  lastCycle: number,
  toScreenX: (c: number) => number,
): void {
  const padY = 3
  const markH = 3
  const markW = Math.max(2, Math.min(6, pxPerCycle * 0.12))
  const bandTop = top + padY
  const bandH = Math.max(1, rowHeight - 2 * padY - markH)
  const hasPitch =
    lane.pitchMin != null && lane.pitchMax != null && lane.pitchMax > lane.pitchMin
  ctx.fillStyle = lane.color
  for (const n of lane.notes) {
    if (n.cycle < firstCycle || n.cycle >= lastCycle) continue
    const x = toScreenX(n.cycle)
    if (x < -markW || x > viewportWidth) continue
    let y: number
    if (n.pitch != null && hasPitch) {
      const t = (n.pitch - lane.pitchMin!) / (lane.pitchMax! - lane.pitchMin!)
      y = bandTop + (1 - t) * bandH // high pitch near the band top (DAW convention)
    } else {
      y = bandTop + bandH / 2
    }
    ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, Math.max(0, n.gain))
    ctx.fillRect(x, y, markW, markH)
  }
  ctx.globalAlpha = 1
}
