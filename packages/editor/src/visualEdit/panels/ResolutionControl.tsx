/**
 * ResolutionControl — the ×2 / ÷2 grid-resolution control shared by both grids
 * (#479). The substrate-honest "more / fewer slots": ×2 splits every column in
 * two (hits keep their position, new in-between slots open up), ÷2 merges pairs
 * back. Both are ratio-preserving mini-notation sugar — the haps are unchanged
 * (verified in `notation/resolution.ts`), so this is purely an editing-grid
 * affordance, not a musical change.
 *
 * `÷2` is disabled when halving would be lossy (an odd column carries a hit /
 * note) and `×2` when the grid is already at the column cap — the same
 * honest-control rule as the Snap picker (no silent no-op / corruption).
 */
import * as React from 'react'

import type { ResolutionDir } from '../notation/resolution'

export interface ResolutionControlProps {
  onScale: (dir: ResolutionDir) => void
  canDouble: boolean
  canHalve: boolean
}

const BTN: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: 11,
  border: 'none',
  background: 'transparent',
  color: 'var(--foreground-muted, #a0a0aa)',
  cursor: 'pointer',
}

export function ResolutionControl({
  onScale,
  canDouble,
  canHalve,
}: ResolutionControlProps): React.ReactElement {
  return (
    <div
      data-resolution-control
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
    >
      <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>Slots</span>
      <div
        role="group"
        aria-label="grid resolution"
        style={{
          display: 'inline-flex',
          border: '1px solid var(--border, #3a3a42)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          data-resolution-halve
          aria-label="fewer slots (÷2)"
          title="Fewer slots — halve the grid resolution (keeps timing)"
          disabled={!canHalve}
          onClick={() => onScale('halve')}
          style={{
            ...BTN,
            borderRight: '1px solid var(--border, #3a3a42)',
            opacity: canHalve ? 1 : 0.4,
            cursor: canHalve ? 'pointer' : 'not-allowed',
          }}
        >
          ÷2
        </button>
        <button
          type="button"
          data-resolution-double
          aria-label="more slots (×2)"
          title="More slots — double the grid resolution (keeps timing)"
          disabled={!canDouble}
          onClick={() => onScale('double')}
          style={{
            ...BTN,
            opacity: canDouble ? 1 : 0.4,
            cursor: canDouble ? 'pointer' : 'not-allowed',
          }}
        >
          ×2
        </button>
      </div>
    </div>
  )
}
