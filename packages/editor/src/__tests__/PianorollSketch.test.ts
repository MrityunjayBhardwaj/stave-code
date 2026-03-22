import { describe, it, expect } from 'vitest'
import {
  getNoteX,
  getNoteY,
  getColor,
  isDrumSound,
  getDrumSlot,
  WINDOW_SECONDS,
  MIDI_MIN,
  MIDI_MAX,
} from '../visualizers/sketches/PianorollSketch'

describe('getNoteX', () => {
  it('returns canvasWidth for audioTime == now (right edge)', () => {
    const now = 100
    expect(getNoteX(now, now, 600)).toBe(600)
  })

  it('returns 0 for audioTime == now - 6 (left edge)', () => {
    const now = 100
    expect(getNoteX(now - WINDOW_SECONDS, now, 600)).toBe(0)
  })

  it('returns middle for audioTime == now - 3 (midpoint)', () => {
    const now = 100
    expect(getNoteX(now - 3, now, 600)).toBe(300)
  })
})

describe('getNoteY', () => {
  it('returns ~pitchAreaHeight for MIDI_MIN (bottom)', () => {
    // MIDI 24 maps to bottom (pitchAreaHeight)
    expect(getNoteY(MIDI_MIN, 400)).toBeCloseTo(400, 5)
  })

  it('returns 0 for MIDI_MAX (top)', () => {
    // MIDI 96 maps to top (0)
    expect(getNoteY(MIDI_MAX, 400)).toBeCloseTo(0, 5)
  })

  it('returns middle for MIDI 60 (middle)', () => {
    // MIDI 60 is middle of 24..96 range
    expect(getNoteY(60, 400)).toBeCloseTo(200, 1)
  })
})

describe('getColor', () => {
  it('returns user color when color field is present', () => {
    expect(getColor({ color: 'cyan', s: null })).toBe('cyan')
  })

  it('returns drum color for bd (drum sound)', () => {
    expect(getColor({ color: null, s: 'bd' })).toBe('#f97316')
  })

  it('returns bass color for bass', () => {
    expect(getColor({ color: null, s: 'bass' })).toBe('#06b6d4')
  })

  it('returns pad color for pad', () => {
    expect(getColor({ color: null, s: 'pad' })).toBe('#10b981')
  })

  it('returns accent color for unrecognized synth sound (sine)', () => {
    // Per locked decision: unknown sounds fall back to --accent
    expect(getColor({ color: null, s: 'sine' })).toBe('#8b5cf6')
  })

  it('returns accent color for null s', () => {
    expect(getColor({ color: null, s: null })).toBe('#8b5cf6')
  })

  it('uses provided fallback tokens', () => {
    const tokens = { '--stem-drums': '#custom' }
    expect(getColor({ color: null, s: 'bd' }, tokens)).toBe('#custom')
  })
})

describe('isDrumSound', () => {
  it('returns true for bd', () => {
    expect(isDrumSound('bd')).toBe(true)
  })

  it('returns true for bd2 (prefix match)', () => {
    expect(isDrumSound('bd2')).toBe(true)
  })

  it('returns false for sine', () => {
    expect(isDrumSound('sine')).toBe(false)
  })

  it('returns true for hh', () => {
    expect(isDrumSound('hh')).toBe(true)
  })

  it('returns false for bass', () => {
    expect(isDrumSound('bass')).toBe(false)
  })
})

describe('getDrumSlot', () => {
  it('returns 0 for bd', () => {
    expect(getDrumSlot('bd')).toBe(0)
  })

  it('returns 1 for sd', () => {
    expect(getDrumSlot('sd')).toBe(1)
  })

  it('returns fallback slot (4) for unknown sound', () => {
    expect(getDrumSlot('unknown')).toBe(4)
  })
})
