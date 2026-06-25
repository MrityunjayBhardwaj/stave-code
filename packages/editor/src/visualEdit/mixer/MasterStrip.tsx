/**
 * MasterStrip — the synthetic master channel (S5, design §6.8).
 *
 * Strudel has no single "master gain" statement, so the master is synthetic: it
 * reads the engine's master `AnalyserNode` (the post-mix output tap) for a live
 * level. This MVP is METER-ONLY (GR6 option b): a read-only level, no fader — a
 * real master fader needs an exposed output-gain node, deferred until then. It is
 * pinned to the right of the scroller so it stays visible however many tracks
 * overflow.
 *
 * The meter shares the channel strips' dB taper (via `useMasterMeter`), so the
 * master and channels read on one scale.
 */
import * as React from 'react'

import { useMasterMeter } from './useMasterMeter'

const FADER_HEIGHT = 80

export function MasterStrip({ scale = 1 }: { scale?: number } = {}): React.ReactElement {
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

  return (
    <div
      data-mixer-master-strip
      style={{
        // Pinned to the right edge of the horizontal scroller (design §7.2) so
        // the master stays visible when tracks overflow.
        position: 'sticky',
        right: 0,
        width: 84,
        // Scale in lockstep with the channel strips (useStripScale) so the master
        // stays the same height as the channels it sits beside. `zoom` keeps the
        // aspect ratio exact; the meter (a %-height bar) is unaffected.
        zoom: scale,
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
          master meter aligns with the channel meters/faders below it */}
      <div style={{ height: 39 }} />

      {/* meter (no fader — meter-only master) */}
      <div style={{ display: 'flex', justifyContent: 'center', height: FADER_HEIGHT }}>
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
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 10 }}>
        <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>out</span>
      </div>
    </div>
  )
}
