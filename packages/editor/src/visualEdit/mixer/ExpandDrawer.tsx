/**
 * ExpandDrawer — a strip's full knob chain, inline to the right (#550 / S4b).
 *
 * The Mixer console strip is the SUMMARY (dot/name/mute, pan/fader/meter/gain);
 * this drawer is the EFFECTS chain (quick-transforms + a Knob per numeric arg —
 * lpf, attack, crush, send levels, …). It mounts the shared `MixerBody`, the
 * very same body the Pattern-tab inspector uses, bound to THIS strip instead of
 * the cursor: `applyEdit = (m) => applyToStrip(strip.id, m)` routes every knob
 * edit through the proven by-id write path, so each edit is a surgical, tagged,
 * one-undo text change that goes live while playing for free (centralised
 * Writeback re-eval). The drawer holds no document state itself — which strips
 * are open is the console's ephemeral, persisted UI state (`expandStore`), never
 * the file (V-mixer-1).
 *
 * Two pieces of `MixerBody` are omitted because they're pattern-authoring
 * concerns, not mixing: the Snap picker (`division` left undefined) and the
 * sound-source picker (`showSoundPicker={false}`) — instrument/kit selection
 * lives on the Pattern tab inspector, its natural home.
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
        // The body uses column flow: it sizes to a constant height (the header
        // plus two knob rows) and grows WIDER as knobs are added (the band
        // scrolls horizontally), never taller and never scrolling. So we top-
        // align to the strip face rather than stretch to it — the drawer is a
        // bit taller than the (1.5×) face to fit two knob rows. `minWidth` keeps
        // a panel-like base (room for ~3 knobs/row); the body's `max-content`
        // width drives the rest.
        alignSelf: 'flex-start',
        display: 'flex',
        minWidth: 264,
        // Full outline (#609): the strip face drops its RIGHT border when
        // expanded, so the drawer's LEFT border is the single hairline seam
        // between them and the top/right/bottom borders close the card — the
        // strip + drawer read as ONE connected, outlined unit that belongs
        // together (the strip rounds its left corners, the drawer its right).
        border: '1px solid var(--border, #3a3a42)',
        background: '#26262c69',
        borderRadius: '0 6px 6px 0',
        overflow: 'hidden',
      }}
    >
      <MixerBody
        chunk={chunk}
        applyEdit={applyEdit}
        beginGesture={beginGesture}
        endGesture={endGesture}
        knobFlow="columns"
        // The console is for mixing (levels / pan / effects). Picking a track's
        // instrument is a pattern-authoring decision — its home is the Pattern
        // tab inspector, so the drawer omits the sound-source picker.
        showSoundPicker={false}
      />
    </div>
  )
}
