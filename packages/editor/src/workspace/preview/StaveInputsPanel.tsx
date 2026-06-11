/**
 * StaveInputsPanel — a read-only, ShaderToy-style reference of the Stave-injected
 * globals available in a viz sketch (#309). Rendered below the VizEditorChrome
 * action bar, above the Monaco editor.
 *
 * It is documentation, not an input: the block text is never mutated (live signal
 * values are surfaced on HOVER over the token in your code, not here — keeping the
 * doc static + copyable). Collapsed by default; a thin header strip toggles it.
 *
 * Content comes from {@link formatStaveInputs} — the single catalogue that also
 * feeds the hover provider, so the block can't drift from what's injected.
 */

import React, { useEffect, useState } from 'react'
import { formatStaveInputs } from '../../visualizers/injectedGlobals'
import type { VizRendererKind } from '../vizLanguages'
import { vizSignalProbe } from '../vizSignalProbe'

const KIND_LABEL: Record<VizRendererKind, string> = {
  p5: 'p5',
  hydra: 'hydra',
  glsl: 'glsl',
}

export function StaveInputsPanel({ kind }: { kind: VizRendererKind }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const block = formatStaveInputs(kind)

  // Keep the global master signal probe alive while any viz editor is mounted,
  // so the hover provider has live master values to read (#309). Ref-counted —
  // the rAF/subscription stops when the last viz tab closes.
  useEffect(() => vizSignalProbe.acquire(), [])

  return (
    <div
      data-workspace-chrome="viz-inputs"
      style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
      }}
    >
      <button
        data-testid="viz-inputs-toggle"
        data-open={open ? 'on' : 'off'}
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Hide injected globals' : 'Show the Stave globals injected into this viz'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          height: 26,
          padding: '0 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--foreground-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          textAlign: 'left',
        }}
      >
        <span style={{ width: 9, display: 'inline-block' }}>{open ? '▾' : '▸'}</span>
        <span style={{ color: 'var(--accent-strong, var(--accent))' }}>{'⚡'}</span>
        <span>Stave Inputs</span>
        <span style={{ opacity: 0.6 }}>· {KIND_LABEL[kind]} injected globals</span>
        {!open && (
          <span style={{ marginLeft: 'auto', opacity: 0.5 }}>hover a token in your code for live values</span>
        )}
      </button>

      {open && (
        <pre
          data-testid="viz-inputs-block"
          style={{
            margin: 0,
            padding: '4px 14px 10px 30px',
            maxHeight: 320,
            overflow: 'auto',
            color: 'var(--foreground-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'pre',
            userSelect: 'text',
          }}
        >
          {block}
        </pre>
      )}
    </div>
  )
}
