import { describe, it, expect } from 'vitest'

import { sampleVoice, VOICE_FALLBACK_COLOR } from '../drumVoices'

describe('sampleVoice (#471)', () => {
  it('maps standard drum tokens to friendly names', () => {
    expect(sampleVoice('bd').label).toBe('Kick')
    expect(sampleVoice('sd').label).toBe('Snare')
    expect(sampleVoice('hh').label).toBe('Hi-Hat')
    expect(sampleVoice('oh').label).toBe('Open Hi-Hat')
    expect(sampleVoice('cp').label).toBe('Clap')
    expect(sampleVoice('sh').label).toBe('Shaker')
  })

  it('aliases collapse onto the same voice', () => {
    expect(sampleVoice('sn').label).toBe('Snare')
    expect(sampleVoice('snare').label).toBe('Snare')
    expect(sampleVoice('kick').label).toBe('Kick')
  })

  it('gives each known voice a non-fallback colour', () => {
    expect(sampleVoice('bd').color).not.toBe(VOICE_FALLBACK_COLOR)
    expect(sampleVoice('hh').color).not.toBe(VOICE_FALLBACK_COLOR)
    // distinct voices read distinct hues
    expect(sampleVoice('bd').color).not.toBe(sampleVoice('hh').color)
  })

  it('strips :variant for the label/colour lookup', () => {
    expect(sampleVoice('bd:3').label).toBe('Kick')
    expect(sampleVoice('bd:3').color).toBe(sampleVoice('bd').color)
  })

  it('is case-insensitive on the base token', () => {
    expect(sampleVoice('BD').label).toBe('Kick')
  })

  it('falls back to the raw sound + neutral colour for unmapped sounds', () => {
    const v = sampleVoice('weirdsample')
    expect(v.label).toBe('weirdsample')
    expect(v.color).toBe(VOICE_FALLBACK_COLOR)
  })

  it('fallback keeps the full token (incl. unknown variant) as the label', () => {
    const v = sampleVoice('mysynth:2')
    expect(v.label).toBe('mysynth:2')
    expect(v.color).toBe(VOICE_FALLBACK_COLOR)
  })
})
