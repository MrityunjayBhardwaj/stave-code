/**
 * MixerPanel — the Pattern ▸ Mixer column.
 *
 * Composes the channel-strip row (S0, cursor-independent, all tracks) above
 * today's param panel (cursor-bound knobs/pickers, unchanged — it becomes each
 * strip's expand drawer in S4). The strip row only renders when the document has
 * editable statements; otherwise the param panel's own standby shows through.
 *
 * Pure composition: `<Mixer>` keeps its binding, write-back and standby exactly
 * as before, so every existing Mixer/grid behaviour and e2e is untouched.
 */
import * as React from 'react'

import { Mixer } from '../panels/Mixer'
import { MixerStrips } from './MixerStrips'
import type { Division } from '../panels/division'

interface MixerPanelProps {
  division?: Division
  onDivisionChange?: (d: Division) => void
}

/**
 * Floor for the param panel so its tallest control (the knob row) stays on
 * screen even when the strip band is present. Measured against the param
 * panel's own content: the gain knob sits ~190 px down, so anything less clips
 * it below the fold in a short drawer.
 */
const PARAM_MIN_HEIGHT = 195

export function MixerPanel({ division, onDivisionChange }: MixerPanelProps = {}): React.ReactElement {
  return (
    <div
      data-mixer-panel
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      {/* Strip band. The param panel below keeps priority (it has the editable
          knobs the #381 spec relies on), so in a short drawer the band shrinks
          to a scrollable sliver and the strips get their full height only once
          the drawer is taller — `minHeight: 0` lets it shrink below its content
          and `overflowY: auto` makes the overflow reachable. The param panel
          absorbs into the per-strip expand drawer in a later slice, at which
          point this band becomes the whole panel. */}
      <div style={{ flexShrink: 1, flexGrow: 0, minHeight: 0, maxHeight: '50%', overflowY: 'auto' }}>
        <MixerStrips />
      </div>
      {/* param panel — keeps enough height for its knob to stay on-screen */}
      <div style={{ flex: '1 1 0', minHeight: PARAM_MIN_HEIGHT, overflow: 'hidden' }}>
        <Mixer division={division} onDivisionChange={onDivisionChange} />
      </div>
    </div>
  )
}
