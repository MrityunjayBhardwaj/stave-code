/**
 * MixerConsolePanel — the "Mixer" tab body (#540 / S4).
 *
 * The global mix console: every track as a channel strip, cursor-INDEPENDENT,
 * in a full-width horizontal band. This is the peer-of-Pattern surface for
 * mixing/DJing the whole composition (ride faders, mute/solo, sweep filters)
 * — as opposed to the Pattern tab's cursor-scoped single-track view.
 *
 * S4a mounts the existing `MixerStrips` band here (relocated out of the Pattern
 * tab, which dissolves the S0 sliver — the band no longer shares a narrow column
 * with the param panel). The per-strip expand drawer lands in S4b. When the
 * document has no editable statements the band shows the standby fallback.
 *
 * A `[-] % [+]` zoom bar (#759) pins to the top, mirroring the Timeline's
 * cluster: it drives `mixerZoomStore`, which scales every strip face in lockstep
 * (CSS `zoom`, aspect-exact). It's console chrome, so it shows even in the empty
 * state — the buttons just stay enabled with nothing to scale yet.
 */
import * as React from 'react'

import { MixerStrips } from './MixerStrips'
import { useMixerZoom } from './mixerZoomStore'
import { VisualEditStandby } from '../panels/VisualEditStandby'
import { MIXER_CONSOLE_TAB_ID } from '../panels/tabs'

/** The `[-] NNN% [+]` cluster — pure chrome, reads/writes `mixerZoomStore`. */
function MixerZoomBar(): React.ReactElement {
  const { percent, zoomIn, zoomOut, canZoomIn, canZoomOut } = useMixerZoom()
  return (
    <div data-mixer-zoom={percent} style={styles.zoomBar}>
      <button
        type="button"
        data-mixer-zoom-out
        onClick={zoomOut}
        disabled={!canZoomOut}
        style={styles.zoomButton}
        title="Zoom out — smaller strips"
        aria-label="Zoom out"
      >
        −
      </button>
      <span style={styles.zoomReadout}>{percent}%</span>
      <button
        type="button"
        data-mixer-zoom-in
        onClick={zoomIn}
        disabled={!canZoomIn}
        style={styles.zoomButton}
        title="Zoom in — larger strips"
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  )
}

export function MixerConsolePanel(): React.ReactElement {
  return (
    <div
      data-bottom-panel-tab="mixer-console"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--background, #1c1c20)',
      }}
    >
      <MixerZoomBar />
      {/* The band scrolls horizontally through all strips and fills the tab;
          with no editable statements it shows the standby instead. */}
      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
        <MixerStrips
          emptyFallback={
            <VisualEditStandby
              panel={MIXER_CONSOLE_TAB_ID}
              hint="Add a pattern to see its channel strip."
              icon="settings"
            />
          }
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  zoomBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    padding: '3px 8px',
    borderBottom: '1px solid var(--border, #3a3a42)',
    background: 'var(--background, #1c1c20)',
    // pin the cluster to the right, matching the Timeline's controls
    justifyContent: 'flex-end',
  },
  zoomButton: {
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    lineHeight: 1,
    borderRadius: 4,
    border: '1px solid var(--border, #3a3a42)',
    background: 'var(--bg-input, rgba(255,255,255,0.04))',
    color: 'var(--text, #d8d8dc)',
    cursor: 'pointer',
    padding: 0,
  },
  zoomReadout: {
    minWidth: 40,
    textAlign: 'center',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--text-secondary, rgba(255,255,255,0.7))',
    userSelect: 'none',
  },
}
