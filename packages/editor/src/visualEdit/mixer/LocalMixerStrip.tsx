/**
 * LocalMixerStrip — the Pattern tab's single, cursor-bound channel strip (#540 / S4a).
 *
 * The Pattern tab is the local view of ONE track. Beside the param panel
 * (instrument/knobs/Snap) it shows a single channel strip for the track under
 * the cursor — pan, the fused fader+meter, gain·dB — so you can ride the fader
 * and watch the level while editing that track's notes, without leaving for the
 * global Mixer tab. It is HEADERLESS (no dot/name/mute): you already know which
 * track it is (the one your cursor is in), and mute is a global-console action.
 *
 * For a TOP-LEVEL track it selects the cursor's strip out of the WHOLE-document
 * strip set (not a single-chunk build) so its `captureId` matches the engine's
 * source-order numbering — a single-chunk build would mis-number an anonymous
 * `$:` as `$0` and join the meter to the wrong track (GR1 / P-MIX-5). Writes
 * ride the same `applyToStrip(id, …)` path as the console.
 *
 * A cursor INSIDE a combinator — `stack(...)`, `cat(...)` — binds a NESTED voice
 * (#395, the grid edits that voice's notes), which has no top-level statement and
 * so no whole-doc strip. Rather than vanish, the strip then binds the cursor
 * chunk directly (a single-chunk build) and writes through the cursor's own
 * `applyEdit` (anchored at the nested expression, not the id-keyed
 * `applyToStrip`). The stack is ONE engine track, so a nested voice has no
 * per-voice `captureId` → no meter (per-voice metering is S6 / GR4); its fader,
 * pan and gain still edit the voice's own chain. Both paths go live while
 * playing via the centralised Writeback re-eval.
 */
import * as React from 'react'

import { type ChunkInfo } from '../chunkDetect'
import { type Writeback } from '../writeback'
import { useActiveChunk } from '../panels/useActiveChunk'
import { useMixerModel } from './useMixerModel'
import { useTrackMeters } from './useTrackMeters'
import { ChannelStrip } from './ChannelStrip'
import { buildStripModels } from './stripModel'
import { gainEdit, panEdit } from './writeStrip'

export function LocalMixerStrip(): React.ReactElement | null {
  const { chunk, applyEdit, beginGesture: beginCursor, endGesture: endCursor } = useActiveChunk()
  const { strips, applyToStrip, beginGesture, endGesture } = useMixerModel()
  const meters = useTrackMeters()

  // Match the cursor's statement to its strip by the statement-start anchor
  // (the same anchor useActiveChunk re-detects on). Unique per statement.
  const anchor = chunk ? chunk.statementRange[0] : null
  const topStrip = anchor != null ? strips.find((s) => s.statementRange[0] === anchor) : undefined

  // Nested combinator voice (#395): no top-level strip — build one from the
  // cursor chunk so the strip stays put (bound to the voice) instead of vanishing.
  const nestedStrip = !topStrip && chunk ? (buildStripModels([chunk])[0] ?? null) : null
  const strip = topStrip ?? nestedStrip
  if (!strip) return null
  const nested = topStrip === undefined

  // Route a strip edit: top-level → the id-keyed whole-doc write (correct
  // captureId, meter); nested → the cursor's applyEdit, anchored at the nested
  // expression. Both re-resolve the chunk fresh before mutating.
  const run = (mutate: (fresh: ChunkInfo, wb: Writeback) => void): void =>
    nested ? applyEdit(mutate) : applyToStrip(strip.id, mutate)

  return (
    <div
      data-mixer-local-strip
      style={{
        flexShrink: 0,
        display: 'flex',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border, #3a3a42)',
        background: 'var(--background, #1c1c20)',
        overflow: 'hidden',
      }}
    >
      <ChannelStrip
        strip={strip}
        showHeader={false}
        orientation="horizontal"
        onGainChange={(value) =>
          run((fresh, wb) => {
            const e = gainEdit(fresh, value)
            if (e) wb.replaceRange(e.range, e.text, 'mixer')
          })
        }
        onPanChange={(value) =>
          run((fresh, wb) => {
            const e = panEdit(fresh, value)
            if (e) wb.replaceRange(e.range, e.text, 'mixer')
          })
        }
        onGestureStart={nested ? beginCursor : beginGesture}
        onGestureEnd={nested ? endCursor : endGesture}
        // No reliable per-voice captureId for a nested stack voice → no meter.
        meters={nested ? undefined : meters}
      />
    </div>
  )
}
