/**
 * drawLiveOverlay — the per-note LIVE overlay for the canvas Song timeline
 * (#500 / U3, timeline unification #497).
 *
 * The base `SongTimelineCanvas` draws the static scene (density + mini-note
 * marks) and is dirty-flagged. The LIVE layer rides on a SECOND canvas above it
 * and lights the marks that are sounding RIGHT NOW — Live's killer feature
 * folded onto the canvas. "Lit" is a draw-STATE change over the EXISTING
 * geometry: it reuses `laneMarkBands` + `markRect` from drawTimeline, so a lit
 * mark lands exactly over its base mark (one geometry source, no drift — PV120).
 * Visible-window clipped → O(visible), like the base draw.
 *
 * PURE — no React, no canvas creation. The host (`SongTimelineLiveOverlay`) owns
 * the surface, the hap subscription, and the per-frame redraw.
 */

import type { TimelineScene, SceneNote } from './timelineScene'
import type { LaneLayout } from './laneLayout'
import { laneMarkBands, markRect, laneRenderMode, type DrawTransform } from './drawTimeline'

export interface LiveOverlayTheme {
  /** Bright core of a lit mark. */
  readonly lit: string
  /** Wider, fainter glow behind the core so even a thin bar reads as "firing". */
  readonly litGlow: string
}

/**
 * Signature that addresses a mark by VOICE + PITCH — the dimensions a runtime
 * hap carries (`s`, `midiNote`) and a `SceneNote` mirrors (`voice`, `pitch`).
 * A hap does NOT carry `trackId`, so the lane dimension of the design's match
 * key `(laneKey↔trackId, voice↔s, pitch↔note)` is recovered by the playhead-
 * TEMPORAL gate (which mark is under the playhead), not this key (design §4). A
 * drum hit → `bd|`; a bare synth note → `|60`; a sampled melodic note →
 * `piano|48`. Null voice and null pitch both collapse to the empty segment, so
 * a hap and its mark agree on both sides.
 */
export function markSig(voice: string | null | undefined, pitch: number | null | undefined): string {
  return `${voice ?? ''}|${pitch ?? ''}`
}

/** Small cycle window so an instantaneous (zero-duration) mark still lights for a
 *  visible moment under the playhead — the time-domain twin of `markRect`'s
 *  `MIN_MARK_W` width flooring. */
export const MIN_LIT_CYCLES = 1 / 16

/**
 * Is this mark lit at `playheadCycle`? TWO gates (design §4):
 *  1. TEMPORAL — the playhead is within the mark's `[cycle, end)` (floored to a
 *     minimum window so a zero-duration trigger still lights). Picks WHICH mark
 *     of a voice is sounding now (sequential marks of one voice don't overlap).
 *  2. CONFIRMED — the mark's voice+pitch signature is in the firing set the hap
 *     stream maintains. Handles `?`/degrade/conditional patterns: a scene mark
 *     that did NOT actually sound this pass has no active hap → stays dark. PURE.
 */
export function isMarkLit(
  note: SceneNote,
  playheadCycle: number,
  activeSigs: ReadonlySet<string>,
): boolean {
  if (!Number.isFinite(playheadCycle)) return false
  const end = Math.max(note.end, note.cycle + MIN_LIT_CYCLES)
  if (playheadCycle < note.cycle || playheadCycle >= end) return false
  return activeSigs.has(markSig(note.voice, note.pitch))
}

/**
 * Draw the lit marks over the scene. Clears its own surface, then for each lane
 * in marks-render mode lights the marks the two gates accept, using the SAME
 * band geometry as the base draw. Density lanes (zoomed out) draw no marks, so
 * there is nothing to light there — the playhead + density already convey it.
 */
export function drawLiveOverlay(
  ctx: CanvasRenderingContext2D,
  scene: TimelineScene,
  transform: DrawTransform,
  layout: LaneLayout,
  playheadCycle: number | null,
  activeSigs: ReadonlySet<string>,
  theme: LiveOverlayTheme,
): void {
  const { scrollLeft, contentWidth, viewportWidth } = transform
  ctx.clearRect(0, 0, viewportWidth, layout.totalHeight)
  const dc = scene.displayCycles
  if (playheadCycle == null || dc <= 0 || contentWidth <= 0 || viewportWidth <= 0) return
  if (activeSigs.size === 0) return

  const pxPerCycle = contentWidth / dc
  const toScreenX = (cycle: number): number => (cycle / dc) * contentWidth - scrollLeft
  const firstCycle = Math.max(0, Math.floor(scrollLeft / pxPerCycle))
  const lastCycle = Math.min(dc, Math.ceil((scrollLeft + viewportWidth) / pxPerCycle))

  scene.lanes.forEach((lane, idx) => {
    const box = layout.boxes[idx]
    if (!box || box.height <= 0) return
    if (laneRenderMode(pxPerCycle, lane.notes.length > 0, box.expanded) !== 'marks') return
    for (const band of laneMarkBands(lane, box)) {
      for (const n of band.notes) {
        if (!isMarkLit(n, playheadCycle, activeSigs)) continue
        const r = markRect(n, band, pxPerCycle, viewportWidth, firstCycle, lastCycle, toScreenX)
        if (!r) continue
        drawLitMark(ctx, r, n.gain, theme)
      }
    }
  })
}

/** A lit mark: a faint wider glow behind a bright core, so even a ~3px bar pops
 *  as "sounding now". Gain scales the core's opacity (design — gain→intensity). */
function drawLitMark(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  gain: number,
  theme: LiveOverlayTheme,
): void {
  const g = Math.min(1, Math.max(0, Number.isFinite(gain) ? gain : 1))
  const glowPad = 2
  ctx.fillStyle = theme.litGlow
  ctx.globalAlpha = 0.18 + 0.32 * g
  ctx.fillRect(r.x - glowPad, r.y - glowPad, r.w + 2 * glowPad, r.h + 2 * glowPad)
  ctx.fillStyle = theme.lit
  ctx.globalAlpha = 0.7 + 0.3 * g
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.globalAlpha = 1
}
