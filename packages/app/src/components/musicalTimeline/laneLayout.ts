/**
 * laneLayout — the per-lane vertical layout for the canvas Song timeline
 * (expand + bind, #422 / canvas milestone #416, design §4.5).
 *
 * Before expand, every lane was a uniform `ROW_HEIGHT` row and three places
 * independently assumed that: the canvas draw (`drawTimeline` y-offsets), the
 * canvas host height, and the DOM lane labels. Click-to-expand makes a lane
 * taller (accordion) so its read-only note detail is legible — which means the
 * row height is no longer uniform. If each consumer recomputed y-offsets on its
 * own they would drift apart (PV116 — the shared transform must stay single-
 * sourced). So this module is the ONE place that turns `(lanes, expanded)` into
 * a `top`/`height` box per lane; the draw, the host height, the labels, AND the
 * hit-test all read the same `LaneLayout`.
 *
 * PURE — no React, no canvas, only the lane keys. Unit-tested directly.
 */

/** One lane's vertical box in content space (CSS px, before DPR). */
export interface LaneBox {
  readonly laneKey: string
  /** Top edge (px from the canvas top). */
  readonly top: number
  /** Row height (px) — `expandedHeight` when expanded, else `rowHeight`. */
  readonly height: number
  /** True when this lane is accordion-expanded (drives the richer draw). */
  readonly expanded: boolean
}

/** The full vertical layout: one box per lane (in lane order) + the total. */
export interface LaneLayout {
  readonly boxes: readonly LaneBox[]
  /** Sum of all box heights — the canvas/grid content height. ≥ 0. */
  readonly totalHeight: number
}

/**
 * Stack the lanes top-to-bottom, giving each its expanded or collapsed height.
 * Lane order is preserved (it must match `scene.lanes` and the DOM labels), so
 * the returned `boxes[i]` lines up with `lanes[i]`. Non-finite/negative heights
 * are floored to 0 so a bad input can't produce NaN geometry downstream.
 */
export function computeLaneLayout(
  lanes: readonly { readonly laneKey: string }[],
  expanded: ReadonlySet<string>,
  rowHeight: number,
  expandedHeight: number,
): LaneLayout {
  const base = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 0
  const big = Number.isFinite(expandedHeight) && expandedHeight > base ? expandedHeight : base
  let top = 0
  const boxes: LaneBox[] = lanes.map((lane) => {
    const isExpanded = expanded.has(lane.laneKey)
    const height = isExpanded ? big : base
    const box: LaneBox = { laneKey: lane.laneKey, top, height, expanded: isExpanded }
    top += height
    return box
  })
  return { boxes, totalHeight: top }
}

/**
 * Which lane contains content-space `y` (px from the layout top), or null if
 * `y` is above the first box or below the last. Inclusive of the top edge,
 * exclusive of the bottom — adjacent boxes never both claim a pixel.
 */
export function laneAtY(layout: LaneLayout, y: number): string | null {
  if (!Number.isFinite(y) || y < 0) return null
  for (const box of layout.boxes) {
    if (y >= box.top && y < box.top + box.height) return box.laneKey
  }
  return null
}
