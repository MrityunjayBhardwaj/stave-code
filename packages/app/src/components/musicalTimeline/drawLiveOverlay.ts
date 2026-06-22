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

/** Max playhead→mark gap (cycles) at which an active sig may still light its
 *  NEAREST occurrence. Bounds staleness so an active sig can't light a mark far
 *  from the playhead, while staying loose enough to absorb the audio↔rAF clock
 *  offset that strict `[cycle,end)` containment cannot (#507). The lit DURATION
 *  is still bounded by the hap-driven sig-active window, not this cap — so a
 *  short note lights only while it sounds, just reliably. */
export const MAX_LIT_DISTANCE_CYCLES = 0.5

const EMPTY_LIT: ReadonlySet<SceneNote> = new Set()

/** Distance (cycles) from the playhead to a mark: 0 inside its `[cycle, end)`
 *  (end floored to `MIN_LIT_CYCLES`), else the gap to the nearer edge. */
function cycleDistance(note: SceneNote, playheadCycle: number): number {
  const end = Math.max(note.end, note.cycle + MIN_LIT_CYCLES)
  if (playheadCycle >= note.cycle && playheadCycle < end) return 0
  return playheadCycle < note.cycle ? note.cycle - playheadCycle : playheadCycle - end
}

/**
 * Which marks light at `playheadCycle`. TWO gates (design §4, revised #507):
 *  1. CONFIRMED — the mark's voice+pitch signature is in the firing set the hap
 *     stream maintains. Handles `?`/degrade/conditional patterns: a scene mark
 *     that did NOT actually sound this pass has no active hap → stays dark. The
 *     sig-active window (hap arrival → audible duration) bounds HOW LONG a mark
 *     lights, i.e. lights ≈ while the note sounds.
 *  2. NEAREST — for each active sig, light the single occurrence NEAREST the
 *     playhead (within `MAX_LIT_DISTANCE_CYCLES`). Picks WHICH occurrence of a
 *     voice+pitch is sounding now. This replaces strict `[cycle,end)` containment
 *     (the original temporal gate), which the audio↔rAF clock offset made too
 *     brittle for SHORT, SPARSE notes: their narrow window rarely coincided with
 *     the (lookahead-offset) sig-active instant, so they barely lit while dense
 *     lanes — always having some mark under the playhead — masked it (#507).
 *     "Nearest" is robust to that offset and self-disambiguating: same-sig
 *     occurrences are spaced, so the nearest one IS the one sounding.
 *
 * PURE. Returns the set of notes (subset of `notes`) to light.
 */
export function pickLitNotes(
  notes: readonly SceneNote[],
  playheadCycle: number,
  activeSigs: ReadonlySet<string>,
): ReadonlySet<SceneNote> {
  if (!Number.isFinite(playheadCycle) || activeSigs.size === 0) return EMPTY_LIT
  // Best (min-distance) occurrence per active sig.
  const best = new Map<string, { note: SceneNote; dist: number }>()
  for (const n of notes) {
    const sig = markSig(n.voice, n.pitch)
    if (!activeSigs.has(sig)) continue
    const dist = cycleDistance(n, playheadCycle)
    if (dist > MAX_LIT_DISTANCE_CYCLES) continue
    const cur = best.get(sig)
    if (!cur || dist < cur.dist) best.set(sig, { note: n, dist })
  }
  if (best.size === 0) return EMPTY_LIT
  const out = new Set<SceneNote>()
  for (const b of best.values()) out.add(b.note)
  return out
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
      // Per band (one voice), light the nearest active-sig occurrence (#507).
      const lit = pickLitNotes(band.notes, playheadCycle, activeSigs)
      if (lit.size === 0) continue
      for (const n of band.notes) {
        if (!lit.has(n)) continue
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
