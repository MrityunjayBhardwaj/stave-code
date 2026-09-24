// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DISPLAY_RENDER_RATE, displayRenderRate, playsAtDisplayRate } from './displayRate'

/**
 * #1759 — which tracks may draw from a lower-rate render. The rule is one-way:
 * anything it does not recognise renders at the live rate, so every "no" below
 * is a sound that fills a page-wide cache at the rendering context's rate.
 */
describe('playsAtDisplayRate', () => {
  it('plain oscillators qualify, and a note with no sound plays the default triangle', () => {
    for (const s of ['sine', 'triangle', 'square', 'sawtooth', 'supersaw', 'pulse']) {
      expect(playsAtDisplayRate({ s, note: 60, lpf: 800, gain: 0.3 }), s).toBe(true)
    }
    expect(playsAtDisplayRate({ note: 60 })).toBe(true)
  })

  it('a sample, a soundfont, a wavetable or an unknown sound does not', () => {
    for (const s of ['bd', 'gm_piano', 'wt_digital', 'sbd', 'white', 'nosuchsound', 'saw']) {
      expect(playsAtDisplayRate({ s }), s).toBe(false)
    }
  })

  it('an oscillator that pulls in a sample bank, a reverb file or noise does not', () => {
    expect(playsAtDisplayRate({ s: 'sawtooth', bank: 'RolandTR909' })).toBe(false)
    expect(playsAtDisplayRate({ s: 'sawtooth', ir: 'hall' })).toBe(false)
    expect(playsAtDisplayRate({ s: 'sawtooth', iresponse: 'hall' })).toBe(false)
    expect(playsAtDisplayRate({ s: 'sawtooth', noise: 0.2 })).toBe(false)
    expect(playsAtDisplayRate({ s: 'sine', fm: 2, fmwave: 'white' })).toBe(false)
    expect(playsAtDisplayRate({ s: 'sine', fm: 2, fmwave2: 'pink' })).toBe(false)
    expect(playsAtDisplayRate({ s: 'sawtooth', noise: 0 })).toBe(true)
  })

  it('a value that is not an object does not', () => {
    for (const v of [null, undefined, 3, 'c3']) expect(playsAtDisplayRate(v)).toBe(false)
  })
})

describe('displayRenderRate', () => {
  it('lowers the rate only when every note qualifies, and never above the live rate', () => {
    expect(displayRenderRate([{ s: 'sawtooth' }, { s: 'square' }], 48000)).toBe(DISPLAY_RENDER_RATE)
    expect(displayRenderRate([{ s: 'sawtooth' }, { s: 'bd' }], 48000)).toBe(48000)
    expect(displayRenderRate([{ s: 'sawtooth' }], 16000)).toBe(16000)
    expect(displayRenderRate([], 48000)).toBe(DISPLAY_RENDER_RATE)
  })
})
