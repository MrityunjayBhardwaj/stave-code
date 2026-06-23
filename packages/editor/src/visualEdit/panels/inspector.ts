/**
 * inspector — pure selection model + field resolution/edit transforms for the
 * Mixer-as-inspector (#432).
 *
 * A "selected note" is the event the inspector shows. It's a lightweight key
 * (not a reference), so it survives the model reseeds that every write triggers:
 *   - roll: a note is keyed by its `pitch` token + `start` column (chord members
 *     share `start` but differ in pitch);
 *   - step: a hit is keyed by `lane` index + `step` column.
 * Selection lives in `PatternPanel`; the grid sets it (click/edit) and the Mixer
 * reads it to resolve the event's fields and edit them.
 *
 * VELOCITY = `.gain` (grounded #427 Q1: Logic's 0–127 velocity maps to Stave's
 * per-note `.gain`, NOT `.velocity`). `setGroupGain`/`setColumnGain` live HERE so
 * the grid drag and the inspector field write the SAME `.gain` transform — one
 * path, no dual-representation drift (PV129).
 */
import type { PianoRollModel, StepGridModel } from '../notation/model'
import { pitchToMidi, midiToPitch } from '../notation/pitch'
import { resizeNote } from '../notation/place'

/** The event the inspector is bound to, keyed by stable musical identity. */
export type SelectedNote =
  | { kind: 'roll'; pitch: string; start: number }
  | { kind: 'step'; lane: number; step: number }

export const VELOCITY_MAX = 127

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** `.gain` 0…1 → Logic-style 0–127 (display only; storage stays 0…1). */
export function gainToVelocity(gain: number): number {
  return Math.round(clamp01(gain) * VELOCITY_MAX)
}

/** 0–127 → `.gain` 0…1. */
export function velocityToGain(velocity: number): number {
  const v = Math.max(0, Math.min(VELOCITY_MAX, Math.round(velocity)))
  return v / VELOCITY_MAX
}

// ── field resolution (model + selection → displayable event) ────────────────

export interface RollFields {
  kind: 'roll'
  /** the note token as written (`c4`, `60`) */
  pitch: string
  /** MIDI number (null if the token doesn't resolve) */
  midi: number | null
  /** 0–127 (from `.gain`) */
  velocity: number
  /** start column */
  position: number
  /** length in columns */
  length: number
}

export interface StepFields {
  kind: 'step'
  /** the lane's sound token incl. any `:variant` (read-only — it's the Kit/voice) */
  sound: string
  velocity: number
  position: number
}

export type InspectorFields = RollFields | StepFields

/** the gain shared by the note group starting at `start` (chord members share) */
export function gainAtStart(model: PianoRollModel, start: number): number {
  return model.notes.find((n) => n.start === start)?.gain ?? 1
}

/** Resolve the selected roll note's fields, or null if it no longer exists. */
export function resolveRollFields(
  model: PianoRollModel,
  sel: { pitch: string; start: number },
): RollFields | null {
  const note = model.notes.find((n) => n.pitch === sel.pitch && n.start === sel.start)
  if (!note) return null
  return {
    kind: 'roll',
    pitch: note.pitch,
    midi: pitchToMidi(note.pitch),
    velocity: gainToVelocity(note.gain ?? 1),
    position: note.start,
    length: note.duration,
  }
}

/** Resolve the selected step hit's fields, or null if the cell is off/gone. */
export function resolveStepFields(
  model: StepGridModel,
  sel: { lane: number; step: number },
): StepFields | null {
  const lane = model.lanes[sel.lane]
  if (!lane || sel.step >= lane.cells.length || !lane.cells[sel.step]) return null
  return {
    kind: 'step',
    sound: lane.sound,
    velocity: gainToVelocity(model.gains?.[sel.step] ?? 1),
    position: sel.step,
  }
}

// ── velocity transforms (SHARED by grid drag + inspector — one `.gain` path) ──

/** set the gain on every note of the group at `start` (chord shares one gain) */
export function setGroupGain(model: PianoRollModel, start: number, gain: number): PianoRollModel {
  return {
    ...model,
    notes: model.notes.map((n) => (n.start === start ? { ...n, gain } : n)),
  }
}

/** set one column's velocity (gains default to a neutral 1-filled array) */
export function setColumnGain(model: StepGridModel, stepIndex: number, gain: number): StepGridModel {
  const gains = model.gains ? [...model.gains] : Array<number>(model.steps).fill(1)
  if (gains[stepIndex] === gain) return model
  gains[stepIndex] = gain
  return { ...model, gains }
}

// ── roll field edits (pitch / position / length) ────────────────────────────

/**
 * Repitch the selected note to `newMidi`. Emits a numeric or named token per the
 * pattern's convention (#469). No-op if a note already sits at the target
 * (token, start) — we never create a duplicate. Returns the model unchanged plus
 * the new pitch token via {@link rollPitchToken} for the caller to re-key the
 * selection.
 */
export function rollPitchToken(model: PianoRollModel, midi: number): string {
  return model.numeric ? String(midi) : midiToPitch(midi)
}

export function setRollPitch(
  model: PianoRollModel,
  sel: { pitch: string; start: number },
  newMidi: number,
): PianoRollModel {
  const token = rollPitchToken(model, newMidi)
  if (token === sel.pitch) return model
  if (model.notes.some((n) => n.start === sel.start && n.pitch === token)) return model // no dup
  return {
    ...model,
    notes: model.notes.map((n) =>
      n.pitch === sel.pitch && n.start === sel.start ? { ...n, pitch: token } : n,
    ),
  }
}

/** Move the selected note to `newStart` (clamped to the grid; duration capped). */
export function setRollStart(
  model: PianoRollModel,
  sel: { pitch: string; start: number },
  newStart: number,
): PianoRollModel {
  const note = model.notes.find((n) => n.pitch === sel.pitch && n.start === sel.start)
  if (!note) return model
  const clamped = Math.max(0, Math.min(newStart, model.steps - 1))
  if (clamped === note.start) return model
  const base = model.notes.filter((n) => n !== note)
  const dur = Math.max(1, Math.min(note.duration, model.steps - clamped))
  return { ...model, notes: [...base, { ...note, start: clamped, duration: dur }] }
}

/**
 * Resize the selected note's group to `newDuration` columns (floors at 1, caps
 * at the next group / grid end). Chord members at `start` resize together
 * (subset requires a shared duration).
 */
export function setRollDuration(
  model: PianoRollModel,
  start: number,
  newDuration: number,
): PianoRollModel {
  // resizeNote already floors at 1, caps at the next group, and resizes the
  // whole chord at `start` — the same transform the grid's resize-drag uses.
  return resizeNote(model, start, newDuration)
}
