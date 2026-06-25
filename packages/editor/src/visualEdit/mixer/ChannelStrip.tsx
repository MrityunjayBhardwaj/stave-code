/**
 * ChannelStrip — one vertical strip.
 *
 * A projection of a `StripModel`: colour dot + name (the source line is gone —
 * a mix console names channels, it doesn't echo their code), a pan readout, and
 * a fader (thumb at the gain's taper position with a dB readout). `showHeader`
 * off drops the dot/name/mute row entirely — the Pattern tab's *local* mixer is
 * a single headerless strip for the cursor's track (you already know which one
 * it is), where only pan/fader/meter/gain matter.
 *
 * S1 makes the fader and pan WRITE: a vertical drag on the fader sets `.gain`
 * (the taper maps screen travel → linear gain), a horizontal drag on the pan row
 * sets `.pan` (0..1, grounded GR2). Both use pointer capture + a start anchor so
 * a parent re-render mid-drag can't drop the gesture (the Knob pattern), and
 * both wrap the drag in one undo via onGesture{Start,End}. A foreign `.gain`
 * (a signal) and a patterned `.pan` disable their control rather than guess
 * (conservatism, P194).
 */
import * as React from 'react'

import type { StripModel } from './stripModel'
import { gainToFaderPos, faderPosToGain, formatDb } from './faderTaper'
import type { MeterController } from './useTrackMeters'

/** pixels of drag for the fader's full 0..1 travel (matches the Knob). */
const DRAG_SPAN_PX = 160
const FADER_HEIGHT = 80

interface ChannelStripProps {
  strip: StripModel
  /** set this strip's gain (linear) — absent in a read-only context */
  onGainChange?: (value: number) => void
  /** set this strip's pan (0..1) */
  onPanChange?: (value: number) => void
  /** toggle this strip's mute (flip the `_`-prefix marker) — absent = read-only */
  onMuteToggle?: () => void
  /** wrap a drag as one undo step */
  onGestureStart?: () => void
  onGestureEnd?: () => void
  /** live-meter controller — absent in a read-only/test context (no meter then) */
  meters?: MeterController
  /** show the dot/name/mute header row. Off = the headerless local strip. */
  showHeader?: boolean
}

/**
 * StripMeter — the live level bar fused beside the fader (design §6.2). It owns
 * no animation: it registers its fill + peak elements with the shared
 * `useTrackMeters` RAF loop (via `controller`), which paints them imperatively
 * each frame. Keyed by `captureId`; a captureId with no analyser stays dark.
 */
function StripMeter({
  captureId,
  controller,
}: {
  captureId: string
  controller: MeterController
}): React.ReactElement {
  const fillRef = React.useRef<HTMLDivElement>(null)
  const peakRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const fill = fillRef.current
    const peak = peakRef.current
    if (!fill || !peak) return
    controller.register(captureId, { fill, peak })
    return () => controller.register(captureId, null)
  }, [captureId, controller])
  return (
    <div
      data-mixer-strip-meter
      data-mixer-meter-capture={captureId}
      style={{
        position: 'relative',
        width: 6,
        height: '100%',
        borderRadius: 2,
        background: 'var(--background, #1c1c20)',
        border: '1px solid var(--border, #3a3a42)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        ref={fillRef}
        data-mixer-meter-fill
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '0%',
          background: 'var(--meter-green, #44d07b)',
        }}
      />
      <div
        ref={peakRef}
        data-mixer-meter-peak
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '0%',
          height: 2,
          background: 'var(--foreground, #e6e6ea)',
          opacity: 0,
        }}
      />
    </div>
  )
}

/** the linear gain the fader sits at, or null when the gain is foreign. */
function faderGain(strip: StripModel): number | null {
  switch (strip.gain.kind) {
    case 'scalar':
      return strip.gain.value
    case 'managed':
      return strip.gain.ceiling
    case 'absent':
      return 1
    case 'foreign':
      return null
  }
}

