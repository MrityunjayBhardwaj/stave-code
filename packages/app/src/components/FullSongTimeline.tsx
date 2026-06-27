/**
 * FullSongTimeline — the navigable whole-song view (#385, design §7.5).
 *
 * Audience: MUSICIAN (PV35). Vocabulary discipline (PV32 / D-06) applies to
 * every visible string — "SONG", "CYCLES", section numbers only.
 *
 * Distinct concern from the live 2-cycle monitor in MusicalTimeline: this is a
 * zoomed-out map of the ENTIRE song (one detected loop period, or the analyzed
 * horizon when no period exists). It renders a per-lane onset heatmap across
 * `[0, displayCycles)`, section chips on the ruler, and a SCRUBBABLE playhead.
 *
 * Seek (relaxes DV-10 — the read-only-playhead veto): clicking the ruler or
 * grid inverts the song axis to a target cycle and calls `onSeek`, which the
 * runtime turns into a transport seek (`seekTo` → `.late` wrap re-eval, #384).
 * The playhead reads `getSongPosition` (transport-offset-aware), NOT the raw
 * window clock, so it tracks the sought position. This is a deliberate, scoped
 * revision of DV-10 (live window stays read-only; full-song view is drivable).
 *
 * Data: consumes a `SongAnalysis` computed by MusicalTimeline from the IR
 * snapshot via `analyzeSong`. Lanes key on `trackId ?? s ?? '$default'` — the
 * same identity the live view's rows use — so the two views line up.
 */
'use client'

import * as React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SongAnalysis, PatternIR, HapStream } from '@stave/editor'
import {
  collectCycles,
  getMusicalTimelineSubRowHeight,
  onMusicalTimelineSubRowHeightChange,
} from '@stave/editor'
import { SongTimelineLiveOverlay } from './SongTimelineLiveOverlay'
import { paletteForTrack, trackIndexOf } from './musicalTimeline/colors'
import { buildTimelineScene, clipAtCycle } from './musicalTimeline/timelineScene'
import { TrackSwatchPopover } from './TrackSwatchPopover'
import {
  applyStableVoiceOrder,
  EMPTY_VOICE_ORDER,
  type VoiceOrderByLane,
} from './musicalTimeline/stableVoiceOrder'
import { collectNoteMarks } from './musicalTimeline/timelineMarks'
import { computeLaneLayout, laneAtY, type LaneLayout } from './musicalTimeline/laneLayout'
import {
  loadTimelineCamera,
  saveTimelineCamera,
} from './musicalTimeline/timelineCameraPersistence'
import { SongTimelineCanvas } from './SongTimelineCanvas'
import {
  songCycleToX,
  xToSongCycle,
  wrapSongPosition,
  clampZoom,
  clampRestoreZoom,
  contentWidthFor,
  scrollLeftForZoom,
  followScrollLeft,
  rulerTicks,
  MIN_ZOOM,
  ZOOM_STEP,
} from './musicalTimeline/songAxis'

const TAB_ID = 'musical-timeline'
/** How long a manual scroll/seek suspends follow (#415), so auto-scroll never
 *  fights the user mid-gesture, then resumes once they've settled. */
const USER_SCROLL_GUARD_MS = 1200
const CONTROLS_HEIGHT = 26
const TOPBAR_HEIGHT = 28
const GUTTER_WIDTH = 90
/** Height of an expanded ("accordion") lane — tall enough for the read-only
 *  note detail (pitch spread + per-beat grid) to be legible (#422, design §4.5). */
const EXPANDED_ROW_HEIGHT = 96
/** Content-px grip zone around a clip's right edge that arms a trim drag (#437). */
const CLIP_EDGE_GRIP_PX = 6
/** Pointer travel (px) before a clip-body press becomes a MOVE drag rather than a
 *  click (select/seek). Below this it stays a click so seek-anywhere is intact. */
const CLIP_MOVE_THRESHOLD_PX = 4
const FONT_MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace'

/** Ruler units (#412). CYCLES = Strudel's native numbering; BARS = DAW
 *  convention (one cycle ≈ one bar) with quarter-cycle beat ticks. */
type RulerUnits = 'cycles' | 'bars'

export interface FullSongTimelineProps {
  /** Whole-song analysis, or null before the first analysis completes. */
  readonly analysis: SongAnalysis | null
  /** The evaluated IR snapshot — source of the mini-note marks the canvas draws
   *  (collected app-side over the display span). Null before the first eval. */
  readonly ir?: PatternIR | null
  /** The raw user source (`snapshot.code`) — read at each lane's `dollarPos` to
   *  resolve a NAMED track's display LABEL (#579 STEP 2). Null/absent → every
   *  lane keeps its positional `d{N}` name (pre-STEP-2 behaviour). */
  readonly source?: string | null
  /** Live hap stream accessor — drives the per-note LIVE overlay (#500/U3): the
   *  hap stream lights scene marks under the following playhead. Optional — the
   *  overlay simply never lights when unset (the static scene still renders). */
  readonly getHapStream?: () => HapStream | null
  /** Transport-offset-aware song position (cycles), or null when stopped. */
  readonly getSongPosition: () => number | null
  /** Seek the transport to an absolute song cycle. */
  readonly onSeek: (cycle: number) => void
  /** Drawer open state — gates the rAF playhead loop (Trap NEW-1 parity). */
  readonly getDrawerOpen: () => boolean
  /** Active tab id — must equal the timeline tab for the rAF loop to run. */
  readonly getActiveTabId: () => string | null
  /** Bind a clicked lane into the Pattern panel (#422, design §3.1). Receives the
   *  lane's representative source-character offset (or null when the IR has no
   *  source provenance). The parent maps it to a line and moves the editor
   *  cursor, which re-detects the active chunk and rebinds the Sequencer/Piano
   *  Roll. Optional — the view degrades to display-only when unset. */
  readonly onBindLane?: (sourceOffset: number | null) => void
  /** Rename a lane's track (#580, Phase C). Receives the lane's STATEMENT offset
   *  (`labelOffset` = `dollarPos`), the new label, and the lane's OLD display name
   *  (Phase D, #581 — so the parent can MIGRATE a custom-colour override keyed by
   *  the old name to the new one). The parent detects the chunk at the offset and
   *  writes the `name:` label into the code. Optional — the lane name is read-only
   *  when unset, or when a lane has no `labelOffset`. */
  readonly onRenameLane?: (
    labelOffset: number,
    newLabel: string,
    oldDisplayName: string,
  ) => void
  /** Per-track custom colour overrides (Phase D, #581), keyed by lane DISPLAY
   *  NAME. Resolved through the shared `trackIdentity` into `lane.color`, so it
   *  drives the lane dot AND the canvas density bars. Absent → deterministic
   *  palette. */
  readonly customColorByName?: ReadonlyMap<string, string>
  /** Set a track's custom colour (Phase D, #581). Receives the lane's DISPLAY
   *  NAME (the override key) + the chosen hex. The parent writes it to the
   *  per-file `TrackMeta` store. Optional — without it the lane dot is not a
   *  colour-picker trigger (display-only). */
  readonly onSetTrackColor?: (displayName: string, color: string) => void
  /** Clear a track's custom colour → fall back to the palette (Phase D, #581).
   *  Receives the lane's DISPLAY NAME. */
  readonly onResetTrackColor?: (displayName: string) => void
  /** Trim a clip by dragging its right edge (Phase 5b, #437). Receives the
   *  clip's lane source anchor (an offset inside the combinator call), its arm
   *  index, and the new whole-cycle weight. The parent parses the arrangement at
   *  the anchor and writes a surgical set-weight edit. Optional — without it the
   *  clips stay read-only (no trim grips). Only real `arrange`/`cat` arms
   *  (`armIndex ≥ 0`) are trimmable; a bare track's implicit clip is not. */
  readonly onTrimClip?: (req: {
    sourceOffset: number | null
    armIndex: number
    weight: number
  }) => void
  /** Delete a clip (Phase 5c, #386). Fired when a selected clip is removed
   *  (click a clip to select, then Delete/Backspace). Receives the clip's lane
   *  source anchor + arm index; the parent parses the arrangement at the anchor
   *  and writes a surgical remove-arm edit. Optional — without it clips can't be
   *  selected/deleted. A combinator's SOLE remaining arm is not deletable
   *  (a lane keeps ≥1 clip, PV122 #5); the serializer no-ops that case. */
  readonly onDeleteClip?: (req: {
    sourceOffset: number | null
    armIndex: number
  }) => void
  /** Move a clip by dragging its body horizontally (Phase 5c, #386). Only a REAL
   *  arrange/cat arm is movable: `reorder` swaps it to a new slot in the
   *  combinator (`reorderArm(fromIndex → toIndex)`). Clip time-order = arm order
   *  (PV122 #1). A bare track's implicit clip (`armIndex < 0`) is NOT movable —
   *  a uniform pattern tiles every cycle identically, so dragging it would swap
   *  identical content (an identity); injecting a leading `silence` to "place" it
   *  invents a gap the source never had (#488). Starting an arrangement from a
   *  bare pattern is an explicit action (type `arrange(...)`), not a drag. The
   *  parent resolves the anchor and writes the surgical edit. Optional — without
   *  it clips can't be dragged (trim/select/delete still work). */
  readonly onMoveClip?: (
    req: { kind: 'reorder'; sourceOffset: number | null; fromIndex: number; toIndex: number },
  ) => void
  /** Duplicate a clip (Phase 5c, #386). Fired on ⌘/Ctrl-D with a clip selected:
   *  insert a verbatim clone of the arm right after it (`insertArm`). Receives the
   *  clip's lane source anchor + arm index. Real arms only — a bare track's
   *  implicit clip has no arm to clone. Optional. */
  readonly onDuplicateClip?: (req: {
    sourceOffset: number | null
    armIndex: number
  }) => void
  /** Split a clip (Phase 5c, #386). Fired on `S` with a clip selected: slice the
   *  arm at a whole-cycle boundary into two (`splitArm`). `firstWeight` is the
   *  first half's cycle count (the gesture uses the clip midpoint). Only a clip
   *  spanning ≥ 2 cycles is splittable. For a bare track's implicit clip
   *  (`armIndex < 0`) `span` is the clip's whole-song length, so the parent can
   *  MATERIALIZE the loop into `arrange([firstWeight, pat], [span−firstWeight, pat])`
   *  (#489). Real arms ignore `span` (the parser supplies the arm weight). Optional. */
  readonly onSplitClip?: (req: {
    sourceOffset: number | null
    armIndex: number
    firstWeight: number
    span: number
  }) => void
}

