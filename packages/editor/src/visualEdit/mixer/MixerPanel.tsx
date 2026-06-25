/**
 * MixerPanel — the Pattern ▸ Mixer column (the LOCAL, cursor-scoped view).
 *
 * Composes today's param panel (`<Mixer>` — instrument/kit picker, the `+gain`/
 * `+lpf`/… knob grid, the Snap dropdown; the "inspector") beside a single
 * cursor-bound channel strip (`<LocalMixerStrip>` — pan/fader/meter/gain for the
 * track under the cursor). Together they're "everything about this one track,"
 * without leaving for the global Mixer console tab.
 *
 * S4a moved the all-tracks strip BAND out of here into the Mixer console tab,
 * which dissolves the S0 sliver (the band no longer competes with the param
 * panel for height) — so the old `PARAM_MIN_HEIGHT` flexbox floor (P-MIX-1) is
 * gone. `<Mixer>` keeps its cursor binding, write-back and standby exactly as
 * before, so every existing #381 Mixer/grid behaviour and e2e is untouched.
 */
import * as React from 'react'

import { Mixer } from '../panels/Mixer'
import { LocalMixerStrip } from './LocalMixerStrip'
import type { Division } from '../panels/division'

interface MixerPanelProps {
  division?: Division
  onDivisionChange?: (d: Division) => void
}

export function MixerPanel({ division, onDivisionChange }: MixerPanelProps = {}): React.ReactElement {
  return (
    <div
      data-mixer-panel
      style={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0, minWidth: 0 }}
    >
      {/* inspector — today's param panel, cursor-bound, unchanged (#381) */}
      <div style={{ flex: '1 1 0', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <Mixer division={division} onDivisionChange={onDivisionChange} />
      </div>
      {/* the cursor track's channel strip — pan/fader/meter, headerless */}
      <LocalMixerStrip />
    </div>
  )
}
