import { describe, it, expect } from 'vitest'
import { normalizeStrudelHap } from '../NormalizedHap'

describe('normalizeStrudelHap', () => {
  it('extracts all fields from a full Strudel hap with Fraction-like objects', () => {
    const hap = {
      whole: { begin: { valueOf: () => 0.5 }, end: { valueOf: () => 1.0 } },
      endClipped: { valueOf: () => 0.75 },
      value: { note: 'c4', freq: 261.63, s: 'piano', gain: 0.8, velocity: 0.9, color: '#ff0000' },
    }
    const n = normalizeStrudelHap(hap)
    expect(n.begin).toBe(0.5)
    expect(n.end).toBe(1.0)
    expect(n.endClipped).toBe(0.75)
    expect(n.note).toBe('c4')
    expect(n.freq).toBe(261.63)
    expect(n.s).toBe('piano')
    expect(n.gain).toBe(0.8)
    expect(n.velocity).toBe(0.9)
    expect(n.color).toBe('#ff0000')
  })

  it('falls back to defaults for a minimal hap', () => {
    const hap = { value: { s: 'bd' } }
    const n = normalizeStrudelHap(hap)
    expect(n.begin).toBe(0)
    expect(n.end).toBe(0.25)
    expect(n.endClipped).toBe(0.25)
    expect(n.note).toBeNull()
    expect(n.freq).toBeNull()
    expect(n.s).toBe('bd')
    expect(n.gain).toBe(1)
    expect(n.velocity).toBe(1)
    expect(n.color).toBeNull()
  })

  it('uses hap.value.n when note is absent', () => {
    const hap = {
      whole: { begin: 0, end: 1 },
      value: { n: 60 },
    }
    const n = normalizeStrudelHap(hap)
    expect(n.note).toBe(60)
  })

  it('handles plain number begin/end (no Fraction)', () => {
    const hap = {
      whole: { begin: 2, end: 3 },
      endClipped: 2.5,
      value: { note: 'a4' },
    }
    const n = normalizeStrudelHap(hap)
    expect(n.begin).toBe(2)
    expect(n.end).toBe(3)
    expect(n.endClipped).toBe(2.5)
  })

  it('handles null/undefined value', () => {
    const hap = { whole: { begin: 0, end: 1 } }
    const n = normalizeStrudelHap(hap)
    expect(n.note).toBeNull()
    expect(n.freq).toBeNull()
    expect(n.s).toBeNull()
    expect(n.gain).toBe(1)
    expect(n.velocity).toBe(1)
    expect(n.color).toBeNull()
  })

  it('ignores non-numeric freq', () => {
    const hap = { value: { freq: 'not a number' } }
    const n = normalizeStrudelHap(hap)
    expect(n.freq).toBeNull()
  })
})