/** A bare loop's single implicit clip spans the SONG, not just its one-cycle
 *  period — so it has room to be split into addressable bars (#489 D3). A pure
 *  bare song (no `arrange`/`cat` combinator) is floored to this many cycles;
 *  extensible later via #487. A real arrangement already defines its own span. */
const MIN_BARE_SPAN = 4

/** The natural display span: one loop period, or the analyzed horizon. ≥ 1. */
function naturalSpan(analysis: SongAnalysis | null): number {
  if (!analysis) return 1
  return Math.max(1, analysis.periodCycles ?? analysis.horizonCycles)
}

/** Display span in cycles. The natural span, but a pure bare loop is floored to
 *  `MIN_BARE_SPAN` so its single implicit clip is splittable (#489 D3). A real
 *  arrangement keeps its own length — flooring a period-2 arrange to 4 would paint
 *  empty bars past the last arm. ≥ 1. */
function displaySpan(analysis: SongAnalysis | null, bareSong: boolean): number {
  const natural = naturalSpan(analysis)
  return bareSong ? Math.max(MIN_BARE_SPAN, natural) : natural
}

/** Cycles of empty timeline kept PAST the dragged edge while EXTENDING the last
 *  clip, so there's always room to drag into (#487). Transient — present only
 *  mid-drag; at rest the span is exactly the song (no permanent blank). */
const EXTEND_MARGIN_CYCLES = 2
/** Viewport-right band (px) where a live extend drag auto-scrolls more empty
 *  timeline into view (classic drag-edge autoscroll). */
const EXTEND_AUTOSCROLL_BAND_PX = 48
/** Max px the autoscroll advances per frame while the cursor is held in the band
 *  — a deliberate, controllable pace (~7px/frame ≈ 420px/s at 60fps), not a rush. */
const EXTEND_AUTOSCROLL_STEP_PX = 7

