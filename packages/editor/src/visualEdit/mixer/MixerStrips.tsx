/**
 * MixerStrips — the channel-strip row (S0, read-only).
 *
 * Renders one `ChannelStrip` per top-level statement, cursor-independent, in a
 * horizontal scroller (master strip + write controls land in later slices).
 * Returns null when the document has no editable statements, so the host can
 * fall back to the param panel's own standby.
 */
import * as React from 'react'

import { useMixerModel } from './useMixerModel'
import { ChannelStrip } from './ChannelStrip'

export function MixerStrips(): React.ReactElement | null {
  const { strips } = useMixerModel()
  if (strips.length === 0) return null

  return (
    <div
      data-mixer-strips
      style={{
        display: 'flex',
        gap: 8,
        padding: 8,
        overflowX: 'auto',
        overflowY: 'hidden',
        borderBottom: '1px solid var(--border, #3a3a42)',
        background: 'var(--background, #1c1c20)',
      }}
    >
      {strips.map((strip) => (
        <ChannelStrip key={strip.id} strip={strip} />
      ))}
    </div>
  )
}
