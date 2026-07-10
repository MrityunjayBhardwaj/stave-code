import { describe, it, expect } from 'vitest'
import { detectAllChunks } from '../../chunkDetect'
import { knobsFromChunk } from '../MixerBody'

/**
 * A known Strudel control is UNARY (controls.mjs:50 — the chainable prototype
 * method reads only its first argument), so `.room(0.25, 0, 100)` plays exactly
 * like `.room(0.25)` and must surface ONE dial, not three phantom ones (#842).
 * Genuinely multi-arg functions (euclid, …) aren't controls and keep one knob
 * per numeric argument.
 */
function knobsFor(doc: string) {
  const chunk = detectAllChunks(doc)[0]
  return knobsFromChunk(chunk)
}

describe('knobsFromChunk — one dial per known control (#842)', () => {
  it('single-arg control → one knob', () => {
    const knobs = knobsFor('$: s("bd*4").room(0.25)')
    expect(knobs.map((k) => ({ method: k.method, value: k.value }))).toEqual([
      { method: 'room', value: 0.25 },
    ])
    expect(knobs[0].label).toBe('room')
  })

  it('extra positional args on a control do NOT spawn phantom dials', () => {
    // The bug: `.room(0.25, 0, 100)` rendered three dials (room 1/2/3). Strudel
    // ignores the `0` and `100`, so the Mixer must too.
    const knobs = knobsFor('$: s("bd*4").room(0.25, 0, 100)')
    expect(knobs).toHaveLength(1)
    expect(knobs[0]).toMatchObject({ method: 'room', argIndex: 0, value: 0.25 })
    expect(knobs[0].label).toBe('room')
  })

  it('every extra dial edited the FIRST arg anyway — a dead-literal projection', () => {
    // Regression guard against re-introducing per-arg flattening for controls:
    // any knob a control exposes must point at argIndex 0 (the only one Strudel reads).
    const knobs = knobsFor('$: note("c e g").lpf(800, 5, 1)')
    expect(knobs).toHaveLength(1)
    expect(knobs[0].method).toBe('lpf')
    expect(knobs[0].argIndex).toBe(0)
  })

  it('a genuinely multi-arg function (euclid) keeps one knob per numeric arg', () => {
    const knobs = knobsFor('$: s("bd").euclid(3, 8)')
    expect(knobs).toHaveLength(2)
    expect(knobs.map((k) => k.value)).toEqual([3, 8])
    expect(knobs.map((k) => k.label)).toEqual(['euclid 1', 'euclid 2'])
  })

  it('pan and gain are still owned by the strip, not the drawer', () => {
    const knobs = knobsFor('$: s("bd").pan(0.3).gain(0.8).room(0.4)')
    expect(knobs.map((k) => k.method)).toEqual(['room'])
  })
})
