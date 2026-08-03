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

import type { TimelineScene, SceneLane, SceneNote, SceneClip } from './timelineScene'
import { NO_VOICE } from './timelineScene'
import type { LaneLayout, LaneBox } from './laneLayout'
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

/** A silenced lane (muted, or dimmed by a solo elsewhere — #731) is washed toward
 *  the canvas background by painting a background-coloured scrim at this opacity
 *  over its band, AFTER its content. The lane's marks then read at ~`1 - this`
 *  effective visibility, matching the Mixer's dimmed strip (`opacity: 0.45`) so
 *  the two views show the same "inactive" tracks (PV155). A scrim (not a real
 *  per-mark alpha) keeps the fade a single self-contained draw — the mark/density
 *  helpers stay untouched. */
export const SILENCED_LANE_SCRIM = 0.55

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

/** Draw the whole scene into `ctx` (already DPR-scaled, in CSS px). `silenced`
 *  (by lane DISPLAY NAME — #731) fades those lanes to mirror the Mixer's dimmed
 *  strips (PV155); absent/empty → nothing faded. */
export function drawTimeline(
  ctx: CanvasRenderingContext2D,
  scene: TimelineScene,
  transform: DrawTransform,
  theme: DrawTheme,
  layout: LaneLayout,
  silenced?: ReadonlySet<string>,
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
    } else {
      // Marks: one band per voice sub-row (expanded multi-voice lane #424 — each
      // voice keeps its own pitch-Y spread / percussive baseline so a drum stack's
      // bd/sd/hh don't overlap) or a single band (collapsed / single-voice).
      // `laneMarkBands` is the SHARED geometry the live overlay (#500) also draws
      // against, so a lit mark sits exactly over its base mark — one source, no
      // drift (PV120). All marks share the lane color; gain drives intensity.
      ctx.fillStyle = lane.color
      for (const band of laneMarkBands(lane, box)) {
        for (const n of band.notes) {
          const r = markRect(n, band, pxPerCycle, viewportWidth, firstCycle, lastCycle, toScreenX)
          if (!r) continue
          ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, Math.max(0, n.gain))
          ctx.fillRect(r.x, r.y, r.w, r.h)
        }
      }
      ctx.globalAlpha = 1
    }
    // Silenced (muted / soloed-out) lane fade (#731): wash the whole band toward
    // the background so it reads ~55% dimmer — the Mixer's dimmed-strip look —
    // keyed by the SAME display name the Mixer dims by (PV155). Painted last so it
    // dims this lane's marks/density/clips AND the section/gridline showing through
    // its band, confined to [top, top+rowHeight] so siblings are untouched. The
    // live overlay naturally lights nothing here (a silenced track schedules no
    // haps), so the fade is never re-lit from above.
    if (silenced?.has(lane.displayName)) {
      ctx.globalAlpha = SILENCED_LANE_SCRIM
      ctx.fillStyle = theme.background
      ctx.fillRect(0, top, viewportWidth, rowHeight)
      ctx.globalAlpha = 1
    }
  })
}

/** Inset above/below an empty clip's outline, so it sits where that clip's
 *  content WOULD be — the same band `drawDensity` fills (its own `padY`). */
const EMPTY_CLIP_PAD_Y = 4
/** Opacity of the LANE-COLOURED pass of an empty clip's outline — identity.
 *  Sits clearly below content (density blocks run 0.25–1.0) and survives the
 *  `SILENCED_LANE_SCRIM`, which lands a muted lane's outline at ~`this × 0.45`
 *  effective. That fade is what distinguishes muted from sounds-but-empty,
 *  without a second colour. */
const EMPTY_CLIP_OUTLINE_ALPHA = 0.45

/** Does anything render inside this clip's span? Checks BOTH sources a lane can
 *  carry content through — `density` (analysis onsets) and `notes` (eval marks) —
 *  because an IR lane can have onsets with no marks, and the two are populated by
 *  different layers.
 *
 *  DENSITY is tested first deliberately: it is bounded by the clip's cycle count
 *  (a handful of buckets) whereas the note scan is O(notes in the lane), so the
 *  common case — a clip that HAS content — returns on the cheap check, and the
 *  note walk only runs for a span the coarse index already called empty. This
 *  runs per clip per frame.
 *
 *  A note belongs to the span if its ONSET falls inside it, or if it started
 *  earlier and SUSTAINS into it — so a note held across a clip boundary leaves
 *  neither side reading as empty. Stated as two cases rather than an interval
 *  overlap because a zero-duration trigger (`end === cycle`, the percussive
 *  case) is real here and a plain `end > start` test would drop it. */
