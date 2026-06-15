/**
 * MusicalTimeline — read-only multi-track musical timeline that lives
 * in the bottom drawer's "Timeline" tab (Phase 20-01 PR-B slice β).
 *
 * Audience: MUSICIAN (PV35 lock). Vocabulary discipline (PV32 / D-06)
 * applies to every visible string — see `forbiddenVocabulary.ts` for
 * the regex source-of-truth and the vitest + Playwright probes that
 * enforce it on both static literals and runtime-templated tooltips.
 *
 * Data flow:
 *   subscribeIRSnapshot ──▶ snapshot
 *                         ──▶ groupEventsByTrack (D-04 fallback chain)
 *                              ──▶ stableTrackOrder (Trap 5: row order
 *                                  stable across re-evals)
 *                                   ──▶ render: track rows + note blocks
 *
 *   getCycle (rAF tick, gated) ──▶ cycleToPlayheadX ──▶ playhead `style.left`
 *   getCps  (same)             ──▶ cpsToBpm + formatBarBeat
 *                              ──▶ status line "♩ {bpm} BPM · cps {x.xx} · bar Y / beat Z.ZZ"
 *
 * Lifecycle gates (DB-02 + DB-08 + Trap NEW-1):
 *   - Snapshot subscription is ALWAYS on (cheap fan-out; PK9).
 *   - rAF playhead loop is gated on (drawerOpen && tabActive). When
 *     gated off, the rAF loop suspends; a 250ms poll-interval re-kicks
 *     it when conditions return so the loop doesn't burn CPU on a
 *     drawer that's display:none for hours.
 *   - File-switch reset: when the snapshot's `source` changes (different
 *     editor tab), the slot map is cleared so File A's tracks don't
 *     leak into File B's row order (Trap NEW-5).
 *
 * Click-to-source: evt.loc[0] is the contract (PV36 / D-02). No fallbacks.
 * Multi-range loc supports modifier-click reveal of wrapping ranges (D-01).
 */
'use client'

import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type IRSnapshot,
  type IREvent,
  type HapStream,
  type HapEvent,
  type PatternIR,
  type TrackMeta,
  getIRSnapshot,
  getTrackMeta,
  setTrackMeta,
  subscribeIRSnapshot,
  subscribeToTrackMeta,
  revealLineInFile,
  useTrackMeta,
  getMusicalTimelineSubRowHeight,
  onMusicalTimelineSubRowHeightChange,
  analyzeSong,
  type SongAnalysis,
} from '@stave/editor'
import { groupEventsByTrack } from './musicalTimeline/groupEventsByTrack'
import { stableTrackOrder } from './musicalTimeline/stableTrackOrder'
import {
  WINDOW_CYCLES,
  eventToRect,
  cycleToPlayheadX,
  formatBarBeat,
  cpsToBpm,
} from './musicalTimeline/timeAxis'
import { paletteForTrack, trackIndexOf } from './musicalTimeline/colors'
import {
  layoutTrackRows,
  type TrackLayout,
  type LeafLayout,
} from './musicalTimeline/layoutTrackRows'
import { extractPitch, pitchToY } from './musicalTimeline/pitch'
import { TrackSwatchPopover } from './TrackSwatchPopover'
import { Ruler } from './musicalTimeline/Ruler'
import { FullSongTimeline } from './FullSongTimeline'
import {
  EMPTY_STATE_COPY,
  STOPPED_STATUS_COPY,
} from './musicalTimeline/EMPTY_STATE_COPY'

export interface MusicalTimelineProps {
  /** Current cycle (post-collect coords) from the active runtime, or
   *  null when stopped / non-Strudel runtime. Read on each rAF tick
   *  through a closure so the active runtime can change without
   *  re-registering the tab content. */
  readonly getCycle: () => number | null
  /** Current cycles-per-second from the active runtime, or null. Used
   *  for the BPM segment of the status line. */
  readonly getCps: () => number | null
  /**
   * Phase 20-06 (PV38, PK13 step 7+8) — closure-bound accessor onto the
   * active runtime's HapStream. Returns null when the engine isn't
   * running or the runtime is non-Strudel. The timeline subscribes to
   * this stream to drive activeKeys (D-01: real-hap REPLACES cycle-derived).
   */
  readonly getHapStream: () => HapStream | null
  /** Drawer open state — gates the rAF loop (Trap NEW-1). */
  readonly getDrawerOpen: () => boolean
  /** Active tab id — must equal `'musical-timeline'` for the rAF loop
   *  to run. Same gating purpose as `getDrawerOpen`. */
  readonly getActiveTabId: () => string | null
  /**
   * #384/#385 — transport-offset-aware song position (cycles), or null when
   * stopped / non-Strudel. The full-song view's scrubbable playhead reads
   * this instead of the raw window clock. Optional: registrations that
   * predate scrub pass nothing → song view's playhead simply stays hidden.
   */
  readonly getSongPosition?: () => number | null
  /**
   * #384 — seek the transport to an absolute song cycle (full-song ruler
   * click → seekTo). Optional for the same back-compat reason; when absent
   * the full-song view renders read-only (clicks are ignored).
   */
  readonly onSeek?: (cycle: number) => void
  /**
   * #394 — request an immediate IR snapshot capture for the active file. The
   * song view analyzes the published snapshot, but a cold eval publishes it
   * ~2.5s late; the view calls this on entering song mode with no snapshot so
   * it populates at once instead of sitting empty. Optional / no-op when the
   * registration predates the fix or the runtime is non-Strudel.
   */
  readonly onRequestSnapshot?: () => void
}

const TAB_ID = 'musical-timeline'
const TRACK_LABEL_WIDTH = 90 // mockup: .daw-gutter width 90px (DV-02)
const ROW_HEIGHT = 24
const STATUS_HEIGHT = 24
// β-3/β-4 — bar geometry constants.
//   BAR_TOP_DEFAULT / BAR_HEIGHT_DEFAULT: collapsed-row + non-expanded
//     fallback (preserves the pre-β-4 top:4 / height:16 visual baseline).
//   LEAF_BAR_HEIGHT: smaller bar inside SUB_ROW_HEIGHT bands so the bar +
//     padding fit within the 18px leaf band.
const BAR_TOP_DEFAULT = 4
const BAR_HEIGHT_DEFAULT = 16
// Phase 20-12 — leaf bar height derives from the sub-row band height
// (which itself comes from `getMusicalTimelineSubRowHeight()`, range
// 12-48). The bar takes most of the band; ~10px is reserved for pitch
// motion (so a melodic c4..c5 contour stays visible at any sub-row
// height). Floor at 6px so very small sub-rows still show something.
//
// Wave-ε (#19 follow-up): the bar height was hardcoded at 6px so big
// sub-rows showed tiny bars. Wave-ε scales the bar with the band so
// the slider produces a coherent visual change.
const LEAF_BAR_PITCH_RESERVE = 12   // px of pitch motion preserved
const LEAF_BAR_HEIGHT_MIN = 6
function leafBarHeight(bandHeight: number): number {
  return Math.max(LEAF_BAR_HEIGHT_MIN, bandHeight - LEAF_BAR_PITCH_RESERVE)
}
const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>())