export function FullSongTimeline(props: FullSongTimelineProps): React.ReactElement {
  const { analysis, onSeek } = props
  // A pure bare loop gets a floored, splittable display span (#489 D3); a real
  // arrangement keeps its own length. "Bare" = NO collected event carries an
  // `armIndex` (no `arrange`/`cat` combinator). We probe over the natural span so
  // an arrange whose first cycles are silent still registers its later arms. This
  // reads the runtime collector (mockable, so the gesture tests stay correct) —
  // NOT the raw IR shape, which tests pass opaquely.
  const natCycles = naturalSpan(analysis)
  const bareSong = useMemo(() => {
    if (props.ir == null) return false
    const evs = collectCycles(props.ir, 0, Math.max(1, Math.ceil(natCycles))) as Array<{
      armIndex?: number
    }>
    return !evs.some((e) => typeof e.armIndex === 'number')
  }, [props.ir, natCycles])
  // The TRUE content length — the rest span; also the playhead loop-wrap, the
  // note-mark collection window, and the bare-track implicit clip's end. The bare
  // floor (#489) is folded in HERE so the clip extents use the floored span while
  // the extend-drag (#487) layers a transient viewport span on top.
  const loopCycles = displaySpan(analysis, bareSong)
  // While EXTENDING the last clip, the visual span temporarily grows past the
  // content so there's empty timeline to drag into (#487). null at rest →
  // displayCycles == loopCycles (no permanent blank). `contentWidth` scales with
  // the span (below) so px/cycle stays constant: the grid WIDENS + auto-scrolls
  // instead of compressing, and the dragged edge tracks the cursor 1:1.
  const [dragSpanCycles, setDragSpanCycles] = useState<number | null>(null)
  const displayCycles = dragSpanCycles ?? loopCycles
  const dragSpanRef = useRef<number | null>(dragSpanCycles)
  dragSpanRef.current = dragSpanCycles
  const loopCyclesRef = useRef(loopCycles)
  loopCyclesRef.current = loopCycles

  // ── Grid width via ResizeObserver (mirrors MusicalTimeline DB-04) ────────
  const areaRef = useRef<HTMLDivElement>(null)
  const [areaWidth, setAreaWidth] = useState(0)
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') {
      setAreaWidth(el.clientWidth ?? 0)
      return
    }
    const ro = new ResizeObserver((entries) => {
      setAreaWidth(Math.max(0, entries[0]?.contentRect.width ?? 0))
    })
    ro.observe(el)
    setAreaWidth(el.clientWidth ?? 0)
    return () => ro.disconnect()
  }, [])

  // ── Zoom + horizontal scroll + ruler units (#412) ────────────────────────
  // zoom=1 fits the whole loop; >1 widens `contentWidth` past the viewport and
  // the grid scrolls horizontally. The ruler tracks the grid's scrollLeft (one
  // scrollbar, on the grid). Refs mirror state so the imperative wheel/button
  // handlers and the seek math read live values without stale closures.
  // Seed zoom from the persisted camera (#501/U4) so a reload restores the
  // user's last zoom — but cap the *restored* value (#505): an extreme stored
  // zoom would land on a center-locked playhead (the song scrolls under a pinned
  // playhead) that reads as frozen on a fresh load. `clampRestoreZoom` keeps the
  // landing within a range where the playhead visibly glides; live zoom still
  // spans the full `clampZoom` range. The save effect below then re-persists the
  // capped value, so the camera converges to a restorable zoom.
  const [zoom, setZoom] = useState(() => {
    const c = loadTimelineCamera()
    return c && Number.isFinite(c.zoom) ? clampRestoreZoom(c.zoom) : MIN_ZOOM
  })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [units, setUnits] = useState<RulerUnits>('cycles')
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const scrollLeftRef = useRef(scrollLeft)
  scrollLeftRef.current = scrollLeft
  const areaWidthRef = useRef(areaWidth)
  areaWidthRef.current = areaWidth

  // ── Follow / auto-scroll (#415) ──────────────────────────────────────────
  // When zoomed, the playhead can advance off the right edge. Follow nudges
  // scrollLeft to keep it in a centered dead-zone band (followScrollLeft). It
  // pauses briefly while the user manually scrolls/seeks so it never fights
  // their navigation. displayCyclesRef lets the rAF loop read the live span
  // without re-creating the loop per analysis change.
  const [follow, setFollow] = useState(true)
  const followRef = useRef(follow)
  followRef.current = follow
  const displayCyclesRef = useRef(displayCycles)
  displayCyclesRef.current = displayCycles
  // Suspends follow until this timestamp (set on user scroll/seek).
  const userScrollUntilRef = useRef(0)
  // The last scrollLeft *we* wrote to the DOM — lets the scroll handler tell a
  // follow/zoom-driven scroll (don't suspend) from a user drag/wheel (suspend).
  const programmaticScrollRef = useRef(-1)

  const restContentWidth = contentWidthFor(areaWidth, zoom)
  // While extending, scale contentWidth with the grown span so px/cycle is the
  // SAME as at rest — the grid widens past the viewport and scrolls, instead of
  // compressing the clips (#487, constant-ppc grow + auto-scroll). At rest
  // (dragSpanCycles == null) this is just the fit-to-view width.
  const contentWidth =
    dragSpanCycles != null && loopCycles > 0
      ? (restContentWidth * dragSpanCycles) / loopCycles
      : restContentWidth
  const pxPerCycle = displayCycles > 0 ? contentWidth / displayCycles : 0
  const ticks = rulerTicks(displayCycles, pxPerCycle, units)

  // Content width as the pointer handlers see it: rest width (zoom-scaled),
  // scaled by the live (grown) drag span so the handler math matches the
  // rendered transform during an extend (#487). Rest width when not extending.
  const dragAwareContentWidth = React.useCallback((viewportWidth: number): number => {
    const rest = contentWidthFor(viewportWidth, zoomRef.current)
    const ds = dragSpanRef.current
    const lc = loopCyclesRef.current
    return ds != null && lc > 0 ? (rest * ds) / lc : rest
  }, [])
  // Constant px/cycle (the REST basis) — the extend drag maps the cursor at this
  // fixed scale so the dragged edge follows 1:1 with no jump as the span grows.
  const restPxPerCycle = React.useCallback((viewportWidth: number): number => {
    const lc = loopCyclesRef.current
    return lc > 0 ? contentWidthFor(viewportWidth, zoomRef.current) / lc : 0
  }, [])

  // Apply a new zoom, keeping the song point under `cursorX` (viewport-relative)
  // pinned beneath the cursor. State drives the new content width; the layout
  // effect below pushes the matching scrollLeft onto the DOM after it grows.
  const applyZoom = React.useCallback((rawZoom: number, cursorX: number): void => {
    const vw = areaWidthRef.current
    const oldZoom = zoomRef.current
    const newZoom = clampZoom(rawZoom)
    if (newZoom === oldZoom) return
    const next = Math.round(
      scrollLeftForZoom({
        oldZoom,
        newZoom,
        scrollLeft: scrollLeftRef.current,
        cursorX,
        viewportWidth: vw,
      }),
    )
    zoomRef.current = newZoom
    scrollLeftRef.current = next
    setZoom(newZoom)
    setScrollLeft(next)
  }, [])

  // Buttons zoom around the viewport centre; the gesture is identical to wheel
  // zoom with the cursor parked mid-view.
  const zoomBy = React.useCallback(
    (factor: number) => applyZoom(zoomRef.current * factor, areaWidthRef.current / 2),
    [applyZoom],
  )
  const fitZoom = React.useCallback(() => applyZoom(MIN_ZOOM, areaWidthRef.current / 2), [applyZoom])

  // Ctrl/⌘ + wheel = cursor-centred zoom. A native non-passive listener is
  // required: React's synthetic onWheel is passive, so preventDefault (which
  // suppresses the browser's page-zoom) would be ignored.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return // plain wheel → native horizontal scroll
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      applyZoom(zoomRef.current * factor, cursorX)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // Push scrollLeft onto the DOM after a zoom/resize changes the content width,
  // clamping into the (possibly shrunk) scrollable range. Keyed on zoom+width
  // only, so user scrolling (which sets scrollLeft via onScroll) never refights.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const maxScroll = Math.max(0, contentWidthFor(areaWidth, zoom) - areaWidth)
    const clamped = Math.max(0, Math.min(maxScroll, scrollLeftRef.current))
    scrollLeftRef.current = clamped
    // This is a programmatic (zoom/resize-driven) scroll, not a user drag —
    // mark it so the scroll handler doesn't suspend follow.
    programmaticScrollRef.current = clamped
    if (el.scrollLeft !== clamped) el.scrollLeft = clamped
    setScrollLeft((prev) => (prev === clamped ? prev : clamped))
  }, [zoom, areaWidth])

  const handleGridScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft
    scrollLeftRef.current = sl
    setScrollLeft((prev) => (prev === sl ? prev : sl))
    // A scroll we didn't write (> 1px from our last programmatic value) is a
    // user drag/wheel-pan → suspend follow briefly so it doesn't fight them.
    if (Math.abs(sl - programmaticScrollRef.current) > 1) {
      userScrollUntilRef.current = Date.now() + USER_SCROLL_GUARD_MS
    }
  }, [])

  // ── rAF playhead, gated on drawer-open + active-tab (DB-02 parity) ───────
  const accessorsRef = useRef(props)
  accessorsRef.current = props
  const [songPos, setSongPos] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    let raf: number | null = null
    // Auto-scroll the grid so the playhead stays in a centered band, unless
    // follow is off or the user just scrolled/seeked. The DOM write is tagged
    // programmatic (via programmaticScrollRef) so the scroll handler doesn't
    // mistake it for a user drag and suspend follow. Reads live state through
    // refs; the playhead element itself stays put in content space, so the grid
    // scroll is the only motion. No-op when not zoomed (followScrollLeft → cur).
    const applyFollow = (pos: number | null): void => {
      if (!followRef.current || pos == null) return
      if (Date.now() < userScrollUntilRef.current) return
      const dc = displayCyclesRef.current
      const vw = areaWidthRef.current
      const cw = dragAwareContentWidth(vw)
      const ph = songCycleToX(wrapSongPosition(pos, loopCyclesRef.current), dc, cw)
      const target = followScrollLeft(ph, vw, cw, scrollLeftRef.current)
      if (Math.abs(target - scrollLeftRef.current) < 1) return
      const el = areaRef.current
      if (!el) return
      programmaticScrollRef.current = target
      scrollLeftRef.current = target
      el.scrollLeft = target
      setScrollLeft((prev) => (prev === target ? prev : target))
    }
    const tick = (): void => {
      if (cancelled) return
      const a = accessorsRef.current
      if (!a.getDrawerOpen() || a.getActiveTabId() !== TAB_ID) {
        raf = null
        return
      }
      const pos = a.getSongPosition()
      setSongPos((prev) => (prev === pos ? prev : pos))
      applyFollow(pos)
      raf = requestAnimationFrame(tick)
    }
    if (props.getDrawerOpen() && props.getActiveTabId() === TAB_ID) {
      raf = requestAnimationFrame(tick)
    }
    const poke = setInterval(() => {
      if (cancelled) return
      if (raf == null && accessorsRef.current.getDrawerOpen() && accessorsRef.current.getActiveTabId() === TAB_ID) {
        raf = requestAnimationFrame(tick)
      }
      const sampled = accessorsRef.current.getSongPosition()
      setSongPos((prev) => (prev === sampled ? prev : sampled))
    }, 250)
    return () => {
      cancelled = true
      clearInterval(poke)
      if (raf != null) cancelAnimationFrame(raf)
      setSongPos(null)
    }
    // Accessors read through the ref; deps would re-create the loop per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wrap the playhead at the TRUE period (not the padded extend span) so it
  // loops with the audio, never into the transient trailing room (#487).
  const wrappedPos = wrapSongPosition(songPos, loopCycles)
  // Playhead lives in CONTENT space (inside the scrolled/translated inner div),
  // so it maps against contentWidth, not the viewport width.
  const playheadX = songCycleToX(wrappedPos, displayCycles, contentWidth)
  const playheadVisible = wrappedPos != null

  // ── Click → seek (relaxes DV-10) ─────────────────────────────────────────
  // The ruler and grid share the grid's scrollLeft and the same left edge, so a
  // click anywhere resolves through the grid's rect: viewport-x + scrollLeft is
  // the content-x, inverted against contentWidth.
  const handleSeekAtClientX = React.useCallback(
    (clientX: number) => {
      const el = areaRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const contentX = clientX - rect.left + scrollLeftRef.current
      const cycle = xToSongCycle(contentX, displayCycles, dragAwareContentWidth(rect.width))
      // A manual seek is user navigation — suspend follow briefly so it doesn't
      // immediately yank the view back as the sought playhead resumes. Clamp to
      // the true song end so a click in the transient extend room (past the song)
      // seeks to the end, not into empty space (#487).
      userScrollUntilRef.current = Date.now() + USER_SCROLL_GUARD_MS
      onSeek(Math.min(cycle, loopCycles))
    },
    [displayCycles, loopCycles, dragAwareContentWidth, onSeek],
  )

  const sections = analysis?.sections ?? []

  // Canvas scene: per-lane density (from analysis) + capped mini-note marks
  // (collected app-side from the IR over the display span). Memoised so the
  // collect + build run only when the analysis or IR changes — NOT on scroll or
  // zoom (those only move the shared transform the canvas already redraws against).
  // Marks are collected over the TRUE content length (`loopCycles`, bare-floor
  // included #489) — collecting over the grown extend span (#487) would tile the
  // looping pattern into the trailing room instead of leaving it empty. The
  // scene's transform basis still uses the (possibly grown) `displayCycles` so the
  // canvas and the component agree (PV116).
  const marks = useMemo(() => collectNoteMarks(props.ir ?? null, loopCycles), [props.ir, loopCycles])
  // Per-lane voice sub-row order is pinned first-seen across re-evals (#480) so
  // reordering clips in time doesn't reshuffle the instrument rows — the SAME
  // first-seen stability `stableTrackOrder` gives the top-level lanes, one level
  // down. The previous order rides in a ref and is threaded back each rebuild
  // (mirrors MusicalTimeline's `slotMapRef`). Recomputed only when the analysis,
  // marks, or display span change (NOT on scroll/zoom), idempotent on a no-op
  // re-eval. The scene is built over the (possibly grown) `displayCycles` span so
  // clip geometry and the bare-split materialize agree on where each clip ends.
  const voiceOrderRef = useRef<VoiceOrderByLane>(EMPTY_VOICE_ORDER)
  const source = props.source ?? null
  // Per-track custom-colour overrides (Phase D, #581). The map identity is
  // ref-stable (from `useTrackMetaMap`), changing only when an override is
  // set/cleared — so adding it to the scene deps recolours lanes (dot + canvas)
  // exactly when the user picks, not on every render.
  const { customColorByName } = props
  const scene = useMemo(() => {
    const raw = buildTimelineScene(analysis, marks, displayCycles, source, customColorByName)
    const { scene: ordered, order } = applyStableVoiceOrder(raw, voiceOrderRef.current)
    voiceOrderRef.current = order
    return ordered
  }, [analysis, marks, displayCycles, source, customColorByName])

  // ── Expand + bind (#422) ─────────────────────────────────────────────────
  // Click/expand a lane → accordion it taller (read-only note detail) AND bind
  // its pattern into the Pattern panel. Multi-expand is a Set (cross-track
  // alignment). The layout is the single vertical source of truth shared by the
  // canvas draw, the canvas host height, the DOM lane labels, and the hit-test.
  const { onBindLane } = props
  // Seed expanded lanes from the persisted camera (#501/U4). Stale lane keys
  // (from another song) are harmless — computeLaneLayout only expands lanes
  // present in the current scene.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(loadTimelineCamera()?.expanded ?? []),
  )
  // Lane + per-voice sub-row height follow the shared "timeline row height"
  // editor setting (#459) — the same source the Live monitor reads — so the
  // Song view matches it instead of a private constant. The setting governs
  // every row in the Live view (each leaf voice is one `subRowHeight`), so it
  // feeds BOTH the collapsed lane height and the expanded sub-row height here;
  // the EXPANDED single-band note-detail height stays a fixed zoom.
  const [rowH, setRowH] = useState<number>(() => getMusicalTimelineSubRowHeight())
  useEffect(() => onMusicalTimelineSubRowHeightChange(setRowH), [])
  const layout = useMemo(
    () => computeLaneLayout(scene.lanes, expanded, rowH, EXPANDED_ROW_HEIGHT, rowH),
    [scene.lanes, expanded, rowH],
  )
  // Refs so the double-click hit-test reads live scene/layout without stale
  // closures (mirrors the scrollLeftRef/zoomRef pattern above).
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  // laneKey → lane, for the DOM lane labels to read the resolved display NAME +
  // colour (#579 STEP 2). The `box`es (from `computeLaneLayout`) carry only the
  // identity `laneKey`; the display fields live on the scene lane.
  const laneByKey = useMemo(
    () => new Map(scene.lanes.map((l) => [l.laneKey, l])),
    [scene],
  )
  // Which lane's header is being inline-renamed (#580, Phase C), by laneKey.
  const { onRenameLane } = props
  const [renamingLane, setRenamingLane] = useState<string | null>(null)
  // Which lane's colour swatch is open (Phase D, #581), by laneKey + the anchor
  // rect of its dot. Picking writes to the per-file TrackMeta store via the
  // parent; the lane recolours through the ref-stable `customColorByName` map.
  const { onSetTrackColor, onResetTrackColor } = props
  const [colorPickerLane, setColorPickerLane] = useState<
    { laneKey: string; name: string; rect: DOMRect } | null
  >(null)
  const layoutRef = useRef<LaneLayout>(layout)
  layoutRef.current = layout

  // Persist the camera (zoom + expanded lanes) so a reload restores it
  // (#501/U4). Global, best-effort; fires on each change — these are user
  // gestures (zoom button/wheel, expand toggle), not per-frame churn.
  useEffect(() => {
    saveTimelineCamera({ zoom, expanded: [...expanded] })
  }, [zoom, expanded])

  // Toggle a lane's expansion and bind it into the Pattern panel. Binding fires
  // on every activation (expand OR collapse) — clicking a lane selects it.
  const activateLane = React.useCallback(
    (laneKey: string) => {
      const lane = sceneRef.current.lanes.find((l) => l.laneKey === laneKey)
      onBindLane?.(lane?.sourceOffset ?? null)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(laneKey)) next.delete(laneKey)
        else next.add(laneKey)
        return next
      })
    },
    [onBindLane],
  )

  // Double-click in the grid body → hit-test the Y to a lane (the spatial index
  // is the layout) → activate it. Single click stays a seek (seek-anywhere).
  const handleExpandAtClientY = React.useCallback(
    (clientY: number) => {
      const el = areaRef.current
      if (!el) return
      // The grid is full-height (vertical scroll lives on the parent body, which
      // moves the grid's rect), so content-Y is just clientY minus the rect top.
      const contentY = clientY - el.getBoundingClientRect().top
      const laneKey = laneAtY(layoutRef.current, contentY)
      if (laneKey != null) activateLane(laneKey)
    },
    [activateLane],
  )

  // ── Trim a clip: drag its right edge → set the arm's cycle weight (#437) ───
  // The first arrangement EDIT gesture. A clip is one arm of an arrange/cat
  // combinator, so trimming changes the arm's whole-cycle span (the weight `n`).
  // The hit-test + drag run in content space over the shared transform (PV116);
  // the commit hands the new weight up to `onTrimClip`, which writes a surgical
  // set-weight edit. The implicit clip of a bare track (`armIndex < 0`) is NOT
  // trimmable here — wrapping it in a combinator is a later op (§2.1).
  const { onTrimClip } = props
  const [trimEdgeX, setTrimEdgeX] = useState<number | null>(null)
  const trimDragRef = useRef<{
    pointerId: number
    sourceOffset: number | null
    armIndex: number
    startCycle: number
    origWeight: number
    weight: number
    /** Latest pointer clientX — the rAF auto-scroll reads it so HOLDING the edge
     *  in the right-edge band keeps scrolling empty timeline in (#487). */
    lastClientX: number
  } | null>(null)
  // rAF handle for the extend auto-scroll (runs only while the cursor is held in
  // the right-edge band during a trim drag).
  const trimRafRef = useRef<number | null>(null)

  // ── Select + delete a clip (Phase 5c, #386) ───────────────────────────────
  // Clicking a clip's BODY selects it (and still seeks — seek-anywhere is
  // preserved); Delete/Backspace then drops the arm. Only real arms
  // (`armIndex ≥ 0`) are selectable; a bare track's implicit clip has no arm to
  // remove. Selection is keyed by lane + arm; the highlight rect is re-derived
  // in render from the live scene/layout so it tracks zoom, scroll, and re-eval.
  const { onDeleteClip, onMoveClip, onDuplicateClip, onSplitClip } = props
  const [selected, setSelected] = useState<{
    laneKey: string
    armIndex: number
    sourceOffset: number | null
  } | null>(null)

  // ── Move a clip: drag its body horizontally (Phase 5c, #386) ──────────────
  // A body press starts a PENDING gesture: if the pointer travels past the
  // threshold it becomes a MOVE drag (reorder a real arm, or wrap a bare track,
  // §2.1); otherwise it stays a click (select + seek). The ghost rect previews
  // where the clip will land. Reads live refs so the handlers are closure-stable.
  const moveDragRef = useRef<{
    pointerId: number
    sourceOffset: number | null
    armIndex: number // dragged clip's arm; < 0 = bare implicit clip (→ wrap)
    laneKey: string
    startClientX: number
    startCycle: number
    endCycle: number
    dragging: boolean
    toIndex: number // reorder target (real arm)
  } | null>(null)
  const [moveGhost, setMoveGhost] = useState<{
    left: number
    width: number
    top: number
    height: number
  } | null>(null)

  // Hit-test a clip BODY (not its edge) under a client point → { lane, clip },
  // or null. Matches CONTAINMENT (`clipAtCycle`). `includeBare` keeps a bare
  // track's implicit clip (armIndex < 0): it is SELECTABLE (#489 — select then
  // split/delete) but still NOT MOVABLE (#488 — a uniform loop can't reorder/wrap;
  // the move path passes `false`).
  const clipBodyAt = React.useCallback(
    (clientX: number, clientY: number, includeBare = false) => {
      const el = areaRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const cw = dragAwareContentWidth(rect.width)
      const contentX = clientX - rect.left + scrollLeftRef.current
      const laneKey = laneAtY(layoutRef.current, clientY - rect.top)
      if (laneKey == null) return null
      const lane = sceneRef.current.lanes.find((l) => l.laneKey === laneKey)
      if (!lane) return null
      const cyc = xToSongCycle(contentX, displayCycles, cw)
      const clip = clipAtCycle(lane, cyc)
      if (!clip || (clip.armIndex < 0 && !includeBare)) return null
      return { lane, clip }
    },
    [displayCycles, dragAwareContentWidth],
  )

  // The combinator's arms as time-spans, in arm order — gathered across ALL
  // lanes (each arm is one clip, but different `s` arms land in different lanes).
  // The drop target for a reorder is the arm whose span the pointer falls in.
  const armSpansNow = React.useCallback(
    () =>
      sceneRef.current.lanes
        .flatMap((l) => l.clips)
        .filter((c) => c.armIndex >= 0)
        .sort((a, b) => a.armIndex - b.armIndex),
    [],
  )

  // Hit-test a clip's right edge under a client point → the draggable clip, or
  // null. We scan the lane's clips and match proximity to each clip's RIGHT EDGE
  // directly (not `clipAtCycle`): that grabs the LAST clip's edge too (its end is
  // the song end, contained in no clip) and disambiguates a shared boundary to
  // the clip whose edge is nearest. Reads live refs so it's closure-stable.
  const clipEdgeAt = React.useCallback(
    (clientX: number, clientY: number): { lane: (typeof sceneRef.current.lanes)[number]; clip: NonNullable<ReturnType<typeof clipAtCycle>> } | null => {
      if (!onTrimClip) return null
      const el = areaRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const cw = dragAwareContentWidth(rect.width)
      const contentX = clientX - rect.left + scrollLeftRef.current
      const laneKey = laneAtY(layoutRef.current, clientY - rect.top)
      if (laneKey == null) return null
      const lane = sceneRef.current.lanes.find((l) => l.laneKey === laneKey)
      if (!lane) return null
      let best: NonNullable<ReturnType<typeof clipAtCycle>> | null = null
      let bestDist = CLIP_EDGE_GRIP_PX
      for (const clip of lane.clips) {
        if (clip.armIndex < 0) continue // implicit/bare clip: not trimmable
        const dist = Math.abs(contentX - songCycleToX(clip.endCycle, displayCycles, cw))
        if (dist <= bestDist) {
          best = clip
          bestDist = dist
        }
      }
      return best ? { lane, clip: best } : null
    },
    [onTrimClip, displayCycles, dragAwareContentWidth],
  )

  // Apply an extend at a given clientX: map the cursor to a whole-cycle weight at
  // the CONSTANT rest px/cycle (edge tracks the cursor 1:1), grow the visual span
  // so there's room past the edge, and move the trim-edge ghost. Shared by the
  // pointer-move handler and the rAF auto-scroll so HOLDING at the edge keeps
  // extending against the scrolled-in room (#487).
  const applyTrim = React.useCallback(
    (clientX: number): void => {
      const drag = trimDragRef.current
      const el = areaRef.current
      if (!drag || !el) return
      const rect = el.getBoundingClientRect()
      const ppc = restPxPerCycle(rect.width)
      if (ppc <= 0) return
      const contentX = clientX - rect.left + scrollLeftRef.current
      const newEnd = Math.max(drag.startCycle + 1, Math.round(contentX / ppc))
      drag.weight = newEnd - drag.startCycle
      const needed = Math.max(loopCyclesRef.current, newEnd + EXTEND_MARGIN_CYCLES)
      if (dragSpanRef.current == null || needed > dragSpanRef.current) {
        dragSpanRef.current = needed
        setDragSpanCycles(needed)
      }
      const gcw = dragAwareContentWidth(rect.width)
      setTrimEdgeX(songCycleToX(newEnd, dragSpanRef.current ?? loopCyclesRef.current, gcw))
    },
    [restPxPerCycle, dragAwareContentWidth],
  )

  const stopExtendAutoScroll = React.useCallback((): void => {
    if (trimRafRef.current != null) {
      cancelAnimationFrame(trimRafRef.current)
      trimRafRef.current = null
    }
  }, [])

  // Auto-scroll loop: while a trim drag holds the cursor in the right-edge band,
  // advance scrollLeft each frame (programmatic — marked so the scroll handler
  // doesn't treat it as a user pan, PV118) and re-apply the extend so the edge
  // follows the revealed empty timeline. Self-cancels when the drag ends or the
  // cursor leaves the band.
  const extendAutoScrollTick = React.useCallback((): void => {
    const drag = trimDragRef.current
    const el = areaRef.current
    if (!drag || !el) {
      trimRafRef.current = null
      return
    }
    const rect = el.getBoundingClientRect()
    const into = drag.lastClientX - (rect.left + rect.width - EXTEND_AUTOSCROLL_BAND_PX)
    if (into > 0) {
      const gcw = dragAwareContentWidth(rect.width)
      const maxScroll = Math.max(0, gcw - rect.width)
      const step = Math.min(EXTEND_AUTOSCROLL_STEP_PX, Math.max(2, into * 0.16))
      const next = Math.min(maxScroll, scrollLeftRef.current + step)
      if (next > scrollLeftRef.current) {
        scrollLeftRef.current = next
        programmaticScrollRef.current = next
        el.scrollLeft = next
        setScrollLeft(next)
        applyTrim(drag.lastClientX)
      }
    }
    trimRafRef.current = requestAnimationFrame(extendAutoScrollTick)
  }, [applyTrim, dragAwareContentWidth])

  const handleGridPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      // Take keyboard focus on any grid press so the clip-op shortcuts (S split,
      // ⌘/Ctrl-D duplicate, Delete/Backspace) reach `handleGridKeyDown`. The
      // clip-select and trim branches below call `preventDefault()` (to suppress
      // text selection + the native drag image), which ALSO suppresses the
      // browser's default focus-on-pointerdown — so without this explicit focus
      // the grid (tabIndex=0) never becomes `document.activeElement` and the
      // keystroke leaks to Monaco / the last-focused control (#488). `preventScroll`
      // so taking focus never yanks the timeline into view mid-gesture.
      areaRef.current?.focus({ preventScroll: true })
      const hit = clipEdgeAt(e.clientX, e.clientY)
      if (!hit) {
        // Not a clip edge. A press on a clip BODY begins a PENDING gesture that
        // resolves on pointer-up: a MOVE drag if the pointer travelled, else a
        // click (select + seek). A press off any clip clears selection + seeks.
        const interactive = !!(onDeleteClip || onMoveClip || onDuplicateClip || onSplitClip)
        // Include the bare clip: it's selectable (#489). It won't move — a bare
        // press has no reorder target (armSpansNow is empty) and the move commit
        // no-ops for armIndex < 0, so the gesture resolves to a select on pointer-up.
        const body = interactive ? clipBodyAt(e.clientX, e.clientY, true) : null
        if (body) {
          e.preventDefault()
          try {
            areaRef.current?.setPointerCapture?.(e.pointerId)
          } catch {
            /* best-effort (jsdom / inactive pointer) */
          }
          userScrollUntilRef.current = Date.now() + USER_SCROLL_GUARD_MS
          moveDragRef.current = {
            pointerId: e.pointerId,
            // Clip gestures bind the OUTER combinator (#451) so a nested
            // arrange-of-cat arm edits as one outer clip; falls back to the
            // inner anchor (equal for a non-nested lane). Bind keeps `sourceOffset`.
            sourceOffset: body.lane.arrangeOffset ?? body.lane.sourceOffset,
            armIndex: body.clip.armIndex,
            laneKey: body.lane.laneKey,
            startClientX: e.clientX,
            startCycle: body.clip.startCycle,
            endCycle: body.clip.endCycle,
            dragging: false,
            toIndex: body.clip.armIndex,
          }
          return
        }
        setSelected(null)
        handleSeekAtClientX(e.clientX)
        return
      }
      // Begin a trim drag: capture the pointer so the whole gesture is ours and
      // suspend follow so auto-scroll doesn't fight it mid-drag.
      e.preventDefault()
      try {
        areaRef.current?.setPointerCapture?.(e.pointerId)
      } catch {
        /* capture is best-effort (jsdom / inactive pointer) — drag still works */
      }
      userScrollUntilRef.current = Date.now() + USER_SCROLL_GUARD_MS
      const w = hit.clip.endCycle - hit.clip.startCycle
      trimDragRef.current = {
        pointerId: e.pointerId,
        // Outer-combinator anchor for the arrange op (#451); see move ref above.
        sourceOffset: hit.lane.arrangeOffset ?? hit.lane.sourceOffset,
        armIndex: hit.clip.armIndex,
        startCycle: hit.clip.startCycle,
        origWeight: w,
        weight: w,
        lastClientX: e.clientX,
      }
      const cw = dragAwareContentWidth(areaRef.current!.getBoundingClientRect().width)
      setTrimEdgeX(songCycleToX(hit.clip.endCycle, displayCycles, cw))
    },
    [clipEdgeAt, clipBodyAt, handleSeekAtClientX, displayCycles, dragAwareContentWidth, onDeleteClip, onMoveClip],
  )

  const handleGridPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const el = areaRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cw = dragAwareContentWidth(rect.width)
      const drag = trimDragRef.current
      if (drag && e.pointerId === drag.pointerId) {
        // EXTEND: the edge tracks the cursor 1:1 at the constant rest px/cycle and
        // the span grows to make room (applyTrim). While the cursor is held in the
        // right-edge band, the rAF auto-scroll pulls more empty timeline into view
        // so the edge can keep going past the viewport (#487 — grow + auto-scroll).
        drag.lastClientX = e.clientX
        applyTrim(e.clientX)
        const into = e.clientX - (rect.left + rect.width - EXTEND_AUTOSCROLL_BAND_PX)
        if (into > 0) {
          if (trimRafRef.current == null) trimRafRef.current = requestAnimationFrame(extendAutoScrollTick)
        } else {
          stopExtendAutoScroll()
        }
        return
      }
      // Move drag (Phase 5c): once the press travels past the threshold, preview
      // the reorder destination (the arm whose span the pointer falls in) and
      // stash it on the ref for commit. Only real arms reach here — a bare clip
      // can't start a move (clipBodyAt excludes it, #488).
      const mv = moveDragRef.current
      if (mv && e.pointerId === mv.pointerId) {
        if (!mv.dragging && Math.abs(e.clientX - mv.startClientX) < CLIP_MOVE_THRESHOLD_PX) return
        mv.dragging = true
        const contentX = e.clientX - rect.left + scrollLeftRef.current
        const cyc = xToSongCycle(contentX, displayCycles, cw)
        const box = layoutRef.current.boxes.find((b) => b.laneKey === mv.laneKey)
        const spans = armSpansNow()
        let to = mv.armIndex
        if (spans.length) {
          const inSpan = spans.find((s) => cyc >= s.startCycle && cyc < s.endCycle)
          to = inSpan
            ? inSpan.armIndex
            : cyc < spans[0].startCycle
              ? spans[0].armIndex
              : spans[spans.length - 1].armIndex
        }
        mv.toIndex = to
        const tgt = spans.find((s) => s.armIndex === to)
        if (box && tgt) {
          const left = songCycleToX(tgt.startCycle, displayCycles, cw)
          const right = songCycleToX(tgt.endCycle, displayCycles, cw)
          setMoveGhost({ left, width: Math.max(2, right - left), top: box.top, height: box.height })
        }
        return
      }
      // Not dragging: cursor affordance — col-resize over an edge, grab over a
      // movable body. Direct style write (no React state) so hover never churns.
      el.style.cursor = clipEdgeAt(e.clientX, e.clientY)
        ? 'col-resize'
        : onMoveClip && clipBodyAt(e.clientX, e.clientY)
          ? 'grab'
          : ''
    },
    [clipEdgeAt, clipBodyAt, armSpansNow, displayCycles, dragAwareContentWidth, applyTrim, extendAutoScrollTick, stopExtendAutoScroll, onMoveClip],
  )

  const endTrimDrag = React.useCallback(
    (e: React.PointerEvent, commit: boolean) => {
      const drag = trimDragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return
      trimDragRef.current = null
      setTrimEdgeX(null)
      stopExtendAutoScroll()
      // Collapse the transient extend room → refit to the song (no permanent
      // blank). The committed re-eval grows the period so the extended clip
      // fills the timeline; until then we snap back to the pre-drag fit.
      if (dragSpanRef.current != null) {
        dragSpanRef.current = null
        setDragSpanCycles(null)
        scrollLeftRef.current = 0
        programmaticScrollRef.current = 0
        if (areaRef.current) areaRef.current.scrollLeft = 0
        setScrollLeft(0)
      }
      try {
        areaRef.current?.releasePointerCapture?.(e.pointerId)
      } catch {
        /* best-effort */
      }
      if (commit && drag.weight !== drag.origWeight) {
        onTrimClip?.({
          sourceOffset: drag.sourceOffset,
          armIndex: drag.armIndex,
          weight: drag.weight,
        })
      }
    },
    [onTrimClip, stopExtendAutoScroll],
  )

  // Cancel any in-flight extend auto-scroll on unmount (the drag's own teardown
  // handles the normal case; this guards an unmount mid-drag).
  useEffect(() => stopExtendAutoScroll, [stopExtendAutoScroll])

  // End a body gesture (Phase 5c). A non-drag is a CLICK → select (real arm) +
  // seek. A drag commits a MOVE: reorder a real arm, or wrap a bare clip (§2.1).
  const endBodyDrag = React.useCallback(
    (e: React.PointerEvent, commit: boolean) => {
      const mv = moveDragRef.current
      if (!mv || e.pointerId !== mv.pointerId) return
      moveDragRef.current = null
      setMoveGhost(null)
      try {
        areaRef.current?.releasePointerCapture?.(e.pointerId)
      } catch {
        /* best-effort */
      }
      if (!mv.dragging) {
        // A click selects the clip — real arm OR a bare track's implicit clip
        // (armIndex < 0), which is then splittable/deletable (#489). Seek-anywhere
        // is preserved.
        setSelected({ laneKey: mv.laneKey, armIndex: mv.armIndex, sourceOffset: mv.sourceOffset })
        handleSeekAtClientX(e.clientX)
        return
      }
      if (!commit) return
      // Only real arms reach a move commit (bare clips never start one, #488).
      if (mv.toIndex !== mv.armIndex) {
        onMoveClip?.({ kind: 'reorder', sourceOffset: mv.sourceOffset, fromIndex: mv.armIndex, toIndex: mv.toIndex })
        // The arm list reindexes after a reorder, so the held armIndex would
        // now point at a different clip — clear it (matching DELETE).
        setSelected(null)
      }
    },
    [handleSeekAtClientX, onMoveClip],
  )

  // Unified pointer end: a live trim drag wins; otherwise resolve the body
  // gesture. Cancel discards (no commit).
  const handleGridPointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      if (trimDragRef.current) {
        endTrimDrag(e, true)
        return
      }
      endBodyDrag(e, true)
    },
    [endTrimDrag, endBodyDrag],
  )
  const handleGridPointerCancel = React.useCallback(
    (e: React.PointerEvent) => {
      if (trimDragRef.current) {
        endTrimDrag(e, false)
        return
      }
      endBodyDrag(e, false)
    },
    [endTrimDrag, endBodyDrag],
  )

  // Delete/Backspace on the focused grid removes the selected clip. The grid is
  // focusable (tabIndex) so a click-to-select leaves it ready for the keystroke.
  const handleGridKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!selected) return
      // A bare track's implicit clip (armIndex < 0) supports only SPLIT — that
      // materializes the combinator (#489). Deleting or duplicating the WHOLE
      // uniform loop is out of scope (split first, then act on the pieces).
      const bareClip = selected.armIndex < 0
      // ⌘/Ctrl-D duplicates the selected clip (insert a clone arm after it).
      if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        if (!onDuplicateClip || bareClip) return
        e.preventDefault()
        onDuplicateClip({ sourceOffset: selected.sourceOffset, armIndex: selected.armIndex })
        // A clone arm is inserted after the selection, shifting later indices —
        // clear the held armIndex so a follow-up keystroke can't hit the wrong clip.
        setSelected(null)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!onDeleteClip || bareClip) return
        e.preventDefault()
        onDeleteClip({ sourceOffset: selected.sourceOffset, armIndex: selected.armIndex })
        setSelected(null)
        return
      }
      // `S` splits the selected clip at its midpoint (whole-cycle boundary). Only
      // a clip ≥ 2 cycles is splittable — derive the span from the live scene.
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!onSplitClip) return
        const lane = sceneRef.current.lanes.find((l) => l.laneKey === selected.laneKey)
        const clip = lane?.clips.find((c) => c.armIndex === selected.armIndex)
        if (!clip) return
        const weight = clip.endCycle - clip.startCycle
        if (weight < 2) return
        e.preventDefault()
        onSplitClip({
          sourceOffset: selected.sourceOffset,
          armIndex: selected.armIndex,
          firstWeight: Math.floor(weight / 2),
          // For a bare clip the span IS the whole-song width — the parent
          // materializes `arrange([k, pat], [span−k, pat])` (#489).
          span: weight,
        })
        // Split inserts a second arm, reindexing the list — clear the selection.
        setSelected(null)
      }
    },
    [selected, onDeleteClip, onDuplicateClip, onSplitClip],
  )

  // The selection highlight rect, derived from the LIVE scene + layout so it
  // follows zoom/scroll and vanishes if the arm disappears after a re-eval.
  const selectionRect = useMemo(() => {
    if (!selected) return null
    const lane = scene.lanes.find((l) => l.laneKey === selected.laneKey)
    const clip = lane?.clips.find((c) => c.armIndex === selected.armIndex)
    const box = layout.boxes.find((b) => b.laneKey === selected.laneKey)
    if (!lane || !clip || !box) return null
    const left = songCycleToX(clip.startCycle, displayCycles, contentWidth)
    const right = songCycleToX(clip.endCycle, displayCycles, contentWidth)
    return { left, width: Math.max(1, right - left), top: box.top, height: box.height }
  }, [selected, scene, layout, displayCycles, contentWidth])

  const periodLabel =
    analysis == null
      ? '—'
      : analysis.periodCycles != null
        ? `loop ${analysis.periodCycles}`
        : analysis.reachedCap
          ? `${analysis.horizonCycles}+ cycles`
          : `${analysis.horizonCycles} cycles`

  const zoomPercent = Math.round(zoom * 100)

  return (
    <div data-full-song="root" role="region" aria-label="Song" style={styles.root}>
      {/* Status lives in the parent's unified bar (with the view toggle); this
          view renders the controls + ruler + heatmap only. `periodLabel` is
          surfaced via the data attribute below for Playwright observation. */}
      <div data-full-song-period={periodLabel} style={{ display: 'none' }} />

      {/* Controls: units toggle (left) + zoom (right). Discoverable buttons over
          shortcuts; ⌘/Ctrl+wheel also zooms. */}
      <div data-full-song="controls" style={styles.controls}>
        <button
          type="button"
          data-full-song-units-toggle
          data-units={units}
          onClick={() => setUnits((u) => (u === 'cycles' ? 'bars' : 'cycles'))}
          style={styles.unitsToggle}
          title={units === 'cycles' ? 'Show bars & beats' : 'Show cycles'}
        >
          {units === 'cycles' ? 'CYCLES' : 'BARS'}
        </button>
        <div style={styles.zoomCluster} data-full-song-zoom={zoomPercent}>
          <button
            type="button"
            data-full-song-follow-toggle
            data-follow={follow ? 'on' : 'off'}
            aria-pressed={follow}
            onClick={() => setFollow((f) => !f)}
            style={{
              ...styles.unitsToggle,
              ...(follow ? styles.followOn : null),
            }}
            title={follow ? 'Following the playhead — click to stop' : 'Follow the playhead while playing'}
          >
            FOLLOW
          </button>
          <button
            type="button"
            data-full-song-zoom-fit
            onClick={fitZoom}
            disabled={zoom <= MIN_ZOOM}
            style={styles.zoomButton}
            title="Fit the whole song"
          >
            Fit
          </button>
          <button
            type="button"
            data-full-song-zoom-out
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            style={styles.zoomButton}
            title="Zoom out"
          >
            −
          </button>
          <span style={styles.zoomReadout}>{zoomPercent}%</span>
          <button
            type="button"
            data-full-song-zoom-in
            onClick={() => zoomBy(ZOOM_STEP)}
            style={styles.zoomButton}
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Ruler: section bands + cycle/bar ticks + clickable seek surface + playhead */}
      <div data-full-song="ruler" style={styles.topbar}>
        <div style={styles.gutter}>
          <span style={styles.caption}>SONG</span>
        </div>
        <div
          data-full-song="ruler-area"
          style={styles.rulerArea}
          onPointerDown={(e) => handleSeekAtClientX(e.clientX)}
        >
          {/* Inner content tracks the grid's horizontal scroll via translateX */}
          <div
            data-full-song="ruler-content"
            style={{ ...styles.scrollContent, width: contentWidth, transform: `translateX(${-scrollLeft}px)` }}
          >
            {areaWidth > 0 &&
              sections.map((s, i) => {
                const left = songCycleToX(s.startCycle, displayCycles, contentWidth)
                const right = songCycleToX(s.endCycle, displayCycles, contentWidth)
                return (
                  <div
                    key={`section-${s.startCycle}-${s.endCycle}`}
                    data-full-song-section={i}
                    title={`Section ${i + 1} · cycles ${s.startCycle}–${s.endCycle - 1}`}
                    style={{
                      ...styles.sectionChip,
                      left,
                      width: Math.max(0, right - left),
                      // alternate tint so adjacent sections read as distinct
                      background:
                        i % 2 === 0
                          ? 'var(--bg-input, rgba(255,255,255,0.04))'
                          : 'var(--bg-panel, rgba(255,255,255,0.08))',
                    }}
                  >
                    <span style={styles.sectionLabel}>{i + 1}</span>
                  </div>
                )
              })}
            {areaWidth > 0 &&
              ticks.map((t) => (
                <div
                  key={`tick-${t.cycle}`}
                  data-full-song-tick={t.major ? 'major' : 'beat'}
                  style={{
                    ...(t.major ? styles.tickMajor : styles.tickBeat),
                    left: songCycleToX(t.cycle, displayCycles, contentWidth),
                  }}
                >
                  {t.label != null && <span style={styles.tickLabel}>{t.label}</span>}
                </div>
              ))}
            {playheadVisible && (
              <div
                data-full-song="ruler-playhead-arrow"
                style={{ ...styles.playheadArrow, left: playheadX }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Body: lane labels + onset heatmap grid */}
      <div style={styles.body}>
        <div data-full-song="lane-labels" style={styles.labels}>
          {layout.boxes.length === 0 ? (
            <div style={styles.emptyLabel}>No song to map yet — press play.</div>
          ) : (
            layout.boxes.map((box) => {
              // An expanded multi-voice lane (#424) shows its identity on sub-row
              // 0 (`laneKey · voice0`, like the live monitor) and an indented
              // label per remaining voice, positioned from the SAME layout so
              // they line up with the canvas sub-rows exactly (PV120). A
              // collapsed / single-voice lane renders the plain header.
              const subRows = box.subRows
              const headerHeight = subRows ? subRows[0].height : box.height
              // Display NAME + dot colour resolve to the track LABEL for a named
              // track (#579 STEP 2); fall back to the positional `laneKey` when
              // the lane has no scene entry (defensive — should always match).
              const lane = laneByKey.get(box.laneKey)
              const displayName = lane?.displayName ?? box.laneKey
              const dotColor = lane?.color ?? paletteForTrack(trackIndexOf(box.laneKey), box.laneKey)
              const headerName = subRows ? `${displayName} · ${subRows[0].label}` : displayName
              // Inline rename (#580, Phase C): renameable when a write handler is
              // wired AND the lane has a statement anchor. The seed is the current
              // label for a named track, EMPTY for an anonymous `d{N}` (its
              // display isn't real code) — a name comes from an explicit edit.
              const renameAnchor = lane?.labelOffset ?? null
              const renameEnabled = onRenameLane !== undefined && renameAnchor != null
              const renameSeed = displayName === box.laneKey ? '' : displayName
              const isRenaming = renamingLane === box.laneKey
              // Colour picker (Phase D, #581): the dot opens a swatch popover when
              // a write handler is wired. The override is keyed by the lane's
              // DISPLAY NAME (the same key the Mixer uses), so a colour set here
              // shows on the matching strip too.
              const colorPickerEnabled = onSetTrackColor !== undefined
              return (
                <div
                  key={box.laneKey}
                  data-full-song-lane={box.laneKey}
                  data-expanded={box.expanded ? 'true' : 'false'}
                  data-full-song-voices={subRows ? subRows.length : undefined}
                  style={{ ...styles.laneRow, height: box.height }}
                  title={displayName}
                >
                  <div style={{ ...styles.laneHeader, height: headerHeight }}>
                    <button
                      type="button"
                      data-full-song-lane-expand={box.laneKey}
                      aria-pressed={box.expanded}
                      aria-label={box.expanded ? `Collapse ${displayName}` : `Expand ${displayName} to view its notes`}
                      onClick={() => activateLane(box.laneKey)}
                      style={styles.laneCaret}
                    >
                      {box.expanded ? '▾' : '▸'}
                    </button>
                    {colorPickerEnabled ? (
                      <button
                        type="button"
                        data-full-song-lane-dot={box.laneKey}
                        data-full-song-lane-swatch={box.laneKey}
                        aria-label={`Change colour of ${displayName}`}
                        title={`${displayName} — click to change colour`}
                        onClick={(e) =>
                          setColorPickerLane({
                            laneKey: box.laneKey,
                            name: displayName,
                            rect: e.currentTarget.getBoundingClientRect(),
                          })
                        }
                        style={{
                          ...styles.laneDot,
                          background: dotColor,
                          padding: 0,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      />
                    ) : (
                      <span
                        data-full-song-lane-dot={box.laneKey}
                        style={{
                          ...styles.laneDot,
                          background: dotColor,
                        }}
                      />
                    )}
                    {isRenaming && renameAnchor != null ? (
                      <input
                        data-full-song-lane-rename={box.laneKey}
                        autoFocus
                        defaultValue={renameSeed}
                        placeholder="name this track"
                        spellCheck={false}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const v = e.currentTarget.value.trim()
                            setRenamingLane(null)
                            if (v) onRenameLane?.(renameAnchor, v, displayName)
                          } else if (e.key === 'Escape') setRenamingLane(null)
                          e.stopPropagation() // keep the grid's key handlers out
                        }}
                        onBlur={(e) => {
                          const v = e.currentTarget.value.trim()
                          setRenamingLane(null)
                          if (v) onRenameLane?.(renameAnchor, v, displayName)
                        }}
                        style={styles.laneRenameInput}
                      />
                    ) : (
                      <span
                        style={{ ...styles.laneName, cursor: renameEnabled ? 'text' : 'default' }}
                        title={renameEnabled ? `${displayName} — double-click to rename` : undefined}
                        onDoubleClick={renameEnabled ? () => setRenamingLane(box.laneKey) : undefined}
                      >
                        {headerName}
                      </span>
                    )}
                  </div>
                  {subRows?.slice(1).map((sr) => (
                    <div
                      key={sr.voiceKey}
                      data-full-song-voice={sr.voiceKey}
                      style={{ ...styles.voiceLabel, top: sr.top - box.top, height: sr.height }}
                      title={sr.label}
                    >
                      {sr.label}
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
        {colorPickerLane && onSetTrackColor && (
          <TrackSwatchPopover
            anchorRect={colorPickerLane.rect}
            currentColor={laneByKey.get(colorPickerLane.laneKey)?.color}
            onPick={(color) => onSetTrackColor(colorPickerLane.name, color)}
            onReset={
              onResetTrackColor
                ? () => onResetTrackColor(colorPickerLane.name)
                : undefined
            }
            onClose={() => setColorPickerLane(null)}
          />
        )}
        <div
          data-full-song="grid"
          ref={areaRef}
          style={styles.grid}
          tabIndex={0}
          onScroll={handleGridScroll}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerCancel}
          onKeyDown={handleGridKeyDown}
          onDoubleClick={(e) => handleExpandAtClientY(e.clientY)}
        >
          {/* Inner content is contentWidth wide (the scroll spacer for the native
              scrollbar); the canvas sits sticky inside and redraws the visible
              slice, while the playhead stays a DOM element in content space. */}
          <div
            data-full-song="grid-content"
            style={{ ...styles.scrollContent, width: contentWidth }}
          >
            {/* Canvas draws lanes (density + mini-note marks), sections, gridlines
                — all the high-volume mass — over the shared transform (PV116). */}
            {areaWidth > 0 && (
              <SongTimelineCanvas
                scene={scene}
                scrollLeft={scrollLeft}
                contentWidth={contentWidth}
                viewportWidth={areaWidth}
                layout={layout}
              />
            )}
            {/* Live overlay (#500/U3): lights the scene marks that are sounding
                now, over the static base canvas, under the playhead. Sits ABOVE
                the base canvas, BELOW the playhead/selection (DOM order). */}
            {areaWidth > 0 && props.getHapStream && (
              <SongTimelineLiveOverlay
                scene={scene}
                layout={layout}
                scrollLeft={scrollLeft}
                contentWidth={contentWidth}
                viewportWidth={areaWidth}
                playheadCycle={playheadVisible ? wrappedPos : null}
                getHapStream={props.getHapStream}
              />
            )}
            {/* Marks overlay (#506): playhead, trim edge, clip selection and move
                ghost live here, pinned to the viewport EXACTLY like the base
                canvas + live overlay (sticky left:0, pulled back over them with a
                negative margin) and offset by the SAME React-state `scrollLeft`
                the canvas draws against. Keeping every mark on the canvas's scroll
                clock — not the natively-scrolled content's integer `el.scrollLeft`
                — stops the playhead jittering against the lanes: the old
                content-space `left: playheadX` differenced the native, integer-
                quantized, current-frame scroll against the canvas's float,
                one-frame-lagged React scroll, a ~2px per-frame sawtooth. */}
            <div
              data-full-song="marks"
              style={{
                ...styles.marksOverlay,
                marginTop: -layout.totalHeight,
                width: areaWidth,
                height: layout.totalHeight,
              }}
            >
              {playheadVisible && (
                <div data-full-song="playhead" style={{ ...styles.playhead, left: playheadX - scrollLeft }} />
              )}
              {trimEdgeX != null && (
                <div data-full-song="trim-edge" style={{ ...styles.trimEdge, left: trimEdgeX - scrollLeft }} />
              )}
              {selectionRect && (
                <div
                  data-full-song="clip-selection"
                  style={{
                    ...styles.clipSelection,
                    left: selectionRect.left - scrollLeft,
                    width: selectionRect.width,
                    top: selectionRect.top,
                    height: selectionRect.height,
                  }}
                />
              )}
              {moveGhost && (
                <div
                  data-full-song="clip-move-ghost"
                  style={{
                    ...styles.moveGhost,
                    left: moveGhost.left - scrollLeft,
                    width: moveGhost.width,
                    top: moveGhost.top,
                    height: moveGhost.height,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: 'var(--text-body, #e2e8f0)',
    background: 'var(--bg-app, #090912)',
  },
  controls: {
    height: CONTROLS_HEIGHT,
    minHeight: CONTROLS_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '0 8px',
    background: 'var(--bg-app, #090912)',
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
  },
  unitsToggle: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    padding: '2px 8px',
    borderRadius: 3,
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.14))',
    background: 'var(--bg-input, rgba(255,255,255,0.04))',
    color: 'var(--text-tertiary, rgba(255,255,255,0.55))',
    cursor: 'pointer' as const,
  },
  followOn: {
    // Use the `border` shorthand (the base unitsToggle also sets `border`) —
    // mixing it with the `borderColor` longhand warns on rerender in React.
    border: '1px solid var(--accent, #6ea8fe)',
    color: 'var(--accent, #6ea8fe)',
    background: 'var(--accent-faint, rgba(110,168,254,0.12))',
  },
  zoomCluster: { display: 'flex', alignItems: 'center', gap: 4 },
  zoomButton: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    lineHeight: 1,
    minWidth: 22,
    padding: '3px 6px',
    borderRadius: 3,
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.14))',
    background: 'var(--bg-input, rgba(255,255,255,0.04))',
    color: 'var(--text-tertiary, rgba(255,255,255,0.55))',
    cursor: 'pointer' as const,
  },
  zoomReadout: {
    fontSize: 9,
    minWidth: 36,
    textAlign: 'center' as const,
    color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
  },
  scrollContent: {
    position: 'relative' as const,
    height: '100%',
    minHeight: '100%',
  },
  topbar: {
    height: TOPBAR_HEIGHT,
    minHeight: TOPBAR_HEIGHT,
    background: 'var(--bg-panel, #14141f)',
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    display: 'flex',
    alignItems: 'stretch',
    fontSize: 10,
    color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
  },
  gutter: {
    width: GUTTER_WIDTH,
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 8px',
  },
  caption: { letterSpacing: '0.1em', textTransform: 'uppercase' as const },
  rulerArea: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    cursor: 'pointer' as const,
  },
  sectionChip: {
    position: 'absolute' as const,
    top: 4,
    bottom: 4,
    borderRadius: 2,
    borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 4,
    pointerEvents: 'none' as const,
  },
  sectionLabel: { fontSize: 9, color: 'var(--text-tertiary, rgba(255,255,255,0.4))' },
  tickMajor: {
    position: 'absolute' as const,
    bottom: 0,
    top: 0,
    width: 1,
    borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.18))',
    pointerEvents: 'none' as const,
    display: 'flex',
    alignItems: 'flex-end',
  },
  tickBeat: {
    position: 'absolute' as const,
    bottom: 0,
    height: 5,
    width: 1,
    borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
    pointerEvents: 'none' as const,
  },
  tickLabel: {
    fontSize: 9,
    lineHeight: 1,
    paddingLeft: 3,
    paddingBottom: 2,
    color: 'var(--text-tertiary, rgba(255,255,255,0.5))',
  },
  playheadArrow: {
    position: 'absolute' as const,
    top: 4,
    width: 0,
    height: 0,
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderTop: '7px solid var(--text-primary, rgba(255,255,255,0.7))',
    transform: 'translateX(-5px)',
    pointerEvents: 'none' as const,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    overflow: 'auto',
    background: 'var(--bg-app, #090912)',
  },
  labels: {
    width: GUTTER_WIDTH,
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  // Outer lane label box (relative so the per-voice sub-labels can absolutely
  // position against the lane top, lining up with the canvas sub-rows — #424).
  laneRow: {
    position: 'relative' as const,
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    overflow: 'hidden',
  },
  // The lane identity row (caret + dot + name). Sits on sub-row 0 when the lane
  // is expanded into voices; fills the box otherwise.
  laneHeader: {
    padding: '5px 8px 0',
    display: 'flex',
    // Top-align so the dot/name sit at the lane's TOP edge — when a lane is
    // expanded (taller) the label still lines up with the canvas row top.
    alignItems: 'flex-start',
    gap: 5,
    overflow: 'hidden',
    boxSizing: 'border-box' as const,
  },
  // A per-voice sub-row label, indented past the caret/dot column so the
  // hierarchy reads "lane → voices" (mirrors the live monitor's leaf rail).
  voiceLabel: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    paddingLeft: 29, // caret(11) + gap(5) + dot(7) + gap(5) + leftpad(8) − fudge
    paddingRight: 8,
    display: 'flex',
    alignItems: 'center',
    fontSize: 10,
    color: 'var(--text-secondary, rgba(255,255,255,0.5))',
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
    boxSizing: 'border-box' as const,
  },
  laneCaret: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    lineHeight: 1,
    padding: 0,
    marginTop: 1,
    width: 11,
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary, rgba(255,255,255,0.45))',
    cursor: 'pointer' as const,
  },
  laneDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block', marginTop: 2 },
  laneName: {
    color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
    fontSize: 10,
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  laneRenameInput: {
    minWidth: 0,
    flex: '1 1 auto' as const,
    color: 'var(--text-body, #e2e8f0)',
    fontSize: 10,
    fontFamily: 'inherit',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 3,
    padding: '0 2px',
    outline: 'none',
  },
  emptyLabel: {
    padding: 8,
    fontStyle: 'italic' as const,
    color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
    fontSize: 11,
    lineHeight: 1.4,
  },
  grid: {
    flex: 1,
    minWidth: 200,
    position: 'relative' as const,
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    background: 'var(--bg-input, #0f0f1a)',
    cursor: 'pointer' as const,
  },
  // Sticky viewport pin for the interactive marks (#506) — mirrors the base
  // canvas + live overlay (sticky left:0, marginTop:-height set inline). Children
  // are positioned in viewport space (`contentX - scrollLeft`) so they ride the
  // canvas's React-state scroll clock, never the natively-scrolled content.
  marksOverlay: {
    position: 'sticky' as const,
    left: 0,
    pointerEvents: 'none' as const,
  },
  playhead: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 1,
    background: 'var(--text-primary, rgba(255,255,255,0.7))',
    opacity: 0.7,
    boxShadow: '0 0 4px var(--text-primary, rgba(255,255,255,0.4))',
    pointerEvents: 'none' as const,
  },
  // The live edge ghost while trimming a clip (#437): a brighter accent line at
  // the snapped new boundary, distinct from the playhead.
  trimEdge: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 2,
    background: 'var(--accent, #6ea8fe)',
    opacity: 0.9,
    boxShadow: '0 0 6px var(--accent, rgba(110,168,254,0.6))',
    pointerEvents: 'none' as const,
  },
  // Selected-clip highlight (Phase 5c): an accent outline + faint fill over the
  // arm's [start,end) × lane box, in content space (tracks zoom/scroll).
  clipSelection: {
    position: 'absolute' as const,
    border: '1.5px solid var(--accent, #6ea8fe)',
    borderRadius: 2,
    background: 'var(--accent-faint, rgba(110,168,254,0.14))',
    boxShadow: '0 0 6px var(--accent, rgba(110,168,254,0.5))',
    pointerEvents: 'none' as const,
    boxSizing: 'border-box' as const,
  },
  // Move-drag destination preview (Phase 5c): a dashed accent outline marking
  // where the dragged clip will land (a reorder slot, or the wrap lead span).
  moveGhost: {
    position: 'absolute' as const,
    border: '1.5px dashed var(--accent, #6ea8fe)',
    borderRadius: 2,
    background: 'var(--accent-faint, rgba(110,168,254,0.10))',
    pointerEvents: 'none' as const,
    boxSizing: 'border-box' as const,
  },
} satisfies Record<string, React.CSSProperties>
