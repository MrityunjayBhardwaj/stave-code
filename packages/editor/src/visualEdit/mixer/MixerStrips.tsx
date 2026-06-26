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
import { useSoloStrips } from './soloStore'
import { ChannelStrip } from './ChannelStrip'
import { ExpandDrawer } from './ExpandDrawer'
import { MasterStrip } from './MasterStrip'
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
  // Solo (S5): session-ephemeral, never persisted/written; applies an eval-input
  // overlay that silences non-soloed tracks in the string sent to the engine.
  const { soloed, toggle: toggleSolo } = useSoloStrips()
  const soloActive = soloed.size > 0
  if (strips.length === 0) return <>{emptyFallback ?? null}</>

  return (
    <div
      data-mixer-strips
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: 8,
        // Each strip group is content-tall (its strip face's natural height), so
        // an expanded drawer matches the strips rather than the whole panel
        // (#550 height parity). The band still fills the panel: the row pins to
        // the top with slack below, and tall knob chains scroll inside.
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
            // Strip face + (when open) its drawer, side-by-side and SAME height:
            // the strip face is the group's only in-flow height, so the group is
            // strip-tall, and `alignItems: stretch` sizes the drawer to match
            // (its knob chain is absolutely filled, so it adds no height).
            style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}
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
              soloed={soloed.has(strip.id)}
              onSoloToggle={() => toggleSolo(strip.id)}
              dimmed={soloActive && !soloed.has(strip.id)}
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
              />
            )}
          </div>
        )
      })}
      {/* synthetic master — meter-only, pinned to the right of the scroller (S5) */}
      <MasterStrip />
    </div>
  )
}