/**
 * Tiny MIDI int → note name converter. C4 = 60. Used in tooltips when
 * the event carries `note: number`. Strings pass through.
 */
function midiToName(n: number): string {
  if (!Number.isFinite(n)) return ''
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const idx = Math.floor(n) % 12
  const octave = Math.floor(Math.floor(n) / 12) - 1
  const safeIdx = idx < 0 ? idx + 12 : idx
  return `${names[safeIdx]}${octave}`
}

/**
 * Build the tooltip string for a note block. Every interpolation site
 * is here so the test surface is small (Trap NEW-2: runtime-computed
 * vocabulary leaks). All segments use musician vocabulary only.
 *
 * Phase 20-12 β-5: extended to surface chained Param values (n / freq /
 * pan / room / speed / bank / scale) and a non-default `gain` segment.
 * Native `title=` carrier is retained — RESEARCH §B.4 / G.4: the browser
 * gives `pointer-events: none` for free, mitigating CONTEXT pre-mortem
 * #4 (tooltip-blocks-click-through).
 */
function formatNoteTooltip(event: IREvent, fallbackTrackId: string): string {
  const sample = event.s ?? fallbackTrackId
  const noteSegment =
    typeof event.note === 'number'
      ? `note ${midiToName(event.note)}`
      : typeof event.note === 'string' && event.note.length > 0
        ? `note ${event.note}`
        : null
  // Bar/beat shown using the SAME formatter as the status line so the
  // tooltip stays consistent with what the playhead displays.
  const barBeat = formatBarBeat(event.begin)
  const velocitySegment =
    typeof event.velocity === 'number' && event.velocity !== 1
      ? `velocity ${event.velocity.toFixed(2)}`
      : null
  // β-5: gain segment when non-default (gain 1 is the implicit default).
  const gainSegment =
    typeof event.gain === 'number' && event.gain !== 1
      ? `gain ${event.gain}`
      : null
  // β-5: chained-Param extras (.n / .freq / .pan / .room / .speed / .bank /
  // .scale). Uses raw value formatting; numeric `n` displays as integer-ish,
  // `freq` includes units. Skipped when value is null/undefined.
  const params = (event.params ?? {}) as Record<string, unknown>
  const PARAM_KEYS_DISPLAY: readonly { key: string; format: (v: unknown) => string | null }[] = [
    { key: 'n', format: (v) => (v == null ? null : `n ${v}`) },
    { key: 'freq', format: (v) => (typeof v === 'number' ? `freq ${v}Hz` : v == null ? null : `freq ${v}`) },
    { key: 'pan', format: (v) => (v == null ? null : `pan ${v}`) },
    { key: 'room', format: (v) => (v == null ? null : `room ${v}`) },
    { key: 'speed', format: (v) => (v == null ? null : `speed ${v}`) },
    { key: 'bank', format: (v) => (v == null ? null : `bank ${v}`) },
    { key: 'scale', format: (v) => (v == null ? null : `scale ${v}`) },
  ]
  const paramSegments = PARAM_KEYS_DISPLAY.map(({ key, format }) =>
    format(params[key]),
  )
  return [
    sample,
    noteSegment,
    barBeat,
    velocitySegment,
    gainSegment,
    ...paramSegments,
  ]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' · ')
}

/**
 * Phase 20-12 β-2 — Walk an IR tree and collect every `Track` node by trackId.
 *
 * Used by MusicalTimeline to map each row's trackId to its body subtree, which
 * `layoutTrackRows` then flattens into leaf voices for sub-row expansion.
 *
 * The walk is shallow-recursive — it descends through every PatternIR child
 * (mirroring `irChildren` in irProjection.ts) and records the body of every
 * Track tag it encounters. Duplicate trackIds (which 20-11 γ-1 forbids but
 * which the parser may still emit on edge cases) keep the FIRST occurrence;
 * a later duplicate doesn't override since the row layout's identity is the
 * stable trackId, and over-writing would race the cached snapshot identity.
 */
/**
 * Phase 20-12.1 follow-up — enumerate the top-level `$:`-derived Tracks
 * in source order. Each entry exposes a stable `slotKey` (based on the
 * outer Track's source position) and a `displayLabel` (the `.p()` name
 * if the body is a nested `.p()` Track, else the outer Track's trackId).
 *
 * The slot key is what the timeline uses for row identity, so adding or
 * changing `.p("name")` on a line doesn't relocate its row — only the
 * label updates.
 *
 * SHALLOW: only the outer Stack's direct Track children. The label
 * derivation peeks ONE level into the body to detect a `.p()` wrap, but
 * doesn't recurse deeper.
 */
function collectTopLevelSlots(
  node: PatternIR,
): { slotKey: string; displayLabel: string }[] {
  const summarize = (t: PatternIR): { slotKey: string; displayLabel: string } => {
    const outer = t as Extract<PatternIR, { tag: 'Track' }>
    const pos = outer.loc?.[0]?.start
    const slotKey = pos !== undefined ? `$${pos}` : outer.trackId
    // Peek one level for a `.p()`-wrapped inner Track; that name becomes
    // the row label.
    const body = outer.body
    if (body.tag === 'Track' && body.userMethod === 'p') {
      return { slotKey, displayLabel: body.trackId }
    }
    return { slotKey, displayLabel: outer.trackId }
  }
  if (node.tag === 'Track') return [summarize(node)]
  if (node.tag === 'Stack') {
    const out: { slotKey: string; displayLabel: string }[] = []
    for (const child of node.tracks) {
      if (child.tag === 'Track') out.push(summarize(child))
    }
    return out
  }
  return []
}

/** Compute the slot key for an event-derived group. The first event's
 *  `dollarPos` is the canonical identity; falling back to trackId
 *  matches the pre-`dollarPos` behavior for hand-built fixtures. */
function groupSlotKey(group: { trackId: string; events: readonly IREvent[] }): string {
  const first = group.events[0]
  const pos = first?.dollarPos
  return pos !== undefined ? `$${pos}` : group.trackId
}

/**
 * Phase 20-17 D-1c — see also `__test_collectTrackBodies` at the bottom
 * of this file (test-only re-export, mirrors the `__test_wrapAsOpaque`
 * convention in parseStrudel.ts).
 */
