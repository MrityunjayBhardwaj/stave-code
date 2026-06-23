import { describe, it, expect } from 'vitest'

import { groupSoundCatalog, type SoundMapDict } from '../soundRegistry'

const dict: SoundMapDict = {
  sawtooth: { data: { type: 'synth' } },
  sine: { data: { type: 'synth' } },
  gm_alto_sax: { data: { type: 'soundfont' } },
  gm_acoustic_grand_piano: { data: { type: 'soundfont' } },
  piano: { data: { type: 'sample' } },
  bd: { data: { type: 'sample', tag: 'drum-machines' } }, // kit voice → excluded
  sd: { data: { type: 'sample', tag: 'drum-machines' } },
  _mySetting: { data: { type: 'synth' } }, // superdough internal → excluded
}

describe('groupSoundCatalog (#514 live enumeration)', () => {
  it('groups by data.type into Synths / Soundfonts / Samples', () => {
    const groups = groupSoundCatalog(dict)
    expect(groups).not.toBeNull()
    const byName = Object.fromEntries(groups!.map((g) => [g.group, g.options.map((o) => o.value)]))
    expect(byName['Synths']).toEqual(['sawtooth', 'sine'])
    expect(byName['Soundfonts']).toEqual(['gm_acoustic_grand_piano', 'gm_alto_sax'])
    expect(byName['Samples']).toEqual(['piano'])
  })

  it('excludes drum-machine voices (they belong to the Sequencer kit model)', () => {
    const all = groupSoundCatalog(dict)!.flatMap((g) => g.options.map((o) => o.value))
    expect(all).not.toContain('bd')
    expect(all).not.toContain('sd')
  })

  it('excludes superdough internals (`_`-prefixed)', () => {
    const all = groupSoundCatalog(dict)!.flatMap((g) => g.options.map((o) => o.value))
    expect(all).not.toContain('_mySetting')
  })

  it('friendly-labels soundfonts (gm_alto_sax → Alto Sax) and title-cases synths', () => {
    const groups = groupSoundCatalog(dict)!
    const sf = groups.find((g) => g.group === 'Soundfonts')!
    expect(sf.options.find((o) => o.value === 'gm_alto_sax')!.label).toBe('Alto Sax')
    const syn = groups.find((g) => g.group === 'Synths')!
    expect(syn.options.find((o) => o.value === 'sawtooth')!.label).toBe('Sawtooth')
  })

  it('returns null for an empty / absent dict (caller falls back to curated)', () => {
    expect(groupSoundCatalog(null)).toBeNull()
    expect(groupSoundCatalog(undefined)).toBeNull()
    expect(groupSoundCatalog({})).toBeNull()
    expect(groupSoundCatalog({ bd: { data: { type: 'sample', tag: 'drum-machines' } } })).toBeNull()
  })

  it('drops empty groups (only synths present → one group)', () => {
    const groups = groupSoundCatalog({ tri: { data: { type: 'synth' } } })!
    expect(groups.map((g) => g.group)).toEqual(['Synths'])
  })
})
