/**
 * ChannelStrip — one vertical strip, READ-ONLY (S0).
 *
 * A pure projection of a `StripModel`: colour dot + name, the source summary,
 * a static pan readout, and a static fader (thumb at the gain's taper position
 * with a dB readout). No meter (S2), no gestures (S1+) yet — this slice proves
 * "see every track at once" on the existing, trusted read seams.
 *
 * Foreign `.gain` (a signal/expression) renders the fader disabled rather than
 * guessing a position — the conservatism rule (P194: never silently mishandle a
 * value the panel doesn't understand).
 */
import * as React from 'react'

import type { StripModel } from './stripModel'
import { gainToFaderPos, formatDb } from './faderTaper'

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

const FADER_HEIGHT = 80

export function ChannelStrip({ strip }: { strip: StripModel }): React.ReactElement {
  const gain = faderGain(strip)
  const pos = gain === null ? 0 : gainToFaderPos(gain)
  const summary =
    strip.headFn && strip.miniString !== null
      ? `${strip.headFn}("${strip.miniString}")`
      : strip.source ?? strip.headFn ?? ''

  return (
    <div
      data-mixer-strip
      data-mixer-strip-id={strip.id}
      data-mixer-strip-kind={strip.kind}
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
      {/* header: colour dot + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span
          data-mixer-strip-dot
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: strip.color,
            flexShrink: 0,
          }}
        />
        <span
          data-mixer-strip-name
          title={strip.name}
          style={{
            fontSize: 11,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {strip.name}
        </span>
      </div>

      {/* source summary */}
      <span
        data-mixer-strip-source
        title={summary}
        style={{
          fontSize: 10,
          color: 'var(--foreground-muted, #a0a0aa)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {summary}
      </span>

      {/* pan readout (static in S0) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>pan</span>
        <span data-mixer-strip-pan>{panLabel(strip.pan)}</span>
      </div>

      {/* fader (static) — meter fuses beside this in S2 */}
      <div
        style={{
          position: 'relative',
          height: FADER_HEIGHT,
          display: 'flex',
          justifyContent: 'center',
          opacity: gain === null ? 0.4 : 1,
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
            }}
          />
        )}
      </div>

      {/* gain readout: dB + linear (or "sig" for a foreign gain) */}
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
