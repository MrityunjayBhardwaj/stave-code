/**
 * VisualEditStandby — the empty state every write-back panel shows when there
 * is nothing editable to bind to (no pattern under the cursor, or the pattern
 * is outside the panel's editable subset).
 *
 * This is a first-class state, not a placeholder: the design's conservatism
 * rule (§4, §6) says a panel that can't safely round-trip a pattern stays in
 * standby rather than guess. The scaffold seeds all three tabs with it; each
 * panel swaps in its live UI when a compatible chunk is in focus, and falls
 * back here otherwise.
 *
 * Vocabulary discipline (PV32 / D-06): musician-facing copy only, no IR jargon.
 */
import * as React from 'react'

export interface VisualEditStandbyProps {
  /** the panel id, used for a stable test hook */
  panel: string
  /** one-line musician-facing hint, e.g. "Click a pattern to edit its knobs." */
  hint: string
  /** optional codicon name (without the `codicon-` prefix) for the glyph */
  icon?: string
}

export function VisualEditStandby({
  panel,
  hint,
  icon,
}: VisualEditStandbyProps): React.ReactElement {
  return React.createElement(
    'div',
    {
      'data-bottom-panel-tab': `${panel}-standby`,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: '100%',
        minHeight: 96,
        padding: 24,
        textAlign: 'center',
        color: 'var(--foreground-muted, #a0a0aa)',
        fontSize: 12,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      },
    },
    icon
      ? React.createElement('span', {
          className: `codicon codicon-${icon}`,
          'aria-hidden': true,
          style: { fontSize: 22, opacity: 0.6 },
        })
      : null,
    React.createElement('span', null, hint),
  )
}
