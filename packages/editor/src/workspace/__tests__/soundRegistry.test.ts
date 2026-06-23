import { describe, it, expect } from 'vitest'

import {
  groupSoundCatalog,
  banksFromDrumMachineManifest,
  groupDrumKits,
  type SoundMapDict,
  type DrumMachineManifest,
} from '../soundRegistry'

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

// A trimmed slice of the real tidal-drum-machines.json key shape (`Bank_voice`),
// plus uzu-drumkit's bare voices and mridangam's single-bank keys, to ground the
// derivation against the actual manifests (#427).
const manifest: DrumMachineManifest = {
  _base: 'tidal-drum-machines/machines/',
  RolandTR909_bd: ['x.wav'],
  RolandTR909_sd: ['x.wav'],
  RolandTR808_bd: ['x.wav'],
  YamahaRX5_bd: ['x.wav'],
  AkaiMPC60_misc: ['x.wav'],
  MoogConcertMateMG1_bd: ['x.wav'],
  mridangam_ta: ['x.wav'], // single-token-bank (Other group)
  bd: ['x.wav'], // bare voice (uzu) — no bank prefix → skipped
  hh: ['x.wav'],
}

describe('banksFromDrumMachineManifest (#515 live banks)', () => {
  it('derives distinct bank names from the `Bank_voice` key prefix', () => {
    expect(banksFromDrumMachineManifest(manifest)).toEqual([
      'AkaiMPC60',
      'MoogConcertMateMG1',
      'RolandTR808',
      'RolandTR909',
      'YamahaRX5',
      'mridangam',
    ])
  })

  it('skips `_`-internals (`_base`) and bare-voice keys (no `_` prefix)', () => {
    const banks = banksFromDrumMachineManifest(manifest)
    expect(banks).not.toContain('_base')
    expect(banks).not.toContain('bd')
    expect(banks).not.toContain('hh')
  })

  it('returns [] for an empty / absent manifest', () => {
    expect(banksFromDrumMachineManifest(null)).toEqual([])
    expect(banksFromDrumMachineManifest(undefined)).toEqual([])
    expect(banksFromDrumMachineManifest({})).toEqual([])
  })
})

describe('groupDrumKits (#515 kit picker)', () => {
  const banks = banksFromDrumMachineManifest(manifest)

  it('groups by major manufacturer with "Other" last', () => {
    const groups = groupDrumKits(banks)!
    expect(groups.map((g) => g.group)).toEqual(['Roland', 'Yamaha', 'Akai', 'Other'])
  })

  it('keeps the exact bank string as the option value (what .bank writes)', () => {
    const roland = groupDrumKits(banks)!.find((g) => g.group === 'Roland')!
    expect(roland.options.map((o) => o.value)).toEqual(['RolandTR808', 'RolandTR909'])
  })

  it('labels strip the maker prefix from a grouped bank (AkaiMPC60 → MPC60)', () => {
    const akai = groupDrumKits(banks)!.find((g) => g.group === 'Akai')!
    expect(akai.options[0].label).toBe('MPC60')
  })

  it('non-major makers fall to "Other" with the full name spaced out', () => {
    // Moog isn't in the major-maker list → "Other"; the label keeps the full
    // bank and spaces camelCase boundaries.
    const groups = groupDrumKits(['MoogConcertMateMG1'])!
    expect(groups.map((g) => g.group)).toEqual(['Other'])
    expect(groups[0].options[0].label).toBe('Moog Concert Mate MG1')
  })

  it('returns null for empty input (caller falls back to curated DRUM_KITS)', () => {
    expect(groupDrumKits([])).toBeNull()
    expect(groupDrumKits(null)).toBeNull()
    expect(groupDrumKits(undefined)).toBeNull()
  })
})
