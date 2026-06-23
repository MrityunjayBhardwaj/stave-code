/**
 * ToolPalette — the Logic-style tool strip above the Pattern grids (#433).
 *
 * A slim toolbar pinned over the top-left of the active grid (Sequencer / Piano
 * Roll) — an OVERLAY, not an in-flow row: a header that takes vertical space
 * shifts the grid down and silently breaks its move/resize drags (PV143). The
 * selected tool drives the grids' edit mode (see `tool.ts`). The tool state is
 * owned by `PatternPanel` and persists across the grid switch, so the choice
 * carries between a drum pattern and a melody. Phase-2 tools render disabled
 * (greyed + a "coming in Phase 2" tooltip) rather than silently inert.
 */
import * as React from 'react'

import { type Tool, TOOLS } from './tool'

export interface ToolPaletteProps {
  tool: Tool
  onTool: (t: Tool) => void
}

export function ToolPalette({ tool, onTool }: ToolPaletteProps): React.ReactElement {
  return (
    <div
      data-tool-palette
      role="toolbar"
      aria-label="grid tools"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '3px 4px',
        borderRadius: 6,
        border: '1px solid var(--border, #3a3a42)',
        background: 'var(--background-elevated, #26262c)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
      }}
    >
      {TOOLS.map((t) => {
        const active = tool === t.value
        return (
          <button
            key={t.value}
            type="button"
            data-tool={t.value}
            data-tool-active={active || undefined}
            aria-pressed={active}
            aria-label={t.label}
            title={t.enabled ? t.label : `${t.label} — coming in Phase 2`}
            disabled={!t.enabled}
            onClick={() => t.enabled && onTool(t.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 24,
              borderRadius: 4,
              border: '1px solid transparent',
              background: active ? 'var(--accent, #6ea8fe)' : 'transparent',
              color: !t.enabled
                ? 'var(--foreground-muted, #5a5a62)'
                : active
                  ? '#fff'
                  : 'var(--foreground-muted, #a0a0aa)',
              cursor: t.enabled ? 'pointer' : 'default',
            }}
          >
            <i className={`codicon codicon-${t.icon}`} aria-hidden="true" style={{ fontSize: 14 }} />
          </button>
        )
      })}
    </div>
  )
}