function collectTrackBodies(node: PatternIR): Map<string, PatternIR> {
  const out = new Map<string, PatternIR>()
  const visit = (n: PatternIR): void => {
    if (n.tag === 'Track') {
      if (!out.has(n.trackId)) out.set(n.trackId, n.body)
      visit(n.body)
      return
    }
    // Single-body wrappers + multi-child carriers — descend per the projection
    // shape used by the inspector (irChildren). Defensive: rather than
    // duplicating that switch, use property checks.
    const anyN = n as unknown as Record<string, unknown>
    if (anyN.body && typeof anyN.body === 'object' && (anyN.body as PatternIR).tag) {
      visit(anyN.body as PatternIR)
    }
    if (Array.isArray(anyN.tracks)) {
      for (const c of anyN.tracks as PatternIR[]) visit(c)
    }
    if (Array.isArray(anyN.children)) {
      for (const c of anyN.children as PatternIR[]) visit(c)
    }
    if (anyN.then && typeof anyN.then === 'object' && (anyN.then as PatternIR).tag) {
      visit(anyN.then as PatternIR)
    }
    if (anyN.else_ && typeof anyN.else_ === 'object' && (anyN.else_ as PatternIR).tag) {
      visit(anyN.else_ as PatternIR)
    }
    if (anyN.transform && typeof anyN.transform === 'object' && (anyN.transform as PatternIR).tag) {
      visit(anyN.transform as PatternIR)
    }
    if (anyN.selector && typeof anyN.selector === 'object' && (anyN.selector as PatternIR).tag) {
      visit(anyN.selector as PatternIR)
    }
    if (Array.isArray(anyN.lookup)) {
      for (const c of anyN.lookup as PatternIR[]) visit(c)
    }
    // Phase 20-17 D-1c HIGH-SEVERITY — Code.via union discriminant.
    // PRE-20-17: this branch assumed `via` was always the wrapAsOpaque
    // shape `{method, args, callSiteRange, inner}`. POST-20-17 (D-02
    // CORRECTION) the union has a literal arm `{literal:true;raw}` which
    // is truthy AND typeof === 'object'. WITHOUT the `'literal' in via`
    // guard the literal arm enters this branch, reads `via.inner` =
    // undefined, `if (inner)` is false, and the literal subtree is
    // silently dropped from the timeline projection (P67 silent-wrong —
    // no throw, no log, wrong-but-plausible render). The literal node
    // itself is still visited as a leaf by the surrounding walk; only
    // the spurious `via.inner` recursion is suppressed.
    if (anyN.via && typeof anyN.via === 'object' && !('literal' in anyN.via)) {
      const inner = (anyN.via as { inner?: PatternIR }).inner
      if (inner) visit(inner)
    }
  }
  visit(node)
  return out
}

/**
 * Phase 20-12 β-1 — Row header rail (chevron + swatch + name).
 *
 * Per-row component so `useTrackMeta` is called from a stable component (not
 * from inside a `.map()` in the parent) — rules-of-hooks compliant. The
 * parent (`MusicalTimeline`) passes `fileId` derived from `IRSnapshot.source`;
 * this component reads/writes meta through `useTrackMeta` keyed on
 * (fileId, trackId).
 *
 * Width budget (RESEARCH §B.5): chevron 12 + gap 4 + swatch 12 + gap 4 +
 * name fills the remainder. Total = TRACK_LABEL_WIDTH (90px). aria-labels
 * on both buttons keep the rail screen-reader navigable.
 */
interface TrackHeaderRowProps {
  fileId: string | undefined
  trackId: string
  autoColor: string
  top: number
  height: number
  onOpenSwatch: (trackId: string, anchor: DOMRect) => void
  /** Phase 20-12 — when expanded with multiple leaf voices, the parent
   *  passes the FIRST leaf's voice label so the header reads
   *  `d1 · saw` instead of just `d1`. Subsequent leaves render via the
   *  TrackLeafLabel sibling component below. */
  voiceLabel?: string
}

