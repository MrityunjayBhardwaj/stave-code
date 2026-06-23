/**
 * clipboard — copy/paste of Pattern-grid notes (#528).
 *
 * A tiny session-level clipboard (module singleton, so a copy survives a grid
 * remount / pattern switch, like a real clipboard). Holds one note's musical
 * data — pitch token, start column, duration, gain — captured on ⌘/Ctrl-C and
 * re-placed on ⌘/Ctrl-V.
 *
 * Paste lands the note RIGHT AFTER itself (`start + duration`) and advances the
 * clip to that spot, so repeated paste tiles the note forward one length at a
 * time. Pure placement helpers live here so the offset logic is unit-testable;
 * the grid does the actual `placeNote` + gain write-back.
 */

export interface NoteClip {
  /** the pitch token as written (`c3`, `60`) */
  pitch: string
  start: number
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

/** the start column a paste of `clip` lands on — right after the clip. */
export function pasteTarget(c: NoteClip): number {
  return c.start + c.duration
}

/** the clip advanced to its paste position, so the next paste tiles forward. */
export function advanceClip(c: NoteClip): NoteClip {
  return { ...c, start: pasteTarget(c) }
}
