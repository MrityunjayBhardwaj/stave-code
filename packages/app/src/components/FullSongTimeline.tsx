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
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SongAnalysis } from '@stave/editor'
import { paletteForTrack, trackIndexOf } from './musicalTimeline/colors'
import {
  songCycleToX,
  xToSongCycle,
  wrapSongPosition,
  clampZoom,
  contentWidthFor,
  scrollLeftForZoom,
  rulerTicks,
  MIN_ZOOM,
  ZOOM_STEP,
} from './musicalTimeline/songAxis'

const TAB_ID = 'musical-timeline'
const CONTROLS_HEIGHT = 26
const TOPBAR_HEIGHT = 28
const GUTTER_WIDTH = 90
const ROW_HEIGHT = 22
const FONT_MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace'

/** Ruler units (#412). CYCLES = Strudel's native numbering; BARS = DAW
 *  convention (one cycle ≈ one bar) with quarter-cycle beat ticks. */
type RulerUnits = 'cycles' | 'bars'

export interface FullSongTimelineProps {
  /** Whole-song analysis, or null before the first analysis completes. */
  readonly analysis: SongAnalysis | null
  /** Transport-offset-aware song position (cycles), or null when stopped. */
  readonly getSongPosition: () => number | null
  /** Seek the transport to an absolute song cycle. */
  readonly onSeek: (cycle: number) => void
  /** Drawer open state — gates the rAF playhead loop (Trap NEW-1 parity). */
  readonly getDrawerOpen: () => boolean
  /** Active tab id — must equal the timeline tab for the rAF loop to run. */
  readonly getActiveTabId: () => string | null
}

/** Display span: one loop period, or the analyzed horizon when none. ≥ 1. */
function displaySpan(analysis: SongAnalysis | null): number {
  if (!analysis) return 1
  return Math.max(1, analysis.periodCycles ?? analysis.horizonCycles)
}

