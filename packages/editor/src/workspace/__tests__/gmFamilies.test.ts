import { describe, it, expect } from 'vitest'

import {
  gmFamily,
  soundfontGroupLabel,
  GM_FAMILY_ORDER,
  GM_FAMILY_KEY_COUNT,
} from '../gmFamilies'

describe('gmFamilies (#807 GM soundfont families)', () => {
  it('maps well-known gm_* keys to their canonical GM family', () => {
    expect(gmFamily('gm_piano')).toBe('Piano')
    expect(gmFamily('gm_alto_sax')).toBe('Reed')
    expect(gmFamily('gm_violin')).toBe('Strings')
    expect(gmFamily('gm_trumpet')).toBe('Brass')
    expect(gmFamily('gm_flute')).toBe('Pipe')
    expect(gmFamily('gm_church_organ')).toBe('Organ')
    expect(gmFamily('gm_lead_1_square')).toBe('Synth Lead')
  })

  it('returns null for a non-gm / unmapped key (caller keeps it in flat Soundfonts)', () => {
    expect(gmFamily('gm_notarealfont')).toBeNull()
    expect(gmFamily('sawtooth')).toBeNull()
    expect(gmFamily('')).toBeNull()
    // strudel merges the acoustic-grand variants into `gm_piano`; the raw GM name
    // is NOT a registered key, so it must not resolve.
    expect(gmFamily('gm_acoustic_grand_piano')).toBeNull()
  })

  it('soundfontGroupLabel prefixes the family, falls back to flat Soundfonts', () => {
    expect(soundfontGroupLabel('gm_violin')).toBe('Soundfonts · Strings')
    expect(soundfontGroupLabel('gm_trumpet')).toBe('Soundfonts · Brass')
    expect(soundfontGroupLabel('gm_notarealfont')).toBe('Soundfonts')
  })

  it('every mapped family is one of the 16 canonical GM families', () => {
    expect(GM_FAMILY_ORDER).toHaveLength(16)
    const set = new Set<string>(GM_FAMILY_ORDER)
    for (const name of ['gm_piano', 'gm_gunshot', 'gm_sitar', 'gm_agogo']) {
      expect(set.has(gmFamily(name)!)).toBe(true)
    }
  })

  it('maps all 125 gm_* keys from @strudel/soundfonts@1.3.0 (drift guard)', () => {
    // If a dependency bump changes the gm.mjs key set, this count diverges —
    // re-generate the map from the new gm.mjs.
    expect(GM_FAMILY_KEY_COUNT).toBe(125)
  })
})
