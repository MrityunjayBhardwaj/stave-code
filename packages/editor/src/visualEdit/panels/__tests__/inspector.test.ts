import { describe, it, expect } from 'vitest'

import type { PianoRollModel, StepGridModel } from '../../notation/model'
import {
  gainToVelocity,
  velocityToGain,
  resolveRollFields,
  resolveStepFields,
  setGroupGain,
  setColumnGain,
  setRollPitch,
  setRollStart,
  setRollDuration,
  rollPitchToken,
} from '../inspector'

describe('gain ↔ velocity (#432 / #427 Q1)', () => {
  it('maps .gain 0…1 to 0–127 and back', () => {
    expect(gainToVelocity(1)).toBe(127)
    expect(gainToVelocity(0)).toBe(0)
    expect(gainToVelocity(0.5)).toBe(64) // round(0.5*127)=64
    expect(velocityToGain(127)).toBe(1)
    expect(velocityToGain(0)).toBe(0)
    expect(velocityToGain(64)).toBeCloseTo(64 / 127)
  })
  it('clamps gain>1 to 127 for display (storage may exceed 1)', () => {
    expect(gainToVelocity(1.5)).toBe(127)
  })
})

const roll: PianoRollModel = {
  steps: 4,
  notes: [
    { pitch: 'c4', start: 0, duration: 2, gain: 0.5 },
    { pitch: 'e4', start: 0, duration: 2 }, // chord member, shares start, no gain (1)
    { pitch: 'g4', start: 2, duration: 1 },
  ],
}

describe('resolveRollFields', () => {
  it('resolves pitch/midi/velocity/position/length for a selected note', () => {
    const f = resolveRollFields(roll, { pitch: 'c4', start: 0 })!
    expect(f).toMatchObject({ kind: 'roll', pitch: 'c4', position: 0, length: 2 })
    expect(f.midi).toBe(60)
    expect(f.velocity).toBe(gainToVelocity(0.5))
  })
  it('returns neutral velocity (127) for a note with no gain', () => {
    expect(resolveRollFields(roll, { pitch: 'g4', start: 2 })!.velocity).toBe(127)
  })
  it('returns null when the selected note no longer exists', () => {
    expect(resolveRollFields(roll, { pitch: 'c4', start: 3 })).toBeNull()
  })
})

describe('setGroupGain (shared velocity path)', () => {
  it('sets gain on every chord member sharing the start', () => {
    const next = setGroupGain(roll, 0, 0.8)
    expect(next.notes.filter((n) => n.start === 0).every((n) => n.gain === 0.8)).toBe(true)
    expect(next.notes.find((n) => n.start === 2)!.gain).toBeUndefined() // untouched
  })
})

describe('setRollPitch', () => {
  it('repitches the selected note, keeping start/duration', () => {
    const next = setRollPitch(roll, { pitch: 'c4', start: 0 }, 62) // d4
    const moved = next.notes.find((n) => n.start === 0 && n.pitch === 'd4')!
    expect(moved.duration).toBe(2)
    expect(next.notes.some((n) => n.pitch === 'c4')).toBe(false)
  })
  it('emits a numeric token for numeric patterns', () => {
    const numeric: PianoRollModel = { steps: 2, numeric: true, notes: [{ pitch: '60', start: 0, duration: 1 }] }
    expect(rollPitchToken(numeric, 62)).toBe('62')
    const next = setRollPitch(numeric, { pitch: '60', start: 0 }, 62)
    expect(next.notes[0].pitch).toBe('62')
  })
  it('is a no-op when a note already sits at the target (token, start) — no dup', () => {
    const next = setRollPitch(roll, { pitch: 'c4', start: 0 }, 64) // e4 already at start 0
    expect(next).toBe(roll)
  })
})

describe('setRollStart (position)', () => {
  it('moves the selected note to a new start', () => {
    const next = setRollStart(roll, { pitch: 'g4', start: 2 }, 3)
    expect(next.notes.find((n) => n.pitch === 'g4')!.start).toBe(3)
  })
  it('clamps to the grid and caps duration', () => {
    const next = setRollStart(roll, { pitch: 'g4', start: 2 }, 99)
    const g = next.notes.find((n) => n.pitch === 'g4')!
    expect(g.start).toBe(3) // steps-1
    expect(g.duration).toBe(1)
  })
})

describe('setRollDuration', () => {
  it('resizes the group, capping at the next note', () => {
    const next = setRollDuration(roll, 0, 10) // next group at 2 → cap to 2
    expect(next.notes.find((n) => n.pitch === 'c4')!.duration).toBe(2)
  })
})

const step: StepGridModel = {
  steps: 4,
  lanes: [
    { sound: 'bd', cells: [true, false, true, false] },
    { sound: 'sd', cells: [false, false, true, false] },
  ],
  gains: [0.5, 1, 1, 1],
}

describe('resolveStepFields + setColumnGain', () => {
  it('resolves sound/velocity/position for an ON cell', () => {
    const f = resolveStepFields(step, { lane: 0, step: 0 })!
    expect(f).toMatchObject({ kind: 'step', sound: 'bd', position: 0 })
    expect(f.velocity).toBe(gainToVelocity(0.5))
  })
  it('returns null for an OFF cell', () => {
    expect(resolveStepFields(step, { lane: 0, step: 1 })).toBeNull()
  })
  it('setColumnGain writes the column gain (default-fills neutral)', () => {
    const next = setColumnGain({ ...step, gains: undefined }, 2, 0.3)
    expect(next.gains).toEqual([1, 1, 0.3, 1])
  })
})
