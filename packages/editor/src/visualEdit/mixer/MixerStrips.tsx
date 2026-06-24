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

import { getActiveFileId, requestReeval } from '../../workspace/editorRegistry'
import { useMixerModel } from './useMixerModel'
import { useTrackMeters } from './useTrackMeters'
import { ChannelStrip } from './ChannelStrip'
import { gainEdit, panEdit, muteEdit } from './writeStrip'

export function MixerStrips(): React.ReactElement | null {
  const { strips, applyToStrip, beginGesture, endGesture } = useMixerModel()
  // One capped RAF loop + bus subscription for every strip's live meter (S2).
  const meters = useTrackMeters()
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
          onMuteToggle={() => {
            let edited = false
            applyToStrip(strip.id, (fresh, wb) => {
              const e = muteEdit(fresh, !strip.muted)
              if (e) {
                wb.replaceRange(e.range, e.text, 'mixer')
                edited = true
              }
            })
            // Live mute: a mixer edit doesn't auto-eval (that's live mode only),
            // so make the mute audible NOW by asking the app to re-eval this file
            // — it re-evals only if already playing, so we never auto-start audio.
            // The Monaco write above already synced to the file store, so the
            // re-eval reads the muted content.
            if (edited) requestReeval(getActiveFileId())
          }}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
          meters={meters}
        />
      ))}
    </div>
  )
}
