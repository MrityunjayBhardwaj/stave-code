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

/**
 * Resize the note group starting at `start` to `duration` steps. The new
 * duration floors at 1 and caps at the next group's start (or the grid end),
 * so a resize can never overlap the following note — the result is always a
 * tileable sequence the serializer accepts. All notes sharing `start` (a chord)
 * resize together, since the subset requires chord members to share a duration.
 */
export function resizeNote(
  model: PianoRollModel,
  start: number,
  duration: number,
): PianoRollModel {
  const nextStart = Math.min(
    ...model.notes.filter((n) => n.start > start).map((n) => n.start),
    model.steps,
  )
  const capped = Math.max(1, Math.min(duration, nextStart - start))
  return {
    ...model,
    notes: model.notes.map((n) => (n.start === start ? { ...n, duration: capped } : n)),
  }
}
