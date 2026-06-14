/**
 * Insert a note into a roll, resolving overlaps so the result stays a flat,
 * tileable sequence (what the serializer requires). DAW-style resolution:
 *  - a group already at `start` → the note joins the chord, adopting its
 *    duration (chord members share one);
 *  - an earlier note sustaining across `start` → it trims to end at `start`;
 *  - the next group (or the grid end) caps the new note's duration.
 */
import type { PianoRollModel } from './model'

export function placeNote(
  model: PianoRollModel,
  pitch: string,
  start: number,
  duration: number,
): PianoRollModel {
  const groupAt = model.notes.find((n) => n.start === start)
  if (groupAt) {
    return { ...model, notes: [...model.notes, { pitch, start, duration: groupAt.duration }] }
  }
  const nextStart = Math.min(
    ...model.notes.filter((n) => n.start > start).map((n) => n.start),
    model.steps,
  )
  const notes = model.notes.map((n) =>
    n.start < start && n.start + n.duration > start ? { ...n, duration: start - n.start } : n,
  )
  notes.push({ pitch, start, duration: Math.max(1, Math.min(duration, nextStart - start)) })
  return { ...model, notes }
}
