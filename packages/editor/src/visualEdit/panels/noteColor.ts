/**
 * noteColor.ts — Logic-parity "View ▸ Note Color" for both grids (#428).
 *
 * Logic colours notes by velocity (warm = loud, cool = soft) via
 * View ▸ Set Note Color ▸ By Velocity. Here the per-note velocity IS the
 * `.gain` lane (GROUNDED in spike #427: `gain` is the established per-note
 * control; `.velocity` only multiplies it at audio time — the ramp keys on
 * `gain` clamped to [0,1], doc artifacts/stave/GROUNDING-LOGIC-PARITY-427.md Q1).
 *
 * Modes (v1): `off` keeps each grid's native colour (Sequencer = per-voice
 * colour #471, Piano Roll = accent); `velocity` recolours every note/cell by its
 * gain. "By Track" is a Phase-2 follow — it needs the app-side track palette
 * (`musicalTimeline/colors.ts`) which this editor package can't import, and the
 * single-chunk grid makes it degenerate.
 *
 * The mode is a global UI setting shared by both grids (they mount XOR but the
 * setting persists across the switch). Backed by a tiny external store +
 * SSR-safe localStorage, mirroring `bottomPanel/persistence.ts`.
 */
import * as React from 'react'

export type NoteColorMode = 'off' | 'velocity'

export const NOTE_COLOR_MODE_KEY = 'stave:visualEdit.noteColorMode'
const DEFAULT_MODE: NoteColorMode = 'off'

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/**
 * Velocity → colour. Warm (loud) ⇄ cool (soft), matching Logic's By Velocity.
 * Hue sweeps cool 210° (soft) → warm 12° (loud) linearly with gain, so relative
 * differences are preserved when a group is recoloured. Saturation/lightness are
 * held constant for legible cells on the dark grid. Gain is clamped to [0,1]
 * (a `.gain(1.5)` reads as full-warm, not past it).
 */
export function velocityColor(gain: number): string {
  const g = clamp01(gain)
  const hue = 210 - g * 198 // 210° (cool) → 12° (warm)
  return `hsl(${Math.round(hue)}, 72%, 56%)`
}

// ── tiny external store so both grids reflect a mode change immediately ──

function readStored(): NoteColorMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  try {
    const v = window.localStorage.getItem(NOTE_COLOR_MODE_KEY)
    return v === 'velocity' || v === 'off' ? v : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

let current: NoteColorMode = readStored()
const listeners = new Set<() => void>()

function setMode(mode: NoteColorMode): void {
  if (mode === current) return
  current = mode
  try {
    window.localStorage.setItem(NOTE_COLOR_MODE_KEY, mode)
  } catch {
    /* Safari private mode — keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The shared note-colour mode + a setter. Both grids call this; a change in one
 * re-renders the other (and persists) via the external store.
 */
export function useNoteColorMode(): [NoteColorMode, (mode: NoteColorMode) => void] {
  const mode = React.useSyncExternalStore(subscribe, () => current, () => DEFAULT_MODE)
  return [mode, setMode]
}

// ── editor↔app seam (#602) ─────────────────────────────────────────────────
// The note-colour toggle moved from the grid headers into the app's Editor
// Settings modal. The modal lives in a DIFFERENT package but the SAME document,
// so a `storage` event won't fire (those only cross documents) — instead the app
// calls `setNoteColorMode`, which notifies this in-process listener set, so the
// live Pattern grids (`useNoteColorMode`) recolour immediately. Single shared
// store, two surfaces; no duplicate state.

/** Current note-colour mode — for the Settings modal to seed its control on open. */
export function getNoteColorMode(): NoteColorMode {
  return current
}

/** Set the mode from outside the grids (the Settings modal). Persists + notifies
 *  every `useNoteColorMode` subscriber → the live grids recolour same-document. */
export function setNoteColorMode(mode: NoteColorMode): void {
  setMode(mode)
}

/** Subscribe to mode changes so the Settings modal reflects an external change
 *  while it's open. Returns an unsubscribe. */
export function subscribeNoteColorMode(listener: () => void): () => void {
  return subscribe(listener)
}
