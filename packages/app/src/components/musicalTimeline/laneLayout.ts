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

/** Default per-voice sub-row height (px) when an expanded lane splits into voice
 *  sub-rows (#424). Each voice gets a fixed band (live-monitor parity — the lane
 *  grows with voice count rather than cramming a fixed height), as tall as a
 *  collapsed row so a busy drum track reads clearly. A single-voice/melodic
 *  expanded lane keeps the full `expandedHeight` single band instead. */
export const SUB_ROW_HEIGHT = 22

/** One voice sub-row inside an expanded multi-voice lane (#424). Absolute `top`
 *  in the SAME content space as `LaneBox.top`, so the draw, the gutter labels,
 *  and (future) hit-tests all read one geometry — no drift (PV120). */
export interface SubRowBox {
  /** Partition key (the sample name, or the `NO_VOICE` sentinel). */
  readonly voiceKey: string
  /** Gutter label for this voice. */
  readonly label: string
  /** True for a melodic voice (pitch-Y band); false for percussive (baseline). */
  readonly melodic: boolean
  /** Top edge (px from the layout top — absolute, like `LaneBox.top`). */
  readonly top: number
  /** Sub-row height (px). */
  readonly height: number
}

/** A minimal voice descriptor the layout needs (subset of `SceneVoice`). */
export interface LaneVoiceInput {
  readonly key: string
  readonly label: string
  readonly melodic: boolean
}

/** A lane the layout positions — its key plus (optionally) its voices, so an
 *  expanded lane with ≥2 voices can split into sub-rows. `SceneLane` satisfies
 *  this structurally. */
export interface LaneLayoutInput {
  readonly laneKey: string
  readonly voices?: readonly LaneVoiceInput[]
}

/** One lane's vertical box in content space (CSS px, before DPR). */
export interface LaneBox {
  readonly laneKey: string
  /** Top edge (px from the canvas top). */
  readonly top: number
  /** Row height (px) — `expandedHeight` when expanded, else `rowHeight`. */
  readonly height: number
  /** True when this lane is accordion-expanded (drives the richer draw). */
  readonly expanded: boolean
  /** Per-voice sub-rows, present ONLY when this lane is expanded AND has ≥2
   *  voices (#424). Absent for collapsed lanes and single-voice/melodic expanded
   *  lanes (those draw one band). The boxes stack to fill `[top, top+height)`. */
  readonly subRows?: readonly SubRowBox[]
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
  lanes: readonly LaneLayoutInput[],
  expanded: ReadonlySet<string>,
  rowHeight: number,
  expandedHeight: number,
  subRowHeight: number = SUB_ROW_HEIGHT,
): LaneLayout {
  const base = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 0
  const big = Number.isFinite(expandedHeight) && expandedHeight > base ? expandedHeight : base
  const sub = Number.isFinite(subRowHeight) && subRowHeight > 0 ? subRowHeight : 0
  let top = 0
  const boxes: LaneBox[] = lanes.map((lane) => {
    const isExpanded = expanded.has(lane.laneKey)
    const voices = lane.voices ?? []
    // An expanded lane with ≥2 voices splits into per-voice sub-rows (#424);
    // its height grows with the voice count. A single-voice (or no-voice)
    // expanded lane keeps the single `expandedHeight` band — same display as
    // before this feature (melodic pitch spread, drums on one baseline).
    if (isExpanded && voices.length >= 2 && sub > 0) {
      const subRows: SubRowBox[] = voices.map((v, i) => ({
        voiceKey: v.key,
        label: v.label,
        melodic: v.melodic,
        top: top + i * sub,
        height: sub,
      }))
      const height = voices.length * sub
      const box: LaneBox = { laneKey: lane.laneKey, top, height, expanded: true, subRows }
      top += height
      return box
    }
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
