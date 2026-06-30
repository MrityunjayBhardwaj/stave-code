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
import { gainEdit, panEdit, muteEdit, renameEdit } from './writeStrip'
import { trackIdentity } from '../trackColor'
import { getActiveFileId, onActiveEditorChange } from '../../workspace/editorRegistry'
import { getTrackMeta, setTrackMeta } from '../../workspace/WorkspaceFile'
import { useTrackMetaMap } from '../../workspace/useTrackMeta'

/**
 * Console strips render their FACE at 1.5× via CSS `zoom` (aspect-exact, and —
 * unlike `transform: scale` — it leaves the delta-based fader/pan drags
 * untouched: they read pointer deltas ÷ DRAG_SPAN_PX, never a bounding box). The
 * zoom is applied to the strip face only, NOT the expand drawer: the drawer is a
 * non-zoomed sibling that stretches to the scaled face height (V-mixer-10
 * parity), so it grows TALLER (its knob chain stops scrolling) while its content
 * stays 1×. The master face is zoomed in lockstep (it sits outside the groups).
 * Console only: the Pattern-tab local strip and inspector mount `ChannelStrip`
 * directly, not through here, so they stay 1×.
 */
const CONSOLE_ZOOM = 1.5

export function MixerStrips({
  emptyFallback,
}: {
  /** rendered in place of the band when the document has no editable
   *  statements — lets the host (the Mixer console) show a standby without a
   *  second `useMixerModel` subscription just to read the count. */
  emptyFallback?: React.ReactNode
} = {}): React.ReactElement | null {
  const { strips, chunks, applyToStrip, beginGesture, endGesture, selectedId, selectTrack } =
    useMixerModel()
  // One capped RAF loop + bus subscription for every strip's live meter (S2).
  const meters = useTrackMeters()
  // Per-track custom colour (Phase D, #581). Track the active file (same source
  // as the meters' bus pin) and read its whole-file overrides as one ref-stable
  // map keyed by the strip's DISPLAY NAME (`strip.name`) — the same key the Song
  // Timeline uses, so a colour set in either view shows in both. Resolved through
  // the shared `trackIdentity` so the dot can't diverge from the Timeline lane.
  const [fileId, setFileId] = React.useState<string | null>(() => getActiveFileId())
  React.useEffect(() => onActiveEditorChange(() => setFileId(getActiveFileId())), [])
  // #639 — `selectedId` comes from `useMixerModel`, DERIVED from the editor caret
  // (the strip whose statement holds the cursor). Clicking a strip calls
  // `selectTrack`, which moves the caret there — so the selection is unified with
  // the editor: caret ⇄ selected strip stay in lockstep both ways.
  const trackMeta = useTrackMetaMap(fileId ?? undefined)
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
        // Resolve the dot colour through the shared `trackIdentity`: the custom
        // override (keyed by the strip's display name) or the deterministic
        // palette (#581). Same function the Timeline lane uses → they can't diverge.
        const customColor = trackMeta.get(strip.name)?.color
        const dotColor = trackIdentity(strip.name, customColor).color
        return (
          // A strip + (when open) its expand drawer, side-by-side: the drawer
          // grows to the RIGHT, so later strips push along the horizontal
          // scroller (design §6.7). The group is the flex item.
          <div
            key={strip.id}
            data-mixer-strip-group
            data-mixer-strip-group-selected={strip.id === selectedId ? '' : undefined}
            // Strip face + (when open) its drawer, side-by-side and SAME height:
            // the zoomed strip face is the group's only in-flow height, so the
            // group is (scaled-)strip-tall, and `alignItems: stretch` sizes the
            // drawer to match (its knob chain is absolutely filled, so it adds no
            // height). The drawer itself is NOT zoomed — it just grows taller to
            // the scaled face, so its 1× content stops scrolling (V-mixer-10).
            style={{
              display: 'flex',
              alignItems: 'stretch',
              flexShrink: 0,
              // #639 — the SELECTION highlight is a single accent ring on THIS
              // wrapper, which encapsulates the strip face AND (when open) its
              // drawer. The box-shadow follows the group's border-radius and sits
              // at its outer edge, so one continuous purple outline wraps the whole
              // unit and AUTOMATICALLY grows to include the drawer when expanded —
              // the face/drawer keep their own neutral #609 borders; only this div
              // highlights. box-shadow (not border) → no layout shift on select.
              borderRadius: 6,
              boxShadow:
                strip.id === selectedId ? '0 0 0 1.5px var(--accent, #6ea8fe)' : undefined,
            }}
          >
            <ChannelStrip
              strip={strip}
              zoom={CONSOLE_ZOOM}
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
              onRename={(newLabel) =>
                applyToStrip(strip.id, (fresh, wb) => {
                  // Reject a rename that would duplicate another track's display
                  // name (#585) — `takenNames` is every OTHER strip's name.
                  const taken = new Set(
                    strips.filter((s) => s.id !== strip.id).map((s) => s.name),
                  )
                  const e = renameEdit(fresh, newLabel, taken)
                  if (!e) return
                  wb.replaceRange(e.range, e.text, 'mixer')
                  // Migrate a custom-colour override from the OLD display name to
                  // the new label so the rename doesn't orphan it (#581).
                  if (fileId) {
                    const prevColor = getTrackMeta(fileId, strip.name).color
                    if (prevColor && strip.name !== newLabel) {
                      setTrackMeta(fileId, newLabel, { color: prevColor })
                      setTrackMeta(fileId, strip.name, { color: undefined })
                    }
                  }
                })
              }
              dotColor={dotColor}
              onPickColor={
                fileId
                  ? (color) => setTrackMeta(fileId, strip.name, { color })
                  : undefined
              }
              onResetColor={
                fileId
                  ? () => setTrackMeta(fileId, strip.name, { color: undefined })
                  : undefined
              }
              soloed={soloed.has(strip.id)}
              onSoloToggle={() => toggleSolo(strip.id)}
              dimmed={soloActive && !soloed.has(strip.id)}
              selected={strip.id === selectedId}
              onSelect={() => selectTrack(strip.id)}
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
      {/* synthetic master — meter-only, pinned to the right of the scroller (S5).
          Zoomed in lockstep with the channel groups so it reads at the same
          scale (it sits outside the groups, so it takes the zoom directly). */}
      <MasterStrip zoom={CONSOLE_ZOOM} />
    </div>
  )
}
