/**
 * MixerStrips — the channel-strip row.
 *
 * Renders one `ChannelStrip` per top-level statement, cursor-independent, in a
 * horizontal scroller. Fader/pan gestures route through `useMixerModel`'s single
 * write path (`applyToStrip` → tagged `Writeback`), so every move is a surgical,
 * one-undo text edit and the strips re-derive from the result (master strip and
 * meters land in later slices). Returns null when the document has no editable
 * statements, so the host can fall back to the param panel's own standby.
 *
 * Live while playing: every edit here goes through `Writeback`, which re-evals
 * the playing file on commit (a single click immediately, a drag once on
 * release) — so mute / fader / pan are all audible at once, no manual eval. That
 * lives at the write boundary (shared by every visual surface), not here.
 */
import * as React from 'react'

import { useMixerModel } from './useMixerModel'
import { useTrackMeters } from './useTrackMeters'
import { useExpandedStrips } from './expandStore'
import { ChannelStrip } from './ChannelStrip'
import { ExpandDrawer } from './ExpandDrawer'
import { gainEdit, panEdit, muteEdit } from './writeStrip'

export function MixerStrips({
  emptyFallback,
}: {
  /** rendered in place of the band when the document has no editable
   *  statements — lets the host (the Mixer console) show a standby without a
   *  second `useMixerModel` subscription just to read the count. */
  emptyFallback?: React.ReactNode
} = {}): React.ReactElement | null {
  const { strips, chunks, applyToStrip, beginGesture, endGesture } = useMixerModel()
  // One capped RAF loop + bus subscription for every strip's live meter (S2).
  const meters = useTrackMeters()
  // Per-file ephemeral expand state (S4b): which strips show their knob chain.
  // Persisted in localStorage, never the file (V-mixer-1).
  const { expanded, toggle } = useExpandedStrips()
  if (strips.length === 0) return <>{emptyFallback ?? null}</>

  return (
    <div
      data-mixer-strips
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        padding: 8,
        // Fill the panel height so an expanded drawer is tall enough to use the
        // full knob chain (the strips stretch to match — DAW consoles are tall).
        height: '100%',
        minHeight: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        borderBottom: '1px solid var(--border, #3a3a42)',
        background: 'var(--background, #1c1c20)',
      }}
    >
      {strips.map((strip, i) => {
        const isOpen = expanded.has(strip.id)
        return (
          // A strip + (when open) its expand drawer, side-by-side: the drawer
          // grows to the RIGHT, so later strips push along the horizontal
          // scroller (design §6.7). The group is the flex item.
          <div
            key={strip.id}
            data-mixer-strip-group
            // The group fills the band height (band alignItems:stretch). Inside,
            // the strip face stays compact at the top (flex-start) while the
            // drawer's height:100% stretches it to the full panel height.
            style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}
          >
            <ChannelStrip
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
              onMuteToggle={() =>
                applyToStrip(strip.id, (fresh, wb) => {
                  const e = muteEdit(fresh, !strip.muted)
                  if (e) wb.replaceRange(e.range, e.text, 'mixer')
                })
              }
              onGestureStart={beginGesture}
              onGestureEnd={endGesture}
              meters={meters}
              expanded={isOpen}
              onToggleExpand={() => toggle(strip.id)}
            />
            {isOpen && chunks[i] && (
              <ExpandDrawer
                strip={strip}
                chunk={chunks[i]}
                applyToStrip={applyToStrip}
                beginGesture={beginGesture}
                endGesture={endGesture}
                onCollapse={() => toggle(strip.id)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
