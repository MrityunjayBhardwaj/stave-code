/**
 * MasterStrip — the master channel (S5, design §6.8; code counterpart #792).
 *
 * The master is Strudel's master bus: `all(x => …)`, stacking every track. It shows:
 *  - a live METER off the engine's post-mix `AnalyserNode` (read-only side-tap),
 *  - a FADER that round-trips to code: it PROJECTS the document's
 *    `all(x => x.gain())` scalar (unity when the line is absent) and, on drag,
 *    WRITES that line through the Mixer's `Writeback` — exactly like a channel
 *    fader writes `.gain()` on its `$:` line (#792, REPLACE decision). No
 *    synthetic per-file output gain: the master trim lives in the document.
 *
 * A pure projection — `gain`/`onGainChange` are supplied by `MixerStrips` from
 * `useMixerModel` (which reads/writes the doc), so this component never touches
 * the store or the engine. The meter reads the post-mix analyser, which already
 * reflects the code gain (each hap is scaled in eval), so it stays post-fader.
 * `foreign` (a signal/patterned master gain the fader can't rewrite) disables the
 * drag. Meter and fader share the channel dB taper (`faderTaper`), one scale.
 */
import * as React from 'react'

import { useMasterMeter } from './useMasterMeter'
import { gainToFaderPos, faderPosToGain, formatDb } from './faderTaper'

const FADER_HEIGHT = 80
/** pixels of drag for the fader's full 0..1 travel (matches the channel fader). */
const DRAG_SPAN_PX = 160

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export function MasterStrip({
  zoom = 1,
  gain,
  foreign = false,
  onGainChange,
  onGestureStart,
  onGestureEnd,
}: {
  zoom?: number
  /** the master gain the fader shows — the doc's `all()` gain, or unity (#792). */
  gain: number
  /** true when the master gain is a signal/pattern the fader can't rewrite → disabled. */
  foreign?: boolean
  /** drag/reset writes the new master gain to code (via `MixerStrips`→Writeback). */
  onGainChange: (value: number) => void
  /** open/close the one-undo-step gesture around a continuous drag (as ChannelStrip). */
  onGestureStart?: () => void
  onGestureEnd?: () => void
}): React.ReactElement {
  const meter = useMasterMeter()
  const fillRef = React.useRef<HTMLDivElement>(null)
  const peakRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const fill = fillRef.current
    const peak = peakRef.current
    if (!fill || !peak) return
    meter.register({ fill, peak })
    return () => meter.register(null)
  }, [meter])

  const pos = gainToFaderPos(gain)
  // Pointer-capture drag with a start anchor, so a re-render mid-drag (the gain
  // projection updates as you drag) can't drop the gesture — the Knob/ChannelStrip
  // pattern. The drag is wrapped in a Writeback gesture (begin on down, end on up)
  // so a continuous move is ONE undo step + ONE re-eval on release (#792), exactly
  // like a channel fader. A `foreign` (signal) master gain disables the drag.
  const drag = React.useRef<{ startY: number; startPos: number } | null>(null)
  const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (foreign) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    onGestureStart?.()
    drag.current = { startY: e.clientY, startPos: pos }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const next = faderPosToGain(clamp01(d.startPos + (d.startY - e.clientY) / DRAG_SPAN_PX))
    onGainChange(Math.round(next * 1000) / 1000)
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    drag.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    onGestureEnd?.()
  }
  const reset = (): void => {
    if (foreign) return
    onGainChange(1) // double-click → unity
  }

  return (
    <div
      data-mixer-master-strip
      style={{
        // Pinned to the right edge of the horizontal scroller (design §7.2) so
        // the master stays visible when tracks overflow.
        position: 'sticky',
        right: 0,
        // Match the console channel groups' scale (set by MixerStrips). `zoom`
        // (not transform) keeps it aspect-exact and sticky-friendly.
        zoom,
        width: 84,
        flexShrink: 0,
        alignSelf: 'flex-start',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        borderRadius: 6,
        border: '1px solid var(--border, #3a3a42)',
        // A slightly stronger surface than channel strips so it reads as the
        // pinned master and occludes strips scrolling under it.
        background: 'var(--background-elevated, #2c2c34)',
        boxShadow: '-8px 0 8px -6px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: 'var(--foreground, #e6e6ea)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span
          data-mixer-master-name
          style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}
        >
          Master
        </span>
      </div>

      {/* spacer matching a channel's taller (two-row) header + pan row, so the
          master meter/fader align with the channel meters/faders below it AND the
          strip's total height equals a channel face (tuned to the measured 6px
          ÷ 1.5 zoom delta — keep in step with the channel header if it changes). */}
      <div style={{ height: 35 }} />

      {/* fused meter + fader — Logic-style, sharing one dB scale (faderTaper) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          gap: 5,
          height: FADER_HEIGHT,
        }}
      >
        <div
          data-mixer-master-meter
          style={{
            position: 'relative',
            width: 10,
            height: '100%',
            borderRadius: 2,
            background: 'var(--background, #1c1c20)',
            border: '1px solid var(--border, #3a3a42)',
            overflow: 'hidden',
          }}
        >
          <div
            ref={fillRef}
            data-mixer-master-meter-fill
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
            data-mixer-master-meter-peak
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

        {/* fader — vertical drag sets the per-file master output gain */}
        <div
          data-mixer-master-fader
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={reset}
          title={foreign ? 'master gain is a signal — edit it in code' : undefined}
          style={{
            position: 'relative',
            height: '100%',
            width: 26,
            display: 'flex',
            justifyContent: 'center',
            cursor: foreign ? 'default' : 'ns-resize',
            opacity: foreign ? 0.5 : 1,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
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
          <div
            data-mixer-master-thumb
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
        </div>
      </div>

      {/* master gain readout: linear + dB (or "sig" for a foreign gain — mirrors ChannelStrip) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        {foreign ? (
          <span data-mixer-master-gain title="master gain is a signal — edit it in code">sig</span>
        ) : (
          <>
            <span data-mixer-master-gain>{Math.round(gain * 100) / 100}</span>
            <span data-mixer-master-db style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>
              {formatDb(gain)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
