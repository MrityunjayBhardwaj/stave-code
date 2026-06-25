/**
 * MixerStrips — the channel-strip row.
 *
 * Renders one `ChannelStrip` per top-level statement, cursor-independent, in a
 * horizontal scroller. Fader/pan gestures route through `useMixerModel`'s single
 * write path (`applyToStrip` → tagged `Writeback`), so every move is a surgical,
 * one-undo text edit and the strips re-derive from the result (master strip and
 * meters land in later slices). Returns null when the document has no editable
 * statements, so the host can fall back to the param panel's own standby.
 */
import * as React from 'react'

import { useMixerModel } from './useMixerModel'
import { ChannelStrip } from './ChannelStrip'
import { gainEdit, panEdit } from './writeStrip'

export function MixerStrips(): React.ReactElement | null {
  const { strips, applyToStrip, beginGesture, endGesture } = useMixerModel()
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
        <ChannelStrip
          key={strip.id}
          strip={strip}
          onGainChange={(value) =>
            applyToStrip(strip.id, (fresh, wb) => {
              const e = gainEdit(fresh, value)
              if (e) wb.replaceRange(e.range, e.text, 'mixer')
            })
          }
          onPanChange={(value) =>
            applyToStrip(strip.id, (fresh, wb) => {
              const e = panEdit(fresh, value)
              if (e) wb.replaceRange(e.range, e.text, 'mixer')
            })
          }
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
        />
      ))}
    </div>
  )
}
