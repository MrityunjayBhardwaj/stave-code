/**
 * NoteColorToggle — the "View ▸ Note Color" control shared by both grids (#428).
 *
 * A compact segmented toggle (Off / Velocity) that drives the global note-colour
 * mode (`useNoteColorMode`). Rendered at the top of the Sequencer and Piano Roll;
 * the grids mount XOR but the mode persists across the switch, so flipping it in
 * one is reflected when the other opens.
 */
import * as React from 'react'

import { useNoteColorMode, type NoteColorMode } from './noteColor'

const SEGMENTS: ReadonlyArray<{ mode: NoteColorMode; label: string }> = [
  { mode: 'off', label: 'Off' },
  { mode: 'velocity', label: 'Velocity' },
]

export function NoteColorToggle(): React.ReactElement {
  const [mode, setMode] = useNoteColorMode()
  return (
    <div
      data-note-color-toggle
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
    >
      <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>Note Color</span>
      <div
        role="group"
        aria-label="note color mode"
        style={{
          display: 'inline-flex',
          border: '1px solid var(--border, #3a3a42)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {SEGMENTS.map(({ mode: m, label }) => {
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              data-note-color-mode={m}
              onClick={() => setMode(m)}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                border: 'none',
                borderRight: m === 'off' ? '1px solid var(--border, #3a3a42)' : 'none',
                background: active ? 'var(--accent, #6ea8fe)' : 'transparent',
                color: active ? '#fff' : 'var(--foreground-muted, #a0a0aa)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