function clipHasContent(lane: SceneLane, clip: SceneClip): boolean {
  // Whole-cycle-aligned clip bounds (see `SceneClip.endCycle`), so the bucket
  // range is exact rather than a conservative widening.
  const from = Math.max(0, Math.floor(clip.startCycle))
  const to = Math.min(lane.density.length, Math.ceil(clip.endCycle))
  for (let c = from; c < to; c++) {
    if ((lane.density[c] ?? 0) > 0) return true
  }
  for (const n of lane.notes) {
    const onsetInside = n.cycle >= clip.startCycle && n.cycle < clip.endCycle
    const sustainsIn = n.cycle < clip.startCycle && n.end > clip.startCycle
    if (onsetInside || sustainsIn) return true
  }
  return false
}

/** Read-only clip segments for one lane (#386). Each clip is a filled band
 *  (`clipFill`) with bordered left/right edges (`clipBorder`) so an arrangement
 *  reads as discrete movable segments (design §4.2). The single implicit clip of
 *  a bare track spans the whole lane → its edges sit at the song boundaries
 *  (effectively seamless). Pure: positions via the shared `toScreenX` (PV116).
 *  Drawn BEHIND marks so note content stays legible on top.
 *
 *  An EMPTY clip additionally gets a full outline (#1100). Measured cause: the
 *  fill and the two vertical borders are drawn for every clip regardless of
 *  content — density is never consulted here — but at `clipFill`'s 0.035 alpha
 *  the body contributes ~3/255, and a whole-song clip's only strong marks are
 *  its two 1px verticals, which sit at the song's extreme edges flush with the
 *  frame. So the clip was present and unreadable, and a lane with no content to
 *  stand in for it (a muted track — #1099) read as inert rather than silenced.
 *  HORIZONTAL edges are the load-bearing part: they span the clip's width, so a
 *  whole-song clip becomes visible where verticals alone cannot make it.
 *
 *  Scoped to empty clips, so a lane with content is byte-identical to before —
 *  and MUTED is deliberately NOT drawn differently from sounds-but-empty-here.
 *  The lane-level `SILENCED_LANE_SCRIM` already washes a muted lane's whole
 *  band, so the same outline lands dimmer there for free, by the mechanism that
 *  already expresses "silenced" for marks and density. A second encoding at the
 *  clip would say the same thing twice and could disagree with the first. */
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
    if (clipHasContent(lane, clip)) continue
    // Empty clip: outline it in the lane's own colour. Top/bottom run the
    // CLAMPED width (they follow what's on screen); the verticals stay at the
    // real edges, matching the border rule directly above — an off-screen edge
    // must not draw a false one at the viewport margin.
    const padY = Math.min(EMPTY_CLIP_PAD_Y, Math.floor(rowHeight / 4))
    const oTop = top + padY
    const oH = Math.max(1, rowHeight - 2 * padY)
    const edges = (): void => {
      ctx.fillRect(left, oTop, width, 1)
      ctx.fillRect(left, oTop + oH - 1, width, 1)
      if (x0 >= 0 && x0 <= viewportWidth) ctx.fillRect(x0, oTop, 1, oH)
      if (x1 >= 0 && x1 <= viewportWidth) ctx.fillRect(x1 - 1, oTop, 1, oH)
    }
    // TWO passes. The neutral one first, at full strength, because a single
    // lane-coloured pass makes legibility track the lane HUE's luminance —
    // measured over the same clip in the same muted state, an orange lane's
    // outline stood out 25.6/255 while a crimson one managed 7.0, purely from
    // which palette slot the track drew. `clipBorder` is reused rather than a
    // new token: it is already what a clip SEAM is drawn in, so an empty clip's
    // outline can never read weaker than the boundary between two full ones.
    ctx.fillStyle = theme.clipBorder
    ctx.globalAlpha = 1
    edges()
    // Then the lane's colour over it, for identity.
    ctx.fillStyle = lane.color
    ctx.globalAlpha = EMPTY_CLIP_OUTLINE_ALPHA
    edges()
    ctx.globalAlpha = 1
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

