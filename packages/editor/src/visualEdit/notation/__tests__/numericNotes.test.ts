import { describe, it, expect } from 'vitest'
import { parseStepGrid, parsePianoRoll } from '../parse'
import { serializePianoRoll } from '../serialize'
import { placeNote } from '../place'
import { pitchToMidi } from '../pitch'

/**
 * #469 — bare-numeric note/degree patterns in the Piano Roll.
 *
 * GROUNDED against real `@strudel` haps: `note("60 62 64")` → MIDI numbers,
 * `n("0 1 2")` → degree/index numbers, negatives carry through. The number IS
 * the row; the verbatim token is what serializes back, so new/dragged notes in
 * a numeric pattern must emit numbers (the model's `numeric` flag), not `c4`.
 *
 * Discriminating: pre-fix, `tokenize` rejected every numeric token with
 * `unsupported token "<n>"`, so all `.ok === true` below would fail.
 */
describe('#469 — numeric note/degree patterns', () => {
  it('parses MIDI-number `note` values and round-trips verbatim', () => {
    const r = parsePianoRoll('60 62 64')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.numeric).toBe(true)
    expect(r.model.notes.map((n) => n.pitch)).toEqual(['60', '62', '64'])
    expect(r.model.notes.map((n) => pitchToMidi(n.pitch))).toEqual([60, 62, 64])
    expect(serializePianoRoll(r.model)).toBe('60 62 64')
  })

  it('parses `n` degree/index values and round-trips', () => {
    const r = parsePianoRoll('0 1 2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.numeric).toBe(true)
    expect(serializePianoRoll(r.model)).toBe('0 1 2')
  })

  it('handles negative values', () => {
    const r = parsePianoRoll('-7 -5 0')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.notes.map((n) => pitchToMidi(n.pitch))).toEqual([-7, -5, 0])
    expect(serializePianoRoll(r.model)).toBe('-7 -5 0')
  })

  it('composes with `-` rests (#468) and `@n` elongation', () => {
    const rest = parsePianoRoll('60 - 62')
    expect(rest.ok).toBe(true)
    if (rest.ok) expect(serializePianoRoll(rest.model)).toBe('60 ~ 62')
    const held = parsePianoRoll('60@2 62')
    expect(held.ok).toBe(true)
    if (held.ok) expect(serializePianoRoll(held.model)).toBe('60@2 62')
  })

  it('handles numeric chords', () => {
    const r = parsePianoRoll('[60,64] 62')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const atStart = r.model.notes.filter((n) => n.start === 0).map((n) => n.pitch)
    expect(atStart.sort()).toEqual(['60', '64'])
    expect(serializePianoRoll(r.model)).toBe('[60,64] 62')
  })

  it('a new note placed in a numeric pattern serializes as a number, not a note name', () => {
    // mirrors what the grid does: a numeric model → place a numeric token
    // (the grid's `tokenForRow` emits `String(midi)` when `model.numeric`).
    const r = parsePianoRoll('60 62 ~')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const placed = placeNote(r.model, '64', 2, 1)
    expect(serializePianoRoll(placed)).toBe('60 62 64')
  })

  it('DISCRIMINATOR: mixing numbers and note names is rejected', () => {
    const r = parsePianoRoll('c3 60')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/mixed/)
  })

  it('note-name patterns are unaffected (numeric flag stays off)', () => {
    const r = parsePianoRoll('c3 e3 g3')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.model.numeric).toBeFalsy()
  })

  it('the step grid still rejects numeric tokens (numeric `s` is not a sound)', () => {
    expect(parseStepGrid('60 62').ok).toBe(false)
  })

  it('pitchToMidi reads bare integers and still reads note names', () => {
    expect(pitchToMidi('60')).toBe(60)
    expect(pitchToMidi('0')).toBe(0)
    expect(pitchToMidi('-7')).toBe(-7)
    expect(pitchToMidi('c3')).toBe(48) // engine convention c3 = 48
    expect(pitchToMidi('xyz')).toBeNull()
  })
})
