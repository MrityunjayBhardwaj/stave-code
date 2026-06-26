/**
 * MasterStrip — the synthetic master channel (S5, design §6.8).
 *
 * Strudel has no "master gain" statement, so the master is synthetic. It shows:
 *  - a live METER off the engine's post-mix `AnalyserNode` (read-only side-tap),
 *  - a FADER that drives superdough's output `destinationGain` PER FILE — an
 *    audio-graph gain, never written to the document (monitoring/output state,
 *    like solo and the meters; V-mixer-5). The value is persisted per file
 *    (`masterStore`) and applied to whichever file is playing.
 *
 * The meter is tapped AFTER `destinationGain`, so it's post-fader (it follows
 * the master fader — the DAW-correct default). Meter and fader share the channel
 * dB taper (`faderTaper`), so master and channels read on one scale.
 */
import * as React from 'react'

import { useMasterMeter } from './useMasterMeter'
import { useMasterGain } from './masterStore'
import { gainToFaderPos, faderPosToGain, formatDb } from './faderTaper'

const FADER_HEIGHT = 80
/** pixels of drag for the fader's full 0..1 travel (matches the channel fader). */
const DRAG_SPAN_PX = 160

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export function MasterStrip({ zoom = 1 }: { zoom?: number } = {}): React.ReactElement {
  const meter = useMasterMeter()
  const { gain, setGain } = useMasterGain()
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
  // state updates as you drag) can't drop the gesture — the Knob/ChannelStrip
  // pattern. No undo/gesture wrapping: the master never edits the document.
  const drag = React.useRef<{ startY: number; startPos: number } | null>(null)
  const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { startY: e.clientY, startPos: pos }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const next = faderPosToGain(clamp01(d.startPos + (d.startY - e.clientY) / DRAG_SPAN_PX))
    setGain(Math.round(next * 1000) / 1000)
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    drag.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }
  const reset = (): void => setGain(1) // double-click → unity

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
          style={{
            position: 'relative',
            height: '100%',
            width: 26,
            display: 'flex',
            justifyContent: 'center',
            cursor: 'ns-resize',
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

      {/* master gain readout: linear + dB (shares the channel readout shape) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span data-mixer-master-gain>{Math.round(gain * 100) / 100}</span>
        <span data-mixer-master-db style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>
          {formatDb(gain)}
        </span>
      </div>
    </div>
  )
}