/** Per-voice (expanded) padding above/below a sub-row's mark band. */
const VOICE_BAND_PAD_Y = 2
/** Collapsed / single-band padding above/below the lane's mark band. */
const SINGLE_BAND_PAD_Y = 3

/** One horizontal band a lane's marks render into: a `[bandTop, bandTop+bandH]`
 *  strip plus the marks that belong to it, the pitch range that maps note→Y, and
 *  the bar height. A collapsed lane has ONE band (all its notes); an expanded
 *  multi-voice lane has one band PER voice sub-row (#424). The single source the
 *  base renderer and the live overlay (#500) both place marks against. */
export interface MarkBand {
  readonly notes: readonly SceneNote[]
  readonly bandTop: number
  readonly bandH: number
  readonly markH: number
  readonly pMin: number | null
  readonly pMax: number | null
}

/**
 * The mark bands a lane draws into, given its layout box. An expanded lane split
 * into voice sub-rows yields one band per voice — each melodic voice keeps its
 * own pitch-Y spread, each percussive voice a flat baseline, so a drum stack's
 * bd/sd/hh sit on separate lines (#424); sub-row geometry comes straight from the
 * shared `LaneLayout` (PV120). Otherwise a single band: the bar scales with the
 * row height so the row-height setting grows it like the live monitor (#459); an
 * expanded single band keeps a thin mark so its pitch spread reads as a contour.
 * PURE — the geometry the base `drawTimeline` and the live overlay both consume,
 * so a lit mark lands exactly over its base mark (no drift).
 */
export function laneMarkBands(lane: SceneLane, box: LaneBox): MarkBand[] {
  if (box.subRows) {
    const voiceByKey = new Map(lane.voices.map((v) => [v.key, v]))
    return box.subRows.map((sr) => {
      const voice = voiceByKey.get(sr.voiceKey)
      const markH = barHeightForBand(sr.height - 2 * VOICE_BAND_PAD_Y)
      return {
        notes: lane.notes.filter((n) => (n.voice ?? NO_VOICE) === sr.voiceKey),
        bandTop: sr.top + VOICE_BAND_PAD_Y,
        bandH: Math.max(1, sr.height - 2 * VOICE_BAND_PAD_Y - markH),
        markH,
        pMin: voice?.pitchMin ?? null,
        pMax: voice?.pitchMax ?? null,
      }
    })
  }
  const markH = box.expanded ? 4 : barHeightForBand(box.height - 2 * SINGLE_BAND_PAD_Y)
  return [
    {
      notes: lane.notes,
      bandTop: box.top + SINGLE_BAND_PAD_Y,
      bandH: Math.max(1, box.height - 2 * SINGLE_BAND_PAD_Y - markH),
      markH,
      pMin: lane.pitchMin,
      pMax: lane.pitchMax,
    },
  ]
}

/**
 * The rect for one mark within a band, or null if it's outside the visible cycle
 * window / off-screen. Melodic marks (pitch within a real `[pMin, pMax]` range)
 * map pitch→Y (high pitch near the top, DAW convention); percussive marks (no
 * pitch, or a single-pitch voice where `pMax === pMin`) sit on the band's centre
 * baseline. Width is DURATION-proportional (mirrors the live view's
 * `eventToRect`), floored at `MIN_MARK_W` so a zero-duration trigger still shows.
 * PURE — shared by the base draw and the live overlay so both agree pixel-for-
 * pixel on where a mark sits.
 */
export function markRect(
  note: SceneNote,
  band: MarkBand,
  pxPerCycle: number,
  viewportWidth: number,
  firstCycle: number,
  lastCycle: number,
  toScreenX: (c: number) => number,
): { x: number; y: number; w: number; h: number } | null {
  if (note.cycle < firstCycle || note.cycle >= lastCycle) return null
  const x = toScreenX(note.cycle)
  const w = Math.max(MIN_MARK_W, (note.end - note.cycle) * pxPerCycle)
  if (x < -w || x > viewportWidth) return null
  const { bandTop, bandH, markH, pMin, pMax } = band
  const hasPitch = pMin != null && pMax != null && pMax > pMin
  let y: number
  if (note.pitch != null && hasPitch) {
    const t = (note.pitch - pMin) / (pMax - pMin)
    y = bandTop + (1 - t) * bandH // high pitch near the band top (DAW convention)
  } else {
    y = bandTop + bandH / 2
  }
  return { x, y, w, h: markH }
}
