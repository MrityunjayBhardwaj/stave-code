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
 * Resize the single note identified by (`start`, `pitch`) to `duration` steps.
 * The new duration floors at 1 and caps only at the grid end. A note may now
 * sustain UNDER a later onset (overlap is expressible via parallel comma-lanes,
 * #628), so each note resizes independently — stretching one chord member no
 * longer drags the others. The serializer packs any resulting overlap into lanes.
 */
export function resizeNote(
  model: PianoRollModel,
  start: number,
  pitch: string,
  duration: number,
): PianoRollModel {
  // Multi-bar `<...>` can't express overlap or a mixed-duration chord (parallel
  // lanes are single-bar only), so keep the legacy whole-chord resize capped at
  // the next onset there — otherwise the write would serialize to null and drop.
  if ((model.bars ?? 1) > 1) {
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
  const capped = Math.max(1, Math.min(duration, model.steps - start))
  return {
    ...model,
    notes: model.notes.map((n) =>
      n.start === start && n.pitch === pitch ? { ...n, duration: capped } : n,
    ),
  }
}
