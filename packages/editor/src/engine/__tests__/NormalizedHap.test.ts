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

  describe('IR Tier 1 — loc / trackId / params propagation', () => {
    it('extracts loc from hap.context.locations', () => {
      const hap = {
        whole: { begin: 0, end: 0.5 },
        value: { note: 'c4' },
        context: { locations: [{ start: 12, end: 18 }] },
      }
      const n = normalizeStrudelHap(hap)
      expect(n.loc).toEqual([{ start: 12, end: 18 }])
    })

    it('falls back to hap.context.loc when locations is missing', () => {
      const hap = {
        whole: { begin: 0, end: 0.5 },
        value: { note: 'c4' },
        context: { loc: [{ start: 5, end: 10 }] },
      }
      const n = normalizeStrudelHap(hap)
      expect(n.loc).toEqual([{ start: 5, end: 10 }])
    })

    it('omits loc when context is absent', () => {
      const hap = { whole: { begin: 0, end: 0.5 }, value: { note: 'c4' } }
      const n = normalizeStrudelHap(hap)
      expect(n.loc).toBeUndefined()
    })

    it('drops malformed loc entries (non-numeric start/end)', () => {
      const hap = {
        whole: { begin: 0, end: 0.5 },
        value: { note: 'c4' },
        context: {
          locations: [
            { start: 1, end: 2 },
            { start: 'oops', end: 4 },
            { start: 5 }, // missing end
            { start: 7, end: 9 },
          ],
        },
      }
      const n = normalizeStrudelHap(hap)
      expect(n.loc).toEqual([
        { start: 1, end: 2 },
        { start: 7, end: 9 },
      ])
    })

    it('passes through trackId from caller', () => {
      const hap = { whole: { begin: 0, end: 0.5 }, value: { note: 'c4' } }
      const n = normalizeStrudelHap(hap, 'lead')
      expect(n.trackId).toBe('lead')
    })

    it('omits trackId when caller does not supply one', () => {
      const hap = { whole: { begin: 0, end: 0.5 }, value: { note: 'c4' } }
      const n = normalizeStrudelHap(hap)
      expect(n.trackId).toBeUndefined()
    })

    it('captures unknown value fields as params', () => {
      const hap = {
        whole: { begin: 0, end: 0.5 },
        value: {
          note: 'c4',
          gain: 0.8,
          // engine-specific extras — should land in params
          cutoff: 1200,
          delay: 0.25,
          room: 0.5,
        },
      }
      const n = normalizeStrudelHap(hap)
      expect(n.params).toEqual({ cutoff: 1200, delay: 0.25, room: 0.5 })
    })

    it('omits params when value carries only known fields', () => {
      const hap = {
        whole: { begin: 0, end: 0.5 },
        value: { note: 'c4', gain: 0.8, s: 'piano' },
      }
      const n = normalizeStrudelHap(hap)
      expect(n.params).toBeUndefined()
    })

    it('skips undefined param values (avoid noise from defaulted fields)', () => {
      const hap = {
        whole: { begin: 0, end: 0.5 },
        value: { note: 'c4', cutoff: 1000, delay: undefined },
      }
      const n = normalizeStrudelHap(hap)
      expect(n.params).toEqual({ cutoff: 1000 })
    })

    it('all four new fields land together when present', () => {
      const hap = {
        whole: { begin: 1, end: 2 },
        value: { note: 'd4', cutoff: 800 },
        context: { locations: [{ start: 30, end: 36 }] },
      }
      const n = normalizeStrudelHap(hap, 'bass')
      expect(n.loc).toEqual([{ start: 30, end: 36 }])
      expect(n.trackId).toBe('bass')
      expect(n.params).toEqual({ cutoff: 800 })
    })
  })
})
