/**
 * clipboard — copy/paste of Pattern-grid notes (#528).
 *
 * A tiny session-level clipboard (module singleton, so a copy survives a grid
 * remount / pattern switch, like a real clipboard). Holds the copied note's
 * SHAPE — pitch token, duration, gain — captured on ⌘/Ctrl-C.
 *
 * Paste lands at the CURRENTLY-SELECTED cell (⌘/Ctrl-click chooses the target
 * position): the clip's duration + velocity are stamped at the selected
 * pitch + step, replacing any note already there. So the flow is
 * ⌘-click a note → ⌘C → ⌘-click a target cell → ⌘V.
 */

export interface NoteClip {
  /** the copied note's pitch token (`c3`, `60`) — kept for reference */
  pitch: string
  duration: number
  /** 0…1 (may exceed 1); copied so paste preserves velocity */
  gain: number
}

let clip: NoteClip | null = null

export function setNoteClip(c: NoteClip | null): void {
  clip = c
}

export function getNoteClip(): NoteClip | null {
  return clip
}