export function FullSongTimeline(props: FullSongTimelineProps): React.ReactElement {
  const { analysis, onSeek } = props
  const displayCycles = displaySpan(analysis)

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
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [units, setUnits] = useState<RulerUnits>('cycles')
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const scrollLeftRef = useRef(scrollLeft)
  scrollLeftRef.current = scrollLeft
  const areaWidthRef = useRef(areaWidth)
  areaWidthRef.current = areaWidth

  const contentWidth = contentWidthFor(areaWidth, zoom)
  const pxPerCycle = displayCycles > 0 ? contentWidth / displayCycles : 0
  const ticks = rulerTicks(displayCycles, pxPerCycle, units)

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
    if (el.scrollLeft !== clamped) el.scrollLeft = clamped
    setScrollLeft((prev) => (prev === clamped ? prev : clamped))
  }, [zoom, areaWidth])

  const handleGridScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft
    scrollLeftRef.current = sl
    setScrollLeft((prev) => (prev === sl ? prev : sl))
  }, [])

  // ── rAF playhead, gated on drawer-open + active-tab (DB-02 parity) ───────
  const accessorsRef = useRef(props)
  accessorsRef.current = props
  const [songPos, setSongPos] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    let raf: number | null = null
    const tick = (): void => {
      if (cancelled) return
      const a = accessorsRef.current
      if (!a.getDrawerOpen() || a.getActiveTabId() !== TAB_ID) {
        raf = null
        return
      }
      const pos = a.getSongPosition()
      setSongPos((prev) => (prev === pos ? prev : pos))
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

  const wrappedPos = wrapSongPosition(songPos, displayCycles)
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
      const cycle = xToSongCycle(contentX, displayCycles, contentWidthFor(rect.width, zoomRef.current))
      onSeek(cycle)
    },
    [displayCycles, onSeek],
  )

  const lanes = analysis?.lanes ?? []
  const sections = analysis?.sections ?? []

  // Peak onset count across all lanes — normalises heatmap intensity so the
  // busiest cell is full-opacity and quieter cells fade proportionally.
  const peak = (() => {
    let m = 1
    for (const l of lanes) for (const c of l.onsetsByCycle) if (c > m) m = c
    return m
  })()

  const periodLabel =
    analysis == null
      ? '—'
      : analysis.periodCycles != null
        ? `loop ${analysis.periodCycles}`
        : analysis.reachedCap
          ? `${analysis.horizonCycles}+ cycles`
          : `${analysis.horizonCycles} cycles`

  const cellW = displayCycles > 0 ? contentWidth / displayCycles : 0
  const zoomPercent = Math.round(zoom * 100)
  const majorTicks = ticks.filter((t) => t.major)

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
          {lanes.length === 0 ? (
            <div style={styles.emptyLabel}>No song to map yet — press play.</div>
          ) : (
            lanes.map((lane) => (
              <div key={lane.laneKey} style={styles.laneLabel} title={lane.laneKey}>
                <span
                  style={{
                    ...styles.laneDot,
                    background: paletteForTrack(trackIndexOf(lane.laneKey), lane.laneKey),
                  }}
                />
                <span style={styles.laneName}>{lane.laneKey}</span>
              </div>
            ))
          )}
        </div>
        <div
          data-full-song="grid"
          ref={areaRef}
          style={styles.grid}
          onScroll={handleGridScroll}
          onPointerDown={(e) => handleSeekAtClientX(e.clientX)}
        >
          {/* Inner content is contentWidth wide; the grid scrolls it horizontally */}
          <div
            data-full-song="grid-content"
            style={{ ...styles.scrollContent, width: contentWidth }}
          >
            {/* Section bands (full height, behind cells) */}
            {areaWidth > 0 &&
              sections.map((s) => {
                const left = songCycleToX(s.startCycle, displayCycles, contentWidth)
                const right = songCycleToX(s.endCycle, displayCycles, contentWidth)
                return (
                  <div
                    key={`band-${s.startCycle}`}
                    style={{
                      ...styles.sectionBand,
                      left,
                      width: Math.max(0, right - left),
                    }}
                  />
                )
              })}
            {/* Bar/cycle gridlines (faint, behind cells) — orientation when zoomed */}
            {areaWidth > 0 &&
              majorTicks.map((t) => (
                <div
                  key={`gridline-${t.cycle}`}
                  style={{ ...styles.gridline, left: songCycleToX(t.cycle, displayCycles, contentWidth) }}
                />
              ))}
            {/* Per-lane onset heatmap — sparse: a cell only where onsets > 0 */}
            {areaWidth > 0 &&
              lanes.map((lane, laneIdx) => {
                const color = paletteForTrack(trackIndexOf(lane.laneKey), lane.laneKey)
                return (
                  <div
                    key={lane.laneKey}
                    data-full-song-lane={lane.laneKey}
                    style={{ ...styles.laneRow, top: laneIdx * ROW_HEIGHT }}
                  >
                    {lane.onsetsByCycle.map((count, cycle) =>
                      // Guard: only render cells within the displayed span so a
                      // wider analysis horizon can never pile cells onto the edge
                      // (the period-trim in analyzeSong keeps these equal, but the
                      // view must not depend on that holding).
                      count > 0 && cycle < displayCycles ? (
                        <div
                          key={cycle}
                          data-full-song-cell={`${lane.laneKey}:${cycle}`}
                          title={`${lane.laneKey} · cycle ${cycle} · ${count} onset${count === 1 ? '' : 's'}`}
                          style={{
                            ...styles.cell,
                            left: songCycleToX(cycle, displayCycles, contentWidth),
                            width: Math.max(1, cellW - 1),
                            background: color,
                            opacity: 0.25 + 0.75 * (count / peak),
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                )
              })}
            {playheadVisible && (
              <div data-full-song="playhead" style={{ ...styles.playhead, left: playheadX }} />
            )}
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
  laneLabel: {
    height: ROW_HEIGHT,
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
  },
  laneDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  laneName: {
    color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
    fontSize: 10,
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
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
  sectionBand: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.05))',
    pointerEvents: 'none' as const,
  },
  gridline: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 1,
    borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.05))',
    pointerEvents: 'none' as const,
  },
  laneRow: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
  },
  cell: {
    position: 'absolute' as const,
    top: 4,
    height: ROW_HEIGHT - 8,
    borderRadius: 2,
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
} satisfies Record<string, React.CSSProperties>
