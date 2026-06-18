import { describe, it, expect } from 'vitest'
import { parseStepGrid, parsePianoRoll } from '../parse'
import { serializeStepGrid, serializePianoRoll } from '../serialize'

/**
 * #468 — a bare `-` is a rest, identical to `~`.
 *
 * GROUNDED against real `@strudel` haps: `s("bd - bd -")` and `s("bd ~ bd ~")`
 * produce byte-identical events (the `-` slots are silent). The tie/sustain
 * token is `_` (a separate concern). A `-` glued to a digit (`-7`) is a
 * negative melodic value, NOT a rest — left for the note path (#469).
 *
 * Each `it` is discriminating: pre-fix, `tokenize`/`parseGroup` rejected `-`
 * with `unsupported token "-"`, so every `.ok === true` below would fail.
 */
describe('#468 — bare `-` rest', () => {
  it('step grid: `bd - bd -` parses identically to `bd ~ bd ~`', () => {
    const dash = parseStepGrid('bd - bd -')
    const tilde = parseStepGrid('bd ~ bd ~')
    expect(dash.ok).toBe(true)
    expect(tilde.ok).toBe(true)
    if (dash.ok && tilde.ok) expect(dash.model).toEqual(tilde.model)
  })

  it('step grid: a `-` occupies its own silent slot', () => {
    const r = parseStepGrid('bd - bd')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(3)
    expect(r.model.lanes).toEqual([{ sound: 'bd', cells: [true, false, true] }])
  })

  it('piano roll: `c3 - e3 -` parses identically to `c3 ~ e3 ~`', () => {
    const dash = parsePianoRoll('c3 - e3 -')
    const tilde = parsePianoRoll('c3 ~ e3 ~')
    expect(dash.ok).toBe(true)
    expect(tilde.ok).toBe(true)
    if (dash.ok && tilde.ok) expect(dash.model).toEqual(tilde.model)
  })

  it('nested group: `bd [hh -]` treats the `-` as a rest in the sub-sequence', () => {
    const dash = parseStepGrid('bd [hh -]')
    const tilde = parseStepGrid('bd [hh ~]')
    expect(dash.ok).toBe(true)
    if (dash.ok && tilde.ok) expect(dash.model).toEqual(tilde.model)
  })

  it('a trailing `-` is a rest', () => {
    const r = parseStepGrid('bd -')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.model.lanes[0].cells).toEqual([true, false])
  })

  it('serializes a `-` rest back as the canonical `~` (write-back normalizes)', () => {
    const r = parseStepGrid('bd - bd')
    expect(r.ok).toBe(true)
    if (r.ok) expect(serializeStepGrid(r.model)).toBe('bd ~ bd')
    const roll = parsePianoRoll('c3 - e3')
    expect(roll.ok).toBe(true)
    if (roll.ok) expect(serializePianoRoll(roll.model)).toBe('c3 ~ e3')
  })

  it('DISCRIMINATOR: `-7` is NOT a rest — a `-` glued to a digit is left unsupported (→ #469)', () => {
    // The bare-rest rule must require a standalone `-`; `-7` must fall through
    // to the atom/note path (which rejects it today), not parse as rest + `7`.
    const step = parseStepGrid('bd -7')
    expect(step.ok).toBe(false)
    const roll = parsePianoRoll('c3 -7')
    expect(roll.ok).toBe(false)
  })
})