function TrackHeaderRow({
  fileId,
  trackId,
  autoColor,
  top,
  height,
  onOpenSwatch,
  voiceLabel,
}: TrackHeaderRowProps): React.ReactElement {
  const { meta, set } = useTrackMeta(fileId, trackId)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const color = meta.color ?? autoColor
  const collapsed = meta.collapsed ?? false
  const handleToggle = useCallback(() => {
    set({ collapsed: !collapsed })
  }, [collapsed, set])
  const handleOpenSwatch = useCallback(() => {
    if (swatchRef.current) {
      onOpenSwatch(trackId, swatchRef.current.getBoundingClientRect())
    }
  }, [onOpenSwatch, trackId])
  return (
    <div
      data-musical-timeline="track-header"
      data-musical-timeline-track-label={trackId}
      data-track-id={trackId}
      title={trackId}
      style={{
        position: 'absolute',
        top,
        height,
        width: TRACK_LABEL_WIDTH,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        paddingLeft: 4,
        borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        data-musical-timeline="track-chevron"
        data-collapsed={collapsed ? 'true' : 'false'}
        aria-label={collapsed ? `Expand ${trackId}` : `Collapse ${trackId}`}
        aria-expanded={!collapsed}
        onClick={handleToggle}
        style={{
          width: 12,
          height: 12,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-chrome, rgba(255,255,255,0.6))',
          cursor: 'pointer',
          padding: 0,
          fontSize: 10,
          lineHeight: '12px',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 100ms',
          flexShrink: 0,
        }}
      >
        ▾
      </button>
      <button
        ref={swatchRef}
        type="button"
        data-musical-timeline="track-swatch"
        aria-label={`Pick color for ${trackId}`}
        onClick={handleOpenSwatch}
        style={{
          width: 12,
          height: 12,
          padding: 0,
          border: 'none',
          background: color,
          borderRadius: 6,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      <span
        data-musical-timeline="track-name"
        style={{
          fontSize: 10,
          lineHeight: '12px',
          color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {voiceLabel ? `${trackId} · ${voiceLabel}` : trackId}
      </span>
    </div>
  )
}

/**
 * Per-leaf voice label rendered in the left rail beneath a multi-leaf
 * track's main TrackHeaderRow. Indented past the chevron + swatch column
 * so the visual hierarchy reads "track header → indented voices".
 * Phase 20-12 sub-row identity rail (PV41 channel: row header).
 */
function TrackLeafLabel({
  top,
  height,
  label,
}: {
  top: number
  height: number
  label: string
}): React.ReactElement {
  return (
    <div
      data-musical-timeline="track-leaf-label"
      style={{
        position: 'absolute',
        top,
        height,
        width: TRACK_LABEL_WIDTH,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 36, // chevron(12) + gap(4) + swatch(12) + gap(4) + leftPad(4)
        boxSizing: 'border-box',
        fontSize: 10,
        lineHeight: '12px',
        color: 'var(--text-secondary, rgba(255,255,255,0.5))',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  )
}

/**
 * Count newlines in `src` up to character offset `offset`.
 * Returns 1-based line number. Mirrors IRInspectorPanel.tsx's countLines.
 */
function countLines(src: string, offset: number): number {
  if (offset <= 0) return 1
  let line = 1
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') line++
  }
  return line
}

/**
 * Phase 20-17 D-1c — test-only re-export of `collectTrackBodies` for the
 * HIGH-severity Code.via literal-arm projection guard test. Mirrors
 * parseStrudel.ts's `__test_wrapAsOpaque` convention; not part of the
 * public component API.
 */
export const __test_collectTrackBodies = collectTrackBodies

export function MusicalTimeline(
  props: MusicalTimelineProps,
): React.ReactElement {
  // ── Snapshot subscription (Trap NEW-4: re-sync after subscribe) ─────────
  const [snapshot, setSnapshot] = useState<IRSnapshot | null>(getIRSnapshot)
  useEffect(() => {
    const unsub = subscribeIRSnapshot(setSnapshot)
    // Re-sync in case publishIRSnapshot raced our mount.
    setSnapshot(getIRSnapshot())
    return unsub
  }, [])

  // ── View mode: live 2-cycle window (default) vs full-song map (#385) ──────
  const [viewMode, setViewMode] = useState<'window' | 'song'>('window')
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  // Analyze the whole song from the IR snapshot when (and only when) the
  // full-song view is active. Re-runs on every new snapshot (re-eval). The
  // previous run is aborted via a per-run signal so a fast edit cadence can't
  // pile up overlapping budgeted collections. Window mode never analyzes.
  useEffect(() => {
    if (viewMode !== 'song') return
    const ir = snapshot?.ir ?? null
    if (!ir) {
      setAnalysis(null)
      return
    }
    const signal = { aborted: false }
    setAnalyzing(true)
    analyzeSong(ir, { signal })
      .then((result) => {
        if (!signal.aborted) setAnalysis(result)
      })
      .catch(() => {
        /* analysis is best-effort; leave the prior result in place */
      })
      .finally(() => {
        if (!signal.aborted) setAnalyzing(false)
      })
    return () => {
      signal.aborted = true
    }
  }, [viewMode, snapshot])

  // ── Grid width via ResizeObserver (DB-04) ───────────────────────────────
  const [gridContentWidth, setGridContentWidth] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') {
      // Fallback: read the current width once. Real browsers always
      // have ResizeObserver; this keeps tests in environments without
      // the polyfill from crashing.
      setGridContentWidth(el.clientWidth ?? 0)
      return
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setGridContentWidth(Math.max(0, w))
    })
    ro.observe(el)
    // Seed with the current measured width so the first render after
    // mount can already place blocks (ResizeObserver fires once after
    // attach, but exact timing varies across implementations).
    setGridContentWidth(el.clientWidth ?? 0)
    return () => ro.disconnect()
  }, [])

  // ── rAF playhead loop with gating (DB-02 + Trap NEW-1) ──────────────────
  // Stash the latest accessor refs so the rAF callback closure doesn't
  // need to re-capture on every render (or worse, fire stale refs).
  const accessorsRef = useRef(props)
  accessorsRef.current = props

  // #394 — when the song view opens before its IR snapshot has been published
  // (a cold eval lags ~2.5s behind the keypress), proactively ask the editor
  // to capture one now. The publish flows back through subscribeIRSnapshot →
  // setSnapshot → the analyze effect above, so the view populates at once
  // instead of sitting empty until a later eval. Re-runs only on the
  // viewMode/snapshot transition; once a snapshot exists this is a no-op, so
  // there is no request loop.
  useEffect(() => {
    if (viewMode === 'song' && !snapshot) {
      accessorsRef.current.onRequestSnapshot?.()
    }
  }, [viewMode, snapshot])

  const [currentCycle, setCurrentCycle] = useState<number | null>(null)
  const [currentCps, setCurrentCps] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let rafHandle: number | null = null

    const tick = (): void => {
      if (cancelled) return
      const a = accessorsRef.current
      if (!a.getDrawerOpen() || a.getActiveTabId() !== TAB_ID) {
        // Gate flipped off — stop the loop. Poke interval will re-kick.
        rafHandle = null
        return
      }
      const cycle = a.getCycle()
      const cps = a.getCps()
      // setState bails on referential equality for primitives, so the
      // playhead only triggers a re-render when the cycle actually
      // changes.
      setCurrentCycle((prev) => (prev === cycle ? prev : cycle))
      setCurrentCps((prev) => (prev === cps ? prev : cps))
      rafHandle = requestAnimationFrame(tick)
    }

    // Initial kick — only if conditions allow. Otherwise the poke
    // interval below catches the next open transition.
    if (
      props.getDrawerOpen() &&
      props.getActiveTabId() === TAB_ID
    ) {
      rafHandle = requestAnimationFrame(tick)
    }

    // Re-kick if the user opens the drawer / switches the tab while
    // we're suspended. 250ms is a balance: quick enough that opening
    // the drawer feels instant; cheap enough that the steady-state
    // suspended cost is ~0.
    const pokeInterval = setInterval(() => {
      if (cancelled) return
      if (
        rafHandle == null &&
        accessorsRef.current.getDrawerOpen() &&
        accessorsRef.current.getActiveTabId() === TAB_ID
      ) {
        rafHandle = requestAnimationFrame(tick)
      }
      // Drawer-closed stop-edge sampling (Phase 20-12.1): while the rAF
      // loop is suspended (drawer closed or tab inactive), getCycle() is
      // not read each frame. Sample it here so a transport stop
      // propagates to component state within ≤250ms and the stop-edge
      // reset block below fires on the next render. Cheap: one accessor
      // call per 250ms.
      const sampled = accessorsRef.current.getCycle()
      setCurrentCycle((prev) => (prev === sampled ? prev : sampled))
    }, 250)

    return () => {
      cancelled = true
      clearInterval(pokeInterval)
      if (rafHandle != null) {
        cancelAnimationFrame(rafHandle)
        rafHandle = null
      }
      // Reset cycle state on unmount so a remount starts in the
      // stopped state instead of a stale playhead position.
      setCurrentCycle(null)
      setCurrentCps(null)
    }
    // The accessors are read through the ref; depending on them in
    // the deps would re-create the rAF loop on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Slot-map derivation (Trap 5 + Trap NEW-5 file-switch reset) ─────────
  const slotMapRef = useRef<Map<string, number>>(new Map())
  const lastSourceRef = useRef<string | undefined>(undefined)
  // Phase 20-12.1 — edge tracker for `currentCycle` (non-null → null) so
  // we can clear `slotMapRef` exactly on the moment the transport stops.
  // Initial value `true` ("we start in the stopped state") avoids a
  // spurious first-mount reset of an already-empty map.
  const prevCycleNullRef = useRef<boolean>(true)
  // Phase 20-12.1 follow-up — "has ever had events this session" set.
  // Combined with always-seed-from-IR-top-level below, this is what lets
  // commented `$:` lines render as ghosts during a live session but drop
  // entirely on stop+play. Cleared alongside slotMapRef on file switch
  // and on the transport-stop edge.
  const hasHadEventsRef = useRef<Set<string>>(new Set())

  // File-switch reset: run BEFORE slot-map derivation so the new file's
  // tracks claim slots starting from 0 instead of inheriting the prior
  // file's row order.
  if (snapshot && snapshot.source !== lastSourceRef.current) {
    slotMapRef.current = new Map()
    hasHadEventsRef.current = new Set()
    lastSourceRef.current = snapshot.source
  }

  // ── Transport transition reset (Phase 20-12.1 + follow-up) ─────────────
  // Reset slotMapRef + hasHadEventsRef on EITHER edge of the play/stop
  // transition:
  //   - non-null → null (stop): so previously-active rows don't carry
  //     into a future session.
  //   - null → non-null (play): so code edited while stopped takes effect
  //     on the next play. Without this, after stop → edit → play, the
  //     slot map still holds the prior session's seeding and the timeline
  //     shows the stale row set until the next stop+play cycle.
  // Hot-reload while playing (Cmd+Enter mid-play) is NOT a transition
  // edge — currentCycle stays non-null — so D-04's audition workflow
  // (ghost in place during live edit) is preserved.
  const cycleIsNull = currentCycle === null
  if (prevCycleNullRef.current !== cycleIsNull) {
    slotMapRef.current = new Map()
    hasHadEventsRef.current = new Set()
  }
  prevCycleNullRef.current = cycleIsNull

  const groups = snapshot ? groupEventsByTrack(snapshot.events) : []
  // Phase 20-12.1 follow-up — slot map is keyed by `slotKey`, a stable
  // source-anchored identity:
  //   - For events from a `$:`-wrapped Track: `slotKey = "$" + dollarPos`
  //     where dollarPos is the source offset of the OUTER `$:` Track.
  //   - For hand-built / non-`$:` events: `slotKey = trackId` (fallback).
  //
  // Using the source anchor (not the inner trackId) means `.p("name")`
  // rename-in-place doesn't relocate the row: the OUTER Track's loc is
  // unchanged by adding/changing/removing `.p()` inside its body. The
  // display label still comes from the inner trackId (per the `.p()`
  // wave-δ contract) — see the display map below.
  //
  // The walk for IR-side seeding is SHALLOW: only the outer Stack's
  // direct Track children. Nested `.p()` Tracks are inside those bodies
  // and contribute their NAME as a display label, not a separate slot.
  const irSlots = snapshot?.ir ? collectTopLevelSlots(snapshot.ir) : []
  const groupBySlotKey = new Map<string, { displayLabel: string; events: readonly IREvent[] }>()
  for (const g of groups) {
    const key = groupSlotKey(g)
    // Events from a `.p()`-wrapped Track carry the INNER trackId (the
    // user's chosen name). For events from a plain `$:` line, trackId
    // is the synthetic `d{N}`. Either way it's the right display label.
    groupBySlotKey.set(key, { displayLabel: g.trackId, events: g.events })
  }
  // Display labels for slots that exist in the IR but have no events
  // yet (commented `$:` lines). collectTopLevelSlots peeks for `.p()`
  // wraps even on empty-body Tracks so a commented `.p()` line still
  // shows its name.
  const slotDisplay = new Map<string, string>()
  for (const { slotKey, displayLabel } of irSlots) {
    slotDisplay.set(slotKey, displayLabel)
  }
  // Group display labels override IR-derived labels when both exist
  // (event-bearing labels reflect the LIVE name in case the IR walk
  // and the runtime event stream disagree, e.g. mid-eval).
  for (const [key, { displayLabel }] of groupBySlotKey) {
    slotDisplay.set(key, displayLabel)
  }

  const currentSlotKeys = [
    ...irSlots.map((s) => s.slotKey),
    ...groups.map(groupSlotKey),
  ]
  slotMapRef.current = stableTrackOrder(slotMapRef.current, currentSlotKeys)
  const slotMap = slotMapRef.current
  // hasHadEvents tracks SLOT KEYS (not trackIds). This is what makes
  // commented `$:` ghost in place during a live session: the slot was
  // entered into the set on a prior render with events; subsequent
  // event-less renders keep the row visible because its slot is still
  // in the set. Cleared on transport transitions + file switch.
  for (const g of groups) hasHadEventsRef.current.add(groupSlotKey(g))

  // Filter to slot keys that have ever produced events this session.
  // Display label is read from `slotDisplay` so the chrome shows the
  // inner `.p()` name when present, falling back to the outer `d{N}`.
  const orderedTracks = Array.from(slotMap.entries())
    .sort(([, a], [, b]) => a - b)
    .filter(([slotKey]) => hasHadEventsRef.current.has(slotKey))
    .map(([slotKey]) => ({
      trackId: slotDisplay.get(slotKey) ?? slotKey,
      events: groupBySlotKey.get(slotKey)?.events ?? [],
    }))

  // ── Phase 20-06: HapStream subscription drives activeKeys (D-01 / DEC-NEW-1)
  // ────────────────────────────────────────────────────────────────────────
  //
  // PV38 / PK13 step 8 — the cycle-derived `useMemo` (20-02 DV-12) is gone.
  // Active-event derivation now mirrors the firing of actual haps: glow on
  // hap fire, clear after audioDuration. Mirrors useHighlighting.ts:174-175
  // arithmetic exactly.
  //
  // Resolve the live HapStream reactively. The accessor returns a different
  // instance after a runtime swap (file-switch). Snapshot publish triggers
  // re-render; a `useEffect` keyed on snapshot identity picks up the new
  // HapStream (RESEARCH DEC-NEW-1 — snapshot is the reactive seam, not a
  // 250ms poll). The accessor itself is closure-stable (StaveApp routes
  // through a ref), so deps suppression is sound.
  const [resolvedHapStream, setResolvedHapStream] = useState<HapStream | null>(
    () => props.getHapStream(),
  )
  useEffect(() => {
    const next = props.getHapStream()
    setResolvedHapStream((prev) => (prev === next ? prev : next))
    // Including snapshot in deps is the explicit reactive seam (DEC-NEW-1).
    // props.getHapStream is closure-stable (ref-routed at StaveApp); not a
    // missing dep but exhaustive-deps can't see through that, hence:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  const [activeKeys, setActiveKeys] = useState<ReadonlySet<string>>(EMPTY_SET)
  const timeoutIdsRef = useRef<number[]>([])

  // orderedTracks is recomputed on every render (new array reference). If we
  // depend on it directly in the subscription's deps array, every state
  // update triggers cleanup → re-subscribe → setActiveKeys(EMPTY_SET) →
  // re-render → infinite cleanup loop. Reading through a ref breaks the
  // dep cycle while still letting the handler see the latest events.
  const orderedTracksRef = useRef(orderedTracks)
  orderedTracksRef.current = orderedTracks

  useEffect(() => {
    const hapStream = resolvedHapStream
    if (!hapStream) return

    const handler = (event: HapEvent): void => {
      // Skip runtime-only haps (PV37 alignment — no IR identity, no glow).
      if (!event.irNodeId) return
      // Disambig within the irNodeId-group via FP-tolerant begin compare
      // (RESEARCH DEC-NEW-2). hap-side begin via Number() to unwrap
      // Strudel's Fraction objects.
      const hapBeginRaw = Number(event.hap?.whole?.begin ?? 0)
      // Phase 20-12 — events are collected over [0, WINDOW_CYCLES) via
      // collectCycles, but Strudel's runtime hap stream emits begin as
      // a monotonically-increasing cycle index (cycle 2 → begin=2.x,
      // cycle 3 → 3.x, ...). When the playhead loops back to cycle 0,
      // hapBegin keeps climbing while event.begin stays in [0, 2). To
      // keep highlighting working past the first window pass, fold
      // hapBegin into the visible window via modulo. (`% N` on negative
      // is undefined in JS for our use; hap begins are non-negative.)
      const hapBegin = hapBeginRaw % WINDOW_CYCLES

      // Find the (trackId, eventIndex) row that fired. Read latest tracks
      // through the ref so the handler always sees the current snapshot.
      let matchedKey: string | null = null
      for (const { trackId, events } of orderedTracksRef.current) {
        const idx = events.findIndex(
          (e) =>
            e.irNodeId === event.irNodeId &&
            Math.abs(e.begin - hapBegin) < 1e-9,
        )
        if (idx >= 0) {
          matchedKey = `${trackId}-${idx}`
          break
        }
      }
      // PV37 — silently skip the no-match path; no fallback ladder per P50.
      if (!matchedKey) return

      // Mirror useHighlighting.ts:174-175 timing arithmetic exactly.
      const showDelay = Math.max(0, event.scheduledAheadMs)
      const clearDelay = showDelay + event.audioDuration * 1000

      const showId = window.setTimeout(() => {
        setActiveKeys((prev) => {
          const next = new Set(prev)
          next.add(matchedKey!)
          return next
        })
      }, showDelay)

      const clearId = window.setTimeout(() => {
        setActiveKeys((prev) => {
          if (!prev.has(matchedKey!)) return prev
          const next = new Set(prev)
          next.delete(matchedKey!)
          return next
        })
      }, clearDelay)

      timeoutIdsRef.current.push(showId, clearId)
    }

    hapStream.on(handler)
    return () => {
      hapStream.off(handler)
      // Bulk-clear pending show/clear timeouts so stale fires don't mutate
      // activeKeys after the subscription is gone (Trap T8).
      for (const id of timeoutIdsRef.current) clearTimeout(id)
      timeoutIdsRef.current = []
      setActiveKeys(EMPTY_SET)
    }
    // Only rebind on HapStream identity change. orderedTracks read through
    // a ref above so re-renders from setActiveKeys don't churn the
    // subscription (which would otherwise loop: cleanup → setActiveKeys →
    // re-render → orderedTracks new ref → cleanup again).
  }, [resolvedHapStream])

  // ── Phase 20-12 β-1 — swatch popover anchor state ──────────────────────
  // Single shared anchor for the row-header swatch popover; β-6 renders the
  // popover at the parent level so it floats above all rows. `null` = closed.
  // The anchor rect is captured at click-time from the swatch button's
  // bounding rect (mirrors BackdropPopover.tsx anchor convention).
  const [swatchAnchor, setSwatchAnchor] = useState<{
    trackId: string
    rect: DOMRect
  } | null>(null)
  const handleOpenSwatch = useCallback((trackId: string, rect: DOMRect) => {
    setSwatchAnchor({ trackId, rect })
  }, [])

  const fileId = snapshot?.source

  // ── Phase 20-12 β-2 — trackMeta subscription for collapsed-state reads ─
  // The parent reads each track's `collapsed` flag to drive layoutTrackRows.
  // useTrackMeta is per-(fileId, trackId) and lives inside TrackHeaderRow;
  // here we subscribe ONCE to the file's trackMeta channel and use a tick
  // counter to re-render on any meta change. `getTrackMeta` is then called
  // synchronously per-track during layout — cheap (a Y.Map lookup).
  const [trackMetaTick, setTrackMetaTick] = useState(0)
  useEffect(() => {
    if (!fileId) return
    return subscribeToTrackMeta(fileId, () => {
      setTrackMetaTick((t) => t + 1)
    })
  }, [fileId])
  const collapsedFor = useCallback(
    (trackId: string): boolean => {
      if (!fileId) return false
      return getTrackMeta(fileId, trackId).collapsed ?? false
    },
    // trackMetaTick is intentionally in deps — refresh the closure when the
    // store fires, so consumers reading collapsedFor see the latest values.
    [fileId, trackMetaTick],
  )

  // ── Phase 20-12 β-2 — Layout (collapsed = ROW; expanded = N * SUB_ROW) ─
  const bodyByTrackId = useMemo<Map<string, PatternIR>>(() => {
    if (!snapshot?.ir) return new Map()
    return collectTrackBodies(snapshot.ir)
  }, [snapshot])

  const layoutInputs = useMemo(
    () =>
      orderedTracks.map(({ trackId, events }) => ({
        trackId,
        body: bodyByTrackId.get(trackId),
        events,
      })),
    [orderedTracks, bodyByTrackId],
  )

  // ── Phase 20-12 wave-δ — sub-row height from editor settings ─────────
  // Setting lives in @stave/editor; we subscribe to changes so the layout
  // re-renders when the user drags the slider in EditorSettingsModal.
  const [subRowHeight, setSubRowHeight] = useState<number>(() =>
    getMusicalTimelineSubRowHeight(),
  )
  useEffect(() => {
    return onMusicalTimelineSubRowHeightChange((h) => setSubRowHeight(h))
  }, [])

  const layout = useMemo(
    () => layoutTrackRows(layoutInputs, collapsedFor, subRowHeight),
    [layoutInputs, collapsedFor, subRowHeight],
  )

  const playheadX = cycleToPlayheadX(currentCycle, { gridContentWidth })

  // Click-to-source — single contract per PV36 / D-02. evt.loc[0] is the
  // innermost atom range (D-01); modifier-click variants would walk the
  // rest of evt.loc[] to reveal wrapping call-sites. The 5-commit regex
  // fallback ladder (cc19d5b..eab49d5) was a workaround cascade for
  // missing-loc events in the IR — PV36 codifies the contract collect()
  // now upholds, so the fallbacks have no scenarios left to handle.
  const handleNoteClick = React.useCallback(
    (evt: IREvent) => {
      if (!snapshot?.source || !evt.loc || evt.loc.length === 0) return
      const line = countLines(snapshot.code, evt.loc[0].start)
      revealLineInFile(snapshot.source, line)
    },
    [snapshot],
  )

  const bpm = cpsToBpm(currentCps)
  const barBeat = formatBarBeat(currentCycle)

  // Status line content — single template site keeps the vocabulary
  // surface narrow.
  let statusContent: React.ReactNode
  if (bpm == null || barBeat === '') {
    statusContent = (
      <span data-musical-timeline="status-text">{STOPPED_STATUS_COPY}</span>
    )
  } else {
    const cpsDisplay =
      currentCps != null && Number.isFinite(currentCps)
        ? currentCps.toFixed(2)
        : '—'
    statusContent = (
      <span data-musical-timeline="status-text">
        {`♩ ${bpm} BPM · cps ${cpsDisplay} · ${barBeat}`}
      </span>
    )
  }

  // Song-mode status replaces the live BPM line with the song shape (#385):
  // the detected loop length, the analyzed horizon, or an analyzing hint.
  if (viewMode === 'song') {
    let songText: string
    if (analyzing && !analysis) songText = 'SONG · analyzing…'
    // #394 — while a pattern is playing (bpm present) but the snapshot hasn't
    // arrived yet, we're mid-capture, not idle: say "analyzing…", not the
    // misleading "press play" (the user already pressed play).
    else if (!analysis) songText = bpm != null ? 'SONG · analyzing…' : 'SONG · press play'
    else if (analysis.periodCycles != null)
      songText = `SONG · loop ${analysis.periodCycles} cycles`
    else
      songText = `SONG · ${analysis.horizonCycles}${analysis.reachedCap ? '+' : ''} cycles`
    statusContent = (
      <span data-musical-timeline="status-text">{songText}</span>
    )
  }

  // View toggle — switches between the live 2-cycle window and the full-song
  // map. Musician vocabulary only (PV32): "Song" / "Live".
  const toggleButton = (
    <button
      type="button"
      data-musical-timeline="view-toggle"
      data-view-mode={viewMode}
      onClick={() => setViewMode((m) => (m === 'window' ? 'song' : 'window'))}
      style={styles.viewToggle}
      title={viewMode === 'window' ? 'Show the whole song' : 'Back to the live window'}
    >
      {viewMode === 'window' ? 'Song ▸' : '◂ Live'}
    </button>
  )

  const empty = orderedTracks.length === 0

  return (
    <div
      data-bottom-panel-tab="musical-timeline"
      role="region"
      aria-label="Timeline"
      style={styles.root}
    >
      <div
        data-musical-timeline="status"
        style={{ ...styles.status, justifyContent: 'space-between' }}
      >
        {statusContent}
        {toggleButton}
      </div>
      {viewMode === 'song' ? (
        <FullSongTimeline
          analysis={analysis}
          getSongPosition={props.getSongPosition ?? (() => null)}
          onSeek={props.onSeek ?? (() => {})}
          getDrawerOpen={props.getDrawerOpen}
          getActiveTabId={props.getActiveTabId}
        />
      ) : (
        <>
      <Ruler currentCycle={currentCycle} gridContentWidth={gridContentWidth} />
      <div style={styles.body}>
        <div
          data-musical-timeline="track-labels"
          style={{ ...styles.labels, position: 'relative' }}
        >
          {empty ? (
            <div
              data-musical-timeline="empty-label"
              style={styles.emptyLabel}
            >
              {EMPTY_STATE_COPY}
            </div>
          ) : (
            layout.tracks.map((trackLayout) => {
              const trackId = trackLayout.trackId
              const events =
                orderedTracks.find((t) => t.trackId === trackId)?.events ?? []
              const firstEventSample = events[0]?.s ?? undefined
              const autoColor = paletteForTrack(
                trackIndexOf(trackId),
                firstEventSample,
              )
              const showLeafRows =
                !trackLayout.collapsed && trackLayout.leaves.length > 1
              const firstLeaf = showLeafRows
                ? trackLayout.leaves[0]
                : undefined
              return (
                <React.Fragment key={trackId}>
                  <TrackHeaderRow
                    fileId={fileId}
                    trackId={trackId}
                    autoColor={autoColor}
                    top={trackLayout.top}
                    height={
                      firstLeaf ? firstLeaf.height : trackLayout.height
                    }
                    onOpenSwatch={handleOpenSwatch}
                    voiceLabel={firstLeaf?.label}
                  />
                  {showLeafRows
                    ? trackLayout.leaves.slice(1).map((leaf) => (
                        <TrackLeafLabel
                          key={`${trackId}-leaf-${leaf.leafIndex}`}
                          top={leaf.top}
                          height={leaf.height}
                          label={leaf.label}
                        />
                      ))
                    : null}
                </React.Fragment>
              )
            })
          )}
        </div>
        <div
          data-musical-timeline="grid"
          ref={gridRef}
          style={styles.grid}
        >
          {/* Bar lines — one per cycle boundary (DV-16). The 1/4-beat
              sub-grid was removed in Phase 20-02; the Ruler above carries
              minor-tick cues. */}
          {gridContentWidth > 0 &&
            Array.from({ length: WINDOW_CYCLES + 1 }).map((_, cycleIdx) => {
              const left = (cycleIdx / WINDOW_CYCLES) * gridContentWidth
              return (
                <div
                  key={cycleIdx}
                  data-musical-timeline-bar-line={cycleIdx}
                  style={{ ...styles.barLine, left }}
                />
              )
            })}
          {/* Track rows + note blocks (β-2: layout-driven; collapsed rows
              get a single ROW_HEIGHT band, expanded rows render N
              SUB_ROW_HEIGHT sub-rows, one per leaf voice from
              flattenLeafVoices). */}
          {layout.tracks.map((trackLayout) => {
            const trackId = trackLayout.trackId
            const events =
              orderedTracks.find((t) => t.trackId === trackId)?.events ?? []
            const trackOverrideColor = (() => {
              if (!fileId) return undefined
              const meta: TrackMeta = getTrackMeta(fileId, trackId)
              return meta.color
            })()
            return (
              <div
                key={trackId}
                data-musical-timeline-track-row={trackId}
                data-track-collapsed={trackLayout.collapsed ? 'true' : 'false'}
                style={{
                  ...styles.row,
                  top: trackLayout.top,
                  height: trackLayout.height,
                }}
              >
                {events.map((evt, i) => {
                  const { x, w } = eventToRect(evt, { gridContentWidth })
                  const isActive = activeKeys.has(`${trackId}-${i}`)
                  // β-3: opacity = clamp(gain, 0.15, 1). Replace, not multiply
                  // (gain semantically dominates per RESEARCH §G.3). Floor 0.15
                  // keeps gain(0) bars visually present (intentional —
                  // disappearing entirely would be wrong feedback for a user
                  // who set gain to 0 deliberately).
                  const gainOpacity = Math.max(
                    0.15,
                    Math.min(1, evt.gain ?? 1),
                  )
                  // β-4: bar Y = pitch within the leaf's sub-row Y-band, when
                  // the leaf is melodic and the event has an extractable pitch.
                  // Otherwise (percussive leaf, no expansion, or no pitch)
                  // fall through to the existing top:4 row-relative inset.
                  // Top is computed in row-relative coordinates because the
                  // bar div sits inside the track row whose `top` is already
                  // trackLayout.top.
                  let barTop = BAR_TOP_DEFAULT
                  let barHeight = BAR_HEIGHT_DEFAULT
                  if (!trackLayout.collapsed && trackLayout.leaves.length > 0) {
                    // Phase 20-12 — pick leaf band by evt.leafIndex (set
                    // at collect-time by editor's Stack arm). Events
                    // without a leafIndex fall onto leaf 0; out-of-range
                    // clamps to the last leaf.
                    const lastLeaf = trackLayout.leaves.length - 1
                    const leafIdx =
                      evt.leafIndex === undefined
                        ? 0
                        : Math.min(Math.max(0, evt.leafIndex), lastLeaf)
                    const leaf = trackLayout.leaves[leafIdx]
                    barHeight = leafBarHeight(leaf.height)
                    if (leaf.melodic && leaf.pitchRange) {
                      const pitch = extractPitch(evt)
                      if (pitch != null) {
                        const yAbs = pitchToY(
                          pitch.midi,
                          { top: leaf.top, height: leaf.height },
                          leaf.pitchRange,
                          barHeight,
                        )
                        // row div is positioned at trackLayout.top, so make
                        // the bar's top relative to that.
                        barTop = yAbs - trackLayout.top
                      } else {
                        // Melodic leaf but this event has no pitch — flat
                        // baseline within the leaf's band (defensive).
                        barTop = leaf.top - trackLayout.top + leaf.height - barHeight - 2
                      }
                    } else {
                      // Percussive leaf: flat baseline at the bottom of the
                      // sub-row band (slight inset for visual separation).
                      barTop = leaf.top - trackLayout.top + leaf.height - barHeight - 2
                    }
                  }
                  return (
                    <div
                      key={`${trackId}-${i}`}
                      data-musical-timeline-note={trackId}
                      data-musical-timeline-active={isActive ? 'true' : undefined}
                      title={formatNoteTooltip(evt, trackId)}
                      onClick={() => handleNoteClick(evt)}
                      style={{
                        ...styles.noteBlock,
                        left: x,
                        width: w,
                        top: barTop,
                        height: barHeight,
                        opacity: gainOpacity,
                        background:
                          evt.color ??
                          trackOverrideColor ??
                          paletteForTrack(
                            trackIndexOf(trackId),
                            evt.s ?? undefined,
                          ),
                        ...(isActive ? styles.noteBlockActive : null),
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
          {/* Playhead — fixed-position marker, pointer-events: none so it
              doesn't intercept click-to-source on note blocks behind it. */}
          <div
            data-musical-timeline="playhead"
            style={{ ...styles.playhead, left: playheadX }}
          />
        </div>
      </div>
      {/* β-6: Track swatch popover. Single-instance at parent level (one
          popover open at a time). Anchor + currentColor read from the
          per-track meta resolved via getTrackMeta (synchronous; the
          parent already subscribed to the file's trackMeta channel via
          the trackMetaTick effect above so changes propagate). */}
      {swatchAnchor && fileId && (
        <TrackSwatchPopover
          anchorRect={swatchAnchor.rect}
          currentColor={
            getTrackMeta(fileId, swatchAnchor.trackId).color ??
            paletteForTrack(
              trackIndexOf(swatchAnchor.trackId),
              orderedTracks.find((t) => t.trackId === swatchAnchor.trackId)
                ?.events[0]?.s ?? undefined,
            )
          }
          onPick={(color) => {
            // Direct setTrackMeta write — bypasses useTrackMeta to avoid the
            // hook-rules dance of conditional subscription. The parent
            // already subscribes via trackMetaTick effect, so the write
            // propagates back to TrackHeaderRow without an extra hop. Trap
            // #5 (write storm) is mitigated by binding to onClick (not
            // mousemove) inside TrackSwatchPopover.
            setTrackMeta(fileId, swatchAnchor.trackId, { color })
          }}
          onClose={() => setSwatchAnchor(null)}
        />
      )}
        </>
      )}
    </div>
  )
}

// ───── Styles ───────────────────────────────────────────────────────────────
// Phase 20-12 wave-δ — theme-aware. The chrome reads CSS variables from
// the global theme (globals.css), so the timeline tracks light/dark/system
// alongside the rest of the IDE. Each var carries a mockup-literal fallback
// (the original Phase 20-02 DV-08 values) so the chrome remains legible if
// loaded outside the global theme (storybook, isolated tests).

const FONT_MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace'

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    fontFamily: FONT_MONO,
    fontSize: 11, // mockup body font-size: 11px (DV-02)
    color: 'var(--text-body, #e2e8f0)',
    background: 'var(--bg-app, #090912)',
  },
  status: {
    height: STATUS_HEIGHT,
    minHeight: STATUS_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    color: 'var(--text-tertiary, rgba(255,255,255,0.4))',
    background: 'var(--bg-panel, #14141f)',
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: 11,
  },
  viewToggle: {
    appearance: 'none' as const,
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
    borderRadius: 3,
    background: 'var(--bg-input, rgba(255,255,255,0.04))',
    color: 'var(--text-body, #e2e8f0)',
    fontFamily: 'inherit',
    fontSize: 10,
    lineHeight: 1,
    padding: '3px 8px',
    cursor: 'pointer' as const,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    overflow: 'auto',
    background: 'var(--bg-app, #090912)',
  },
  labels: {
    width: TRACK_LABEL_WIDTH, // 90px (DV-02)
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  trackLabel: {
    height: ROW_HEIGHT,
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 6, // mockup: .track-label gap: 6px
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    cursor: 'pointer' as const,
  },
  trackDot: {
    width: 7, // mockup: .track-dot 7×7
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
  },
  trackName: {
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
    overflow: 'hidden',
    background: 'var(--bg-input, #0f0f1a)',
  },
  barLine: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 1,
    // Trap 9 — faint cycle cue. Stronger contrast in light mode (uses an
    // alpha over the body bg via `currentColor`-friendly token).
    background: 'var(--border-subtle, rgba(255,255,255,0.04))',
    opacity: 0.4,
    pointerEvents: 'none' as const,
  },
  row: {
    // height is set per-row by β-2 layoutTrackRows (collapsed = ROW_HEIGHT;
    // expanded = N * SUB_ROW_HEIGHT). The default below is a defensive
    // fallback used when layout supplies no override (shouldn't happen).
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
  },
  noteBlock: {
    // β-3 (20-12) — opacity is set per-event by `clamp(evt.gain ?? 1, 0.15, 1)`
    // at the call site. No static opacity here so the per-event style
    // override doesn't have to compete with a baseline `opacity: 0.85`.
    position: 'absolute' as const,
    top: 4,
    height: 16,
    borderRadius: 2,
    cursor: 'pointer' as const,
    boxSizing: 'border-box' as const,
  },
  noteBlockActive: {
    outline: '1px solid var(--border-accent-strong, rgba(139,92,246,0.8))',
    boxShadow: '0 0 6px var(--border-accent, rgba(139,92,246,0.5))',
  },
  playhead: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 1,
    background: 'var(--text-primary, rgba(255,255,255,0.55))', // mockup: .playhead
    opacity: 0.55,
    boxShadow: '0 0 4px var(--text-primary, rgba(255,255,255,0.3))', // mockup: .playhead box-shadow
    pointerEvents: 'none' as const,
  },
} satisfies Record<string, React.CSSProperties>