/** pan readout: `C`, `L<n>`, or `R<n>` (0=hard L, 0.5=C, 1=hard R). */
function panLabel(pan: number | null): string {
  if (pan === null || pan === 0.5) return 'C'
  if (pan < 0.5) return `L${Math.round((0.5 - pan) * 200)}`
  return `R${Math.round((pan - 0.5) * 200)}`
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export function ChannelStrip({
  strip,
  onGainChange,
  onPanChange,
  onMuteToggle,
  onGestureStart,
  onGestureEnd,
  meters,
  showHeader = true,
}: ChannelStripProps): React.ReactElement {
  const muteEnabled = strip.muteable && onMuteToggle !== undefined
  const gain = faderGain(strip)
  const pos = gain === null ? 0 : gainToFaderPos(gain)
  const faderEnabled = gain !== null && onGainChange !== undefined
  const panEnabled = !strip.panForeign && onPanChange !== undefined
  const panValue = strip.pan ?? 0.5

  const faderDrag = React.useRef<{ startY: number; startPos: number } | null>(null)
  const panDrag = React.useRef<{ startX: number; startPan: number } | null>(null)

  const onFaderDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!faderEnabled) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    faderDrag.current = { startY: e.clientY, startPos: pos }
    onGestureStart?.()
  }
  const onFaderMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = faderDrag.current
    if (!d) return
    const next = faderPosToGain(clamp01(d.startPos + (d.startY - e.clientY) / DRAG_SPAN_PX))
    onGainChange?.(Math.round(next * 1000) / 1000)
  }
  const endFader = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!faderDrag.current) return
    faderDrag.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    onGestureEnd?.()
  }
  const resetFader = (): void => {
    // One non-gesture edit → its own undo step, and Writeback re-evals it live.
    if (faderEnabled) onGainChange?.(1)
  }

  const onPanDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!panEnabled) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    panDrag.current = { startX: e.clientX, startPan: panValue }
    onGestureStart?.()
  }
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = panDrag.current
    if (!d) return
    const next = clamp01(d.startPan + (e.clientX - d.startX) / DRAG_SPAN_PX)
    onPanChange?.(Math.round(next * 100) / 100)
  }
  const endPan = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!panDrag.current) return
    panDrag.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    onGestureEnd?.()
  }

  return (
    <div
      data-mixer-strip
      data-mixer-strip-id={strip.id}
      data-mixer-strip-kind={strip.kind}
      data-mixer-strip-muted={strip.muted ? '' : undefined}
      style={{
        width: 84,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        borderRadius: 6,
        border: '1px solid var(--border, #3a3a42)',
        background: 'var(--background-elevated, #26262c)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: 'var(--foreground, #e6e6ea)',
      }}
    >
      {/* header: colour dot + name + mute toggle (dropped on the local strip) */}
      {showHeader && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span
          data-mixer-strip-dot
          style={{ width: 8, height: 8, borderRadius: '50%', background: strip.color, flexShrink: 0 }}
        />
        <span
          data-mixer-strip-name
          title={strip.name}
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: strip.muted ? 0.45 : 1,
          }}
        >
          {strip.name}
        </span>
        <button
          type="button"
          data-mixer-strip-mute
          aria-label={`${strip.muted ? 'Unmute' : 'Mute'} ${strip.name}`}
          aria-pressed={strip.muted}
          disabled={!muteEnabled}
          onClick={() => onMuteToggle?.()}
          title={strip.muteable ? (strip.muted ? 'Unmute' : 'Mute') : 'Only named/$: tracks can be muted'}
          style={{
            flexShrink: 0,
            width: 16,
            height: 16,
            padding: 0,
            borderRadius: 3,
            fontSize: 9,
            fontWeight: 700,
            lineHeight: '14px',
            cursor: muteEnabled ? 'pointer' : 'default',
            border: '1px solid var(--border, #3a3a42)',
            background: strip.muted ? 'var(--meter-red, #e0564a)' : 'var(--background, #1c1c20)',
            color: strip.muted ? '#fff' : 'var(--foreground-muted, #a0a0aa)',
            opacity: muteEnabled ? 1 : 0.3,
          }}
        >
          M
        </button>
      </div>
      )}

      {/* pan — horizontal drag sets .pan */}
      <div
        data-mixer-strip-pan-control
        onPointerDown={onPanDown}
        onPointerMove={onPanMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          cursor: panEnabled ? 'ew-resize' : 'default',
          opacity: strip.panForeign ? 0.4 : 1,
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>pan</span>
        <span data-mixer-strip-pan>{strip.panForeign ? 'sig' : panLabel(strip.pan)}</span>
      </div>

      {/* fader + fused meter — Logic-style: the live meter sits beside the
          fader at the same height, sharing one dB scale (faderTaper). */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          gap: 5,
          height: FADER_HEIGHT,
        }}
      >
        {meters && <StripMeter captureId={strip.captureId} controller={meters} />}
        {/* fader — vertical drag sets .gain */}
        <div
          data-mixer-strip-fader
          onPointerDown={onFaderDown}
          onPointerMove={onFaderMove}
          onPointerUp={endFader}
          onPointerCancel={endFader}
          onDoubleClick={resetFader}
          style={{
            position: 'relative',
            height: '100%',
            width: 26,
            display: 'flex',
            justifyContent: 'center',
            opacity: gain === null ? 0.4 : 1,
            cursor: faderEnabled ? 'ns-resize' : 'default',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* groove */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 4,
              borderRadius: 2,
              background: 'var(--background, #1c1c20)',
              border: '1px solid var(--border, #3a3a42)',
              pointerEvents: 'none',
            }}
          />
          {/* thumb at the taper position (hidden for foreign gain) */}
          {gain !== null && (
            <div
              data-mixer-strip-thumb
              style={{
                position: 'absolute',
                top: (1 - pos) * (FADER_HEIGHT - 6),
                width: 22,
                height: 6,
                borderRadius: 2,
                background: 'var(--foreground, #e6e6ea)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* gain readout: linear + dB (or "sig" for a foreign gain) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        {gain === null ? (
          <span data-mixer-strip-gain title="gain is a signal — edit in code">sig</span>
        ) : (
          <>
            <span data-mixer-strip-gain>{formatNum(gain)}</span>
            <span data-mixer-strip-db style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>
              {formatDb(gain)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function formatNum(v: number): string {
  return (Math.round(v * 100) / 100).toString()
}
