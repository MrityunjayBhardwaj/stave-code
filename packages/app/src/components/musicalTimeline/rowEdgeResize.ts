/**
 * #1750 — the Timeline row height that puts the edge below lane `laneIndex` at
 * `edgeY` (content px from the top of the lane stack).
 *
 * The drag sets ONE shared height (the Timeline sub-row setting), and every lane
 * above the edge scales with it: a collapsed lane is one row, an expanded
 * multi-voice lane one row per voice, a single-voice melodic lane several. So
 * the height is found by asking the real layout (`layoutAt`, the same
 * `computeLaneLayout` call the view draws with) where the edge lands at each
 * whole-pixel height in `[min, max]` and keeping the nearest, rather than by
 * re-deriving the layout's arithmetic here. The edge only moves down as the
 * height grows, and the range is a few dozen values, so a scan is exact and
 * cheap enough to run on every pointer move.
 *
 * Returns null when there is no such lane. Ties go to the smaller height.
 */
import type { LaneLayout } from './laneLayout'

export function rowHeightForEdge(
  layoutAt: (rowHeight: number) => LaneLayout,
  laneIndex: number,
  edgeY: number,
  min: number,
  max: number,
): number | null {
  let best: number | null = null
  let bestGap = Infinity
  for (let h = Math.ceil(min); h <= max; h++) {
    const box = layoutAt(h).boxes[laneIndex]
    if (box == null) return null
    const gap = Math.abs(box.top + box.height - edgeY)
    if (gap < bestGap) {
      best = h
      bestGap = gap
    }
  }
  return best
}
