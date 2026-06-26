/**
 * ExpandDrawer — a strip's full knob chain, inline to the right (#550 / S4b).
 *
 * The Mixer console strip is the SUMMARY (dot/name/mute, pan/fader/meter/gain);
 * this drawer is the FULL CHAIN (instrument/kit picker, quick-transforms, and a
 * Knob per numeric arg — lpf, attack, crush, send levels, …). It mounts the
 * shared `MixerBody`, the very same body the Pattern-tab inspector uses, bound to
 * THIS strip instead of the cursor: `applyEdit = (m) => applyToStrip(strip.id, m)`
 * routes every knob edit through the proven by-id write path, so each edit is a
 * surgical, tagged, one-undo text change that goes live while playing for free
 * (centralised Writeback re-eval). The drawer holds no document state itself —
 * which strips are open is the console's ephemeral, persisted UI state
 * (`expandStore`), never the file (V-mixer-1).
 *
 * `division`/`onDivisionChange` are left undefined here: Snap is a Pattern/grid
 * concern (the S4 redesign), so the console drawer omits the Snap picker.
 */
import * as React from 'react'

import type { ChunkInfo } from '../chunkDetect'
import type { Writeback } from '../writeback'
import type { StripModel } from './stripModel'
import { MixerBody } from '../panels/MixerBody'

interface ExpandDrawerProps {
  strip: StripModel
  /** the strip's render-time chunk (from `useMixerModel.chunks`, same index) */
  chunk: ChunkInfo
  /** the by-id write path (re-resolves a fresh chunk at write time) */
  applyToStrip: (id: string, mutate: (fresh: ChunkInfo, wb: Writeback) => void) => void
  beginGesture: () => void
  endGesture: () => void
}

export function ExpandDrawer({
  strip,
  chunk,
  applyToStrip,
  beginGesture,
  endGesture,
}: ExpandDrawerProps): React.ReactElement {
  // Bind the shared body to THIS strip — identical shape to `useActiveChunk`'s
  // `applyEdit`, so MixerBody can't tell whether it's cursor- or strip-bound.
  const applyEdit = React.useCallback(
    (mutate: (fresh: ChunkInfo, wb: Writeback) => void): void => applyToStrip(strip.id, mutate),
    [applyToStrip, strip.id],
  )

  return (
    <div
      data-mixer-expand-drawer
      data-mixer-expand-for={strip.id}
      style={{
        flexShrink: 0,
        // Match the channel-strip height, not the full panel (#550 height
        // parity): `alignSelf: stretch` sizes us to the strip group, whose
        // height is set by the strip face. The chain below is absolutely
        // filled so its own (taller) content adds NO height to the group — it
        // scrolls inside instead. `position: relative` anchors that fill.
        alignSelf: 'stretch',
        position: 'relative',
        width: 264,
        borderLeft: '1px solid var(--border, #3a3a42)',
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
          <MixerBody
            chunk={chunk}
            applyEdit={applyEdit}
            beginGesture={beginGesture}
            endGesture={endGesture}
          />
        </div>
      </div>
    </div>
  )
}
