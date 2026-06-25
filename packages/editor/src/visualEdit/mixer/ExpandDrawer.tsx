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
  /** collapse this drawer (the strip's ▸/◂ toggle calls the same store action) */
  onCollapse: () => void
}

export function ExpandDrawer({
  strip,
  chunk,
  applyToStrip,
  beginGesture,
  endGesture,
  onCollapse,
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
        width: 264,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border, #3a3a42)',
        background: 'var(--background-elevated, #26262c)',
        overflow: 'hidden',
      }}
    >
      {/* header: which strip's chain this is + a collapse affordance */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border, #3a3a42)',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: '50%', background: strip.color, flexShrink: 0 }}
        />
        <span
          title={strip.name}
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--foreground, #e6e6ea)',
          }}
        >
          {strip.name}
        </span>
        <button
          type="button"
          data-mixer-expand-collapse
          aria-label={`Collapse ${strip.name}`}
          onClick={onCollapse}
          title="Collapse"
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            padding: 0,
            borderRadius: 3,
            fontSize: 11,
            lineHeight: '16px',
            cursor: 'pointer',
            border: '1px solid var(--border, #3a3a42)',
            background: 'var(--background, #1c1c20)',
            color: 'var(--foreground-muted, #a0a0aa)',
          }}
        >
          ◂
        </button>
      </div>
      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
        <MixerBody
          chunk={chunk}
          applyEdit={applyEdit}
          beginGesture={beginGesture}
          endGesture={endGesture}
        />
      </div>
    </div>
  )
}
