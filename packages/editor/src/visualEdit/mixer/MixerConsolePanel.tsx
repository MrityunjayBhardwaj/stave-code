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
 */
import * as React from 'react'

import { MixerStrips } from './MixerStrips'
import { VisualEditStandby } from '../panels/VisualEditStandby'
import { MIXER_CONSOLE_TAB_ID } from '../panels/tabs'

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
